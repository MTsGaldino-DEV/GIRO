-- =============================================================================
-- GIRO — 0006 · Devolução ao supervisor
--
-- Caso real que o plano não nomeia mas o fluxo exige: o supervisor propõe uma
-- data, a clínica não tem vaga nela, e o QSMS precisa devolver o item em vez de
-- deixá-lo parado em 'data_proposta' consumindo SLA de quem não pode resolver.
--
-- A transição data_proposta -> previsto já era permitida em fn_transicao_valida;
-- aqui ela ganha porta de entrada, com motivo obrigatório no histórico. Devolver
-- sem dizer por quê devolve o problema junto.
-- =============================================================================

create or replace function public.fn_devolver_ao_supervisor(
  p_item_id uuid,
  p_motivo  text
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
     set etapa = 'previsto',
         data_liberacao_proposta = null
   where id = p_item_id;
end;
$$;

revoke all on function public.fn_devolver_ao_supervisor(uuid, text) from public;
grant execute on function public.fn_devolver_ao_supervisor(uuid, text) to authenticated;

-- =============================================================================
-- Histórico com nome de quem agiu
--
-- historico_item guarda auth.uid(). A timeline precisa do nome, e a RLS de
-- perfis não deixa um supervisor ler o perfil de outro usuário — o que está
-- certo, mas deixaria a timeline sem autor. Esta função resolve o nome sem
-- abrir a tabela.
-- =============================================================================

create or replace function public.fn_historico_do_item(p_item_id uuid)
returns table (
  id          uuid,
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
    h.etapa_de,
    h.etapa_para,
    coalesce(p.nome, p.email, 'Sistema') as autor_nome,
    h.observacao,
    h.criado_em
  from public.historico_item h
  left join public.perfis p on p.id = h.autor
  where h.item_id = p_item_id
    and exists (
      select 1 from public.itens_pendencia i
       where i.id = p_item_id
         and (public.fn_e_qsms() or public.fn_minha_equipe(i.colaborador_id))
    )
  order by h.criado_em asc;
$$;

revoke all on function public.fn_historico_do_item(uuid) from public;
grant execute on function public.fn_historico_do_item(uuid) to authenticated;
