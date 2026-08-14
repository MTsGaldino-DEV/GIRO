-- =============================================================================
-- GIRO — 0002 · Máquina de estados
--
-- As três regras invioláveis do plano estão implementadas aqui, no banco, e não
-- na camada de aplicação:
--
--   1. toda transição grava linha em historico_item  -> trigger
--   2. ao entrar numa etapa, o SLA é recalculado     -> trigger
--   3. só transições legais são aceitas              -> trigger
--
-- Em trigger e não em server action porque a garantia precisa valer também para
-- um UPDATE feito à mão pelo painel do Supabase. Regra que depende de disciplina
-- de quem escreve o código não é regra, é convenção.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SLA por etapa (plano, seção 5)
-- -----------------------------------------------------------------------------
create or replace function public.fn_sla_da_etapa(
  p_etapa          text,
  p_data_agendada  date
)
returns timestamptz
language sql
immutable
as $$
  select case p_etapa
    when 'previsto'              then now() + interval '7 days'
    when 'data_proposta'         then now() + interval '3 days'
    -- O prazo do supervisor é o próprio compromisso: vale até o fim do dia
    -- marcado com a clínica.
    when 'agendado'              then case
                                        when p_data_agendada is null then now() + interval '3 days'
                                        else (p_data_agendada + 1)::timestamp at time zone 'America/Sao_Paulo'
                                      end
    when 'aguardando_documento'  then now() + interval '5 days'
    when 'concluido'             then null
  end;
$$;

-- -----------------------------------------------------------------------------
-- Transições permitidas
-- -----------------------------------------------------------------------------
create or replace function public.fn_transicao_valida(p_de text, p_para text)
returns boolean
language sql
immutable
as $$
  select (p_de, p_para) in (
    ('previsto',             'data_proposta'),
    ('data_proposta',        'agendado'),
    ('agendado',             'aguardando_documento'),
    ('agendado',             'previsto'),              -- faltou ao exame
    ('data_proposta',        'previsto'),              -- QSMS devolve a data ao supervisor
    ('aguardando_documento', 'concluido')
  );
$$;

-- -----------------------------------------------------------------------------
-- BEFORE: valida a transição e recalcula o SLA
-- -----------------------------------------------------------------------------
create or replace function public.fn_item_antes_de_mudar()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.sla_vence_em := public.fn_sla_da_etapa(new.etapa, new.data_agendada);
    new.etapa_desde  := now();
    return new;
  end if;

  if new.etapa is distinct from old.etapa then
    if not public.fn_transicao_valida(old.etapa, new.etapa) then
      raise exception 'Transição inválida: % -> %', old.etapa, new.etapa
        using errcode = 'check_violation';
    end if;

    new.sla_vence_em := public.fn_sla_da_etapa(new.etapa, new.data_agendada);
    new.etapa_desde  := now();

  elsif new.data_agendada is distinct from old.data_agendada and new.etapa = 'agendado' then
    -- Remarcou com a clínica: o prazo acompanha a data nova.
    new.sla_vence_em := public.fn_sla_da_etapa(new.etapa, new.data_agendada);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_item_antes_de_mudar on public.itens_pendencia;
create trigger trg_item_antes_de_mudar
  before insert or update on public.itens_pendencia
  for each row execute function public.fn_item_antes_de_mudar();

