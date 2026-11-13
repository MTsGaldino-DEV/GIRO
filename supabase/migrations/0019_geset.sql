-- =============================================================================
-- GIRO — 0019 · Marca de lançamento no GESET
--
-- Decisão de 13/11 (spec 2026-11-13-telas-e-fluxo, seção 8): depois do ASO
-- concluído, o QSMS lança no GESET. Isso não trava a conclusão; o GIRO só
-- guarda se foi lançado, por quem e quando. Vale para ASO e AVP.
--
-- O que entra:
--   1. eventos_requisito.geset_lancado_em / geset_lancado_por.
--   2. fn_marcar_geset(evento, lancado): operador marca ou desmarca; grava na
--      auditoria de cadastro (auditoria_colaborador).
--   3. vw_pendencias_geset: último evento apto por colaborador × requisito que
--      ainda não foi lançado. Inapto nunca entra.
--   4. fn_carga_inicial_geset(): "lançado no GESET" quer dizer pessoa
--      regularizada. O último evento apto com vencimento a MAIS de 90 dias
--      entra como já lançado (sem quem marcou; auditoria com origem 'carga
--      inicial'). O resto fica pendente.
--
-- A carga roda UMA vez: só quando esta migration cria a coluna. Reaplicar o
-- arquivo (db:push sem filtro) não relança nada, senão um ASO registrado depois
-- da carga, com vencimento a mais de 90 dias, seria dado como lançado sem ter
-- sido. Mesmo assim a função é idempotente: só toca em linha ainda pendente e
-- só audita o que mudou.
--
-- Aditiva e sem apagar dados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Carga inicial
--
-- Mesmo critério de vw_status_colaborador: colaborador e requisito ativos; o
-- "último evento" é o apto/apto com restrição de referência mais recente
-- (data de realização, com recuo para a data do documento); vencimento =
-- referência + periodicidade; prazo a partir de hoje() (fuso de Brasília).
--
-- Não passa por fn_registrar_auditoria porque ela exige operador logado e a
-- migration roda como postgres: a linha de auditoria é inserida direto, com
-- usuario_id nulo.
--
-- Só postgres executa. Não é concedida a anon nem a authenticated.
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_inicial_geset()
returns integer
language plpgsql
set search_path = public
as $fn$
declare
  v_marcados integer;
begin
  with ultimos as (
    select distinct on (e.colaborador_id, e.tipo_requisito_id)
      e.id,
      e.colaborador_id,
      t.nome as requisito,
      (coalesce(e.data_realizado, e.data_documento)
        + (t.periodicidade_meses || ' months')::interval)::date as data_vencimento
    from public.eventos_requisito e
    join public.colaboradores c on c.id = e.colaborador_id and c.ativo = true
    join public.tipos_requisito t on t.id = e.tipo_requisito_id and t.ativo = true
    where e.resultado in ('apto', 'apto_com_restricao')
    order by e.colaborador_id, e.tipo_requisito_id,
             coalesce(e.data_realizado, e.data_documento) desc, e.criado_em desc, e.id
  ),
  marcados as (
    update public.eventos_requisito e
       set geset_lancado_em = now(),
           geset_lancado_por = null
      from ultimos u
     where e.id = u.id
       and e.geset_lancado_em is null
       and u.data_vencimento > public.hoje() + 90
    returning e.id, e.colaborador_id, u.requisito
  ),
  auditados as (
    insert into public.auditoria_colaborador (
      colaborador_id, usuario_id, acao, entidade, entidade_id,
      campo, valor_anterior, valor_novo, origem
    )
    select m.colaborador_id, null, 'alterou', 'colaborador', m.id,
           'GESET ' || m.requisito, 'pendente', 'lançado', 'carga inicial'
      from marcados m
    returning 1
  )
  select count(*) into v_marcados from auditados;

  return v_marcados;
end;
$fn$;

revoke all on function public.fn_carga_inicial_geset() from public;
revoke all on function public.fn_carga_inicial_geset() from anon;
revoke all on function public.fn_carga_inicial_geset() from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Colunas e carga (a carga só roda quando a coluna é criada agora)
-- -----------------------------------------------------------------------------
do $do$
declare
  v_primeira_vez boolean := not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'eventos_requisito'
       and column_name = 'geset_lancado_em'
  );
begin
  alter table public.eventos_requisito
    add column if not exists geset_lancado_em  timestamptz,
    add column if not exists geset_lancado_por uuid references auth.users(id) on delete set null;

  if v_primeira_vez then
    perform public.fn_carga_inicial_geset();
  end if;
