# GIRO · Especificação 2 — Integração com o cadastro da CENTRAL-NEO

Data: 16/11/2026 · Autor: Claude, com Matheus · Estado: **rascunho para aprovação**

Esta é a segunda de duas especificações. A primeira (telas e fluxo, em
`2026-11-13-telas-e-fluxo-design.md`) já está no ar. Aqui entra o cadastro de
colaboradores da CENTRAL-NEO ("a NEO").

Convenção: **[decidido]** = decisão expressa do Matheus (com data).
**[minha escolha]** = escolha minha, feita porque ele pediu que eu seguisse do
meu jeito (16/11); ele pode trocar. Nada aqui foi implementado.

## 1. Intenção e porquê

Hoje o GIRO tem o seu próprio cadastro de colaboradores, alimentado por planilha
(`importar-ativos.mjs`). Isso causa três problemas reais:

- Nenhum dos 252 colaboradores tem supervisor vinculado, então "Minha equipe"
  aparece vazio para os supervisores reais e o Radar não separa as equipes.
- Cadastro novo e correção exigem planilha ou o administrador. Ninguém da
  operação cria um colaborador pela tela.
- O GIRO não sabe a data de desligamento nem a matrícula CEMIG, que a NEO já tem.

O cadastro de pessoas é da NEO (é o banco principal da empresa). O GIRO deve
**usar e alimentar esse cadastro**, em vez de manter uma cópia que envelhece.

## 2. Objetivos, não-objetivos e anti-objetivos

Objetivos:
- O supervisor entra no GIRO e já vê a própria equipe, sem ninguém vincular à mão.
- QSMS e supervisores criam colaborador e corrigem cadastro pela tela
  Colaboradores, e a mudança aparece na NEO. [decidido, 11/11]
- O GIRO mostra data de desligamento e matrícula CEMIG vindas da NEO.
- Todo cadastro alterado pelo GIRO tem registro de quem mudou, o quê e quando,
  inclusive do lado da NEO.

Não-objetivos:
- TraceOne: fora; o GIRO não escreve lá. [decidido, 11/11]
- Criar ou gerenciar login (usuário) da NEO; a ligação `usuario_id` não é tocada.
- Trazer para o GIRO as 59 pessoas da NEO que estão fora da lista da UEN 211.
- Excluir colaborador na NEO. Desligar = marcar inativo com data.
- Calendário de férias, treinamentos, WhatsApp e demais módulos.
- Sincronização em tempo real (webhooks, realtime). Basta diária + botão.

Anti-objetivos (seria fracasso mesmo funcionando):
- Dar ao GIRO poder total sobre o banco da NEO (chave de serviço do banco
  inteiro na Vercel do GIRO).
- Escrever na NEO algo que depois não dá para saber quem fez.
- GIRO e NEO divergirem em silêncio (cada um com um nome/CPF/supervisor).
- Quebrar as telas da NEO que leem o cadastro (Colaboradores, Acessos).
- Perder ASO, AVP, documentos ou histórico do GIRO ao religar o cadastro.

## 3. O que existe hoje (levantamento de 16/11, só leitura)

GIRO: `colaboradores` tem `matricula` (inteira, única), nome, cpf (sem unicidade),
cargo, uen, local, polo, data_admissao, data_nascimento, situacao,
`supervisor_id`, ativo, foto_url, exige_avp. **Não** tem matrícula CEMIG nem data
de desligamento. Operador só edita 14 colunas (0021) e não insere nem apaga. O
importador casa por matrícula Engelmig e fixa `uen = '211'` na inserção.

NEO: `public.colaboradores` tem nome, cpf (único, só dígitos), `matricula_cemig`
e `matricula_engelmig` (texto, únicas), email, telefone, cargo, equipe,
`supervisor` (**texto livre**, sem tabela de supervisores), gc, go, base,
data_admissao, data_desligamento, ativo, observacao, `usuario_id`. 310 cadastros
(carga de 06/11 com 251 da ATIVOS 211; 59 fora da lista). **Não há coluna de UEN.**
RLS: só admin da NEO escreve; cada usuário lê o próprio. **Não há histórico nem
auditoria** de colaboradores na NEO. Nada na NEO aponta por chave estrangeira
para `colaboradores`; fora a tela dele e `Acessos`, o faturamento, a
disponibilidade e a fila não leem esses campos.

Cuidado: o repositório da NEO tem **dois** "colaboradores" (o da NEO e o do
TraceOne, via `supabaseTraceone` em `src/lib/api.ts`). Esta integração é só com
o da NEO.

Regras do projeto NEO que valem aqui: a pasta `supabase/` fica fora do Git;
migration nova passa por `node scripts/migrar.cjs --testar`; nunca editar
migration já aplicada; teste que grava no banco só dentro de transação desfeita;
a autorização do Matheus vale só para a tarefa pedida.

## 4. Abordagens consideradas

