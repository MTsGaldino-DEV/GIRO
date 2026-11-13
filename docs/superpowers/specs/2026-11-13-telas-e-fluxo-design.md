# GIRO — telas e fluxo (especificação 1 de 2)

Data: 13/11/2026. Escrita por Claude com Matheus, a partir do brainstorming de
10, 11 e 13/11/2026. Complementa `MEMORIA_COMPARTILHADA.md`.

Legenda: **[decidido]** foi dito ou aprovado por Matheus. **[palpite]** é
sugestão do Claude, ainda sem aprovação. **[builder]** fica a critério de quem
for planejar.

## 1. Intenção

O GIRO controla os requisitos ocupacionais da UEN 211 (hoje ASO e avaliação
psicológica, AVP). Cada vencimento vira uma tarefa com dono, etapa e prazo, e
o histórico registra cada passo.

Esta especificação redesenha **como as pessoas trabalham dentro do sistema**:
menu, tela de entrada, Dashboard, Radar (fila de ações), lista de colaboradores
e o fluxo do ASO, incluindo quem faz cada etapa. O motivo é que o desenho atual
foi pensado com o QSMS fazendo quase tudo, e na prática o **supervisor é quem
controla a operação** e o QSMS é o apoio.

Escopo de produto: **só ASO e AVP** [decidido, 04/11]. Treinamentos, atestados,
integração com folha e demais módulos de SST ficam para versão futura.

## 2. Objetivos, não-objetivos e anti-objetivos

Objetivos:
- Cada pessoa abre o GIRO e vê o que precisa fazer agora.
- O supervisor consegue cumprir sua parte do fluxo sem depender do QSMS.
- Nenhuma conformidade falsa: só documento com resultado apto fecha o ciclo.

Não-objetivos (esta especificação):
- Integração com a CENTRAL-NEO (especificação 2): criar colaborador, escrever
  no cadastro de lá, vincular supervisor pelo texto da NEO, importadores.
- Calendário de férias, treinamentos, WhatsApp, app do colaborador.
- Clínicas e agendamento com detalhes (endereço, contato) [decidido, 05/11].

Anti-objetivos (seria fracasso mesmo funcionando):
- Usar verde, âmbar, coral ou vermelho fora do semáforo de conformidade.
- Permitir que o supervisor feche um ASO sem documento apto.
- Duplicar regras de transição só em React: a máquina de estados fica no Postgres.
- Perder o histórico de quem fez o quê.

## 3. Restrições

- Next 15.5, React 19, TypeScript, Tailwind 4, Supabase (Auth, SSR, Storage), Zod.
- Identidade visual: `docs/identidade-visual.md` e `app/globals.css`. Petróleo
  `#0E7C74`, grafite `#23262B`, fundo `#F2F1EC`, sidebar `#132523`. Cores do
  semáforo são reservadas ao status do colaborador; ação e navegação usam
  petróleo e grafite. Controles com pelo menos 42 px, foco visível, movimento
  reduzido respeitado.
- Regras no banco (RLS e funções), não só na tela.
- Projeto em produção na Vercel: um push para `main` publica. Migrations novas
  precisam ser aplicadas com cuidado, sem apagar dados reais.
- Dados pessoais (CPF, RG, nomes com matrícula) não entram em commit nem em
  documentos versionados.
- Seeds e testes SQL escrevem no banco real. Não rodar como verificação.
- Mockups aprovados em `.superpowers/brainstorm/` (ignorado pelo Git):
  `dashboard-v3.html`, `radar-v1.html`, `colaboradores-v2.html`.

## 4. Papéis e permissões

- **Admin, QSMS e supervisor leem e gravam em tudo** na UEN [decidido, 10/11],
  inclusive cadastro e documentos. O histórico de auditoria registra quem mudou.
- Gestão de usuários continua **só do admin**, incluindo troca de papel e
  vínculo do supervisor ao criar login [decidido, 11/11]. QSMS e supervisor não
  criam contas.
- Hoje as funções do banco do fluxo do ASO exigem `fn_e_qsms()`, e só
  `fn_propor_data` e `fn_registrar_comparecimento` aceitam o supervisor. As
  funções e as políticas RLS precisam ser abertas ao supervisor **na UEN
  inteira**, não só na equipe dele. [builder: como fazer sem abrir o que deve
  continuar restrito, como gestão de usuários.]
