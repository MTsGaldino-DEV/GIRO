# Memória compartilhada — GIRO

Atualizada em 23/10/2026. Continuidade entre Claude e Codex.
[Perfil geral](../MEMORIA_COMPARTILHADA.md) · [Catálogo](../CATALOGO_FUNCIONALIDADES.md).

## Entrada e evidências

Ler `contexto_geral.md`, `docs/identidade-visual.md` e esta memória.
O contexto geral é auditoria de 08/09; `docs/contexto-atual.md` é snapshot
mais antigo, de 02/09. Não tratar seus números/estado do banco como atuais.
Analisados manifestos, rotas, componentes, tokens, documentação e Git.
Não houve consulta ao banco, envio de e-mail ou teste de aplicação.

## Propósito e arquitetura

Gestão integrada de requisitos ocupacionais, inicialmente ASO da UEN 211.
Cada vencimento vira tarefa com dono e prazo: supervisor libera o colaborador,
QSMS agenda/acompanha documento, e histórico registra as transições.

- Next 15.5, React 19, TypeScript, Tailwind 4, Supabase SSR/Auth/Storage,
  Radix/shadcn, Zod, Resend e Vercel/cron.
- `app/(app)/qsms/`, `supervisor/`, `admin/`: áreas por papel.
- Dados/regras em `lib/dominio.ts`, `tipos.ts`, `consulta-itens.ts`,
  `consulta-colaborador.ts` e `supabase/migrations/`.
- `lib/supabase/`: separar browser, servidor e cliente administrativo.
- Papéis admin, qsms e supervisor; visibilidade de equipe e regras devem ser
  garantidas também no banco.

## Design que precisa ser preservado

Fonte: `app/globals.css` e `docs/identidade-visual.md`.
Inter no texto, fallback mono JetBrains/Consolas, petróleo `#0E7C74`,
grafite `#23262B`, fundo quente `#F2F1EC`, sidebar `#132523`.

**Regra explícita:** verde, âmbar, coral e vermelho são exclusivos do semáforo
de conformidade. Não usar essas cores em botões, links ou navegação.
Ação e navegação usam petróleo/grafite. O preto de vencido também não é a
cor da sidebar. Ausência de registro tem o mesmo peso operacional de vencido.

Tabelas densas, números tabulares, controles de pelo menos 42 px, foco visível,
movimento reduzido e pesos moderados. A intenção de contraste/status é
específica do GIRO; não aplicar a paleta de status do Warefly por conveniência.

## Referências reutilizáveis

| Fluxo | Onde estudar |
|---|---|
| Pendência com dono, etapa e SLA | `supabase/migrations/0002_maquina_estados.sql`, `lib/dominio.ts`, `components/ficha-item.tsx` e `timeline.tsx`. |
| Painel com filtros e ações por linha | `app/(app)/qsms/page.tsx`, `components/tabela-itens.tsx`. |
| Dashboard com “onde está a bola” | `app/(app)/qsms/dashboard/`, `components/grafico-conclusoes.tsx`. |
| Perfil de colaborador em painel flutuante | `components/perfil/painel-perfil.tsx`, `contexto.tsx`, abas e `botao-nome.tsx`. |
| Edição campo a campo | `app/(app)/qsms/colaborador/[id]/cadastro/campo-editavel.tsx`, `ficha-cadastro.tsx`, `lib/campos-colaborador.ts`. |
| Documentos privados e histórico | `components/perfil/aba-documentos.tsx`, `editar-documento.tsx`, `lib/storage.ts`. |
| Digest semanal por responsável | `lib/email-semanal.ts`, `app/api/cron/email-semanal/route.ts`. |
| Geração periódica de tarefas | `app/api/cron/gerar-itens/route.ts` e migrations de geração. |

## Regras e limites conhecidos

- Comparecimento não é conformidade: só documento/resultado apto resolve a pendência.
- Máquina de estados no Postgres, com responsável, prazo e trilha automática.
  Não duplicar transições só em React.
