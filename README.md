# GIRO

Gestão integrada de requisitos ocupacionais — controle de ASO da UEN 211.

Um registro único e compartilhado entre QSMS e Supervisão de Campo, onde cada
ASO a vencer é uma **tarefa com dono e prazo**. O e-mail deixa de ser o registro
e passa a ser apenas a notificação.

Especificação: [`docs/plano_mvp.md`](docs/plano_mvp.md).
Identidade visual: [`docs/identidade-visual.md`](docs/identidade-visual.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Banco, auth e storage | Supabase (Postgres) |
| UI | Tailwind CSS 4 |
| E-mail | Resend |
| Jobs agendados | Vercel Cron |

Autenticação por **e-mail e senha**. Não há autocadastro: todo acesso é criado
por um admin em `/admin/usuarios`, com senha temporária definida no ato. Quem
recebe troca a senha depois em `/conta/senha`, e há fluxo de "esqueci minha
senha" por e-mail.

---

## Subir do zero

```bash
npm install
cp .env.example .env           # preencher com as chaves do Supabase
npm run db:push -- --todas --sim-eu-sei   # SÓ em banco vazio: aplica todas, em ordem
node scripts/criar-perfil.mjs admin voce@engelmig.com.br "Seu Nome" SuaSenha123
npm run seed:teste             # base fictícia de 15 colaboradores + 3 contas
npm run dev
```

> As migrations **não** são reaplicáveis em bloco. No banco em uso (hoje, o de
> produção), aplique uma de cada vez com `npm run db:push -- --only NNNN`.
> Reaplicar todas recria versões antigas de funções e para na 0003 sem
> consertar o estrago.
>
> Reaplicar sozinha uma migration antiga de permissões (por exemplo a 0004 ou a
> 0016 com `--only`) **reabre** as políticas que a 0021 e a 0022 fecharam: o
> `for all` do operador nas tabelas, a escrita do QSMS em `perfis`, o delete e
> o update do operador no bucket `asos`. Depois de qualquer reaplicação assim,
> aplique de novo `--only 0021` e `--only 0022`, nessa ordem.

A base **não tem dado real de pessoa**. O seed de teste popula 15 colaboradores
fictícios com CPFs de dígitos repetidos (inválidos pelo checksum, nunca colidem
com alguém real) e datas relativas à execução, cobrindo todos os status do
semáforo e todos os estágios do fluxo.

### Contas de teste (`npm run seed:teste`)

| Perfil | E-mail | Senha |
|---|---|---|
| Admin | `teste.admin@giro.local` | `Giro@Teste123` |
| QSMS | `teste.qsms@giro.local` | `Giro@Teste123` |
| Supervisor | `teste.supervisor@giro.local` | `Giro@Teste123` |

> `npm run seed:teste` é destrutivo: apaga todos os colaboradores e supervisores
> antes de popular os fictícios. Não rodar contra base com dado a preservar.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor local |
| `npm run build` | build de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push -- --only 0021` | aplica uma migration só (número exato de 4 dígitos; várias: `--only 0020,0021`). É o único jeito de aplicar migration no banco de produção |
| `npm run db:push -- --todas --sim-eu-sei` | reaplica todas, em ordem — **destrutivo** num banco em uso: as antigas recriam funções e regras superadas e a 0003 falha antes das que consertariam. Só para banco vazio. Sem filtro, `db:push` recusa e não conecta |
| `npm run seed:teste` | popula a base fictícia e as 3 contas de teste |
| `node scripts/verificar.mjs` | conferência rápida da base |
| `node scripts/teste-fluxo.mjs` | ciclo de vida completo contra o banco real |
| `npm run teste:permissoes` | permissões por papel (admin, QSMS, supervisor), em transação com rollback |
| `node scripts/criar-perfil.mjs admin <email> "<nome>" <senha>` | cria o primeiro acesso |
| `node scripts/gerar-icones.mjs` | rasteriza `apple-icon.png` e os ícones de PWA a partir do SVG |

---

## Como o sistema pensa

### O semáforo é a linguagem

Verde, âmbar, coral e vermelho pertencem **exclusivamente** ao status de
conformidade. Nunca em botão, link, cabeçalho ou badge. Ações e navegação usam
petróleo (`--color-brand`) e grafite (`--color-ink`).

A sidebar tem tom escuro próprio (`--color-sidebar-bg`, `#132523`),
deliberadamente distinto do preto reservado do status vencido
(`--color-status-vencido-bg`, `#23262B`). São duas cores escuras que significam
coisas diferentes e não podem se confundir.

Pelo mesmo motivo o hover das linhas da lista **não** preenche de petróleo
sólido, ainda que a referência visual que inspirou o layout faça isso: sobre
petróleo saturado, o âmbar de "programar" e o coral de "atenção" perdem
contraste e viram manchas parecidas — o semáforo morreria justamente na linha
que está sendo olhada. O hover usa petróleo lavado mais uma barra de acento, o
que dá a mesma resposta sem custar a leitura.

O gráfico do dashboard é SVG inline, sem biblioteca. Uma série única de doze
barras não justifica centenas de kB de `recharts` no bundle.

Não é preciosismo estético: o painel existe para que alguém bata o olho e saiba
quem não pode trabalhar amanhã. Se o botão "Salvar" for verde, o verde deixa de
significar "colaborador regular". A regra está no topo de `app/globals.css`.

| Status | Faixa | Leitura |
|---|---|---|
| `ok` | > 90 dias | tranquilo |
| `programar` | 90 a 31 dias | hora de programar |
| `atencao` | 30 a 15 dias | atrasado na programação |
| `critico` | < 15 dias | risco real de parar equipe |
| `vencido` | vencido | não pode trabalhar amanhã |
| `sem_registro` | sem data | mesma gravidade de vencido |

`sem_registro` e `vencido` têm o mesmo peso visual de propósito. Ausência de
informação é um estado, não um vazio.

### O `cross join` da view

`vw_status_colaborador` cruza **todos** os colaboradores com **todos** os tipos
de requisito. É esse cross join que faz aparecer quem nunca teve registro. Sem
ele o sistema só enxergaria o que já existe — e o problema dos colaboradores sem
data de referência, que é o maior ponto cego da operação, continuaria invisível.

### A máquina de estados mora no banco

As transições não estão em server actions: são funções `SECURITY DEFINER` em
`supabase/migrations/0002_maquina_estados.sql` (estendidas em `0011`/`0012`,
a camada de workflow da Fase 1), e triggers garantem que

1. toda transição grave linha em `historico_item`;
2. o SLA seja recalculado ao entrar em qualquer etapa;
3. transições ilegais sejam rejeitadas.

Em trigger e não em código de aplicação porque a garantia precisa valer também
para um `UPDATE` feito à mão pelo painel do Supabase. Regra que depende da
disciplina de quem escreve o código não é regra, é convenção.

| Etapa | Dono | SLA |
|---|---|---|
| `previsto` (o "pendente" do plano) | Supervisor | 7 dias |
| `data_solicitada` | Supervisor | 7 dias |
| `data_proposta` | QSMS | 3 dias |
| `agendado` | Supervisor | até a data agendada |
| `enviado_clinica` | QSMS | até o dia seguinte ao exame |
| `aguardando_documento` | QSMS | 5 dias |
| `concluido` (o "finalizado") | — | gera o próximo ciclo, +12 meses |
| `inapto_em_tratativa` | QSMS | sem prazo — travado |
| `cancelado` | — | libera a chave de ciclo aberto |

O desfecho do exame é um de cinco, registrado por `fn_registrar_resultado`
(migrations 0018/0020), e **quatro deles não fecham o ciclo**:

| Desfecho | Vai para |
|---|---|
| `fez_apto` | `concluido` no mesmo passo, só com o ASO anexado (arquivo e data do documento) |
| `fez_inapto` | `inapto_em_tratativa` — trava |
| `faltou` | `data_solicitada` |
| `incompleto` | `data_solicitada` |
| `retorno_necessario` | `data_solicitada` |

Desde a migration 0021, nenhum caminho fecha o ciclo como apto sem o ASO:

- `fn_registrar_desfecho` (para onde `fn_registrar_resultado` delega os outros
  quatro) recusa `fez_apto`;
- `fn_registrar_comparecimento` só aceita a falta (`false`); `true`, que levava
  a `aguardando_documento` sem documento, é recusado;
- `fn_concluir_item` (itens antigos em `aguardando_documento`) exige
  `p_documento_url` para apto e apto com restrição;
- `fn_registrar_aso_retroativo` (o "Lançar exame anterior" do perfil) exige
  `p_documento_url`; a assinatura antiga, sem documento, foi removida.

**Comparecimento não é conformidade.** O que zera a pendência é o documento com
resultado `apto`, e o relógio de 12 meses parte da **data de realização do
exame**, lida dentro do PDF — não da data de emissão do documento.

Resultado `inapto` não encerra o item: ele entra em `inapto_em_tratativa` e não
sai por fluxo normal. Não atualiza a validade, não abre ciclo novo, e continua
ocupando a chave de ciclo aberto — o colaborador permanece bloqueado. A única
saída é `fn_encerrar_inapto`, que exige motivo e leva a `cancelado`. O que
significa "resolver" (tornar apto por novo exame, ou dispensar) ainda não foi
definido com o QSMS, e o sistema não decide isso sozinho.

Na Fase 1 o supervisor não tem login: o QSMS conduz o fluxo inteiro por
`fn_registrar_data_supervisor`, que exige dizer em nome de quem a data está
sendo lançada. `historico_item` guarda as duas coisas separadas — `autor` é o
usuário real, `em_nome_de` é quem decidiu. Sem essa separação a auditoria
registraria o QSMS como se ele tivesse escolhido a data sozinho.

`fn_propor_data` (o caminho do supervisor logado, Fase 2) continua existindo e
aceita chamada do QSMS. Quem não é da equipe continua barrado por
`fn_exigir_acesso_ao_item`.

### Fuso horário

O Postgres do Supabase roda em UTC. Às 21h em Governador Valadares já é o dia
seguinte em UTC, e "dias restantes" sairia com um dia a mais durante três horas
por noite. Toda data de negócio passa por `public.hoje()`, que devolve a data em
`America/Sao_Paulo`. No TypeScript o equivalente é `hojeIso()` em
`lib/dominio.ts`.

---

## Segurança

- Login por e-mail e senha, mínimo de 8 caracteres, validado no front e no back.
  Falha de login devolve mensagem genérica ("E-mail ou senha inválidos") e o
  "esqueci minha senha" devolve a mesma resposta exista ou não o e-mail — as
  duas coisas evitam enumeração de contas.
- Supervisor enxerga apenas colaboradores com o `supervisor_id` dele. Garantido
  por RLS, e as views usam `security_invoker = true` para herdar essa restrição.
- Só o perfil QSMS cria `eventos_requisito` com resultado. `admin` tem o mesmo
  alcance de leitura e escrita do QSMS (`fn_e_qsms` cobre os dois) e, além
  disso, a tela de gestão de usuários.
- Supervisor **não tem** política de escrita em `itens_pendencia`: toda ação
  dele passa pelas RPCs, que validam transição e gravam histórico. Política de
  UPDATE coluna a coluna daria a mesma permissão sem nenhuma dessas garantias.
- Bucket `asos` privado; leitura por URL assinada com validade de uma hora.
- Rotas `/api/cron/*` exigem `Authorization: Bearer $CRON_SECRET`.

`scripts/teste-permissoes.mjs` prova as permissões de cada papel conectando como role `authenticated`
(desde a migration 0016 o supervisor opera o fluxo em toda a UEN; perfis e supervisores continuam restritos).
O `teste-fluxo.mjs` roda como `postgres`, que tem `BYPASSRLS` — ele valida as
checagens dentro das RPCs, não as políticas. Os dois são necessários.

---

## Automações

| Rota | Quando | O que faz |
|---|---|---|
| `/api/cron/gerar-itens` | diário, 09:00 UTC (06:00 BRT) | cria itens para vencimentos em até 90 dias e para quem está sem registro |
| `/api/cron/email-semanal` | segunda, 10:00 UTC (07:00 BRT) | um e-mail por supervisor (só a equipe dele) **e** o digest interno do QSMS/admin: irregulares, processos parados e fora do prazo de marcação |

| `/api/cron/sincronizar-neo` | diário, 08:30 UTC (05:30 BRT) | sincroniza o cadastro de colaboradores com a CENTRAL-NEO (ver *Integração com a NEO*) |

Todas são idempotentes. A geração de itens é protegida pelo índice único
parcial `uq_item_aberto`; o e-mail, por `alertas_enviados` com referência no
formato `2026-W34`.

Supervisor sem pendência não recebe e-mail. E-mail que chega toda semana sem
conteúdo vira e-mail que ninguém abre — inclusive na semana em que importa.

Para testar o e-mail sem enviar nada:

```
GET /api/cron/email-semanal?simular=1
GET /api/cron/email-semanal?previa=qsms      # HTML do digest interno
```

---

## Integração com a NEO (fase 1: leitura)

O cadastro de colaboradores tem uma fonte única, a CENTRAL-NEO (projeto `central-neo`). O GIRO guarda uma cópia
ligada por `colaboradores.neo_id` e **só lê** a NEO nesta fase; nada é escrito lá.

- **Porta de leitura:** a Edge Function `giro-colaboradores` da NEO (ação `listar`, só colunas do contrato, protegida por
  segredo próprio). O cliente é `lib/neo.ts`.
- **Variáveis (só servidor — Vercel e `.env.local`):** `NEO_INTEGRACAO_URL` e `NEO_INTEGRACAO_SEGREDO` (o mesmo valor de
  `GIRO_INTEGRACAO_SEGREDO` nas secrets da função). Nunca em código, log ou commit.
- **Regra no banco:** `fn_sincronizar_neo(p_linhas, p_aplicar, p_origem)` (migration 0024) liga cada pessoa pela
  matrícula Engelmig, traz desligamento e matrícula CEMIG e vincula a equipe pelo texto de supervisor da NEO. CPF
  diferente, matrícula já ligada a outro cadastro, matrícula repetida na lista da NEO (`0123` e `123`) ou, sem CPF
  para confirmar, nome diferente viram **divergência** no relatório (nada é ligado nem corrigido em silêncio).
  `p_aplicar = false` só devolve o relatório. Só a **service role** executa a função (as Server Actions conferem o
  operador e passam o usuário em `p_usuario_id`); aplicar com origem `cron` ou `manual` só é aceito depois de uma
  primeira carga concluída (origem `carga`).
- **Cron:** `/api/cron/sincronizar-neo`, todo dia às 08:30 UTC. Se a NEO falhar, nada é aplicado e a falha fica em
  `neo_sincronizacoes`.
- **Botão "Atualizar agora"** em `/colaboradores` (qualquer operador) e **nomes de supervisor sem vínculo** em
  `/qsms/supervisores` (só QSMS e admin).
- **Primeira carga:** `npm run neo:carga` gera o relatório sem gravar. Aplicar exige
  `--aplicar --sim-eu-sei --backup <arquivo fora do repositório>`, autorização expressa e o backup do Supabase
  confirmado. Depois dela, `scripts/importar-ativos.mjs` é só contingência.
- **Ordem de implantação (importa):**
  1. aplicar as migrations 0023 e 0024 no banco (`npm run db:push -- --only 0023`, depois `--only 0024`), com o
     backup do Supabase confirmado: a ficha do colaborador seleciona colunas novas e dá 404 sem a 0023;
  2. publicar a função na NEO **com `--no-verify-jwt`** (ela tem segredo próprio; sem a flag o Supabase exige um
     JWT e responde 401 a toda chamada do GIRO) e definir `GIRO_INTEGRACAO_SEGREDO` nas secrets dela;
  3. colocar `NEO_INTEGRACAO_URL` e `NEO_INTEGRACAO_SEGREDO` só no `.env.local` e rodar `npm run neo:carga`
     (relatório); aprovar o relatório; aplicar a primeira carga com `--aplicar --sim-eu-sei --backup`;
  4. só então `git push` e as variáveis na Vercel (o cron e o botão recusam aplicar antes da primeira carga).
- **Testes:** `teste:neo-cliente`, `teste:neo-sincronizar`, `teste:estado-neo`, `teste:neo-carga-args` (puros) e
  `teste:neo-sync` (banco, numa transação desfeita; `-- --ensaio` aplica as migrations 0023/0024 dentro dela).

---

## Pendências do plano ainda em aberto

O código implementa o comportamento padrão de cada uma e deixa o ponto marcado.

| | Pendência | Como está implementado |
|---|---|---|
| **P1** | Mapa colaborador → supervisor | `supervisor_id` nulo; grupo "Sem supervisor" no painel; tela `/qsms/supervisores` para vincular em massa |
| **P2** | Data-base dos sem registro | entram como `sem_registro`; a tela `/qsms/base` foi substituída (13/11/2026) pela lista de Colaboradores (`/colaboradores`) e pelo formulário "Lançar exame anterior" na aba ASO do perfil |
| **P3** | Como o vencimento é calculado hoje | 12 meses a partir da `data_documento`; eventos da carga inicial marcados `estimado = true` |
| **P4** | Periodicidade é sempre 12 meses? | 12 para todos, em `tipos_requisito` |
| **P5** | Avaliação psicossocial | booleano informativo no item, sem regra automática |
| **P6** | Regra de jejum | `exige_jejum` ligado, com aviso de texto fixo |
| **P7** | Origem das ausências | tela `/qsms/ausencias`, alimentada à mão |
| **P8** | Atualização da base | em aberto: o importador de XLSX foi removido junto com os dados reais. Precisa ser reescrito antes do go-live |
| **P9** | Clínicas por polo | campo livre no agendamento |
| **P10** | Capacidade da clínica | fora do MVP |
| **P11** | Comunicação à CEMIG | campo de data, não bloqueia o fluxo |

`P1` é a que mais pesa: colaborador sem supervisor não entra em e-mail nenhum e
ninguém é cobrado por ele.

---

## Deploy na Vercel

1. Conectar o repositório.
2. Variáveis de ambiente: as mesmas do `.env.example`, com
   `NEXT_PUBLIC_SITE_URL` apontando para o domínio de produção.
3. Gerar um `CRON_SECRET` aleatório e configurá-lo.
4. No Supabase, em Authentication > URL Configuration, incluir
   `https://SEU-DOMINIO/auth/redefinir-senha` nas Redirect URLs — sem isso o
   link de "esqueci minha senha" volta para `localhost`.
5. Os crons de `vercel.json` sobem sozinhos.
