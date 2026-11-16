# Integração com a CENTRAL-NEO — Fase 1 (leitura e sincronização) · Plano

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Os passos usam caixas `- [ ]`.

**Objetivo:** o GIRO lê o cadastro de colaboradores da NEO por uma porta estreita (função só de leitura), liga cada pessoa pela matrícula Engelmig, traz desligamento e matrícula CEMIG, e vincula a equipe de cada supervisor pelo texto da NEO. Nada é escrito na NEO nesta fase.

**Arquitetura:** (1) uma Edge Function nova da NEO (`giro-colaboradores`, ação `listar`) protegida por segredo próprio, que devolve só colunas permitidas; (2) no GIRO, uma RPC `fn_sincronizar_neo` no Postgres, que recebe as linhas da NEO e faz o casamento, a atualização e a auditoria em uma transação (a regra fica no banco, como na especificação 1), com modo "relatório" que não grava; (3) uma rota de cron diária, um botão "Atualizar agora" e um script da primeira carga chamando a mesma RPC.

**Tecnologias:** GIRO: Next 15, React 19, TypeScript, Supabase (Postgres, RLS), Zod. NEO: Deno (Edge Function), repositório `c:\APPWEB\central-neo`.

**Especificação:** `docs/superpowers/specs/2026-11-16-integracao-central-neo-design.md` (aprovada em 16/11/2026). Este plano cobre a **fase 1** da seção 7. As fases 2 (escrita) e 3 (acabamento) terão planos próprios, depois de a primeira carga real mostrar as grafias de supervisor e o mapeamento de `base`.

## Global Constraints

- Mensagem de todo commit, em qualquer repositório: exatamente `Corrigimos alguns erros e melhoramos a experiência geral. Até breve, Matheus` (gravar num arquivo e usar `git commit -F`; sem `Co-Authored-By`). Conferir com `git log -1 --format=%B`.
- **Nada é escrito na NEO nesta fase.** A função da NEO só tem a ação `listar`.
- Só o banco real de produção existe. Testes de banco rodam em UMA transação desfeita, com fixtures (`matricula >= 999000`, e-mails `@exemplo.invalido`) e conferência de resíduo no fim, no estilo de `scripts/teste-geset.mjs`.
- Migration nova: aplicar só com `npm run db:push -- --only <4 dígitos>` e **somente depois de autorização expressa do Matheus para aquela migration**; ensaiar antes em transação desfeita; salvar script de rollback (só leitura, gerado do catálogo) fora do repositório. Nunca `db:push` sem filtro.
- Mudança no projeto NEO (deploy da função, segredo): só com autorização expressa do Matheus para aquela tarefa. A pasta `supabase/` da NEO fica fora do Git; seguir `CONTEXTO_GERAL.md` e `MEMORIA_COMPARTILHADA.md` de lá (nunca editar migration aplicada; testes que gravam no banco só com transação desfeita).
- Segredo (`NEO_INTEGRACAO_URL`, `NEO_INTEGRACAO_SEGREDO`): só variável de ambiente de servidor. Nunca em código, log, memória compartilhada, relatório ou commit. O relatório de sincronização traz contagens e matrículas, **nunca CPF nem nome de pessoa**.
- Dados da NEO não sobrescrevem com vazio: campo nulo ou vazio vindo da NEO não apaga o valor do GIRO, exceto `ativo` e `data_desligamento`, que valem como a NEO manda (inclusive `null`).
- `uen`, foto, `exige_avp`, situação, polo, local e data de nascimento são do GIRO: a sincronização não toca neles. Esta fase **não grava** `local` a partir de `base`; só lista as bases no relatório.
- Funções SQL: `security definer`, `set search_path = public`, `revoke all ... from public`, grants explícitos. Textos de erro para o usuário em português.
- Arquivos puros testados com `node --experimental-strip-types`: só `import type` e caminhos relativos.
- Regra de papel: operador (admin, qsms, supervisor ativo) pode atualizar agora; só QSMS/admin resolve nome de supervisor sem vínculo.

## Review Focus

