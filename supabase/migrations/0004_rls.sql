-- =============================================================================
-- GIRO — 0004 · Row Level Security
--
-- Princípio: o supervisor enxerga a própria equipe e nada além. Não porque os
-- dados dos outros sejam secretos, mas porque um painel com 261 linhas para
-- quem gerencia 19 pessoas é um painel que ninguém abre.
--
-- Nenhuma escrita direta em itens_pendencia pelo supervisor: toda mudança de
-- etapa passa pelas RPCs de 0002, que validam a transição e gravam histórico.
-- Política de UPDATE coluna a coluna daria a mesma permissão sem nenhuma dessas
-- garantias.
-- =============================================================================

alter table public.supervisores      enable row level security;
alter table public.colaboradores     enable row level security;
alter table public.tipos_requisito   enable row level security;
alter table public.perfis            enable row level security;
alter table public.ausencias         enable row level security;
alter table public.eventos_requisito enable row level security;
alter table public.itens_pendencia   enable row level security;
alter table public.historico_item    enable row level security;
alter table public.alertas_enviados  enable row level security;

-- Colaborador pertence à equipe do usuário atual?
create or replace function public.fn_minha_equipe(p_colaborador_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.colaboradores c
     where c.id = p_colaborador_id
       and c.supervisor_id = public.fn_supervisor_id()
  );
$$;

-- -----------------------------------------------------------------------------
-- supervisores · nome e e-mail aparecem em tela para todo mundo
-- -----------------------------------------------------------------------------
drop policy if exists supervisores_leitura on public.supervisores;
create policy supervisores_leitura on public.supervisores
  for select to authenticated using (true);

drop policy if exists supervisores_escrita_qsms on public.supervisores;
create policy supervisores_escrita_qsms on public.supervisores
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- colaboradores
-- -----------------------------------------------------------------------------
drop policy if exists colaboradores_leitura on public.colaboradores;
create policy colaboradores_leitura on public.colaboradores
  for select to authenticated
  using (public.fn_e_qsms() or supervisor_id = public.fn_supervisor_id());

drop policy if exists colaboradores_escrita_qsms on public.colaboradores;
create policy colaboradores_escrita_qsms on public.colaboradores
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- tipos_requisito · catálogo, leitura geral
-- -----------------------------------------------------------------------------
drop policy if exists tipos_leitura on public.tipos_requisito;
create policy tipos_leitura on public.tipos_requisito
  for select to authenticated using (true);

drop policy if exists tipos_escrita_qsms on public.tipos_requisito;
create policy tipos_escrita_qsms on public.tipos_requisito
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- perfis · cada um vê o seu; o QSMS vê todos
-- -----------------------------------------------------------------------------
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis
  for select to authenticated using (id = auth.uid() or public.fn_e_qsms());

drop policy if exists perfis_escrita_qsms on public.perfis;
create policy perfis_escrita_qsms on public.perfis
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- ausencias · P7: alimentadas manualmente pelo QSMS até existir origem oficial
-- -----------------------------------------------------------------------------
drop policy if exists ausencias_leitura on public.ausencias;
create policy ausencias_leitura on public.ausencias
  for select to authenticated
  using (public.fn_e_qsms() or public.fn_minha_equipe(colaborador_id));

drop policy if exists ausencias_escrita_qsms on public.ausencias;
create policy ausencias_escrita_qsms on public.ausencias
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- eventos_requisito · só o QSMS registra resultado de ASO
-- -----------------------------------------------------------------------------
drop policy if exists eventos_leitura on public.eventos_requisito;
create policy eventos_leitura on public.eventos_requisito
  for select to authenticated
  using (public.fn_e_qsms() or public.fn_minha_equipe(colaborador_id));

drop policy if exists eventos_escrita_qsms on public.eventos_requisito;
create policy eventos_escrita_qsms on public.eventos_requisito
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- itens_pendencia · leitura conforme equipe, escrita só pelas RPCs
-- -----------------------------------------------------------------------------
drop policy if exists itens_leitura on public.itens_pendencia;
create policy itens_leitura on public.itens_pendencia
  for select to authenticated
  using (public.fn_e_qsms() or public.fn_minha_equipe(colaborador_id));

drop policy if exists itens_escrita_qsms on public.itens_pendencia;
create policy itens_escrita_qsms on public.itens_pendencia
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

-- Sem política de escrita para supervisor: fn_propor_data e
-- fn_registrar_comparecimento são SECURITY DEFINER e fazem a checagem por conta
-- própria.

-- -----------------------------------------------------------------------------
-- historico_item · leitura acompanha o item; escrita só pelo trigger
-- -----------------------------------------------------------------------------
drop policy if exists historico_leitura on public.historico_item;
create policy historico_leitura on public.historico_item
  for select to authenticated
  using (
    exists (
      select 1 from public.itens_pendencia i
       where i.id = historico_item.item_id
         and (public.fn_e_qsms() or public.fn_minha_equipe(i.colaborador_id))
    )
  );

-- -----------------------------------------------------------------------------
-- alertas_enviados · escrito pelo cron com service_role, que ignora RLS.
-- Nenhuma política: fechado para usuário final, e o QSMS lê pela tela.
-- -----------------------------------------------------------------------------
drop policy if exists alertas_leitura_qsms on public.alertas_enviados;
create policy alertas_leitura_qsms on public.alertas_enviados
  for select to authenticated using (public.fn_e_qsms());

-- -----------------------------------------------------------------------------
-- Execução das RPCs
-- -----------------------------------------------------------------------------
revoke all on function public.fn_propor_data(uuid, date, text) from public;
revoke all on function public.fn_agendar(uuid, text, text, text, date, time, boolean, text) from public;
revoke all on function public.fn_registrar_comparecimento(uuid, boolean, text) from public;
revoke all on function public.fn_concluir_item(uuid, date, text, date, text, text, text) from public;
revoke all on function public.fn_registrar_comunicacao_cemig(uuid, date) from public;

grant execute on function public.fn_propor_data(uuid, date, text) to authenticated;
grant execute on function public.fn_agendar(uuid, text, text, text, date, time, boolean, text) to authenticated;
grant execute on function public.fn_registrar_comparecimento(uuid, boolean, text) to authenticated;
grant execute on function public.fn_concluir_item(uuid, date, text, date, text, text, text) to authenticated;
grant execute on function public.fn_registrar_comunicacao_cemig(uuid, date) to authenticated;

-- =============================================================================
-- Storage · bucket privado para os PDFs de ASO
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asos', 'asos', false, 8388608,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists asos_leitura on storage.objects;
create policy asos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'asos' and public.fn_e_qsms());

drop policy if exists asos_escrita_qsms on storage.objects;
create policy asos_escrita_qsms on storage.objects
  for insert to authenticated
  with check (bucket_id = 'asos' and public.fn_e_qsms());

drop policy if exists asos_update_qsms on storage.objects;
create policy asos_update_qsms on storage.objects
  for update to authenticated
  using (bucket_id = 'asos' and public.fn_e_qsms());

drop policy if exists asos_delete_qsms on storage.objects;
create policy asos_delete_qsms on storage.objects
  for delete to authenticated
  using (bucket_id = 'asos' and public.fn_e_qsms());