- O campo "responsável" do item **orienta** quem deveria agir; não bloqueia
  ninguém.

## 5. Menu e entrada

- **Sidebar no estilo da NEO** [decidido, 10/11]: grupos que abrem e fecham, item
  ativo destacado, cartão do usuário com Senha e Sair, identidade do GIRO
  (`#132523`, petróleo). Substitui a barra no topo (`components/barra-topo.tsx`)
  e a faixa escura de 03/11 [builder: o que fazer com `.faixa-app` e
  `.cabecalho-pagina`].
- Itens: Dashboard, Radar, Colaboradores; grupo Cadastros e grupo
  Administração (ver seção 10).
- **Entrada por papel** [decidido, 13/11]: sem tela de início nova.
  - QSMS e admin entram no **Dashboard**.
  - Supervisor entra no **Radar**, já filtrado na equipe dele, com a faixa
    "Para você agir" no topo (seção 7). O Dashboard segue no menu, com filtro
    na equipe dele.
  - Reaproveitar `rotaInicial` em `lib/perfil.ts`.

## 6. Dashboard

Visão da UEN inteira para todos; o supervisor pode filtrar pela própria equipe
[decidido, 10/11]. Tudo clicável: ao clicar num número, abre no fim da página a
lista de quem está nele.

1. **Seis cartões de semáforo:** Vencidos, Sem registro, Críticos, Atenção,
   Programar, Em dia.
2. **Cartões de processo:** No radar, Agendados, Parados além do prazo,
   Concluídos no mês, e **Falta lançar no GESET** (novo, seção 8).
3. Quantidade **por etapa**.
4. **Pendências por responsável:** barra Supervisão × QSMS e tabela por responsável.
5. **20 mais próximos de vencer**, em lista rolável.
6. Outras métricas: % em dia, tempo médio por etapa, concluídos por mês.

Contagem por pessoa, no pior status entre ASO e AVP (já feito em
`fn_resumo_status`, migration 0015). Detalhes de ordem e peso visual: seguir o
mockup `dashboard-v3.html`.

## 7. Radar

A fila de ações. Substitui o Painel atual (`app/(app)/qsms/page.tsx`).

**Quem entra** [decidido, 10/11]: vencidos, sem registro e quem vence em até **90
dias**. Vencidos e sem registro ficam no topo como prioridade (têm o mesmo peso
operacional). Sai quando existe ASO apto novo. Sem coluna "Parado há".

**Quem vê:** QSMS e admin veem a UEN inteira; **supervisor só a equipe dele**
[decidido, 10/11]. Ele pode abrir colaboradores de fora pela lista de
Colaboradores.

**Faixa "Para você agir"** (supervisor) [decidido, 13/11]: no topo do Radar, duas
filas com contagem: **informar data** (etapa Data solicitada) e **registrar
resultado** (etapa Enviado à clínica). O restante da lista aparece abaixo. [palpite:
o QSMS também ganha uma faixa equivalente com as etapas dele, a decidir no
plano.]

**Botão por linha.** Um botão principal conforme a etapa; um menu secundário
com o resto.

| Etapa | Botão principal | Quem faz |
|---|---|---|
| Pendente | Pedir data ao supervisor | QSMS [decidido] |
| Data solicitada | Informar data | Supervisor [decidido] |
| Data proposta | Agendar | QSMS [decidido] |
| Agendado | Enviar à clínica | QSMS [palpite] |
| Enviado à clínica | Registrar resultado | Supervisor [decidido] |
| Finalizado | Lançar no GESET | QSMS [decidido] |
| Inapto em tratativa | Registrar tratativa / encerrar | QSMS [palpite] |

Menu secundário [palpite]: cancelar, devolver ao supervisor, informar dados ao
supervisor, registrar falta (em Agendado), abrir perfil, ver histórico.
Vencido e sem registro usam o mesmo botão da etapa; a prioridade vem da posição
e do selo.

