-- =============================================================================
-- GIRO — 0003 · View de status
--
-- O coração do sistema. O `cross join` é intencional: é ele que faz aparecer
-- quem NÃO tem registro. Sem o cross join a consulta só enxerga o que já
-- existe, e os colaboradores sem data de referência — o maior ponto cego da
-- operação hoje — continuam invisíveis, que é exatamente o problema que este
-- sistema existe para resolver.
--
-- security_invoker = true: a view respeita a RLS de colaboradores, então um
-- supervisor consultando a view enxerga apenas a própria equipe. Sem isso a
-- view seria um furo que devolve os 261 para qualquer autenticado.
-- =============================================================================

create or replace view public.vw_status_colaborador
with (security_invoker = true) as
with ultimo_evento as (
  select distinct on (e.colaborador_id, e.tipo_requisito_id)
    e.colaborador_id,
    e.tipo_requisito_id,
    e.data_documento,
    e.resultado,
    e.estimado
  from public.eventos_requisito e
  where e.resultado in ('apto', 'apto_com_restricao')
  order by e.colaborador_id, e.tipo_requisito_id, e.data_documento desc
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
    ue.data_documento as ultimo_documento,
    ue.estimado       as ultimo_documento_estimado,
    case when ue.data_documento is not null
         then (ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date
    end as data_vencimento
  from public.colaboradores c
  cross join public.tipos_requisito t
  left join ultimo_evento ue
    on ue.colaborador_id = c.id and ue.tipo_requisito_id = t.id
  left join public.supervisores s
    on s.id = c.supervisor_id
  where c.ativo = true and t.ativo = true
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
  -- Peso para ordenação: o painel abre sempre pelo pior caso.
  case
    when b.data_vencimento is null                        then 0
    when (b.data_vencimento - public.hoje()) < 0          then 1
    when (b.data_vencimento - public.hoje()) < 15         then 2
    when (b.data_vencimento - public.hoje()) <= 30        then 3
    when (b.data_vencimento - public.hoje()) <= 60        then 4
    else 5
  end as peso_status,
  (b.situacao <> 'trabalhando') as bloqueado_para_agendamento
from base b;

comment on view public.vw_status_colaborador is
  'Status de conformidade por colaborador × requisito, incluindo quem nunca teve registro. Respeita RLS.';

-- =============================================================================
-- View operacional: item aberto + status + janela útil
--
-- Junta a pendência (quem deve agir agora) com a conformidade (qual o risco) e
-- com as ausências (existe janela para fazer o exame?). É a consulta que os
-- dois painéis usam.
-- =============================================================================

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

  -- Quem está devendo a próxima ação, e há quanto tempo.
  case i.etapa
    when 'previsto'             then 'supervisor'
    when 'data_proposta'        then 'qsms'
    when 'agendado'             then 'supervisor'
    when 'aguardando_documento' then 'qsms'
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

  -- Janela útil: a próxima ausência que começa antes do vencimento encurta o
  -- prazo real. "Vence em 40 dias" é falso se ele entra de férias em 25.
  aus.proxima_ausencia_inicio,
  aus.proxima_ausencia_fim,
  aus.proxima_ausencia_tipo,
  case
    when aus.proxima_ausencia_inicio is null then v.dias_restantes
    else least(v.dias_restantes, (aus.proxima_ausencia_inicio - public.hoje()))
  end                       as dias_janela_util,
  -- Ausência sem data de retorno, ou que só termina depois do vencimento:
  -- não existe janela. Precisa de tratativa, não de agendamento.
  (
    aus.proxima_ausencia_inicio is not null
    and aus.proxima_ausencia_inicio <= public.hoje()
    and (aus.proxima_ausencia_fim is null
         or (v.data_vencimento is not null and aus.proxima_ausencia_fim >= v.data_vencimento))
  )                         as conflito_bloqueante

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
where i.etapa <> 'concluido';

comment on view public.vw_itens_abertos is
  'Itens em aberto com dono, dias parados, SLA e janela útil frente a ausências.';
