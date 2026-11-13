# GIRO — telas e fluxo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a especificação 1: supervisor e QSMS operam o fluxo do ASO/AVP em toda a UEN, com sidebar, Dashboard, Radar, lista de Colaboradores, "Registrar resultado" em passo único, marca de lançamento no GESET e faixa `programar` de 90 dias.

**Architecture:** Mudanças de regra ficam no Postgres (migrations 0016 a 0019, aplicadas por `npm run db:push -- --only <número>`); o Next só chama RPCs e desenha telas. Um novo papel de checagem, `fn_e_operador()` (admin, qsms ou supervisor ativo), substitui `fn_e_qsms()` apenas nas tabelas e funções operacionais; perfis, supervisores e tipos continuam restritos. As telas novas reaproveitam componentes e consultas existentes.

**Tech Stack:** Next 15.5, React 19, TypeScript, Tailwind 4, Supabase (Postgres, RLS, Storage), Zod, Radix, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-telas-e-fluxo-design.md` (ler a seção 12b: são as calls do Claude que Matheus ainda confere).

## Global Constraints

- Mensagem de commit **exatamente** `Corrigimos alguns erros e melhoramos a experiência geral. Até breve, Matheus` (regra global de Matheus). Gravar a frase num arquivo e usar `git commit -F <arquivo>`; conferir com `git log -1 --format=%B`. Nenhuma linha `Co-Authored-By`.
- `git push` para `main` publica na Vercel. **Não dar push sem Matheus pedir.**
- Só existe **um banco, o de produção**. Migrations são aditivas e idempotentes (`create or replace`, `if not exists`, `drop policy if exists`); nunca apagar dados. Aplicar com `--only`, nunca `db:push` sem filtro. `seed:teste`, `teste-fluxo.mjs` e `importar-*` **não** são rodados como verificação.
- Testes de banco seguem o molde de `scripts/teste-rls.mjs`: dados de teste com matrícula ≥ 999000 e e-mail `@exemplo.invalido`, asserções dentro de `sessao(uid, fn)` (rollback) e limpeza no `finally`.
- CPF, RG e nomes com matrícula nunca em commit, memória ou plano.
- Cores verde, âmbar, coral e vermelho só no semáforo; ação e navegação em petróleo `#0E7C74` e grafite `#23262B`; sidebar `#132523`; controles ≥ 42 px; foco visível; respeitar `prefers-reduced-motion`. Ler `docs/identidade-visual.md` antes de qualquer tela.
- A máquina de estados e as regras ficam no Postgres. Nada de transição só em React.
- Verificação de cada task: `npm.cmd run typecheck` e, ao fim de cada fase de tela, `npm.cmd run build`.
- Atualizar `MEMORIA_COMPARTILHADA.md` (decisões, verificações, pendências) ao fim das fases B, C e D.

## Review Focus

1. Supervisor tenta qualquer RPC do fluxo em colaborador de **outra** equipe: deve funcionar (decisão de 10/11). Supervisor chamando RPCs de usuários (`perfis`, `supervisores`) continua barrado. Task 1.
2. "Fez e apto" sem arquivo ou sem data do documento, ou com data futura: erro, e o item não muda de etapa nem grava evento. Task 3.
3. "Fez e apto" chamado em item que **não** está em `enviado_clinica`: erro. Atomicidade: se o evento falhar, o item volta ao estado anterior. Task 3.
4. Itens reais já em `aguardando_documento` continuam concluíveis por `fn_concluir_item`, agora pelos dois papéis. Task 3.
5. Quem vence em 61–90 dias passa de "Em dia" para "Programar" nos contadores, na lista e na rosca, sem alterar atenção, crítico e vencido. Task 2.
6. Carga da marca GESET: exatamente os eventos com vencimento > 90 dias ficam "lançado"; rodar a migration duas vezes não duplica nem altera a auditoria. Task 4.
7. Link antigo `/qsms`, `/qsms/dashboard`, `/supervisor` e `/supervisor/item/<id>` continua abrindo (redirecionamento). Task 7.
8. Supervisor sem equipe vinculada abre o Radar: tela vazia com aviso, sem erro; e consegue tirar o filtro. Task 8.

