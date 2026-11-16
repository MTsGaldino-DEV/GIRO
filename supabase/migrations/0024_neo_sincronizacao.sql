-- =============================================================================
-- 0024 — Integração com a CENTRAL-NEO: fn_sincronizar_neo (fase 1)
--
-- Spec: docs/superpowers/specs/2026-11-16-integracao-central-neo-design.md (5.1 a 5.4)
-- Plano: docs/superpowers/plans/2026-11-16-integracao-central-neo-fase-1.md (Task 3)
-- Depende da 0023 (neo_id, matricula_cemig, data_desligamento, neo_sincronizado_em,
-- supervisor_apelidos, neo_sincronizacoes, fn_normalizar_texto).
--
-- A regra fica no banco (como na especificação 1): o servidor do GIRO só
-- busca as linhas na NEO e entrega a esta função, que casa, atualiza e audita
-- tudo numa transação.
--
--   fn_sincronizar_neo(p_linhas jsonb, p_aplicar boolean, p_origem text) returns jsonb
--
--   p_linhas  array de LinhaNeo (id, nome, cpf, matricula_cemig, matricula_engelmig,
--             cargo, supervisor, base, data_admissao, data_desligamento, ativo, ...)
--   p_aplicar false = só relatório (nada é gravado); true = grava
--   p_origem  'cron' | 'manual' | 'carga'
--
-- Regras
--   1. Só entra linha com matricula_engelmig de 1 a 9 dígitos numéricos. As demais
--      (vazias, "e272662"...) só são contadas em `nao_numericas`: nunca ligam
--      ninguém e nunca dão erro.
--   2. Casamento: primeiro por neo_id; senão pela matrícula (matricula = engelmig).
--      Sem casamento: conta em `na_neo_fora_do_giro`; esta função nunca cria pessoa.
--   3. Casada só pela matrícula e ainda sem neo_id vira DIVERGÊNCIA (nada é
--      ligado nem corrigido) quando a pessoa já está ligada a outro cadastro da
--      NEO (`ja_ligada_a_outro`) ou quando os dois CPFs existem e diferem
--      (`cpf_diferente`). Senão, liga.
--   4. Campos da NEO para o GIRO, só para pessoas ligadas: nome, cpf, cargo,
--      data_admissao e matricula_cemig, e somente com valor não vazio (a NEO
--      nunca APAGA um valor do GIRO). `ativo` e `data_desligamento` valem como a
--      NEO manda, inclusive data nula (pessoa reativada). A matrícula do GIRO
--      nunca muda aqui. uen, foto, exige_avp, situação, polo, local e nascimento
--      não são tocados; `base` só entra no relatório.
--   5. Supervisor: o texto da NEO, normalizado, casa com um apelido
--      (supervisor_apelidos) ou com o nome de um supervisor; casando, define
--      supervisor_id. Texto vazio ou sem casamento NÃO mexe no vínculo atual; o
--      sem casamento aparece em `supervisores_sem_vinculo`.
--   6. Cada campo que muda gera uma linha em auditoria_colaborador (origem
--      'Sincronização NEO'); ligar gera uma linha com campo 'neo_id'.
--      `neo_sincronizado_em` só é atualizado em quem foi ligado ou alterado: quem
--      já está igual não é tocado, para a segunda rodada não mexer em nenhuma
--      linha (a data da última rodada fica em neo_sincronizacoes).
--   7. p_aplicar = false executa exatamente o mesmo caminho dentro de um bloco que
--      termina em desfazer: o relatório é idêntico ao da aplicação e nada fica
--      gravado (nem auditoria, nem neo_sincronizacoes).
--
-- O relatório só tem contagens, matrículas, textos de supervisor e nomes de base:
-- nunca CPF nem nome de colaborador. Com p_aplicar = true ele também é gravado em
-- neo_sincronizacoes.resumo.
--
-- Permissão: authenticated só se for operador (fn_e_operador); service_role (cron
-- e script da primeira carga) não tem uid. anon e public ficam sem EXECUTE.
-- =============================================================================

