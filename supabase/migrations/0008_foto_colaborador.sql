-- =============================================================================
-- GIRO — 0008 · Foto do colaborador
--
-- Guarda o CAMINHO no bucket, não uma URL. Mesma decisão já tomada para o
-- documento do ASO: URL assinada expira, e gravar uma no banco cria registro
-- que apodrece sozinho.
-- =============================================================================

alter table public.colaboradores add column if not exists foto_url text;

comment on column public.colaboradores.foto_url is
  'Caminho no bucket `fotos`. Nulo é o estado normal: o avatar de inicial cobre.';

-- -----------------------------------------------------------------------------
-- Bucket privado.
--
-- Foto de funcionário é dado pessoal. Bucket público deixaria qualquer um com
-- o link ver o rosto de 261 pessoas, e link de storage vaza com facilidade.
-- 512 kB de teto: a imagem chega aqui já reduzida a 256px pelo navegador.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 524288, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_leitura on storage.objects;
create policy fotos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos');

drop policy if exists fotos_escrita_qsms on storage.objects;
create policy fotos_escrita_qsms on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.fn_e_qsms());

drop policy if exists fotos_update_qsms on storage.objects;
create policy fotos_update_qsms on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.fn_e_qsms());

drop policy if exists fotos_delete_qsms on storage.objects;
create policy fotos_delete_qsms on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.fn_e_qsms());
