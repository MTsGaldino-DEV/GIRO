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
- **Faixa escura** (histórico, **removida em 17/11/2026**): `.faixa-app` ficava
  abaixo da barra do topo e o cabeçalho da tela se invertia sobre ela. Hoje o
  cabeçalho é grafite sobre o fundo cinza frio (ver "Redesign de UI/UX").
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
- **Regra de Matheus (05/11/2026): CPF, RG e dados assim nunca entram em
  commit.** Arquivos com esses dados ficam no `.gitignore` (`import/` e
  `data/*.xlsx|csv|json` já estão). Antes de commitar, conferir `git status`.
  Varredura de 05/11 contra CPF/RG reais: nada no histórico nem nos arquivos
  visíveis ao Git; os 11 dígitos de `scripts/seed-teste.mjs` não são reais.
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
- 04/11/2026 (Claude, a pedido de Matheus): na coluna G da planilha ATIVOS 211
  (as duas cópias, idênticas), MARCOS ROBERTO BICALHO (40782) foi para
  `VICTOR MENEZES DE SOUZA` e 34 matrículas da lista de Matheus foram para
  `VINICIUS DOS SANTOS`. Esse é o colaborador 23704, Supervisor Comercial II.
  Matheus escreveu "DO SANTOS", mas ficou a grafia oficial. Contagem: Victor 29,
  Vinicius 34, Kesia 32, 160 em branco. O banco segue sem supervisor real (só
  "Supervisor de Teste"; nenhum colaborador vinculado).
- 04/11/2026 (Claude): último ASO de cada pessoa → `Área de Trabalho\ULTIMO ASO
  211.xlsx` (255 linhas: matrícula, nome, data, arquivo lido, observação).
  A data foi lida no documento, não no nome do arquivo. O OCR do Windows
  (pt-BR) não lê a data manuscrita. Por isso o OCR só localiza "DATA:" e a
  data é conferida por leitura visual do recorte; as duvidosas foram cruzadas
  com as datas dos exames do mesmo ASO. Foram considerados os arquivos do ano
  mais recente mais os sem ano; avaliação psicológica (PSIC) ficou fora.
  Resultado: 237 com data (212 em 2026, 24 em 2025, 1 em 2024: Ivanmar
  23569). 18 sem data: 15 sem pasta ASOS, Josue 37040 sem pasta no SharePoint,
  e 2 com ASO inconsistente: Antonio Marcos 24273 (DATA 26/11/26, exames
  26/11/25) e Edgar 26417 (DATA 05/02/25 num "ASO 2026" com exames 05/02/26).
  A pasta do PEDRO ALVES BATISTA tem "THIAGO DA SILVA ASO.pdf", que foi
  ignorado.
- 04/11/2026 (Claude): última avaliação psicológica de cada pessoa →
  `Área de Trabalho\ASO E PSICOLOGICA 211.xlsx`, que traz também o ASO, o
  cargo e o vencimento (avaliação + 2 anos, regra dada por Matheus). Foi
  gravado como arquivo novo porque o `ULTIMO ASO 211.xlsx` estava aberto no
  Excel.
  - Fonte: arquivos PSIC/PISC/AVALIACAO_PSICOLOGICA em qualquer subpasta da
    pessoa. As datas são impressas, e cada uma foi conferida por recorte.
  - Os genéricos "AVALIACAO_PSICOLOGICA.pdf" são atestados de admissão de
    2020 a 2022, escaneados de lado; foram lidos girados e nenhum era mais
    novo que a avaliação escolhida.
  - Correções manuais: MENDERSON ficou com 11/12/2024 (antes saía 2021) e
    VALDEMIR com 19/10/2026.
  - Em 04/11/2026: 11 vencidas, 15 vencem em até 60 dias, 22 em até 6 meses,
    188 em dia e 19 sem avaliação. As sem avaliação são quase todas de
    cargos administrativos; de campo, só DIOGO MAGALHAES e EUZINEY.
  - Pendente: Matheus vai dizer quais cargos exigem avaliação psicológica.
- 04/11/2026 (Claude): Matheus completou à mão o `ULTIMO ASO 211.xlsx`: 17
  datas, com o caminho de cada uma na coluna "Obs.Matheus".
  - Antonio Marcos ficou em 2025 e Edgar em 2026, pela decisão dele.
  - As outras 15 vieram de pastas "ASO" ou "ASO S", que a primeira busca
    pulou por olhar só "ASOS".
  - `ASO E PSICOLOGICA 211.xlsx` foi refeito juntando as datas dele com a
    avaliação psicológica. Só JOSUE 37040 segue sem ASO.
  - Lição: procurar em todas as subpastas, não por nome de pasta.
  - Os 172 arquivos de ASO sem ano no nome, fora de ASOS (GESET e raiz da
    pasta; 235 páginas), foram lidos em 04/11 (OCR com rotação + leitura
    visual). São admissionais e periódicos de 2020 a 2022, mais algumas
    cópias de ASOs de 2026. Nenhum é mais novo que a data da planilha, então
    `ASO E PSICOLOGICA 211.xlsx` está com as datas mais atuais encontradas.
- 04/11/2026 (Claude): datas importadas no banco com `node
  scripts/importar-exames.mjs "import/ASO E PSICOLOGICA 211.xlsx"
  [--simular]`. A cópia da planilha está em `import/`, que é ignorada pelo Git.
  - Gravou 254 eventos de ASO Periódico e 236 de AVP: apto, `estimado = false`,
    com o arquivo de origem nas observações. São idempotentes: rodar de novo
    não duplica nada.
  - Decisão de Matheus: `exige_avp = true` para quem tem avaliação psicológica
    na pasta (236 pessoas), com auditoria "exige AVP". SUBSTITUÍDA no mesmo
    dia, ver "AVP por cargo de campo" abaixo.
  - Os 256 itens 'previsto' gerados na carga dos ativos (vencimento = dia da
    carga, nunca andaram) foram apagados e a fila refeita por
    `fn_gerar_itens_pendentes` (janela de 90 dias): 42 itens de ASO e 29 de AVP.
  - Semáforo do ASO em 04/11: 2 sem registro (Josue 37040, que Matheus mandou
    ignorar por ora, e HELIO RODRIGUES DE SOUZA 32472), 2 vencidos (Ivanmar e
    Maria Aparecida), 6 críticos, 13 em atenção, 6 a programar, 227 ok.
  - Semáforo da AVP: 11 vencidos, 3 críticos, 6 em atenção, 6 a programar,
    210 ok.
  - Pendente: HELIO 32472 saiu da planilha ATIVOS em 03/11, mas segue ativo no
    banco, e importar-ativos ainda não foi rodado de novo.
  - Pendente: os PDFs dos ASOs não foram para o Storage, então os eventos
    estão sem `documento_url`.
