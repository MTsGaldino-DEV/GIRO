# Plano de MVP — Controle de ASO (UEN 211)

> Documento de especificação para implementação. Escrito para ser lido por um agente de código.
> Onde houver `[PENDENTE]`, **não invente a regra** — implemente o comportamento padrão indicado e deixe um `TODO` no código.

---

## 1. Contexto

Empresa prestadora de serviços para a CEMIG (ENGELMIG). Dois setores compartilham a responsabilidade pelo ASO (Atestado de Saúde Ocupacional) dos colaboradores de campo:

- **QSMS** — controla os vencimentos, agenda com a clínica, cobra o documento após o exame e comunica a CEMIG.
- **Supervisão de Campo** — controla os colaboradores e decide quando cada um pode ser liberado da equipe para fazer o exame.

**O problema:** a comunicação entre os dois setores acontece por e-mail encadeado. E-mail não guarda estado — ninguém consegue responder "de quem é a responsabilidade agora e há quantos dias está parada". O QSMS reclama que os supervisores não programam com antecedência; a supervisão reclama que a informação chega em cima da hora ou se perde entre respostas de e-mail.

**A consequência:** ASO vencido impede o colaborador de trabalhar. Uma equipe pode parar um dia inteiro. Também gera bloqueio de faturas e multa no eSocial.

**A solução:** um registro único e compartilhado onde cada ASO a vencer é uma **tarefa com dono e prazo**, criada automaticamente 60 dias antes do vencimento, que muda de dono conforme avança. O e-mail deixa de ser o registro e passa a ser apenas a notificação.

### Situação atual dos dados

- 261 colaboradores ativos na UEN 211 (todos em "Multifuncional Gov. Valadares").
- Apenas 84 têm data de próximo exame conhecida.
- **177 colaboradores não têm nenhuma data de referência.** Não é possível distinguir "vence daqui a muito tempo" de "nunca fez". Esse é o maior ponto cego e é o alvo da Fase 0.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Banco + Auth + Storage | Supabase (Postgres) |
| Hospedagem | Vercel |
| Jobs agendados | Vercel Cron |
| E-mail transacional | Resend |
| Versionamento | GitHub |
| UI | Tailwind CSS |

**Autenticação:** Supabase Auth com **magic link** (login por e-mail, sem senha). Supervisores de campo não vão gerenciar senha — se houver senha, eles abandonam o sistema.

**Storage:** bucket privado no Supabase para os PDFs dos ASOs.

---

## 3. Escopo

### Dentro do MVP

- Apenas **ASO Periódico**, periodicidade de 12 meses
- Apenas UEN 211
- Vínculo colaborador → supervisor
- Semáforo de status por dias até o vencimento
- Painel do supervisor (só a equipe dele) e painel do QSMS (visão completa)
- Ciclo de vida da pendência com dono e SLA por etapa
- Registro de comparecimento (supervisor) separado do registro de aptidão (QSMS)
- Upload do documento do ASO
- E-mail semanal automático, individual por supervisor
- Geração automática do item 60 dias antes do vencimento
- Auditoria: quem registrou o quê e quando

### Fora do MVP (mas o schema deve permitir)

- Treinamentos e NRs (NR-10, NR-33, NR-35, brigada) — as periodicidades ainda não foram levantadas
- ASO Admissional, Demissional, Retorno ao Trabalho, Mudança de Risco
- Notificação por WhatsApp
- Gestão de capacidade da clínica e agenda visual
- Integração com eSocial
- Módulo de férias (o sistema apenas lê a situação, não a gerencia)

**Importante:** o modelo de dados nasce genérico via tabela `tipos_requisito`. O MVP popula **uma única linha** (`ASO Periódico`, 12 meses). Adicionar NR-35 depois deve ser um `INSERT`, nunca uma migração de schema.

---

## 4. Modelo de dados

