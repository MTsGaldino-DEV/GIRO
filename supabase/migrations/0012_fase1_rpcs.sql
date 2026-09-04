-- =============================================================================
-- GIRO — 0012 · Fase 1 · Views e RPCs do novo fluxo
--
-- Continuação de 0011. Ali ficou o esquema (colunas, estados, SLA, transições);
-- aqui ficam as views que os painéis leem e as RPCs que movem o processo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- vw_status_colaborador · o cross join continua, com o recorte do requisito
-- opcional.
--
-- Um requisito `opcional` (hoje só a AVP) só cruza com quem está marcado. Sem
-- esse filtro, ligar a AVP no catálogo criaria 261 pendências pretas no mesmo
-- segundo — e a lista de quem realmente precisa de AVP ainda é [PENDENTE].
-- -----------------------------------------------------------------------------
create or replace view public.vw_status_colaborador
with (security_invoker = true) as
-- Quem reinicia o ciclo é a data de realização do exame (plano, seção 7). A
-- data do documento fica como recuo: nos registros da carga inicial é a única
-- que existe.
with ultimo_evento as (
  select distinct on (e.colaborador_id, e.tipo_requisito_id)
    e.colaborador_id,
    e.tipo_requisito_id,
    coalesce(e.data_realizado, e.data_documento) as data_referencia,
    e.resultado,
    e.estimado
  from public.eventos_requisito e
  where e.resultado in ('apto', 'apto_com_restricao')
  order by e.colaborador_id, e.tipo_requisito_id,
           coalesce(e.data_realizado, e.data_documento) desc
),
base as (
  select
    c.id            as colaborador_id,
    c.matricula,
    c.nome,
    c.cargo,
    c.polo,
    c.local,
    c.situacao,
    c.supervisor_id,
    s.nome          as supervisor_nome,
    s.email         as supervisor_email,
    t.id            as tipo_requisito_id,
    t.nome          as requisito,
    t.exige_jejum,
    ue.data_referencia as ultimo_documento,
    ue.estimado        as ultimo_documento_estimado,
    case when ue.data_referencia is not null
         then (ue.data_referencia + (t.periodicidade_meses || ' months')::interval)::date
    end as data_vencimento
  from public.colaboradores c
  cross join public.tipos_requisito t
  left join ultimo_evento ue
    on ue.colaborador_id = c.id and ue.tipo_requisito_id = t.id
  left join public.supervisores s
    on s.id = c.supervisor_id
  where c.ativo = true
    and t.ativo = true
    and (t.opcional = false or c.exige_avp = true)
)
select
  b.*,
  (b.data_vencimento - public.hoje()) as dias_restantes,
  case
    when b.data_vencimento is null                        then 'sem_registro'
    when (b.data_vencimento - public.hoje()) < 0          then 'vencido'
    when (b.data_vencimento - public.hoje()) < 15         then 'critico'
    when (b.data_vencimento - public.hoje()) <= 30        then 'atencao'
    when (b.data_vencimento - public.hoje()) <= 60        then 'programar'
    else 'ok'
  end as status,
  case
    when b.data_vencimento is null                        then 0
    when (b.data_vencimento - public.hoje()) < 0          then 1
    when (b.data_vencimento - public.hoje()) < 15         then 2
    when (b.data_vencimento - public.hoje()) <= 30        then 3
    when (b.data_vencimento - public.hoje()) <= 60        then 4
    else 5
  end as peso_status,
  (b.situacao <> 'trabalhando') as bloqueado_para_agendamento,
  -- Plano, seção 7: a data limite para marcar é o vencimento − 7 dias. O
  -- semáforo de seis faixas do projeto continua como está (o plano o declara
  -- "ajustável"); o que faltava era o sinal de que o prazo de marcação já
  -- passou, que é uma pergunta diferente de "quanto falta para vencer".
  (b.data_vencimento - 7)                                  as data_limite_marcar,
  (b.data_vencimento is not null
   and (b.data_vencimento - 7) < public.hoje())             as limite_marcacao_estourado
