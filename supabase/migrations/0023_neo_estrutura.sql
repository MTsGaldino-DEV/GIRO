-- =============================================================================
-- 0023 — Integração com a CENTRAL-NEO: estrutura (fase 1)
--
-- Spec: docs/superpowers/specs/2026-11-16-integracao-central-neo-design.md
-- Plano: docs/superpowers/plans/2026-11-16-integracao-central-neo-fase-1.md (Task 2)
--
-- O cadastro de colaboradores passa a ter uma fonte única, a NEO. O GIRO guarda
-- uma cópia ligada por `neo_id` (uuid do colaborador na NEO). Esta migration só
-- prepara o terreno: colunas, duas tabelas e três funções. Nenhum dado é lido
-- nem alterado aqui; quem preenche é a `fn_sincronizar_neo` (0024).
--
-- O que entra
--   colaboradores.neo_id                 uuid único: a ligação com a NEO
--   colaboradores.matricula_cemig        a matrícula CEMIG (a Engelmig é a `matricula`)
--   colaboradores.data_desligamento      data de desligamento vinda da NEO
--   colaboradores.neo_sincronizado_em    última vez que a sincronização verificou a pessoa
--   supervisor_apelidos                  "como a NEO escreve" → supervisor do GIRO
--   neo_sincronizacoes                   uma linha por tentativa registrada (resumo ou erro)
--   fn_normalizar_texto(text)            minúsculas, sem acento, espaços colapsados
--   fn_vincular_apelido_supervisor(...)  QSMS/admin liga um texto da NEO a um supervisor
--   fn_registrar_falha_neo(...)          grava uma tentativa que falhou
--
-- Permissões (decisões)
--   * As colunas novas NÃO entram no `grant update` de colaboradores da 0021:
--     o operador (supervisor incluso) não consegue editá-las pela API. Só as
--     funções SECURITY DEFINER e a service role mexem nelas.
--   * As duas tabelas novas têm RLS ligada, leitura para o operador
--     (fn_e_operador) e nenhuma escrita direta: nem INSERT, nem UPDATE, nem
--     DELETE para authenticated ou anon. Escrita só pelas funções.
--
-- Idempotente: `add column if not exists`, `create table if not exists`,
-- `create or replace`, `drop policy if exists`, revoke/grant repetíveis.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas novas em colaboradores
-- -----------------------------------------------------------------------------

alter table public.colaboradores add column if not exists neo_id uuid;
alter table public.colaboradores add column if not exists matricula_cemig text;
alter table public.colaboradores add column if not exists data_desligamento date;
alter table public.colaboradores add column if not exists neo_sincronizado_em timestamptz;

-- Uma pessoa do GIRO liga a um único cadastro da NEO, e vice-versa. Índice
-- único (e não constraint) para `if not exists` valer na reaplicação; vários
-- `null` convivem (quem ainda não foi ligado).
create unique index if not exists colaboradores_neo_id_key
  on public.colaboradores (neo_id);

comment on column public.colaboradores.neo_id is
  'uuid do colaborador na CENTRAL-NEO. Preenchido só pela sincronização.';
comment on column public.colaboradores.matricula_cemig is
  'Matrícula CEMIG (campo dono da NEO). A matrícula Engelmig é a coluna `matricula`.';
comment on column public.colaboradores.data_desligamento is
  'Data de desligamento (campo dono da NEO). Nula para quem está ativo.';
comment on column public.colaboradores.neo_sincronizado_em is
  'Última vez que uma sincronização aplicada verificou esta pessoa na NEO.';

-- -----------------------------------------------------------------------------
-- 2. Normalizador de texto
--
-- Usado para casar o texto livre de supervisor da NEO com o nome do supervisor
-- do GIRO sem depender de acento, caixa ou espaços duplicados. `translate()` em
-- vez da extensão `unaccent`, para não depender de extensão instalada. Texto
-- nulo, vazio ou só de espaços dá `null` (nunca string vazia): assim "sem
-- supervisor" nunca casa com nada.
-- -----------------------------------------------------------------------------

