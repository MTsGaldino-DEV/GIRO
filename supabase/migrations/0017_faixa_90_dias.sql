-- =============================================================================
-- GIRO — 0017 · Faixa `programar` de 90 dias
--
-- Decisão de 10/11 (spec de telas e fluxo, seção 11 e 12b item 3): o Radar
-- entra em 90 dias, então `programar` passa a cobrir de 90 a 31 dias e `ok` passa
-- a ser "mais de 90". Atenção (30 a 15), crítico (menos de 15), vencido e sem
-- registro não mudam.
--
-- Efeito em produção, esperado e aprovado: quem vence entre 61 e 90 dias sai de
-- "Em dia" e vai para "Programar" nos contadores, na lista e na rosca.
--
-- Só o corpo da view muda: o mesmo da 0012 (versão vigente), trocando `<= 60`
-- por `<= 90` no `status` e no `peso_status`. Colunas, tipos e ordem idênticos,
-- por isso `create or replace` basta: `vw_itens_abertos` (0013) e as funções que
-- leem a view seguem válidas sem serem recriadas.
--
-- Não dependem da faixa, e por isso ficam como estão:
--   fn_resumo_status (0015)         conta por `status`, sem número fixo.
--   fn_gerar_itens_pendentes (0012) já usa a janela de 90 dias.
--   fn_vencimentos_a_frente (0010)  são cortes de demanda (30/60/90), não faixas.
-- =============================================================================

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
    when (b.data_vencimento - public.hoje()) <= 90        then 'programar'
    else 'ok'
  end as status,
  case
    when b.data_vencimento is null                        then 0
    when (b.data_vencimento - public.hoje()) < 0          then 1
    when (b.data_vencimento - public.hoje()) < 15         then 2
    when (b.data_vencimento - public.hoje()) <= 30        then 3
    when (b.data_vencimento - public.hoje()) <= 90        then 4
    else 5
  end as peso_status,
  (b.situacao <> 'trabalhando') as bloqueado_para_agendamento,
  -- Plano, seção 7: a data limite para marcar é o vencimento − 7 dias.
  (b.data_vencimento - 7)                                  as data_limite_marcar,
  (b.data_vencimento is not null
   and (b.data_vencimento - 7) < public.hoje())             as limite_marcacao_estourado
from base b;

comment on view public.vw_status_colaborador is
  'Status de conformidade por colaborador × requisito, incluindo quem nunca teve registro. Respeita RLS. Faixa programar: 90 a 31 dias (0017).';