---

## Fase A — Banco

### Task 0: Fotografia antes de mexer (somente leitura)

**Files:** Create `scripts/inspecionar-antes-de-0016.mjs` (somente `select`, sem escrita).

**Interfaces:** Produces: saída no terminal com contagem de itens por etapa, contagem de eventos por requisito, e quantos eventos teriam vencimento > 90 dias hoje (alimenta Task 4 e a decisão sobre `aguardando_documento`).

- [ ] **Step 1:** Escrever o script usando `pg` e `carregarEnv` como em `scripts/db-push.mjs`; consultas: `itens_pendencia` agrupado por `etapa`; `eventos_requisito` com `resultado in ('apto','apto_com_restricao')` por `tipo_requisito_id`; último evento por colaborador × requisito com vencimento > hoje + 90.
- [ ] **Step 2:** Rodar `node scripts/inspecionar-antes-de-0016.mjs`. Esperado: tabelas impressas, nenhum erro. Anotar na `MEMORIA_COMPARTILHADA.md` a contagem de itens em `aguardando_documento`.
- [ ] **Step 3: Commit** `scripts/inspecionar-antes-de-0016.mjs`.

### Task 1: Permissões do operador (migration 0016)

**Files:**
- Create: `supabase/migrations/0016_permissoes_operador.sql`
- Create: `scripts/teste-permissoes.mjs`
- Modify: `package.json` (script `"teste:permissoes": "node scripts/teste-permissoes.mjs"`)

**Interfaces:**
- Produces: `public.fn_e_operador() returns boolean` (`security definer`, `stable`; verdadeiro para `fn_papel() in ('qsms','admin','supervisor')`). Reutilizada pelas Tasks 3 e 4.
- Produces: `public.fn_exigir_acesso_ao_item(uuid)` deixa de filtrar por equipe para qualquer operador.

- [ ] **Step 1: Escrever `scripts/teste-permissoes.mjs`**, no molde de `teste-rls.mjs`, com dois supervisores (A e B), um colaborador de cada equipe e um item em cada etapa necessária. Testes (nomes exatos nas mensagens `ok`/`FALHA`):
  - `supervisor A pode solicitar data em item de colaborador da equipe B` (`fn_solicitar_data`)
  - `supervisor A pode agendar, enviar à clínica e registrar desfecho em item da equipe B`
  - `supervisor A pode cancelar e devolver item da equipe B`
  - `supervisor A lê colaboradores, eventos, itens e ausências da equipe B`
  - `supervisor A atualiza campo de colaborador da equipe B` (update direto em `colaboradores`)
  - `supervisor A NÃO escreve em perfis` e `supervisor A NÃO escreve em supervisores` (esperado: erro ou 0 linhas)
  - `usuário sem perfil ativo NÃO executa fn_solicitar_data` (esperado: exceção `insufficient_privilege`)
- [ ] **Step 2: Rodar** `npm.cmd run teste:permissoes`. Esperado: FALHAs nos cinco primeiros (hoje o supervisor é barrado).
- [ ] **Step 3: Escrever `0016_permissoes_operador.sql`:**
  - criar `fn_e_operador()`;
  - um bloco `DO $$` que, para cada função cujo nome está na lista (`fn_solicitar_data`, `fn_registrar_data_supervisor`, `fn_agendar`, `fn_informar_dados`, `fn_enviar_clinica`, `fn_registrar_desfecho`, `fn_concluir_item`, `fn_encerrar_inapto`, `fn_cancelar_item`, `fn_devolver_ao_supervisor`, `fn_registrar_auditoria`, `fn_registrar_aso_retroativo`), lê `pg_get_functiondef(oid)`, troca `public.fn_e_qsms()` por `public.fn_e_operador()` e os textos "Apenas o QSMS" por "Apenas QSMS e supervisão", e executa o resultado. Isso evita copiar 12 corpos de função. Idempotente: se já trocado, não muda nada;
  - `create or replace fn_exigir_acesso_ao_item`: operador devolve o item sem checar equipe;
  - políticas: para `colaboradores`, `eventos_requisito`, `itens_pendencia`, `ausencias`, `documentos_colaborador`, `auditoria_colaborador`, `historico_item` (leitura) e para os buckets `asos`, `documentos`, `fotos` (insert/update/delete/select), trocar `fn_e_qsms()` ou `fn_minha_equipe(...)` por `fn_e_operador()`;
  - **não** tocar em `perfis`, `supervisores`, `tipos_requisito`, `alertas_enviados`.
