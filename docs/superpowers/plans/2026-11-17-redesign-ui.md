# Redesign de UI/UX (casca, sidebar, Radar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar ao GIRO o desenho aprovado em 17/11: sidebar recolhível, casca clara em cinza frio com IBM Plex Sans, e o Radar no padrão novo de lista com abas de etapa, Status/Faltam e destaque de quem é a vez.

**Architecture:** Tokens e casca mudam em `app/globals.css` e nos layouts; a sidebar (já reescrita em `components/sidebar.tsx`) ganha CSS e cookie; a regra "de quem é a vez" vira uma só (view do banco + `FAIXA_PARA_AGIR`); o Radar troca `CartoesEtapa` por abas e reorganiza `GradeItens` sem mudar a consulta. Lógica nova fica em funções puras testadas por scripts `node --experimental-strip-types`, como o resto do projeto.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, CSS em `app/globals.css` (+ Tailwind utilitário), Radix (dialog, dropdown-menu), Supabase/Postgres, testes em `scripts/teste-*.mjs` com `node:assert`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-17-redesign-ui-design.md`

## Global Constraints

- Verde, âmbar, coral e vermelho só no semáforo. Destaque de navegação/ação é petróleo (`--color-brand` #0E7C74, `--color-brand-light` #4FB3A6). O vermelho do Faltam vencido é conformidade (permitido).
- Sidebar: fundo #132523; recolhida ~68px (4.25rem), aberta ~248px (15.5rem); nasce recolhida; cookie `giro-sidebar` = `recolhida` | `aberta`; atalho Ctrl+B (⌘+B), ignorado em input/textarea/select/contenteditable.
- Fundo e neutros frios: mist #E4E7EA, superfície secundária #F3F5F6, ink #1E2226, ink-muted #565D64, ink-faint #858C93, line #E1E4E8, line-strong #C5CBD1.
- Fonte: IBM Plex Sans 400/500/600 via `next/font/google`.
- Dono por etapa: previsto qsms · data_solicitada supervisor · data_proposta qsms · agendado supervisor · enviado_clinica supervisor · aguardando_documento qsms · inapto_em_tratativa qsms. Admin = qsms.
- Altura mínima de controles 42px fora da sidebar desktop; foco visível; `prefers-reduced-motion` já zera animações globalmente.
- Commits: mensagem exatamente `Corrigimos alguns erros e melhoramos a experiência geral. Até breve, Matheus` (via `git commit -F <arquivo>`), sem Co-Authored-By. Conferir com `git log -1 --format=%B`. Nunca commitar arquivo com CPF/RG (ver `.gitignore`); `git add` só dos arquivos da tarefa.
- O diretório é compartilhado com Codex/Matheus: reler o arquivo antes de editar e preservar mudanças alheias.

## Review Focus

- Sidebar recolhida usada só por teclado: Tab percorre os ícones, a dica aparece no foco, Enter num grupo abre o menu ao lado, Escape fecha e devolve o foco.
- Primeiro carregamento sem cookie: a página já vem recolhida no HTML do servidor (sem "pulo" de largura na hidratação).
- Radar com filtros que zeram uma etapa: a aba fica com contagem 0 visível (não some), e a aba ativa com 0 itens mostra a mensagem de vazio dentro do quadro.
- Nome longo / cargo longo e tela de 1024–1280px: a tabela rola na horizontal dentro do quadro, sem estourar a página; as abas rolam na horizontal.
- Item sem `dias_restantes` (sem registro) e item `dono = 'ninguem'`: Faltam mostra "—" e não há pílula nem destaque.

---

### Task 1: Casca clara — tokens frios, IBM Plex Sans, sem faixa, sem trilha, selo sem bolinha

**Files:**
- Modify: `app/layout.tsx` (fonte), `app/globals.css` (tokens `@theme`/`:root` linhas ~19–31 e ~46; `.status::before` ~236; `.faixa-app` e `.cabecalho-pagina*` ~1460–1497; comentário da sidebar ~735–742)
- Modify: `app/(app)/layout.tsx` (tirar o wrapper `.faixa-app`, o `BannerBase` e `obterResumoStatus` se não tiver outro uso)
- Modify: `components/cabecalho-pagina.tsx` (parar de renderizar `trilha`; remover a prop e os `trilha=` dos chamadores em `app/(app)/**/page.tsx`)
- Modify: `components/ficha-item.tsx` (comentário da faixa)
- Modify: `docs/identidade-visual.md` (cinza frio e IBM Plex Sans; registrar que Matheus trocou em 17/11)

**Interfaces:**
- Produces: tokens com os mesmos nomes de hoje (`--color-mist`, `--color-ink*`, `--color-line*`) e novos valores; `--font-sans` começando por `var(--font-plex)`; `CabecalhoPagina({ titulo, descricao?, children? })` sem `trilha`.

- [ ] **Step 1:** Em `app/layout.tsx`, trocar `Inter` por `IBM_Plex_Sans({ subsets: ["latin"], weight: ["400","500","600"], variable: "--font-plex", display: "swap" })` e aplicar a `variable` no `<html>`. Em `globals.css`, `--font-sans: var(--font-plex), "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;`.
- [ ] **Step 2:** Trocar os valores dos tokens neutros pelos da seção Global Constraints e acrescentar `--color-surface-2: #F3F5F6;`. Atualizar o comentário do arquivo que fala em "névoa quente".
- [ ] **Step 3:** Apagar o fundo de `.faixa-app` (e a classe no layout), o `::before` de `.cabecalho-pagina` e as regras de inversão de cor (`h1` branco, `.text-ink-muted` translúcido, breadcrumb, `.btn--secondary` translúcido). `.cabecalho-pagina` continua existindo como gancho, sem estilo de cor.
- [ ] **Step 4:** Remover `.status::before` e o `gap` do `.status`; ajustar padding para `0.25rem 0.75rem`.
- [ ] **Step 5:** `CabecalhoPagina` sem trilha; título `h1` 1.875rem/600/letter-spacing -0.02em, descrição abaixo, ações alinhadas ao fim (flex, `items-end`, `justify-between`). Remover `trilha=` de todas as páginas que a passam (`grep -rn "trilha=" app components`). **Telas de detalhe** (`qsms/colaborador/[id]/layout.tsx`, `qsms/item/[id]/page.tsx`) mantêm o `Trilha` como "voltar" (decisão do Claude, sinalizada a Matheus).
- [ ] **Step 6:** Remover `BannerBase` do layout (o caso entra na fila de Tratamento). Se `obterResumoStatus` e `components/banner-base.tsx` ficarem sem uso (`grep -rn`), apagar ambos.
- [ ] **Step 7:** Rodar `npm run typecheck` → sem erros; `npm run build` → "Compiled successfully" (se houver `next dev` aberto, fazer o build numa cópia temporária como registrado na memória).
- [ ] **Step 8:** Rodar `npx playwright test e2e/rotas.spec.ts` → todos passam.
- [ ] **Step 9:** Commit (arquivos da tarefa).

