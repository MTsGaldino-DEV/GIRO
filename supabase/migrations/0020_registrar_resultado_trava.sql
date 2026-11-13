-- =============================================================================
-- GIRO — 0020 · Trava de linha em fn_registrar_resultado
--
-- Achado da revisão da Task 3: fn_exigir_acesso_ao_item lê o item sem travar,
-- então duas chamadas simultâneas de "fez e apto" no mesmo item passavam as duas
-- pela checagem de etapa e gravavam dois eventos.
--
-- Correção: depois da guarda de acesso (que continua sendo a de 0016), o item é
-- relido com `for update`, ANTES da checagem de etapa. A segunda chamada espera
-- a primeira confirmar; ao acordar, relê o item já em `concluido` e falha na
-- checagem de etapa (check_violation), sem gravar segundo evento.
--
-- Cópia de 0018 (nenhuma migration posterior redefine a função); muda só a
-- releitura do item. Idempotente: só `create or replace`.
-- =============================================================================

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

  -- Guarda de acesso: existência do item e permissão.
  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  -- Trava de linha (0020): quem chega depois espera o commit de quem chegou
  -- antes e relê o item atualizado, então a checagem de etapa abaixo enxerga
  -- o resultado da primeira chamada.
  select * into v_item from public.itens_pendencia where id = p_item_id for update;

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

revoke all on function public.fn_registrar_resultado(uuid, text, date, date, text, text, text, text) from public;
revoke all on function public.fn_registrar_resultado(uuid, text, date, date, text, text, text, text) from anon;
grant execute on function public.fn_registrar_resultado(uuid, text, date, date, text, text, text, text) to authenticated;
