-- =============================================================================
-- GIRO — 0010 · Agregações do dashboard gerencial
--
-- Todas `security invoker`, como a fn_resumo_status já é: herdam a RLS de quem
-- chama em vez de furá-la. Agregar no Postgres e não no Node porque somar 261
-- linhas no servidor de aplicação significa trafegar 261 linhas para descartar
-- 255 delas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onde está a bola: distribuição por etapa, com dono e SLA estourado.
-- Responde "o gargalo é a supervisão que não libera ou o QSMS que não agenda".
-- -----------------------------------------------------------------------------
create or replace function public.fn_resumo_por_etapa()
returns table (
  etapa          text,
  dono           text,
  quantidade     bigint,
  estourados     bigint,
  dias_max       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.etapa,
    i.dono,
    count(*),
    count(*) filter (where i.sla_estourado),
    coalesce(max(i.dias_parados), 0)
  from public.vw_itens_abertos i
  group by i.etapa, i.dono
  order by count(*) filter (where i.sla_estourado) desc, count(*) desc;
$$;

grant execute on function public.fn_resumo_por_etapa() to authenticated;

-- -----------------------------------------------------------------------------
-- Ranking por supervisor.
--
-- Transforma "os supervisores não programam" de reclamação em número com nome.
-- Inclui a linha "Sem supervisor" (supervisor_id nulo): são os colaboradores
-- por quem ninguém é cobrado, e escondê-los seria repetir o problema que o
-- sistema existe para resolver.
-- -----------------------------------------------------------------------------
create or replace function public.fn_resumo_por_supervisor()
returns table (
  supervisor_id    uuid,
  supervisor_nome  text,
  equipe           bigint,
  vencidos         bigint,
  sem_registro     bigint,
  criticos         bigint,
  itens_abertos    bigint,
  estourados       bigint,
  dias_mais_antigo integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with equipe as (
    select
      v.supervisor_id,
      coalesce(v.supervisor_nome, 'Sem supervisor') as supervisor_nome,
      count(*)                                                as equipe,
      count(*) filter (where v.status = 'vencido')            as vencidos,
      count(*) filter (where v.status = 'sem_registro')       as sem_registro,
      count(*) filter (where v.status = 'critico')            as criticos
    from public.vw_status_colaborador v
    group by v.supervisor_id, coalesce(v.supervisor_nome, 'Sem supervisor')
  ),
  abertos as (
    select
      i.supervisor_id,
      count(*)                                   as itens_abertos,
      count(*) filter (where i.sla_estourado)    as estourados,
      coalesce(max(i.dias_parados), 0)           as dias_mais_antigo
    from public.vw_itens_abertos i
    group by i.supervisor_id
  )
  select
    e.supervisor_id,
    e.supervisor_nome,
    e.equipe,
    e.vencidos,
    e.sem_registro,
    e.criticos,
    coalesce(a.itens_abertos, 0),
    coalesce(a.estourados, 0),
    coalesce(a.dias_mais_antigo, 0)
  from equipe e
  left join abertos a on a.supervisor_id is not distinct from e.supervisor_id
  order by (e.vencidos + e.sem_registro) desc, e.equipe desc;
$$;

grant execute on function public.fn_resumo_por_supervisor() to authenticated;

-- -----------------------------------------------------------------------------
-- Curva de conclusão: ASOs concluídos por mês.
--
-- generate_series garante o mês vazio na saída. Sem isso, um mês sem nenhum
-- exame simplesmente sumiria do gráfico, e a linha pularia o buraco — que é
-- exatamente o mês que o gestor precisa enxergar.
-- -----------------------------------------------------------------------------
create or replace function public.fn_conclusoes_por_mes(p_meses integer default 12)
returns table (
  mes         date,
  quantidade  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.mes::date,
    count(e.id)
  from generate_series(
    date_trunc('month', public.hoje()) - ((greatest(p_meses, 1) - 1) || ' months')::interval,
    date_trunc('month', public.hoje()),
    interval '1 month'
  ) as m(mes)
  left join public.eventos_requisito e
    on date_trunc('month', e.data_documento) = m.mes
   and e.resultado in ('apto', 'apto_com_restricao')
  group by m.mes
  order by m.mes;
$$;

grant execute on function public.fn_conclusoes_por_mes(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Vencimentos à frente, para dimensionar a demanda da clínica.
-- -----------------------------------------------------------------------------
create or replace function public.fn_vencimentos_a_frente()
returns table (
  ate_30   bigint,
  ate_60   bigint,
  ate_90   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where v.dias_restantes between 0 and 30),
    count(*) filter (where v.dias_restantes between 0 and 60),
    count(*) filter (where v.dias_restantes between 0 and 90)
  from public.vw_status_colaborador v;
$$;

grant execute on function public.fn_vencimentos_a_frente() to authenticated;