- Contexto registra janela de geração de 90 dias, semáforo com faixas próprias
  e periódico de 12 meses. Há pendências de negócio sobre periodicidade/AVP,
  clínicas, ausências e saída de inapto; não inventar regra nova.
- Uploads em buckets privados usam URLs assinadas; avaliar quem pode ler cada
  tipo de documento, inclusive supervisor.
- Importação de colaboradores existe desde 03/11/2026
  (`scripts/importar-ativos.mjs`, ver seção no fim). ASOs históricos ainda
  não têm importador: entrada é manual pela base/ASO retroativo.
- Aba Treinamentos e outras lacunas estão documentadas; não prometer treinamento
  funcional por existir uma rota.
- `docs/plano_mvp.md` e `docs/plano_acao_fase.md`, citados por documentação,
  não foram encontrados no inventário atual.

## Comandos e verificações

`npm.cmd run dev`, `npm.cmd run typecheck`, `npm.cmd run build`.
Existe script `lint` (`next lint`); sua execução não foi validada nesta tarefa.
Não há runner unitário no manifesto. Testes E2E com Playwright (03/11/2026):
`npm.cmd run test:e2e` (ou `test:e2e:ui`); config em `playwright.config.ts`,
specs em `e2e/`, só Chromium instalado. Sobe `npm run dev` na porta 3000 ou
reaproveita o servidor já rodando. Hoje há só o smoke da tela de login
(passou); fluxos autenticados ainda não têm sessão de teste.

`scripts/teste-fluxo.mjs` e `teste-rls.mjs` são integração com banco e
criam/alteram dados de teste. Seeds, db-push e crons também têm efeitos reais;
não executá-los como verificação documental.

O contexto antigo lista edição de cadastro “não commitada”; o Git atual já
tem commit de edição campo a campo. Preservar a diferença temporal.
Nesta tarefa foram criados apenas memória e pontos de leitura.

## Retomada — 03/11/2026 (Claude)

- `typecheck` e `build` passaram limpos; `main` sincronizada com `origin`
  (último commit d9a8592, 08/09). Banco não consultado.
- Sem `.vercel/` local: não confirmado se há deploy (pode ser via GitHub).
- `data/Colaboradores_211.xlsx` existe localmente (ignorada pelo Git) — é a
  entrada do importador que ainda não existe.
- Levantamento para produção entregue a Matheus. Bloqueantes: importador da
  base real, ambiente de produção (Supabase + Vercel + env/CRON_SECRET +
  Resend + redirect do Auth), contas reais sem seed. Inconsistência a decidir:
  geração em 90 dias vs. faixa `programar` em 60.
- Mesmo dia: `npm run dev` sobe e `/login` renderiza, mas o host Supabase do
  `.env` dá NXDOMAIN (inclusive em 8.8.8.8/1.1.1.1) — projeto pausado ou
  excluído. Sem banco, nenhum login funciona até restaurar ou criar projeto.
  Matheus restaurou o projeto no mesmo dia; voltou a responder.

## Redesign visual do QSMS — decisões de 03/11/2026

Supervisor fora do escopo por ora. Spec ainda não escrita; mockups locais em
`.superpowers/brainstorm/` (ignorado pelo Git).

- QSMS entra no **Dashboard** depois do login (hoje cai no Painel).
- Sidebar vira **navegação no topo** (faixa escura #132523, cartões sobrepostos
  à faixa, como a referência "Employees" que Matheus enviou); Cadastros e
  Administração em menus suspensos.
- **Painel = grade de cartões** (sem alternar para lista). Cartão: foto,
  nome, cargo, selo de status, vencimento, supervisor, etapa e com quem está.
  Semáforo só no selo.
- **Dashboard = "ação primeiro"**: saudação, 3 números de urgência
  clicáveis, lista "parados há mais tempo" com botão de ação, "onde está a
  bola" (supervisão × QSMS), rosca de status, curva, vencimentos à frente;
  ranking de supervisores no fim (decisão do Claude, a confirmar).
- **Login**: fundo animado "papel de eletro" (grade de ECG, varredura do
  traço, onda saindo do símbolo oficial do GIRO), estrutura da central-neo.