```sql
-- Supervisores de campo
create table supervisores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Colaboradores
create table colaboradores (
  id uuid primary key default gen_random_uuid(),
  matricula integer not null unique,
  nome text not null,
  cpf text,
  cargo text,
  uen text,
  local text,
  polo text,                                  -- ex: 'Gov. Valadares', 'Aimorés'
  data_admissao date,
  data_nascimento date,
  situacao text not null default 'trabalhando',  -- ver enum lógico abaixo
  supervisor_id uuid references supervisores(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Catálogo de requisitos. MVP popula apenas 'ASO Periódico'.
create table tipos_requisito (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  periodicidade_meses integer not null,
  exige_jejum boolean not null default false,
  exige_documento boolean not null default true,
  ativo boolean not null default true
);

-- Ausências que bloqueiam agendamento (férias, atestado, afastamento)
create table ausencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  tipo text not null,                          -- 'ferias' | 'atestado' | 'afastamento'
  data_inicio date not null,
  data_fim date,
  criado_em timestamptz not null default now()
);

-- Eventos concluídos: o histórico do que foi efetivamente realizado.
-- É a data_documento (resultado apto) que define o próximo vencimento.
create table eventos_requisito (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  tipo_requisito_id uuid not null references tipos_requisito(id),
  data_realizado date,                         -- data em que compareceu à clínica
  data_documento date not null,                -- data do ASO emitido -> base do cálculo
  resultado text not null default 'apto',      -- 'apto' | 'inapto' | 'apto_com_restricao'
  clinica text,
  medico text,
  documento_url text,
  observacoes text,
  registrado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

-- A tarefa/pendência: um ciclo de vida por vencimento futuro.
create table itens_pendencia (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  tipo_requisito_id uuid not null references tipos_requisito(id),
  data_vencimento date not null,
  etapa text not null default 'previsto',      -- ver máquina de estados
  data_liberacao_proposta date,                -- informada pelo supervisor
  clinica text,                                -- preenchido pelo QSMS
  endereco text,
  medico text,
  data_agendada date,
  hora_agendada time,
  compareceu boolean,                          -- marcado pelo supervisor
  comunicado_cemig_em date,
  evento_id uuid references eventos_requisito(id),
  sla_vence_em timestamptz,                    -- prazo da etapa atual
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Auditoria de transição de etapa
create table historico_item (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references itens_pendencia(id) on delete cascade,
  etapa_de text,
  etapa_para text not null,
  autor uuid references auth.users(id),
  observacao text,
  criado_em timestamptz not null default now()
);

-- Deduplicação de notificações
create table alertas_enviados (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references itens_pendencia(id) on delete cascade,
  supervisor_id uuid references supervisores(id),
  tipo_alerta text not null,                   -- 'semanal' | 'sla_estourado' | 'critico'
  referencia text not null,                    -- ex: '2026-W34' para dedup semanal
  enviado_em timestamptz not null default now(),
  unique (item_id, tipo_alerta, referencia)
);
```

### Valores de `situacao` (colaboradores)

Origem: coluna `SITUAÇÃO` da planilha de colaboradores. Normalizar na importação.

| Origem | Valor normalizado | Bloqueia agendamento? |
|---|---|---|
| `1-Trabalhando` | `trabalhando` | não |
| `2-Férias` | `ferias` | sim |
| `3-Auxílio Doença` | `auxilio_doenca` | sim |
| `14-Atestado por Doença` | `atestado` | sim |

Regra: **qualquer situação diferente de `trabalhando` bloqueia agendamento.**

---

## 5. Máquina de estados do item

| Etapa | Dono | Ação esperada | SLA |
|---|---|---|---|
| `previsto` | Supervisor | Informar a data em que libera o colaborador | 7 dias |
| `data_proposta` | QSMS | Agendar com a clínica (clínica, endereço, médico, data, hora) | 3 dias |
| `agendado` | Supervisor | Garantir comparecimento; marcar compareceu/faltou | até a data agendada |
| `aguardando_documento` | QSMS | Obter o ASO da clínica, registrar resultado e anexar | 5 dias |
| `concluido` | — | Gera automaticamente o próximo item, +12 meses da `data_documento` | — |

**Transições:**

- `previsto` → `data_proposta` (supervisor informa data)
- `data_proposta` → `agendado` (QSMS agenda)
- `agendado` → `aguardando_documento` (supervisor marca `compareceu = true`)
- `agendado` → `previsto` (supervisor marca `compareceu = false`; registrar no histórico como falta e sinalizar em vermelho)
- `aguardando_documento` → `concluido` (QSMS cria o `evento_requisito` com `data_documento` e resultado)

**Regras invioláveis:**

1. **Comparecimento não é conformidade.** O que zera a pendência é o documento com resultado `apto`. Se o resultado for `inapto`, o item vai para `concluido` mas o colaborador **permanece bloqueado** — sinalizar em preto no painel.
2. Toda transição grava linha em `historico_item` com autor e timestamp.
3. Ao entrar em qualquer etapa, recalcular `sla_vence_em` conforme a tabela acima.
4. `comunicado_cemig_em` é um campo opcional preenchido pelo QSMS após a conclusão. Não bloqueia o fluxo no MVP.

