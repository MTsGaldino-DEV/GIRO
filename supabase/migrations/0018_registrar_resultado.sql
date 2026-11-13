-- =============================================================================
-- GIRO — 0018 · Registrar resultado em passo único
--
-- Decisão de 13/11 (spec 2026-11-13-telas-e-fluxo, seção 8): o supervisor faz
-- o retorno da clínica e, no mesmo passo, anexa o ASO. "Fez e apto" conclui o
-- item na hora e abre o próximo ciclo; a etapa `aguardando_documento` sai do
-- fluxo normal e fica para o inapto lido no documento e para itens antigos.
--
-- O que muda:
--   1. fn_transicao_valida ganha ('enviado_clinica', 'concluido').
--   2. fn_registrar_resultado: resultado, evento e conclusão numa transação.
--      Os outros quatro desfechos delegam a fn_registrar_desfecho (intocada).
--   3. vw_itens_abertos: `enviado_clinica` passa a ter dono 'supervisor'.
--
-- fn_concluir_item fica como está: continua concluindo `aguardando_documento`.
-- Idempotente: só `create or replace`, sem apagar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Transições permitidas — cópia de 0011 com uma linha a mais
-- -----------------------------------------------------------------------------
create or replace function public.fn_transicao_valida(p_de text, p_para text)
returns boolean
language sql
immutable
as $fn$
  select (p_de, p_para) in (
    -- fluxo original (0002 / 0006)
    ('previsto',             'data_proposta'),
    ('data_proposta',        'agendado'),
    ('agendado',             'aguardando_documento'),
    ('agendado',             'previsto'),
    ('data_proposta',        'previsto'),
    ('aguardando_documento', 'concluido'),

    -- passo 2: QSMS solicita a data ao supervisor
    ('previsto',             'data_solicitada'),
    ('data_solicitada',      'data_proposta'),

    -- passo 4: clínica indisponível devolve o ciclo ao supervisor
    ('data_proposta',        'data_solicitada'),

    -- passo 6: colaborador enviado à clínica
    ('agendado',             'enviado_clinica'),

    -- passo 7: os cinco desfechos
    ('enviado_clinica',      'aguardando_documento'),   -- fez e apto (itens antigos)
    ('enviado_clinica',      'concluido'),              -- fez e apto com o ASO (0018)
    ('enviado_clinica',      'inapto_em_tratativa'),    -- fez e inapto
    ('enviado_clinica',      'data_solicitada'),        -- faltou / incompleto / retorno
    ('agendado',             'data_solicitada'),        -- faltou, registrado pelo supervisor

    -- inapto descoberto só na leitura do documento
    ('aguardando_documento', 'inapto_em_tratativa'),

    -- 6.4: a única saída do inapto é resolução explícita, e ela encerra o item
    ('inapto_em_tratativa',  'cancelado'),

    -- cancelamento administrativo
    ('previsto',             'cancelado'),
    ('data_solicitada',      'cancelado'),
    ('data_proposta',        'cancelado'),
    ('agendado',             'cancelado'),
    ('enviado_clinica',      'cancelado'),
    ('aguardando_documento', 'cancelado')
  );
$fn$;

-- -----------------------------------------------------------------------------
-- 2. Registrar resultado
--
-- "Fez e apto" exige o ASO: arquivo, data do documento (não futura) e
-- resultado apto ou apto com restrição. Grava o evento, conclui o item e abre
-- o próximo ciclo com a mesma regra de fn_concluir_item (0012): o relógio
-- reinicia pela data de realização e, sem ela, pela data do documento.
-- Qualquer recusa levanta exceção, e a função inteira é uma transação: item e
-- evento ficam como estavam.
--
-- Inapto não passa por aqui como "fez_apto": é o desfecho `fez_inapto`.
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_resultado(
  p_item_id         uuid,
  p_desfecho        text,
  p_data_documento  date default null,
  p_data_realizado  date default null,
  p_resultado       text default null,
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
  if not public.fn_e_operador() then
    raise exception 'Apenas QSMS e supervisão registra o resultado do exame.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Os outros quatro desfechos não fecham o ciclo nem pedem documento.
  if p_desfecho is distinct from 'fez_apto' then
    perform public.fn_registrar_desfecho(p_item_id, p_desfecho, p_observacoes);
    return null;
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'enviado_clinica' then
    raise exception 'O resultado só é registrado depois do envio à clínica.'
      using errcode = 'check_violation';
  end if;

  if nullif(btrim(p_documento_url), '') is null then
    raise exception 'Anexe o ASO para registrar "fez e apto".'
      using errcode = 'check_violation';
  end if;

  if p_data_documento is null then
    raise exception 'Informe a data do documento.' using errcode = 'check_violation';
  end if;

  if p_data_documento > public.hoje() then
    raise exception 'A data do documento não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  if p_data_realizado > public.hoje() then
    raise exception 'A data de realização não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  if p_resultado is null or p_resultado not in ('apto','apto_com_restricao') then
    raise exception 'Resultado inválido para "fez e apto": %', coalesce(p_resultado, '(vazio)')
      using errcode = 'check_violation';
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
    coalesce(p_observacoes, 'Fez o exame e está apto. ASO anexado. Resultado: ' || p_resultado), true);

  update public.itens_pendencia
     set etapa = 'concluido',
         desfecho = 'fez_apto',
         compareceu = true,
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

-- O Supabase concede execute ao `anon` por privilégio padrão; a guarda já
-- barraria, mas quem não está logado não tem por que chamar.
revoke all on function public.fn_registrar_resultado(uuid, text, date, date, text, text, text, text) from public;
revoke all on function public.fn_registrar_resultado(uuid, text, date, date, text, text, text, text) from anon;
grant execute on function public.fn_registrar_resultado(uuid, text, date, date, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. vw_itens_abertos — cópia de 0013; muda só o dono de `enviado_clinica`.
--    Mesmas colunas na mesma ordem, então `create or replace` basta.
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
    -- 0018: o supervisor registra o resultado e anexa o ASO.
    when 'enviado_clinica'      then 'supervisor'
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
  (i.data_limite_marcar < public.hoje())                    as limite_marcacao_estourado,

  -- 0013: caminho da miniatura, para o painel não precisar de uma segunda
  -- consulta só por causa dela. É caminho no bucket, não URL assinada — a
  -- assinatura continua sendo feita por quem exibe, com validade curta.
  c.foto_url

from public.itens_pendencia i
join public.vw_status_colaborador v
  on v.colaborador_id = i.colaborador_id
 and v.tipo_requisito_id = i.tipo_requisito_id
join public.colaboradores c
  on c.id = i.colaborador_id
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
