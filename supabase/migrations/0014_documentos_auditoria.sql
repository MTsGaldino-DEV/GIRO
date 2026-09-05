-- =============================================================================
-- GIRO — 0014 · Documentos do colaborador e auditoria de cadastro
--
-- Duas lacunas que o Perfil do Colaborador expõe:
--
-- 1. O sistema só guarda um documento: o PDF do ASO, preso a `eventos_requisito`
--    (coluna `documento_url`). Não há onde pôr avaliação psicológica, RG,
--    certificado de NR-10 — nada que não seja um ciclo de ASO concluído. Isso é
--    o bastante enquanto ASO é o único requisito, e deixa de ser no momento em
--    que alguém precisa anexar qualquer outra coisa.
--
-- 2. `historico_item` audita a máquina de estados do ASO, e só ela. Trocar o
--    supervisor de um colaborador não deixa rastro nenhum hoje — a linha muda e
--    ninguém sabe quem mudou, quando, nem qual era o valor anterior.
--
-- Esta migration NÃO toca em itens_pendencia, historico_item, eventos_requisito
-- nem em nenhuma das funções da máquina de estados. É aditiva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Documentos do colaborador
--
-- Deliberadamente separado de `eventos_requisito`: aquilo é o registro de um
-- exame realizado, com resultado e vencimento que alimentam o semáforo. Isto é
-- um arquivo com metadados. Misturar os dois faria todo anexo de RG virar um
-- evento de conformidade e mexer no cálculo de status.
--
-- Guarda o CAMINHO no bucket, nunca a URL — mesma decisão de 0008 e do ASO:
-- URL assinada expira, e gravar uma no banco cria registro que apodrece.
-- -----------------------------------------------------------------------------
create table if not exists public.documentos_colaborador (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  nome_arquivo    text not null,
  tipo            text not null,
  storage_path    text not null,
  tamanho_bytes   integer,
  mime_type       text,
  data_documento  date,
  data_validade   date,
  descricao       text,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references auth.users(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  constraint documento_validade_coerente
    check (data_validade is null or data_documento is null or data_validade >= data_documento)
);

create index if not exists idx_documentos_colaborador
  on public.documentos_colaborador(colaborador_id, criado_em desc);

-- Validade a vencer, para quando existir alerta de documento (fora do escopo
-- desta entrega, mas o índice é barato e evita um ALTER depois).
create index if not exists idx_documentos_validade
  on public.documentos_colaborador(data_validade)
  where data_validade is not null;

comment on table public.documentos_colaborador is
  'Anexos do colaborador que não são o PDF do ASO. O ASO continua em eventos_requisito.documento_url.';
comment on column public.documentos_colaborador.tipo is
  'Texto livre com sugestões na interface. Vira catálogo quando o motor de requisitos existir (fora da V1).';
comment on column public.documentos_colaborador.storage_path is
  'Caminho no bucket privado `documentos`. Nunca URL — assinatura é feita na leitura.';

-- -----------------------------------------------------------------------------
-- Auditoria de cadastro e documentos
--
-- Uma linha por campo alterado, não uma por formulário salvo. "Cadastro
-- atualizado" não responde nada; "João mudou o supervisor de Carlos para Maria"
-- responde. O custo é várias linhas por submissão, o que é irrelevante no
-- volume desta operação.
--
-- `entidade` + `entidade_id` deixam a tabela servir documento e colaborador com
-- o mesmo formato, sem uma coluna nula para cada caso.
-- -----------------------------------------------------------------------------
create table if not exists public.auditoria_colaborador (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  usuario_id      uuid references auth.users(id) on delete set null,
  acao            text not null
                  check (acao in ('criou','alterou','removeu','anexou')),
  entidade        text not null
                  check (entidade in ('colaborador','documento','foto')),
  entidade_id     uuid,
  campo           text,
  valor_anterior  text,
  valor_novo      text,
  -- De onde partiu a ação. Serve para distinguir uma edição feita no painel
  -- flutuante de uma feita na tela cheia, sem inventar tabela de sessão.
  origem          text,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_auditoria_colaborador
  on public.auditoria_colaborador(colaborador_id, criado_em desc);

comment on table public.auditoria_colaborador is
  'Auditoria de cadastro/documentos. A máquina de estados do ASO continua em historico_item — não duplicar aqui.';

-- =============================================================================
-- RLS
--
-- Mesmo desenho das tabelas existentes: QSMS/admin fazem tudo, supervisor lê
-- apenas a própria equipe. `fn_e_qsms()` já cobre admin desde 0007.
-- =============================================================================

alter table public.documentos_colaborador enable row level security;
alter table public.auditoria_colaborador  enable row level security;

drop policy if exists documentos_leitura on public.documentos_colaborador;
create policy documentos_leitura on public.documentos_colaborador
  for select to authenticated
  using (public.fn_e_qsms() or public.fn_minha_equipe(colaborador_id));

drop policy if exists documentos_escrita_qsms on public.documentos_colaborador;
create policy documentos_escrita_qsms on public.documentos_colaborador
  for all to authenticated
  using (public.fn_e_qsms()) with check (public.fn_e_qsms());

drop policy if exists auditoria_leitura on public.auditoria_colaborador;
create policy auditoria_leitura on public.auditoria_colaborador
  for select to authenticated
  using (public.fn_e_qsms() or public.fn_minha_equipe(colaborador_id));

-- Sem política de INSERT: quem grava é fn_registrar_auditoria, SECURITY DEFINER.
-- Deixar o cliente inserir direto permitiria forjar autor e valor anterior, que
-- é exatamente o que uma trilha de auditoria não pode aceitar.

-- =============================================================================
-- Storage · bucket privado dos documentos
--
-- Separado de `asos` porque as políticas são diferentes: `asos` é só QSMS na
-- leitura; aqui o supervisor precisa enxergar o documento da própria equipe.
-- 8 MB, mesmos formatos do ASO mais os de escritório.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 8388608,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A leitura é aberta a qualquer autenticado no nível do Storage, e filtrada de
-- fato pela tabela: sem a linha em documentos_colaborador (que é filtrada por
-- RLS) ninguém descobre o caminho para pedir a assinatura. Mesmo desenho já
-- usado no bucket `fotos` em 0008.
drop policy if exists documentos_leitura_storage on storage.objects;
create policy documentos_leitura_storage on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos');

drop policy if exists documentos_escrita_qsms_storage on storage.objects;
create policy documentos_escrita_qsms_storage on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.fn_e_qsms());

drop policy if exists documentos_update_qsms_storage on storage.objects;
create policy documentos_update_qsms_storage on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and public.fn_e_qsms());

