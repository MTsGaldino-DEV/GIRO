# Tela de Tratamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba "Tratamento", só do admin, com uma linha por lacuna de cadastro (sem supervisor, sem ASO, sem AVP, fora da NEO) e um botão que resolve; e o polo retirado das telas.

**Architecture:** Lista calculada na hora, sem migration: um Server Component lê `colaboradores` (ativos) e `vw_status_colaborador`, uma função pura monta as tarefas, e um Client Component mostra filtros e ações. Supervisor se resolve na linha (Server Action existente); ASO/AVP/NEO abrem o painel de perfil já montado no layout.

**Tech Stack:** Next 15.5 (App Router, Server Actions), React 19, TypeScript, Supabase, Tailwind 4; testes puros com `node --experimental-strip-types` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-11-17-tela-tratamento-design.md` (maquete aprovada por Matheus em 17/11/2026).

## Global Constraints

- Sem migration e sem escrita direta no banco; o banco é um só (produção).
- Cores do semáforo (verde, âmbar, coral, vermelho) não podem aparecer na tela; tipo da tarefa em `.etiqueta`, ações em petróleo/grafite (`btn--primary` / `btn--secondary`).
- Controles com pelo menos 42 px de altura; foco visível.
- Rota `/admin/tratamento`, protegida por `exigirAdmin()` (`lib/perfil.ts:58`); item só no grupo "Administração" da sidebar.
- Ordem dos tipos e rótulos (exatos): `sem_supervisor` "Sem supervisor", `sem_aso` "Sem ASO", `sem_avp` "Sem AVP", `fora_neo` "Fora da NEO".
- Descrições (exatas): "Não está ligado a nenhuma equipe; não aparece em \"Minha equipe\".", "Nenhum ASO registrado. Conta como vencido no semáforo.", "Exige AVP e não há avaliação registrada.", "Ativo no GIRO, mas não ligado ao cadastro da NEO."
- Botões (exatos): "Salvar" (com select "Escolher supervisor…"), "Anexar ASO", "Anexar AVP", "Conferir cadastro"; vazio: "Nada pendente."
- Coluna `colaboradores.polo` fica no banco; só a interface perde o polo.
- Commit só com aval de Matheus; mensagem obrigatória do CLAUDE.md global, via `git commit -F`.

## Review Focus

1. Pessoa com duas lacunas (sem supervisor e sem ASO) deve gerar duas linhas — teste na Task 1.
2. Colaborador desligado (`ativo = false`) nunca entra — teste na Task 1.
3. Nomes com acento ordenam como em português ("ÁLVARO" antes de "BRUNO") — teste na Task 1.
4. Depois de anexar o ASO no painel e fechá-lo, a linha some sem F5 — verificação manual na Task 2.
5. Quem não é admin não abre `/admin/tratamento` (sem sessão vai a `/login`) — e2e na Task 2.

---

### Task 1: Lógica pura das tarefas

**Files:**
- Create: `lib/consulta-tratamento.ts`
- Create: `scripts/teste-tratamento.mjs`
- Modify: `package.json` (script `"teste:tratamento": "node --experimental-strip-types scripts/teste-tratamento.mjs"`)

**Interfaces:**
- Produces:
  - `type TipoTarefa = "sem_supervisor" | "sem_aso" | "sem_avp" | "fora_neo"`
  - `const TIPOS_TAREFA: readonly TipoTarefa[]` (na ordem acima)
  - `const ROTULO_TAREFA: Record<TipoTarefa, string>` e `const DESCRICAO_TAREFA: Record<TipoTarefa, string>` (textos de Global Constraints)
  - `interface ColaboradorTratamento { id: string; nome: string; matricula: number; ativo: boolean; supervisor_id: string | null; neo_id: string | null }`
  - `interface StatusTratamento { colaborador_id: string; requisito: string; status: string }`
  - `interface TarefaTratamento { chave: string; tipo: TipoTarefa; colaboradorId: string; nome: string; matricula: number }` (`chave` = `${tipo}:${colaboradorId}`)
  - `function montarTarefas(colaboradores: ColaboradorTratamento[], status: StatusTratamento[]): TarefaTratamento[]`
  - `function contarPorTipo(tarefas: TarefaTratamento[]): Record<TipoTarefa, number>`
  - `async function carregarTratamento(supabase: SupabaseClient): Promise<TarefaTratamento[]>`

- [ ] **Step 1: Escrever o teste** em `scripts/teste-tratamento.mjs`, no formato de `scripts/teste-consulta-geset.mjs` (função `caso`, contagem de falhas, `process.exit(1)` se houver). Casos:
  - `sem supervisor`: ativo com `supervisor_id: null`, `neo_id` preenchido → `[{ tipo: "sem_supervisor" }]`.
  - `sem ASO`: status `{ requisito: "ASO Periódico", status: "sem_registro" }` → tipo `sem_aso`; o mesmo com `status: "vencido"` → nenhuma tarefa.
  - `sem AVP`: `{ requisito: "Avaliação Psicossocial (AVP)", status: "sem_registro" }` → `sem_avp`.
  - `fora da NEO`: `neo_id: null` → `fora_neo`.
  - `duas lacunas, duas linhas`: sem supervisor + ASO sem registro → 2 tarefas, chaves distintas.
  - `desligado não entra`: `ativo: false` com todas as lacunas → `[]`.
  - `ordem`: tipos na ordem de `TIPOS_TAREFA`; dentro do tipo, `"ÁLVARO"` antes de `"BRUNO"`.
  - `contarPorTipo`: devolve os quatro tipos, inclusive com 0.
- [ ] **Step 2: Rodar** `npm run teste:tratamento` → FALHA (módulo não existe).
- [ ] **Step 3: Implementar** `lib/consulta-tratamento.ts`. Requisitos casados por nome exato (`"ASO Periódico"`, `"Avaliação Psicossocial (AVP)"`); ordenação com `localeCompare(b, "pt-BR")`. `carregarTratamento` faz em paralelo `colaboradores.select("id, nome, matricula, ativo, supervisor_id, neo_id").eq("ativo", true)` e `vw_status_colaborador.select("colaborador_id, requisito, status").eq("status", "sem_registro")`, e chama `montarTarefas`; erro do Supabase é lançado.
- [ ] **Step 4: Rodar** `npm run teste:tratamento` → todos `ok`, 0 falhas.

### Task 2: Página `/admin/tratamento`

**Files:**
- Create: `app/(app)/admin/tratamento/page.tsx` (Server Component)
- Create: `components/tratamento/lista-tratamento.tsx` (`"use client"`)
- Modify: `components/sidebar.tsx` (novo `ITEM_TRATAMENTO`, `href: "/admin/tratamento"`, `rotulo: "Tratamento"`, no grupo `administracao` depois de `ITEM_USUARIOS`; ícone existente)
- Modify: `app/(app)/qsms/supervisores/acoes.ts` (`vincularColaborador`: acrescentar `revalidatePath("/admin/tratamento")`)
- Modify: `e2e/rotas.spec.ts` (acrescentar `'/admin/tratamento'` a `ROTAS_PROTEGIDAS`)

**Interfaces:**
- Consumes: `carregarTratamento`, `contarPorTipo`, `TIPOS_TAREFA`, `ROTULO_TAREFA`, `DESCRICAO_TAREFA`, `TarefaTratamento` (Task 1); `vincularColaborador(_anterior: Acao | null, formData: FormData): Promise<Acao>` com campos `colaborador_id` e `supervisor_id`; `usePerfilColaborador().abrir(id, aba)` e `.colaboradorId` (`components/perfil/contexto.tsx`); `BotaoNomeColaborador` (`components/perfil/botao-nome.tsx`); `CabecalhoPagina` como em `app/(app)/admin/usuarios/page.tsx`.
- Produces: `ListaTratamento({ tarefas: TarefaTratamento[]; supervisores: { id: string; nome: string }[] })`.

- [ ] **Step 1: Página.** `exigirAdmin()`; carrega `carregarTratamento` e `supervisores.select("id, nome").eq("ativo", true).order("nome")` em paralelo; contêiner `max-w-[1280px] mx-auto` (mesmo padrão de Gestão de usuários); trilha "Administração › Tratamento", título "Tratamento", descrição "{n} pendências no cadastro. Cada linha some quando o dado é corrigido."; `export const dynamic = "force-dynamic"`.
- [ ] **Step 2: Lista.** Pílulas "Todos" + uma por tipo, com contagem (`contarPorTipo`), `aria-pressed` na ativa; tabela `.tabela--compacta` com colunas Colaborador (nome via `BotaoNomeColaborador` + matrícula `tabular`), O que falta (`.etiqueta` + descrição), Ação. Ação por tipo:
  - `sem_supervisor`: `<form>` com `useActionState(vincularColaborador, null)`, hidden `colaborador_id`, select `supervisor_id` ("Escolher supervisor…" vazio e desabilitado para envio) e "Salvar" `btn--primary`; erro mostrado na linha.
  - `sem_aso` / `sem_avp`: "Anexar ASO" / "Anexar AVP" `btn--secondary` → `abrir(colaboradorId, "aso")`.
  - `fora_neo`: "Conferir cadastro" → `abrir(colaboradorId, "cadastro")`.
  - Recarregar: `useEffect` que chama `router.refresh()` quando `colaboradorId` do contexto passa de um id para `null` (painel fechado).
  - Lista vazia (ou filtro vazio): "Nada pendente."
- [ ] **Step 3: Sidebar, revalidate e e2e** conforme Files.
- [ ] **Step 4: Verificar** `npm run typecheck` (limpo) e `npx playwright test e2e/rotas.spec.ts` (todas passam, incluindo `/admin/tratamento sem sessão termina em /login`).
- [ ] **Step 5: Verificação manual (Matheus, logado como admin)** em http://localhost:3000/admin/tratamento: 19 linhas (10/2/2/5 em 17/11); filtro por pílula; salvar um supervisor tira a linha; "Anexar ASO" abre o painel na aba ASO e, ao fechar, a lista recarrega; QSMS/supervisor não veem o item na sidebar.

### Task 3: Polo sai das telas

**Files:**
- Modify: `components/grade-itens.tsx` (remover prop `polos` e o `FiltroSuspenso` "Polo", linhas ~75, 84, 269, 517, 525, 618-625)
- Modify: `app/(app)/radar/page.tsx` (remover `obterPolos` do import e do `Promise.all`, e a prop `polos`)
- Modify: `lib/colaborador.ts` (remover `obterPolos`, linhas ~122-138)
- Modify: `lib/consulta-itens.ts` (remover `polo?` de `FiltrosPainel` e o `.eq("polo", …)`, linhas ~44 e 121)
- Modify: `app/(app)/qsms/colaborador/[id]/layout.tsx:88`, `components/perfil/painel-perfil.tsx:120`, `components/ficha-item.tsx:37` (tirar `· polo` do cabeçalho)
- Modify: `components/perfil/aba-visao-geral.tsx:98` (campo vira "UEN" com `colaborador.uen ?? "—"`)
- Modify: `lib/campos-colaborador.ts` (tirar `"polo"` do tipo, do mapa de campos e da lista editável, linhas ~23, 51, 85) e `app/(app)/qsms/colaborador/[id]/cadastro/acoes.ts:189` (tirar `polo` do esquema)
- Modify: `app/(app)/qsms/supervisores/page.tsx` e `vinculo-massa.tsx` (tirar `polo` do select, do tipo e dos comentários)
- Mantém: `components/perfil/aba-historico.tsx:16` (rótulo de mudanças antigas de polo no histórico)

- [ ] **Step 1:** Aplicar as remoções acima.
- [ ] **Step 2: Verificar** `npm run typecheck` limpo; `npm run teste:consulta` e `npm run teste:colaboradores` passam; `grep -rn "polo" app components lib` só acha `aba-historico.tsx`, `formulario-agendar.tsx` (comentário P9), `badge.tsx`/`globals.css` (comentários) e `lib/tipos.ts`/`lib/colaborador.ts`/`lib/consulta-colaborador.ts` (tipo e select da linha, que continuam lendo a coluna).

### Task 4: Fechamento

- [ ] **Step 1:** `npm run build` limpo; rodar de novo `teste:tratamento`, `teste:consulta`, `teste:colaboradores`.
- [ ] **Step 2:** Atualizar `MEMORIA_COMPARTILHADA.md` (tela de Tratamento, polo fora das telas, AVPs anexados, páginas centralizadas) sem apagar o que já está lá.
- [ ] **Step 3:** Commit só com aval de Matheus: gravar a frase do CLAUDE.md global num arquivo, `git commit -F <arquivo>`, conferir com `git log -1 --format=%B`; antes, `git status` sem arquivos de `data/` ou `import/`.
