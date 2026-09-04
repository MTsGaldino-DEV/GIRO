# GIRO — Contexto atual do projeto

> Snapshot do estado do projeto em 02/09/2026. Para a especificação completa, ver [`plano_mvp.md`](plano_mvp.md). Para setup e comandos, ver [`README.md`](../README.md).

## O que é

Sistema de controle de ASO (Atestado de Saúde Ocupacional) para a UEN 211 (ENGELMIG/CEMIG). Substitui o controle por e-mail entre QSMS e Supervisão de Campo por um registro único: cada ASO a vencer é uma tarefa com dono e prazo, que muda de responsável conforme avança — do supervisor (liberar o colaborador) para o QSMS (agendar, coletar documento) e de volta.

Problema que resolve: e-mail não guarda estado. Ninguém sabia "de quem é a responsabilidade agora" nem havia forma de enxergar os 177 de 261 colaboradores sem nenhuma data de referência de exame.

## Stack

- **Next.js 15** (App Router, TypeScript) — frontend e server actions
- **Supabase** (Postgres) — banco, auth (e-mail + senha) e storage
- **Tailwind CSS 4** — UI
- **Resend** — envio de e-mail transacional
- **Vercel** — hospedagem + cron jobs

## Estado da implementação: MVP completo (1 commit)

Todo o escopo do `plano_mvp.md` foi codado — não é um protótipo parcial. O que existe hoje:

### Autenticação
- `/login` — e-mail + senha (`signInWithPassword`), sem autocadastro
- `/login/recuperar` e `/login/redefinir` — fluxo de "esqueci minha senha"
- `/conta/senha` — troca da própria senha, já autenticado
- `/auth/redefinir-senha`, `/auth/sair`
- Perfis (`admin` | `qsms` | `supervisor`) ligados a `auth.users`, roteamento automático pela função `rotaInicial`

### Navegação
Sidebar fixa à esquerda (252px), com item ativo em retângulo petróleo, barra
indicadora em petróleo claro e cartão de usuário no rodapé (avatar, papel,
trocar senha, sair). Em telas estreitas vira trilho de ícones. Tom escuro
próprio, distinto do preto reservado do status vencido.

### Dashboard gerencial — `/qsms/dashboard`
Primeira entrada da sidebar. Cartões por status, "onde está a bola"
(distribuição por etapa com dono e SLA estourado), vencimentos em 30/60/90
dias, curva de conclusões dos últimos 12 meses e ranking por supervisor.
Atualiza sozinho a cada 60s, só com a aba visível. O gráfico é SVG inline —
nenhuma biblioteca de charts no bundle.

### Página do colaborador — `/qsms/colaborador/[id]/[aba]`
Cabeçalho com foto (ou inicial), selo de conformidade e quatro indicadores.
Seis abas: Visão geral, ASO (com os formulários de ação e o histórico de
exames), Treinamentos (vazia por ora — ver P4), Ausências, Cadastro (edição de
lotação, vínculo e envio de foto) e Histórico (todos os ciclos, agrupados).

### Painel do QSMS
- `/qsms` — visão completa, cards de contagem por status, filtros (supervisor, status, polo, cargo, etapa), coluna "dias parados" com destaque de SLA estourado, ação em massa de geração de itens. Linhas em cartão com miniatura do colaborador, hover em petróleo lavado, ordenação por coluna e paginação de 25
- `/qsms/base` — conferência da base (Fase 0): lista colaboradores `sem_registro`, permite lançar data retroativa
- `/qsms/item/[id]` — agendar (clínica/data/hora), registrar resultado + upload de documento, registrar comunicação à CEMIG, timeline do histórico
- `/qsms/supervisores` — cadastro de supervisores e vínculo em massa colaborador → supervisor
- `/qsms/ausencias` — registro manual de férias/atestado/afastamento
- `/admin/usuarios` — só admin: cria acessos com senha temporária, ativa/desativa

### Painel do Supervisor
- `/supervisor` — só a equipe dele, ordenado por criticidade
- `/supervisor/item/[id]` — informar data de liberação, ver dados do agendamento, marcar comparecimento

### Máquina de estados (no banco, não na aplicação)
Funções `SECURITY DEFINER` + triggers em `supabase/migrations/0002_maquina_estados.sql`. Toda transição grava histórico e recalcula SLA — vale até para UPDATE manual feito direto no painel do Supabase.

