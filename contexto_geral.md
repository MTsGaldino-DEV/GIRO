# GIRO — Contexto Geral (estado atual do código)
_Atualizado em: 08/09/2026 · por auditoria automática (somente leitura)_

> Arquivo criado nesta auditoria — não existia versão anterior em `contexto_geral.md`, portanto não havia nota manual a preservar. Documentos relacionados já presentes no repositório: [README.md](README.md), [docs/contexto-atual.md](docs/contexto-atual.md), [docs/identidade-visual.md](docs/identidade-visual.md), [docs/perfil-colaborador-criterios.md](docs/perfil-colaborador-criterios.md), [superprompt.md](superprompt.md).

## 1. Resumo em 5 linhas

O repositório contém uma aplicação Next.js 15 (App Router, TS) funcional e razoavelmente completa: banco Supabase com 14 migrations, máquina de estados de 9 etapas implementada em triggers e RPCs no Postgres, RLS em todas as tabelas do schema `public`, autenticação e-mail+senha com recuperação de senha, painéis do QSMS, do supervisor e do admin, dashboard, perfil de colaborador com documentos e trilha de auditoria, dois crons (geração de itens e e-mail semanal via Resend). A view `vw_status_colaborador` usa o `cross join` entre `colaboradores` e `tipos_requisito` conforme descrito. **Não existe** pipeline de importação das planilhas (`ASO__Proximos_vencimentos.CSV` / `Colaboradores__211_2.xlsx`) — as dependências `csv-parse`, `exceljs` e `iconv-lite` estão declaradas mas nenhum arquivo do repositório as importa. **Não existe** framework nem suíte de testes unitários: os testes são dois scripts Node que rodam SQL contra o banco real. Há trabalho não commitado na árvore (edição de cadastro do colaborador campo a campo). O produto roda sobre dados de seed fictício; a base real não foi importada.

## 2. Stack e configuração — **implementado**

`package.json`:

| Dependência | Versão declarada |
|---|---|
| next | ^15.5.4 |
| react / react-dom | ^19.1.1 |
| @supabase/ssr | ^0.7.0 |
| @supabase/supabase-js | ^2.58.0 |
| resend | ^6.1.2 |
| zod | ^4.1.11 |
| date-fns | ^4.1.0 |
| @radix-ui/react-{dialog,dropdown-menu,label,separator,slot,tabs} | 1.x–2.x |
| class-variance-authority / clsx / tailwind-merge | — |

devDependencies: `typescript ^5.9.2`, `tailwindcss ^4.1.13`, `@tailwindcss/postcss`, `eslint ^9.36.0`, `eslint-config-next`, `pg ^8.16.3`, **`csv-parse ^6.1.0`, `exceljs ^4.4.0`, `iconv-lite ^0.7.0` (declaradas e não usadas por nenhum arquivo do repo)**.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `db:push` (`node scripts/db-push.mjs`), `seed:teste` (`node scripts/seed-teste.mjs`). **Não há** script `test`.

- [tsconfig.json](tsconfig.json) — `strict: true`, target ES2022, alias `@/*` → raiz, `exclude: ["node_modules", "scripts"]` (os scripts `.mjs` não passam por typecheck).
- [next.config.mjs](next.config.mjs) — único ajuste: `experimental.serverActions.bodySizeLimit: "8mb"`.
- [vercel.json](vercel.json) — região `gru1`; crons `/api/cron/gerar-itens` (`0 9 * * *`) e `/api/cron/email-semanal` (`0 10 * * 1`).
- [components.json](components.json) — shadcn/ui, estilo "new-york", `iconLibrary: lucide` (a lib `lucide-react` **não** está no `package.json`; os ícones em uso vêm de [components/icones.tsx](components/icones.tsx)).
- [.env.example](.env.example) — variáveis esperadas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. Existe um `.env` no diretório (ignorado pelo git; conteúdo não inspecionado).
- [middleware.ts](middleware.ts) — renova o cookie de sessão do Supabase em toda navegação; matcher exclui estáticos e `api/cron`.

## 3. Estrutura de pastas (árvore resumida) — **implementado**