As ações já existem como Server Actions em `app/(app)/qsms/acoes.ts` sobre
funções do banco (`fn_solicitar_data`, `fn_propor_data`, `fn_agendar`,
`fn_enviar_clinica`, `fn_registrar_desfecho`, `fn_concluir_item`,
`fn_encerrar_inapto`, `fn_cancelar_item`, `fn_devolver_ao_supervisor`,
`fn_registrar_comparecimento`). O botão chama essas ações; formulários de cada
uma podem abrir em janela sobre a lista [builder].

Saída do inapto: o banco só permite encerrar como cancelado; depois o gerador
cria item novo quando houver necessidade [regra existente, não inventar outra].

## 8. Registrar resultado, conclusão e GESET

**Quem:** o **supervisor** faz o retorno da clínica [decidido, 13/11]. O
colaborador volta ao supervisor, diz se está tudo bem e entrega os documentos.

**Documento no mesmo momento do resultado** [decidido, 13/11]. A etapa
"Aguardando documento" **sai do fluxo normal**. Num único passo o supervisor
escolhe o desfecho:

- **Fez e apto:** exige o ASO (arquivo e data do documento). Ao salvar, o item
  **conclui na hora** e o relógio de 12 meses reinicia. [palpite: desfecho de
  conclusão com resultado "apto com restrição" segue a regra já existente em
  `fn_concluir_item`.]
- **Fez e inapto:** trava o processo; o colaborador segue bloqueado.
- **Faltou, incompleto, retorno necessário:** voltam ao supervisor para propor
  nova data.

Impacto no banco: abrir `fn_registrar_desfecho` e a conclusão ao supervisor;
permitir a transição `enviado_clinica` → `concluido` num passo único (resultado,
documento e conclusão atômicos); hoje só existe via `aguardando_documento`.
`aguardando_documento` continua existindo para o caso de inapto descoberto só
na leitura do documento e para dados antigos [builder]. Atualizar `ETAPA_ACAO`
e `ETAPA_ROTULO` em `lib/dominio.ts`.

**Lançamento no GESET** [decidido, 13/11]: depois de concluído, o QSMS lança o
ASO no GESET. Não trava a conclusão. O GIRO **guarda** se foi lançado:

- Marca por ASO concluído, com quem marcou e quando, e entrada na auditoria
  [palpite do desenho].
- Filtro "Falta lançar no GESET" e contador no Dashboard e no Radar para o
  QSMS.
- Campo novo no banco. **Carga inicial** [decidido, 13/11]: "lançado no GESET"
  quer dizer que a pessoa está regularizada. Entram como **já lançados** os
  colaboradores com **mais de 90 dias de prazo**. Os demais (vencidos, dentro
  de 90 dias) entram como **falta lançar**. Quem está sem registro não tem ASO
  concluído para marcar. A carga não grava quem marcou: registra origem
  "carga inicial" na auditoria. A marca vale para **ASO e AVP** [decidido,
  13/11]. [palpite: o corte de 90 dias vale por requisito (cada um pelo seu
  vencimento), não pelo pior status da pessoa.]

## 9. Colaboradores

Lista única para todos, com filtros [decidido, 10/11].

- O supervisor abre já filtrado na equipe dele e pode tirar o filtro. A aba
  "Minha equipe" deixa de existir.
- Filtros: busca por matrícula ou nome, status, requisito (ASO/AVP), supervisor,
  **Desligados** e **Ausentes** [decidido para Desligados em 11/11; Ausentes é
  palpite].
- **Desligados vira filtro**, com reativação [decidido, 11/11]. Desligar
  preserva histórico: `ativo = false` e data de desligamento.
- Perfil em janela (já existe: `components/perfil/`) com abas Visão geral, ASO,
  Documentos, Cadastro, Histórico. O conteúdo do perfil continua como está; o
  redesenho dele não faz parte desta especificação.
- Edição de cadastro campo a campo continua como hoje (`salvarCampo`), agora
  liberada a supervisor e QSMS. Escrever na NEO é da especificação 2.

## 10. Cadastros e Administração

- **Base** deixa de ser tela separada; o lançamento do último ASO retroativo
  fica no perfil do colaborador [decidido na conversa de 11/11; sem aprovação
  expressa separada]. Reaproveitar `registrarAsoRetroativo`.
- **Supervisores:** nesta especificação a tela continua como está. O vínculo
  automático pelo texto da NEO e a conferência de nomes sem vínculo são da
  especificação 2.