- **Menos texto**: no máximo uma frase sob cada título; explicações em ⓘ.
- **Perfil do colaborador**: deixou de ser gaveta lateral e virou **janela
  ampla no meio da tela** (`DialogContent lado="janela"`: 1040px, altura
  fixa de até 860px, tela cheia no celular). Conteúdo mantido como estava por
  ora; o redesenho do conteúdo continua em aberto no brainstorming.
- **Animações aprovadas e já aplicadas** (commit 97717da, enviado): entrada da página,
  cartão que levanta, números contando (CSS @property), gráficos crescendo,
  pílula deslizante na navegação (hoje na sidebar; migra para o topo),
  barra de progresso no topo ao navegar e barra dentro do botão ocupado
  (`aria-busy` nos botões com `useFormStatus`). Corrigido também erro de
  hidratação preexistente no `<title>` do gráfico de conclusões.
- Lentidão ao trocar de aba: medida em dev, o grosso é compilação sob demanda
  (6–9 s na 1ª visita; 0,4–1,3 s depois). Medir em build de produção antes de
  otimizar.
- `npm run lint` não está configurado (abre assistente interativo).

### Implementado em 03/11/2026 (Claude, sem commit ainda)

Matheus pediu "aplique o que falta" — feito direto, sem documento de spec.

- **Navegação no topo**: `components/barra-topo.tsx` substitui
  `components/sidebar.tsx` (removido). Dashboard e Painel à vista; Cadastros
  e Administração em menus suspensos (Radix); menu da conta à direita
  (trocar senha, sair). Pílula deslizante + sublinhado + sombra no hover
  migrados para o topo. Celular: só ícones.
