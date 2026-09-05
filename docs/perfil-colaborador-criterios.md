# Perfil do Colaborador — Critérios de aceite

Verificação do superprompt `superprompt.md`. Marcado só o que foi **verificado
em execução** — código escrito sem teste não conta como feito.

Data da verificação: 05/09/2026
Commits: `631b3d0` (V1) + o commit desta rodada.

---

## Legenda

- `[x]` verificado rodando
- `[~]` implementado com ressalva, descrita ao lado
- `[ ]` não feito

---

## 41 · Critérios de aceite

| | Critério | Como foi verificado |
|---|---|---|
| `[x]` | perfil abre a partir da lista | Clique no nome em `/qsms`, no item "Ver colaborador" do menu ⋮, e na lista de `/qsms/base` |
| `[x]` | perfil mantém contexto da lista | Painel lateral por cima; URL não muda; ao fechar (X e Escape) a lista continua na mesma posição e com os mesmos filtros |
| `[x]` | foto aparece corretamente | Upload de PNG pelo painel → avatar renderiza no cabeçalho e na linha da tabela |
| `[x]` | informações cadastrais aparecem | Abas Visão geral e Cadastro: nome, matrícula, CPF, cargo, setor, polo/UEN, admissão, nascimento, supervisor, situação |
| `[x]` | ASO aparece | Aba ASO com `AcoesItem` reutilizado + tabela de exames realizados |
| `[~]` | requisitos aparecem | Aparecem **como documentos** (seção 21), não como entidade própria. O motor de requisitos está fora do escopo por decisão do próprio superprompt (seção 37) |
| `[~]` | treinamentos aparecem | Estado vazio explicativo na Visão geral. Não há dado de treinamento por colaborador na base — seção 36 manda mostrar estado apropriado, não inventar dado |
| `[x]` | documentos aparecem | Aba Documentos, 3 documentos vindos do seed |
| `[x]` | documentos podem ser anexados | Upload de PDF pelo painel → aparece na lista |
| `[x]` | documentos ficam em Storage privado | Bucket `documentos`, `public = false`, políticas de escrita restritas a `fn_e_qsms()` |
| `[x]` | documentos possuem metadados | tipo, data do documento, validade, descrição, tamanho, mime type |
| `[x]` | documentos possuem usuário responsável | `criado_por` / `atualizado_por`; coluna "Anexado por" mostra o nome |
| `[x]` | documentos possuem data/hora | `criado_em`, exibido junto do autor |
| `[x]` | documentos possuem validade quando aplicável | Campo opcional; coluna Status vista nos três estados: "Vigente", "Vencido", "sem validade" |
| `[x]` | documentos podem ser visualizados por URL assinada | Link gerado é `/storage/v1/object/sign/...` com token de 1h |
| `[x]` | ações importantes são auditadas | Anexo, edição, exclusão, alteração de cadastro e troca de foto |
| `[x]` | alterações cadastrais mostram antes/depois | `alterou cargo: Instalador Reparador Rede IV → Instalador Reparador Rede V` |
| `[x]` | upload registra usuário | `anexou avaliacao-psicologica.pdf · QSMS de Teste · Perfil do Colaborador` |
| `[x]` | exclusão registra usuário | `removeu rg.pdf (Documento Pessoal) · QSMS de Teste · Perfil do Colaborador` |
| `[x]` | auditoria é paginada | 25 por página com "Carregar mais"; a RPC pede uma linha a mais para saber se há próxima sem `count` |
| `[x]` | RLS é respeitado | `teste-rls.mjs` 22/22 |
| `[x]` | supervisor não acessa colaborador fora da equipe | Testado em documentos, view, linha do tempo e nas escritas |
| `[x]` | admin mantém acesso adequado | Testes novos: admin lê, edita documento e grava auditoria pela RPC |
| `[x]` | QSMS mantém acesso adequado | Coberto pelos testes existentes e pelos novos |
| `[x]` | máquina de estados do ASO continua funcionando | `teste-fluxo.mjs` 70/70; `AcoesItem` reutilizado sem alteração |
| `[x]` | triggers existentes continuam funcionando | `fn_item_registrar_historico` exercitada pelas 70 asserções de fluxo |
| `[x]` | migrations anteriores não são alteradas | `git show --stat` confirma: só `0014` foi criada, nenhuma anterior tocada |
| `[x]` | testes existentes continuam passando | RLS 10 originais + fluxo 70, todos verdes |
| `[x]` | novos testes cobrem permissões, documentos e auditoria | 12 asserções novas em `teste-rls.mjs` |
| `[x]` | seed contém dados para testar a nova experiência | 12 documentos em 4 colaboradores, cobrindo vigente / vencido / sem validade, mais trilha de auditoria |