- **Ausências:** nenhuma mudança decidida. O Claude propôs retirar a tela do
  menu, manter registro manual no perfil, bloquear agendamento durante a
  ausência e criar filtro Ausentes; Matheus **não aceitou esse pacote
  expressamente** e colocou o calendário de férias em ideias futuras. Manter a
  tela atual até nova decisão.
- **Administração:** Gestão de usuários (só admin). Desligados sai do menu e
  vira filtro (seção 9).

## 11. Regra de 90 dias

Radar entra em 90 dias e o periódico vale 12 meses [decidido, 10/11]. A view
`vw_status_colaborador` (migration 0003) hoje chama de `programar` o intervalo de 60 a 31
dias, e a geração de itens usa janela de 90. É preciso **alinhar a faixa
`programar` aos 90 dias**, ajustando `STATUS_LEITURA` e textos relacionados.
[builder: como tratar as demais faixas (atenção, crítico) e os números
exibidos, sem mudar a regra do semáforo nas faixas que Matheus não citou.]
Hipótese de apoio: em 2026 o exame real caiu em mediana 17 dias antes do
vencimento (p90 = 38 dias).

## 12. Em aberto

- Responsável de Agendado/Enviar à clínica e da tratativa do inapto: seguir os
  palpites da seção 7 como padrão, revisáveis.
- Faixa de ações para o QSMS e conteúdo exato da faixa do supervisor.
- (Resolvido em 13/11: a marca do GESET vale para ASO e AVP.)
- Matrícula ou outras identidades do colaborador: ver especificação 2.

## 12b. Calls do Claude após a revisão de quem vai construir (13/11)

Escolhas minhas, para Matheus conferir:

1. **Resultado e documento no passo único.** A regra existente em
   `fn_concluir_item` já trata "apto" e "apto com restrição" como conclusão
   (só "inapto" trava). Mantida. O banco valida: arquivo e data do documento
   obrigatórios em apto e apto com restrição; data do documento não pode ser
   futura. O supervisor informa o resultado lido no documento; **o GIRO não lê
   o PDF**. A conferência humana fica no QSMS, ao lançar no GESET: se o
   documento estiver errado, ele corrige pelo perfil (correção de data já
   existe) e a auditoria registra.
2. **Permissões.** "Lê e grava em tudo" vale para toda a UEN e para todas as
   ações do fluxo, incluindo cancelar item, devolver, encerrar inapto,
   desligar, reativar e ASO retroativo, para QSMS e supervisor. Continua só do
   admin: gestão de usuários e papéis. O recorte por equipe do Radar é filtro de
   tela, não permissão. Editar o campo "responsável" não é ação de usuário: ele
   é definido pela etapa.
3. **Faixas do semáforo.** `programar` passa a cobrir de 90 a 31 dias e `ok`
   passa a ser mais de 90. Atenção (30 a 15), crítico (menos de 15), vencido e
   sem registro não mudam. É migration da view em produção, e os números do
   Dashboard mudam para todos (quem vence entre 61 e 90 dias sai de "Em dia" e
   vai para "Programar"). Textos de `STATUS_LEITURA` acompanham.
4. **Itens em `aguardando_documento`.** Continuam com o botão "Anexar ASO e
   concluir" (fluxo atual), agora liberado ao supervisor e ao QSMS. Ninguém
   fica órfão no deploy. O construtor deve contar quantos itens reais estão
   nessa etapa antes de publicar; não foi consultado.
5. **URLs.** Manter as rotas antigas (`/qsms/*`, `/supervisor/*`) com
   redirecionamento para as novas, para não quebrar favoritos nem links de
   e-mail. Reorganização em etapas, com cada etapa publicável.
6. **Filtro Ausentes.** Só entra quando houver dado de ausência confiável;
   fora da primeira entrega.

## 13. Deixado ao builder

Estrutura de rotas (hoje há `/qsms/*` e `/supervisor/*` separados), componentes,
ordem das migrations, estratégia de teste e como migrar o que já está em
produção sem apagar dados. Verificação: `npm.cmd run typecheck`, `npm.cmd run
build` e testes no navegador; Playwright cobre só o login.