from base b;

-- -----------------------------------------------------------------------------
-- vw_itens_abertos · dono das etapas novas + campos do desfecho
-- -----------------------------------------------------------------------------
create or replace view public.vw_itens_abertos
with (security_invoker = true) as
select
  i.id                      as item_id,
  i.etapa,
  i.data_vencimento         as vencimento_item,
  i.data_liberacao_proposta,
  i.clinica,
  i.endereco,
  i.medico,
  i.data_agendada,
  i.hora_agendada,
  i.compareceu,
  i.avaliacao_psicossocial,
  i.comunicado_cemig_em,
  i.sla_vence_em,
  i.etapa_desde,
  i.criado_em               as item_criado_em,

  case i.etapa
    when 'previsto'             then 'supervisor'
    when 'data_solicitada'      then 'supervisor'
    when 'data_proposta'        then 'qsms'
    when 'agendado'             then 'supervisor'
    when 'enviado_clinica'      then 'qsms'
    when 'aguardando_documento' then 'qsms'
    when 'inapto_em_tratativa'  then 'qsms'
    else 'ninguem'
  end                       as dono,
  greatest(0, (extract(epoch from (now() - i.etapa_desde)) / 86400)::integer) as dias_parados,
  (i.sla_vence_em is not null and i.sla_vence_em < now())                     as sla_estourado,

  v.colaborador_id,
  v.matricula,
  v.nome,
  v.cargo,
  v.polo,
  v.local,
  v.situacao,
  v.supervisor_id,
  v.supervisor_nome,
  v.supervisor_email,
  v.tipo_requisito_id,
  v.requisito,
  v.exige_jejum,
  v.ultimo_documento,
  v.ultimo_documento_estimado,
  v.data_vencimento,
  v.dias_restantes,
  v.status,
  v.peso_status,
  v.bloqueado_para_agendamento,

  aus.proxima_ausencia_inicio,
  aus.proxima_ausencia_fim,
  aus.proxima_ausencia_tipo,
  case
    when aus.proxima_ausencia_inicio is null then v.dias_restantes
    else least(v.dias_restantes, (aus.proxima_ausencia_inicio - public.hoje()))
  end                       as dias_janela_util,
  (
    aus.proxima_ausencia_inicio is not null
    and aus.proxima_ausencia_inicio <= public.hoje()
    and (aus.proxima_ausencia_fim is null
         or (v.data_vencimento is not null and aus.proxima_ausencia_fim >= v.data_vencimento))
  )                         as conflito_bloqueante,

  -- Fase 1
  i.clinica_id,
  i.desfecho,
  i.dados_informados_em,
  i.data_limite_marcar,
  (i.data_limite_marcar < public.hoje())                    as limite_marcacao_estourado

from public.itens_pendencia i
join public.vw_status_colaborador v
  on v.colaborador_id = i.colaborador_id
 and v.tipo_requisito_id = i.tipo_requisito_id
left join lateral (
  select a.data_inicio as proxima_ausencia_inicio,
         a.data_fim    as proxima_ausencia_fim,
         a.tipo        as proxima_ausencia_tipo
    from public.ausencias a
   where a.colaborador_id = i.colaborador_id
     and (a.data_fim is null or a.data_fim >= public.hoje())
   order by a.data_inicio
   limit 1
) aus on true
-- Cancelado sai da fila; inapto em tratativa NÃO sai — é a trava do plano 6.4,
-- e o caso precisa continuar visível no painel.
where i.etapa not in ('concluido', 'cancelado');

