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
| `previsto` | Supervisor | 7 dias |
| `data_proposta` | QSMS | 3 dias |
| `agendado` | Supervisor | até a data agendada |
| `aguardando_documento` | QSMS | 5 dias |
| `concluido` | — | gera próximo ciclo, +12 meses |

Regra chave: comparecimento não é conformidade. Só o documento com resultado `apto` zera a pendência.

### Automações (Vercel Cron)
- `POST /api/cron/gerar-itens` — diário, cria itens para vencimentos em até 60 dias
- `POST /api/cron/email-semanal` — segunda-feira, um e-mail por supervisor, deduplicado

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

## Bloqueio de infraestrutura ativo

O projeto Supabase referenciado em `.env.local` (`kdnuhbrtbqkyxocbnjik.supabase.co`) **não resolve mais no DNS** — provavelmente pausado por inatividade e excluído (free tier). Nada que depende de banco funciona (login, listagem de colaboradores, etc.) até:

1. confirmar no dashboard Supabase se o projeto existe sob outra conta/organização, ou criar um novo;
2. atualizar `.env.local` com URL + `anon key` + `service_role key` atuais;
3. reaplicar as 6 migrations (`npm run db:push`);
4. reimportar a base de colaboradores e criar o primeiro perfil QSMS (`scripts/criar-perfil.mjs`).

Sem isso, o frontend builda e roda, mas nenhuma tela com dado real funciona.