- [ ] **Step 4:** `npm run db:push -- --only 0016` e depois `npm.cmd run teste:permissoes`. Esperado: todos `ok`, 0 falhas.
- [ ] **Step 5: Commit** (migration, script de teste, `package.json`).

### Task 2: Faixa `programar` de 90 dias (migration 0017)

**Files:**
- Create: `supabase/migrations/0017_faixa_90_dias.sql`
- Create: `scripts/teste-semaforo.mjs`
- Modify: `lib/dominio.ts` (`STATUS_LEITURA`), `app/globals.css` (comentário ou texto que cite 60 dias, se houver)

**Interfaces:** Consumes: `vw_status_colaborador` (0003) e `fn_resumo_status` (0015). Produces: mesma forma de colunas (`status`, `peso_status`), com `programar` cobrindo 31–90 dias e `ok` > 90.

- [ ] **Step 1: Escrever `scripts/teste-semaforo.mjs`** com colaborador de teste e eventos com `data_documento` calculada para dar 91, 90, 31, 30, 14 e −1 dias de vencimento. Asserções: 91→`ok`; 90→`programar`; 31→`programar`; 30→`atencao`; 14→`critico`; −1→`vencido`; sem evento→`sem_registro`; `fn_resumo_status().programar` conta o de 90 dias.
- [ ] **Step 2:** Rodar. Esperado: falha em 90 e 61.
- [ ] **Step 3:** `0017`: `create or replace view vw_status_colaborador` (mesmo corpo de 0003, trocando `<= 60` por `<= 90` no `status` e no `peso_status`). Rever `fn_resumo_status` e demais funções de 0005/0010/0012/0015 que citem 60; ajustar só o que depender da faixa. **Atenção:** `vw_itens_abertos` depende da view; usar `create or replace` mantendo as colunas.
- [ ] **Step 4:** Atualizar `STATUS_LEITURA` em `lib/dominio.ts` (`ok`: "Vence em mais de 90 dias."; `programar`: "Entre 90 e 31 dias. É hora de programar a liberação."). Procurar textos "60 dias" com `graft grep` ou `Grep` em `app`, `components`, `lib`.
- [ ] **Step 5:** `npm run db:push -- --only 0017`, `node scripts/teste-semaforo.mjs`, `npm.cmd run typecheck`. Esperado: tudo `ok`.
- [ ] **Step 6: Commit.**

### Task 3: Registrar resultado em passo único (migration 0018)

**Files:**
- Create: `supabase/migrations/0018_registrar_resultado.sql`
- Modify: `scripts/teste-permissoes.mjs` (novos casos)
- Modify: `lib/dominio.ts` (`ETAPA_ACAO`, `ETAPA_ROTULO`), `lib/tipos.ts` se necessário

**Interfaces:**
- Produces: `public.fn_registrar_resultado(p_item_id uuid, p_desfecho text, p_data_documento date default null, p_data_realizado date default null, p_resultado text default null, p_medico text default null, p_documento_url text default null, p_observacoes text default null) returns uuid` — `security definer`, exige `fn_e_operador()`.
  - `p_desfecho = 'fez_apto'`: exige `p_documento_url` e `p_data_documento` (não futura) e `p_resultado in ('apto','apto_com_restricao')`; grava o evento, move o item `enviado_clinica` → `concluido` e abre o próximo ciclo, tudo na mesma transação. Retorna o id do evento.
  - `p_desfecho` em `fez_inapto`, `faltou`, `incompleto`, `retorno_necessario`: delega ao comportamento atual de `fn_registrar_desfecho` (que fica como está) e retorna `null`.
- Produces: transição `('enviado_clinica','concluido')` permitida em `fn_transicao_valida`.
- Produces: `dono` de `enviado_clinica` passa a `'supervisor'` em `vw_itens_abertos` (recriar a view com as mesmas colunas).