-- =============================================================================
-- RPCs do fluxo (plano, seção 6.1)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Passo 2 · previsto -> data_solicitada
--
-- O envio da mensagem em si é Fase 2. O que a Fase 1 registra é que o pedido
-- saiu — sem isso não há como distinguir "ninguém pediu ainda" de "pedimos e o
-- supervisor não respondeu", que são pendências de donos diferentes.
-- -----------------------------------------------------------------------------
create or replace function public.fn_solicitar_data(
  p_item_id     uuid,
  p_canal       text default null,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS solicita data ao supervisor.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'previsto' then
    raise exception 'O item não está na etapa "previsto".' using errcode = 'check_violation';
  end if;

  perform set_config(
    'giro.observacao',
    coalesce(p_observacao,
      'Data solicitada ao supervisor' || coalesce(' por ' || nullif(trim(p_canal), ''), '') || '.'),
    true
  );

  update public.itens_pendencia set etapa = 'data_solicitada' where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 3 · data_solicitada -> data_proposta, registrada pelo QSMS
--
-- Na Fase 1 o supervisor não tem login. Quem digita é o QSMS, mas quem decidiu
-- a data foi o supervisor: `em_nome_de` guarda essa diferença. Sem ela, seis
-- meses depois a auditoria diz que o QSMS escolheu sozinho.
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_data_supervisor(
  p_item_id     uuid,
  p_data        date,
  p_em_nome_de  text,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS registra data em nome do supervisor.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_em_nome_de), '') = '' then
    raise exception 'Informe em nome de qual supervisor a data está sendo registrada.'
      using errcode = 'check_violation';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa not in ('previsto', 'data_solicitada') then
    raise exception 'O item não está aguardando data do supervisor.' using errcode = 'check_violation';
  end if;

  if p_data < public.hoje() then
    raise exception 'A data de liberação não pode estar no passado.' using errcode = 'check_violation';
  end if;

  perform 1 from public.ausencias a
   where a.colaborador_id = v_item.colaborador_id
     and p_data >= a.data_inicio
     and (a.data_fim is null or p_data <= a.data_fim);
  if found then
    raise exception 'O colaborador está ausente nessa data. Escolha outra.'
      using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', p_observacao, true);
  perform set_config('giro.em_nome_de', p_em_nome_de, true);

  update public.itens_pendencia
     set etapa = 'data_proposta',
         data_liberacao_proposta = p_data
   where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 3 (login do supervisor, Fase 2) · aceita também data_solicitada
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
as $fn$
declare
  v_item public.itens_pendencia;
begin
  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa not in ('previsto', 'data_solicitada') then
    raise exception 'O item não está aguardando data de liberação.' using errcode = 'check_violation';
  end if;

  if p_data < public.hoje() then
    raise exception 'A data de liberação não pode estar no passado.' using errcode = 'check_violation';
  end if;

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
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 4 · data_proposta -> agendado, agora com clínica do cadastro
--
-- A assinatura muda (ganha p_clinica_id), então a versão antiga cai. Manter as
-- duas criaria ambiguidade de sobrecarga na chamada por nome do PostgREST.
-- -----------------------------------------------------------------------------
drop function if exists public.fn_agendar(uuid, text, text, text, date, time, boolean, text);

