-- =============================================================================
-- GIRO — 0007 · Login por e-mail e senha, papel admin
--
-- Revoga a decisão de magic link (plano original) em favor de e-mail + senha,
-- conforme "ajuste ao mvp.md". A sessão continua sendo cookie/JWT do Supabase
-- Auth — só o método de obter a primeira sessão muda. RLS continua baseada em
-- auth.uid(), sem alteração de schema além do papel novo.
--
-- `admin` enxerga tudo que o QSMS enxerga (fn_e_qsms cobre os dois papéis) e
-- ganha, além disso, a tela de gestão de usuários — que é uma checagem de
-- aplicação (exigirAdmin), não de RLS: quem cria usuário usa a service_role,
-- que já ignora RLS.
-- =============================================================================

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('qsms','supervisor','admin'));

create or replace function public.fn_e_qsms()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fn_papel() in ('qsms','admin'), false);
$$;