- [ ] **Step 1: Testes em `teste-permissoes.mjs`** (supervisor A, item de equipe B em `enviado_clinica`):
  - `fez_apto sem documento_url falha e o item continua em enviado_clinica`
  - `fez_apto com data_documento futura falha`
  - `fez_apto com documento e data conclui o item e abre o próximo ciclo previsto`
  - `fez_apto com apto_com_restricao também conclui`
  - `fez_apto em item que está em agendado falha`
  - `faltou volta o item para data_solicitada sem exigir documento`
  - `fn_concluir_item continua concluindo item em aguardando_documento para supervisor`
  - `evento gravado tem registrado_por = uid do supervisor`
- [ ] **Step 2:** Rodar; esperado: falha (função inexistente).
- [ ] **Step 3:** Escrever `0018`: a função acima reutilizando a lógica de `fn_concluir_item` (0012, linhas 582–668) para o ramo apto; `fn_transicao_valida` com a transição nova (recriar a função inteira, copiando a lista de 0011 e acrescentando a linha); recriar `vw_itens_abertos` a partir de 0013 trocando só o `dono` de `enviado_clinica`. `grant execute ... to authenticated` e `revoke ... from public`.
- [ ] **Step 4:** Atualizar `ETAPA_ACAO` (`enviado_clinica`: "Registrar o resultado e anexar o ASO"; `aguardando_documento`: "Anexar o ASO e concluir (itens antigos)") e remover a frase "lançar no GESET" da etapa de documento.
- [ ] **Step 5:** `db:push --only 0018`, `npm.cmd run teste:permissoes`, `npm.cmd run typecheck`. Esperado: todos `ok`.
- [ ] **Step 6: Commit.**

### Task 4: Marca de lançamento no GESET (migration 0019)

**Files:**
- Create: `supabase/migrations/0019_geset.sql`
- Create: `scripts/teste-geset.mjs`
- Modify: `lib/tipos.ts` (`PendenciaGeset`)

**Interfaces:**
- Produces: colunas `eventos_requisito.geset_lancado_em timestamptz null` e `geset_lancado_por uuid null references auth.users(id) on delete set null`.
- Produces: `public.fn_marcar_geset(p_evento_id uuid, p_lancado boolean default true) returns void` — operador; grava `geset_lancado_em = now()` e `geset_lancado_por = auth.uid()` (ou limpa os dois); registra em auditoria via `fn_registrar_auditoria` (`p_acao`, `p_entidade = 'evento_requisito'`, `p_campo = 'geset'`).
- Produces: view `public.vw_pendencias_geset` (`security_invoker = true`) com `evento_id, colaborador_id, matricula, nome, cargo, requisito, data_documento, data_vencimento, dias_restantes, foto_url, supervisor_nome`, só o **último evento apto por colaborador × requisito** e `geset_lancado_em is null`, de colaboradores `ativo`.
- Produces: tipo TS `PendenciaGeset` com as mesmas chaves.

- [ ] **Step 1: `scripts/teste-geset.mjs`:**
  - `a migration não deixa pendente quem tem vencimento > 90 dias` (e `geset_lancado_em` preenchido, `geset_lancado_por` nulo)
  - `evento com vencimento <= 90 dias aparece na vw_pendencias_geset`
  - `rodar o bloco de carga duas vezes não altera geset_lancado_em nem duplica auditoria`
  - `fn_marcar_geset grava quem e quando, e some da view`
  - `fn_marcar_geset(false) devolve à view`
  - `evento anterior (não o último) nunca aparece como pendente`
  - `supervisor e qsms conseguem marcar; usuário sem perfil não`
- [ ] **Step 2:** Rodar; esperado: falha.
- [ ] **Step 3:** Escrever `0019`: colunas (`add column if not exists`), função, view e **carga inicial** em bloco idempotente: só atualiza eventos com `geset_lancado_em is null` cujo último-evento tenha `data_documento + periodicidade_meses` > `hoje() + 90`, e grava auditoria com `p_origem = 'carga inicial'` apenas nas linhas que mudou. Eventos de resultado `inapto` não entram na view.
- [ ] **Step 4:** `db:push --only 0019`, `node scripts/teste-geset.mjs`. Anotar na memória quantos ficaram pendentes (comparar com a Task 0).
- [ ] **Step 5: Commit.**