1. Linha da NEO com matrícula Engelmig vazia ou não numérica (ex.: `e272662`): é contada no relatório e ignorada, sem erro e sem ligar à pessoa errada.
2. Dois supervisores com mesma grafia depois de normalizar (acento, caixa, espaços duplos, espaço nas pontas): casam com o mesmo supervisor; texto de supervisor vazio não desvincula ninguém.
3. A NEO manda cargo/CPF/nome vazios onde o GIRO tem valor: nada é apagado; `data_desligamento` nula numa pessoa reativada limpa a data.
4. Rodar a sincronização duas vezes seguidas: a segunda não altera nenhuma linha nem grava auditoria.
5. NEO fora do ar, HTTP 500, segredo errado ou paginação cortada no meio: a sincronização falha inteira, a RPC nem é chamada e nada fica aplicado pela metade.
6. CPF diferente entre as duas bases, ou matrícula já ligada a outro cadastro da NEO: vira divergência no relatório, nunca correção silenciosa.

---

## Contrato da função da NEO (usado pelas tarefas 1 e 3)

Requisição: `POST`, cabeçalho `x-giro-segredo: <segredo>`, corpo JSON `{ "acao": "listar", "apos": "<uuid>" }` (`apos` opcional: devolve linhas com `id` maior, ordenado por `id`, até 500 por chamada).
Resposta 200: `{ "linhas": LinhaNeo[], "proxima": string | null, "total": number }` (`proxima` = último `id` da página, ou `null` na última; `total` = total de cadastros na NEO).
Erros: `401 {erro}` (segredo ausente ou errado), `405 {erro}` (método), `400 {erro}` (corpo ou ação inválidos).

```ts
type LinhaNeo = {
  id: string;                          // uuid do colaborador na NEO
  nome: string;
  cpf: string | null;                  // só dígitos
  matricula_cemig: string | null;
  matricula_engelmig: string | null;
  cargo: string | null;
  supervisor: string | null;           // texto livre
  base: string | null;
  data_admissao: string | null;        // AAAA-MM-DD
  data_desligamento: string | null;    // AAAA-MM-DD
  ativo: boolean;
  atualizado_em: string;               // ISO
};
```

Não saem da função: e-mail, telefone, observação, `usuario_id`, gc, go, equipe.

---

### Task 1: Função `giro-colaboradores` na NEO (só `listar`)

**Repositório:** `c:\APPWEB\central-neo` (commits lá, mesma mensagem fixa).

**Files:**
- Create: `supabase/functions/giro-colaboradores/nucleo.ts` — lógica pura (sem `Deno`, sem import de pacote)
- Create: `supabase/functions/giro-colaboradores/index.ts` — casca Deno: lê segredo e service role do ambiente, consulta a tabela, chama o núcleo
- Create: `scripts/giro-colaboradores-testar.mjs` — teste puro do núcleo
- Modify: `CONTEXTO_GERAL.md` (linhas de funções, ~53 e ~158) — registrar a função e o comando de deploy

**Interfaces:**
- Produces (`nucleo.ts`): `export const COLUNAS_PERMITIDAS: readonly string[]`; `export function segredoConfere(recebido: string | null, esperado: string | undefined): boolean` (comparação em tempo constante; `false` se `esperado` for vazio); `export function projetar(linha: Record<string, unknown>): LinhaNeo` (só as colunas do contrato); `export function paginar(linhas: LinhaNeo[], limite: number, total: number): { linhas: LinhaNeo[]; proxima: string | null; total: number }`.