---

## Seções do superprompt

### Feitas nesta rodada (faltavam na V1)

| Seção | O que era | Situação |
|---|---|---|
| 16 | Coluna **Status** na listagem | Etiqueta neutra: Vigente / Vencido / sem validade |
| 19 | Edição de metadados | Modal com tipo, data, validade, descrição + auditoria por campo |
| 20 | Exclusão | Confirmação explícita; auditoria gravada **antes** do delete |
| 26 | "documento alterado" e "documento excluído" na timeline | Renderizados com gramática própria |
| 5 | Responsividade | Verificada em 390×844: painel ocupa a tela toda, abas roláveis, sem corte |
| 38 (ETAPA 4) | `build` | `npm run build` compila; 29 rotas |

### Fora do escopo por decisão do próprio superprompt

Seção 37: motor de requisitos, motor de avaliação psicológica, gestão de exames
complementares, módulo de treinamentos, notificações e alertas de validade,
versionamento de documentos, dashboard documental, relatórios, exportação,
novos crons.

---

## Ressalvas honestas

**"Vínculo" (seções 11, 22, 23).** Não existe coluna `vinculo` em
`colaboradores`. A seção 9 manda não inventar campo que não existe na base, e a
seção 22 diz "conforme existirem na base" — então o campo mais próximo,
`situacao`, é o que está editável. Se "vínculo" for um conceito real da operação
(CLT / terceirizado / temporário), precisa de coluna nova e ficou de fora.

**Trocar o arquivo de um documento existente** não é possível. Só metadados são
editáveis; substituir o binário exigiria versionamento, que a seção 37 exclui.
Quem precisa de outra versão anexa um documento novo e remove o antigo — e as
duas ações ficam na trilha.

**`lint` (seção 38, ETAPA 4).** `next lint` está deprecado nesta versão e o
projeto não tem ESLint configurado por fora. Rodei `tsc --noEmit`, que cobre
tipos, mas não é a mesma checagem.

**Exclusão é física, não soft delete.** É o padrão que o projeto já usa
(`removerAusencia`), e a seção 20 pede para seguir o padrão existente. O
documento não volta; o que sobrevive é a linha de auditoria com nome, tipo,
autor e data.

---

## Dois bugs encontrados testando

Ambos teriam passado despercebidos sem execução real:

**1. O select de Supervisor apagava o vínculo.** A lista de supervisores
carregava de forma assíncrona e `defaultValue` só vale na montagem — o campo
abria em "Sem supervisor" mesmo para quem tinha supervisor. Salvar dali
**apagaria o vínculo em silêncio**. Corrigido montando o formulário só depois da
lista chegar.

**2. O modal de edição abria uma vez só.** `useActionState` guarda o resultado
depois que o modal fecha, e `aoFechar`/`aoConcluir` chegavam como funções novas
a cada render do pai. O efeito reexecutava, encontrava o `ok` da edição anterior
e fechava o modal no mesmo instante em que ele abria para o próximo documento.
Corrigido com uma trava por instância mais `key` para remontar.