---

## 6. View de status

O coração do sistema. Precisa expor, para cada colaborador × tipo de requisito, o vencimento calculado e a categoria do semáforo — **incluindo quem nunca teve registro nenhum**.

```sql
create or replace view vw_status_colaborador as
with ultimo_evento as (
  select distinct on (e.colaborador_id, e.tipo_requisito_id)
    e.colaborador_id,
    e.tipo_requisito_id,
    e.data_documento,
    e.resultado
  from eventos_requisito e
  where e.resultado in ('apto', 'apto_com_restricao')
  order by e.colaborador_id, e.tipo_requisito_id, e.data_documento desc
)
select
  c.id                as colaborador_id,
  c.matricula,
  c.nome,
  c.cargo,
  c.polo,
  c.situacao,
  c.supervisor_id,
  t.id                as tipo_requisito_id,
  t.nome              as requisito,
  ue.data_documento   as ultimo_documento,
  case when ue.data_documento is not null
       then (ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date
  end                 as data_vencimento,
  case when ue.data_documento is not null
       then ((ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date - current_date)
  end                 as dias_restantes,
  case
    when ue.data_documento is null then 'sem_registro'
    when ((ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date - current_date) < 0  then 'vencido'
    when ((ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date - current_date) < 15 then 'critico'
    when ((ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date - current_date) <= 30 then 'atencao'
    when ((ue.data_documento + (t.periodicidade_meses || ' months')::interval)::date - current_date) <= 60 then 'programar'
    else 'ok'
  end                 as status
from colaboradores c
cross join tipos_requisito t
left join ultimo_evento ue
  on ue.colaborador_id = c.id and ue.tipo_requisito_id = t.id
where c.ativo = true and t.ativo = true;
```

O `cross join` é intencional: é ele que faz aparecer quem **não tem** registro. Sem isso o sistema só enxerga o que já existe, e o problema dos 177 nunca fica visível.

### Semáforo

| Status | Cor | Faixa | Leitura |
|---|---|---|---|
| `ok` | verde | > 60 dias | tranquilo |
| `programar` | amarelo | 60 a 31 dias | hora de programar |
| `atencao` | laranja | 30 a 15 dias | atrasado na programação |
| `critico` | vermelho | < 15 dias | risco real de parar equipe |
| `vencido` | preto | vencido | **não pode trabalhar amanhã** |
| `sem_registro` | preto | sem data | tratar com a mesma gravidade de vencido |

`sem_registro` e `vencido` têm o mesmo peso visual. Ausência de informação é um estado, não um vazio.

---

## 7. Regra de janela útil (ausências)

Ao exibir um item, cruzar com `ausencias`. Se o colaborador estiver ausente ou tiver ausência prevista antes do vencimento, mostrar o aviso:

> Vence em 40 dias, mas retorna de férias em 25 dias — janela útil de 15 dias.

Se a ausência **cobre todo** o período restante até o vencimento, sinalizar como conflito bloqueante e escalar para o QSMS.

Não permitir que o QSMS registre `data_agendada` dentro de um período de ausência conhecido — bloquear com mensagem clara.

---

## 8. Telas

### `/qsms/base` — Conferência da base (Fase 0)

Lista os 261 colaboradores com filtro padrão em `status = 'sem_registro'`. Cada linha permite informar a data do último ASO, que cria um `evento_requisito` retroativo. Contador fixo no topo: "177 de 261 sem data de referência".

Enquanto houver colaborador sem registro, exibir faixa de alerta no topo de **todas** as telas.

### `/qsms` — Painel do QSMS

- Cards de contagem por status
- Tabela completa com filtros: supervisor, status, polo, cargo, etapa
- Coluna **"dias parados"** — há quanto tempo o item está na etapa atual, destacando os que estouraram o SLA e de quem é a responsabilidade
- Ação em massa: gerar itens de pendência para os vencimentos dos próximos 60 dias

### `/qsms/item/[id]` — Detalhe do item (QSMS)

Registrar clínica, endereço, médico, data e hora. Registrar resultado + upload do documento. Registrar comunicação à CEMIG. Timeline com o `historico_item`.