- [ ] **Step 1: Escrever o teste que falha** em `scripts/giro-colaboradores-testar.mjs`: `segredoConfere(null,'x')` é `false`; `segredoConfere('x','')` é `false`; `segredoConfere('abc','abc')` é `true`; `projetar({...linha completa com email, telefone, observacao, usuario_id})` devolve exatamente as 12 chaves do contrato (nenhuma das quatro proibidas); `paginar` com 3 linhas e limite 2 devolve `linhas.length === 2` e `proxima` igual ao `id` da 2ª linha, e com 2 linhas e limite 2 devolve `proxima === null`.
- [ ] **Step 2: Rodar e ver falhar:** `node --experimental-strip-types scripts/giro-colaboradores-testar.mjs` → falha por módulo inexistente.
- [ ] **Step 3: Implementar `nucleo.ts`** conforme as assinaturas. `paginar` recebe até `limite + 1` linhas (a consulta pede uma a mais para saber se há próxima).
- [ ] **Step 4: Rodar e ver passar** (saída termina sem falhas, exit 0).
- [ ] **Step 5: Implementar `index.ts`:** só `POST` (405 nos demais, `OPTIONS` responde CORS vazio); 401 se `segredoConfere(req.headers.get('x-giro-segredo'), Deno.env.get('GIRO_INTEGRACAO_SEGREDO'))` for falso; 400 se `acao !== 'listar'` ou `apos` não for uuid; consulta `colaboradores` com a service role (`order('id')`, `gt('id', apos)`, `limit(501)`) e `count: 'exact'` para `total`; responde `paginar(...)`. Nunca registrar o corpo nem o segredo em log.
- [ ] **Step 6: Typecheck/lint no estilo do projeto NEO** (`npx tsc --noEmit` se aplicável à pasta; senão `deno check` local, se disponível). Relatar o que foi possível.
- [ ] **Step 7: Commit** na NEO com a mensagem fixa.
- [ ] **Step 8 (PARAR e pedir ao Matheus):** deploy (`supabase functions deploy giro-colaboradores --project-ref <ref de CONTEXTO_GERAL.md:158> --use-api`) e definição do segredo `GIRO_INTEGRACAO_SEGREDO` nas secrets da função. O segredo é gerado por Matheus (ou por `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` sem registrar em lugar nenhum) e colocado direto nas secrets da NEO e nas variáveis do GIRO (Vercel e `.env.local`). Depois do deploy, conferir sem o segredo (espera 401) e com ele (espera 200 e `total` igual à contagem da NEO).

---

### Task 2: Migration 0023 — estrutura, normalizador e apelidos de supervisor

**Files:**
- Create: `supabase/migrations/0023_neo_estrutura.sql`
- Create: `scripts/teste-neo-sincronizacao.mjs` (começa aqui com os casos desta tarefa; a Task 3 amplia)
- Modify: `package.json` — script `"teste:neo-sync": "node scripts/teste-neo-sincronizacao.mjs"`

**Interfaces:**
- Produces (banco): colunas em `colaboradores`: `neo_id uuid unique`, `matricula_cemig text`, `data_desligamento date`, `neo_sincronizado_em timestamptz`. Tabela `supervisor_apelidos(texto_normalizado text primary key, supervisor_id uuid not null references supervisores(id) on delete cascade, criado_por uuid, criado_em timestamptz default now())`. Tabela `neo_sincronizacoes(id uuid pk default gen_random_uuid(), iniciado_em timestamptz default now(), origem text check (origem in ('cron','manual','carga')), usuario_id uuid, resumo jsonb, erro text)`. Função `fn_normalizar_texto(p_texto text) returns text` (imutável: minúsculas, sem acento, espaços colapsados e aparados; `null` e vazio dão `null`). Função `fn_vincular_apelido_supervisor(p_texto text, p_supervisor_id uuid) returns void` (guarda `fn_e_qsms()`; grava `fn_normalizar_texto(p_texto)`; erro em português se o texto normalizado for vazio ou o supervisor não existir). Função `fn_registrar_falha_neo(p_origem text, p_erro text) returns void` (guarda: operador ou service role; insere em `neo_sincronizacoes` só `origem`, `usuario_id`, `erro`, truncando `p_erro` a 500 caracteres).
- RLS: `supervisor_apelidos` e `neo_sincronizacoes` com RLS ligada; `select` para `fn_e_operador()`; sem escrita direta para `authenticated` (só pelas funções). Grants de coluna e tabela de `colaboradores` da 0021 não mudam: as colunas novas **não** entram no `grant update` de `authenticated`.

- [ ] **Step 1: Escrever os testes** (RED) em `teste-neo-sincronizacao.mjs`, no estilo de `teste-geset.mjs` (uma transação, rollback, resíduo): `fn_normalizar_texto('  João  da  SILVA ')` = `'joao da silva'`; `null` e `'   '` dão `null`; `fn_vincular_apelido_supervisor` como QSMS grava e como supervisor falha com 42501; `neo_id` é único (segunda linha com o mesmo `neo_id` falha com 23505); `authenticated` não consegue `update colaboradores set neo_id = ...` (42501) e não consegue `insert` em `supervisor_apelidos` nem `neo_sincronizacoes`; operador lê as duas tabelas, usuário sem perfil não lê.
- [ ] **Step 2: Rodar e ver falhar** (`npm run teste:neo-sync`): a migration ainda não existe.
- [ ] **Step 3: Escrever `0023_neo_estrutura.sql`:** idempotente (`add column if not exists`, `create table if not exists`, `create or replace`, `drop policy if exists`), comentada em português. O normalizador usa `translate()` com a lista de vogais acentuadas e `ç` (sem depender da extensão `unaccent`).
- [ ] **Step 4: Ensaiar duas vezes em transação desfeita**, gerar `rollback-0023.sql` fora do repositório (catálogo, só leitura).
- [ ] **Step 5 (PARAR e pedir ao Matheus):** autorização para aplicar a 0023. Depois: `npm run db:push -- --only 0023`, rodar `teste:neo-sync`, `teste:permissoes`, `teste:semaforo`, `teste:geset` (todos verdes, sem resíduo).
- [ ] **Step 6: Commit** (migration, teste e `package.json`).