| Etapa | Dono | SLA |
|---|---|---|
| `previsto` (= "pendente" do plano) | Supervisor | 7 dias |
| `data_solicitada` | Supervisor | 7 dias |
| `data_proposta` | QSMS | 3 dias |
| `agendado` | Supervisor | até a data agendada |
| `enviado_clinica` | QSMS | até o dia seguinte ao exame |
| `aguardando_documento` | QSMS | 5 dias |
| `concluido` (= "finalizado") | — | gera próximo ciclo, +12 meses da data de realização |
| `inapto_em_tratativa` | QSMS | sem prazo — travado |
| `cancelado` | — | libera a chave de ciclo aberto |

Os cinco desfechos do exame (`fez_apto`, `fez_inapto`, `faltou`, `incompleto`,
`retorno_necessario`) estão em `itens_pendencia.desfecho`. Quatro deles **não**
fecham o ciclo: `fez_inapto` trava em `inapto_em_tratativa`, e os outros três
reabrem em `data_solicitada`.

Regra chave: comparecimento não é conformidade. Só o documento com resultado `apto` zera a pendência.

### Automações (Vercel Cron)
- `POST /api/cron/gerar-itens` — diário, cria itens para vencimentos em até 90 dias
- `POST /api/cron/email-semanal` — segunda-feira, um e-mail por supervisor **e** o digest interno do QSMS/admin, ambos deduplicados por semana ISO

### Segurança
- RLS: supervisor só enxerga sua equipe; só QSMS grava resultado de exame
- Views com `security_invoker = true`
- Bucket de documentos privado, URL assinada de 1h
- Rotas de cron protegidas por `CRON_SECRET`

### Scripts de operação (`scripts/`)
`db:push` (migrations), `seed:teste` (base fictícia + contas de teste), `criar-perfil`, `teste-fluxo`, `teste-rls`, `verificar`, `gerar-icones`.

## Pendências de negócio ainda abertas (P1–P11)

Documentadas em detalhe no `plano_mvp.md` §13. Resumo do que mais pesa:

- **P1 — mapa colaborador → supervisor**: não existe fonte de dados pronta. Colaborador sem supervisor não entra em e-mail nenhum. Mitigado por tela de vínculo em massa, mas o vínculo em si precisa ser feito à mão.
- **P2 — data-base dos ~177 colaboradores sem registro**: sem histórico, entram como `sem_registro` até alguém lançar manualmente em `/qsms/base`.
- Demais pendências (P3–P11) têm padrão implementado e `TODO` marcado — não bloqueiam o uso, só precisam de confirmação de regra de negócio.

## Fase 1 — camada de workflow (migrations 0011 e 0012)

Implementa `plano_acao_fase.md` sobre o schema existente, sem tabelas paralelas.
Mapeamento de nomes: `processos` → `itens_pendencia`, `movimentacoes` →
`historico_item`, `vigencias_requisito` → `eventos_requisito` +
`vw_status_colaborador`, `profiles` → `perfis`, `documentos` →
`eventos_requisito.documento_url`.

- Tabela `clinicas` (nome, cidade, contato, endereço) e `itens_pendencia.clinica_id`
- Catálogo com AVP (24 meses), marcado `opcional` — só vale para quem tiver
  `colaboradores.exige_avp`, que é `false` por padrão até existir a lista
- `historico_item.em_nome_de`: o QSMS lança, o supervisor decidiu
- `itens_pendencia.data_limite_marcar` (coluna gerada: vencimento − 7 dias)
- Janela de entrada em pendência passou de 60 para 90 dias
- Digest semanal interno para QSMS/admin, além do e-mail por supervisor
- Aba Supervisão visível só para admin, vazia na Fase 1

## Ambiente

As variáveis ficam num único arquivo, `.env` (modelo em `.env.example`).
Não existe mais `.env.local` — havia os dois, com precedência entre eles, e
isso é editar o arquivo errado esperando efeito. `.env` está no `.gitignore`.

O bloqueio de DNS que existia no projeto Supabase foi resolvido: em 04/09/2026 o
banco respondeu, as 12 migrations foram aplicadas e o seed fictício rodou (20
colaboradores). O que continua valendo é que a base **real** ainda não foi
importada — o desenvolvimento roda sobre o seed, e a virada para dados reais
depende da Fase 0.
