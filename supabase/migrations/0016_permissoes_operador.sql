-- -----------------------------------------------------------------------------
-- Permissões do operador: admin, QSMS e supervisor operam a UEN inteira
--
-- Decisão de 10/11 (spec 2026-11-13-telas-e-fluxo, seções 4 e 12b): os três
-- papéis leem e gravam em tudo o que é operacional, em todas as equipes. O
-- recorte por equipe passa a ser filtro de tela, não permissão.
--
-- Continua restrito (fn_e_qsms, sem mudança aqui): perfis, supervisores,
-- tipos_requisito e alertas_enviados. Gestão de usuários não abre.
-- Clínicas (cadastro operacional) e a comunicação à CEMIG abrem ao operador.
--
-- Idempotente: pode ser reaplicada, inclusive depois de um db:push completo
-- que recrie as funções de 0002/0012/0014 com fn_e_qsms().
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Papel de checagem
-- -----------------------------------------------------------------------------
create or replace function public.fn_e_operador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fn_papel() in ('qsms','admin','supervisor'), false);
$$;

grant execute on function public.fn_e_operador() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Funções do fluxo: fn_e_qsms() -> fn_e_operador()
--
-- Lê a definição atual de cada função no banco (pg_get_functiondef) e troca só
-- a checagem e o texto da mensagem. Evita copiar 13 corpos e herdar versões
-- velhas. CREATE OR REPLACE preserva dono, grants, SECURITY DEFINER e
-- search_path (que fazem parte do texto devolvido). Se já trocada, não muda.
-- -----------------------------------------------------------------------------
do $$
declare
  v_escrita text[] := array[
    'fn_solicitar_data',
    'fn_registrar_data_supervisor',
    'fn_agendar',
    'fn_informar_dados',
    'fn_enviar_clinica',
    'fn_registrar_desfecho',
    'fn_concluir_item',
    'fn_encerrar_inapto',
    'fn_cancelar_item',
    'fn_devolver_ao_supervisor',
    'fn_registrar_auditoria',
    'fn_registrar_aso_retroativo',
    'fn_registrar_comunicacao_cemig'
  ];
  -- Leituras SECURITY DEFINER que repetem a regra das políticas de
  -- historico_item e auditoria_colaborador. Sem a troca, a tabela abriria para
  -- a UEN e a RPC continuaria cortando por equipe.
  v_leitura text[] := array[
    'fn_historico_do_item',
    'fn_historico_do_colaborador',
    'fn_linha_do_tempo_colaborador'
  ];
  v_nome   text;
  v_oid    oid;
  v_achou  integer;
  v_def    text;
  v_novo   text;
begin
  foreach v_nome in array v_escrita || v_leitura loop
    v_achou := 0;

    for v_oid in
      select p.oid
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_nome
    loop
      v_achou := v_achou + 1;
      v_def  := pg_get_functiondef(v_oid);
      v_novo := replace(
                  replace(v_def, 'public.fn_e_qsms()', 'public.fn_e_operador()'),
                  'Apenas o QSMS', 'Apenas QSMS e supervisão');

      if v_novo <> v_def then
        execute v_novo;
      end if;

      v_def := pg_get_functiondef(v_oid);
      if position('fn_e_qsms' in v_def) > 0 then
        raise exception '0016: % ainda referencia fn_e_qsms depois da troca.', v_oid::regprocedure;
      end if;
      if position('public.fn_e_operador()' in v_def) = 0 then
        raise exception '0016: % não checa fn_e_operador().', v_oid::regprocedure;
      end if;
    end loop;

    if v_achou = 0 then
      raise exception '0016: função public.% não encontrada.', v_nome;
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Acesso ao item: operador recebe o item de qualquer equipe
--
-- A checagem de papel vem antes da busca, para quem não é operador não
-- descobrir se um id existe.
-- -----------------------------------------------------------------------------
create or replace function public.fn_exigir_acesso_ao_item(p_item_id uuid)
returns public.itens_pendencia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens_pendencia;
begin
  if not public.fn_e_operador() then
    raise exception 'Usuário sem perfil ativo.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_item from public.itens_pendencia where id = p_item_id;
  if not found then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;

  return v_item;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Políticas das tabelas operacionais
-- -----------------------------------------------------------------------------

-- colaboradores
drop policy if exists colaboradores_leitura on public.colaboradores;
create policy colaboradores_leitura on public.colaboradores
  for select to authenticated using (public.fn_e_operador());

drop policy if exists colaboradores_escrita_qsms on public.colaboradores;
drop policy if exists colaboradores_escrita_operador on public.colaboradores;
create policy colaboradores_escrita_operador on public.colaboradores
  for all to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- eventos_requisito
drop policy if exists eventos_leitura on public.eventos_requisito;
create policy eventos_leitura on public.eventos_requisito
  for select to authenticated using (public.fn_e_operador());