---

### Task 3: Migration 0024 — `fn_sincronizar_neo`

**Files:**
- Create: `supabase/migrations/0024_neo_sincronizacao.sql`
- Modify: `scripts/teste-neo-sincronizacao.mjs`

**Interfaces:**
- Consumes: tudo da Task 2; `fn_e_operador()`; `auditoria_colaborador` (colunas `colaborador_id, usuario_id, acao, entidade, campo, valor_anterior, valor_novo, origem`).
- Produces: `fn_sincronizar_neo(p_linhas jsonb, p_aplicar boolean, p_origem text) returns jsonb`. `p_linhas` é o array de `LinhaNeo` do contrato; `p_origem` ∈ `cron`, `manual`, `carga`. Guarda: se `auth.uid()` não for nulo, exige `fn_e_operador()`; com `auth.uid()` nulo só roda para `service_role`/dono (grant execute só a `authenticated` e `service_role`; `anon` e `public` sem execute). Devolve o relatório abaixo e, com `p_aplicar = true`, grava uma linha em `neo_sincronizacoes`.

Relatório (`jsonb`, só contagens e matrículas): `total_neo`, `ligados_novos`, `atualizados`, `sem_mudanca`, `nao_numericas` (contagem), `na_neo_fora_do_giro`, `no_giro_sem_neo`, `divergencias` (lista de `{matricula, motivo}` com motivo ∈ `cpf_diferente`, `ja_ligada_a_outro`), `matricula_diferente` (contagem de ligados cuja matrícula Engelmig da NEO difere da do GIRO), `campos_alterados` (objeto campo → contagem), `desligados_novos` (contagem), `supervisores_vinculados`, `supervisores_sem_vinculo` (lista de `{texto, quantidade}` com o texto original mais frequente), `bases` (lista de `{base, quantidade}`).

Regras (decididas na especificação, seções 5.1 a 5.4, e no cabeçalho deste plano):
1. Só linhas com `matricula_engelmig` de 1 a 9 dígitos numéricos entram; as demais contam em `nao_numericas`.
2. Casamento: primeiro por `neo_id = r.id`; senão por `matricula = r.matricula_engelmig::int`. Sem casamento: conta em `na_neo_fora_do_giro`, não cria ninguém.
3. Pessoa casada só por matrícula e ainda sem `neo_id`: se o GIRO já tem outro `neo_id`, divergência `ja_ligada_a_outro`; se os dois CPFs existem e diferem, divergência `cpf_diferente`; senão liga (`neo_id`).
4. Campos NEO→GIRO só para pessoas ligadas: `nome`, `cpf`, `cargo`, `data_admissao`, `matricula_cemig` (somente com valor não vazio); `ativo` e `data_desligamento` como a NEO manda. A matrícula do GIRO nunca muda aqui.
5. Supervisor: `fn_normalizar_texto(r.supervisor)` casa com `fn_normalizar_texto(supervisores.nome)` ou com `supervisor_apelidos`; casando, define `supervisor_id` da pessoa ligada; texto vazio ou sem casamento não mexe no vínculo atual (o sem casamento entra em `supervisores_sem_vinculo`).
6. Cada campo que muda gera uma linha de auditoria (`acao 'alterou'`, `entidade 'colaborador'`, `origem 'Sincronização NEO'`, `usuario_id = auth.uid()`); ligar gera uma linha com `campo 'neo_id'`. `neo_sincronizado_em = now()` só quando algo foi verificado numa aplicação (`p_aplicar`).
7. `p_aplicar = false` não grava nada (nem auditoria, nem `neo_sincronizacoes`); devolve o mesmo relatório que a aplicação devolveria.