```
app/
  (app)/                        # área autenticada (layout com sidebar)
    admin/{usuarios,desligados}/
    conta/senha/
    qsms/                       # painel, base, dashboard, item, supervisores, ausências, colaborador/[id]/{6 abas}
    supervisor/                 # painel + item/[id]
  api/cron/{gerar-itens,email-semanal}/route.ts
  auth/{redefinir-senha,sair}/route.ts
  login/{,recuperar,redefinir}/
components/                     # 26 componentes + components/ui (shadcn) + components/perfil (painel flutuante)
lib/                            # dominio, tipos, perfil, colaborador, consulta-*, storage, cron, email-semanal, utils, campos-colaborador
lib/supabase/                   # server.ts, browser.ts, admin.ts
scripts/                        # db-push, seed-teste, criar-perfil, teste-fluxo, teste-rls, verificar, gerar-icones + lib/
supabase/migrations/            # 0001 … 0014 (.sql)
docs/                           # contexto-atual, identidade-visual, perfil-colaborador-criterios, superpowers/specs/
data/                           # apenas .gitkeep (vazio)
public/                         # logos, ícones
```

Sobre a nomenclatura sugerida no enunciado: **`lib/domain`, `lib/data` e `lib/email` não existem com esses nomes** — ver seção 8.

## 4. Banco de dados — **implementado**

14 migrations em [supabase/migrations/](supabase/migrations/), aplicadas por [scripts/db-push.mjs](scripts/db-push.mjs) (`pg` direto, sem CLI do Supabase). Todos os arquivos são idempotentes (`create or replace`, `if not exists`, `drop policy if exists`).

### Tabelas (schema `public`)

| Tabela | Origem | Colunas principais |
|---|---|---|
| `supervisores` | [0001](supabase/migrations/0001_schema.sql) | id, nome, email (unique), ativo |
| `colaboradores` | 0001 (+0008, +0011) | matricula (unique), nome, cpf, cargo, uen, local, polo, data_admissao, data_nascimento, situacao (check 6 valores), supervisor_id, ativo, `foto_url` (0008), `exige_avp` (0011) |
| `tipos_requisito` | 0001 (+0011) | nome (unique), periodicidade_meses, exige_jejum, exige_documento, ativo, `opcional` (0011) |
| `perfis` | 0001 (+0007) | id → `auth.users`, email, nome, papel (check), supervisor_id, ativo; check `perfil_supervisor_precisa_vinculo` |
| `ausencias` | 0001 | colaborador_id, tipo (`ferias`/`atestado`/`afastamento`), data_inicio, data_fim |
| `eventos_requisito` | 0001 | colaborador_id, tipo_requisito_id, data_realizado, data_documento, resultado (check), clinica, medico, documento_url, estimado, registrado_por |
| `itens_pendencia` | 0001 (+0011) | colaborador_id, tipo_requisito_id, data_vencimento, etapa (check, 9 valores após 0011), data_liberacao_proposta, clinica, endereco, medico, data_agendada, hora_agendada, compareceu, avaliacao_psicossocial, comunicado_cemig_em, evento_id, sla_vence_em, etapa_desde, `clinica_id`, `dados_informados_em`, `desfecho` (check, 5 valores), `data_limite_marcar` (coluna **gerada**: `data_vencimento - 7`) |
| `historico_item` | 0001 (+0011) | item_id, etapa_de, etapa_para, autor (auth.users), observacao, `em_nome_de` (0011), criado_em |
| `alertas_enviados` | 0001 (+0012) | item_id, supervisor_id, tipo_alerta (check: semanal, sla_estourado, critico, digest_qsms), referencia, enviado_em |
| `clinicas` | [0011](supabase/migrations/0011_fase1_workflow.sql) | nome (unique), cidade, contato, endereco, ativo |
| `documentos_colaborador` | [0014](supabase/migrations/0014_documentos_auditoria.sql) | colaborador_id, nome_arquivo, tipo, storage_path, tamanho_bytes, mime_type, data_documento, data_validade, descricao, criado_por/em, atualizado_por/em |
| `auditoria_colaborador` | 0014 | colaborador_id, usuario_id, acao (check: criou/alterou/removeu/anexou), entidade (check: colaborador/documento/foto), entidade_id, campo, valor_anterior, valor_novo, origem, criado_em |

### Enums — **ausente como tipo Postgres**

Não há `create type ... as enum` em nenhuma migration. Todos os "enums" são `text` + `check constraint` (etapa, desfecho, resultado, situacao, papel, acao, entidade, tipo_alerta). Do lado TS, os mesmos conjuntos existem como union types em [lib/tipos.ts](lib/tipos.ts).