end
$do$;

comment on column public.eventos_requisito.geset_lancado_em is
  'Quando o resultado foi lançado no GESET. Nulo = falta lançar. Carga inicial (0019) marca quem tem vencimento > 90 dias.';
comment on column public.eventos_requisito.geset_lancado_por is
  'Quem marcou como lançado. Nulo na carga inicial (origem registrada na auditoria).';

-- -----------------------------------------------------------------------------
-- 3. Marcar / desmarcar
--
-- A auditoria usa as constraints de 0014: acao 'alterou', entidade
-- 'colaborador', entidade_id = o evento, campo 'GESET <requisito>'.
-- Marcar o que já está marcado (ou desmarcar o que já está limpo) não muda nada
-- e não audita: preserva quem marcou primeiro.
-- -----------------------------------------------------------------------------
create or replace function public.fn_marcar_geset(
  p_evento_id uuid,
  p_lancado   boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_evento    public.eventos_requisito;
  v_requisito text;
begin
  if not public.fn_e_operador() then
    raise exception 'Apenas QSMS e supervisão marca o lançamento no GESET.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_evento from public.eventos_requisito where id = p_evento_id for update;
  if not found then
    raise exception 'Evento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_evento.resultado = 'inapto' then
    raise exception 'Resultado inapto não é lançado no GESET.' using errcode = 'check_violation';
  end if;

  if (v_evento.geset_lancado_em is not null) = coalesce(p_lancado, true) then
    return;
  end if;

  select nome into v_requisito from public.tipos_requisito where id = v_evento.tipo_requisito_id;

  if coalesce(p_lancado, true) then
    update public.eventos_requisito
       set geset_lancado_em = now(), geset_lancado_por = auth.uid()
     where id = p_evento_id;
  else
    update public.eventos_requisito
       set geset_lancado_em = null, geset_lancado_por = null
     where id = p_evento_id;
  end if;

  perform public.fn_registrar_auditoria(
    v_evento.colaborador_id, 'alterou', 'colaborador', p_evento_id,
    'GESET ' || v_requisito,
    case when coalesce(p_lancado, true) then 'pendente' else 'lançado' end,
    case when coalesce(p_lancado, true) then 'lançado' else 'pendente' end,
    'GESET'
  );
end;
$fn$;

revoke all on function public.fn_marcar_geset(uuid, boolean) from public;
revoke all on function public.fn_marcar_geset(uuid, boolean) from anon;
grant execute on function public.fn_marcar_geset(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Pendências no GESET
--
-- Só o último evento apto por colaborador × requisito (mesma regra de
-- vw_status_colaborador), de colaborador e requisito ativos e requisito
-- aplicável à pessoa (AVP só para quem exige). Sem registro de resultado
-- inapto. Leitura sob a RLS de quem consulta.
-- -----------------------------------------------------------------------------
create or replace view public.vw_pendencias_geset
with (security_invoker = true) as
with ultimo as (
  select distinct on (e.colaborador_id, e.tipo_requisito_id)
    e.id,
    e.colaborador_id,
    e.tipo_requisito_id,
    e.data_documento,
    e.geset_lancado_em,
    coalesce(e.data_realizado, e.data_documento) as data_referencia
  from public.eventos_requisito e
  where e.resultado in ('apto', 'apto_com_restricao')
  order by e.colaborador_id, e.tipo_requisito_id,
           coalesce(e.data_realizado, e.data_documento) desc, e.criado_em desc, e.id
)
select
  u.id                  as evento_id,
  c.id                  as colaborador_id,
  c.matricula,
  c.nome,
  c.cargo,
  t.nome                as requisito,
  u.data_documento,
  (u.data_referencia + (t.periodicidade_meses || ' months')::interval)::date as data_vencimento,
  ((u.data_referencia + (t.periodicidade_meses || ' months')::interval)::date - public.hoje()) as dias_restantes,
  c.foto_url,
  s.nome                as supervisor_nome
from ultimo u
join public.colaboradores c on c.id = u.colaborador_id
join public.tipos_requisito t on t.id = u.tipo_requisito_id
left join public.supervisores s on s.id = c.supervisor_id
where u.geset_lancado_em is null
  and c.ativo = true
  and t.ativo = true
  and (t.opcional = false or c.exige_avp = true);

comment on view public.vw_pendencias_geset is
  'ASO/AVP aptos ainda não lançados no GESET: só o último evento por colaborador × requisito. Respeita RLS (0019).';

grant select on public.vw_pendencias_geset to authenticated;