- [ ] **Step 1: Escrever os testes** (RED), todos sobre fixtures e dentro da transação desfeita, chamando a função como `authenticated` (operador) e como `service_role`: (a) liga por matrícula e preenche `neo_id`, `matricula_cemig`, `data_desligamento`; (b) CPF divergente → divergência e nenhuma ligação; (c) matrícula `'e272662'` → `nao_numericas`; (d) campo `cargo` nulo da NEO não apaga o do GIRO, mas `data_desligamento` nula limpa a data; (e) `supervisor` `'  JOÃO  da Silva '` casa com supervisor fixture `João da Silva`, e um nome sem casamento aparece em `supervisores_sem_vinculo` e não mexe no vínculo atual; apelido resolve o segundo caso depois de `fn_vincular_apelido_supervisor`; (f) `p_aplicar = false` não altera nenhuma linha nem cria auditoria (conferir contagens antes/depois); (g) segunda aplicação seguida: `atualizados = 0`, `ligados_novos = 0` e nenhuma linha nova de auditoria; (h) `ativo = false` da NEO desativa a pessoa ligada e conta em `desligados_novos`; (i) chamada como `anon` ou como usuário sem perfil falha (42501); (j) relatório não contém a string do CPF nem do nome de nenhuma fixture.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar a migration 0024** (idempotente, comentada, `create or replace`, grants). Uma única instrução atômica por chamada; `for update` nas linhas de `colaboradores` tocadas para não competir com edições manuais.
- [ ] **Step 4: Ensaiar duas vezes em transação desfeita**, rollback salvo fora do repositório.
- [ ] **Step 5 (PARAR e pedir ao Matheus):** autorização para aplicar a 0024; aplicar com `--only 0024`; rodar as quatro suítes de banco; zero resíduo.
- [ ] **Step 6: Commit.**

---

### Task 4: Cliente da NEO em `lib/neo.ts`

**Files:**
- Create: `lib/neo.ts` — só `import type` e caminhos relativos; sem Zod (roda sob strip-types)
- Create: `scripts/teste-neo-cliente.mjs`
- Modify: `package.json` — `"teste:neo-cliente": "node --experimental-strip-types scripts/teste-neo-cliente.mjs"`
- Modify: `.env.example` — `NEO_INTEGRACAO_URL=` e `NEO_INTEGRACAO_SEGREDO=` com comentário

**Interfaces:**
- Produces: `export type LinhaNeo` (igual ao contrato acima); `export class ErroNeo extends Error` (mensagem em português, sem segredo nem corpo da resposta); `export function validarLinha(x: unknown): LinhaNeo` (lança `ErroNeo` se faltar `id`, `nome`, `ativo` ou algum tipo estiver errado); `export async function listarColaboradoresNeo(opcoes?: { buscar?: typeof fetch; url?: string; segredo?: string; tempoLimiteMs?: number }): Promise<LinhaNeo[]>` — percorre as páginas por `proxima`, tempo limite de 15 s por chamada, máximo de 20 páginas, e no fim confere que a quantidade recebida é igual ao `total` da última página (senão lança `ErroNeo('Resposta incompleta da NEO.')`).

- [ ] **Step 1: Escrever os testes** (RED) com `fetch` injetado: três páginas (500, 500, 120) viram 1120 linhas; `total` diferente do recebido lança `ErroNeo`; HTTP 401 lança `ErroNeo` cuja mensagem não contém o segredo; HTTP 500 e rede caindo (`fetch` rejeitado) lançam `ErroNeo`; resposta com `linhas` que não é array lança `ErroNeo`; linha sem `ativo` lança; sem `url` ou `segredo` configurados lança `ErroNeo('Integração com a NEO não configurada.')`; o cabeçalho `x-giro-segredo` vai em todas as chamadas e o segredo nunca aparece em `error.message`.
- [ ] **Step 2: Rodar e ver falhar** (`npm run teste:neo-cliente`).
- [ ] **Step 3: Implementar `lib/neo.ts`** conforme as assinaturas.
- [ ] **Step 4: Rodar e ver passar; `npm run typecheck`.**
- [ ] **Step 5: Commit.**

---

### Task 5: Núcleo da sincronização, rota de cron e variáveis

**Files:**
- Create: `lib/sincronizar-neo.ts` — usa o cliente do Supabase (não é puro)
- Create: `app/api/cron/sincronizar-neo/route.ts` — mesmo molde de `app/api/cron/gerar-itens/route.ts` (`cronAutorizado`, `criarClienteAdmin`, GET e POST, `maxDuration = 60`)
- Modify: `vercel.json` — cron `/api/cron/sincronizar-neo` às `30 8 * * *` (antes do `gerar-itens`, que roda às 9h)

