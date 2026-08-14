-- =============================================================================
-- GIRO — 0005 · Geração automática de itens + seed do catálogo
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo: uma linha só no MVP.
-- P4 em aberto — não foi confirmado se algum cargo, grau de risco ou faixa
-- etária exige periodicidade menor que 12 meses. Padrão do plano: 12 para todos.
-- P6 em aberto — jejum ligado, com texto fixo no aviso, até a clínica confirmar
-- se vale para todos ou só para quem faz exame de sangue.
-- -----------------------------------------------------------------------------
insert into public.tipos_requisito (nome, periodicidade_meses, exige_jejum, exige_documento, ativo)
values ('ASO Periódico', 12, true, true, true)
on conflict (nome) do nothing;

-- -----------------------------------------------------------------------------
-- Geração de itens (cron diário)
--
-- Cria item em 'previsto' para quem vence nos próximos 60 dias e ainda não tem
-- ciclo aberto. Quem está sem registro entra com vencimento = hoje: não é uma
-- data real, é a tradução de "ausência de informação tem o mesmo peso de
-- vencido". Esses precisam entrar na fila imediatamente.
--
-- Idempotente pelo índice uq_item_aberto: rodar duas vezes no mesmo dia não
-- duplica nada.
-- -----------------------------------------------------------------------------
create or replace function public.fn_gerar_itens_pendentes()
returns table (criados integer, sem_registro integer, a_vencer integer)
language plpgsql
security definer
set search_path = public
as $$
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
       or v.dias_restantes <= 60
  ),
  inseridos as (
    insert into public.itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento, etapa)
    select c.colaborador_id, c.tipo_requisito_id, c.venc, 'previsto'
      from candidatos c
     where not exists (
       select 1 from public.itens_pendencia i
        where i.colaborador_id = c.colaborador_id
          and i.tipo_requisito_id = c.tipo_requisito_id
          and i.etapa <> 'concluido'
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
$$;

revoke all on function public.fn_gerar_itens_pendentes() from public;
grant execute on function public.fn_gerar_itens_pendentes() to authenticated;

-- -----------------------------------------------------------------------------
-- Contadores do banner global e dos cards do painel
--
-- Uma chamada em vez de seis counts. A faixa de alerta aparece em todas as
-- telas e não pode custar seis consultas por render.
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
  select
    count(*),
    count(*) filter (where status = 'sem_registro'),
    count(*) filter (where status = 'vencido'),
    count(*) filter (where status = 'critico'),
    count(*) filter (where status = 'atencao'),
    count(*) filter (where status = 'programar'),
    count(*) filter (where status = 'ok'),
    (select count(*) from public.vw_itens_abertos where sla_estourado)
  from public.vw_status_colaborador;
$$;

grant execute on function public.fn_resumo_status() to authenticated;

-- -----------------------------------------------------------------------------
-- Registro retroativo do último ASO (tela /qsms/base, Fase 0)
--
-- Cria o evento e, se já existir item aberto por "sem registro", reposiciona o
-- vencimento em vez de deixar o item órfão apontando para hoje.
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_aso_retroativo(
  p_colaborador_id    uuid,
  p_tipo_requisito_id uuid,
  p_data_documento    date,
  p_estimado          boolean default false,
  p_observacoes       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento_id     uuid;
  v_periodicidade integer;
  v_venc          date;
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas o QSMS registra ASO retroativo.' using errcode = 'insufficient_privilege';
  end if;

  if p_data_documento > public.hoje() then
    raise exception 'A data do documento não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  select periodicidade_meses into v_periodicidade
    from public.tipos_requisito where id = p_tipo_requisito_id;
  if not found then
    raise exception 'Tipo de requisito inexistente.' using errcode = 'no_data_found';
  end if;

  insert into public.eventos_requisito (
    colaborador_id, tipo_requisito_id, data_documento, resultado,
    estimado, observacoes, registrado_por
  ) values (
    p_colaborador_id, p_tipo_requisito_id, p_data_documento, 'apto',
    coalesce(p_estimado, false),
    coalesce(p_observacoes, case when p_estimado
             then 'Data estimada na carga inicial (Prox. Exame − periodicidade).' end),
    auth.uid()
  )
  returning id into v_evento_id;

  v_venc := (p_data_documento + (v_periodicidade || ' months')::interval)::date;

  -- O item que existia por falta de registro agora tem vencimento de verdade.
  update public.itens_pendencia
     set data_vencimento = v_venc
   where colaborador_id = p_colaborador_id
     and tipo_requisito_id = p_tipo_requisito_id
     and etapa <> 'concluido';

  return v_evento_id;
end;
$$;

revoke all on function public.fn_registrar_aso_retroativo(uuid, uuid, date, boolean, text) from public;
grant execute on function public.fn_registrar_aso_retroativo(uuid, uuid, date, boolean, text) to authenticated;
