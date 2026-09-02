-- =============================================================================
-- GIRO — 0009 · Histórico consolidado do colaborador
--
-- A fn_historico_do_item devolve a timeline de um ciclo. A aba Histórico da
-- página do colaborador precisa de todos os ciclos da pessoa, em ordem, com o
-- nome de quem agiu.
--
-- SECURITY DEFINER pelo mesmo motivo da função de item: historico_item guarda
-- auth.uid(), e resolver o nome exigiria abrir `perfis` para leitura direta.
-- =============================================================================

create or replace function public.fn_historico_do_colaborador(p_colaborador_id uuid)
returns table (
  id          uuid,
  item_id     uuid,
  etapa_de    text,
  etapa_para  text,
  autor_nome  text,
  observacao  text,
  criado_em   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id,
    h.item_id,
    h.etapa_de,
    h.etapa_para,
    coalesce(p.nome, p.email, 'Sistema') as autor_nome,
    h.observacao,
    h.criado_em
  from public.historico_item h
  join public.itens_pendencia i on i.id = h.item_id
  left join public.perfis p on p.id = h.autor
  where i.colaborador_id = p_colaborador_id
    and (public.fn_e_qsms() or public.fn_minha_equipe(i.colaborador_id))
  order by h.criado_em desc;
$$;

revoke all on function public.fn_historico_do_colaborador(uuid) from public;
grant execute on function public.fn_historico_do_colaborador(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Todos os exames do colaborador, do mais recente ao mais antigo.
--
-- eventos_requisito já é legível por RLS, mas a aba ASO precisa do nome do tipo
-- de requisito junto — e fazer isso com join no cliente custaria duas consultas
-- por aba.
-- -----------------------------------------------------------------------------
create or replace view public.vw_eventos_colaborador
with (security_invoker = true) as
select
  e.id,
  e.colaborador_id,
  e.tipo_requisito_id,
  t.nome            as requisito,
  e.data_realizado,
  e.data_documento,
  (e.data_documento + (t.periodicidade_meses || ' months')::interval)::date as vencia_em,
  e.resultado,
  e.clinica,
  e.medico,
  e.documento_url,
  e.observacoes,
  e.estimado,
  e.criado_em
from public.eventos_requisito e
join public.tipos_requisito t on t.id = e.tipo_requisito_id;

comment on view public.vw_eventos_colaborador is
  'Exames realizados, com o requisito e o vencimento que cada um gerou. Respeita RLS.';