---

## Fase B — Casca e acesso

### Task 5: Guarda de acesso e entrada por papel

**Files:**
- Modify: `lib/perfil.ts` (`exigirOperador`), e todos os usos de `exigirQsms`/`exigirSupervisor` em `app/` (66 usos: listar com `graft grep "exigirQsms"` e `graft grep "exigirSupervisor"`)
- Modify: `middleware.ts` se bloquear rotas por papel

**Interfaces:**
- Produces: `exigirOperador(): Promise<Perfil>` (qualquer papel ativo). `exigirAdmin()` continua só para `/admin/usuarios` e a tela de conta de usuário. `exigirQsms()` e `exigirSupervisor()` ficam como wrappers marcados `@deprecated` até a Task 14 e são removidos lá.

- [ ] **Step 1:** Trocar `exigirQsms()` por `exigirOperador()` em todas as Server Actions e páginas operacionais, **exceto** Gestão de usuários. Server Action de `alternarAtivo` (hoje `exigirAdmin`) passa a `exigirOperador` (desligar e reativar foram liberados na spec).
- [ ] **Step 2:** `npm.cmd run typecheck`. Esperado: sem erros.
- [ ] **Step 3: Verificação manual:** entrar com cada papel (conta de teste) e abrir uma ação em colaborador de outra equipe. Esperado: funciona. Não clicar em ação em dado real.
- [ ] **Step 4: Commit.**

### Task 6: Sidebar no estilo NEO

**Files:**
- Create: `components/sidebar.tsx`
- Modify: `app/(app)/layout.tsx`, `app/globals.css` (classes da sidebar; decidir o destino de `.faixa-app` e `.cabecalho-pagina`)
- Delete (no fim): `components/barra-topo.tsx`

**Interfaces:**
- Produces: `<Sidebar perfil={Perfil} />` com itens `Dashboard` (`/dashboard`), `Radar` (`/radar`), `Colaboradores` (`/colaboradores`), grupo **Cadastros** (`Base`, `Supervisores`, `Ausências`; a Task 14 retira a Base), grupo **Administração** (`Gestão de usuários`, só admin); cartão do usuário com Senha e Sair; grupo abre/fecha; item ativo destacado; no celular, gaveta com botão de menu. O supervisor vê Dashboard, Radar e Colaboradores (sem Administração).

- [ ] **Step 1:** Ler `components/barra-topo.tsx` (itens, `estaAtivo`, menu da conta) e reutilizar a lógica de rota ativa.
- [ ] **Step 2:** Implementar a sidebar com identidade do GIRO; teste manual com Edge headless em desktop e 390 px, como a memória de 03/11 descreve.
- [ ] **Step 3:** No layout, trocar `BarraTopo` por `Sidebar`; manter `BannerBase`, `BarraNavegacao` e `PainelPerfilColaborador`.
- [ ] **Step 4:** `npm.cmd run build`. Esperado: sem erros.
- [ ] **Step 5: Commit.**

### Task 7: Rotas novas e redirecionamentos

**Files:**
- Create: `app/(app)/dashboard/page.tsx`, `app/(app)/radar/page.tsx`, `app/(app)/colaboradores/page.tsx` (cascas que, por ora, reexportam as páginas atuais)
- Modify: `next.config.ts` (redirects) ou páginas antigas com `redirect()`

**Interfaces:** Produces: `rotaInicial(perfil)` em `lib/perfil.ts` (`supervisor` → `/radar`; `qsms` e `admin` → `/dashboard`), alterada **nesta** task, só depois de as rotas existirem. Produces: `/dashboard`, `/radar`, `/colaboradores` como rotas canônicas; `/qsms` → `/radar`, `/qsms/dashboard` → `/dashboard`, `/supervisor` → `/radar`, `/qsms/item/<id>` e `/supervisor/item/<id>` continuam abrindo a ficha do item.

