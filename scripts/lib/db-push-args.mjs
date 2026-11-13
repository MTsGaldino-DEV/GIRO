// Leitura dos argumentos de scripts/db-push.mjs (função pura, testada em
// scripts/teste-db-push-args.mjs).
//
// Por que tanta trava: só existe um banco, o de produção, e as migrations NÃO
// são todas reaplicáveis. Reaplicar 0002 em diante, em ordem, volta funções e
// regras antigas (fn_transicao_valida, fn_e_qsms só para QSMS, acesso por
// equipe) e cada arquivo é confirmado na sua própria transação; a 0003 então
// falha (a view atual tem mais colunas) e o script para ali, sem rodar as que
// consertariam o estrago. Por isso:
//   - sem `--only` não roda nada;
//   - `--only` aceita só números de 4 dígitos, casados pelo prefixo exato do
//     arquivo (`--only 001` não pode mais pegar 0010 a 0019);
//   - a reaplicação completa exige `--todas --sim-eu-sei`, os dois.

const NUMERO = /^\d{4}$/;
const OPCOES = ["--only", "--todas", "--sim-eu-sei"];

export const AVISO_TODAS = [
  "ATENÇÃO: reaplicar TODAS as migrations no banco de produção é destrutivo.",
  "  - 0002 em diante recriam versões antigas de funções e regras",
  "    (fn_transicao_valida, fn_e_qsms só QSMS, fn_exigir_acesso_ao_item por equipe);",
  "  - cada arquivo é confirmado na sua transação; a 0003 falha (a view atual tem",
  "    mais colunas) e o script para ali, sem reaplicar as que consertariam;",
  "  - só faz sentido num banco vazio.",
].join("\n");

export const USO = [
  "Uso:",
  "  npm run db:push -- --only 0021          aplica só a migration 0021",
  "  npm run db:push -- --only 0020,0021     aplica as duas, em ordem",
  "  npm run db:push -- --todas --sim-eu-sei reaplica todas (só em banco vazio)",
].join("\n");

const MENSAGEM_SEM_FILTRO = [
  "Recusado: informe quais migrations aplicar com --only NNNN.",
  "Só existe o banco de produção e reaplicar todas as migrations o quebra:",
  "funções antigas voltam, a 0003 falha e as seguintes não rodam para consertar.",
  "",
  USO,
].join("\n");

/**
 * @param {string[]} argv argumentos depois de `node db-push.mjs`
 * @param {string[]} nomes nomes dos arquivos da pasta de migrations
 * @returns {{ ok: true, arquivos: string[], todas: boolean } | { ok: false, erro: string }}
 */
export function selecionarMigrations(argv, nomes) {
  let only = null;
  let todas = false;
  let simEuSei = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--only") {
      const proximo = argv[i + 1];
      if (proximo === undefined || proximo.startsWith("--")) {
        return { ok: false, erro: `--only precisa de um número de migration.\n\n${USO}` };
      }
      only = proximo;
      i++;
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
    } else if (arg === "--todas") {
      todas = true;
    } else if (arg === "--sim-eu-sei") {
      simEuSei = true;
    } else {
      return {
        ok: false,
        erro: `Argumento desconhecido: "${arg}". Opções aceitas: ${OPCOES.join(", ")}.\n\n${USO}`,
      };
    }
  }

  const sql = nomes.filter((f) => f.endsWith(".sql")).sort();

  if (todas || simEuSei) {
    if (only !== null) {
      return { ok: false, erro: `Use --only OU --todas --sim-eu-sei, não os dois.\n\n${USO}` };
    }
    if (!(todas && simEuSei)) {
      return {
        ok: false,
        erro: `A reaplicação completa exige --todas E --sim-eu-sei.\n\n${AVISO_TODAS}\n\n${USO}`,
      };
    }
    if (sql.length === 0) return { ok: false, erro: "Nenhuma migration encontrada." };
    return { ok: true, arquivos: sql, todas: true };
  }

  if (only === null) return { ok: false, erro: MENSAGEM_SEM_FILTRO };

  const numeros = only
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  if (numeros.length === 0) return { ok: false, erro: MENSAGEM_SEM_FILTRO };

  const invalidos = numeros.filter((n) => !NUMERO.test(n));
  if (invalidos.length > 0) {
    return {
      ok: false,
      erro: `--only aceita só números de 4 dígitos (ex.: 0016), separados por vírgula. Inválido: ${invalidos.join(", ")}.`,
    };
  }

  const escolhidos = [];
  const faltando = [];
  for (const n of new Set(numeros)) {
    const achados = sql.filter((f) => f.startsWith(`${n}_`) || f === `${n}.sql`);
    if (achados.length === 0) faltando.push(n);
    escolhidos.push(...achados);
  }
  if (faltando.length > 0) {
    return { ok: false, erro: `Nenhuma migration com o número ${faltando.join(", ")}.` };
  }

  return { ok: true, arquivos: [...new Set(escolhidos)].sort(), todas: false };
}
