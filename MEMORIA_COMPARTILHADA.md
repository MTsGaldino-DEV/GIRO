# Memória compartilhada — GIRO

Atualizada em 23/10/2026. Continuidade entre Claude e Codex.
[Perfil geral](../MEMORIA_COMPARTILHADA.md) · [Catálogo](../CATALOGO_FUNCIONALIDADES.md).

## Entrada e evidências

Ler `contexto_geral.md`, `docs/identidade-visual.md` e esta memória.
O contexto geral é auditoria de 08/09; `docs/contexto-atual.md` é snapshot
mais antigo, de 02/09. Não tratar seus números/estado do banco como atuais.
Analisados manifestos, rotas, componentes, tokens, documentação e Git.
Não houve consulta ao banco, envio de e-mail ou teste de aplicação.

## Propósito e arquitetura

Gestão integrada de requisitos ocupacionais, inicialmente ASO da UEN 211.
Cada vencimento vira tarefa com dono e prazo: supervisor libera o colaborador,
QSMS agenda/acompanha documento, e histórico registra as transições.

- Next 15.5, React 19, TypeScript, Tailwind 4, Supabase SSR/Auth/Storage,
  Radix/shadcn, Zod, Resend e Vercel/cron.
- `app/(app)/qsms/`, `supervisor/`, `admin/`: áreas por papel.
- Dados/regras em `lib/dominio.ts`, `tipos.ts`, `consulta-itens.ts`,
  `consulta-colaborador.ts` e `supabase/migrations/`.
- `lib/supabase/`: separar browser, servidor e cliente administrativo.
- Papéis admin, qsms e supervisor; visibilidade de equipe e regras devem ser
  garantidas também no banco.

## Design que precisa ser preservado

Fonte: `app/globals.css` e `docs/identidade-visual.md`.
Inter no texto, fallback mono JetBrains/Consolas, petróleo `#0E7C74`,
grafite `#23262B`, fundo quente `#F2F1EC`, sidebar `#132523`.

**Regra explícita:** verde, âmbar, coral e vermelho são exclusivos do semáforo
de conformidade. Não usar essas cores em botões, links ou navegação.
Ação e navegação usam petróleo/grafite. O preto de vencido também não é a
cor da sidebar. Ausência de registro tem o mesmo peso operacional de vencido.

Tabelas densas, números tabulares, controles de pelo menos 42 px, foco visível,
movimento reduzido e pesos moderados. A intenção de contraste/status é
específica do GIRO; não aplicar a paleta de status do Warefly por conveniência.

## Referências reutilizáveis

| Fluxo | Onde estudar |
|---|---|
| Pendência com dono, etapa e SLA | `supabase/migrations/0002_maquina_estados.sql`, `lib/dominio.ts`, `components/ficha-item.tsx` e `timeline.tsx`. |
| Painel com filtros e ações por linha | `app/(app)/qsms/page.tsx`, `components/tabela-itens.tsx`. |
| Dashboard com “onde está a bola” | `app/(app)/qsms/dashboard/`, `components/grafico-conclusoes.tsx`. |
| Perfil de colaborador em painel flutuante | `components/perfil/painel-perfil.tsx`, `contexto.tsx`, abas e `botao-nome.tsx`. |
| Edição campo a campo | `app/(app)/qsms/colaborador/[id]/cadastro/campo-editavel.tsx`, `ficha-cadastro.tsx`, `lib/campos-colaborador.ts`. |
| Documentos privados e histórico | `components/perfil/aba-documentos.tsx`, `editar-documento.tsx`, `lib/storage.ts`. |
| Digest semanal por responsável | `lib/email-semanal.ts`, `app/api/cron/email-semanal/route.ts`. |
| Geração periódica de tarefas | `app/api/cron/gerar-itens/route.ts` e migrations de geração. |

## Regras e limites conhecidos

- Comparecimento não é conformidade: só documento/resultado apto resolve a pendência.
- Máquina de estados no Postgres, com responsável, prazo e trilha automática.
  Não duplicar transições só em React.
- Contexto registra janela de geração de 90 dias, semáforo com faixas próprias
  e periódico de 12 meses. Há pendências de negócio sobre periodicidade/AVP,
  clínicas, ausências e saída de inapto; não inventar regra nova.
- Uploads em buckets privados usam URLs assinadas; avaliar quem pode ler cada
  tipo de documento, inclusive supervisor.