### Task 2: Sidebar recolhível — CSS, cookie no servidor, contador do Tratamento

**Files:**
- Modify: `app/globals.css` (seção Sidebar ~744–985)
- Modify: `app/(app)/layout.tsx` (ler cookie e, para admin, contar Tratamento)
- Modify: `components/sidebar.tsx` (prop de contador; já tem `recolhidaInicial`, `COOKIE_SIDEBAR`, `IconeExpandir`)
- Test: `scripts/teste-sidebar.mjs` (novo) + `package.json` script `teste:sidebar`

**Interfaces:**
- Consumes: `COOKIE_SIDEBAR` de `lib/sidebar.ts`; `carregarTratamento(supabase): Promise<TarefaTratamento[]>` de `lib/consulta-tratamento.ts`.
- Produces: em `lib/sidebar.ts`, `estaRecolhida(valorCookie: string | undefined): boolean` (true salvo `"aberta"`) e `iniciais(nome: string): string` (mover de `sidebar.tsx`); `Sidebar({ perfil, recolhidaInicial, pendenciasTratamento? }: { …; pendenciasTratamento?: number })`.

- [ ] **Step 1: Teste que falha** — `scripts/teste-sidebar.mjs` no estilo de `teste-faixa.mjs`, importando de `../lib/sidebar.ts`:
  - `estaRecolhida(undefined) === true`, `estaRecolhida("recolhida") === true`, `estaRecolhida("aberta") === false`, `estaRecolhida("lixo") === true`
  - `iniciais("Maria da Silva") === "MS"`, `iniciais("ana") === "A"`, `iniciais("  ") === "?"`, `iniciais("joão pedro souza") === "JS"`
