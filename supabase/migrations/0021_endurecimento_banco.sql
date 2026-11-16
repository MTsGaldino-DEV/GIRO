-- =============================================================================
-- GIRO — 0021 · Endurecimento do banco
--
-- Achados da revisão final (16/11), resolvidos aqui:
--
--   I-1  Conformidade falsa: fn_concluir_item concluía "apto" sem documento, e
--        o par fn_registrar_desfecho('fez_apto') + fn_concluir_item fazia o
--        mesmo. O caso "fez e apto" agora é só de fn_registrar_resultado (0018,
--        0020), que exige o ASO.
--   I-2  O `for all` de 0016 em colaboradores, eventos_requisito,
--        itens_pendencia, ausencias e documentos_colaborador deixava qualquer
--        operador, direto pelo PostgREST, inserir evento apto sem documento,
--        marcar o GESET sem auditoria, pular etapas, apagar eventos e itens (o
--        histórico ia junto em cascata) e apagar colaboradores. E o delete no
--        bucket asos apagava ASO de qualquer um.
--   I-4  perfis_escrita_qsms deixava o QSMS se promover a admin.
--   Menor  fn_registrar_aso_retroativo criava evento apto sem documento.
--          Decisão de Matheus (16/11): fica para todos os operadores, com o
--          PDF do ASO obrigatório.
--
-- Matriz de escrita direta (PostgREST com a sessão do usuário). Levantada no
-- código do app em 16/11 (Grep de .insert/.update/.delete/.upsert em app/,
-- components/ e lib/ com o cliente do usuário, não o de service role); o
-- relatório da task 0021 traz arquivo e linha de cada uma. Tudo o mais passa
-- pelas RPCs SECURITY DEFINER (donas = postgres), que não dependem destes
-- grants nem destas políticas.
--
--   tabela                  operação  colunas                       quem no app
--   colaboradores           UPDATE    nome, matricula, cpf, uen,    salvarCampo
--                                     data_admissao,
--                                     data_nascimento, cargo, polo,
--                                     local, situacao,
--                                     supervisor_id, exige_avp
--                           UPDATE    foto_url                      salvarFoto
--                           UPDATE    ativo                         alternarAtivo
--                           UPDATE    supervisor_id                 vincularColaborador,
--                                                                   vincularEmMassa
--   eventos_requisito       UPDATE    data_documento,               corrigirDataExame
--                                     data_realizado
--   itens_pendencia         UPDATE    data_vencimento               corrigirDataExame
--   ausencias               INSERT    (linha inteira)               registrarAusencia
--                           DELETE                                  removerAusencia
--   documentos_colaborador  INSERT    (linha inteira)               anexarDocumento
--                           UPDATE    tipo, data_documento,         editarDocumento
--                                     data_validade, descricao,
--                                     atualizado_por, atualizado_em
--                           DELETE                                  excluirDocumento
--
-- Nenhuma escrita direta de INSERT ou DELETE em colaboradores,
-- eventos_requisito e itens_pendencia existe no app; por isso ninguém (nem
-- QSMS) as recebe. Importadores e cron usam a service role, que não passa por
-- RLS nem por estes grants.
--
-- SELECT não muda: as políticas de leitura de 0016 e os grants de SELECT ficam
-- como estão.
--
-- O app ainda publicado na Vercel (antes do próximo push) usa
-- fn_registrar_desfecho('fez_apto'), fn_registrar_comparecimento(true) e a
-- assinatura antiga de fn_registrar_aso_retroativo. Esses três botões passam a
-- dar erro até o push; foi aceito (nenhum item real nessas etapas).
--
-- Idempotente: drop policy if exists, create or replace, revoke/grant
-- repetíveis, drop function if exists para a assinatura antiga.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Funções
--
-- Cada corpo parte da definição VIGENTE no banco em 16/11 (pg_get_functiondef,
-- depois de 0016–0020), não dos arquivos antigos. Muda só o que está marcado
-- com "0021". CREATE OR REPLACE preserva dono, grants, SECURITY DEFINER e
-- search_path.
-- -----------------------------------------------------------------------------