-- -----------------------------------------------------------------------------
-- AFTER: grava o histórico
--
-- A observação chega por variável de transação (`giro.observacao`), setada
-- pelas RPCs abaixo. Assim a linha de histórico sai sempre — com ou sem
-- observação, via RPC ou via UPDATE direto.
-- -----------------------------------------------------------------------------
create or replace function public.fn_item_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obs text := nullif(current_setting('giro.observacao', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.historico_item (item_id, etapa_de, etapa_para, autor, observacao)
    values (new.id, null, new.etapa, auth.uid(), v_obs);
    return new;
  end if;

  if new.etapa is distinct from old.etapa then
    insert into public.historico_item (item_id, etapa_de, etapa_para, autor, observacao)
    values (new.id, old.etapa, new.etapa, auth.uid(), v_obs);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_item_historico on public.itens_pendencia;
create trigger trg_item_historico
  after insert or update on public.itens_pendencia
  for each row execute function public.fn_item_registrar_historico();

-- =============================================================================
-- RPCs de transição
--
-- SECURITY DEFINER com verificação explícita de autorização dentro de cada
-- função. Não é atalho para furar RLS: é o contrário — centraliza a checagem
-- de quem pode fazer o quê num lugar só, auditável, em vez de espalhar por
-- políticas de UPDATE coluna a coluna.
-- =============================================================================

create or replace function public.fn_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.perfis where id = auth.uid() and ativo;
$$;

create or replace function public.fn_supervisor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select supervisor_id from public.perfis where id = auth.uid() and ativo;
$$;

create or replace function public.fn_e_qsms()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fn_papel() = 'qsms', false);
$$;

-- Levanta exceção se o usuário atual não puder mexer neste item.
create or replace function public.fn_exigir_acesso_ao_item(p_item_id uuid)
returns public.itens_pendencia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item  public.itens_pendencia;
  v_sup   uuid;
begin
  select * into v_item from public.itens_pendencia where id = p_item_id;
  if not found then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;

  if public.fn_e_qsms() then
    return v_item;
  end if;

  v_sup := public.fn_supervisor_id();
  if v_sup is null then
    raise exception 'Usuário sem perfil ativo.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.colaboradores
   where id = v_item.colaborador_id and supervisor_id = v_sup;
  if not found then
    raise exception 'Este colaborador não é da sua equipe.' using errcode = 'insufficient_privilege';
  end if;

  return v_item;
end;
$$;

-- -----------------------------------------------------------------------------
-- previsto -> data_proposta   (supervisor informa quando libera o colaborador)
-- -----------------------------------------------------------------------------
create or replace function public.fn_propor_data(
  p_item_id     uuid,
  p_data        date,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens_pendencia;
begin
  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'previsto' then
    raise exception 'O item não está na etapa "previsto".' using errcode = 'check_violation';
  end if;

  if p_data < public.hoje() then
    raise exception 'A data de liberação não pode estar no passado.' using errcode = 'check_violation';
  end if;

  -- Liberar o colaborador num dia em que ele está de férias não libera nada.
  perform 1 from public.ausencias a
   where a.colaborador_id = v_item.colaborador_id
     and p_data >= a.data_inicio
     and (a.data_fim is null or p_data <= a.data_fim);
  if found then
    raise exception 'O colaborador está ausente nessa data. Escolha outra ou avise o QSMS.'
      using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', p_observacao, true);

  update public.itens_pendencia
     set etapa = 'data_proposta',
         data_liberacao_proposta = p_data
   where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- data_proposta -> agendado   (QSMS fecha com a clínica)
-- -----------------------------------------------------------------------------
create or replace function public.fn_agendar(
  p_item_id     uuid,
  p_clinica     text,
  p_endereco    text,
  p_medico      text,
  p_data        date,
  p_hora        time,
  p_psicossocial boolean default false,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS agenda com a clínica.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'data_proposta' then
    raise exception 'O item não está na etapa "data proposta".' using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_clinica), '') = '' then
    raise exception 'Informe a clínica.' using errcode = 'check_violation';
  end if;

  if p_data < public.hoje() then
    raise exception 'A data do agendamento não pode estar no passado.' using errcode = 'check_violation';
  end if;

  -- Plano, seção 7: não permitir agendamento dentro de ausência conhecida.
  perform 1 from public.ausencias a
   where a.colaborador_id = v_item.colaborador_id
     and p_data >= a.data_inicio
     and (a.data_fim is null or p_data <= a.data_fim);
  if found then
    raise exception 'Há ausência registrada para o colaborador nessa data. O exame não pode ser marcado aí.'
      using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', p_observacao, true);

  update public.itens_pendencia
     set etapa = 'agendado',
         clinica = p_clinica,
         endereco = p_endereco,
         medico = p_medico,
         data_agendada = p_data,
         hora_agendada = p_hora,
         avaliacao_psicossocial = coalesce(p_psicossocial, false),
         compareceu = null
   where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- agendado -> aguardando_documento | previsto   (supervisor confirma presença)
--
-- Comparecimento não é conformidade. Marcar "compareceu" empurra o item para o
-- QSMS cobrar o documento; não zera nada.
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_comparecimento(
  p_item_id     uuid,
  p_compareceu  boolean,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens_pendencia;
begin
  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'agendado' then
    raise exception 'O item não está na etapa "agendado".' using errcode = 'check_violation';
  end if;

  perform set_config(
    'giro.observacao',
    coalesce(p_observacao, case when p_compareceu then null else 'Faltou ao exame.' end),
    true
  );

  if p_compareceu then
    update public.itens_pendencia
       set etapa = 'aguardando_documento', compareceu = true
     where id = p_item_id;
  else
    -- Volta para o supervisor. Limpa o agendamento: a data velha só confunde.
    update public.itens_pendencia
       set etapa = 'previsto',
           compareceu = false,
           data_liberacao_proposta = null,
           data_agendada = null,
           hora_agendada = null
     where id = p_item_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- aguardando_documento -> concluido
--
-- Cria o evento (o fato consumado), fecha o item e abre o próximo ciclo.
-- Resultado 'inapto' também conclui o item — mas não gera evento válido, então
-- o colaborador continua bloqueado na view. É o comportamento desejado.
-- -----------------------------------------------------------------------------
create or replace function public.fn_concluir_item(
  p_item_id         uuid,
  p_data_documento  date,
  p_resultado       text,
  p_data_realizado  date default null,
  p_medico          text default null,
  p_documento_url   text default null,
  p_observacoes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item          public.itens_pendencia;
  v_evento_id     uuid;
  v_periodicidade integer;
  v_proximo_venc  date;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS registra o resultado do ASO.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'aguardando_documento' then
    raise exception 'O item não está aguardando documento.' using errcode = 'check_violation';
  end if;

  if p_resultado not in ('apto','inapto','apto_com_restricao') then
    raise exception 'Resultado inválido: %', p_resultado using errcode = 'check_violation';
  end if;

  if p_data_documento > public.hoje() then
    raise exception 'A data do documento não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  insert into public.eventos_requisito (
    colaborador_id, tipo_requisito_id, data_realizado, data_documento,
    resultado, clinica, medico, documento_url, observacoes, registrado_por
  ) values (
    v_item.colaborador_id, v_item.tipo_requisito_id,
    coalesce(p_data_realizado, v_item.data_agendada), p_data_documento,
    p_resultado, v_item.clinica, coalesce(p_medico, v_item.medico),
    p_documento_url, p_observacoes, auth.uid()
  )
  returning id into v_evento_id;

  perform set_config('giro.observacao',
    coalesce(p_observacoes, 'Resultado registrado: ' || p_resultado), true);

  update public.itens_pendencia
     set etapa = 'concluido', evento_id = v_evento_id
   where id = p_item_id;

  -- Próximo ciclo: 12 meses a partir da data do documento (pendência P3).
  select periodicidade_meses into v_periodicidade
    from public.tipos_requisito where id = v_item.tipo_requisito_id;

  v_proximo_venc := (p_data_documento + (v_periodicidade || ' months')::interval)::date;

  -- Inapto não abre ciclo novo: o caso vira tratativa clínica, não agendamento.
  -- O colaborador segue bloqueado na view por falta de evento apto.
  if p_resultado in ('apto','apto_com_restricao') then
    insert into public.itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento, etapa)
    values (v_item.colaborador_id, v_item.tipo_requisito_id, v_proximo_venc, 'previsto')
    on conflict do nothing;
  end if;

  return v_evento_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro da comunicação à CEMIG — não bloqueia o fluxo (plano, regra 4)
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_comunicacao_cemig(
  p_item_id uuid,
  p_data    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS registra a comunicação à CEMIG.' using errcode = 'insufficient_privilege';
  end if;

  perform public.fn_exigir_acesso_ao_item(p_item_id);

  update public.itens_pendencia set comunicado_cemig_em = p_data where id = p_item_id;
end;
$$;