drop policy if exists documentos_delete_qsms_storage on storage.objects;
create policy documentos_delete_qsms_storage on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.fn_e_qsms());

-- =============================================================================
-- Gravação da auditoria
--
-- SECURITY DEFINER: a tabela não tem política de INSERT de propósito. Toda
-- escrita passa por aqui, que carimba auth.uid() como autor — o cliente não
-- escolhe quem assinou a alteração.
-- =============================================================================

create or replace function public.fn_registrar_auditoria(
  p_colaborador_id  uuid,
  p_acao            text,
  p_entidade        text,
  p_entidade_id     uuid    default null,
  p_campo           text    default null,
  p_valor_anterior  text    default null,
  p_valor_novo      text    default null,
  p_origem          text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Mesma barreira das outras escritas: quem não pode editar o colaborador não
  -- pode escrever na trilha dele.
  if not public.fn_e_qsms() then
    raise exception 'Sem permissão para registrar auditoria deste colaborador.';
  end if;

  insert into public.auditoria_colaborador (
    colaborador_id, usuario_id, acao, entidade, entidade_id,
    campo, valor_anterior, valor_novo, origem
  )
  values (
    p_colaborador_id, auth.uid(), p_acao, p_entidade, p_entidade_id,
    p_campo, p_valor_anterior, p_valor_novo, p_origem
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.fn_registrar_auditoria(uuid, text, text, uuid, text, text, text, text) from public;
grant execute on function public.fn_registrar_auditoria(uuid, text, text, uuid, text, text, text, text) to authenticated;

-- =============================================================================
-- Histórico unificado do colaborador
--
-- Junta as duas trilhas numa linha do tempo só: a da máquina de estados
-- (historico_item, intocada) e a de cadastro/documentos (auditoria_colaborador).
--
-- `fonte` distingue a origem para a interface saber qual formato desenhar —
-- transição de etapa lê "Agendado → Enviado à clínica", alteração de campo lê
-- "supervisor: Carlos → Maria". São duas frases diferentes.
--
-- SECURITY DEFINER pelo mesmo motivo de fn_historico_do_colaborador (0009):
-- resolver o nome do autor exigiria abrir `perfis` para leitura direta.
-- =============================================================================

drop function if exists public.fn_linha_do_tempo_colaborador(uuid, integer, integer);

create or replace function public.fn_linha_do_tempo_colaborador(
  p_colaborador_id uuid,
  p_limite         integer default 50,
  p_deslocamento   integer default 0
)
returns table (
  id             uuid,
  fonte          text,
  criado_em      timestamptz,
  autor_nome     text,
  acao           text,
  entidade       text,
  campo          text,
  valor_anterior text,
  valor_novo     text,
  etapa_de       text,
  etapa_para     text,
  observacao     text,
  em_nome_de     text
)
language sql
stable
security definer
set search_path = public
as $$
  with permitido as (
    select public.fn_e_qsms() or public.fn_minha_equipe(p_colaborador_id) as pode
  ),
  aso as (
    select
      h.id,
      'aso'::text                                   as fonte,
      h.criado_em,
      coalesce(p.nome, p.email, 'Sistema')          as autor_nome,
      null::text                                    as acao,
      null::text                                    as entidade,
      null::text                                    as campo,
      null::text                                    as valor_anterior,
      null::text                                    as valor_novo,
      h.etapa_de,
      h.etapa_para,
      h.observacao,
      h.em_nome_de
    from public.historico_item h
    join public.itens_pendencia i on i.id = h.item_id
    left join public.perfis p on p.id = h.autor
    where i.colaborador_id = p_colaborador_id
  ),
  cadastro as (
    select
      a.id,
      'cadastro'::text                              as fonte,
      a.criado_em,
      coalesce(p.nome, p.email, 'Sistema')          as autor_nome,
      a.acao,
      a.entidade,
      a.campo,
      a.valor_anterior,
      a.valor_novo,
      null::text                                    as etapa_de,
      null::text                                    as etapa_para,
      a.origem                                      as observacao,
      null::text                                    as em_nome_de
    from public.auditoria_colaborador a
    left join public.perfis p on p.id = a.usuario_id
    where a.colaborador_id = p_colaborador_id
  )
  select u.*
    from (select * from aso union all select * from cadastro) u
   cross join permitido
   where permitido.pode
   order by u.criado_em desc
   limit greatest(1, least(p_limite, 200))
  offset greatest(0, p_deslocamento);
$$;

revoke all on function public.fn_linha_do_tempo_colaborador(uuid, integer, integer) from public;
grant execute on function public.fn_linha_do_tempo_colaborador(uuid, integer, integer) to authenticated;

-- =============================================================================
-- Documentos com o nome de quem anexou
--
-- A tabela guarda `criado_por` como uuid de auth.users; a interface precisa do
-- nome. Resolver isso no cliente exigiria abrir `perfis` — a view faz o join
-- uma vez, sob security_invoker, então a RLS de documentos_colaborador continua
-- valendo para quem consulta.
-- =============================================================================

create or replace view public.vw_documentos_colaborador
with (security_invoker = true) as
select
  d.id,
  d.colaborador_id,
  d.nome_arquivo,
  d.tipo,
  d.storage_path,
  d.tamanho_bytes,
  d.mime_type,
  d.data_documento,
  d.data_validade,
  d.descricao,
  d.criado_em,
  d.criado_por,
  coalesce(autor.nome, autor.email, 'Sistema') as criado_por_nome,
  (d.data_validade is not null and d.data_validade < public.hoje()) as vencido
from public.documentos_colaborador d
left join public.perfis autor on autor.id = d.criado_por;

grant select on public.vw_documentos_colaborador to authenticated;