- **Não foi encontrado pipeline de importação de planilhas.** Dependências
  exceljs/csv-parse/iconv-lite não comprovam funcionalidade pronta.
  Entrada histórica existente é manual pela base/ASO retroativo.
- Base fictícia/não importada é estado descrito pela auditoria antiga,
  sem confirmação remota nesta tarefa.
- Aba Treinamentos e outras lacunas estão documentadas; não prometer treinamento
  funcional por existir uma rota.
- `docs/plano_mvp.md` e `docs/plano_acao_fase.md`, citados por documentação,
  não foram encontrados no inventário atual.

## Comandos e verificações

`npm.cmd run dev`, `npm.cmd run typecheck`, `npm.cmd run build`.
Existe script `lint` (`next lint`); sua execução não foi validada nesta tarefa.
Não há script test nem runner unitário no manifesto.

`scripts/teste-fluxo.mjs` e `teste-rls.mjs` são integração com banco e
criam/alteram dados de teste. Seeds, db-push e crons também têm efeitos reais;
não executá-los como verificação documental.

O contexto antigo lista edição de cadastro “não commitada”; o Git atual já
tem commit de edição campo a campo. Preservar a diferença temporal.
Nesta tarefa foram criados apenas memória e pontos de leitura.

## Retomada — 03/11/2026 (Claude)

- `typecheck` e `build` passaram limpos; `main` sincronizada com `origin`
  (último commit d9a8592, 08/09). Banco não consultado.
- Sem `.vercel/` local: não confirmado se há deploy (pode ser via GitHub).
- `data/Colaboradores_211.xlsx` existe localmente (ignorada pelo Git) — é a
  entrada do importador que ainda não existe.
- Levantamento para produção entregue a Matheus. Bloqueantes: importador da
  base real, ambiente de produção (Supabase + Vercel + env/CRON_SECRET +
  Resend + redirect do Auth), contas reais sem seed. Inconsistência a decidir:
  geração em 90 dias vs. faixa `programar` em 60.
- Mesmo dia: `npm run dev` sobe e `/login` renderiza, mas o host Supabase do
  `.env` dá NXDOMAIN (inclusive em 8.8.8.8/1.1.1.1) — projeto pausado ou
  excluído. Sem banco, nenhum login funciona até restaurar ou criar projeto.
  Matheus restaurou o projeto no mesmo dia; voltou a responder.

## Redesign visual do QSMS — decisões de 03/11/2026 (brainstorming em curso)

Supervisor fora do escopo por ora. Spec ainda não escrita; mockups locais em
`.superpowers/brainstorm/` (ignorado pelo Git).

- QSMS entra no **Dashboard** depois do login (hoje cai no Painel).
- Sidebar vira **navegação no topo** (faixa escura #132523, cartões sobrepostos
  à faixa, como a referência "Employees" que Matheus enviou); Cadastros e
  Administração em menus suspensos.
- **Painel = grade de cartões** (sem alternar para lista). Cartão: foto,
  nome, cargo, selo de status, vencimento, supervisor, etapa e com quem está.
  Semáforo só no selo.
- **Dashboard = "ação primeiro"**: saudação, 3 números de urgência
  clicáveis, lista "parados há mais tempo" com botão de ação, "onde está a
  bola" (supervisão × QSMS), rosca de status, curva, vencimentos à frente;
  ranking de supervisores no fim (decisão do Claude, a confirmar).
- **Login**: fundo animado "papel de eletro" (grade de ECG, varredura do
  traço, onda saindo do símbolo oficial do GIRO), estrutura da central-neo.
- **Menos texto**: no máximo uma frase sob cada título; explicações em ⓘ.
- **Perfil do colaborador (gaveta)**: Matheus quer redesenhar — próximo
  assunto do brainstorming.
- **Animações aprovadas e já aplicadas** (sem commit): entrada da página,
  cartão que levanta, números contando (CSS @property), gráficos crescendo,
  pílula deslizante na navegação (hoje na sidebar; migra para o topo),
  barra de progresso no topo ao navegar e barra dentro do botão ocupado
  (`aria-busy` nos botões com `useFormStatus`). Corrigido também erro de
  hidratação preexistente no `<title>` do gráfico de conclusões.
- Lentidão ao trocar de aba: medida em dev, o grosso é compilação sob demanda
  (6–9 s na 1ª visita; 0,4–1,3 s depois). Medir em build de produção antes de
  otimizar.
- `npm run lint` não está configurado (abre assistente interativo).