**Interfaces:**
- Consumes: `listarColaboradoresNeo`, `ErroNeo` (Task 4); `fn_sincronizar_neo` e `fn_registrar_falha_neo` (Tasks 2 e 3).
- Produces: `export type RelatorioSincronizacao` (formato do relatório da Task 3); `export async function executarSincronizacao(supabase: SupabaseClient, opcoes: { aplicar: boolean; origem: 'cron' | 'manual' | 'carga' }): Promise<RelatorioSincronizacao>` — lista tudo na NEO primeiro; só se a listagem completa der certo chama `fn_sincronizar_neo`; em `ErroNeo` ou erro de RPC chama `fn_registrar_falha_neo` (quando `aplicar`) e relança. Nunca registra linhas, nomes nem CPF em log; `console.log` só com contagens.

- [ ] **Step 1:** Implementar `lib/sincronizar-neo.ts` e a rota (cron aplica `aplicar: true, origem: 'cron'`; resposta JSON com as contagens do relatório, sem listas de pessoas).
- [ ] **Step 2: Verificação:** `npm run typecheck`; com `NEO_INTEGRACAO_*` no `.env.local` apontando para a função já publicada (Task 1) e o dev server rodando, `GET /api/cron/sincronizar-neo` sem `Authorization` em produção simulada (`NODE_ENV=production` com `CRON_SECRET`) devolve 401; com o cabeçalho certo devolve 200 e contagens. **Não** rodar com aplicação real antes da Task 7 (o endpoint só deve ser chamado em produção depois da primeira carga aprovada); em teste local usar o banco real apenas se o Matheus tiver autorizado a primeira carga.
- [ ] **Step 3: Commit.**

---

### Task 6: Telas — "Atualizar agora", última sincronização e nomes de supervisor sem vínculo

**Files:**
- Create: `app/(app)/colaboradores/acoes-neo.ts` — Server Actions `atualizarAgoraNeo()` (exige operador; chama `executarSincronizacao` com `origem 'manual'`; devolve `{ ok: true, resumo }` ou `{ ok: false, erro }` em português) e `vincularNomeSupervisor(textoNeo: string, supervisorId: string)` (exige QSMS/admin; chama `fn_vincular_apelido_supervisor` e em seguida `executarSincronizacao`)
- Create: `components/colaboradores/botao-atualizar-neo.tsx` — botão com estado de carregamento e aviso do resultado; mostra "Última sincronização: dd/mm hh:mm" (lida de `neo_sincronizacoes`, a mais recente com `erro` nulo) e, se a última tentativa falhou, o aviso discreto "A última tentativa falhou"
- Create: `app/(app)/qsms/supervisores/nomes-neo-sem-vinculo.tsx` — seção que lista `supervisores_sem_vinculo` do último relatório aplicado, com um seletor de supervisor por nome e o botão "Vincular"
- Modify: `app/(app)/colaboradores/page.tsx` — inserir o botão no cabeçalho (só para operador, que já é a regra da página)
- Modify: `app/(app)/qsms/supervisores/page.tsx` — ler o último `resumo` de `neo_sincronizacoes` e renderizar a seção (somente para QSMS/admin; para supervisor, nada)
- Modify: `app/(app)/qsms/colaborador/[id]/cadastro/ficha-cadastro.tsx` — mostrar, somente leitura, "Matrícula CEMIG" e "Desligamento" (quando existirem), com o selo "Cadastro da NEO"
- Modify: `lib/tipos.ts` — acrescentar `matricula_cemig`, `data_desligamento`, `neo_id`, `neo_sincronizado_em` ao tipo do colaborador
- Modify: `lib/consulta-colaborador.ts` — incluir as colunas novas no `select` do perfil