- [ ] **Step 1: Teste Playwright** `e2e/rotas.spec.ts` (sem login): `/qsms`, `/supervisor` e `/qsms/dashboard` sem sessão terminam em `/login` (o redirecionamento do middleware continua valendo); documentar que os fluxos autenticados são verificados manualmente.
- [ ] **Step 2:** Implementar rotas e redirects; manter links internos (`href="/qsms"` etc.) atualizados com `Grep`.
- [ ] **Step 3:** `npm.cmd run test:e2e` e `npm.cmd run build`. Esperado: passam.
- [ ] **Step 4: Commit.**

---

## Fase C — Radar e fluxo

### Task 8: Radar (lista e escopo)

**Files:**
- Modify: `app/(app)/radar/page.tsx`, `lib/consulta-itens.ts`, `components/grade-itens.tsx`
- Modify: `app/(app)/supervisor/page.tsx` (vira redirect)

**Interfaces:**
- Consumes: `buscarPaginaItens(supabase, filtros)` e `FiltrosPainel` de `lib/consulta-itens.ts`; `vw_itens_abertos`.
- Produces: `FiltrosPainel` ganha `equipe?: "minha" | "todas"`; padrão `"minha"` para supervisor (equipe pelo `supervisor_id` do perfil) e `"todas"` para QSMS/admin. Entrada no Radar: `status in ('sem_registro','vencido')` ou `dias_restantes <= 90`; vencidos e sem registro primeiro (já é a ordem de `peso_status`); remover a coluna "Parado há" da `GradeItens`.

- [ ] **Step 1:** Ajustar `montarConsultaItens` para o filtro de equipe e a regra de entrada. Supervisor sem `supervisor_id`: devolver lista vazia e a página mostra o aviso `Vazio` ("Você ainda não tem equipe vinculada. Tire o filtro para ver a UEN."), sem lançar erro.
- [ ] **Step 2:** Seletor "Minha equipe / Todos" na `GradeItens`, visível a todos; para QSMS o padrão é "Todos".
- [ ] **Step 3:** Verificação manual como supervisor de teste (equipe vazia): tela abre, aviso aparece, filtro "Todos" lista a UEN. Como QSMS: lista completa.
- [ ] **Step 4:** `npm.cmd run typecheck` e `npm.cmd run build`.
- [ ] **Step 5: Commit.**

### Task 9: Botões por linha e "Registrar resultado"

**Files:**
- Create: `components/radar/botao-acao-linha.tsx`, `components/radar/formulario-resultado.tsx`
- Modify: `components/grade-itens.tsx` (coluna de ações), `app/(app)/qsms/acoes.ts` (nova Server Action), `components/acoes-item.tsx` (ficha do item usa o mesmo mapeamento)
- Create: `lib/acoes-etapa.ts`

**Interfaces:**
- Produces: `lib/acoes-etapa.ts`: `export type AcaoLinha = { id: string; rotulo: string }` e `export function acoesDaEtapa(etapa: Etapa): { principal: AcaoLinha | null; secundarias: AcaoLinha[] }` implementando a tabela da seção 7 da spec (principal: Pendente→`solicitar_data`, Data solicitada→`informar_data`, Data proposta→`agendar`, Agendado→`enviar_clinica`, Enviado à clínica→`registrar_resultado`, Aguardando documento→`concluir_documento`, Inapto→`encerrar_inapto`; secundárias: `cancelar`, `devolver`, `informar_dados`, `registrar_falta`, `perfil`, `historico`, conforme etapa).
- Produces: `registrarResultado(_anterior: Acao | null, formData: FormData): Promise<Acao>` em `acoes.ts`: valida com Zod (`desfecho`; se `fez_apto`, `resultado`, `data_documento`, arquivo obrigatório), **faz o upload com `enviarDocumentoAso` antes** da RPC (mesma razão do comentário em `concluirItem`), chama `fn_registrar_resultado` e chama `revalidarPaineis`.

