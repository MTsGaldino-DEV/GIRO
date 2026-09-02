# GIRO — Plano de atualização: foco QSMS

> **Status: executado em 02/09/2026.** As cinco entregas estão no ar e
> verificadas no navegador. As três decisões da seção 9 foram resolvidas assim:
> atualização por intervalo de 60s (sem websocket); assinatura mantida em
> "requisitos **ocupacionais**", já que ASO é Atestado de Saúde Ocupacional e
> "operacionais" contradiria o logo e o nome do próprio documento; e `/qsms`
> mantido como destino do login.
>
> Data: 02/09/2026
> Escopo: três entregas — página individual do colaborador, novo dashboard gerencial e redesenho do bloco de marca no login.
> Decisão de escopo que rege este documento: **o MVP foca no QSMS.** A supervisão fica para depois. Nada aqui altera `/supervisor/*`.

---

## 1. Contexto e decisão de foco

O sistema hoje responde bem a "quem está vencendo e com quem está a bola", mas só na granularidade da lista. Faltam duas visões:

- **A da pessoa** — abrir um colaborador e ver tudo que aconteceu com ele: exames, ausências, ciclos, quem agiu e quando.
- **A do gestor** — abrir uma tela e entender a operação inteira sem filtrar nada: onde está o gargalo, qual supervisor está travando, se a curva melhora ou piora.

Ambas usam dados que o banco já tem. Nenhuma exige mudança de schema.

**Consequência aceita:** o supervisor continua sem histórico do próprio pessoal — ele segue com o painel dele e a tela do item, alcançados pelo link do e-mail semanal. É dívida consciente, registrada aqui para não virar esquecimento.

---

## 2. Entrega A — Página individual do colaborador

### Rota

```
/qsms/colaborador/[id]              → redireciona para /visao-geral
/qsms/colaborador/[id]/visao-geral
/qsms/colaborador/[id]/aso
/qsms/colaborador/[id]/treinamentos
/qsms/colaborador/[id]/ausencias
/qsms/colaborador/[id]/cadastro
/qsms/colaborador/[id]/historico
```

Protegida por `exigirQsms()` — QSMS e Admin. Abas como segmento de URL, não estado de cliente, por três razões: link direto para uma aba específica, cada aba consulta só o que precisa, e um `layout.tsx` compartilhado renderiza o cabeçalho uma única vez para todas.

### Cabeçalho fixo (no `layout.tsx`, comum às seis abas)

Avatar circular com a inicial do nome sobre petróleo — **não** usamos foto: não temos foto de ninguém, e um placeholder genérico de pessoa é pior que uma inicial. Ao lado, nome, matrícula, cargo, polo, supervisor e o selo de conformidade.

Abaixo, quatro cartões no espírito da referência (ícone em círculo petróleo, número grande):

| Cartão | Fonte |
|---|---|
| Status atual | `vw_status_colaborador.status` |
| Próximo vencimento | `vw_status_colaborador.data_vencimento` |
| Dias parados na etapa | `vw_itens_abertos.dias_parados` |
| ASOs registrados | `count(eventos_requisito)` |

**Regra de cor mantida:** os cartões usam petróleo e grafite. Verde, âmbar, coral e vermelho continuam exclusivos do selo de conformidade. Um cartão verde ao lado de um selo verde destrói a leitura que o painel inteiro depende.

### As seis abas

| Aba | Conteúdo | Ações |
|---|---|---|
| **Visão geral** | Ciclo aberto e de quem é a bola, ausência vigente, janela útil, avisos de bloqueio | atalhos para as outras abas |
| **ASO** | Ciclo atual com os formulários de ação + histórico de todos os exames (data, resultado, clínica, médico, documento) | agendar, concluir, devolver, comparecimento |
| **Treinamentos** | Vazia por ora: lista os requisitos ativos além do ASO, que hoje são zero | — |
| **Ausências** | Férias, atestados e afastamentos do colaborador | lançar, remover |
| **Cadastro** | Dados pessoais, admissão, situação, vínculo | editar cargo, polo, situação e supervisor |
| **Histórico** | Timeline consolidada de todos os ciclos, não só do atual | — |

### Aba Treinamentos