create or replace function public.fn_sincronizar_neo(
  p_linhas  jsonb,
  p_aplicar boolean,
  p_origem  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_origem_auditoria constant text := 'Sincronização NEO';

  v_r        record;
  v_c        public.colaboradores%rowtype;
  v_achou    boolean;
  v_ligar    boolean;

  v_total          int := 0;
  v_nao_numericas  int := 0;
  v_fora_do_giro   int := 0;
  v_ligados_novos  int := 0;
  v_atualizados    int := 0;
  v_sem_mudanca    int := 0;
  v_desligados     int := 0;
  v_mat_dif        int := 0;
  v_sup_vinc       int := 0;
  v_divergencias   jsonb := '[]'::jsonb;
  v_campos         jsonb := '{}'::jsonb;
  v_vistos         uuid[] := '{}';
  v_sv_norm        text[] := '{}';
  v_sv_orig        text[] := '{}';
  v_bases          text[] := '{}';

  v_eng      text;
  v_mat      int;
  v_cpf_neo  text;
  v_cpf_giro text;
  v_sup_norm text;
  v_sup_id   uuid;
  v_sup_nome_ant text;
  v_sup_nome_nov text;

  -- valores novos de cada coluna (começam iguais aos atuais)
  n_nome        text;
  n_cpf         text;
  n_cargo       text;
  n_admissao    date;
  n_cemig       text;
  n_ativo       boolean;
  n_deslig      date;
  n_sup         uuid;
  v_mud         jsonb;
  v_item        jsonb;

  v_bases_json   jsonb;
  v_sv_json      jsonb;
  v_relatorio    jsonb;
begin
  -- Guarda: sessão de usuário exige operador; sem usuário (service role) o
  -- controle é o grant de EXECUTE (só authenticated e service_role).
  if auth.uid() is not null and not public.fn_e_operador() then
    raise exception 'Apenas operadores podem sincronizar com a NEO.'
      using errcode = '42501';
  end if;

  if p_origem is null or p_origem not in ('cron', 'manual', 'carga') then
    raise exception 'Origem inválida para a sincronização.' using errcode = '22023';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'As linhas da NEO devem vir em uma lista.' using errcode = '22023';
  end if;
  if p_aplicar is null then
    raise exception 'Informe se a sincronização deve ser aplicada.' using errcode = '22023';
  end if;

  v_total := jsonb_array_length(p_linhas);

  -- Tudo abaixo roda em um sub-bloco: com p_aplicar = false ele termina em um erro
  -- próprio (GN001) que desfaz as gravações e é capturado. As variáveis locais
  -- (o relatório) sobrevivem ao desfazer; o banco não.
  begin
    for v_r in
      select *
        from jsonb_to_recordset(p_linhas) as x(
          id uuid, nome text, cpf text, matricula_cemig text, matricula_engelmig text,
          cargo text, supervisor text, base text, data_admissao date,
          data_desligamento date, ativo boolean
        )
    loop
      if v_r.id is null then
        raise exception 'Linha da NEO sem identificador.' using errcode = '22023';
      end if;

      -- 1. só matrícula numérica de 1 a 9 dígitos
      v_eng := nullif(btrim(v_r.matricula_engelmig), '');
      if v_eng is null or v_eng !~ '^[0-9]{1,9}$' then
        v_nao_numericas := v_nao_numericas + 1;
        continue;
      end if;
      v_mat := v_eng::int;

      if nullif(btrim(v_r.base), '') is not null then
        v_bases := v_bases || btrim(v_r.base);
      end if;

      -- 2. casamento: neo_id primeiro, matrícula depois (linha travada contra edição manual)
      v_ligar := false;
      select * into v_c from public.colaboradores where neo_id = v_r.id for update;
      v_achou := found;

      if v_achou then
        if v_c.matricula <> v_mat then
          v_mat_dif := v_mat_dif + 1;
        end if;
      else
        select * into v_c from public.colaboradores where matricula = v_mat for update;
        v_achou := found;
        if not v_achou then
          v_fora_do_giro := v_fora_do_giro + 1;
          continue;
        end if;

        v_vistos := v_vistos || v_c.id;

        -- 3. casada só pela matrícula: divergência ou ligação
        if v_c.neo_id is not null then
          v_divergencias := v_divergencias
            || jsonb_build_object('matricula', v_c.matricula, 'motivo', 'ja_ligada_a_outro');
          continue;
        end if;
        v_cpf_neo  := regexp_replace(coalesce(v_r.cpf, ''), '\D', '', 'g');
        v_cpf_giro := regexp_replace(coalesce(v_c.cpf, ''), '\D', '', 'g');
        if v_cpf_neo <> '' and v_cpf_giro <> '' and v_cpf_neo <> v_cpf_giro then
          v_divergencias := v_divergencias
            || jsonb_build_object('matricula', v_c.matricula, 'motivo', 'cpf_diferente');
          continue;
        end if;
        v_ligar := true;
      end if;

      if v_achou and not v_ligar then
        v_vistos := v_vistos || v_c.id;
      end if;

      -- 4. campos da NEO para o GIRO (valor vazio não apaga; ativo e desligamento valem como vêm)
      n_nome     := coalesce(nullif(btrim(v_r.nome), ''), v_c.nome);
      n_cpf      := coalesce(nullif(regexp_replace(coalesce(v_r.cpf, ''), '\D', '', 'g'), ''), v_c.cpf);
      n_cargo    := coalesce(nullif(btrim(v_r.cargo), ''), v_c.cargo);
      n_admissao := coalesce(v_r.data_admissao, v_c.data_admissao);
      n_cemig    := coalesce(nullif(btrim(v_r.matricula_cemig), ''), v_c.matricula_cemig);
      n_ativo    := coalesce(v_r.ativo, v_c.ativo);
      n_deslig   := v_r.data_desligamento;
      n_sup      := v_c.supervisor_id;

      -- 5. supervisor pelo texto normalizado: apelido primeiro, nome do supervisor depois
      v_sup_norm := public.fn_normalizar_texto(v_r.supervisor);
      if v_sup_norm is not null then
        select a.supervisor_id into v_sup_id
          from public.supervisor_apelidos a
         where a.texto_normalizado = v_sup_norm;
        if v_sup_id is null then
          select s.id into v_sup_id
            from public.supervisores s
           where public.fn_normalizar_texto(s.nome) = v_sup_norm
           order by s.ativo desc, s.criado_em, s.id
           limit 1;
        end if;
        if v_sup_id is not null then
          n_sup := v_sup_id;
          v_sup_vinc := v_sup_vinc + 1;
        else
          v_sv_norm := v_sv_norm || v_sup_norm;
          v_sv_orig := v_sv_orig || btrim(v_r.supervisor);
        end if;
        v_sup_id := null;
      end if;

      -- mudanças (um item por campo) para o contador, a auditoria e o UPDATE
      v_mud := '[]'::jsonb;
      if n_nome is distinct from v_c.nome then
        v_mud := v_mud || jsonb_build_object('col', 'nome', 'campo', 'nome', 'de', v_c.nome, 'para', n_nome);
      end if;
      if n_cpf is distinct from v_c.cpf then
        v_mud := v_mud || jsonb_build_object('col', 'cpf', 'campo', 'CPF', 'de', v_c.cpf, 'para', n_cpf);
      end if;
      if n_cargo is distinct from v_c.cargo then
        v_mud := v_mud || jsonb_build_object('col', 'cargo', 'campo', 'cargo', 'de', v_c.cargo, 'para', n_cargo);
      end if;
      if n_admissao is distinct from v_c.data_admissao then
        v_mud := v_mud || jsonb_build_object('col', 'data_admissao', 'campo', 'admissão',
                   'de', v_c.data_admissao::text, 'para', n_admissao::text);
      end if;
      if n_cemig is distinct from v_c.matricula_cemig then
        v_mud := v_mud || jsonb_build_object('col', 'matricula_cemig', 'campo', 'matrícula CEMIG',
                   'de', v_c.matricula_cemig, 'para', n_cemig);
      end if;
      if n_ativo is distinct from v_c.ativo then
        v_mud := v_mud || jsonb_build_object('col', 'ativo', 'campo', 'ativo',
                   'de', case when v_c.ativo then 'sim' else 'não' end,
                   'para', case when n_ativo then 'sim' else 'não' end);
        if v_c.ativo and not n_ativo then
          v_desligados := v_desligados + 1;
        end if;
      end if;
      if n_deslig is distinct from v_c.data_desligamento then
        v_mud := v_mud || jsonb_build_object('col', 'data_desligamento', 'campo', 'desligamento',
                   'de', v_c.data_desligamento::text, 'para', n_deslig::text);
      end if;
      if n_sup is distinct from v_c.supervisor_id then
        select nome into v_sup_nome_ant from public.supervisores where id = v_c.supervisor_id;
        select nome into v_sup_nome_nov from public.supervisores where id = n_sup;
        v_mud := v_mud || jsonb_build_object('col', 'supervisor_id', 'campo', 'supervisor',
                   'de', v_sup_nome_ant, 'para', v_sup_nome_nov);
      end if;

      if jsonb_array_length(v_mud) = 0 and not v_ligar then
        v_sem_mudanca := v_sem_mudanca + 1;
        continue;
      end if;

      if v_ligar then
        v_ligados_novos := v_ligados_novos + 1;
      end if;
      if jsonb_array_length(v_mud) > 0 then
        v_atualizados := v_atualizados + 1;
        for v_item in select * from jsonb_array_elements(v_mud) loop
          v_campos := jsonb_set(
            v_campos, array[v_item->>'col'],
            to_jsonb(coalesce((v_campos->>(v_item->>'col'))::int, 0) + 1)
          );
        end loop;
      end if;

      update public.colaboradores
         set neo_id              = case when v_ligar then v_r.id else neo_id end,
             nome                = n_nome,
             cpf                 = n_cpf,
             cargo               = n_cargo,
             data_admissao       = n_admissao,
             matricula_cemig     = n_cemig,
             ativo               = n_ativo,
             data_desligamento   = n_deslig,
             supervisor_id       = n_sup,
             neo_sincronizado_em = now()
       where id = v_c.id;

      -- 6. auditoria: uma linha por campo que mudou e uma ao ligar
      if v_ligar then
        insert into public.auditoria_colaborador
          (colaborador_id, usuario_id, acao, entidade, entidade_id, campo, valor_anterior, valor_novo, origem)
        values
          (v_c.id, auth.uid(), 'alterou', 'colaborador', v_c.id, 'neo_id', null, v_r.id::text, c_origem_auditoria);
      end if;
      insert into public.auditoria_colaborador
        (colaborador_id, usuario_id, acao, entidade, entidade_id, campo, valor_anterior, valor_novo, origem)
      select v_c.id, auth.uid(), 'alterou', 'colaborador', v_c.id,
             m->>'campo', m->>'de', m->>'para', c_origem_auditoria
        from jsonb_array_elements(v_mud) as m;
    end loop;

    -- relatório
    select coalesce(jsonb_agg(jsonb_build_object('base', b, 'quantidade', q) order by q desc, b), '[]'::jsonb)
      into v_bases_json
      from (select b, count(*) as q from unnest(v_bases) as b group by b) t;

    select coalesce(jsonb_agg(jsonb_build_object('texto', texto, 'quantidade', q) order by q desc, texto), '[]'::jsonb)
      into v_sv_json
      from (
        select n, sum(c)::int as q, (array_agg(o order by c desc, o))[1] as texto
          from (
            select u.n, u.o, count(*) as c
              from unnest(v_sv_norm, v_sv_orig) as u(n, o)
             group by u.n, u.o
          ) g
         group by n
      ) t;

    v_relatorio := jsonb_build_object(
      'total_neo',               v_total,
      'ligados_novos',           v_ligados_novos,
      'atualizados',             v_atualizados,
      'sem_mudanca',             v_sem_mudanca,
      'nao_numericas',           v_nao_numericas,
      'na_neo_fora_do_giro',     v_fora_do_giro,
      'no_giro_sem_neo',         (select count(*) from public.colaboradores
                                   where ativo and id <> all(v_vistos)),
      'divergencias',            v_divergencias,
      'matricula_diferente',     v_mat_dif,
      'campos_alterados',        v_campos,
      'desligados_novos',        v_desligados,
      'supervisores_vinculados', v_sup_vinc,
      'supervisores_sem_vinculo', v_sv_json,
      'bases',                   v_bases_json
    );

    if not p_aplicar then
      raise exception 'ensaio' using errcode = 'GN001';
    end if;
  exception
    when sqlstate 'GN001' then
      null; -- relatório pronto; as gravações do bloco foram desfeitas
  end;

  if p_aplicar then
    insert into public.neo_sincronizacoes (origem, usuario_id, resumo)
    values (p_origem, auth.uid(), v_relatorio);
  end if;

  return v_relatorio;
end;
$$;

-- `from public, anon`: no Supabase o `anon` recebe EXECUTE direto por privilégio
-- padrão do schema; `revoke ... from public` sozinho não o remove (ver 0023).
revoke all on function public.fn_sincronizar_neo(jsonb, boolean, text) from public, anon;
grant execute on function public.fn_sincronizar_neo(jsonb, boolean, text) to authenticated, service_role;
