-- -----------------------------------------------------------------------------
-- Resumo de status conta pessoas, não linhas de requisito
--
-- Com a AVP, `vw_status_colaborador` passou a ter uma linha por colaborador e
-- requisito: 256 ASOs + 236 AVPs viravam "492 pessoas" na rosca e no banner.
-- Agora cada colaborador entra uma vez, no pior status entre os requisitos
-- dele (menor peso_status) — quem tem ASO em dia e AVP vencida conta como
-- vencido, que é o que pede ação.
--
-- `sla_estourado` continua contando itens: é o número que bate com a lista
-- filtrada por "Só parados além do prazo da etapa".
-- -----------------------------------------------------------------------------
create or replace function public.fn_resumo_status()
returns table (
  total          bigint,
  sem_registro   bigint,
  vencido        bigint,
  critico        bigint,
  atencao        bigint,
  programar      bigint,
  ok             bigint,
  sla_estourado  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with pior as (
    select distinct on (colaborador_id) colaborador_id, status
    from public.vw_status_colaborador
    order by colaborador_id, peso_status
  )
  select
    count(*),
    count(*) filter (where status = 'sem_registro'),
    count(*) filter (where status = 'vencido'),
    count(*) filter (where status = 'critico'),
    count(*) filter (where status = 'atencao'),
    count(*) filter (where status = 'programar'),
    count(*) filter (where status = 'ok'),
    (select count(*) from public.vw_itens_abertos where sla_estourado)
  from pior;
$$;

grant execute on function public.fn_resumo_status() to authenticated;