create or replace function public.fn_normalizar_texto(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(translate(
          p_texto,
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        )),
        '[\s ]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- `from public, anon`: no Supabase o `anon` recebe EXECUTE direto por privilégio
-- padrão do schema; `revoke ... from public` sozinho não o remove.
revoke all on function public.fn_normalizar_texto(text) from public, anon;
grant execute on function public.fn_normalizar_texto(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. supervisor_apelidos
--
-- O supervisor na NEO é texto livre. Quando a grafia não bate com o nome do
-- supervisor do GIRO, o QSMS liga "como a NEO escreve" ao supervisor certo, uma
-- vez só. A chave é o texto já normalizado.
-- -----------------------------------------------------------------------------

create table if not exists public.supervisor_apelidos (
  texto_normalizado text primary key check (texto_normalizado <> ''),
  supervisor_id     uuid not null references public.supervisores(id) on delete cascade,
  criado_por        uuid,
  criado_em         timestamptz not null default now()
);

comment on table public.supervisor_apelidos is
  'Texto de supervisor como a NEO escreve (normalizado) → supervisor do GIRO. Escrita só por fn_vincular_apelido_supervisor.';

-- -----------------------------------------------------------------------------
-- 4. neo_sincronizacoes
--
-- Uma linha por tentativa aplicada (com o resumo, só contagens) ou que falhou
-- (com a mensagem). Nunca guarda nome, CPF nem linhas da NEO.
-- -----------------------------------------------------------------------------

create table if not exists public.neo_sincronizacoes (
  id           uuid primary key default gen_random_uuid(),
  iniciado_em  timestamptz not null default now(),
  origem       text not null check (origem in ('cron', 'manual', 'carga')),
  usuario_id   uuid,
  resumo       jsonb,
  erro         text
);

create index if not exists neo_sincronizacoes_iniciado_em_idx
  on public.neo_sincronizacoes (iniciado_em desc);

comment on table public.neo_sincronizacoes is
  'Tentativas de sincronização com a NEO: resumo (contagens) ou erro. Sem dados pessoais.';

-- -----------------------------------------------------------------------------
-- 5. RLS e grants das duas tabelas: leitura do operador, nenhuma escrita direta
-- -----------------------------------------------------------------------------

alter table public.supervisor_apelidos enable row level security;
alter table public.neo_sincronizacoes enable row level security;

drop policy if exists supervisor_apelidos_leitura on public.supervisor_apelidos;
create policy supervisor_apelidos_leitura on public.supervisor_apelidos
  for select to authenticated
  using (public.fn_e_operador());

drop policy if exists neo_sincronizacoes_leitura on public.neo_sincronizacoes;
create policy neo_sincronizacoes_leitura on public.neo_sincronizacoes
  for select to authenticated
  using (public.fn_e_operador());

revoke all on table public.supervisor_apelidos from public, anon, authenticated;
revoke all on table public.neo_sincronizacoes from public, anon, authenticated;
grant select on table public.supervisor_apelidos to authenticated;
grant select on table public.neo_sincronizacoes to authenticated;

-- -----------------------------------------------------------------------------
-- 6. fn_vincular_apelido_supervisor
--
-- Só QSMS e admin (fn_e_qsms). Grava o texto normalizado; vincular de novo o
-- mesmo texto troca o supervisor (corrigir um vínculo errado não exige apagar).
-- -----------------------------------------------------------------------------

create or replace function public.fn_vincular_apelido_supervisor(
  p_texto         text,
  p_supervisor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := public.fn_normalizar_texto(p_texto);
begin
  if not public.fn_e_qsms() then
    raise exception 'Apenas QSMS ou administrador pode vincular nomes de supervisor.'
      using errcode = '42501';
  end if;

  if v_texto is null then
    raise exception 'Informe o nome do supervisor como aparece na NEO (o texto está vazio).'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.supervisores where id = p_supervisor_id) then
    raise exception 'Supervisor não encontrado.'
      using errcode = '22023';
  end if;

  insert into public.supervisor_apelidos (texto_normalizado, supervisor_id, criado_por)
  values (v_texto, p_supervisor_id, auth.uid())
  on conflict (texto_normalizado) do update
    set supervisor_id = excluded.supervisor_id,
        criado_por    = excluded.criado_por,
        criado_em     = now();
end;
$$;

revoke all on function public.fn_vincular_apelido_supervisor(text, uuid) from public, anon;
grant execute on function public.fn_vincular_apelido_supervisor(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. fn_registrar_falha_neo
--
-- Grava uma tentativa que falhou (NEO fora do ar, segredo errado, resposta
-- incompleta...). Quem chama é o servidor do GIRO: com a sessão de um operador
-- (botão "Atualizar agora") ou com a service role (cron, auth.uid() nulo). O
-- grant execute só vai para authenticated e service_role; anon e public ficam de
-- fora. A mensagem é cortada em 500 caracteres.
-- -----------------------------------------------------------------------------

create or replace function public.fn_registrar_falha_neo(
  p_origem text,
  p_erro   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.fn_e_operador() then
    raise exception 'Apenas operadores podem registrar falhas da sincronização.'
      using errcode = '42501';
  end if;

  insert into public.neo_sincronizacoes (origem, usuario_id, erro)
  values (p_origem, auth.uid(), left(coalesce(p_erro, 'Falha sem detalhe.'), 500));
end;
$$;

revoke all on function public.fn_registrar_falha_neo(text, text) from public, anon;
grant execute on function public.fn_registrar_falha_neo(text, text) to authenticated, service_role;
