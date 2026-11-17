# Redesign de UI/UX — sidebar, casca e Radar (17/11/2026)

Exemplo navegável aprovado por Matheus em 17/11/2026 (maquete HTML descartável,
fora do repositório). Este documento é a referência para implementar.

## Por quê

Matheus não estava satisfeito com a UI/UX: sentia falta de uma sidebar bonita e
recolhível, não gostava da faixa escura atrás dos títulos, achava a tela clara
demais e o fundo bege "amarelado". Trouxe uma referência de painel de pedidos
(sidebar estreita de ícones, título grande, bloco de busca e filtros, abas com
contagem, tabela num quadro) e pediu o GIRO nessa linha.

## Objetivos

1. **Sidebar** verde do GIRO (#132523) que **nasce recolhida** (trilho só de
   ícones, ~68px) e cresce para ~248px pelo botão do topo ou **Ctrl+B**. Estado
   em cookie (`giro-sidebar`), lido no servidor para não piscar.
   - Recolhida: dica com o nome ao passar o mouse/focar; grupos (Cadastros,
     Administração) abrem num menu ao lado; o rodapé é só o avatar.
   - Seções "Operação" (Dashboard, Radar, Colaboradores) e "Gestão" (grupos).
   - Item ativo: fundo petróleo translúcido, ícone petróleo claro, barra à esquerda.
   - Avatar com iniciais no pé abre menu com Trocar senha e Sair.
   - Celular (<1024px): barra no topo + gaveta, como hoje (sempre aberta).
   - Contador no item **Tratamento** (e ponto no ícone de Administração quando
     recolhida) com o total da fila de Tratamento.
2. **Casca sem faixa escura e sem trilha.** Sai `.faixa-app` e a inversão de
   cores de `.cabecalho-pagina`; sai a trilha (Operação › Radar) do cabeçalho.
3. **Fundo cinza frio** no lugar do bege: `--color-mist` ~#E4E7EA, neutros de
   texto e linha em tons frios (ver maquete: ink #1E2226, muted #565D64, faint
   #858C93, line #E1E4E8, line-strong #C5CBD1). Cartões brancos.
4. **Fonte IBM Plex Sans** (400/500/600) no lugar da Inter, via `next/font`.
5. **Aviso "N de 252 sem data de referência" sai do topo**; esses casos já
   entram na fila de Tratamento (`lib/consulta-tratamento.ts`).
6. **Radar no padrão novo de lista:**
   - Título grande + descrição à esquerda; ações (Gerar itens) à direita.
   - Cartão branco: segmento Minha equipe/Todos, busca, pílulas (Requisito,
     Status, Supervisor, Só parados além do prazo), Limpar filtros.
   - **Quadro branco arredondado** com: abas de **etapa** (Todos + as 7 etapas
     abertas, cada uma com contagem; pontinho petróleo nas etapas de "sua vez";
     legenda "● Sua vez de agir" à direita das abas), cabeçalho da tabela em
     faixa cinza, linhas separadas por fio, **paginação no fim** do quadro.
   - Os cartões de etapa (`CartoesEtapa`) são substituídos pelas abas.
   - Colunas: Colaborador, Requisito, Supervisor, Vencimento, **Status**,
     **Faltam**, Etapa, Ação.
   - **Status** mostra só o nome (sem dias). **Faltam** mostra os dias: vencido
     negativo e vermelho (`-31d`), sem registro `—`.
   - **Selo de status sem a bolinha** (`.status::before`) em todo o sistema.
   - **Destaque de quem é a vez:** a pílula do responsável (QSMS/Supervisão)
     fica petróleo cheia quando é o papel de quem está logado (admin = QSMS);
     o botão da ação fica cheio nessas linhas e contornado nas demais. A linha
     não muda de cor. Sem regra de equipe no destaque.
7. **Dono de cada etapa — regra única** (confirmada por Matheus, corrige a
   divergência entre `vw_itens_abertos.dono` e `FAIXA_PARA_AGIR`):

   | Etapa | Dono |
   |---|---|
   | previsto (Pendente) | qsms |
   | data_solicitada | supervisor |
   | data_proposta | qsms |
   | agendado | supervisor |
   | enviado_clinica | supervisor |
   | aguardando_documento | qsms |
   | inapto_em_tratativa | qsms |

   Banco: migration nova recriando `vw_itens_abertos` com previsto → qsms.
   App: `FAIXA_PARA_AGIR` alinhado à tabela (agendado vai para supervisor;
   aguardando_documento entra no qsms). As permissões das RPCs **não** mudam
   neste trabalho (só o rótulo de quem age e o destaque).

## Fora do escopo (depois)

- As outras telas no padrão novo (Dashboard, Colaboradores, Supervisores,
  Ausências, Usuários, Tratamento) — próxima etapa, mesmo padrão do Radar.
- Data de admissão como ASO admissional (vencimento = admissão + 12 meses)
  para quem não tem registro — decisão expressa, tarefa separada de banco.
- Botão "Exportar" da maquete: não existe hoje; não implementar agora.
- Seletor "Itens por página" da maquete: não implementar agora.

## Antiobjetivos

- Usar verde/âmbar/coral/vermelho fora do semáforo (petróleo é marca, não
  semáforo; o vermelho do `-31d` é conformidade, permitido).
- Quebrar a navegação por teclado, foco visível ou leitor de tela na sidebar
  recolhida (rótulos continuam no DOM; dica é só visual).
- Mudar o que cada papel enxerga ou pode fazer.

## Abordagens consideradas

- **A. Evoluir os componentes e o `globals.css` existentes (escolhida).** Tokens
  trocados em um lugar, sidebar reescrita sobre a atual, Radar reorganizado sem
  mudar a consulta. Menor risco, preserva testes e acessibilidade já resolvidos.
- B. Trocar por biblioteca de UI pronta (shadcn sidebar/table). Mais código novo,
  segunda fonte de tokens; descartada.
- C. Só CSS, sem mexer em componentes. Não dá conta das abas, do Faltam nem do
  destaque por papel; descartada.

## Notas para quem implementa

- `docs/identidade-visual.md` e o comentário de tokens do `globals.css` devem
  registrar o cinza frio e a IBM Plex Sans (instrução atual de Matheus prevalece
  sobre o registro antigo do bege e da Inter).
- `rotuloStatus(status, dias)` já existe; no Radar passar só o nome e calcular
  Faltam a partir de `dias_restantes`.
- As contagens das abas já existem (`contarItensPorEtapa` / `atualizarContagens`);
  "Todos" é a soma.
- `components/sidebar.tsx` já foi reescrito (recolhível, seções, menu da conta),
  com `lib/sidebar.ts` e `IconeExpandir`; falta CSS e o layout ler o cookie.