- 04/11/2026 (Claude, pedido de Matheus para "editar qualquer dado"):
  - O painel do perfil ganhou um lápis ao lado do nome, que leva à aba Cadastro.
  - Datas de exame passam a ser corrigíveis com lápis em "Exames realizados"
    (painel e tela cheia), só para admin. A Server Action é `corrigirDataExame`
    em `app/(app)/qsms/colaborador/[id]/aso/acoes.ts` e o componente é
    `components/perfil/data-exame-editavel.tsx`.
  - Ao corrigir, o vencimento do item aberto é reposicionado,
    `fn_gerar_itens_pendentes` roda na hora e a mudança vai para a auditoria
    ("data do documento (ASO Periódico)").
  - A tabela ganhou a coluna Requisito (ASO/AVP).
  - Typecheck e `next build` passaram; a tela não foi testada no navegador.
  - Caixa "Avaliação psicológica" (`exige_avp`) na aba Cadastro, no bloco
    Lotação e vínculo. QSMS e admin podem mudar, e ela grava ao clicar.
    - Ao marcar, roda `fn_gerar_itens_pendentes`.
    - Ao desmarcar, cancela via `fn_cancelar_item` o item de AVP em aberto.
    - O histórico registra "exige AVP: sim/não".
  - Painel /qsms voltou de cards para lista (tabela) a pedido de Matheus, com
    a coluna Requisito nova, porque a fila mistura ASO e AVP. O CSS
    `.cartao-item*` ficou, porque o dashboard usa `cartao-item__nome`.
  - Verificado com prints logado como teste.admin. A caixa não foi clicada,
    para não sujar dados reais.
  - Lista do painel:
    - Cabeçalho ordenável por clique (Colaborador, Vencimento, Status, Parado
      há): 1º clique na direção útil, 2º inverte, 3º volta à prioridade. O
      seletor "Ordenar por" saiu.
    - Busca com espera de 300 ms: só dígitos busca matrícula exata ou nome;
      texto busca "contém" no nome. Filtro novo por requisito.
    - "Só SLA estourado" virou "Só parados além do prazo da etapa", com ⓘ.
    - 25 itens por página.
    - Testado no navegador: "marcos", "23569", filtro AVP e ordenação.
  - Contadores por pessoa: a migration `0015_resumo_por_pessoa.sql` (aplicada)
    faz `fn_resumo_status` contar cada colaborador uma vez, no pior status
    entre ASO e AVP. Antes somava linhas (492 "pessoas", 437 em dia).
    `sla_estourado` segue contando itens, para bater com a lista filtrada.
  - AVP por cargo de campo (decisão de Matheus, 04/11, substitui "quem tem
    avaliação"): `exige_avp = true` para cargos INSTALADOR* e SUPERVISOR*
    (228 pessoas). Ficam de fora administrativos, almoxarifes, faxineiras e
    o aprendiz. HELIO 32472 é instalador, mas ficou
    desmarcado porque saiu da planilha. Aplicado por script avulso, com
    auditoria; os 5 itens 'previsto' de AVP de quem saiu foram apagados.
    Diogo Magalhães (39554) e Euziney (39354) entraram como AVP sem registro.
    Conferido com a coluna "AVP" que Matheus criou em
    `import/ATIVOS 211 - 031126.xlsx` (a cópia do Desktop NÃO tem a coluna):
    230 marcados. A única diferença eram os 2 agentes de serviços (Edson 35582
    e Adriana 27926), que a planilha marca; foram marcados no banco, com
    auditoria. A coluna AVP da planilha é a fonte. Hoje: 230 com AVP.
    Semáforo por pessoa: 256 no total, 4 sem registro (Diogo e Euziney na
    AVP; Helio e Josue no ASO), 8 vencidos, 7 críticos, 15 em atenção, 6 a
    programar, 216 em dia.
  - Pendente: os três logins de Matheus (matheusmatheus365, devmatheus94,
    matheus.galdino@engelmig) ainda são `qsms`. A promoção para `admin` foi
    bloqueada pela permissão do Claude Code, e a tela de usuários não troca
    papel.
- 03/11/2026 (fim do dia): a pedido de Matheus, HELIO RODRIGUES DE SOUZA
  (32472) saiu da planilha ATIVOS 211 (as duas cópias, agora 255 pessoas) e de
  `data/mapa_sharepoint_211.csv`. A pasta "HELIO RODRIGUES DO NASCIMENTO" que
  Matheus pôs em `Colaboradores` é OUTRA pessoa (ASO 2021, almoxarife, RG
  diferente) e não está na planilha. Josue Oliveira Silva (37040) segue sem
  pasta no SharePoint. Só ASOs: 1.454 arquivos, ~0,44 GB (todos ≤ 8 MB,
  pdf/jpg/png) — vai para o Storage, não para o Postgres.
- Pendente (Matheus decide em 04/11): o que entra no GIRO. Proposta: importador
  das pastas ASOS com simulação antes de gravar; depois vincular supervisores.
- 05/11/2026 (Claude, a pedido de Matheus): aba `Lista` de
  `import/ATIVOS 211 - 031126.xlsx` atualizada a partir da aba nova `TraceONE`
  (outro sistema de colaboradores) e das correções de Matheus. A cópia do
  Desktop NÃO tem TraceONE nem estas mudanças. Banco não alterado.
  - Agora são 254 pessoas: 194 com `matricula_cemig`, 227 com supervisor.
  - JACKSON ANTUNES MIGUEL DA SILVA (23822) saiu da Lista: Matheus informou que
    deixou a empresa, embora a lista da folha de 03/11 o trouxesse. Segue ativo
    no banco até rodar `importar-ativos`.
  - Supervisor: a TraceONE só preencheu campo vazio. Nas 7 divergências que
    Matheus corrigiu, a Lista estava certa, então o valor existente foi mantido.
    Roberto Carlos (27758) ficou com Pedro por correção dele. "Pedro" na
    TraceONE = PEDRO GABRIEL DE SOUZA.
  - Líderes ficaram sem supervisor: Elton, Pedro e Vinicius apontam para si
    mesmos, Kesia e Victor para "Breno" (gc da TraceONE). BRENO DA ROCHA SANTOS
    (28413) da Lista é instalador sob Elton; não assumir que é o mesmo Breno.
  - Casamento por nome: 158 exatos + 36 por grafia diferente, conferidos um a
    um. Os menos seguros: Edmilson Gois → 23794 e Igor Rittely Silva De Oliveira
    → 32737 (SEGALO na Lista).
  - Técnica: a coluna AVP usa caixa de seleção nativa do Excel
    (`featurePropertyBag`), que o openpyxl perde ao salvar. Editar o XML direto
    ou pelo próprio Excel. A Lista está salva com filtro ativo em Cargo (229
    linhas ocultas).
  - Decisões de Matheus no mesmo dia: Walter (28188) = e238561; Leno (34707) =
    Elen; Guilherme Onorato (33941) = Vinicius. Lucas Gomes Rodrigues (e265578)
    provavelmente não é da UEN 211 e saiu da TraceONE (na Lista nunca esteve;
    LUCAS RODRIGUES DE LAERTE 29672 é outra pessoa). Agora: Lista com 254
    pessoas, 195 com matrícula Cemig, 227 com supervisor; TraceONE com 247
    linhas.
  - Pendente com Matheus: Sidney Gomes da Silva. Ele indicou e230854, que antes
    estava como "já saiu", e não há Sidney na Lista nem nas outras planilhas e
    pastas locais. Sem matrícula Engelmig não dá para criar a linha.
  - Pendentes que Matheus vai resolver aos poucos, com novas listas para bater
    na aba Lista: 21 sem supervisor e as linhas da TraceONE sem par na Lista.
  - Aba `Digiteam` (matrícula Cemig + nome, 269 linhas; o nome vem com a
    matrícula na frente e cortado em 30 letras), batida com a Lista: 32
    matrículas preenchidas (3 por grafia: Felipe Vieira, Mateus Floriano,
    Samella). Agora 227 com matrícula, 27 sem. Confirmou Edmilson e Igor.
  - Emerson (27114) = e249842, confirmado por Matheus. Ele não sabe de onde vem
    e247558, que segue só na TraceONE.
  - Euziney, Leno, Luciano, Menderson, Pedro Gabriel e Vinicius dos Santos não
    constavam na Digiteam; a matrícula deles veio da TraceONE, motivo
    desconhecido. A pedido de Matheus, viraram 6 linhas no fim da aba Digiteam
    com a coluna nova `observacao`. Essas linhas não vêm do sistema Digiteam.
  - Sidney não está mais ativo (Matheus): não entra na Lista.
  - A aba Digiteam agora tem 275 linhas: as 269 do sistema (nada foi retirado,
    Matheus só não quer os sem par incluídos na Lista) e as 6 acima. Coluna nova
    `ativo/inativo`: 227 ativo (estão na Lista), 12 inativo ("já saiu") e 36 em
    branco, sem informação (35 a identificar e Helio). A TraceONE fica como
    está. `e273500 Marcos Vinicius da Silva` segue sem par seguro na Lista.
  - 05/11/2026 (Claude, lista colada por Matheus: 55 nomes "vinculados ao PEDRO
    GABRIEL DE SOUZA"): 53 casaram com a Lista (6 por grafia: Jose Vicente
    Ferreira 26321, Matheus Tiago 29870, Rodrigo Morais 23762, Roberto Carlos
    27758, Wesley 37071, Wesley Levy 26330) e 47 já estavam com Pedro. Gravada
    a coluna H (supervisor) de 6: Walison 26463 e Bruno Chaves 39903 (eram
    VICTOR MENEZES DE SOUZA) e Gabriel Stayner 39219, Douglas 39487, Miguel
    Arcanjo 40324 e Gerildo 39935 (estavam em branco). Contagem na Lista: Pedro
    75, Elton 39, Kesia 38, Vinicius 36, Victor 28, Daniel 11, Elen 4, 23 em
    branco. Gravado direto em `import/ATIVOS 211 - 031126.xlsx` depois que
    Matheus fechou o Excel (só sheet1 e sharedStrings alterados; AVP e demais
    abas intactas). O arquivo provisório "(Pedro)" foi apagado. Sem par na Lista, ficam de fora: Helio Rodrigues de Souza
    (32472, saiu da Lista em 03/11; e223657 na Digiteam) e Kalebe Virgilino da
    Silva (e272766 só na Digiteam, sem matrícula Engelmig para criar a linha).
    22 pessoas (2 inativas) seguem com Pedro na Lista sem estar na lista colada;
    mantidas, aguardando Matheus. Banco não alterado.
  - Pendente: refletir supervisor e matrícula Cemig no banco.
    `scripts/importar-ativos.mjs` não lê esses dois campos, e não há
    `matricula_cemig` no código.

## Planilha `import/ASOS GV 2026.xlsx` — análise de 05/11/2026 (Claude)

Controle mensal de ASOs do QSMS em 2026 (uma aba por mês, a empresa toda).
A análise em si foi só leitura e os PDFs não foram abertos. O que Matheus decidiu
depois está no último tópico desta seção.

- **Filtro**: UEN `21100` (268 linhas) mais `211` (46 linhas, abas de maio a
  setembro), a mesma unidade abreviada, confirmado por Matheus. Total de 314 linhas; 247 dos 256 ativos do GIRO aparecem. Casamento
  por CPF (hash, sem imprimir), matrícula e nome: nenhuma matrícula divergiu.
  51 linhas sem par na base (22 pessoas com demissional em 2026).
- **Armadilhas**: colunas mudam de posição entre abas; há linhas ocultas e
  observações em colunas sem título. Datas com dia ≤ 12 podem estar com dia e mês
  trocados (118 de 314; 22 confirmadas pelo banco). Há 3 anos errados (2027, 2029)
  e 5 datas malformadas. Status com mais de 20 grafias. "Data Agend." é agendamento,
  não data do documento. O status atrasa: 3 das 5 linhas "enviado" antes de
  novembro já têm ASO no banco.
- **Conferência do banco**: das 215 pessoas comparáveis, 141 com data igual, 56
  com até 7 dias de diferença e 18 acima disso (4 explicadas: 3 anos errados e
  24722). Conferir no PDF 31862, 28199 e 24490. "Prox. Exame" é igual ao vencimento
  do GIRO em 20 dos 25 periódicos de nov/dez (1 difere 2 dias, 2 refizeram em
  setembro, 2 sem data): indício a favor dos 12 meses.
- **Resolve lacunas, se o PDF confirmar** (comparecimento não é conformidade):
  ASO de 37040 (05/03/2026), 32472 (06/10/2026; saiu da Lista em 03/11, motivo a
  confirmar) e 24722 (06/05 ou 05/06/2026); AVP de 39354 (11/05/2026) e 39554
  (05/06/2026). 29354 fez exame com AVP em 29/10 e aguarda documento.
- **Demissionais**: 23569, 23485 e 34712 (exame em 04/11/2026, "enviado"). 39943
  em outubro, com UEN em branco nessa linha. Desligados no banco em 05/11 (ver abaixo).
- **Fila real nov/dez** (27 linhas sem "recebido"): 11 sem agendamento, 4 agendadas
  (23916, 23940, 26281, 23793), 9 com data já passada e sem ASO no banco, 3
  demissionais. No GIRO, os 70 itens abertos estão em `previsto`, sem agenda. O
  GIRO pegou 2 vencimentos fora dessas abas: 24273 (26/11) e 32716 (16/12).
- **Av. Psic.**: S indica AVP com aquele exame. Em todas as abas, a AVP do banco
  fica a até 30 dias do exame em 88 de 119 linhas S e 3 de 123 linhas N. Em nov/dez,
  bate com a regra de 2 anos em 13 de 16 S e 9 de 9 N; divergem 23940, 23916 e
  23793. AVP vencida com N em exame de 2026: 26376, 23688, 23802, 29248. 34735
  trocou para instalador com AVP S em 10/09; no GIRO segue almoxarife sem AVP.
- **Outros usos**: clínicas (banco só tem ENGESEG; planilha: ENGESEG 173, CEDOV 53,
  EQUILIBRIO 39, CLIMEP 21, GUANHAES 7, CONAST 4 e avulsas; sem endereço nem
  contato). Tipo do exame e clínica por evento (hoje todos "ASO Periódico" e 0 de
  490 com clínica). Exame real caiu em mediana 17 dias antes do vencimento (p90 =
  38; 5 de 135 acima de 60), dado para a decisão 90 × 60. 6 dos 36 "a identificar"
  da Digiteam têm demissional em 2026 (casamento por nome).
- **Pouco ou nada útil**: Local (valor único; não resolve polo), Férias (só 4 nomes
  digitados ali), E-mail (marca eSocial, fora do escopo), LECOM, Encaminhamento,
  Cargo (a folha prevalece). Supervisor preenche só 2 dos 27 vazios (24722 e 32716)
  além da própria Kesia; 5 divergências, e a Lista prevalece.
- **Decisões de Matheus (05/11/2026)**:
  - Os 4 demissionais ficam inativos. Gravado: `ativo = false` e auditoria, como o
    botão Desligar; os itens abertos ficam e saem da tela. Semáforo por pessoa: 252
    no total, 4 sem registro, 7 vencidos, 7 críticos, 15 em atenção, 6 a programar,
    213 em dia.
  - Os 4 ficam na aba `Lista` (decisão de Matheus). Ela ganhou a coluna J
    `ativo/inativo`: 4 inativos, 250 ativos. Em `import/ATIVOS 211 - 031126.xlsx`, a
    cópia do Desktop não tem. Edição direta no XML, conferida: colunas A a I e demais
    abas sem diferença.
  - `importar-ativos` agora trata "inativo" como fora da lista, para não reativar.
    Simulado, sem gravar: 250 sem mudança, 0 reativados, 2 desligados (32472 e 23822).
  - Hélio 32472: Matheus não sabe por que saiu da Lista. Segue ativo e sem registro
    no banco; `importar-ativos` o desligaria. Jackson 23822 está no mesmo caso.
  - PDFs dos 5 casos (ASO de 37040, 32472, 24722; AVP de 39354, 39554): Matheus não
    localizou. Nada foi registrado, e eles seguem como lacuna.
- **Decisão de Matheus (05/11/2026): as datas lidas nos documentos são a fonte mais
  confiável, e nada as substitui.** A planilha não atualiza etapas nem status e não
  adiciona clínicas. A carga da fila só foi simulada, nunca gravada, e o script foi
  removido. Não propor de novo sem novo pedido.
- Pendente: 7 admissionais sem par na base e sem demissional.

## Versão futura — referência IndexMed (levantamento de 04/11/2026, Claude)

**Decisão de Matheus (04/11/2026): o GIRO segue só com ASO.** Integração
com folha e os módulos abaixo ficam guardados para uma versão futura. Não
abrir esse escopo sem novo pedido.

Referência de sistema: https://indexmed.com.br/home (plataforma SaaS de SST).

### Como a IndexMed integra com Senior/SAP

- Não há conector pronto. Há a API pública **Conecta**: REST, Bearer token
  por integração, limites de chamadas (gravação: 2/s, 3.000/dia). Sem
  webhooks; nenhum endpoint cita Senior/SAP/TOTVS.
- Especificação pública em `indexmed.com.br/conecta/swagger/docs/V1`.
- Truque central: cadastro aceita o **código interno do ERP**
  (`cd_interno_unidade`, `cd_interno_setor`, `cd_interno_funcao`), então a
  folha não precisa conhecer os IDs da IndexMed.
- Folha → IndexMed: empresa, unidade, setor, função, colaborador, afastamento.
  IndexMed → folha: eventos eSocial S-2220/S-2240/S-2210, PDF do ASO,
  prontuário, atestados. Do lado da folha, uma rotina agendada chama a API
  (inferência; o site não detalha).
- A Senior tem o **Integrador SST** (fornecedores homologados por API ou
  arquivo; envia cadastro, recebe eventos eSocial). A IndexMed não estava na
  lista de homologados nem "em homologação" em 04/11/2026. A Senior comprou
  a Salú (saúde ocupacional).

### Caminho de integração para o GIRO (quando voltar ao tema)

A matrícula já é chave única e faz o papel do código interno;
`scripts/importar-ativos.mjs` já faz upsert por matrícula com auditoria.
Degraus: (1) importação agendada de relatório exportado pela folha;
(2) endpoint de entrada com token; (3) expor status do ASO de volta.
Falta saber de Matheus qual é a folha da empresa (Senior, SAP ou as duas).

### Funcionalidades da IndexMed que o GIRO não tem

- Próximas do ASO: periodicidade por cargo/setor/faixa etária com protocolo
  de exames (PCMSO); tipos de exame além do periódico (admissional, retorno,
  mudança de função, demissional); aptidões no ASO (altura, confinado — liga
  com AVP); atestados e afastamentos com dias e custo; treinamentos;
  clínicas, agendamento e guia de encaminhamento.
- Ampliam escopo: app do colaborador (envio de atestado/ASO, CIPA), aviso por
  WhatsApp, assinatura digital de documentos, ficha clínica e prontuário,
  API pública.
- Outro produto (SESMT/consultoria): eSocial, PGR/inventário de riscos e
  GHE, planos de ação, LTCAT, CAT, EPI, máquinas, brigada, psicossocial NR-1
  (COPSOQ, HSE-IT).
- Diferencial do GIRO a preservar: pendência com dono, etapa e prazo,
  supervisor liberando colaborador e "onde está a bola".

## Matrículas CEMIG na planilha — 05/11/2026 (Codex)

- Pedido: atualizar somente matrículas CEMIG faltantes na aba `Lista` de
  `import/ATIVOS 211 - 031126.xlsx`, quando o nome corresponder à lista enviada.
- Preenchidas 2 células por nome completo único correspondente. Matrículas já
  existentes preservadas; nomes sem correspondência segura ficaram sem alteração.
- Verificação da planilha atual: 251 pessoas, 228 com matrícula CEMIG e 23 sem.
  Esses números são do arquivo lido nesta tarefa; registros históricos acima
  descrevem versões anteriores.
- Edição direta do XML: somente `B60` e `B211` de `Lista` mudaram. Comparação
  confirmou todas as demais células e partes do XLSX idênticas, incluindo abas,
  estilos, filtros e caixas de seleção. Integridade ZIP e XML validada.
- Banco, importadores e outras planilhas não alterados. Pendente: identificar
  as matrículas restantes a partir de novas informações; sem associação aproximada.

## Commit do trabalho pendente — 06/11/2026 (Claude)

- Commit local `fe04cb0` (18 arquivos: telas, scripts e migration 0015). Não
  enviado ao `origin`. Sem padrão de CPF no que foi commitado.
- Typecheck passou. Build: 1 falha sem saída registrada e depois 2 execuções
  limpas, causa não identificada; havia `next dev` e servidor na porta 3000
  usando o mesmo diretório.
- Fora do commit: esta memória e `.dev-server.log`/`.prod-server.log`.
- Pendente com Matheus: esta memória traz nomes com matrícula, situação de ASO e
  desligamentos, o que conflita com a regra de não gravar dados pessoais. Decidir
  se ela é commitada, anonimizada ou movida para fora do Git.

## Desenho de telas e papéis — brainstorming de 10/11/2026 (Claude)

Conversa com Matheus, só desenho (nenhum código de produto alterado). Mockups em
`.superpowers/brainstorm/` (ignorado pelo Git): `dashboard-v3.html`,
`radar-v1.html`, `colaboradores-v2.html`. Retomar na **aba 4: Cadastros**.
Produção já existe em https://giro-neon.vercel.app/ (Vercel). Escopo: toda a UEN 211.

- **Papéis**: QSMS é o apoio e hoje faz boa parte do fluxo do ASO; a supervisão é
  quem controla a operação. Decisão final: supervisores e QSMS **leem e gravam em
  tudo** (inclusive cadastro e documentos); histórico de auditoria registra quem mudou.
  Isso exige afrouxar RLS e RPCs hoje restritas à equipe do supervisor.
- **Menu**: volta a ser **sidebar no estilo da NEO** (grupos que abrem/fecham, item
  ativo, cartão do usuário com Senha/Sair), com a identidade do GIRO (#132523, petróleo).
  Substitui a barra no topo de 03/11. Cores de semáforo só para situação do colaborador.
- **Dashboard (aprovado)**: visão da UEN inteira para todos; supervisor pode filtrar
  pela própria equipe. Seis cartões de semáforo (Vencidos, Sem registro, Críticos,
  Atenção, Programar, Em dia); cartões de processo (No radar, Agendados, Parados além
  do prazo, Concluídos no mês); por etapa; "Pendências por responsável" (barra
  Supervisão × QSMS + tabela por responsável); 20 mais próximos de vencer em lista
  rolável; outras métricas (% em dia, tempo médio por etapa, concluídos por mês).
  **Tudo clicável**: ao clicar, abre no fim da página a lista de quem está no número.
- **Radar (aprovado)**: entram vencidos, sem registro e quem vence em até 90 dias;
  vencidos e sem registro no topo como prioridade; sai quando há ASO apto novo.
  QSMS vê a UEN inteira, supervisor **só a equipe dele**. Sem coluna "Parado há".
  Botões por linha: **a redesenhar** quando Matheus definir as funcionalidades.
- **Colaboradores (aprovado)**: lista única para todos, com filtros; o supervisor abre
  já filtrado pela própria equipe e pode tirar o filtro. A aba "Minha equipe" deixa de
  existir. Perfil em janela com abas Visão geral, ASO, Documentos, Cadastro, Histórico.
- **Regra de negócio**: radar entra em 90 dias (casar a faixa `programar` da view, hoje
  60, com os 90); periódico = 12 meses.
- **Fonte de colaboradores = CENTRAL-NEO** (`public.colaboradores`: nome, CPF, matrículas,
  cargo, supervisor em texto, ativo). Sem data de último ASO: essa fica no GIRO.
  Proposta (ainda a confirmar): leitura só de leitura, diária e com botão "atualizar
  agora", gravando cópia no GIRO ligada pela matrícula Engelmig; supervisor vem em texto
  e precisa casar com o login. Matheus não entendeu o controle da NEO na 1ª explicação
  e a ordem de execução (sincronização × telas) ficou sem resposta.
- **Entrada contínua** (admissões/desligamentos): por enquanto manual.
- **Pendente**: aba 4 Cadastros (Base, Supervisores, Ausências; minha proposta: Base some,
  Supervisores vira só acompanhamento do vínculo, Ausências fica manual) e aba 5
  Administração; desenhar botões do Radar; tela de início/homepage (Dashboard mantido);
  escrever a especificação em `docs/superpowers/specs/`; depois plano de implementação.
- **Pendente de higiene**: memória compartilhada traz nomes/matrículas de colaboradores
  (conflita com a regra de dados pessoais); decidir anonimizar antes de enviar o commit
  `fe04cb0` ao `origin` (push publica na Vercel).

## Retomada de contexto — 11/11/2026 (Codex)

- Lidos memória local, perfil APPWEB, catálogo, contexto geral, identidade visual,
  instruções locais, documentos históricos e as quatro memórias do Claude do GIRO.
- Ponto de continuidade identificado inicialmente pela memória de 10/11, depois
  corrigido pela conversa do Claude de 11/11: Cadastros e Administração já discutidos;
  retomar ações do Radar. Ver decisões recuperadas abaixo.
- Conferência estática: layout ainda usa `BarraTopo`; guardas de acesso e políticas
  do banco ainda separam QSMS e supervisor. Sidebar, Radar, lista compartilhada de
  colaboradores e permissões ampliadas do desenho recente ainda não implementados.
- Existem importadores de ativos e exames e 15 migrations. O importador de ativos
  ainda não lê supervisor nem matrícula CEMIG. A view mantém `programar` em 60 dias,
  enquanto a geração de itens usa 90; alinhar conforme decisão de 10/11.
- Git local: `main` um commit à frente de `origin/main`, com `fe04cb0` no topo;
  memória já modificada e dois logs não rastreados antes desta leitura.
- Sem novas decisões funcionais. Nenhuma consulta ao banco, execução de aplicação,
  teste, importação, commit ou push nesta retomada; apenas leitura e este registro.
  Contagens operacionais e disponibilidade da produção não foram revalidadas.

## Cadastros e Administração — decisões de 11/11/2026 recuperadas do Claude

Matheus informou que Cadastros já havia sido decidido. Lida a conversa local do
Claude de 11/11 (sessão `5308c2e8-efb7-4538-9bd5-0e31b398ca12`). Ao final,
Matheus pediu atualização desta memória, mas a sessão atingiu o limite de uso
antes de fazê-la. Este registro substitui as pendências anteriores sobre esses temas.
Nenhuma implementação é autorizada apenas por esta recuperação de contexto.

- **Colaboradores / CENTRAL-NEO:** Matheus escolheu expressamente que o GIRO também
  escreva na NEO. QSMS e supervisores poderão criar colaboradores e corrigir cadastro
  pela tela Colaboradores. Não retomar a proposta de integração somente de leitura
  como se fosse a escolha atual.
- Desenho consolidado na conversa: lista única com filtros e filtro inicial da equipe
  do supervisor; gravação na NEO pelo servidor, com validação de identificadores e
  histórico das alterações. ASO, AVP, documentos, ausências e foto ficam no GIRO,
  ligados ao cadastro pela matrícula Engelmig. Desligamento preserva histórico,
  usando `ativo = false` e data de desligamento. Base deixa de ser tela separada;
  lançamento do último ASO fica no perfil. Matrícula imutável foi sugestão inicial
  do Claude, sem confirmação específica; não tratar como regra aprovada.
- **TraceOne:** fora da integração do GIRO. Matheus confirmou que o cadastro lá é
  necessário só para quem terá medidores; não escrever nos dois bancos pelo GIRO.
- **Supervisores — aprovado expressamente:** o texto da NEO é a fonte para vincular
  automaticamente a equipe à conta do supervisor. A tela Supervisores passa a
  conferir nomes sem vínculo e permitir resolver pendências. No cadastro do
  colaborador, escolher supervisor numa lista para evitar grafias diferentes.
- **Ausências:** calendário de férias por colaborador foi colocado por Matheus em
  ideias futuras, fora do foco atual. O Claude propôs manter registro manual no
  perfil e bloqueio de agendamento em ausência, retirar a tela própria do menu e
  adicionar filtro Ausentes. Não houve aceite explícito separado desse pacote;
  preservar a distinção entre proposta e decisão de adiar o calendário.
- **Administração — aprovado expressamente:** Desligados vira filtro em Colaboradores,
  com reativação; Gestão de usuários continua exclusiva do admin, incluindo troca
  de papel e vínculo do supervisor ao criar login. QSMS e supervisores não criam
  contas. A administração permanece com o responsável atual.
- **Ponto real de retomada: botões por linha do Radar.** Última proposta do Claude,
  ainda sem resposta: botão principal conforme etapa (pedir data, informar data,
  agendar, enviar à clínica, registrar resultado, anexar ASO/concluir, registrar
  tratativa); menu secundário para cancelar, devolver, perfil e histórico.
  Ambos os papéis operacionais podem agir; a indicação do responsável orienta
  quem deveria agir. Não considerar essa sequência aprovada nem inventar a saída
  do estado inapto. Depois, consolidar especificação e plano de implementação.
- Esta recuperação alterou somente a memória. Sem consulta a banco, mudança de
  produto, teste, commit ou push. Histórico de outros projetos não foi alterado.

## Ações do Radar e quem faz cada etapa — decisões de 13/11/2026 (Claude)

Só desenho; nenhum código alterado. Todas as ações já existem como Server Actions
em `app/(app)/qsms/acoes.ts` sobre funções do banco (`fn_solicitar_data`,
`fn_propor_data`, `fn_agendar`, `fn_enviar_clinica`, `fn_registrar_desfecho`,
`fn_concluir_item`, `fn_encerrar_inapto`, `fn_cancelar_item`,
`fn_devolver_ao_supervisor`, `fn_registrar_comparecimento`). Hoje só
`fn_propor_data` e `fn_registrar_comparecimento` aceitam o supervisor; as demais
exigem `fn_e_qsms()`.

- **Decisão expressa de Matheus:** o retorno da clínica é do **supervisor**. O
  colaborador volta, avisa se está tudo bem e entrega os documentos.
- **Decisão expressa:** o documento é anexado no mesmo momento do resultado, no
  botão **Registrar resultado**. A etapa "Aguardando documento" sai do fluxo normal.
- **Decisão expressa:** depois de concluído, o **QSMS lança o ASO no GESET**.
  Tarefa posterior, que não trava a conclusão.
- Desenho do botão (palpite do Claude, a confirmar): desfecho "fez e apto" exige
  ASO (anexo e data do documento) e conclui o item no mesmo passo, reiniciando os
  12 meses. Os outros desfechos não pedem documento (faltou, incompleto e retorno
  voltam ao supervisor; inapto trava).
- Responsáveis por etapa: Pendente (pedir data) QSMS; Data solicitada (informar
  data) supervisor; Data proposta (agendar) QSMS; Enviado à clínica (registrar
  resultado) supervisor; Inapto em tratativa QSMS. **Palpites sem confirmação:**
  Agendado/Enviar à clínica ser do QSMS e a tratativa do inapto ser do QSMS.
- **Trabalho de banco implícito:** abrir `fn_registrar_desfecho` e a conclusão ao
  supervisor; criar transição direta `enviado_clinica` → `concluido` num passo
  único (resultado + documento + conclusão), hoje só existe via
  `aguardando_documento`; atualizar `ETAPA_ACAO` em `lib/dominio.ts`, que ainda diz
  "lançar no GESET" na etapa de documento. Casa com a decisão de 10/11 de afrouxar
  RLS/RPCs para supervisor e QSMS.
- Menu secundário proposto (palpite): cancelar, devolver ao supervisor, informar
  dados ao supervisor, perfil e histórico.
- **Decisão expressa:** o GIRO guarda se o ASO foi lançado no GESET. Desenho
  (palpite do Claude): marca por ASO concluído, com quem marcou e quando, filtro e
  contador de "falta lançar no GESET" para o QSMS. Exige campo novo no banco e
  auditoria. Detalhe de tela em aberto.
- **Tela de início — aprovada por Matheus (13/11/2026):** sem tela nova. QSMS e
  admin entram no Dashboard (ganha cartão "Falta lançar no GESET"). Supervisor
  entra no Radar filtrado na equipe, com faixa "Para você agir" no topo (fila de
  informar data e fila de registrar resultado, com contagens); Dashboard segue no
  menu com filtro na equipe dele. Reaproveita `rotaInicial`; a faixa é a única
  peça nova.
- **Especificação 1 escrita (13/11/2026), aguardando aprovação de Matheus:**
  `docs/superpowers/specs/2026-11-13-telas-e-fluxo-design.md` (telas e fluxo:
  sidebar, Dashboard, Radar, Colaboradores, permissões, GESET, faixa de 90 dias).
  A especificação 2 será a integração com a CENTRAL-NEO (ordem decidida por
  Matheus). Seção 12b lista as calls do Claude a conferir. Não commitada.
  **Decisão expressa (13/11):** carga inicial da marca do GESET: "lançado" =
  pessoa regularizada; entram como já lançados quem tem mais de 90 dias de prazo,
  os demais ficam como "falta lançar". A marca vale para ASO e AVP (decisão
  expressa). Nada implementado.
- **Especificação 1 aprovada por Matheus (13/11/2026).** Plano escrito em
  `docs/superpowers/plans/2026-11-13-telas-e-fluxo.md` (16 tasks, migrations 0016
  a 0019, fases A banco, B casca, C Radar/fluxo, D Dashboard/Colaboradores).
  Aguardando revisão de Matheus e escolha do método de execução. Nada
  implementado, nada commitado.
- **Execução do plano — 13/11/2026 (Claude, subagent-driven, na `main` local,
  sem worktree por escolha de Matheus; sem push).** Fase A concluída e
  **migrations 0016 a 0019 aplicadas ao banco real** (Matheus autorizou por
  tarefa). Commits locais b1896c7..a24f5f1.
  - 0016: `fn_e_operador()` (admin, qsms, supervisor ativos). Funções do fluxo
    e políticas de colaboradores, eventos, itens, ausências, documentos,
    auditoria, histórico e buckets `asos`/`documentos`/`fotos` passam a aceitar
    o operador; clínicas e comunicação CEMIG também. Perfis, supervisores,
    tipos e alertas seguem restritos. Leitura de `documentos`/`fotos` no
    Storage estava aberta a qualquer autenticado e foi fechada.
    Pendências conhecidas: `perfis_escrita_qsms` ainda deixa QSMS escrever
    perfis (pré-existente); políticas `for all` dão DELETE direto ao
    supervisor (decisão consciente pendente); `scripts/teste-rls.mjs` foi
    removido (cobria o isolamento por equipe antigo; `teste:permissoes` o
    substitui).
  - 0017: `programar` = 90 a 31 dias, `ok` > 90. Efeito real na hora: 15
    pessoas passaram de Em dia para Programar (208→193 em dia, 11→26
    programar). README e contexto_geral foram atualizados em 13/11.
  - 0018: `fn_registrar_resultado` (resultado + ASO + conclusão em passo único,
    só para "fez e apto"), transição `enviado_clinica`→`concluido`, e `dono` de
    `enviado_clinica` = supervisor. Produção tinha 0 itens em
    `aguardando_documento`, 79 previstos e 2 cancelados.
  - 0019: marca "lançado no GESET" em `eventos_requisito`
    (`geset_lancado_em`/`geset_lancado_por`), `fn_marcar_geset`, view
    `vw_pendencias_geset`. Carga inicial: 404 já lançados (vencimento > 90 dias,
    com 404 linhas de auditoria "carga inicial") e 78 pendentes (73 visíveis na
    view; 5 são AVP de quem não exige AVP).
  - Testes de banco (rollback, sem resíduo): `npm run teste:permissoes`,
    `teste:semaforo`, `teste:geset`. O banco é um só; nunca rodar `db:push` sem
    `--only`.
  - 0020 (autorizada por Matheus à parte): `fn_registrar_resultado` passa a
    travar a linha do item (`for update`) contra duplo envio.
  - **Fases B a D concluídas no código (commits locais b1896c7..02ef7d4, 24
    commits, nada enviado ao `origin`).** Telas: sidebar no estilo NEO
    (`components/sidebar.tsx`, a barra do topo saiu); rotas `/dashboard`,
    `/radar` e `/colaboradores` (as antigas `/qsms`, `/qsms/dashboard`,
    `/supervisor`, `/qsms/base` e `/admin/desligados` redirecionam por 307 em
    `next.config.mjs`; as páginas de item e de perfil não mudaram de rota);
    entrada por papel (supervisor no Radar, QSMS/admin no Dashboard).
    Radar: entra vencido, sem registro e quem vence em até 90 dias (sem
    cancelados), filtro "Minha equipe / Todos", botão principal por etapa com
    menu secundário, "Registrar resultado" com o ASO anexado (supervisor),
    faixa "Para você agir", segmento "Falta lançar no GESET" com marcar e
    desfazer. Dashboard: seis cartões de semáforo, cartões de processo, por
    etapa, pendências por responsável, 20 mais próximos, métricas, e tudo
    clicável por `?detalhe=`; rosca, "vencimentos à frente" e "parados há mais
    tempo" saíram (Matheus confirmar). Colaboradores: lista única com
    filtros, Desligados com Reativar; controles que eram só de admin
    (desligar, data de exame, campos de identidade) estão abertos a todo
    operador. Base saiu: o "Lançar exame anterior" mora na aba ASO do perfil.
  - Verificação final (13/11): typecheck e build limpos; e2e 13/13 (a 1ª
    rodada teve 4 timeouts por compilação fria do `next dev`); testes puros
    `acoes`, `consulta`, `faixa`, `geset-ui`, `dashboard` e `colaboradores`
    passam; testes de banco `permissoes` 37/0, `semaforo` 16/0, `geset` 34/0;
    resíduo de teste no banco: 0.
  - **Avisos para a implantação:** (1) em produção nenhum colaborador tem
    `supervisor_id` (252 "Sem supervisor") nem polo; "Minha equipe" mostra
    vazio para supervisores reais até vincular (tela Supervisores já vincula;
    vínculo automático pela NEO é a especificação 2). (2) Qualquer operador
    pode editar matrícula/CPF/UEN/nome; trocar matrícula reaponta ASOs e
    documentos (há auditoria com valor anterior). (3) Desfecho diferente de
    "fez e apto" não leva documento; `fn_registrar_desfecho` não trava a linha
    (mesma corrida teórica, estado final igual). (4) "Minha equipe" do
    Dashboard só foi validada pela agregação, sem equipe real. (5) Não há
    coluna de data de desligamento (Desligados mostra só o rótulo).
  - **Revisão final e onda de correções (13 a 16/11/2026).** A revisão do
    conjunto achou problemas e foram corrigidos (commits b749e6a, 971760b,
    708ba49, 35ab2c8 no app; 47473f7, c71d2ac, 36060ff, fc6f033 no banco/app):
    - **0021 (aplicada ao banco real, autorizada por Matheus):**
      `fn_concluir_item` exige documento para apto e apto com restrição;
      `fn_registrar_desfecho` recusa `fez_apto`; `fn_registrar_comparecimento(true)`
      é recusado (o fluxo é "Registrar resultado"); `fn_registrar_aso_retroativo`
      ganhou `p_documento_url` obrigatório (assinatura antiga removida). Operador
      não tem mais INSERT/DELETE em `eventos_requisito`, `itens_pendencia` e
      `colaboradores`; UPDATE só por coluna (eventos: `data_documento`,
      `data_realizado`; itens: `data_vencimento`; colaboradores: as colunas que
      o app edita); DELETE só em `ausencias` e `documentos_colaborador`. Escrita
      em `perfis` só do admin. Storage `asos`: delete só do dono ou do QSMS.
    - **0022 (aplicada, autorizada por Matheus):** UPDATE no bucket `asos` só
      do QSMS/admin (antes qualquer operador movia ou sobrescrevia o ASO de
      outro e apagava em seguida).
    - **Decisões de Matheus na onda:** "Lançar exame anterior" fica aberto a
      todos os operadores, com o PDF do ASO obrigatório; o Dashboard continua
      sem rosca, "vencimentos à frente" e "parados há mais tempo"; a
      autorização para aplicar 0020, 0021 e 0022 no banco real.
    - Testes de banco agora: `permissoes` 66/0, `semaforo` 16/0, `geset` 34/0,
      sem resíduo. Rollback das migrations 0021 e 0022 guardado fora do repo
      (scratchpad da sessão). `scripts/teste-fluxo.mjs` está obsoleto (marcado).
    - **Aviso de implantação:** o app publicado (antes do push) erra em três
      pontos porque o banco já está na 0021: botão antigo "fez apto"
      (`fn_registrar_desfecho`), "compareceu" e "lançar exame anterior" (função
      antiga removida). Por isso o `git push` deve sair logo após a decisão.
      Reaplicar a 0004 ou a 0016 sozinha reabre políticas; depois, reaplicar
      0021 e 0022. Matheus deve confirmar os backups do Supabase (não dá para
      verificar por SQL).
    - **Adiado (menores):** operador ainda pode gravar data futura em
      `data_documento`/`data_vencimento` por escrita direta (sem auditoria);
      caminho do documento só é checado como não vazio, sem conferir o objeto
      no bucket; QSMS/admin podem mover objeto do `asos` para o bucket
      `documentos`.
  - **Pendente:** confirmação dos backups por Matheus, autorização para
    `git push` (publica na Vercel), vincular supervisores às equipes
    (`perfis.supervisor_id`) antes de usar, e a especificação 2 (integração com
    a CENTRAL-NEO). O ledger do plano está em
    `.superpowers/sdd/2026-11-13-telas-e-fluxo/progress.md` (ignorado pelo Git).

## Integração com a CENTRAL-NEO — especificação 2, fase 1 (16/11/2026, Claude)

- **Decisão:** o cadastro de colaboradores passa a ter fonte única na NEO
  (`c:\APPWEB\central-neo`). O GIRO guarda uma cópia ligada por
  `colaboradores.neo_id` e, **na fase 1, só lê**. Fases: 1 leitura e
  sincronização; 2 escrita na NEO (com histórico lá); 3 acabamento (página de
  estado, selo de fora de sincronia). As fases 2 e 3 dependem do relatório real
  da primeira carga. Spec: `docs/superpowers/specs/2026-11-16-integracao-central-neo-design.md`;
  plano: `docs/superpowers/plans/2026-11-16-integracao-central-neo-fase-1.md`.
- **Donos dos campos:** NEO = nome, cpf, matrículas, cargo, base, admissão,
  desligamento, ativo, supervisor (texto). GIRO = foto, exige_avp, situação,
  polo, local, nascimento, uen; `supervisor_id` é derivado do texto.
- **Construído (commits locais, nada empurrado):** função de leitura
  `giro-colaboradores` na NEO (só `listar`, segredo `GIRO_INTEGRACAO_SEGREDO`;
  pasta `supabase/` da NEO fica fora do Git); migrations 0023 (colunas,
  `supervisor_apelidos`, `neo_sincronizacoes`, normalizador) e 0024
  (`fn_sincronizar_neo`, modo relatório sem gravar); `lib/neo.ts`,
  `lib/sincronizar-neo.ts`, cron `/api/cron/sincronizar-neo` (08:30 UTC),
  botão "Atualizar agora", seção de nomes de supervisor sem vínculo,
  `scripts/neo-primeira-carga.mjs` (relatório por padrão).
- **Ainda NÃO feito (depende de Matheus):** deploy da função na NEO e definição
  do segredo; aplicar 0023 e 0024 no banco real (ensaiadas em transação
  desfeita, 87/0); relatório real da primeira carga; aplicar a carga (exige
  backup do Supabase confirmado). **Ordem:** aplicar 0023/0024 ANTES de
  publicar (a ficha do colaborador seleciona colunas novas).
- Achado que vale lembrar: no Supabase, `revoke ... from public` não tira o
  EXECUTE do `anon` (privilégio padrão direto); toda função nova precisa de
  `revoke ... from public, anon`.
- **Pendência de segurança achada (anterior à integração, não corrigida):** o
  `anon` executa 25 funções `SECURITY DEFINER` antigas; 24 têm guarda por
  papel/uid, mas `fn_gerar_itens_pendentes()` não tem. Quem tiver a anon key
  (pública no navegador) pode disparar a geração de itens (idempotente, mas é
  escrita). Correção para uma migration futura: `revoke execute ... from anon`
  nas funções que o app chama só logado, e da que só o cron usa.
- **Revisão final da fase 1 (16/11/2026) e correções:** a função da NEO precisa
  ser publicada com `--no-verify-jwt` (sem isso o Supabase responde 401 ao
  GIRO). `fn_sincronizar_neo` e `fn_registrar_falha_neo` agora só executam pela
  service role (as Server Actions conferem o operador e passam `p_usuario_id`).
  Aplicar com origem `cron`/`manual` só é aceito depois de uma primeira carga
  concluída (erro 55000). Novas divergências no relatório: `nome_diferente` (sem
  CPF para confirmar) e `matricula_duplicada_na_neo`. Ordem obrigatória:
  0023 → 0024 → deploy da função → relatório local → carga → push.
- **0023 e 0024 aplicadas no banco real em 16/11/2026** (autorizadas por
  Matheus); `teste:neo-sync` 95/0 sem ensaio, permissões 66/0, semáforo 16/0,
  geset 34/0. Faltam: deploy da função na NEO com `--no-verify-jwt` e o segredo,
  relatório da primeira carga, carga, push.
- **17/11/2026 — `.env.local`:** Matheus copiou para o GIRO as variáveis do
  projeto NEO (`NEO_SUPABASE_SERVICE_ROLE_KEY`, `NEO_DB_PASSWORD`,
  `NEO_DATABASE_URL`, `VITE_NEO_*`). A integração NÃO usa nenhuma delas: usa só
  `NEO_INTEGRACAO_URL` = URL da Edge Function
  (`https://dxcxoimvweeggrvtbmxb.supabase.co/functions/v1/giro-colaboradores`,
  não o site `central-neo.vercel.app`) e `NEO_INTEGRACAO_SEGREDO`, ainda ausentes.
  A chave de serviço da NEO no GIRO contraria a abordagem B (porta estreita):
  não levar para a Vercel; recomendado tirar do `.env.local`.
- **17/11/2026 — função publicada e primeira carga APLICADA (autorizada por
  Matheus).** Matheus publicou `giro-colaboradores` (com `--no-verify-jwt`) e criou
  o segredo nos dois lados. Conferido: 401 sem segredo e com segredo errado; com o
  certo, 311 cadastros lidos. Backups antes de aplicar, fora do repo:
  `C:\APPWEB\GIRO-backups\giro-public-antes-carga-neo-2026-11-17.json` (todas as
  14 tabelas do schema public; o backup automático do Supabase não pôde ser
  conferido, o CLI não tem acesso ao projeto do GIRO) e
  `...\colaboradores-antes-carga-neo-2026-11-17.json` (do script). Resultado:
  251 de 252 ativos ligados por matrícula, 228 com Matrícula CEMIG preenchida,
  0 divergências, 60 linhas da NEO com matrícula não numérica, 5 ativos do GIRO
  fora da NEO, 0 bases. Segunda rodada: 251 já iguais, nada alterado.
  7 nomes de supervisor da NEO sem vínculo (245 pessoas): basta cadastrar os 7
  supervisores no GIRO com o mesmo nome. Os scripts leem só `.env`: as variáveis
  NEO_INTEGRACAO_* estão só no `.env.local` (passadas pelo ambiente na carga).
  Faltam: variáveis na Vercel; cadastrar os 7 supervisores.
- **17/11/2026 — feito:** Matheus cadastrou os 7 supervisores e atualizou; equipes
  preenchidas pela NEO (Pedro 75, Elton 41, Kesia 38, Vinicius 38, Victor 31,
  Daniel 12, Elen 6; 11 sem supervisor). A conta de Matheus
  promovida a `admin` (pedido de Matheus, update direto em `perfis`).
- **17/11/2026 — variáveis NEO_INTEGRACAO_* postas na Vercel por Matheus.** Falta
  confirmar em produção: redeploy (variável nova só vale em deploy novo) e um
  "Atualizar agora" — conferir em `neo_sincronizacoes` uma linha `manual` sem
  erro depois disso; depois, a do cron (08:30).
- **Exclusões (17/11/2026):** `components/botao-excluir.tsx` (confirmação do
  navegador). Gestão de usuários: "Excluir" (admin; apaga a conta do Auth, perfil
  em cascata; recusa a própria conta; quem tem histórico — eventos, histórico,
  auditoria, documentos — o banco recusa e a tela orienta "Desativar").
  Supervisores: "Excluir" (QSMS/admin; recusa se houver login de supervisor
  ligado; equipe volta a "Sem supervisor"; apelidos e alertas em cascata).
  Testado no navegador: Victor (com login) recusado; acesso e registro do
  "Supervisor de Teste" excluídos a pedido de Matheus. Excluir colaborador NÃO
  foi feito: o caminho é Desligar (preserva o histórico de ASO).
- **Dashboard e Radar (17/11/2026):** Dashboard em duas colunas independentes
  (cartão curto não deixa buraco; no celular `contents` + `order` mantém a
  ordem). Mini legenda do semáforo sob os 6 cartões (`.legenda-status`). Radar:
  a faixa "Para você agir" e o seletor "Etapa" viraram 7 cartões de etapa
  (histórico: os cartões, `cartoes-etapa.tsx`, foram **substituídos em
  17/11/2026 pelas abas de etapa** `components/radar/abas-etapa.tsx`; ver
  "Redesign de UI/UX"). Selects do Radar
  viraram pílulas (`components/filtro-suspenso.tsx`, Radix dropdown; referência
  ListaSuspensa da NEO); "Só parados" virou pílula interruptor.
  `faixa-para-voce.tsx` removido.

## Responsividade das telas de cadastro — 17/11/2026 (Claude)

- Causa: `.tabela` impõe `min-width: 1000px` e 310px na 1ª coluna (feita para o
  Radar). Em Supervisores a 1ª coluna era o checkbox; em Ausências e Usuários a
  tabela ficava num container de 900px ao lado do formulário.
- Novo modificador `.tabela--compacta` (Supervisores, Ausências, Usuários): sem
  largura mínima; colunas secundárias `hidden sm:table-cell` com o resumo
  embaixo do nome no celular. `.tabela--responsiva` (lista de Colaboradores):
  igual à `.tabela` no desktop, compacta abaixo de 1024px (status visível sem
  rolar de lado).
- Supervisores: cartões "Cadastrar" e "Equipes" em cima (2 colunas a partir de
  md), lista de vínculo na largura toda (referência: Colaboradores da NEO); cada
  equipe é link que filtra a lista. Ausências/Usuários: formulário ao lado só a
  partir de xl, em 2 colunas no tablet; botões Remover/Desativar viraram
  `btn--secondary btn--sm`; papel e situação em `.etiqueta` (nunca semáforo).
- `.cabecalho-pagina::before` estende a faixa escura atrás do cabeçalho quando
  ele quebra em várias linhas (no celular o "Atualizar agora" ficava branco
  sobre claro).
- Verificado com Playwright logado como admin (link mágico pela service role,
  sem e-mail) em 390/820/1440px: nenhuma rolagem horizontal em supervisores,
  ausências, usuários, dashboard, radar, colaboradores, conta/senha, base,
  desligados. `tsc` limpo. Pendente: Radar no celular continua rolando a tabela
  de lado (status fora da tela) — decisão antiga do CSS, revisar depois.

## Assinatura do logo maior no login — 17/11/2026 (Claude)

- Pedido de Matheus: aumentar um pouco "Gestão integrada de requisitos
  ocupacionais" na tela de login. Em `public/logo-giro.svg` e
  `logo-giro-negativo.svg` a assinatura foi de 11,5 para 13,5 (y 80→81) e o
  viewBox de 420 para 450 de largura, para o texto caber. Para o símbolo e o
  "GIRO" manterem o tamanho, a largura exibida subiu na mesma proporção:
  painel 210→225px (`components/casca-login.tsx` e `.login-painel__logo`),
  celular 168→180px. Os dois SVGs só são usados nas telas de acesso.

## PDFs dos ASOs anexados aos colaboradores — 17/11/2026 (Claude)

- Pedido de Matheus: anexar o ASO de cada colaborador e permitir baixar no app.
- `scripts/importar-documentos-aso.mjs [--simular] [--pasta <Colaboradores>]
  [--manuais data/aso-arquivos-manuais.csv]`: para cada evento de ASO Periódico
  com `documento_url` vazio, acha o arquivo na cópia local
  (`Área de Trabalho\Colaboradores\<nome>`), envia ao bucket `asos` em
  `<colaborador>/aso-importado-<evento>.<ext>` e grava o caminho no evento, com
  auditoria `anexou` / "documento do ASO" (origem "Importação: pastas do
  SharePoint"). O nome do arquivo vem da observação gravada por
  `importar-exames.mjs`; as 17 datas completadas à mão (sem nome) usam o mapa
  `data/aso-arquivos-manuais.csv` (ignorado pelo Git; tem nomes). Retomável.
- **Aplicado ao banco real em 17/11/2026:** 254 anexados, 0 falhas; agora 255 de
  255 eventos de ASO têm arquivo (71 MB no bucket). Relatório para conferir ou
  desfazer: `data/importacao-documentos-aso.csv` (ignorado).
- Escolha do Claude a conferir: DOUGLAS NATANAEL COSTA (39487) tem dois ASOs
  de 2026 na pasta; foi usado "ASO - DOUGLAS NATANAEL (CORRETO).pdf".
- Tela: aba ASO do painel e página cheia mostram "Abrir" e "Baixar" por exame
  (`components/links-documento.tsx`; `urlParaBaixar` e `nomeArquivoExame` em
  `lib/storage.ts`, que acrescentam `download=` à URL assinada → nome
  "ASO Periodico DD-MM-AAAA.pdf"). Typecheck limpo; download conferido por
  fetch (200, `attachment`); não conferido no navegador.
- Pendente: AVP (236 eventos, todos sem arquivo) pode usar o mesmo caminho se
  Matheus quiser; ASOs antigos (histórico das pastas) não foram enviados.
  Nada commitado.

## Tela de Tratamento, AVPs anexados, polo fora das telas — 17/11/2026 (Claude)

- **AVPs anexados (pedido de Matheus):** `importar-documentos-aso.mjs` ganhou
  `--requisito avp`; aplicado ao banco real: 236 de 236 anexados, 0 falhas.
  Agora todo evento de ASO e de AVP tem arquivo. Relatório:
  `data/importacao-documentos-avp.csv` (ignorado).
- **Tela de Tratamento (`/admin/tratamento`, só admin, item "Tratamento" no grupo
  Administração).** Spec `docs/superpowers/specs/2026-11-17-tela-tratamento-design.md`
  (aprovada pela maquete); plano `docs/superpowers/plans/2026-11-17-tela-tratamento.md`.
  Lista calculada na hora, sem migration (`lib/consulta-tratamento.ts`, teste
  `npm run teste:tratamento`): uma linha por lacuna — sem supervisor (escolher e
  salvar na linha, via `vincularColaborador`), sem ASO / sem AVP (abre o painel na
  aba ASO), fora da NEO (abre o Cadastro). Ao fechar o painel a lista recarrega.
  Em 17/11: 19 linhas (10/2/2/5). Fora de propósito: vencimentos (Radar), GESET,
  foto. Escolha de supervisor feita aqui é sobrescrita pela sincronização se o
  texto da NEO apontar outro supervisor.
- **Polo saiu das telas (decisão de Matheus: ninguém tem polo):** filtro do Radar,
  `obterPolos`, filtro `polo` de `consulta-itens`, cabeçalhos do perfil/item,
  campo do cadastro (`CAMPOS_COLABORADOR`) e Supervisores. Visão geral mostra
  "UEN". A coluna `colaboradores.polo` continua no banco; o Histórico ainda
  rotula mudanças antigas de polo.
- **Páginas centralizadas:** Gestão de usuários, Ausências, Trocar senha e página
  do item ganharam `mx-auto` (Matheus aprovou: "melhorou").
- Verificado: `teste:tratamento` 8/8, `teste:consulta`, `teste:colaboradores`,
  typecheck, e2e de rotas 14/14 (2ª rodada; a 1ª teve timeouts de compilação
  fria), `next build` limpo (feito numa cópia temporária para não sobrescrever o
  `.next` do `next dev` aberto). **Não verificado logado:** o Playwright com
  sessão de admin foi negado pela permissão do Claude Code; a conferência na tela
  fica com Matheus. Nada commitado nem publicado.

## Redesign de UI/UX (sidebar, Radar, fonte) — 17/11/2026 (Claude)

Exemplo navegável (fora do repositório, descartável) feito no navegador com
Matheus; ele aprovou o desenho abaixo. **Aplicado ao sistema em 17/11/2026**
(5 tarefas; ver "Estado do código" no fim desta seção).

- **Sidebar:** verde do GIRO (#132523), **nasce recolhida** como trilho só de
  ícones e cresce pelo botão do topo ou Ctrl+B; estado em cookie lido no
  servidor. Recolhida: dica com o nome ao passar o mouse; grupos abrem em menu ao
  lado. Seções "Operação" e "Gestão". Avatar no pé abre Trocar senha / Sair.
- **Sem faixa escura** atrás dos cabeçalhos (`.faixa-app`) e **sem trilha**
  (Operação / Radar) — decisões expressas.
- **Fundo cinza frio** no lugar do bege (#F2F1EC → ~#E4E7EA); Matheus achou o
  bege "amarelado" e a tela "muito clara". Atualizar `docs/identidade-visual.md`.
- **Fonte: IBM Plex Sans** (escolha expressa; substitui Inter).
- **Aviso "N de 252 sem data de referência" sai do topo**; esses casos vão para a
  fila de **Tratamento**, com contador no item da sidebar.
- **Padrão de tela de lista (Radar primeiro, depois as outras):** título grande +
  ações à direita; cartão branco com Todos/Minha equipe (segmento), busca e
  filtros em pílula (Requisito, Status, Supervisor, Só parados); **quadro branco
  arredondado** com abas de **etapa** (Todos, Pendente, Data solicitada… com
  contagem; pontinho petróleo = sua vez; legenda "Sua vez de agir" à direita das
  abas), cabeçalho da tabela, linhas e **paginação no fim**. Cartões de etapa
  viram essas abas.
- **Colunas Status e Faltam separadas:** Status só com o nome (sem bolinha antes,
  em todo o sistema); Faltam com os dias, vencido negativo e em vermelho (-31d),
  sem registro "—".
- **Destaque de quem é a vez:** só a pílula do responsável (QSMS/Supervisão) fica
  petróleo para quem está logado, e o botão de ação fica cheio; nas outras linhas
  pílula cinza e botão contornado. Sem pintar a linha. Admin = QSMS. Sem filtro
  por equipe no destaque (o supervisor usa "Minha equipe").
- **Dono de cada etapa — confirmado por Matheus (resolve a divergência entre
  `vw_itens_abertos.dono` e `FAIXA_PARA_AGIR`):** Pendente QSMS; Data solicitada
  Supervisão; Data proposta QSMS (agenda); **Agendado Supervisão** (marca enviado
  à clínica); Enviado à clínica Supervisão; **Aguardando documento QSMS** (anexa o
  ASO); Inapto QSMS. Banco (Pendente → qsms) e app (Agendado → supervisor;
  Aguardando documento no QSMS) corrigidos na Tarefa 3.
- **Pendente de decisão:** e-mail semanal — itens Pendente (dono qsms desde 0025)
  saíram do bloco "Precisa de você" do supervisor e não entram no digest do
  QSMS; decidir antes de segunda 23/11 10:00 UTC.
- **Decisão expressa (17/11):** quem não tem registro de ASO usa a **data de
  admissão** como ASO admissional: vencimento = admissão + 12 meses. Mexe no
  banco e em quem aparece como "Sem registro"; tarefa separada, **depois** do
  redesign visual.
- **Exemplo aprovado por Matheus em 17/11/2026.** Spec:
  `docs/superpowers/specs/2026-11-17-redesign-ui-design.md`.
- **Estado do código (17/11/2026, Claude):**
  - Tarefa 1: tokens (névoa fria `--color-mist`, `--color-surface-2`), IBM Plex
    Sans, `CabecalhoPagina` sem trilha e sem faixa escura, `.status` sem bolinha.
  - Sidebar recolhível (`components/sidebar.tsx`, `lib/sidebar.ts`, cookie lido
    no layout).
  - Tarefa 3: dono por etapa conforme acima, no banco (`vw_itens_abertos.dono`) e
    em `FAIXA_PARA_AGIR`.
  - Tarefa 4: `AbasEtapa` (`components/radar/abas-etapa.tsx`,
    `lib/abas-etapa.ts`, `teste:abas`) no lugar dos cartões de etapa.
  - **Tarefa 5 (Radar no padrão novo de lista):** `components/grade-itens.tsx`
    com `.barra-filtros` (segmento Minha equipe/Todos, busca, pílulas) e
    `.quadro-lista` (abas no topo, `.tabela--lista`, paginação no rodapé com
    "Mostrando X–Y de N"). Colunas: Colaborador, Requisito, Supervisor,
    Vencimento, Status, **Faltam**, Etapa, Ação. Helpers em `lib/dominio.ts`:
    `textoFaltam(status, dias)` (vencido -> "-31d" em `#C62828`, sem dias "—") e
    `ehVezDe(papel, dono)` (admin = QSMS). Etiqueta do responsável fica petróleo
    (`.etiqueta--minha`) e o botão principal da linha fica cheio (`btn--primary`)
    só quando é a vez de quem olha; senão contornado. Teste: `npm run
    teste:radar-linha`. CSS órfão dos cartões removido (`.kpis--etapas`,
    `.kpi--botao`, `.kpi__nota--sua-vez`, `.kpi[aria-pressed]`,
    `.kpi[data-vazio]`).
  - **Verificação:** testes unitários, typecheck e build limpos; e2e de rotas no
    build de produção (ver relatório da tarefa). **Pendente (Matheus):**
    conferência visual logado como QSMS e como supervisor, em 1440px e 390px,
    contra a maquete: abas com contagem e pontinho do papel certo, aba ativa
    filtra, Faltam vermelho nos vencidos, pílula petróleo e botão cheio só nas
    linhas do papel, paginação no fim. Outras telas de lista ainda no padrão
    antigo (`.tabela` em linhas de cartão).

- **17/11/2026 — redesign enviado ao GitHub** (`402d8cd..d68ad58`, a pedido de Matheus). Pendente: conferência manual logado (QSMS e supervisor), decisão do e-mail semanal até 23/11, trocar o e-mail parcial na linha ~391 desta memória, sublinhado da aba ativa abaixo de 1440px.
- **18/11/2026 — Excluir colaborador (só admin)**, a pedido de Matheus, sem a "cópia" (o GIRO já guarda cópia própria em `colaboradores`, ligada por `neo_id`; a sincronização só atualiza quem existe, não cria nem apaga; o GIRO não escreve na NEO). Card na aba Cadastro do perfil, visível só para admin, confirmação do navegador; `excluirColaborador` usa a service role, apaga a linha (itens, eventos de ASO, ausências, documentos e auditoria em cascata), remove os arquivos dos buckets `asos`, `documentos` e `fotos`, registra no log do servidor (ids, sem dado pessoal) e volta para Colaboradores. Sem trava para quem tem ASO/documento (decisão por omissão; Desligar continua sendo o caminho para quem saiu). Não há registro persistente de quem excluiu. Ideias para depois: arquivo dos excluídos; cortar o vínculo com a NEO.