**Interfaces:**
- Consumes: `executarSincronizacao` (Task 5); `exigirOperador`, `exigirAdmin` (`lib/perfil.ts`; para "QSMS ou admin" usar o papel do perfil já lido, como nas demais telas de supervisores).
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Escrever testes e2e** no estilo de `e2e/` do projeto (conferir a pasta e o runner existentes): o botão aparece em `/colaboradores` para operador e a ação responde com aviso quando a NEO não está configurada (mensagem em português, sem quebrar a página); a seção de nomes sem vínculo não aparece para supervisor.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** os arquivos acima. As ações revalidam `/colaboradores` e `/qsms/supervisores` (`revalidatePath`).
- [ ] **Step 4: `npm run typecheck`, `npm run build`, e2e verdes.** Verificar no navegador (como QSMS, sessão real do GIRO local): o botão, o aviso de "não configurada" e a ficha de cadastro.
- [ ] **Step 5: Commit.**

---

### Task 7: Script da primeira carga e documentação

**Files:**
- Create: `scripts/neo-primeira-carga.mjs` — lista a NEO com `listarColaboradoresNeo` (importada de `lib/neo.ts`, que roda sob strip-types) e chama `fn_sincronizar_neo` por `pg` direto (`SUPABASE_DB_URL`), como os demais scripts; não importa `lib/sincronizar-neo.ts`
- Modify: `README.md` — seção da integração (variáveis, cron, botão, primeira carga)
- Modify: `contexto_geral.md` e `docs/contexto-atual.md` — estado da integração e a decisão de fases
- Modify: `scripts/importar-ativos.mjs` — cabeçalho "CONTINGÊNCIA: depois da primeira carga da NEO, rodar só com `--simular` revisado" (sem mudar o comportamento)

**Interfaces:**
- Consumes: `listarColaboradoresNeo` (Task 4); `fn_sincronizar_neo` (Task 3).
- Produces: uso `node scripts/neo-primeira-carga.mjs` (padrão: relatório sem gravar, imprime só contagens e listas de matrículas/supervisores, nunca CPF nem nome); `--aplicar --sim-eu-sei --backup <arquivo>` aplica com `p_origem 'carga'` depois de gravar o backup (JSON com as linhas atuais de `colaboradores` que serão tocadas) no caminho informado, que deve estar **fora do repositório**; recusa `--aplicar` sem as duas outras flags; imprime contagens antes e depois (colaboradores, com `neo_id`, com `supervisor_id`).

- [ ] **Step 1: Escrever o script** com as flags acima e `--simular` como padrão. Teste manual das recusas (`--aplicar` sozinho falha com mensagem clara).
- [ ] **Step 2: Atualizar a documentação.**
- [ ] **Step 3: Rodar `npm run typecheck`, `npm run build` e todas as suítes puras e de banco** (`teste:neo-cliente`, `teste:neo-sync`, `teste:permissoes`, `teste:semaforo`, `teste:geset`, `teste:consulta`, `teste:acoes`, `teste:faixa`, `teste:geset-ui`, `teste:dashboard`, `teste:colaboradores`, `teste:db-push-args`).
- [ ] **Step 4: Commit.**
- [ ] **Step 5 (PARAR e mostrar ao Matheus):** rodar o relatório sem gravar contra a NEO real (depois do deploy da Task 1 e com as variáveis) e apresentar as contagens: quantos ligam, divergências, não numéricas, supervisores sem vínculo, bases. A **aplicação** da primeira carga só acontece com autorização expressa dele, depois de confirmar que o backup do Supabase está ativo.

---

## Auto-revisão

- **Cobertura da especificação (fase 1):** função de leitura na NEO (Task 1); colunas novas e apelidos (Task 2); ligação por matrícula, divergências, campos dono-NEO, supervisor por texto normalizado, auditoria, relatório sem gravar (Task 3); segredo e cliente (Task 4); sincronização diária e rota (Task 5); botão "Atualizar agora", última sincronização, nomes sem vínculo, matrícula CEMIG e desligamento visíveis (Task 6); primeira carga em duas etapas, backup, documentação e importador como contingência (Task 7). Ficam para planos seguintes: escrita na NEO e histórico lá, criar/editar colaborador, página de estado da integração, selo de "fora de sincronia".
- **Consistência de nomes:** `LinhaNeo`, `ErroNeo`, `listarColaboradoresNeo`, `executarSincronizacao`, `RelatorioSincronizacao`, `fn_sincronizar_neo`, `fn_vincular_apelido_supervisor`, `fn_registrar_falha_neo`, `fn_normalizar_texto`, `neo_sincronizacoes`, `supervisor_apelidos` usados com a mesma grafia em todas as tarefas.
- **Proporção:** a especificação tem cerca de 240 linhas; este plano mantém assinaturas, testes e regras, sem corpo de código.