**A. O GIRO guarda a chave de serviço da NEO e lê/escreve direto.**
Simples e rápido de construir. Rejeitada: uma chave vazada ou um bug no GIRO
dá controle sobre o banco inteiro da NEO (faturamento, acessos, tudo), e a NEO
não tem histórico para reconstruir o estrago.

**B. [minha escolha] Uma porta estreita no lado da NEO.** Uma Edge Function nova
da NEO (`giro-colaboradores`, no mesmo padrão da `admin-usuarios` que já existe)
com ações fechadas (`listar`, `criar`, `atualizar`, `desligar`), autenticada por
um segredo próprio. A chave de serviço fica só dentro da NEO. O GIRO guarda
apenas a URL e o segredo; se vazar, o dano é limitado às ações da função, que
validam campo a campo e gravam histórico. Custo: exige mudança no projeto NEO
(uma migration de histórico e a função), com a autorização e o rito dele.

**C. Só leitura, diária, sem escrita.** Seria a mais segura, mas o Matheus
decidiu em 11/11 que o GIRO também escreve na NEO. Fica como **primeira fase** da
B, não como substituta.

**Cópia ou leitura ao vivo?** [minha escolha] **Cópia** no GIRO (a tabela
`colaboradores` atual continua), ligada à NEO por um `neo_id`. O GIRO precisa de
junções, RLS, filtros e velocidade sobre os colaboradores, e não pode parar se a
NEO estiver fora. A cópia é atualizada pela sincronização.

## 5. Desenho (parte decidida e parte minha)

### 5.1 Quem manda em cada campo [minha escolha]

| Campo | Dono | Observação |
|---|---|---|
| nome, cpf, matrículas, cargo, base, admissão, desligamento, ativo, supervisor (texto) | **NEO** | Editar no GIRO grava **primeiro na NEO**; só depois a cópia muda. |
| foto, exige_avp, situação (férias, atestado…), polo, local, data_nascimento | **GIRO** | A NEO não tem esses campos (ou não são dela). Não vão para a NEO. |
| supervisor_id | **GIRO, derivado** | Calculado do texto de supervisor da NEO (5.3). |
| uen | **GIRO** | A NEO não tem UEN. Todo cadastro criado no GIRO nasce `211`. |

Regra de ouro: **write-through**. Se a escrita na NEO falhar, nada muda no GIRO
e o operador vê o erro em português. A cópia nunca fica à frente da NEO.

### 5.2 Ligação entre as duas bases [minha escolha]

- Nova coluna `neo_id uuid unique` em `colaboradores` do GIRO, mais
  `matricula_cemig text`, `data_desligamento date` e `neo_sincronizado_em`.
- Primeira ligação por **matrícula Engelmig** (inteira no GIRO, texto na NEO).
  Casamento só automático se a matrícula, e o CPF quando existir nos dois,
  concordam. Divergência vira linha de relatório, não correção silenciosa.
- Depois de ligado, a chave é o `neo_id`; trocar matrícula não desliga o vínculo.
- Quem existe na NEO e não no GIRO **não** entra sozinho. [minha escolha]

### 5.3 Supervisor [decidido em 11/11, detalhe meu]

O texto de supervisor da NEO vincula a equipe à conta do supervisor
automaticamente. Detalhe: o texto é normalizado (sem acento, caixa e espaços) e
comparado com `supervisores.nome`. O que não casar aparece na tela Supervisores
como "nomes da NEO sem vínculo", e QSMS/admin resolve uma vez; a resolução fica
guardada numa tabela de apelidos (`supervisor_apelidos`: texto normalizado →
supervisor) e vale nas próximas sincronizações. No cadastro, o supervisor é
escolhido numa **lista** (nunca digitado); o GIRO grava na NEO a grafia oficial
do supervisor. [decidido, 11/11]

### 5.4 Sincronização (NEO → GIRO) [minha escolha]

- Diária (cron da Vercel já usado no projeto, protegido por `CRON_SECRET`) e
  botão "Atualizar agora" para QSMS/admin/supervisor. Mostra "última sincronização".
- Só atualiza quem já está ligado. Compara por campo; muda só o que diferiu e
  registra em `auditoria_colaborador` com origem "Sincronização NEO".
- NEO fora do ar: a sincronização falha com aviso, a cópia segue como está.
- A **primeira carga** é sempre em duas etapas: relatório sem gravar (quantos
  ligam, divergências de CPF/nome, supervisores sem casar) e só depois a
  aplicação, em transação, com backup e contagem antes/depois.

### 5.5 Escrita (GIRO → NEO) [decidido em 11/11; detalhe meu]

- Criar, corrigir, desligar e reativar passam pela função da NEO.
  Qualquer operador (supervisor, QSMS, admin) pode, como na especificação 1.
- A função valida: nome obrigatório, CPF com dígito verificador, matrícula e CPF
  únicos, formato das matrículas. Recebe só os campos que mudaram e o
  `atualizado_em` que o operador viu: se alguém mudou antes (inclusive pela tela
  da NEO), recusa com "o cadastro mudou, recarregue" em vez de sobrescrever.
