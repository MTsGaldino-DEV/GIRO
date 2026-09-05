-- =============================================================================
-- GIRO — 0013 · foto_url na view de itens abertos
--
-- O painel precisava de duas consultas para desenhar uma linha: a view trazia
-- o item, e uma segunda ida ao banco buscava `colaboradores.foto_url` pelos ids
-- da página. Medido em produção antes desta migration: ~42 ms por carregamento,
-- gastos só para descobrir o caminho de uma miniatura.
--
-- A coluna entra no fim da lista de propósito: `create or replace view` aceita
-- acrescentar colunas ao final, mas não reordenar nem remover as existentes.
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
