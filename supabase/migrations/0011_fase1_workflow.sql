-- =============================================================================
-- GIRO — 0011 · Fase 1 · Camada de workflow do QSMS
--
-- Implementa `plano_acao_fase.md` sobre o schema que já existe, em vez de criar
-- tabelas paralelas. O mapeamento nome-do-plano -> nome-do-projeto:
--
--   processos            -> itens_pendencia
--   movimentacoes        -> historico_item
--   vigencias_requisito  -> eventos_requisito + vw_status_colaborador
--   profiles             -> perfis
--   documentos           -> eventos_requisito.documento_url (bucket 'asos')
--
-- O plano autoriza a adaptação ("Nomes sugeridos; ajustar ao padrão já usado no
-- projeto", seção 5). Duplicar o modelo custaria duas fontes de verdade para a
-- mesma pergunta — que é justamente o problema que o GIRO existe para eliminar.
--
-- O `cross join` de 0003 continua intocado (seção 2 do plano).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clínicas (plano, seção 5)
--
-- A cidade importa: houve pedido de agendar em Aimorés, e mandar quem trabalha
-- em Aimorés para uma clínica de Valadares é uma diária de viagem que ninguém
-- orçou. O campo texto `itens_pendencia.clinica` continua existindo e passa a
-- ser preenchido a partir daqui — item antigo não perde o nome que já tinha.
-- -----------------------------------------------------------------------------
create table if not exists public.clinicas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  cidade    text,
  contato   text,
  endereco  text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.clinicas enable row level security;

drop policy if exists clinicas_leitura on public.clinicas;
create policy clinicas_leitura on public.clinicas
  for select to authenticated using (true);

drop policy if exists clinicas_escrita_qsms on public.clinicas;
create policy clinicas_escrita_qsms on public.clinicas
  for all to authenticated using (public.fn_e_qsms()) with check (public.fn_e_qsms());

insert into public.clinicas (nome, cidade, ativo)
values ('ENGESEG', 'Governador Valadares', true)
on conflict (nome) do nothing;

-- -----------------------------------------------------------------------------
-- Requisito opcional por colaborador (AVP)
--
-- [PENDENTE] A lista de quem exige avaliação psicossocial não existe (plano,
-- seção 8). Default seguro: `exige_avp = false`. O tipo entra no catálogo já
-- com a periodicidade certa, mas marcado `opcional` — sem isso o cross join
-- abriria uma pendência de AVP para os 261 colaboradores no mesmo instante, e
-- 261 linhas pretas inventadas afogam as que são de verdade.
-- -----------------------------------------------------------------------------
alter table public.tipos_requisito
  add column if not exists opcional boolean not null default false;

comment on column public.tipos_requisito.opcional is
  'Requisito que só vale para quem estiver explicitamente marcado (colaboradores.exige_avp).';

alter table public.colaboradores
  add column if not exists exige_avp boolean not null default false;

insert into public.tipos_requisito
  (nome, periodicidade_meses, exige_jejum, exige_documento, ativo, opcional)
values
  ('Avaliação Psicossocial (AVP)', 24, false, true, true, true)
on conflict (nome) do update
  set periodicidade_meses = excluded.periodicidade_meses,
      opcional            = excluded.opcional;

-- -----------------------------------------------------------------------------
-- Novas colunas do processo
-- -----------------------------------------------------------------------------
alter table public.itens_pendencia
  add column if not exists clinica_id uuid references public.clinicas(id) on delete set null,
  add column if not exists dados_informados_em timestamptz,
  add column if not exists desfecho text;

alter table public.itens_pendencia drop constraint if exists itens_pendencia_desfecho_check;
alter table public.itens_pendencia add constraint itens_pendencia_desfecho_check
  check (desfecho is null or desfecho in
         ('fez_apto','fez_inapto','faltou','incompleto','retorno_necessario'));

comment on column public.itens_pendencia.dados_informados_em is
  'Passo 5 do plano: quando o QSMS repassou clínica, horário e orientações ao supervisor.';

-- Data limite para marcar: vencimento − 7 dias (plano, seção 7). Coluna gerada
-- porque é derivação pura — guardar uma cópia editável convidaria as duas a
-- discordarem.
alter table public.itens_pendencia
  add column if not exists data_limite_marcar date
    generated always as (data_vencimento - 7) stored;

-- Auditoria em nome de terceiro (plano, seção 5).
--
-- Na Fase 1 o supervisor não tem login: o QSMS registra a data que ele propôs.
-- `autor` continua sendo o usuário real; `em_nome_de` diz por quem ele falou.
-- Sem essa separação a auditoria mente — registra o QSMS como se ele tivesse
-- decidido a data.
alter table public.historico_item
  add column if not exists em_nome_de text;

-- -----------------------------------------------------------------------------
-- Estados novos (plano, seção 6.2)
--
-- `previsto` e `concluido` permanecem: são os nomes que o plano chama de
-- "pendente" e "finalizado". Renomear estado em uso trocaria o vocabulário de
-- todas as telas por zero ganho de comportamento.
-- -----------------------------------------------------------------------------
alter table public.itens_pendencia drop constraint if exists itens_pendencia_etapa_check;
alter table public.itens_pendencia add constraint itens_pendencia_etapa_check
  check (etapa in (
    'previsto',              -- = "pendente" do plano
    'data_solicitada',
    'data_proposta',
    'agendado',
    'enviado_clinica',
    'aguardando_documento',
    'concluido',             -- = "finalizado" do plano
    'inapto_em_tratativa',
    'cancelado'
  ));

-- Item cancelado não é ciclo aberto: precisa liberar a chave para um novo.
-- Inapto em tratativa continua ocupando — é exatamente a trava do plano 6.4.
drop index if exists public.uq_item_aberto;
create unique index uq_item_aberto
  on public.itens_pendencia(colaborador_id, tipo_requisito_id)
  where etapa not in ('concluido','cancelado');

-- -----------------------------------------------------------------------------
-- SLA das etapas novas
-- -----------------------------------------------------------------------------
create or replace function public.fn_sla_da_etapa(
  p_etapa          text,
  p_data_agendada  date
)
returns timestamptz
language sql
immutable
as $fn$
  select case p_etapa
    when 'previsto'              then now() + interval '7 days'
    when 'data_solicitada'       then now() + interval '7 days'
    when 'data_proposta'         then now() + interval '3 days'
    when 'agendado'              then case
                                        when p_data_agendada is null then now() + interval '3 days'
                                        else (p_data_agendada + 1)::timestamp at time zone 'America/Sao_Paulo'
                                      end
    -- Enviado à clínica: o desfecho acontece no mesmo dia. Um dia de folga para
    -- o QSMS registrar o que aconteceu.
    when 'enviado_clinica'       then case
                                        when p_data_agendada is null then now() + interval '1 day'
                                        else (p_data_agendada + 2)::timestamp at time zone 'America/Sao_Paulo'
                                      end
    when 'aguardando_documento'  then now() + interval '5 days'
    -- Tratativa clínica não tem prazo operacional. O que mantém o caso visível
    -- é o semáforo do colaborador, que segue vermelho ou preto.
    when 'inapto_em_tratativa'   then null
    when 'concluido'             then null
    when 'cancelado'             then null
  end;
$fn$;

-- -----------------------------------------------------------------------------
-- Transições permitidas (plano, seções 6.2 e 6.3)
--
-- As transições de 0002 continuam válidas: o painel do supervisor já em uso
-- depende delas, e o plano manda não refazer o que existe.
-- -----------------------------------------------------------------------------
create or replace function public.fn_transicao_valida(p_de text, p_para text)
returns boolean
language sql
immutable
as $fn$
  select (p_de, p_para) in (
    -- fluxo original (0002 / 0006)
    ('previsto',             'data_proposta'),
    ('data_proposta',        'agendado'),
    ('agendado',             'aguardando_documento'),
    ('agendado',             'previsto'),
    ('data_proposta',        'previsto'),
    ('aguardando_documento', 'concluido'),

    -- passo 2: QSMS solicita a data ao supervisor
    ('previsto',             'data_solicitada'),
    ('data_solicitada',      'data_proposta'),

    -- passo 4: clínica indisponível devolve o ciclo ao supervisor
    ('data_proposta',        'data_solicitada'),

    -- passo 6: colaborador enviado à clínica
    ('agendado',             'enviado_clinica'),

    -- passo 7: os cinco desfechos
    ('enviado_clinica',      'aguardando_documento'),   -- fez e apto
    ('enviado_clinica',      'inapto_em_tratativa'),    -- fez e inapto
    ('enviado_clinica',      'data_solicitada'),        -- faltou / incompleto / retorno
    ('agendado',             'data_solicitada'),        -- faltou, registrado pelo supervisor

    -- inapto descoberto só na leitura do documento
    ('aguardando_documento', 'inapto_em_tratativa'),

    -- 6.4: a única saída do inapto é resolução explícita, e ela encerra o item
    ('inapto_em_tratativa',  'cancelado'),

    -- cancelamento administrativo
    ('previsto',             'cancelado'),
    ('data_solicitada',      'cancelado'),
    ('data_proposta',        'cancelado'),
    ('agendado',             'cancelado'),
    ('enviado_clinica',      'cancelado'),
    ('aguardando_documento', 'cancelado')
  );
$fn$;

-- -----------------------------------------------------------------------------
-- Histórico: grava também em nome de quem se agiu
-- -----------------------------------------------------------------------------
create or replace function public.fn_item_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_obs  text := nullif(current_setting('giro.observacao', true), '');
  v_nome text := nullif(current_setting('giro.em_nome_de', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.historico_item (item_id, etapa_de, etapa_para, autor, observacao, em_nome_de)
    values (new.id, null, new.etapa, auth.uid(), v_obs, v_nome);
    return new;
  end if;

  if new.etapa is distinct from old.etapa then
    insert into public.historico_item (item_id, etapa_de, etapa_para, autor, observacao, em_nome_de)
    values (new.id, old.etapa, new.etapa, auth.uid(), v_obs, v_nome);
  end if;

  return new;
end;
$fn$;

-- Coluna nova no retorno: `create or replace` não muda assinatura de função
-- que devolve tabela, então precisa cair antes.
drop function if exists public.fn_historico_do_item(uuid);

create or replace function public.fn_historico_do_item(p_item_id uuid)
returns table (
  id          uuid,
  etapa_de    text,
  etapa_para  text,
  autor_nome  text,
  em_nome_de  text,
  observacao  text,
  criado_em   timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    h.id,
    h.etapa_de,
    h.etapa_para,
    coalesce(p.nome, p.email, 'Sistema') as autor_nome,
    h.em_nome_de,
    h.observacao,
    h.criado_em
  from public.historico_item h
  left join public.perfis p on p.id = h.autor
  where h.item_id = p_item_id
    and exists (
      select 1 from public.itens_pendencia i
       where i.id = p_item_id
         and (public.fn_e_qsms() or public.fn_minha_equipe(i.colaborador_id))
    )
  order by h.criado_em asc;
$fn$;

revoke all on function public.fn_historico_do_item(uuid) from public;
grant execute on function public.fn_historico_do_item(uuid) to authenticated;
