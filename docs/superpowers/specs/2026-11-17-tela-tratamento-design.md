# Tela de Tratamento — desenho (17/11/2026)

## Por quê

Matheus quer uma fila única do que está faltando no cadastro, para tratar as
divergências à mão, uma a uma. Cada linha é uma tarefa: nome da pessoa, o que
falta e um botão que resolve. Só o admin vê.

## Objetivos

- Uma aba "Tratamento" no grupo Administração da sidebar, visível só para admin.
- Uma linha por lacuna (a mesma pessoa pode ter várias linhas).
- O botão de cada linha leva à solução, no próprio lugar quando for simples.
- A tarefa some sozinha quando o dado é corrigido.

## Fora do escopo

- Vencimentos de ASO/AVP (vencido, crítico etc.): continuam no Radar.
- GESET: fica fora (decisão de Matheus).
- Polo e foto: não são divergências.
- "Dispensar" tarefa, histórico de tarefas resolvidas, rotina agendada.

## Abordagens consideradas

- **A. Lista calculada na hora (escolhida por Matheus).** Lê o estado atual do
  banco a cada abertura; nada de tabela de tarefas.
- B. Tarefas gravadas numa tabela por rotina diária, com situação e quem
  resolveu. Descartada: pode ficar desatualizada e dá mais manutenção.
- C. A + "Dispensar" gravado. Descartada por ora; pode ser acrescentada depois
  sem refazer a A.

## Tipos de tarefa (números de 17/11/2026)

| Tipo | Regra | Hoje | Botão |
|---|---|---|---|
| Sem supervisor | colaborador ativo com `supervisor_id` vazio | 10 | lista de supervisores na linha + Salvar |
| Sem ASO | `vw_status_colaborador`, ASO Periódico, `sem_registro` | 2 | "Anexar ASO": abre o painel do perfil na aba ASO (Lançar exame anterior pede data e PDF) |
| Sem AVP | idem, AVP (a view já só traz quem exige AVP) | 2 | "Anexar AVP": idem |
| Fora da NEO | colaborador ativo com `neo_id` vazio | 5 | "Conferir cadastro": abre o painel na aba Cadastro |

"Exame sem PDF" não entra: depois da importação de 17/11 são 0, e desde a 0021
todo exame apto novo exige o documento.

## Tela

```
Tratamento                                     19 pendências
[Todos 19] [Sem supervisor 10] [Sem ASO 2] [Sem AVP 2] [Fora da NEO 5]
──────────────────────────────────────────────────────────────────
Nome (matrícula)          O que falta                 Ação
ADAILTON ... (23555)      Sem supervisor              [Escolher ▾] [Salvar]
JOSUE ... (37040)         Sem ASO registrado          [Anexar ASO]
```

- Ordem: por tipo (na ordem da tabela acima), depois por nome.
- Nome abre o painel do perfil (mesmo `BotaoNomeColaborador` das outras telas).
- Filtro por tipo em pílulas com contagem; vazio mostra "Nada pendente".
- Cores do semáforo não são usadas (regra do GIRO); tipo em `.etiqueta`.

## Decisões de construção (calls do Claude)

- Sem migration: a lista é montada no servidor a partir de `colaboradores`
  (ativos) e `vw_status_colaborador`, numa função pura testável
  (`lib/consulta-tratamento.ts`) + teste em `scripts/`.
- Rota `/admin/tratamento`, protegida por `exigirAdmin()`; item na sidebar só
  no grupo Administração.
- "Salvar" do supervisor reaproveita a Server Action `vincularColaborador`
  (`app/(app)/qsms/supervisores/acoes.ts`), acrescentando
  `revalidatePath("/admin/tratamento")`.
- Depois de resolver no painel do perfil, a lista recarrega ao fechar o painel.
- Aviso de comportamento: a NEO é a fonte do supervisor. Se o texto da NEO
  apontar para outro supervisor, a sincronização diária sobrescreve a escolha;
  texto vazio ou sem casamento não mexe.

## Polo sai das telas (pedido de Matheus, 17/11)

Nenhum colaborador tem polo. Sai da interface: filtro do Radar, filtro/vínculo
em massa por polo em Supervisores, cabeçalho do perfil e campo do cadastro.
**Call do Claude:** a coluna `colaboradores.polo` fica no banco (sem
migration), para poder voltar sem perda.

## Deixado para quem constrói

Texto exato dos rótulos, espaçamento, e se a contagem aparece também na
sidebar.