- [ ] **Step 1:** Teste de unidade manual-assistido não existe (sem runner). Criar `scripts/teste-acoes-etapa.mjs` que importa `lib/acoes-etapa.ts` via `node --experimental-strip-types` e verifica, para cada uma das 9 etapas, o botão principal esperado e que `concluido`/`cancelado` devolvem `principal: null`. Rodar: falha (arquivo não existe).
- [ ] **Step 2:** Implementar `acoesDaEtapa` e rodar o teste: passa.
- [ ] **Step 3:** Implementar `registrarResultado` e o formulário (janela sobre a lista; reaproveitar `formulario-concluir.tsx` e `formularios-item.tsx`): desfecho em destaque; quando "Fez e apto", mostram-se `resultado`, `data_documento`, `data_realizado`, arquivo; outros desfechos só observação.
- [ ] **Step 4:** Ligar o botão principal e o menu secundário (Radix `DropdownMenu`) à `GradeItens`, cada ação abrindo o formulário que já existe em `components/formulario-*.tsx`. Marcar com selo discreto de petróleo/grafite quem é o "responsável" (`DONO_ROTULO`); nenhuma cor de semáforo.
- [ ] **Step 5:** Verificação manual com contas de teste (itens de teste, não reais): fluxo completo previsto → … → registrar resultado apto com PDF → item concluído e próximo ciclo previsto.
- [ ] **Step 6:** `npm.cmd run typecheck` e `npm.cmd run build`. **Step 7: Commit.**

### Task 10: Faixa "Para você agir" e entrada do supervisor

**Files:**
- Create: `components/radar/faixa-para-voce.tsx`
- Modify: `app/(app)/radar/page.tsx`

**Interfaces:** Consumes: `vw_itens_abertos` com `etapa in ('data_solicitada')` e `etapa = 'enviado_clinica'`, filtrado pela equipe do usuário (supervisor) ou, para QSMS, as etapas `previsto`, `data_proposta`, `aguardando_documento`, `inapto_em_tratativa` [palpite da spec 7]. Produces: duas contagens clicáveis que aplicam o filtro de etapa à lista abaixo (`?etapa=`).

- [ ] **Step 1:** Implementar com contagens vindas de uma consulta `count: "exact", head: true` por etapa.
- [ ] **Step 2:** Verificação manual como supervisor e como QSMS; supervisor sem fila vê "Nada para você agora."
- [ ] **Step 3:** `npm.cmd run typecheck` e `build`. **Step 4: Commit.**

### Task 11: Marca GESET na interface

