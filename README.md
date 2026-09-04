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
npm run db:push                # aplica supabase/migrations/*.sql em ordem
node scripts/criar-perfil.mjs admin voce@engelmig.com.br "Seu Nome" SuaSenha123
npm run seed:teste             # base fictícia de 15 colaboradores + 3 contas
npm run dev
```

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
| `npm run db:push` | aplica todas as migrations (idempotente) |
| `npm run db:push -- --only 0003` | aplica uma migration só |
| `npm run seed:teste` | popula a base fictícia e as 3 contas de teste |
| `node scripts/verificar.mjs` | conferência rápida da base |
| `node scripts/teste-fluxo.mjs` | ciclo de vida completo contra o banco real |
| `node scripts/teste-rls.mjs` | isolamento entre equipes |
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
| `ok` | > 60 dias | tranquilo |
| `programar` | 60 a 31 dias | hora de programar |
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

O desfecho do exame é um de cinco (`fn_registrar_desfecho`), e **quatro deles
não fecham o ciclo**:

| Desfecho | Vai para |
|---|---|
| `fez_apto` | `aguardando_documento` |
| `fez_inapto` | `inapto_em_tratativa` — trava |
| `faltou` | `data_solicitada` |
| `incompleto` | `data_solicitada` |
| `retorno_necessario` | `data_solicitada` |

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

`scripts/teste-rls.mjs` prova o isolamento conectando como role `authenticated`.
O `teste-fluxo.mjs` roda como `postgres`, que tem `BYPASSRLS` — ele valida as
checagens dentro das RPCs, não as políticas. Os dois são necessários.

---

## Automações

| Rota | Quando | O que faz |
|---|---|---|
| `/api/cron/gerar-itens` | diário, 09:00 UTC (06:00 BRT) | cria itens para vencimentos em até 90 dias e para quem está sem registro |
| `/api/cron/email-semanal` | segunda, 10:00 UTC (07:00 BRT) | um e-mail por supervisor (só a equipe dele) **e** o digest interno do QSMS/admin: irregulares, processos parados e fora do prazo de marcação |

Ambas são idempotentes. A geração de itens é protegida pelo índice único
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

## Pendências do plano ainda em aberto

O código implementa o comportamento padrão de cada uma e deixa o ponto marcado.

| | Pendência | Como está implementado |
|---|---|---|
| **P1** | Mapa colaborador → supervisor | `supervisor_id` nulo; grupo "Sem supervisor" no painel; tela `/qsms/supervisores` para vincular em massa |
| **P2** | Data-base dos sem registro | entram como `sem_registro`; tela `/qsms/base` para informar |
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