drop policy if exists eventos_escrita_qsms on public.eventos_requisito;
drop policy if exists eventos_escrita_operador on public.eventos_requisito;
create policy eventos_escrita_operador on public.eventos_requisito
  for all to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- itens_pendencia (a máquina de estados segue no trigger fn_item_antes_de_mudar)
drop policy if exists itens_leitura on public.itens_pendencia;
create policy itens_leitura on public.itens_pendencia
  for select to authenticated using (public.fn_e_operador());

drop policy if exists itens_escrita_qsms on public.itens_pendencia;
drop policy if exists itens_escrita_operador on public.itens_pendencia;
create policy itens_escrita_operador on public.itens_pendencia
  for all to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- ausencias
drop policy if exists ausencias_leitura on public.ausencias;
create policy ausencias_leitura on public.ausencias
  for select to authenticated using (public.fn_e_operador());

drop policy if exists ausencias_escrita_qsms on public.ausencias;
drop policy if exists ausencias_escrita_operador on public.ausencias;
create policy ausencias_escrita_operador on public.ausencias
  for all to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- documentos_colaborador
drop policy if exists documentos_leitura on public.documentos_colaborador;
create policy documentos_leitura on public.documentos_colaborador
  for select to authenticated using (public.fn_e_operador());

drop policy if exists documentos_escrita_qsms on public.documentos_colaborador;
drop policy if exists documentos_escrita_operador on public.documentos_colaborador;
create policy documentos_escrita_operador on public.documentos_colaborador
  for all to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- auditoria_colaborador: só leitura. Escrita continua exclusiva de
-- fn_registrar_auditoria, que carimba auth.uid().
drop policy if exists auditoria_leitura on public.auditoria_colaborador;
create policy auditoria_leitura on public.auditoria_colaborador
  for select to authenticated using (public.fn_e_operador());

-- historico_item: só leitura (escrita pelo trigger e pelas RPCs).
drop policy if exists historico_leitura on public.historico_item;
create policy historico_leitura on public.historico_item
  for select to authenticated using (public.fn_e_operador());

-- clinicas: leitura segue aberta a qualquer autenticado (0011); só a escrita
-- passa ao operador.
drop policy if exists clinicas_escrita_qsms on public.clinicas;
drop policy if exists clinicas_escrita_operador on public.clinicas;
create policy clinicas_escrita_operador on public.clinicas
  for all to authenticated
  using (public.fn_e_operador()) with check (public.fn_e_operador());

-- -----------------------------------------------------------------------------
-- 5. Storage: buckets asos, documentos e fotos
--
-- A leitura de `documentos` e `fotos` era de qualquer autenticado (0008,
-- 0014): quem tivesse login sem perfil ativo listava e baixava documentos e
-- fotos de todos. Agora as quatro operações exigem operador nos três buckets.
-- -----------------------------------------------------------------------------

-- asos
drop policy if exists asos_leitura on storage.objects;
create policy asos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'asos' and public.fn_e_operador());

drop policy if exists asos_escrita_qsms on storage.objects;
drop policy if exists asos_escrita_operador on storage.objects;
create policy asos_escrita_operador on storage.objects
  for insert to authenticated
  with check (bucket_id = 'asos' and public.fn_e_operador());

drop policy if exists asos_update_qsms on storage.objects;
drop policy if exists asos_update_operador on storage.objects;
create policy asos_update_operador on storage.objects
  for update to authenticated
  using (bucket_id = 'asos' and public.fn_e_operador());

drop policy if exists asos_delete_qsms on storage.objects;
drop policy if exists asos_delete_operador on storage.objects;
create policy asos_delete_operador on storage.objects
  for delete to authenticated
  using (bucket_id = 'asos' and public.fn_e_operador());

-- documentos
drop policy if exists documentos_leitura_storage on storage.objects;
create policy documentos_leitura_storage on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and public.fn_e_operador());

drop policy if exists documentos_escrita_qsms_storage on storage.objects;
drop policy if exists documentos_escrita_operador_storage on storage.objects;
create policy documentos_escrita_operador_storage on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.fn_e_operador());

drop policy if exists documentos_update_qsms_storage on storage.objects;
drop policy if exists documentos_update_operador_storage on storage.objects;
create policy documentos_update_operador_storage on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and public.fn_e_operador());

drop policy if exists documentos_delete_qsms_storage on storage.objects;
drop policy if exists documentos_delete_operador_storage on storage.objects;
create policy documentos_delete_operador_storage on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.fn_e_operador());

-- fotos
drop policy if exists fotos_leitura on storage.objects;
create policy fotos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and public.fn_e_operador());

drop policy if exists fotos_escrita_qsms on storage.objects;
drop policy if exists fotos_escrita_operador on storage.objects;
create policy fotos_escrita_operador on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.fn_e_operador());

drop policy if exists fotos_update_qsms on storage.objects;
drop policy if exists fotos_update_operador on storage.objects;
create policy fotos_update_operador on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.fn_e_operador());

drop policy if exists fotos_delete_qsms on storage.objects;
drop policy if exists fotos_delete_operador on storage.objects;
create policy fotos_delete_operador on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.fn_e_operador());