- [ ] **Step 2:** `npm run teste:sidebar` → FALHA (funções não existem).
- [ ] **Step 3:** Implementar as duas funções em `lib/sidebar.ts`; `sidebar.tsx` passa a importar `iniciais`.
- [ ] **Step 4:** `npm run teste:sidebar` → todos `ok`.
- [ ] **Step 5:** Layout: `const recolhida = estaRecolhida((await cookies()).get(COOKIE_SIDEBAR)?.value)`; se `perfil.papel === "admin"`, `pendenciasTratamento = (await carregarTratamento(supabase)).length` em paralelo com o resto (`Promise.all`); passar ambos ao `Sidebar`. `.app-grade` desktop vira `grid-template-columns: auto minmax(0, 1fr)`.
- [ ] **Step 6:** `Sidebar`: badge com o número no `LinkItem` de Tratamento (`sidebar__badge`, oculto se 0/undefined) e, recolhida, ponto `sidebar__ponto` no ícone do grupo Administração; `aria-label` do link inclui "N aguardando tratativa". Dica do grupo recolhido idem.
- [ ] **Step 7: CSS** reescrevendo a seção Sidebar conforme a maquete aprovada: `.sidebar` sticky, largura 15.5rem com `transition: width var(--duracao-lenta) var(--ease-giro)`, `[data-recolhida="true"]` 4.25rem, `overflow-x: hidden`; cabeçalho 4rem com marca + `.sidebar__alternar` (36px, ícone gira 180° quando aberta; recolhida a marca some e o botão centraliza); `.sidebar__secao` (11px, caixa alta, recolhida vira fio pontilhado exceto a primeira); `.sidebar__item` 42px, ícone `.sidebar__icone` 20px fixo no mesmo x nos dois estados; rótulo/seta com `opacity 0` quando recolhida (continuam no DOM); ativo com gradiente `rgb(79 179 166 / .24)→.07`, contorno `inset 0 0 0 1px rgb(79 179 166/.2)`, ícone `--color-brand-light`, barra de 3px à esquerda; `.sidebar__rodape` com `.sidebar__usuario` (avatar 32px com anel petróleo; identidade some recolhida); `.sidebar__dica` `position: fixed; left: calc(4.25rem + 0.625rem); translate: 0 -50%`, fundo #132523 com seta; `.sidebar__badge` e `.sidebar__ponto`. Gaveta mobile mantém o comportamento e usa as mesmas classes (sempre aberta).
- [ ] **Step 8:** `npm run typecheck`, `npm run build`, `npx playwright test e2e/rotas.spec.ts` → sem erros / todos passam.
- [ ] **Step 9:** Conferência manual com `npm run dev` (Matheus logado): recolher/expandir, recarregar mantém o estado, Ctrl+B, Tab pelos ícones mostra dica, grupo recolhido abre menu ao lado e Escape devolve o foco, celular (390px) abre a gaveta.
- [ ] **Step 10:** Commit.

### Task 3: Regra única de quem age em cada etapa

**Files:**
- Create: `supabase/migrations/0025_dono_pendente_qsms.sql` (conferir o próximo número livre antes)
- Modify: `lib/acoes-etapa.ts` (`FAIXA_PARA_AGIR`)
- Test: `scripts/teste-faixa.mjs`

**Interfaces:**
- Produces: `FAIXA_PARA_AGIR.supervisor` = `[data_solicitada "Informar data", agendado "Enviar à clínica", enviado_clinica "Registrar resultado"]`; `FAIXA_PARA_AGIR.qsms` = `[previsto "Pedir data", data_proposta "Agendar", aguardando_documento "Anexar ASO", inapto_em_tratativa "Tratativa"]` (nessa ordem). `entradasDaFaixa` sem mudança de assinatura.