- **Histórico na NEO**: tabela nova `neo_colaboradores_historico` (quem, de qual
  sistema, campo, valor anterior e novo, quando). Quem fez é o usuário do GIRO
  (e-mail e papel), enviado pela Server Action e gravado pela função.
- A NEO nunca recebe exclusão do GIRO. Desligar grava `ativo = false` e
  `data_desligamento`; reativar limpa a data.
- Criar colaborador no GIRO cria a linha na NEO (sem `usuario_id`) e depois a
  cópia, já ligada.

### 5.6 O que muda nas telas [minha escolha]

- Colaboradores: botão "Novo colaborador" (modal, mesmos campos de cadastro);
  coluna/filtro de desligamento passa a ter data real; selo "fora de sincronia"
  se `neo_sincronizado_em` estiver velho.
- Perfil, aba Cadastro: campos da NEO mostram o selo "Cadastro da NEO"; editar
  pede salvar na NEO, com erro claro se ela estiver fora do ar.
- Supervisores: nova seção de nomes da NEO sem vínculo; "vincular em massa"
  continua como contingência.
- Admin/ajustes: página simples com o estado da integração (última sincronização,
  contagens, erros). Sem segredo na tela.

### 5.7 Importador de planilha [minha escolha]

`importar-ativos.mjs` fica como contingência e **não** será ampliado para ler
supervisor e matrícula CEMIG (a pendência antiga cai, a integração cobre). Depois
de ligar o cadastro, ele não deve mais rodar sem `--simular` revisado, para não
desligar quem a NEO mantém ativo.

## 6. Segurança e operação

- Segredo da integração (`NEO_INTEGRACAO_URL`, `NEO_INTEGRACAO_SEGREDO`) só em
  variável de ambiente de servidor do GIRO; nunca em código, log, memória ou
  mensagem de commit. Rotacionável sem mexer no banco.
- A função da NEO só aceita o segredo certo e só as ações listadas; usa a chave
  de serviço dentro do ambiente dela. Limite de tamanho e de linhas por chamada.
- Dados pessoais (CPF, nome) não entram em logs, na memória compartilhada nem em
  mensagens de commit.
- Toda mudança no projeto NEO segue o rito dele: migration em `supabase/`
  (fora do Git), `--testar`, aplicação com autorização do Matheus para aquela
  tarefa, backup e rollback.
- Toda migration nova no banco do GIRO usa `--only` com prefixo exato.

## 7. Fases [minha escolha]

1. **Leitura.** Função `giro-colaboradores` só com `listar`; no GIRO: colunas
   novas, cliente da integração, relatório de ligação sem gravar, aplicação da
   primeira carga, sincronização diária + botão, vínculo de supervisor pelo texto.
   Dano possível à NEO: nenhum (só leitura; a função nova é código).
2. **Escrita.** Migration de histórico na NEO, ações `criar`, `atualizar`,
   `desligar` na função, e as telas de criar e editar com write-through.
3. **Acabamento.** Página de estado da integração, selos de sincronia, README e
   contexto atualizados, aposentar a pendência do importador.

Cada fase termina com revisão e só segue com a autorização do Matheus para o que
tocar a NEO. A fase 1 já resolve o problema mais urgente (equipes vinculadas).

## 8. Critérios de sucesso

- Depois da primeira carga, a maioria dos 252 colaboradores tem supervisor
  vinculado, e o supervisor abre "Minha equipe" com gente.
- Criar um colaborador no GIRO faz ele aparecer na tela Colaboradores da NEO
  com a trilha de quem criou.
- Alterar CPF ou matrícula numa ponta aparece na outra após uma sincronização,
  nunca em silêncio nem para pior.
- ASO, AVP, documentos e histórico existentes continuam intactos.
- Com a NEO fora do ar, o GIRO continua abrindo, mostrando aviso e bloqueando só
  as edições que dependem dela.

## 9. Restrições técnicas

Next 15, React 19, TypeScript, Supabase no GIRO; a NEO é Vite/React + Supabase
(Edge Functions em Deno). Testes de banco em transação desfeita, sem resíduo
(matrícula ≥ 999000); testes puros com `node --experimental-strip-types`.

## 10. Em aberto para o construtor

- Mapeamento de `base` (NEO) com `local` e `polo` (GIRO): conferir na primeira
  carga, em relatório, antes de gravar. Padrão provisório: `base` → `local`,
  `polo` fica como está.
- Se a matrícula Engelmig for sempre numérica na NEO; as não numéricas entram
  no relatório e ficam sem ligar.
- Quantos supervisores da NEO têm grafia que não casa, e se o texto cobre as
  equipes reais (só se vê na primeira carga).
- Versão publicada da função `admin-usuarios` e das políticas vivas da NEO: o
  levantamento foi pelas migrations locais, não pelo banco vivo.