**Files:**
- Create: `components/geset/lista-geset.tsx`, `app/(app)/qsms/geset-acoes.ts` (ou acrescentar em `acoes.ts`)
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/radar/page.tsx`

**Interfaces:** Consumes: `vw_pendencias_geset`, `fn_marcar_geset`. Produces: `marcarGeset(_anterior: Acao | null, formData: FormData): Promise<Acao>` (campos `evento_id`, `lancado`); cartão "Falta lançar no GESET" no Dashboard com contagem; segmento "Falta lançar no GESET" no Radar (`?fila=geset`) listando matrícula, nome, requisito, data do documento e botão "Marcar como lançado".

- [ ] **Step 1:** Implementar a lista e a ação (desfazer permitido, com a mesma auditoria).
- [ ] **Step 2:** Verificação manual com evento de teste. Confirmar que a contagem do Dashboard bate com `select count(*) from vw_pendencias_geset` (comparar numa consulta de leitura).
- [ ] **Step 3:** `typecheck`, `build`. **Step 4: Commit.**

---

## Fase D — Dashboard e Colaboradores

### Task 12: Dashboard conforme a spec

**Files:** Modify `app/(app)/dashboard/page.tsx` (hoje 354 linhas: extrair blocos para `components/dashboard/*.tsx` conforme o arquivo crescer), `lib/consulta-itens.ts`; migration só se faltar dado (ver passo 1).

**Interfaces:** Consumes: `fn_resumo_status`, `fn_resumo_por_etapa`, `fn_resumo_por_supervisor`, `fn_conclusoes_por_mes`, `fn_vencimentos_a_frente`, `vw_pendencias_geset`. Produces: os seis cartões de semáforo, os cartões de processo (No radar, Agendados, Parados além do prazo, Concluídos no mês, Falta lançar no GESET), por etapa, "Pendências por responsável" (Supervisão × QSMS, usando `dono`), 20 mais próximos de vencer em lista rolável e métricas (% em dia, tempo médio por etapa, concluídos por mês). Cada número é um link `?detalhe=<chave>` que abre a lista no fim da página; filtro de equipe para supervisor (`?equipe=minha`).

- [ ] **Step 1:** Conferir quais números já existem nas RPCs. Para "tempo médio por etapa" e "concluídos no mês", se não houver RPC, criar `0020_metricas_dashboard.sql` com funções `fn_tempo_medio_por_etapa()` e `fn_concluidos_no_mes()` e testar com `scripts/teste-semaforo.mjs`-estilo; decidir e registrar na memória.
- [ ] **Step 2:** Implementar o layout seguindo `.superpowers/brainstorm/dashboard-v3.html`.
- [ ] **Step 3:** Verificação manual: clique em cada número abre a lista correta; contagens do semáforo somam o total de pessoas (por pessoa, no pior status).
- [ ] **Step 4:** `typecheck`, `build`. **Step 5: Commit.**

### Task 13: Colaboradores como lista única

**Files:** Create `app/(app)/colaboradores/page.tsx` (substitui a casca da Task 7), `components/colaboradores/lista.tsx`, `lib/consulta-colaboradores.ts`; Modify `app/(app)/qsms/colaborador/[id]/cadastro/acoes.ts` (`alternarAtivo` já liberado na Task 5).

**Interfaces:** Produces: `buscarColaboradores(supabase, filtros: { busca?: string; status?: StatusConformidade; requisito?: string; supervisorId?: string; situacao?: "ativos" | "desligados"; equipe?: "minha" | "todas"; pagina?: number })` retornando `{ linhas, total }` (25 por página). Supervisor abre com `equipe = "minha"`. Filtro **Desligados** lista `ativo = false` com botão "Reativar" (`alternarAtivo`). Filtro Ausentes **não** entra (spec 12b, item 6).

- [ ] **Step 1:** Implementar a consulta (busca só dígitos = matrícula exata ou nome; texto = "contém" no nome, 300 ms de espera como no Radar atual) e a lista com o perfil em janela (`BotaoNomeColaborador`).
- [ ] **Step 2:** Verificação manual: busca por matrícula, filtro de requisito, Desligados e reativar um colaborador **de teste** (não de produção).
- [ ] **Step 3:** `typecheck`, `build`. **Step 4: Commit.**

### Task 14: Cadastros e limpeza

**Files:**
- Modify: `components/perfil/aba-aso.tsx` (lançamento do último ASO retroativo, reaproveitando `registrarAsoRetroativo` de `app/(app)/qsms/base/acoes.ts`)
- Modify: `components/sidebar.tsx` (grupo Cadastros: só Supervisores e Ausências; Base some; Desligados some)
- Delete: `app/(app)/qsms/base/page.tsx`, `app/(app)/admin/desligados/page.tsx` (substituir por redirect para `/colaboradores?situacao=desligados`), `components/barra-topo.tsx`, wrappers `exigirQsms`/`exigirSupervisor` e `.faixa-app` sem uso

- [ ] **Step 1:** Mover o formulário de ASO retroativo para a aba ASO do perfil; manter a mesma Server Action e auditoria.
- [ ] **Step 2:** Remover o que ficou sem uso (`Grep` confirma zero referências) e deixar redirects de `/qsms/base` e `/admin/desligados`.
- [ ] **Step 3:** `typecheck`, `build`, `test:e2e`. **Step 4: Commit.**

### Task 15: Fechamento

- [ ] **Step 1:** Rodar `npm.cmd run teste:permissoes`, `node scripts/teste-semaforo.mjs`, `node scripts/teste-geset.mjs`, `typecheck`, `build`, `test:e2e`. Registrar o resultado real (inclusive falhas) na `MEMORIA_COMPARTILHADA.md`.
- [ ] **Step 2:** Percorrer o fluxo completo no navegador como QSMS e como supervisor com contas de teste; capturar telas desktop e 390 px.
- [ ] **Step 3:** Atualizar a memória (decisões, verificações, pendências e o que ficou para a especificação 2) e **pedir a Matheus** autorização para o push, lembrando que publica na Vercel.