- **Faixa escura**: `.faixa-app` (10,5rem de #132523 abaixo da barra). O
  cabeçalho da tela fica sobre ela — `.cabecalho-pagina` inverte as cores
  (CabecalhoPagina, cabeçalho do colaborador, FichaItem, trilha do item).
  Tela nova com cabeçalho próprio precisa dessa classe.
- **Painel em cartões**: `components/grade-itens.tsx` (era
  `tabela-itens.tsx`). Ordenação virou seletor "Ordenar por". Cartão no
  formato da referência (ajuste pedido por Matheus no mesmo dia): foto no
  centro em cima, nome, cargo, selo; supervisor e etapa; no canto, número
  grande de dias até o vencimento (ou "dias vencido"/"sem data"); aviso de
  janela útil num ⓘ ao lado do número.
  `POR_PAGINA` = 24 (divide por 2, 3 e 4 colunas).
- **Dashboard "ação primeiro"**: saudação; 3 números (Vencidos, Sem
  registro, Fora do prazo = `sla_estourado`) — escolha do Claude; parados há
  mais tempo (top 5, botão "Agir"); onde está a bola (supervisão × QSMS);
  curva; rosca de status (`components/rosca-status.tsx`, tons do selo
  misturados via color-mix); vencimentos à frente; ranking por supervisor
  no fim. Os 6 cartões de contagem saíram do dashboard (seguem no Painel).
- **Login "papel de eletro"**: `components/casca-login.tsx` nas três telas
  de acesso (entrar, recuperar, redefinir). `marca-vertical.tsx` removido.
- **QSMS/admin entram em `/qsms/dashboard`** (`rotaInicial`).
- **Menos texto**: `components/info.tsx` (ⓘ com dica em CSS) na faixa de
  aviso, no dashboard e nas descrições de Base, Supervisores, Ausências,
  Usuários e Desligados.
- Correções de passagem: grades com tabela usam `minmax(0,1fr)` (a tabela
  de Supervisores estourava a tela); recuo dobrado no ranking do dashboard.
- Verificado: typecheck e build OK; Edge headless em dashboard, painel,
  menu suspenso, base, supervisores, item, perfil e login (desktop e
  390px). Um aviso de hidratação de id do Radix no menu da conta apareceu
  uma vez durante recompilação do dev e não se repetiu em cargas diretas.
- **Lentidão ao trocar de aba (medida 03/11/2026)**: em dev, a 1ª visita a
  cada tela compila (5–15 s); em `next start` a troca fica em ~0,5 s. Ganho
  aplicado: `middleware.ts` e `obterPerfil` usam `auth.getClaims()` em vez de
  `getUser()` — o projeto assina com ES256, então a assinatura é conferida
  localmente (JWKS em cache) e somem duas idas ao Supabase Auth por clique.
  Resposta do servidor caiu de ~350–470 ms para ~130–220 ms (mediana).
  Acesso revogado continua barrado na hora pela consulta a `perfis.ativo`;
  sessão encerrada em outro aparelho vale até o token vencer (1 h). Ações de
  gravação seguem com `getUser()`. Verificado: login, sair e acesso sem
  cookie voltam para /login. Picos ocasionais de 2–3 s vieram do Supabase.
- Pendente: área do supervisor
  segue com o layout novo mas sem redesenho; redesenho do conteúdo do perfil.

## Base real importada — 03/11/2026 (Claude)

Matheus autorizou trocar os fictícios pela lista `import/ATIVOS 211 -
031126.xlsx` (256 ativos: matrícula, nome, cargo, admissão, CPF, RG).

- Importador: `scripts/importar-ativos.mjs` (`npm run importar -- "<xlsx>"
  [--simular]`). Upsert por matrícula com auditoria campo a campo (origem
  "Importação: <arquivo>"); real ativo fora da lista vira desligado
  (`ativo=false`), não excluído; matrícula ≥ 90000 = seed, é apagada. Roda
  `fn_gerar_itens_pendentes` no fim e limpa arquivos órfãos do Storage.
  Idempotente: 2ª rodada deu 256 "sem mudança".
- Nascimento e local vêm de `data/Colaboradores_211.xlsx` (243 de 256 batem
  por matrícula e CPF), só preenchendo campo vazio. Situação dessa planilha
  antiga **não** é usada (estaria vencida); todos entram `trabalhando`.
  RG não é gravado (sem coluna, sem uso).
- Nomes e cargos ficam como na folha (caixa alta). CPF só dígitos.
- Estado após importar: 256 colaboradores, todos `sem_registro`, 256 itens
  `previsto`; 0 eventos, 0 documentos; Storage vazio. Contas de teste e
  "Supervisor de Teste" mantidos — este agora tem equipe vazia.
- `import/` entrou no `.gitignore` (CPF/RG). `seed:teste` agora recusa
  rodar se houver matrícula < 90000, salvo `--apagar-base-real` (trava não
  executada como teste — o seed é destrutivo).
- **Lacunas para operar**: nenhum colaborador tem supervisor (a lista não
  traz) — os 256 itens estão com dono "supervisor" sem ninguém; sem e-mail
  semanal por supervisor. Faltam também os ASOs anteriores (todos aparecem
  como sem registro) e o polo.

## Fonte documental no SharePoint — levantamento de 03/11/2026 (Claude)

- Origem: OneDrive de Neiliane (DP), compartilhado com Matheus, pasta
  `From G Suite Drive/2 - DEPARTAMENTO PESSOAL/DOCUMENTOS DE EMPREGADOS -
  GC GVA/1 - GV ATIVOS`. Lida pelo conector Microsoft 365 (só leitura;
  acesso por caminho funciona, então o nome da pasta basta como chave).
- 908 itens: uma pasta por pessoa da empresa toda (não só UEN 211), mais
  lixo ("Nova pasta (4..9)", "teste", "ASOS", 2 PDFs soltos) e duplicatas
  com sufixo (`1`, `- FROTA`, `- 211/- 212`, `-1`).
- Cruzamento com `import/ATIVOS 211 - 031126.xlsx` (256 ativos): 245 nomes
  exatos, 9 com grafia diferente (conferir), 2 sem pasta. Resultado em
  `data/mapa_sharepoint_211.csv` (ignorado pelo Git; sem CPF).
- Estrutura típica por pessoa: `ASOS/`, `ATESTADOS/`, `CERTIFICADOS/`,
  `DOCUMENTAÇÃO INICIAL/`, `GESET/` e PDFs soltos (NR10/NR35). Pastas
  novas às vezes têm só `ASO/`. Nomes de arquivo sem padrão
  ("ASO 2026.pdf", "ASO RT 2025.pdf", "ASO -NOME.pdf", JPGs de scanner).
- ASO é PDF escaneado: texto via OCR do Graph sai com ruído (datas
  "05102/26", caixas de tipo de exame ambíguas). Extração automática de
  data/tipo/aptidão exige revisão humana; o ano no nome do arquivo ajuda.
- `import/` NÃO está no `.gitignore` e a planilha tem CPF/RG — não
  versionar; avaliar mover para `data/` ou ignorar a pasta.
- Pendente (decidir com Matheus): inventário completo de ASOs por pessoa
  (≈500 leituras de pasta) e se o importador lê do SharePoint ou de
  cópia local.
- Decisões de Matheus (03/11/2026): documentos do SharePoint devem ir para
  o GIRO (bucket `documentos` + `documentos_colaborador`). Escopo: ASOs,
  avaliação psicológica e certificados NR. `GESET` = pasta de treinamentos
  (tratar como certificados; ASO lá dentro tende a ser cópia). Documentação
  inicial e atestados ficam fora. Caminho escolhido: Matheus baixa a pasta
  para o PC; Claude escreve importador local (simulação antes, gravação só
  com aval). Conector M365 só lê texto (OCR), não baixa arquivo.
- Download automatizado (03/11/2026, Claude): `node scripts/baixar-sharepoint.mjs
  [--so <matrículas>] [--destino <pasta>]`. Playwright abre o Edge para login
  Microsoft (sessão salva em `%LOCALAPPDATA%\giro-sharepoint-sessao`, fora do
  repo) e baixa via REST do SharePoint a pasta inteira de cada linha de
  `data/mapa_sharepoint_211.csv` para `Área de Trabalho\Colaboradores\<nome
  oficial>` no OneDrive de Matheus. Pula arquivo já existente com mesmo
  tamanho (retomável). Relatório em `data/download_sharepoint_211.csv`
  (ignorado). Resultado 03/11: 254 ok, 2 sem pasta (Helio 32472, Josue 37040),
  ~18.400 arquivos, 7,9 GB. Retenta quedas de conexão; erro grava só a 1ª
  linha (o "Call log" do Playwright vazava cookies de sessão no CSV).
- Planilha ATIVOS 211 (Área de Trabalho e `import/`, 03/11/2026): coluna G
  `supervisor` criada a pedido de Matheus; 28 matrículas com `VICTOR MENEZES DE SOUZA`
  e 32 com `KESIA PEREIRA SUDARIO` (4 casadas por nome parcial: Marcos Junio Passos, Anderson
  Camargo de Souza/Sousa, Jonison Natan, Diogo Rosa),
  demais em branco. As duas cópias são idênticas (Matheus copiou a da Área de
  Trabalho para `import/`); as cópias "(antes supervisor)" não existem mais.
  Ainda não refletido no banco do GIRO.
- 03/11/2026 (fim do dia): a pedido de Matheus, HELIO RODRIGUES DE SOUZA
  (32472) saiu da planilha ATIVOS 211 (as duas cópias, agora 255 pessoas) e de
  `data/mapa_sharepoint_211.csv`. A pasta "HELIO RODRIGUES DO NASCIMENTO" que
  Matheus pôs em `Colaboradores` é OUTRA pessoa (ASO 2021, almoxarife, RG
  diferente) e não está na planilha. Josue Oliveira Silva (37040) segue sem
  pasta no SharePoint. Só ASOs: 1.454 arquivos, ~0,44 GB (todos ≤ 8 MB,
  pdf/jpg/png) — vai para o Storage, não para o Postgres.
- Pendente (Matheus decide em 04/11): o que entra no GIRO. Proposta: importador
  das pastas ASOS com simulação antes de gravar; depois vincular supervisores.