Fica pronta e vazia, por decisão explícita. Ela consulta `tipos_requisito` filtrando o ASO Periódico; como o catálogo tem só uma linha, a aba mostra o estado vazio explicando que nenhum outro requisito foi cadastrado e que adicionar NR-10, NR-33, NR-35 ou brigada é um `INSERT`, não uma migração.

Isso não é enfeite: o schema nasceu genérico justamente para isso, e a aba existir vazia é o que torna a lacuna visível em vez de esquecida. As periodicidades de cada NR continuam sendo a pendência P4 do plano original — inventá-las seria pior que deixar a aba vazia.

### Reaproveitamento dos formulários

A aba ASO renderiza os componentes que já existem — `FormularioAgendar`, `FormularioConcluir`, `FormularioDevolver` — em vez de novos. As regras de negócio continuam onde estão: nas funções `SECURITY DEFINER` do Postgres, com trigger de histórico e validação de transição. Duas telas, uma porta só.

`/qsms/item/[id]` e `/supervisor/item/[id]` **continuam existindo**. O e-mail semanal linka para elas e esses links precisam seguir funcionando. Elas passam a ser a visão focada de um ciclo; a página do colaborador é a visão completa da pessoa.

### Entrada pela lista

Hoje, no painel e em `/qsms/base`, o nome do colaborador linka para o item. Passa a linkar para a página do colaborador; o botão "Abrir" continua indo para o item. O nome leva à pessoa, o botão leva ao ciclo.

### Mudança no banco

Uma função nova. A `fn_historico_do_item` devolve a timeline de um item; a aba Histórico precisa de todos os ciclos da pessoa:

```sql
fn_historico_do_colaborador(p_colaborador_id uuid)
  returns table (item_id uuid, etapa_de text, etapa_para text,
                 autor_nome text, observacao text, criado_em timestamptz)
```

`SECURITY DEFINER`, mesmo padrão de checagem da função existente: resolve o nome do autor sem abrir a tabela `perfis` para leitura direta.

---

## 3. Entrega B — Dashboard gerencial

### Rota e navegação

`/qsms/dashboard`, novo primeiro item da sidebar, acima de "Painel".

`/qsms` continua sendo a lista operacional e continua sendo o destino do login. A separação é deliberada: o dashboard responde "como está a operação", o painel responde "o que eu faço agora". Quem opera quer a lista; quem gerencia quer o agregado.

### Blocos

**1. Cartões de situação** — reaproveitam `fn_resumo_status()`, que já devolve tudo numa chamada: total, sem registro, vencido, crítico, atenção, programar, regular e SLA estourado.

**2. Onde está a bola** — distribuição dos itens abertos por etapa, com quem é o dono e quantos estouraram o SLA em cada uma. Responde "o gargalo é a supervisão que não libera ou o QSMS que não agenda".

**3. Ranking por supervisor** — por equipe: tamanho, vencidos, sem registro, itens parados e o mais antigo parado. É a tela que transforma "os supervisores não programam" de reclamação em número com nome.

**4. Curva de conclusão** — ASOs concluídos por mês nos últimos 12 meses, a partir de `eventos_requisito.data_documento`. É o gráfico que a referência tem, e é o indicador que justifica o projeto.

**5. Vencimentos à frente** — quantos vencem em 30, 60 e 90 dias, para dimensionar a demanda da clínica.

### Gráficos sem dependência nova

A curva de conclusão será **SVG inline**, não uma biblioteca. Um gráfico de barras simples são poucas dezenas de linhas; `recharts` ou `chart.js` custam centenas de kB no bundle de uma tela só. Se um dia houver cinco gráficos com interação, a conta muda — por ora não há.

### O que "tempo real" significa aqui

Interpretação proposta: **dado sempre fresco, não streaming.** A página é server component com `dynamic = "force-dynamic"`, então toda visita consulta o banco; sem cache servindo número velho. Somada a isso, uma atualização automática discreta a cada 60 segundos via `router.refresh()`, com a hora da última atualização visível no topo.

Streaming de verdade — Supabase Realtime com websocket — é possível, mas paga assinatura aberta por aba e complexidade de reconexão para ganhar segundos numa tela cujos números mudam poucas vezes por dia. **Ponto a confirmar** antes da implementação; o padrão adotado é a atualização por intervalo.