- [ ] **Step 1: Atualizar os testes primeiro** em `teste-faixa.mjs`: supervisor `["data_solicitada","agendado","enviado_clinica"]`; qsms `["previsto","data_proposta","aguardando_documento","inapto_em_tratativa"]`; rótulos `rotulo("supervisor","agendado") === "Enviar à clínica"`, `rotulo("qsms","aguardando_documento") === "Anexar ASO"`; novo caso "faixa casa com o dono da view": para cada etapa aberta, o papel cuja faixa contém a etapa é exatamente o da tabela de Global Constraints.
- [ ] **Step 2:** `npm run teste:faixa` → FALHA nos casos novos.
- [ ] **Step 3:** Ajustar `FAIXA_PARA_AGIR`.
- [ ] **Step 4:** `npm run teste:faixa` e `npm run teste:acoes` → todos `ok`.
- [ ] **Step 5:** Migration: copiar a definição de `vw_itens_abertos` de `0018_registrar_resultado.sql` (mesmas colunas, mesma ordem, `create or replace`, `security_invoker = true`) mudando só `when 'previsto' then 'qsms'`. Cabeçalho explicando a decisão de Matheus de 17/11. Conferir `grep -rn "dono" scripts/*.mjs` e ajustar testes de banco que esperem `previsto → supervisor`.
- [ ] **Step 6:** `npm run db:push -- --only 0025` → aplicada; `npm run teste:consulta` e `npm run teste:dashboard` → passam (o "Pendências por responsável" do Dashboard muda de lado nos itens Pendente — esperado).
- [ ] **Step 7:** Commit.

### Task 4: Abas de etapa no lugar dos cartões

**Files:**
- Create: `lib/abas-etapa.ts`, `components/radar/abas-etapa.tsx`
- Delete: `components/radar/cartoes-etapa.tsx` (conferir que só `grade-itens.tsx` usa)
- Test: `scripts/teste-abas-etapa.mjs` + script `teste:abas` no `package.json`

**Interfaces:**
- Consumes: `ETAPAS_ABERTAS` (`lib/regras-dashboard.ts`), `entradasDaFaixa` (Task 3), `ETAPA_ROTULO`.
- Produces: `montarAbas(papel: string, contagens: Record<string, number>): AbaEtapa[]` com `type AbaEtapa = { etapa: string | undefined; rotulo: string; quantidade: number; suaVez: boolean }`; primeira aba `{ etapa: undefined, rotulo: "Todos", quantidade: soma, suaVez: false }`, depois uma por etapa aberta na ordem de `ETAPAS_ABERTAS`. Componente `AbasEtapa({ papel, contagens, etapaAtiva, aoEscolher })` com a mesma assinatura de `CartoesEtapa`.

- [ ] **Step 1: Teste que falha** (`teste-abas-etapa.mjs`): com contagens `{ previsto: 41, data_solicitada: 12, agendado: 9 }` — `montarAbas("qsms", c)[0]` igual a `{ etapa: undefined, rotulo: "Todos", quantidade: 62, suaVez: false }`; `length === 1 + ETAPAS_ABERTAS.length`; etapa sem contagem tem `quantidade 0`; `suaVez` verdadeiro exatamente em previsto, data_proposta, aguardando_documento, inapto_em_tratativa para "qsms" e "admin", e em data_solicitada, agendado, enviado_clinica para "supervisor"; papel desconhecido → nenhum `suaVez`.
- [ ] **Step 2:** `npm run teste:abas` → FALHA.
- [ ] **Step 3:** Implementar `montarAbas`.
- [ ] **Step 4:** `npm run teste:abas` → `ok`.
- [ ] **Step 5:** Componente: `role="tablist"`-free (são filtros): `<div className="abas-etapa" role="group" aria-label="Etapas">` com `<button aria-pressed>` por aba; pontinho `.abas-etapa__vez` antes do rótulo quando `suaVez`; contagem `.abas-etapa__contagem` (ativa: fundo petróleo/texto branco; suaVez: `--color-brand-wash`/petróleo; demais cinza); clicar na ativa (não "Todos") volta para Todos; legenda `● Sua vez de agir` com `margin-left: auto`, só se alguma aba tiver `suaVez`. Barra rolável na horizontal (`overflow-x: auto`, sem barra visível). Aba ativa com sublinhado petróleo de 2px. CSS em `globals.css` junto do Radar.
- [ ] **Step 6:** `npm run typecheck` → sem erros. Commit.

### Task 5: Radar no padrão novo de lista

**Files:**
- Modify: `components/grade-itens.tsx` (`Filtros`, retorno de `GradeItens`, `LinhaItem`)
- Modify: `components/radar/botao-acao-linha.tsx` (botão principal cheio/contornado)
- Modify: `lib/dominio.ts` (helpers novos), `app/(app)/radar/page.tsx` (cabeçalho), `app/globals.css`
- Test: `scripts/teste-radar-linha.mjs` + script `teste:radar-linha`