-- fn_concluir_item: só vale para itens em aguardando_documento (dados antigos
-- e o inapto descoberto na leitura do documento). Apto e apto com restrição
-- fecham o ciclo de 12 meses, então exigem o ASO anexado. Inapto não fecha o
-- ciclo e continua sem exigir documento.
create or replace function public.fn_concluir_item(
  p_item_id uuid,
  p_data_documento date,
  p_resultado text,
  p_data_realizado date default null,
  p_medico text default null,
  p_documento_url text default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item          public.itens_pendencia;
  v_evento_id     uuid;
  v_periodicidade integer;
  v_proximo_venc  date;
begin
  if not public.fn_e_operador() then
    raise exception 'Apenas QSMS e supervisão registra o resultado do ASO.' using errcode = 'insufficient_privilege';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'aguardando_documento' then
    raise exception 'O item não está aguardando documento.' using errcode = 'check_violation';
  end if;

  if p_resultado not in ('apto','inapto','apto_com_restricao') then
    raise exception 'Resultado inválido: %', p_resultado using errcode = 'check_violation';
  end if;

  -- 0021: sem o ASO, apto não conclui (conformidade falsa por 12 meses).
  if p_resultado in ('apto','apto_com_restricao') and nullif(btrim(p_documento_url), '') is null then
    raise exception 'Anexe o ASO para concluir com resultado apto.' using errcode = 'check_violation';
  end if;

  if p_data_documento > public.hoje() then
    raise exception 'A data do documento não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  -- Plano, seção 7: quem reinicia o relógio é a data de realização do exame,
  -- lida dentro do PDF. A data do documento entra como recuo quando a clínica
  -- não informa a de realização.
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

  if p_resultado = 'inapto' then
    perform set_config('giro.observacao',
      coalesce(p_observacoes, 'Documento recebido com resultado inapto. Caso em tratativa.'), true);

    update public.itens_pendencia
       set etapa = 'inapto_em_tratativa',
           desfecho = 'fez_inapto',
           evento_id = v_evento_id
     where id = p_item_id;

    return v_evento_id;
  end if;

  perform set_config('giro.observacao',
    coalesce(p_observacoes, 'Recebido e inserido no GESET. Resultado: ' || p_resultado), true);

  update public.itens_pendencia
     set etapa = 'concluido',
         desfecho = 'fez_apto',
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
$$;


-- fn_registrar_desfecho: "fez e apto" levava o item a aguardando_documento,
-- de onde fn_concluir_item fechava o ciclo. Desde 0018 "fez e apto" é de
-- fn_registrar_resultado, que exige o ASO no mesmo passo. Os outros quatro
-- desfechos continuam aqui (fn_registrar_resultado delega a eles).
create or replace function public.fn_registrar_desfecho(
  p_item_id uuid,
  p_desfecho text,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item     public.itens_pendencia;
  v_proxima  text;
  v_rotulo   text;
begin
  if not public.fn_e_operador() then
    raise exception 'Apenas QSMS e supervisão registra o desfecho do exame.' using errcode = 'insufficient_privilege';
  end if;

  -- 0021: "fez e apto" só com o ASO anexado, por Registrar resultado.
  if p_desfecho = 'fez_apto' then
    raise exception 'Para "fez e apto", use Registrar resultado com o ASO anexado.'
      using errcode = 'check_violation';
  end if;

  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  if v_item.etapa <> 'enviado_clinica' then
    raise exception 'O desfecho só é registrado depois do envio à clínica.'
      using errcode = 'check_violation';
  end if;

  v_proxima := case p_desfecho
    when 'fez_inapto'         then 'inapto_em_tratativa'
    when 'faltou'             then 'data_solicitada'
    when 'incompleto'         then 'data_solicitada'
    when 'retorno_necessario' then 'data_solicitada'
  end;

  if v_proxima is null then
    raise exception 'Desfecho inválido: %', p_desfecho using errcode = 'check_violation';
  end if;

  v_rotulo := case p_desfecho
    when 'fez_inapto'         then 'Fez o exame e foi considerado inapto.'
    when 'faltou'             then 'Faltou ao exame.'
    when 'incompleto'         then 'Foi à clínica mas não fez todos os exames.'
    when 'retorno_necessario' then 'Fez o exame, houve alteração e é preciso retornar.'
  end;

  perform set_config('giro.observacao', coalesce(p_observacao, v_rotulo), true);

  if v_proxima = 'data_solicitada' then
    -- Novo ciclo com o supervisor: o agendamento velho só confunde.
    update public.itens_pendencia
       set etapa = v_proxima,
           desfecho = p_desfecho,
           compareceu = (p_desfecho <> 'faltou'),
           data_liberacao_proposta = null,
           clinica_id = null,
           data_agendada = null,
           hora_agendada = null,
           dados_informados_em = null
     where id = p_item_id;
  else
    update public.itens_pendencia
       set etapa = v_proxima,
           desfecho = p_desfecho,
           compareceu = true
     where id = p_item_id;
  end if;
end;
$$;


-- fn_registrar_comparecimento: "compareceu" (true) levava o item a
-- aguardando_documento com desfecho fez_apto, sem documento. Quem foi ao exame
-- segue por Registrar resultado. Só a falta (false) continua. Nulo também é
-- recusado: antes caía na falta sem ninguém ter dito que faltou.
create or replace function public.fn_registrar_comparecimento(
  p_item_id uuid,
  p_compareceu boolean,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens_pendencia;
begin
  v_item := public.fn_exigir_acesso_ao_item(p_item_id);

  -- 0021: só a falta passa por aqui.
  if p_compareceu is not false then
    raise exception 'Quem fez o exame segue por Registrar resultado, com o ASO anexado.'
      using errcode = 'check_violation';
  end if;

  if v_item.etapa not in ('agendado', 'enviado_clinica') then
    raise exception 'O item não está agendado.' using errcode = 'check_violation';
  end if;

  perform set_config('giro.observacao', coalesce(p_observacao, 'Faltou ao exame.'), true);

  update public.itens_pendencia
     set etapa = 'data_solicitada',
         compareceu = false,
         desfecho = 'faltou',
         data_liberacao_proposta = null,
         clinica_id = null,
         data_agendada = null,
         hora_agendada = null,
         dados_informados_em = null
   where id = p_item_id;
end;
$$;


-- fn_registrar_aso_retroativo: o ASO passa a ser obrigatório. Assinatura nova
-- com p_documento_url (sem default); a antiga, sem documento, sai: deixá-la
-- seria deixar a porta aberta. O app (registrarAsoRetroativo) envia o arquivo
-- ao bucket asos antes de chamar. As demais regras seguem as vigentes: data não
-- futura, tipo existente, resultado apto, vencimento do item aberto
-- reposicionado.
drop function if exists public.fn_registrar_aso_retroativo(uuid, uuid, date, boolean, text);

create or replace function public.fn_registrar_aso_retroativo(
  p_colaborador_id uuid,
  p_tipo_requisito_id uuid,
  p_data_documento date,
  p_documento_url text,
  p_estimado boolean default false,
  p_observacoes text default null
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
  if not public.fn_e_operador() then
    raise exception 'Apenas QSMS e supervisão registra ASO retroativo.' using errcode = 'insufficient_privilege';
  end if;

  -- 0021: exame anterior só com o ASO anexado.
  if nullif(btrim(p_documento_url), '') is null then
    raise exception 'Anexe o ASO (PDF, JPG ou PNG) para lançar o exame anterior.'
      using errcode = 'check_violation';
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
    documento_url, estimado, observacoes, registrado_por
  ) values (
    p_colaborador_id, p_tipo_requisito_id, p_data_documento, 'apto',
    p_documento_url,
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

-- Função recriada nasce com o EXECUTE padrão (PUBLIC e anon). Mesmo padrão de
-- fn_registrar_resultado (0018): só authenticated, e a guarda decide o papel.
revoke all on function public.fn_registrar_aso_retroativo(uuid, uuid, date, text, boolean, text) from public;
revoke all on function public.fn_registrar_aso_retroativo(uuid, uuid, date, text, boolean, text) from anon;
grant execute on function public.fn_registrar_aso_retroativo(uuid, uuid, date, text, boolean, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Políticas: o `for all` de 0016 vira uma política por operação da matriz
--
-- As políticas de leitura (`*_leitura`, de 0016) não mudam. Operação sem
-- política fica barrada pela RLS; e sem grant (seção 3), barrada antes dela.
-- -----------------------------------------------------------------------------

-- colaboradores: só UPDATE (colunas na seção 3).
drop policy if exists colaboradores_escrita_operador on public.colaboradores;
drop policy if exists colaboradores_atualizacao_operador on public.colaboradores;
create policy colaboradores_atualizacao_operador on public.colaboradores
  for update to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- eventos_requisito: só UPDATE das duas datas (corrigirDataExame).
drop policy if exists eventos_escrita_operador on public.eventos_requisito;
drop policy if exists eventos_atualizacao_operador on public.eventos_requisito;
create policy eventos_atualizacao_operador on public.eventos_requisito
  for update to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- itens_pendencia: só UPDATE do vencimento (corrigirDataExame). Etapa e o
-- resto da máquina de estados só pelas RPCs.
drop policy if exists itens_escrita_operador on public.itens_pendencia;
drop policy if exists itens_atualizacao_operador on public.itens_pendencia;
create policy itens_atualizacao_operador on public.itens_pendencia
  for update to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- ausencias: INSERT e DELETE (o app não edita ausência).
drop policy if exists ausencias_escrita_operador on public.ausencias;
drop policy if exists ausencias_insercao_operador on public.ausencias;
create policy ausencias_insercao_operador on public.ausencias
  for insert to authenticated
  with check (public.fn_e_operador());
drop policy if exists ausencias_exclusao_operador on public.ausencias;
create policy ausencias_exclusao_operador on public.ausencias
  for delete to authenticated
  using (public.fn_e_operador());

-- documentos_colaborador: INSERT, UPDATE dos metadados e DELETE.
drop policy if exists documentos_escrita_operador on public.documentos_colaborador;
drop policy if exists documentos_insercao_operador on public.documentos_colaborador;
create policy documentos_insercao_operador on public.documentos_colaborador
  for insert to authenticated
  with check (public.fn_e_operador());
drop policy if exists documentos_atualizacao_operador on public.documentos_colaborador;
create policy documentos_atualizacao_operador on public.documentos_colaborador
  for update to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());
drop policy if exists documentos_exclusao_operador on public.documentos_colaborador;
create policy documentos_exclusao_operador on public.documentos_colaborador
  for delete to authenticated
  using (public.fn_e_operador());

-- perfis: escrita só do admin. Nenhum caminho do app escreve em perfis com a
-- sessão do usuário (Gestão de usuários usa a service role); a política fica
-- para o admin, que já pode tudo pela tela. Leitura (perfis_leitura) não muda.
drop policy if exists perfis_escrita_qsms on public.perfis;
drop policy if exists perfis_escrita_admin on public.perfis;
create policy perfis_escrita_admin on public.perfis
  for all to authenticated
  using (public.fn_papel() = 'admin') with check (public.fn_papel() = 'admin');


-- -----------------------------------------------------------------------------
-- 3. Grants: o que a matriz não usa sai do papel, antes mesmo da RLS
--
-- REVOKE de UPDATE na tabela também revoga os grants de coluna; o GRANT de
-- coluna logo depois devolve só as colunas da matriz. Por isso a sequência é
-- repetível. TRUNCATE sai porque ignora a RLS. anon não tem política nenhuma
-- nestas tabelas; perde a escrita também no grant. SELECT, REFERENCES,
-- TRIGGER e MAINTAIN não mudam.
-- -----------------------------------------------------------------------------

revoke insert, update, delete, truncate on table public.colaboradores from anon, authenticated;
grant update (
  nome, matricula, cpf, uen, data_admissao, data_nascimento, cargo, polo, local,
  situacao, supervisor_id, exige_avp, foto_url, ativo
) on table public.colaboradores to authenticated;

revoke insert, update, delete, truncate on table public.eventos_requisito from anon, authenticated;
grant update (data_documento, data_realizado) on table public.eventos_requisito to authenticated;

revoke insert, update, delete, truncate on table public.itens_pendencia from anon, authenticated;
grant update (data_vencimento) on table public.itens_pendencia to authenticated;

revoke insert, update, delete, truncate on table public.ausencias from anon, authenticated;
grant insert, delete on table public.ausencias to authenticated;

revoke insert, update, delete, truncate on table public.documentos_colaborador from anon, authenticated;
grant insert, delete on table public.documentos_colaborador to authenticated;
grant update (
  tipo, data_documento, data_validade, descricao, atualizado_por, atualizado_em
) on table public.documentos_colaborador to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Storage, bucket asos: apagar só o próprio envio, ou QSMS/admin
--
-- O app só apaga ASO em um caso: o arquivo que ele mesmo acabou de enviar,
-- quando a RPC falhou (removerSeNaoUsado). A Storage API grava o uid de quem
-- enviou em `owner` (uuid) e `owner_id` (texto); as duas colunas são aceitas.
-- Leitura, envio e update do bucket não mudam (0016).
-- -----------------------------------------------------------------------------
drop policy if exists asos_delete_operador on storage.objects;
drop policy if exists asos_delete_dono_ou_qsms on storage.objects;
create policy asos_delete_dono_ou_qsms on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'asos'
    and public.fn_e_operador()
    and (owner = auth.uid() or owner_id = auth.uid()::text or public.fn_e_qsms())
  );


-- PostgREST relê o esquema (assinatura nova de fn_registrar_aso_retroativo).
notify pgrst, 'reload schema';