### Mudança no banco

Duas funções agregadoras, para não puxar todas as linhas e somar no Node:

```sql
fn_resumo_por_etapa()       -- etapa, dono, quantidade, estourados
fn_resumo_por_supervisor()  -- supervisor, equipe, vencidos, sem_registro,
                            -- parados, dias_do_mais_antigo
fn_conclusoes_por_mes(meses integer default 12)
```

`security invoker`, como a `fn_resumo_status()` já é — assim herdam RLS em vez de furá-la.

---

## 4. Entrega C — Bloco de marca no login

### Como está

`/login`, `/login/recuperar` e `/login/redefinir` usam `logo-giro.svg`, que é horizontal: símbolo à esquerda, "GIRO" e a assinatura à direita, alinhados à esquerda do cartão.

### Como fica

Composição vertical centralizada acima do cartão:

```
        ◍           ← símbolo, ~72px
       GIRO         ← petróleo, peso 500, espaçamento entre letras
Gestão integrada de requisitos ocupacionais
                    ← menor, mais claro (ink-faint)
```

### Como será feito

Composto em HTML na página, usando `simbolo-giro.svg` mais texto — **não** um SVG novo. Três razões: o texto herda a fonte da aplicação em vez de virar traçado, cresce e diminui com os tokens de tipografia, e é lido por leitor de tela como texto. Um `logo-giro-vertical.svg` seria um quarto arquivo de marca para manter em sincronia com os outros três.

Vira o componente `<MarcaVertical />` em `components/`, usado nas três telas de autenticação, para o ajuste acontecer num lugar só.

> Nota: a assinatura oficial da marca é "Gestão integrada de requisitos ocupacionais" — como está no `logo-giro.svg` e no `README`. O pedido dizia "operacionais"; mantive "ocupacionais" por consistência com o restante do sistema. **Confirmar se a troca é intencional.**

---

## 5. Entrega D — Lista de colaboradores: densidade e movimento

### Como está

A tabela do painel usa linhas separadas por borda de 1px, sem espaçamento entre elas, `hover` trocando o fundo para névoa. Funciona, mas lê como planilha: nada distingue uma linha da seguinte além de um fio, e a única resposta ao mouse é uma troca de cor abrupta.

Além disso, a consulta traz até 500 linhas de uma vez, sem paginação. Com 261 colaboradores reais isso ainda carrega, mas rola por três telas e devolve ao navegador dados que ninguém vai ler.

### Linhas viram cartões, sem deixar de ser tabela

Visualmente cada linha passa a ser um cartão: cantos arredondados, respiro de 8px entre linhas, sem fios divisórios. Tecnicamente continua sendo `<table>`, com `border-collapse: separate` e `border-spacing`.

Isso não é preciosismo: são oito colunas de dados tabulares, e um leitor de tela precisa ouvir "Status, coluna 4" ao navegar. Trocar a tabela por uma pilha de `<div>` entregaria o mesmo visual e destruiria essa leitura. O visual de cartão é CSS; a semântica de tabela fica.

### O hover, e por que ele não preenche

Na referência, a linha sob o mouse é preenchida de azul sólido com texto branco. **Não vamos fazer isso**, e a razão é a mesma regra que rege o sistema desde o início: o selo de conformidade é o único canal que a tela tem para dizer quem não pode trabalhar amanhã. Sobre um fundo petróleo sólido, o âmbar de "programar" e o coral de "atenção" perdem contraste e viram manchas parecidas — o semáforo morre justamente na linha que o usuário está olhando.

O que fazemos no lugar, e que dá a mesma sensação de resposta:

| Camada | Efeito |
|---|---|
| Fundo | névoa → `--color-brand-wash` (#E3F1EF) |
| Barra de acento | 3px em petróleo surgindo na borda esquerda |
| Elevação | sombra suave e deslocamento de 1px para cima |
| Duração | 140ms, mesma curva dos botões |

O selo continua legível porque o fundo é um petróleo lavado, não saturado. A linha responde, o semáforo sobrevive.

`@media (prefers-reduced-motion: reduce)` já zera transições no `globals.css` — o efeito degrada para troca de cor instantânea sem nenhum código extra.

### Avatar por linha

Cada linha ganha o avatar circular com a inicial do nome sobre petróleo, o mesmo componente do rodapé da sidebar. Dá o ritmo visual da referência e ancora a leitura vertical, sem inventar foto que não temos.

### Paginação

25 linhas por página, com "Mostrando 1–25 de 261" e navegação numérica, como na referência. A paginação vai na query (`range()`), não no cliente: paginar no navegador depois de baixar tudo não resolve o problema que a paginação existe para resolver.

Os filtros atuais continuam na URL, e a página entra junto — assim um link filtrado e paginado pode ser colado no chat e abre igual.

### Ordenação por coluna

Cabeçalhos de Vencimento, Status e Dias parados viram botões de ordenação, com indicador de direção. A ordem padrão continua a atual — pior status primeiro, e dentro do mesmo status quem está parado há mais tempo — porque é a ordem que responde "o que eu faço agora".

### Sobre as abas de filtro da referência

A referência tem abas ("All orders | Dispatch | Pending | Completed") acima da tabela. **Não vamos adicioná-las**, porque o painel já tem esse controle: os seis cartões de contagem são links que filtram por status. Trocar seis cartões que mostram o número por quatro abas que não mostram seria perder informação para ganhar um elemento.

O que melhora é o estado ativo do cartão selecionado, hoje só uma borda: passa a ter fundo petróleo lavado e a mesma transição das linhas.

### Sidebar: o movimento

O item ativo já é um retângulo petróleo. O que falta é transição — hoje a mudança é instantânea porque a navegação recria o elemento.

1. **Hover nos inativos** — ícone e texto clareiam para branco em 140ms, com deslocamento de 2px para a direita, sugerindo a direção da navegação.
2. **Item ativo** — o chevron da direita desliza 2px ao passar o mouse.
3. **Barra indicadora** — 3px em petróleo claro (`--color-brand-light`) na borda esquerda do item ativo, que dá o contorno de "aba selecionada" da referência sem precisar do recorte côncavo.

O recorte côncavo da referência (a cavidade que "morde" a sidebar) exige pseudo-elementos com `radial-gradient` em duas pontas e quebra em qualquer mudança de altura do item. Custo alto de manutenção para um detalhe que a barra indicadora entrega com três linhas de CSS.

### Onde mais isso vale

As mesmas classes servem `/qsms/base`, `/qsms/supervisores`, `/qsms/ausencias` e `/admin/usuarios`, que usam a mesma `.tabela`. O estilo é aplicado uma vez no `globals.css` e as cinco telas melhoram juntas — nenhuma delas precisa ser tocada individualmente.

---

## 6. Entrega E — Foto do colaborador

### Por que é escopo novo

As entregas A e D partiam de "não temos foto de ninguém" e usavam avatar com inicial. Foto de verdade contraria isso e também a afirmação de que nada aqui muda schema: exige coluna nova, bucket novo e uma tela de upload. Fica registrada como entrega própria em vez de escondida dentro das outras.

O avatar com inicial não é descartado — vira o **fallback**, usado enquanto não houver foto. E vai haver muito tempo sem foto: 261 pessoas não ganham retrato num dia.

### Modelo

```sql
alter table public.colaboradores add column foto_url text;
```

Guarda o **caminho** no bucket, não uma URL — mesma decisão já tomada para o documento do ASO em `lib/storage.ts`. URL assinada expira; gravar uma no banco cria registro que apodrece sozinho.

### Bucket

Bucket `fotos`, privado, com as políticas espelhando as do bucket `asos`: só perfil QSMS escreve, leitura para autenticado. Foto de funcionário é dado pessoal — bucket público deixaria qualquer um com o link ver o rosto de 261 pessoas, e links de storage vazam com facilidade.

### Redimensionamento no navegador, antes do upload

A foto é reduzida para 256×256 via `canvas` no cliente, exportada em JPEG a 80%, antes de sair da máquina de quem envia.

Isso resolve o problema real da lista: 25 linhas × uma foto de celular de 3 MB são 75 MB por página. Reduzida, cada miniatura fica em torno de 15 kB.

Feito no navegador e não no servidor de propósito — `sharp` no servidor resolveria igual, mas é dependência de runtime a mais, consumo de CPU por upload, e mais uma peça para configurar no deploy. O `canvas` já está em todo navegador, custa cerca de vinte linhas e nada viaja pela rede além do necessário.

### URLs assinadas em lote

A lista chama `createSignedUrls` (plural) uma única vez com os caminhos da página inteira, validade de uma hora. Uma chamada por página, não uma por linha — 25 chamadas sequenciais de assinatura seriam mais lentas que a consulta que trouxe os dados.

Linhas sem `foto_url` nem entram nessa chamada: caem direto no avatar de inicial.

### Onde se envia

Na aba **Cadastro** da página do colaborador (Entrega A), junto dos demais dados da pessoa. Uma tela de upload em massa de fotos não entra: sem processo definido de quem tira e envia as fotos, seria construir uma esteira para um fluxo que ninguém descreveu.

### Onde a miniatura aparece

Painel, base de conferência e o cabeçalho da página do colaborador. Nas três, o mesmo componente `<AvatarColaborador>`, que decide sozinho entre foto e inicial.

---

## 7. Ordem de implementação

Cada fase entrega valor sozinha e pode ser revisada antes da seguinte.

**Fase 1 — Login (menor, isolada)**
1. `components/marca-vertical.tsx`
2. Aplicar nas três telas de autenticação

**Fase 2 — Lista e sidebar (visual, sem regra de negócio)**
3. Estilo de cartão, hover e acento no `.tabela` do `globals.css`
4. `<AvatarColaborador>` por linha e estado ativo dos cartões de contagem
5. Animações da sidebar e barra indicadora
6. Paginação e ordenação por coluna no painel

**Fase 2b — Foto**
7. Migration `0008`: coluna `foto_url` e bucket `fotos`
8. Redimensionamento no cliente e envio (usado na Fase 3, aba Cadastro)
9. Miniaturas na lista, com URLs assinadas em lote

Vem antes da página do colaborador de propósito: define o vocabulário visual que a página nova vai usar, em vez de a página inventar o dela e as duas divergirem.

**Fase 3 — Página do colaborador (o núcleo)**
10. Migration `0009` com `fn_historico_do_colaborador`
11. `layout.tsx` da rota, com cabeçalho e cartões
12. Abas Visão geral, ASO, Histórico
13. Abas Ausências, Cadastro (com edição e envio de foto)
14. Aba Treinamentos (estado vazio)
15. Trocar o destino do nome no painel e na base

**Fase 4 — Dashboard**
16. Migration `0010` com as três funções agregadoras
17. Página, cartões e blocos de agregação
18. Gráfico da curva em SVG inline
19. Item novo na sidebar e atualização automática

---

## 8. Verificação

- `npm run typecheck` e `npm run build` limpos a cada fase.
- Conferência visual no browser em 1280px e em largura estreita, como foi feito na sidebar — layout que só compila não está verificado.
- As funções novas do banco recebem checagem em `scripts/verificar.mjs`: retornam linha para a base de teste e respeitam RLS.
- A base fictícia de 15 colaboradores já cobre os seis status e quatro etapas, então serve para validar tanto os cartões quanto o ranking por supervisor.

---

## 9. Pontos a confirmar antes de começar

1. **"Tempo real"** — atualização por intervalo de 60s (proposta) ou websocket do Supabase Realtime?
2. **Assinatura da marca** — "requisitos ocupacionais" (atual) ou "operacionais" (como no pedido)?
3. **Dashboard como destino do login** — o padrão proposto mantém `/qsms` (a lista) como destino. Se o uso principal for gerencial, o destino pode passar a ser `/qsms/dashboard`.

---

## 10. Fora deste plano

- Qualquer alteração em `/supervisor/*`.
- Cadastro de NR-10, NR-33, NR-35 e brigada — depende das periodicidades (P4).
- Reimportação da base de colaboradores (P8), pendente desde a remoção dos dados reais.
- Notificação por WhatsApp, integração com eSocial e gestão de capacidade da clínica, que já estavam fora do MVP.