### `/supervisor` — Painel do supervisor

Só a equipe dele. Ordenado por dias restantes, do mais crítico ao menos. Sem menus, sem abas: uma lista e um botão por linha. Deve ser usável no celular.

### `/supervisor/item/[id]` — Detalhe do item (supervisor)

Informar data de liberação. Ver dados do agendamento (clínica, endereço, médico, data, hora, jejum). Marcar compareceu / faltou.

---

## 9. Automações (Vercel Cron)

### `POST /api/cron/gerar-itens` — diário

Para cada linha de `vw_status_colaborador` com `dias_restantes <= 60` e sem `itens_pendencia` aberto para o mesmo vencimento, criar item em `previsto` com `sla_vence_em = now() + 7 dias`.

Também criar item para `status = 'sem_registro'` — esses precisam entrar na fila imediatamente.

### `POST /api/cron/email-semanal` — segunda-feira de manhã

Um e-mail **por supervisor**, contendo apenas a equipe dele, dividido em três blocos:

1. **Vencendo nos próximos 60 dias e sem programação** — precisa de ação dele
2. **Agendados** — data, hora, clínica, endereço, instruções
3. **Vencidos ou sem registro** — não podem trabalhar

Cada linha leva um link magic-link que abre direto no item. Registrar em `alertas_enviados` com `referencia` no formato `2026-W34` para não duplicar.

Não enviar e-mail para supervisor sem nenhuma pendência.

---

## 10. Segurança (RLS)

- `supervisores` e `colaboradores`: leitura para autenticados
- Supervisor enxerga apenas colaboradores onde `supervisor_id` corresponde ao seu registro
- Perfil QSMS enxerga tudo e é o único que pode criar `eventos_requisito` com resultado
- Supervisor pode atualizar somente `data_liberacao_proposta` e `compareceu`
- Bucket de documentos privado, acesso por URL assinada com expiração

Criar tabela `perfis` ligando `auth.users` a um papel (`qsms` | `supervisor`) e, quando supervisor, ao `supervisor_id`.

---

## 11. Sequência de implementação

**Fase 0 — Base confiável**
1. Setup do projeto, Supabase, migrations, deploy na Vercel
2. Script de importação dos colaboradores a partir do XLSX
3. Cadastro de supervisores e vínculo colaborador → supervisor
4. Tela `/qsms/base` e faixa de alerta global

**Fase 1 — Enxergar**
5. `vw_status_colaborador` e semáforo
6. Painel do QSMS
7. Painel do supervisor
8. Aviso de conflito com ausências

**Fase 2 — Agir**
9. Auth com magic link e RLS
10. Máquina de estados completa com histórico
11. Upload de documento
12. Geração automática do próximo ciclo

**Fase 3 — Automatizar**
13. Cron de geração de itens
14. Cron de e-mail semanal com deduplicação
15. Destaque de SLA estourado nos painéis

---

## 12. Dados de origem

Dois arquivos servem de seed:

**`Colaboradores_211.xlsx`** — 261 linhas, aba `Export`. Colunas: `MATRÍCULA`, `COLABORADOR`, `CARGO`, `UEN`, `SITUAÇÃO`, `SEXO`, `CPF`, `LOCAL`, `DATA NASCIMENTO`, `DATA ADMISSÃO`.

> Atenção: `DATA NASCIMENTO` e `DATA ADMISSÃO` vêm como **serial date do Excel** (ex: `46237`), não como texto. Converter na importação.

**`ASO_Proximos_vencimentos.CSV`** — 99 linhas, separador `;`, encoding `cp1252`. Colunas: `Matricula`, `Nome colaborador`, `Admissão`, `Idade`, `Local`, `UEN`, `Cargo`, `Situação`, `Prox. Exame`, `Parecer`, `CPF`, `RG / CTPS`, `Férias`.

> 84 linhas têm `Prox. Exame` válida (formato `dd/mm/aaaa`), entre 26/08/2026 e 19/12/2026. As demais estão vazias. A coluna `Férias` está inteiramente vazia.
>
> Para o seed, criar `evento_requisito` retroativo com `data_documento = Prox. Exame − 12 meses`. **Marcar essas linhas como estimadas** (campo `observacoes`), porque é uma inferência, não um dado real. Ver pendência P3.

---

## 13. Pendências — decidir antes ou durante

Itens `[PENDENTE]` não devem ser resolvidos por suposição do agente. Implementar o padrão indicado e deixar `TODO` visível.