create or replace function public.fn_agendar(
  p_item_id      uuid,
  p_clinica_id   uuid,
  p_clinica      text,
  p_endereco     text,
  p_medico       text,
  p_data         date,
  p_hora         time,
  p_psicossocial boolean default false,
  p_observacao   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item    public.itens_pendencia;
  v_clinica public.clinicas;
  v_nome    text := nullif(trim(p_clinica), '');
  v_end     text := nullif(trim(p_endereco), '');
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS agenda com a clínica.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'data_proposta' then
    raise exception 'O item não está na etapa "data proposta".' using errcode = 'check_violation';
  end if;

  -- Clínica do cadastro preenche nome e endereço; o texto livre continua
  -- aceito porque o mapa de clínicas por polo ainda é [PENDENTE].
  if p_clinica_id is not null then
    select * into v_clinica from public.clinicas where id = p_clinica_id and ativo;
    if not found then
      raise exception 'Clínica inexistente ou inativa.' using errcode = 'no_data_found';
    end if;
    v_nome := v_clinica.nome;
    v_end  := coalesce(v_end, v_clinica.endereco);
  end if;

  if v_nome is null then
    raise exception 'Informe a clínica.' using errcode = 'check_violation';
  end if;

  if p_data < public.hoje() then
    raise exception 'A data do agendamento não pode estar no passado.' using errcode = 'check_violation';
  end if;

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
         clinica_id = p_clinica_id,
         clinica = v_nome,
         endereco = v_end,
         medico = p_medico,
         data_agendada = p_data,
         hora_agendada = p_hora,
         avaliacao_psicossocial = coalesce(p_psicossocial, false),
         compareceu = null,
         desfecho = null,
         dados_informados_em = null
   where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 5 · QSMS informa clínica, horário e orientações ao supervisor
--
-- Não muda de etapa: é o carimbo de que a informação saiu. O item segue em
-- `agendado`, mas deixa de aparecer como "agendado e ninguém avisou".
-- -----------------------------------------------------------------------------
create or replace function public.fn_informar_dados(
  p_item_id     uuid,
  p_em_nome_de  text default null,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS informa os dados do agendamento.'
      using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'agendado' then
    raise exception 'O item não está agendado.' using errcode = 'check_violation';
  end if;

  update public.itens_pendencia
     set dados_informados_em = now()
   where id = p_item_id;

  -- Etapa não muda, então o trigger de histórico não dispara: gravar à mão.
  insert into public.historico_item (item_id, etapa_de, etapa_para, autor, observacao, em_nome_de)
  values (p_item_id, 'agendado', 'agendado', auth.uid(),
          coalesce(p_observacao, 'Clínica, horário e orientações informados ao supervisor.'),
          nullif(trim(p_em_nome_de), ''));
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 6 · agendado -> enviado_clinica
-- -----------------------------------------------------------------------------
create or replace function public.fn_enviar_clinica(
  p_item_id     uuid,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS registra o envio à clínica.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'agendado' then
    raise exception 'O item não está agendado.' using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao',
    coalesce(p_observacao, 'Colaborador enviado à clínica.'), true);

  update public.itens_pendencia set etapa = 'enviado_clinica' where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 7 · desfecho (plano, seção 6.3)
--
-- Quatro dos cinco desfechos NÃO fecham o ciclo. Só "fez e apto" segue para o
-- documento; "fez e inapto" trava; os outros três voltam ao supervisor para
-- propor nova data. Tratar os quatro como conclusão é o erro que a planilha
-- cometia — marcava o exame como resolvido porque a pessoa foi à clínica.
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_desfecho(
  p_item_id     uuid,
  p_desfecho    text,
  p_observacao  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item     public.itens_pendencia;
  v_proxima  text;
  v_rotulo   text;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS registra o desfecho do exame.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'enviado_clinica' then
    raise exception 'O desfecho só é registrado depois do envio à clínica.'
      using errcode = 'check_violation';
  end if;

  v_proxima := case p_desfecho
    when 'fez_apto'           then 'aguardando_documento'
    when 'fez_inapto'         then 'inapto_em_tratativa'
    when 'faltou'             then 'data_solicitada'
    when 'incompleto'         then 'data_solicitada'
    when 'retorno_necessario' then 'data_solicitada'
  end;

  if v_proxima is null then
    raise exception 'Desfecho inválido: %', p_desfecho using errcode = 'check_violation';
  end if;

  v_rotulo := case p_desfecho
    when 'fez_apto'           then 'Fez o exame e está apto.'
    when 'fez_inapto'         then 'Fez o exame e foi considerado inapto.'
    when 'faltou'             then 'Faltou ao exame.'
    when 'incompleto'         then 'Foi à clínica mas não fez todos os exames.'
    when 'retorno_necessario' then 'Fez o exame, houve alteração e é preciso retornar.'
  end;

  perform set_config('giro.observacao', coalesce(p_observacao, v_rotulo), true);

  if v_proxima = 'data_solicitada' then
    -- Novo ciclo com o supervisor: o agendamento velho só confunde.
    update public.itens_pendencia
       set etapa = v_proxima,
           desfecho = p_desfecho,
           compareceu = (p_desfecho <> 'faltou'),
           data_liberacao_proposta = null,
           clinica_id = null,
           data_agendada = null,
           hora_agendada = null,
           dados_informados_em = null
     where id = p_item_id;
  else
    update public.itens_pendencia
       set etapa = v_proxima,
           desfecho = p_desfecho,
           compareceu = true
     where id = p_item_id;
  end if;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Passo 8 · aguardando_documento -> concluido
--
-- Muda em relação a 0002: inapto não conclui mais. Vai para
-- `inapto_em_tratativa` e fica lá (plano, seção 6.4). O evento continua sendo
-- gravado — o exame aconteceu —, mas não conta como conformidade e não abre
-- ciclo novo.
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
as $fn$
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

  -- Plano, seção 7: quem reinicia o relógio é a data de realização do exame,
  -- lida dentro do PDF. A data do documento entra como recuo quando a clínica
  -- não informa a de realização.
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

  if p_resultado = 'inapto' then
    perform set_config('giro.observacao',
      coalesce(p_observacoes, 'Documento recebido com resultado inapto. Caso em tratativa.'), true);

    update public.itens_pendencia
       set etapa = 'inapto_em_tratativa',
           desfecho = 'fez_inapto',
           evento_id = v_evento_id
     where id = p_item_id;

    return v_evento_id;
  end if;

  perform set_config('giro.observacao',
    coalesce(p_observacoes, 'Recebido e inserido no GESET. Resultado: ' || p_resultado), true);

  update public.itens_pendencia
     set etapa = 'concluido',
         desfecho = 'fez_apto',
         evento_id = v_evento_id
   where id = p_item_id;

  select periodicidade_meses into v_periodicidade
    from public.tipos_requisito where id = v_item.tipo_requisito_id;

  v_proximo_venc := (coalesce(p_data_realizado, p_data_documento)
                     + (v_periodicidade || ' months')::interval)::date;

  insert into public.itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento, etapa)
  values (v_item.colaborador_id, v_item.tipo_requisito_id, v_proximo_venc, 'previsto')
  on conflict do nothing;

  return v_evento_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 6.4 · saída do inapto
--
-- [PENDENTE] O procedimento de resolução (tornar apto vs. dispensar) não foi
-- definido, e o plano é explícito: não inventar regra. O que existe aqui é só
-- a porta — encerrar o item com motivo registrado. Tornar apto é um processo
-- novo, criado depois; dispensar é inativar o colaborador. Nenhum dos dois
-- acontece automaticamente.
-- -----------------------------------------------------------------------------
create or replace function public.fn_encerrar_inapto(
  p_item_id   uuid,
  p_resolucao text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS encerra uma tratativa de inapto.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_resolucao), '') = '' then
    raise exception 'Descreva como o caso foi resolvido.' using errcode = 'check_violation';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'inapto_em_tratativa' then
    raise exception 'O item não está em tratativa de inapto.' using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', 'Tratativa de inapto encerrada: ' || p_resolucao, true);

  update public.itens_pendencia set etapa = 'cancelado' where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Cancelamento administrativo
-- -----------------------------------------------------------------------------
create or replace function public.fn_cancelar_item(
  p_item_id uuid,
  p_motivo  text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS cancela um item.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa in ('concluido', 'cancelado') then
    raise exception 'O item já está encerrado.' using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', 'Cancelado: ' || p_motivo, true);

  update public.itens_pendencia set etapa = 'cancelado' where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Devolução ao supervisor · destino passa a ser data_solicitada
--
-- Plano, seção 6.2: clínica indisponível reabre o ciclo com o supervisor. O
-- estado que representa isso agora é `data_solicitada`, não `previsto` — que
-- passou a significar "identificado, ninguém pediu nada ainda".
-- -----------------------------------------------------------------------------
create or replace function public.fn_devolver_ao_supervisor(
  p_item_id uuid,
  p_motivo  text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS devolve item ao supervisor.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da devolução.' using errcode = 'check_violation';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'data_proposta' then
    raise exception 'Só é possível devolver um item que está em "data proposta".'
      using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', 'Devolvido ao supervisor: ' || p_motivo, true);

  update public.itens_pendencia
     set etapa = 'data_solicitada',
         data_liberacao_proposta = null
   where id = p_item_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Comparecimento (login do supervisor, Fase 2) · faltou volta a data_solicitada
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
as $fn$
declare
  v_item public.itens_pendencia;
begin
  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa not in ('agendado', 'enviado_clinica') then
    raise exception 'O item não está agendado.' using errcode = 'check_violation';
  end if;

  perform set_config(
    'giro.observacao',
    coalesce(p_observacao, case when p_compareceu then null else 'Faltou ao exame.' end),
    true
  );

  if p_compareceu then
    update public.itens_pendencia
       set etapa = 'aguardando_documento', compareceu = true, desfecho = 'fez_apto'
     where id = p_item_id;
  else
    update public.itens_pendencia
       set etapa = 'data_solicitada',
           compareceu = false,
           desfecho = 'faltou',
           data_liberacao_proposta = null,
           clinica_id = null,
           data_agendada = null,
           hora_agendada = null,
           dados_informados_em = null
     where id = p_item_id;
  end if;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Geração de itens · janela de 90 dias (plano, seção 7)
-- -----------------------------------------------------------------------------
create or replace function public.fn_gerar_itens_pendentes()
returns table (criados integer, sem_registro integer, a_vencer integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_sem_registro integer := 0;
  v_a_vencer     integer := 0;
begin
  perform set_config('giro.observacao', 'Item gerado automaticamente pelo sistema.', true);

  with candidatos as (
    select
      v.colaborador_id,
      v.tipo_requisito_id,
      case when v.data_vencimento is null then public.hoje() else v.data_vencimento end as venc,
      v.status
    from public.vw_status_colaborador v
    where v.status = 'sem_registro'
       or v.dias_restantes <= 90
  ),
  inseridos as (
    insert into public.itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento, etapa)
    select c.colaborador_id, c.tipo_requisito_id, c.venc, 'previsto'
      from candidatos c
     where not exists (
       select 1 from public.itens_pendencia i
        where i.colaborador_id = c.colaborador_id
          and i.tipo_requisito_id = c.tipo_requisito_id
          and i.etapa not in ('concluido', 'cancelado')
     )
    on conflict do nothing
    returning colaborador_id, tipo_requisito_id
  )
  select
    count(*) filter (where c.status = 'sem_registro'),
    count(*) filter (where c.status <> 'sem_registro')
    into v_sem_registro, v_a_vencer
  from inseridos i
  join candidatos c
    on c.colaborador_id = i.colaborador_id
   and c.tipo_requisito_id = i.tipo_requisito_id;

  return query select (v_sem_registro + v_a_vencer), v_sem_registro, v_a_vencer;
end;
$fn$;

-- =============================================================================
-- Permissões
-- =============================================================================
revoke all on function public.fn_solicitar_data(uuid, text, text) from public;
revoke all on function public.fn_registrar_data_supervisor(uuid, date, text, text) from public;
revoke all on function public.fn_propor_data(uuid, date, text) from public;
revoke all on function public.fn_agendar(uuid, uuid, text, text, text, date, time, boolean, text) from public;
revoke all on function public.fn_informar_dados(uuid, text, text) from public;
revoke all on function public.fn_enviar_clinica(uuid, text) from public;
revoke all on function public.fn_registrar_desfecho(uuid, text, text) from public;
revoke all on function public.fn_concluir_item(uuid, date, text, date, text, text, text) from public;
revoke all on function public.fn_encerrar_inapto(uuid, text) from public;
revoke all on function public.fn_cancelar_item(uuid, text) from public;
revoke all on function public.fn_devolver_ao_supervisor(uuid, text) from public;
revoke all on function public.fn_registrar_comparecimento(uuid, boolean, text) from public;
revoke all on function public.fn_gerar_itens_pendentes() from public;

grant execute on function public.fn_solicitar_data(uuid, text, text) to authenticated;
grant execute on function public.fn_registrar_data_supervisor(uuid, date, text, text) to authenticated;
grant execute on function public.fn_propor_data(uuid, date, text) to authenticated;
grant execute on function public.fn_agendar(uuid, uuid, text, text, text, date, time, boolean, text) to authenticated;
grant execute on function public.fn_informar_dados(uuid, text, text) to authenticated;
grant execute on function public.fn_enviar_clinica(uuid, text) to authenticated;
grant execute on function public.fn_registrar_desfecho(uuid, text, text) to authenticated;
grant execute on function public.fn_concluir_item(uuid, date, text, date, text, text, text) to authenticated;
grant execute on function public.fn_encerrar_inapto(uuid, text) to authenticated;
grant execute on function public.fn_cancelar_item(uuid, text) to authenticated;
grant execute on function public.fn_devolver_ao_supervisor(uuid, text) to authenticated;
grant execute on function public.fn_registrar_comparecimento(uuid, boolean, text) to authenticated;
grant execute on function public.fn_gerar_itens_pendentes() to authenticated;

-- =============================================================================
-- Digest semanal interno do QSMS (plano, seção 9)
--
-- O e-mail semanal existente é por supervisor. O digest do plano é interno —
-- QSMS e admin — e não depende de login de supervisor, então cabe na Fase 1.
-- Vai numa linha só de alertas_enviados (item e supervisor nulos), com índice
-- próprio: sem ele, reexecutar o cron na mesma semana duplicaria o envio.
-- =============================================================================
alter table public.alertas_enviados drop constraint if exists alertas_enviados_tipo_alerta_check;
alter table public.alertas_enviados add constraint alertas_enviados_tipo_alerta_check
  check (tipo_alerta in ('semanal','sla_estourado','critico','digest_qsms'));

create unique index if not exists uq_alerta_interno
  on public.alertas_enviados(tipo_alerta, referencia)
  where item_id is null and supervisor_id is null;

-- =============================================================================
-- Histórico do colaborador e histórico de exames
-- =============================================================================

drop function if exists public.fn_historico_do_colaborador(uuid);

create or replace function public.fn_historico_do_colaborador(p_colaborador_id uuid)
returns table (
  id          uuid,
  item_id     uuid,
  etapa_de    text,
  etapa_para  text,
  autor_nome  text,
  em_nome_de  text,
  observacao  text,
  criado_em   timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    h.id,
    h.item_id,
    h.etapa_de,
    h.etapa_para,
    coalesce(p.nome, p.email, 'Sistema') as autor_nome,
    h.em_nome_de,
    h.observacao,
    h.criado_em
  from public.historico_item h
  join public.itens_pendencia i on i.id = h.item_id
  left join public.perfis p on p.id = h.autor
  where i.colaborador_id = p_colaborador_id
    and (public.fn_e_qsms() or public.fn_minha_equipe(i.colaborador_id))
  order by h.criado_em desc;
$fn$;

revoke all on function public.fn_historico_do_colaborador(uuid) from public;
grant execute on function public.fn_historico_do_colaborador(uuid) to authenticated;

-- O vencimento parte da data de realização do exame (plano, seção 7). A data
-- do documento continua como recuo para os registros antigos, em que só ela
-- existe.
create or replace view public.vw_eventos_colaborador
with (security_invoker = true) as
select
  e.id,
  e.colaborador_id,
  e.tipo_requisito_id,
  t.nome            as requisito,
  e.data_realizado,
  e.data_documento,
  (coalesce(e.data_realizado, e.data_documento)
   + (t.periodicidade_meses || ' months')::interval)::date as vencia_em,
  e.resultado,
  e.clinica,
  e.medico,
  e.documento_url,
  e.observacoes,
  e.estimado,
  e.criado_em
from public.eventos_requisito e
join public.tipos_requisito t on t.id = e.tipo_requisito_id;
