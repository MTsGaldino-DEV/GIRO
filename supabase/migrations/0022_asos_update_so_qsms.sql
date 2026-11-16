-- =============================================================================
-- GIRO — 0022 · Bucket asos: UPDATE só do QSMS (e do admin)
--
-- Achado da revisão da 0021: `asos_update_operador` (0016) deixava qualquer
-- operador fazer UPDATE em storage.objects do bucket asos, sem WITH CHECK.
-- Pela Storage API, isso é `move()` (renomear) ou upload com `upsert: true`
-- por cima do ASO de outra pessoa. A Storage API grava como dono quem fez a
-- operação, e a política de delete da 0021 (`asos_delete_dono_ou_qsms`: o
-- dono ou o QSMS) deixava apagar o arquivo em seguida. Era um caminho para
-- sumir com a evidência de um exame.
--
-- O app não usa UPDATE no bucket asos: o envio é sempre um arquivo novo
-- (`upsert: false`, lib/storage.ts) e não há move/copy no código. Só o
-- seed-teste usa upsert, e com a service role, que não passa por RLS.
--
-- Fica: UPDATE no bucket asos só para fn_e_qsms() (QSMS e admin), com USING e
-- WITH CHECK, para o objeto não sair do bucket nem entrar nele por update.
-- Leitura, envio e delete do bucket não mudam. As políticas de update dos
-- buckets documentos e fotos (0016) não são tocadas: a delas exige o próprio
-- bucket no USING, então não alcança objeto do asos.
--
-- Conferido no catálogo vivo (pg_policies em storage.objects, 16/11): a única
-- política de UPDATE que alcança o bucket asos é `asos_update_operador`.
--
-- Idempotente: drop policy if exists + create policy.
-- =============================================================================

drop policy if exists asos_update_operador on storage.objects;
drop policy if exists asos_update_qsms on storage.objects;
create policy asos_update_qsms on storage.objects
  for update to authenticated
  using (bucket_id = 'asos' and public.fn_e_qsms())
  with check (bucket_id = 'asos' and public.fn_e_qsms());