### Bloqueiam a construção

**P1 — Mapa colaborador → supervisor.** Não existe em nenhum dos dois arquivos. Sem isso não há painel por supervisor nem destinatário de e-mail. São aproximadamente 7 supervisores (Vinicius dos Santos, Elton Amaral de Jesus, Pedro Gabriel de Souza, Elen Coelho Lima de Paula, Kesia Pereira Sudario, Daniel Pereira Antunes, Victor Menezes de Souza).
*Padrão até resolver:* deixar `supervisor_id` nulo e exibir esses colaboradores em um grupo "Sem supervisor" no painel do QSMS.

**P2 — Data-base dos 177 sem registro.** Verificar se o QSMS tem o histórico em sistema da clínica, planilha antiga ou pasta de PDFs.
*Padrão até resolver:* entram como `sem_registro`, tratados com a mesma gravidade de vencido.

**P3 — Como o vencimento é calculado hoje.** A coluna `Prox. Exame` já vem pronta na origem. Confirmar se é 12 meses a partir da data do exame, da data de emissão do documento, ou do mês de admissão.
*Padrão até resolver:* 12 meses a partir da `data_documento`.

### Bloqueiam regra de negócio

**P4 — A periodicidade é sempre 12 meses?** Verificar se algum cargo, grau de risco ou faixa etária exige periodicidade menor. A base tem colaboradores de 24 a 63 anos e cargos que vão de administrativo a instalador de rede.
*Padrão:* 12 meses para todos.

**P5 — Avaliação psicossocial.** Aparece nos e-mails do QSMS como coluna `Av. Psi` (S/N). Definir: quem precisa (cargo, NR, idade?), se é feita junto com o ASO ou em data/clínica separada, e se tem validade própria.
*Padrão:* campo booleano informativo no item, sem regra automática.

**P6 — Regra de jejum.** O e-mail atual diz "jejum de 8 horas, exceto administrativos", mas isso não está confirmado com a clínica. Esclarecer se o jejum é do ASO em si ou apenas de quem faz exame de sangue, e quem faz exame de sangue.
*Padrão:* campo `exige_jejum` em `tipos_requisito`, ligado, com texto fixo no aviso de agendamento.

**P7 — Origem e atualização das ausências.** A coluna `Férias` do CSV está vazia. Definir de onde vem a data de início e retorno de férias e afastamentos.
*Padrão:* tabela `ausencias` alimentada manualmente pelo QSMS.

**P8 — Atualização da base de colaboradores.** Quem envia a lista, com que frequência, e como o sistema fica sabendo de admissões e demissões. Se a base envelhecer, o sistema cobra ASO de quem já saiu e ignora quem entrou.
*Padrão:* reimportação manual via tela de importação, com relatório de diferenças (novos, desligados, cargo alterado).

### Refinam, não bloqueiam

**P9 — Clínicas.** Quais atendem cada polo (Gov. Valadares e Aimorés), endereço e prazo real de entrega do documento após o exame.

**P10 — Capacidade diária da clínica.** Necessária para o alerta de "12 pessoas vencendo no mesmo dia". Fora do MVP.

**P11 — Comunicação à CEMIG.** Prazo, formato e se existe número de protocolo que valha registrar.

---

## 14. Critérios de aceite do MVP

- [ ] Os 261 colaboradores estão na base, cada um vinculado a um supervisor
- [ ] Nenhum colaborador com `status = 'sem_registro'` (Fase 0 concluída)
- [ ] Um supervisor consegue, sem senha, abrir o painel pelo link do e-mail e informar uma data em menos de 30 segundos
- [ ] O QSMS consegue responder "quem não pode trabalhar amanhã" em uma tela, sem filtro manual
- [ ] O QSMS consegue responder "quais itens estão parados e com quem" em uma tela
- [ ] Concluir um item gera o próximo vencimento automaticamente, 12 meses adiante
- [ ] O e-mail semanal chega individualizado, sem duplicar em execuções repetidas do cron

### Indicadores de sucesso (medir antes e 3 meses depois)

| Indicador | Meta |
|---|---|
| ASOs vencidos com colaborador ativo | zero |
| Antecedência média entre aviso e exame realizado | acima de 30 dias |
| Equipes paradas por falta de ASO no mês | zero |

O terceiro indicador é o que justifica o projeto. Os outros dois explicam por que ele funcionou.