**Interfaces:**
- Consumes: `AbasEtapa` (Task 4), `FAIXA_PARA_AGIR` coerente com a view (Task 3).
- Produces em `lib/dominio.ts`: `textoFaltam(status: StatusConformidade, dias: number | null): { texto: string; vencido: boolean }` e `ehVezDe(papel: string, dono: Dono): boolean`.

- [ ] **Step 1: Teste que falha** (`teste-radar-linha.mjs`):
  - `textoFaltam("vencido", -31)` e `textoFaltam("vencido", 31)` → `{ texto: "-31d", vencido: true }`
  - `textoFaltam("critico", 12)` → `{ texto: "12d", vencido: false }`; `textoFaltam("regular", 0)` → `{ texto: "0d", vencido: false }`
  - `textoFaltam("sem_registro", null)` e `textoFaltam("atencao", null)` → `{ texto: "—", vencido: false }`
  - `ehVezDe("qsms","qsms")`, `ehVezDe("admin","qsms")`, `ehVezDe("supervisor","supervisor")` → true; `ehVezDe("supervisor","qsms")`, `ehVezDe("qsms","supervisor")`, `ehVezDe("qsms","ninguem")`, `ehVezDe("outro","qsms")` → false
  (Conferir o sinal de `dias_restantes` de vencido no banco antes; o teste fixa a saída, não a entrada.)
- [ ] **Step 2:** `npm run teste:radar-linha` → FALHA.
- [ ] **Step 3:** Implementar os dois helpers.
- [ ] **Step 4:** `npm run teste:radar-linha` → `ok`.
- [ ] **Step 5: Filtros** num cartão `.barra-filtros` (branco, raio 16px, sombra plana, padding 12px, uma linha que quebra): segmento `.segmento` com Minha equipe/Todos (`aria-pressed`, ativo petróleo cheio, fundo `--color-surface-2`), busca com fundo `--color-surface-2` que fica branca no foco, pílulas existentes alinhadas à direita (`margin-left: auto`), Info do SLA e "Limpar filtros" preservados.
- [ ] **Step 6: Quadro** `.quadro-lista` (branco, raio 16px, `overflow: hidden`): `AbasEtapa` no topo (substitui `CartoesEtapa`), depois a tabela em `overflow-x: auto`, o vazio (`Vazio`) dentro do quadro, e a paginação no rodapé do quadro (`border-top`, "mostrando X–Y de N" à esquerda, páginas ao centro). O aviso de ação concluída continua acima do quadro.
- [ ] **Step 7: Tabela** — cabeçalho em faixa `--color-surface-2` (11px caixa alta, `--color-ink-faint`), linhas com fio `--color-line` e hover `#F7F9FA`, padding lateral 24px na primeira/última coluna. Colunas: Colaborador, Requisito, Supervisor, Vencimento (ordenável), Status (ordenável), **Faltam**, Etapa, Ação. Status: `<SeloStatus status dias={null} titulo />`. Faltam: `textoFaltam`, classe `.faltam--vencido` (cor `#C62828`, peso 600) quando `vencido`, `tabular`.
- [ ] **Step 8: Destaque** — `LinhaItem` recebe `papel`; a etiqueta do dono ganha `etiqueta--minha` (fundo petróleo, texto branco, peso 500) quando `ehVezDe(papel, item.dono)`. Em `AcoesLinha`, o botão principal usa `btn--primary` quando `ehVezDe(papel, item.dono)` e `btn--secondary` caso contrário (`papel` já vem de `usePerfilColaborador`).
- [ ] **Step 9: Cabeçalho do Radar** — `CabecalhoPagina` com título "Radar", descrição atual e `BotaoGerarItens` à direita (sem trilha, Task 1).
- [ ] **Step 10:** Remover CSS órfão (`.kpis--etapas` só se nenhum outro uso — `grep`), `npm run typecheck`, `npm run teste:consulta`, `npm run build`, `npx playwright test e2e/rotas.spec.ts` → tudo passa.
- [ ] **Step 11:** Conferência manual com `npm run dev` logado como QSMS e como supervisor (contas de teste), em 1440px e 390px, contra a maquete aprovada: abas com contagem e pontinho do papel certo, aba ativa filtra, Faltam vermelho nos vencidos, pílula petróleo e botão cheio só nas linhas do papel, paginação no fim.
- [ ] **Step 12:** Atualizar `MEMORIA_COMPARTILHADA.md` (seção "Redesign de UI/UX") com o que foi implementado e verificado. Commit.
