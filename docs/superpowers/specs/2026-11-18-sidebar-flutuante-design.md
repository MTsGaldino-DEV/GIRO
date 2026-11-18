# Sidebar flutuante escura (18/11/2026)

Maquete aprovada por Matheus em 18/11/2026 ("ficou bom demais… pode
implementar esse modelo"): `giro-mockup-sidebar-3.html` (descartável, fora do
repositório). Evolui o redesign de 17/11
(`2026-11-17-redesign-ui-design.md`); comportamento e acessibilidade daquele
trabalho continuam valendo.

## Por quê

A sidebar verde-escura chapada não agradava. Matheus trouxe duas referências:
um cartão flutuante arredondado com item ativo em pílula ("ReSync") e a sidebar
da central-neo (degradê radial escuro). Pediu o layout da primeira com a receita
de cor da segunda, nas cores do GIRO.

## O que muda (só desktop ≥1024px; gaveta do celular só herda as cores)

1. **Cartão flutuante:** a sidebar fica solta da borda (respiro de 14px em cima,
   embaixo e à esquerda), cantos de 22px, sombra suave. Aberta ~260px, recolhida
   ~72px.
2. **Cor (receita NEO, cores GIRO):** fundo
   `radial-gradient(ellipse at 30% 20%, #1F3D39 0%, #132523 55%, #09130F 100%)`.
   Texto dos itens branco 72%, hover branco 6% de fundo.
3. **Cabeçalho:** `favicon.svg` (símbolo branco em quadrado petróleo, cantos 8px),
   "GIRO." (ponto em #4FB3A6) e botão ‹ à direita; recolhida, o ‹ vira › e
   desce para baixo do símbolo.
4. **Seções:** "OPERAÇÃO"/"GESTÃO" em 10px, peso 700, maiúsculas, espaçamento
   .16em, branco 40%. Recolhida: vira um fio curto entre os blocos.
5. **Itens:** altura 44px, cantos totalmente arredondados (pílula), ícone 21px.
   **Ativo:** fundo #0E7C74, texto branco 600, `inset 3px 0 0 #4FB3A6` e brilho
   `0 6px 16px -8px rgb(14 124 116 / .8)`. Recolhida: pílula 46×38 centrada.
6. **Subitens:** com ícone (18px), 38px de altura; ativo em `rgb(79 179 166 / .14)`
   com texto #4FB3A6. Grupo que contém o ativo continua indicando isso.
7. **Contador do Tratamento:** pílula #4FB3A6 com texto #132523; ponto no ícone
   de Administração quando recolhida.
8. **Cartão do pé** (fundo branco 4%, borda branca 8%, cantos 16px):
   - **Anel "Em dia"** (52px; recolhida 40px só com o %), cor #4FB3A6 sobre
     branco 10%, com "Em dia" e "N de T colaboradores" ao lado. É link para o
     Dashboard.
   - **Conta** (avatar redondo petróleo, nome, papel, ↕) abrindo o menu atual
     (Trocar senha, Sair).

## Regra do "Em dia" (igual ao Dashboard)

- Em dia = colaborador ativo cujo **pior** requisito está `ok` (Regular).
  Não em dia = ao menos um requisito em Programar, Atenção, Crítico, Vencido ou
  Sem registro. Percentual = `percentual(ok, total)` de `lib/regras-dashboard.ts`.
- Escopo: QSMS e admin veem a UEN (`fn_resumo_status`, mesma leitura do
  Dashboard); supervisor com `supervisor_id` vê a própria equipe
  (`buscarLinhasStatus` + `resumirPorPessoa`); supervisor sem vínculo vê a UEN.
- Falha na consulta: o anel some (o cartão fica só com a conta). Nunca mostrar
  0% inventado. Total 0: o anel some.

## Fora do escopo

- Botão "+ Novo" da referência: não entra.
- Mudança de rotas, permissões, itens do menu ou do comportamento (cookie,
  Ctrl+B, dica fixa, menus laterais dos grupos recolhidos, gaveta do celular).

## Antiobjetivos

- Verde/âmbar/coral/vermelho na sidebar (o anel é petróleo, não semáforo).
- Quebrar teclado, foco visível ou leitor de tela da versão recolhida.

## Abordagens

- **A. Reestilizar `components/sidebar.tsx` e o bloco de CSS da sidebar em
  `app/globals.css` (escolhida):** mesmas classes `sidebar__*`, novos tokens.
- B. Trocar pelo componente de sidebar do shadcn: segunda fonte de tokens e
  reescrita do comportamento já testado; descartada (como em 17/11).