### View de status e o `cross join` — **implementado**

`public.vw_status_colaborador`, criada em [0003](supabase/migrations/0003_view_status.sql) e redefinida em [0012](supabase/migrations/0012_fase1_rpcs.sql#L16). Usa **`cross join public.tipos_requisito t`** contra `public.colaboradores c`, com `left join` no último evento apto — é o que faz aparecer quem nunca teve registro (status `sem_registro`). Filtros: `c.ativo`, `t.ativo` e, desde 0012, `(t.opcional = false or c.exige_avp = true)`. `security_invoker = true`, portanto respeita a RLS de quem consulta. Semáforo de 6 faixas (`sem_registro`, `vencido`, `critico` <15d, `atencao` ≤30d, `programar` ≤60d, `ok`) + `peso_status` para ordenação.

Outras views: `vw_itens_abertos` (0003, redefinida em 0012 e [0013](supabase/migrations/0013_foto_na_view.sql)), `vw_eventos_colaborador` (0009/0012), `vw_documentos_colaborador` (0014). Todas com `security_invoker = true`.

### RLS — **implementado**

[0004_rls.sql](supabase/migrations/0004_rls.sql) habilita RLS nas 9 tabelas de 0001; 0011 e 0014 fazem o mesmo para `clinicas`, `documentos_colaborador` e `auditoria_colaborador`. Padrão: leitura para QSMS/admin (`fn_e_qsms()`) ou para a própria equipe (`fn_minha_equipe(colaborador_id)`); escrita só para QSMS/admin. Detalhes relevantes:

- `itens_pendencia`: supervisor **não** tem policy de escrita — toda transição passa pelas RPCs `SECURITY DEFINER`.
- `historico_item`: só policy de SELECT; escrita exclusiva do trigger.
- `auditoria_colaborador`: só policy de SELECT; escrita exclusiva de `fn_registrar_auditoria`.
- `alertas_enviados`: SELECT para QSMS; escrita pelo cron com `service_role`.
- Storage: buckets privados `asos` (0004, 8 MB, pdf/jpeg/png), `fotos` (0008, 512 kB) e `documentos` (0014), cada um com policies próprias em `storage.objects`.

### Triggers e auditoria — **implementado**

[0002_maquina_estados.sql](supabase/migrations/0002_maquina_estados.sql):
- `trg_item_antes_de_mudar` (BEFORE insert/update) → valida a transição via `fn_transicao_valida` e recalcula `sla_vence_em` via `fn_sla_da_etapa`.
- `trg_item_historico` (AFTER insert/update) → insere linha em `historico_item` a cada mudança de etapa; observação e `em_nome_de` chegam por `set_config('giro.observacao'/'giro.em_nome_de')`.
- `trg_touch_colaboradores` / `trg_touch_itens` (0001) → `atualizado_em`.

**Append-only:** `historico_item` e `auditoria_colaborador` são append-only *na prática* (sem policy de INSERT/UPDATE/DELETE para o usuário final, escrita só via trigger/`SECURITY DEFINER`), mas **não há trigger que proíba UPDATE/DELETE** nessas tabelas para quem tenha `service_role` ou acesso direto ao banco.

Linha do tempo unificada: `fn_linha_do_tempo_colaborador` (0014) une `historico_item` e `auditoria_colaborador` num único retorno com coluna `fonte`.

## 5. Autenticação — **implementado**

- **E-mail + senha**: `supabase.auth.signInWithPassword` em [app/login/acoes.ts](app/login/acoes.ts) (`entrar`). Erro genérico proposital ("E-mail ou senha inválidos."). Após autenticar, exige linha ativa em `perfis`; se não houver, faz `signOut`.
- **Sem autocadastro; criação restrita ao admin**: [app/(app)/admin/usuarios/acoes.ts](app/(app)/admin/usuarios/acoes.ts) → `criarUsuario` chama `exigirAdmin()` e usa `admin.auth.admin.createUser` com `service_role` e senha temporária. Não há nenhuma chamada a `signUp` no repositório.
- **Esqueci a senha**: `solicitarRecuperacao` (`resetPasswordForEmail` → `/auth/redefinir-senha`), route handler [app/auth/redefinir-senha/route.ts](app/auth/redefinir-senha/route.ts) que troca o code pela sessão, tela [app/login/redefinir/](app/login/redefinir/) e ação `redefinirSenha`. Resposta idêntica exista ou não o e-mail.
- **Troca de senha logado**: [app/(app)/conta/senha/acoes.ts](app/(app)/conta/senha/acoes.ts) → `trocarSenha`.
- **Sair**: [app/auth/sair/route.ts](app/auth/sair/route.ts).
- Primeiro acesso criado fora da UI por [scripts/criar-perfil.mjs](scripts/criar-perfil.mjs).

## 6. RBAC / papéis e acesso às abas — **implementado**

- **Coluna de papel**: `perfis.papel text` com check `('qsms','supervisor')` em 0001, ampliado para `('qsms','supervisor','admin')` em [0007](supabase/migrations/0007_email_senha_admin.sql). Não é enum Postgres. Espelhado em `type Papel` ([lib/tipos.ts:3](lib/tipos.ts#L3)).
- **No banco**: `fn_papel()`, `fn_supervisor_id()`, `fn_e_qsms()` (que retorna true para `qsms` **e** `admin` desde 0007), `fn_minha_equipe()`. As policies e as RPCs usam essas funções.
- **Na UI (server-side)**: [lib/perfil.ts](lib/perfil.ts) — `exigirPerfil`, `exigirQsms` (supervisor é redirecionado para `/supervisor`), `exigirSupervisor` (qsms é redirecionado para `/qsms`), `exigirAdmin`, `rotaInicial`. Cada página chama a guarda correspondente.
- **Sidebar por papel**: [components/sidebar.tsx](components/sidebar.tsx#L56) — `gruposDoPapel()`. Supervisor vê só "Painel"; QSMS vê Operação (Dashboard, Painel) + Cadastros (Base, Supervisores, Ausências); admin ganha o grupo Administração (Supervisão, Gestão de usuários, Desligados).
- **Aba "Supervisão" como esqueleto**: **stub/esqueleto confirmado**. `ITEM_SUPERVISAO` na sidebar é adicionado apenas para `papel === "admin"` ([components/sidebar.tsx:45](components/sidebar.tsx#L45)); a rota [app/(app)/supervisor/page.tsx](app/(app)/supervisor/page.tsx) existe e é funcional, mas para o admin abre vazia (sem `supervisor_id`, a RLS não devolve nada) e a própria página detecta esse caso (`semEquipe`).

## 7. Máquina de estados — **implementado (no banco); testes unitários ausentes**

Toda a lógica está no Postgres, não na aplicação.

**Estados** (check em `itens_pendencia.etapa`, [0011](supabase/migrations/0011_fase1_workflow.sql)): `previsto`, `data_solicitada`, `data_proposta`, `agendado`, `enviado_clinica`, `aguardando_documento`, `concluido`, `inapto_em_tratativa`, `cancelado`. Espelhados em `type Etapa` ([lib/tipos.ts](lib/tipos.ts)) e rotulados em [lib/dominio.ts](lib/dominio.ts) (`ETAPA_ROTULO`, `ETAPA_ACAO`).

**Desfechos** (`itens_pendencia.desfecho`): `fez_apto`, `fez_inapto`, `faltou`, `incompleto`, `retorno_necessario` — `DESFECHO_ROTULO`/`DESFECHO_CONSEQUENCIA` em `lib/dominio.ts`.

**Transições legais**: `fn_transicao_valida(p_de, p_para)` — 6 pares em 0002, ampliados para 21 pares em 0011. **SLA por etapa**: `fn_sla_da_etapa`. **Validação**: trigger `trg_item_antes_de_mudar`.

**RPCs de transição** (todas `SECURITY DEFINER` com checagem explícita de papel), em [0012_fase1_rpcs.sql](supabase/migrations/0012_fase1_rpcs.sql): `fn_solicitar_data`, `fn_registrar_data_supervisor`, `fn_propor_data`, `fn_agendar`, `fn_informar_dados`, `fn_enviar_clinica`, `fn_registrar_desfecho`, `fn_concluir_item`, `fn_encerrar_inapto`, `fn_cancelar_item`, `fn_devolver_ao_supervisor`, `fn_registrar_comparecimento`, `fn_gerar_itens_pendentes`. Mais `fn_registrar_aso_retroativo` (0005) e `fn_registrar_comunicacao_cemig` (0002).

**Server Actions** que chamam as RPCs: [app/(app)/qsms/acoes.ts](app/(app)/qsms/acoes.ts) (13 ações) e [app/(app)/supervisor/acoes.ts](app/(app)/supervisor/acoes.ts) (2 ações). Elas validam formato com zod e traduzem a mensagem; a autorização é do banco.

**Testes unitários da máquina de estados: ausentes.** Existe um teste end-to-end em SQL — ver seção 12.

## 8. Camada de dados e e-mail — **parcial (nomes diferentes do esperado)**

- **`lib/data`: não encontrado.** O acesso a dados está distribuído em [lib/colaborador.ts](lib/colaborador.ts) (`carregarColaborador`, `carregarStatus`, `carregarItemAberto`, `assinarFotos`, `obterResumoStatus`, `obterPolos`), [lib/consulta-colaborador.ts](lib/consulta-colaborador.ts) (`carregarResumo`, `carregarExames`, `carregarDocumentos`, `carregarLinhaDoTempo`, `carregarSupervisoresAtivos`), [lib/consulta-itens.ts](lib/consulta-itens.ts) (montagem da consulta do painel, compartilhada servidor/navegador) e [lib/storage.ts](lib/storage.ts). Além disso, várias páginas consultam o Supabase diretamente (`supabase.from(...)` dentro do Server Component).
- **`lib/domain`: não encontrado** com esse nome; o equivalente é [lib/dominio.ts](lib/dominio.ts) (rótulos, semáforo, formatação de datas, `avisoJanelaUtil`) + [lib/tipos.ts](lib/tipos.ts).
- **`lib/email`: não encontrado**; o equivalente é [lib/email-semanal.ts](lib/email-semanal.ts) — monta assunto, HTML (tabelas inline) e versão texto do e-mail. Não envia.
- **Disparo de e-mail: implementado**, num único lugar: [app/api/cron/email-semanal/route.ts](app/api/cron/email-semanal/route.ts). Usa `new Resend(RESEND_API_KEY)` e `resend.emails.send` em dois pontos — um e-mail por supervisor e o digest interno para perfis `qsms`/`admin`. Tem modo `?simular=1` e `?previa=<supervisor_id|qsms>` que renderizam sem enviar. Deduplicação por semana ISO em `alertas_enviados` (`referenciaSemanal` em [lib/cron.ts](lib/cron.ts)), com rollback da linha de dedup se o envio falhar. Autorização por `CRON_SECRET` (`cronAutorizado`; em `NODE_ENV !== "production"` sem segredo configurado a rota fica aberta).
- Nenhum outro disparo de e-mail no repositório (nada transacional em ações de usuário; a recuperação de senha é enviada pelo próprio Supabase Auth).

## 9. UI / telas e rotas — **implementado**

| Rota | Guarda | O que mostra |
|---|---|---|
| `/` | — | redirect para `rotaInicial` ou `/login` |
| `/login`, `/login/recuperar`, `/login/redefinir` | pública | e-mail+senha, pedido e definição de nova senha |
| `/auth/redefinir-senha`, `/auth/sair` | route handlers | troca code→sessão; logout |
| `/qsms` | `exigirQsms` | painel principal: cards por status, filtros (status, etapa, supervisor, polo, "parados"), ordenação por coluna, paginação de 25, miniatura do colaborador, menu ⋮ por linha, botão de gerar itens |
| `/qsms/dashboard` | `exigirQsms` | cartões por status, distribuição por etapa com dono e SLA estourado, vencimentos 30/60/90, curva de conclusões (SVG inline), ranking por supervisor, auto-refresh 60s |
| `/qsms/base` | `exigirQsms` | conferência da base: lista `sem_registro`, lança ASO retroativo |
| `/qsms/item/[id]` | `exigirQsms` | ficha do item, trilha de etapas, formulários de ação, timeline do histórico; item encerrado cai numa visão só-histórico em vez de 404 |
| `/qsms/colaborador/[id]/{visao-geral,aso,treinamentos,ausencias,cadastro,historico}` | `exigirQsms` | perfil em tela cheia, 6 abas ([abas.tsx](app/(app)/qsms/colaborador/[id]/abas.tsx)) |
| `/qsms/supervisores` | `exigirQsms` | cadastro de supervisores + vínculo em massa |
| `/qsms/ausencias` | `exigirQsms` | registro manual de férias/atestado/afastamento |
| `/supervisor` | `exigirSupervisor` | equipe do supervisor, separada em "com você" e "com o QSMS" |
| `/supervisor/item/[id]` | `exigirSupervisor` | informar data de liberação, marcar comparecimento |
| `/admin/usuarios` | `exigirAdmin` | cria acesso com senha temporária, ativa/desativa |
| `/admin/desligados` | `exigirAdmin` | colaboradores com `ativo = false`, para reativar |
| `/conta/senha` | `exigirPerfil` | troca da própria senha |
| `/api/cron/gerar-itens`, `/api/cron/email-semanal` | `CRON_SECRET` | GET e POST |

- **Sidebar**: [components/sidebar.tsx](components/sidebar.tsx) — fixa à esquerda (252px), agrupada por natureza da tarefa, vira trilho de ícones em telas estreitas, cartão de usuário no rodapé.
- **Painel flutuante de perfil**: [components/perfil/painel-perfil.tsx](components/perfil/painel-perfil.tsx) + [contexto.tsx](components/perfil/contexto.tsx), montado no layout autenticado; abas Visão geral / ASO / Documentos / Cadastro / Histórico.
- **Aba "Treinamentos": stub deliberado** — [treinamentos/page.tsx](app/(app)/qsms/colaborador/[id]/treinamentos/page.tsx) lista tipos de requisito diferentes de "ASO Periódico" e explica no comentário que fica vazia até as periodicidades das NRs serem levantadas (P4).
- **UI kit**: [components/ui/](components/ui/) com 9 componentes shadcn (badge, breadcrumb, button, card, dialog, dropdown-menu, input, label, separator); ícones próprios em [components/icones.tsx](components/icones.tsx); gráfico em SVG inline ([components/grafico-conclusoes.tsx](components/grafico-conclusoes.tsx)), sem biblioteca de charts.

## 10. Seed — **implementado**

[scripts/seed-teste.mjs](scripts/seed-teste.mjs), 439 linhas, `npm run seed:teste`. Destrutivo por design (apaga colaboradores e supervisores existentes antes de popular).

- **20 colaboradores fictícios** (matrículas 90001–90020, CPFs de dígitos repetidos, inválidos pelo checksum). O README ainda diz "15 colaboradores" — divergência com o script.
- Cobre os estágios: `concluido`, `agendado`, `data_proposta`, `aguardando_documento`, `sem_registro`, `data_solicitada`, `enviado_clinica`, `inapto_em_tratativa`, `cancelado`, e o caso "sem vigência e fora de qualquer processo".
- Datas relativas à execução (`hoje ± offset`), de modo que os status do semáforo saem corretos em qualquer dia.
- Cria **3 contas de teste** (`teste.admin@`, `teste.qsms@`, `teste.supervisor@giro.local`, senha `Giro@Teste123`), um supervisor fictício, documentos e linhas de auditoria (`criarDocumentosEAuditoria`).

## 11. Import de planilha — **ausente**

- Nenhum arquivo do repositório importa `csv-parse`, `exceljs` ou `iconv-lite`; nenhuma menção a `ASO__Proximos_vencimentos.CSV`, `Colaboradores__211_2.xlsx`, `cp1252` ou `win1252` em código. As três dependências estão declaradas em `devDependencies` de [package.json](package.json), o que sugere que existiu (ou foi planejado) um script de importação que não está versionado.
- O diretório [data/](data/) contém apenas `.gitkeep`.
- Não há feature de admin para upload de planilha, nem script solto em [scripts/](scripts/) (os 7 scripts existentes são: db-push, seed-teste, criar-perfil, teste-fluxo, teste-rls, verificar, gerar-icones).
- O único caminho de entrada de dados históricos que existe é manual: a tela `/qsms/base` + `fn_registrar_aso_retroativo`.
- Resíduo de uma importação passada: comentário em [app/(app)/qsms/ausencias/acoes.ts:25](app/(app)/qsms/ausencias/acoes.ts#L25) — "A coluna 'Férias' do CSV de origem veio inteiramente vazia".

## 12. Testes — **parcial (integração em SQL); unitários ausentes**

Não há Jest, Vitest, Playwright ou qualquer runner no `package.json`, nem script `test`, nem arquivos `*.test.*` / `*.spec.*` no repositório.

O que existe são scripts Node que abrem conexão `pg` contra o banco real usando `SUPABASE_DB_URL`:

| Script | Linhas | Cobre |
|---|---|---|
| [scripts/teste-fluxo.mjs](scripts/teste-fluxo.mjs) | 658 | ciclo de vida completo da máquina de estados contra o banco, com colaborador de teste (matrícula 999999) criado e removido; troca `auth.uid()` para simular os papéis, já que as RPCs decidem permissão por perfil |
| [scripts/teste-rls.mjs](scripts/teste-rls.mjs) | 412 | isolamento por RLS: conecta como role `authenticated` e verifica que o supervisor A não enxerga a equipe do supervisor B |
| [scripts/verificar.mjs](scripts/verificar.mjs) | 49 | conferência (não é teste): contagens por situação, catálogo, semáforo, `fn_resumo_status`, itens por etapa |

Nada cobre a camada TypeScript ([lib/dominio.ts](lib/dominio.ts), [lib/cron.ts](lib/cron.ts) `referenciaSemanal`, [lib/email-semanal.ts](lib/email-semanal.ts), [lib/consulta-itens.ts](lib/consulta-itens.ts)) — que é justamente onde há lógica pura, fácil de testar.

## 13. Pendências e trechos incompletos

Nenhuma ocorrência de `TODO`, `FIXME`, `XXX` ou `HACK` como marcador de código em todo o repositório (a única aparição de "HACK" é um valor literal de string num teste de RLS). O projeto usa `[PENDENTE]` como convenção:

| Marcador | Local | Assunto |
|---|---|---|
| `[PENDENTE]` | [0011_fase1_workflow.sql:55](supabase/migrations/0011_fase1_workflow.sql#L55) | lista de quem exige Avaliação Psicossocial não existe; default `exige_avp = false` |
| `[PENDENTE]` | [0012_fase1_rpcs.sql:14](supabase/migrations/0012_fase1_rpcs.sql#L14) | mesma lista de AVP |
| `[PENDENTE]` | [0012_fase1_rpcs.sql:377](supabase/migrations/0012_fase1_rpcs.sql#L377) | mapa de clínicas por polo não definido — clínica em texto livre continua aceita |
| `[PENDENTE]` | [0012_fase1_rpcs.sql:673](supabase/migrations/0012_fase1_rpcs.sql#L673) e [app/(app)/qsms/acoes.ts:460](app/(app)/qsms/acoes.ts#L460) | procedimento de saída do `inapto_em_tratativa` (tornar apto vs. dispensar) não definido; o sistema só encerra o item com motivo no histórico |
| `[PENDENTE]` (referência) | [app/(app)/qsms/acoes.ts:100](app/(app)/qsms/acoes.ts#L100) | campo livre de clínica mantido por causa da pendência acima |
| P4/P6 | [0005_geracao_itens.sql:8-10](supabase/migrations/0005_geracao_itens.sql#L8) | periodicidade única de 12 meses e regra de jejum não confirmadas |
| P5 | [0001_schema.sql](supabase/migrations/0001_schema.sql) | `avaliacao_psicossocial` é informativo, sem regra automática |
| P3 | 0001 / 0002 | `eventos_requisito.estimado` — data inferida na carga inicial |
| P7 | [0004_rls.sql](supabase/migrations/0004_rls.sql) | ausências alimentadas à mão até existir origem oficial |

Trechos claramente incompletos ou inconsistentes:

- **Import de planilha inexistente** com dependências instaladas para isso (seção 11).
- **Aba Treinamentos** vazia por decisão registrada (P4).
- **Aba Supervisão** é scaffolding: existe, é visível só para o admin, e abre vazia na Fase 1.
- **Trabalho não commitado** na árvore (`git status`): modificados `app/(app)/qsms/colaborador/[id]/cadastro/acoes.ts`, `.../cadastro/page.tsx`, `components/icones.tsx`, `components/perfil/aba-cadastro.tsx`, `components/tabela-itens.tsx`; renomeado `formulario-folha.tsx` → `botao-desligar.tsx`; **deletado** `.../cadastro/formulario.tsx`; **não rastreados** `.../cadastro/campo-editavel.tsx`, `.../cadastro/ficha-cadastro.tsx`, `lib/campos-colaborador.ts`. É a edição de cadastro campo a campo, em andamento.
- **`docs/plano_mvp.md` e `docs/plano_acao_fase.md` não existem** no repositório, embora [README.md](README.md#L9) e várias migrations os citem como especificação.

## 14. Git (branch + últimos commits)

Branch atual: **`main`** (também é o branch principal).

| Hash | Data | Mensagem |
|---|---|---|
| `c06aac7` | 2026-09-05 | feat: admin edita dados da folha e desliga colaborador no perfil |
| `e1a70e0` | 2026-09-05 | feat: editar e excluir documentos, coluna de status e seed do perfil |
| `631b3d0` | 2026-09-05 | feat: perfil do colaborador em painel flutuante com documentos e auditoria |
| `50a3594` | 2026-09-05 | feat: menu de ações por linha no painel (Fase B do redesign) |
| `74abe63` | 2026-09-05 | feat: base do redesign (shadcn/ui) — sidebar agrupada, trilha, elevação |

Árvore suja — ver a lista de arquivos na seção 13.

## 15. Ambiguidades / dúvidas que a auditoria notou

1. `csv-parse`, `exceljs` e `iconv-lite` estão em `devDependencies` sem nenhum consumidor no repositório. Ou o script de importação foi removido/nunca commitado, ou as dependências ficaram órfãs.
2. [README.md](README.md#L9) aponta para `docs/plano_mvp.md`; as migrations 0011/0012 citam `plano_acao_fase.md` e "ajuste ao mvp.md". Nenhum desses arquivos existe em [docs/](docs/) — as regras de negócio citadas como fonte não são verificáveis dentro do repositório.
3. README diz que o seed popula **15** colaboradores; [scripts/seed-teste.mjs](scripts/seed-teste.mjs) define **20** (90001–90020).
4. Papéis: o enunciado desta auditoria fala em `admin`, `qsms`, `supervisor`; o banco tem os três, mas `fn_e_qsms()` trata `admin` e `qsms` como o mesmo papel para efeito de RLS. A separação real entre eles é feita apenas na aplicação (`exigirAdmin`) — quem tiver `service_role` ou acesso direto não vê essa distinção.
5. O `check` de `perfis.papel` foi ampliado em 0007, mas o comentário de `perfis` em 0001 e o constraint `perfil_supervisor_precisa_vinculo` continuam escritos para o modelo de dois papéis; não há restrição impedindo um `admin` de ter `supervisor_id`.
6. Semáforo duplicado: a mesma escada de 6 faixas está codificada em SQL (`vw_status_colaborador`, duas vezes — 0003 e 0012) e em TS (`lib/dominio.ts`, rótulos e classes). Divergem por edição isolada sem que nada acuse.
7. `fn_gerar_itens_pendentes` mudou a janela de 60 para 90 dias entre 0005 e 0012, mas a faixa `programar` da view continua em ≤60 dias — itens podem ser criados para colaboradores ainda com status `ok`.
8. `data_limite_marcar` existe duas vezes: como coluna gerada em `itens_pendencia` (0011) e como expressão calculada em `vw_status_colaborador` (0012). São definições paralelas da mesma regra (vencimento − 7).
9. `historico_item` e `auditoria_colaborador` são descritas nos comentários como trilha de auditoria inviolável, mas a proteção vem da ausência de policies, não de um trigger que bloqueie UPDATE/DELETE.
10. [lib/cron.ts](lib/cron.ts#L15) deixa as rotas de cron **abertas sem autenticação** quando `CRON_SECRET` não está definido e `NODE_ENV !== "production"`. É deliberado e comentado, mas depende de o ambiente de preview da Vercel reportar `production`.
11. `components.json` declara `iconLibrary: "lucide"`, porém `lucide-react` não está no `package.json`; os ícones usados vêm de `components/icones.tsx`.
12. [docs/contexto-atual.md](docs/contexto-atual.md) está datado de 02/09/2026 e menciona "12 migrations aplicadas"; hoje há 14 (0013 e 0014 vieram depois). O mesmo documento afirma que a base real ainda não foi importada — coerente com a ausência de pipeline de import.
13. `eventos_requisito.documento_url` (bucket `asos`) e `documentos_colaborador.storage_path` (bucket `documentos`) guardam anexos em dois lugares com políticas de leitura diferentes: `asos` é legível só por QSMS/admin, `documentos` também pela equipe do supervisor.
14. `vw_status_colaborador` foi redefinida em 0012 trocando a referência de `data_documento` para `coalesce(data_realizado, data_documento)`; a coluna do retorno continua se chamando `ultimo_documento`, o que passou a ser um nome impreciso.
