-- =============================================================================
-- GIRO — 0001 · Schema base
--
-- Modelo genérico por design: tudo passa por `tipos_requisito`. O MVP popula
-- uma única linha (ASO Periódico, 12 meses). Acrescentar NR-35 depois é um
-- INSERT, nunca uma migração de schema.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Fuso horário
--
-- O Postgres do Supabase roda em UTC. Às 21h em Governador Valadares já é o dia
-- seguinte em UTC, e "dias restantes até o vencimento" sairia com um dia a mais
-- durante três horas por noite. Toda data de negócio passa por aqui.
-- -----------------------------------------------------------------------------
create or replace function public.hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- -----------------------------------------------------------------------------
-- Supervisores de campo
-- -----------------------------------------------------------------------------
create table if not exists public.supervisores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text not null unique,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Colaboradores
-- -----------------------------------------------------------------------------
create table if not exists public.colaboradores (
  id              uuid primary key default gen_random_uuid(),
  matricula       integer not null unique,
  nome            text not null,
  cpf             text,
  cargo           text,
  uen             text,
  local           text,
  polo            text,
  data_admissao   date,
  data_nascimento date,
  situacao        text not null default 'trabalhando'
                  check (situacao in ('trabalhando','ferias','auxilio_doenca','atestado','afastamento','outro')),
  supervisor_id   uuid references public.supervisores(id) on delete set null,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_colaboradores_supervisor on public.colaboradores(supervisor_id);
create index if not exists idx_colaboradores_ativo      on public.colaboradores(ativo) where ativo;

-- Qualquer situação diferente de 'trabalhando' bloqueia agendamento.
comment on column public.colaboradores.situacao is
  'Normalizada na importação. Qualquer valor diferente de trabalhando bloqueia agendamento.';

-- -----------------------------------------------------------------------------
-- Catálogo de requisitos
-- -----------------------------------------------------------------------------
create table if not exists public.tipos_requisito (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null unique,
  periodicidade_meses  integer not null check (periodicidade_meses > 0),
  exige_jejum          boolean not null default false,
  exige_documento      boolean not null default true,
  ativo                boolean not null default true
);

-- -----------------------------------------------------------------------------
-- Perfis de acesso — liga auth.users a um papel
-- -----------------------------------------------------------------------------
create table if not exists public.perfis (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  nome           text,
  papel          text not null check (papel in ('qsms','supervisor')),
  supervisor_id  uuid references public.supervisores(id) on delete set null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  -- Perfil de supervisor sem vínculo não enxerga equipe nenhuma: barrar na origem.
  constraint perfil_supervisor_precisa_vinculo
    check (papel <> 'supervisor' or supervisor_id is not null)
);

-- -----------------------------------------------------------------------------
-- Ausências que bloqueiam agendamento
-- -----------------------------------------------------------------------------
create table if not exists public.ausencias (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  tipo            text not null check (tipo in ('ferias','atestado','afastamento')),
  data_inicio     date not null,
  data_fim        date,
  criado_em       timestamptz not null default now(),
  constraint ausencia_intervalo_valido check (data_fim is null or data_fim >= data_inicio)
);

create index if not exists idx_ausencias_colaborador on public.ausencias(colaborador_id, data_inicio);

-- -----------------------------------------------------------------------------
-- Eventos concluídos — o histórico do que foi efetivamente realizado.
-- É a data_documento com resultado apto que define o próximo vencimento.
-- -----------------------------------------------------------------------------
create table if not exists public.eventos_requisito (
  id                 uuid primary key default gen_random_uuid(),
  colaborador_id     uuid not null references public.colaboradores(id) on delete cascade,
  tipo_requisito_id  uuid not null references public.tipos_requisito(id),
  data_realizado     date,
  data_documento     date not null,
  resultado          text not null default 'apto'
                     check (resultado in ('apto','inapto','apto_com_restricao')),
  clinica            text,
  medico             text,
  documento_url      text,
  observacoes        text,
  -- Seed da carga inicial: data inferida a partir de "Prox. Exame − 12 meses".
  -- É inferência, não dado da clínica. Ver pendência P3 do plano.
  estimado           boolean not null default false,
  registrado_por     uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now()
);

create index if not exists idx_eventos_colaborador
  on public.eventos_requisito(colaborador_id, tipo_requisito_id, data_documento desc);

-- -----------------------------------------------------------------------------
-- Itens de pendência — a tarefa, com dono e prazo
-- -----------------------------------------------------------------------------
create table if not exists public.itens_pendencia (
  id                       uuid primary key default gen_random_uuid(),
  colaborador_id           uuid not null references public.colaboradores(id) on delete cascade,
  tipo_requisito_id        uuid not null references public.tipos_requisito(id),
  data_vencimento          date not null,
  etapa                    text not null default 'previsto'
                           check (etapa in ('previsto','data_proposta','agendado','aguardando_documento','concluido')),
  data_liberacao_proposta  date,
  clinica                  text,
  endereco                 text,
  medico                   text,
  data_agendada            date,
  hora_agendada            time,
  compareceu               boolean,
  -- P5: informativo, sem regra automática. Quem precisa de avaliação
  -- psicossocial ainda não foi definido (cargo? NR? idade?).
  avaliacao_psicossocial   boolean not null default false,
  comunicado_cemig_em      date,
  evento_id                uuid references public.eventos_requisito(id) on delete set null,
  sla_vence_em             timestamptz,
  etapa_desde              timestamptz not null default now(),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

-- Um único ciclo aberto por colaborador × requisito.
--
-- Deliberadamente sem data_vencimento na chave: os colaboradores sem registro
-- entram com data_vencimento = hoje(), e uma chave que incluísse a data faria
-- o cron diário criar um item novo para cada um deles todo dia.
create unique index if not exists uq_item_aberto
  on public.itens_pendencia(colaborador_id, tipo_requisito_id)
  where etapa <> 'concluido';

create index if not exists idx_itens_etapa       on public.itens_pendencia(etapa);
create index if not exists idx_itens_vencimento  on public.itens_pendencia(data_vencimento);
create index if not exists idx_itens_colaborador on public.itens_pendencia(colaborador_id);

-- -----------------------------------------------------------------------------
-- Auditoria de transição
-- -----------------------------------------------------------------------------
create table if not exists public.historico_item (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.itens_pendencia(id) on delete cascade,
  etapa_de    text,
  etapa_para  text not null,
  autor       uuid references auth.users(id) on delete set null,
  observacao  text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_historico_item on public.historico_item(item_id, criado_em desc);

-- -----------------------------------------------------------------------------
-- Deduplicação de notificações
-- -----------------------------------------------------------------------------
create table if not exists public.alertas_enviados (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid references public.itens_pendencia(id) on delete cascade,
  supervisor_id  uuid references public.supervisores(id) on delete cascade,
  tipo_alerta    text not null check (tipo_alerta in ('semanal','sla_estourado','critico')),
  referencia     text not null,
  enviado_em     timestamptz not null default now()
);

-- O e-mail semanal é por supervisor, não por item: item_id fica nulo e a
-- deduplicação recai sobre (supervisor, tipo, semana). Índice único parcial
-- porque UNIQUE comum não deduplica linhas com NULL.
create unique index if not exists uq_alerta_por_item
  on public.alertas_enviados(item_id, tipo_alerta, referencia)
  where item_id is not null;

create unique index if not exists uq_alerta_por_supervisor
  on public.alertas_enviados(supervisor_id, tipo_alerta, referencia)
  where item_id is null;

-- -----------------------------------------------------------------------------
-- atualizado_em automático
-- -----------------------------------------------------------------------------
create or replace function public.fn_touch_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_colaboradores on public.colaboradores;
create trigger trg_touch_colaboradores
  before update on public.colaboradores
  for each row execute function public.fn_touch_atualizado_em();

drop trigger if exists trg_touch_itens on public.itens_pendencia;
create trigger trg_touch_itens
  before update on public.itens_pendencia
  for each row execute function public.fn_touch_atualizado_em();
