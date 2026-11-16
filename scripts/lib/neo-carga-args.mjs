// Argumentos do script da primeira carga da NEO (scripts/neo-primeira-carga.mjs).
//
// Lógica pura, no estilo de db-push-args.mjs: uma chamada recusada não lê .env nem
// conecta em nada. O padrão é o RELATÓRIO (não grava). Aplicar exige as três
// coisas juntas: --aplicar, --sim-eu-sei e --backup <arquivo fora do repositório>.
// O backup guarda CPF e nome de colaboradores; por isso nunca pode ficar dentro do
// repositório (risco de ir para o Git).

import path from "node:path";

export const USO = `Uso:
  node --experimental-strip-types scripts/neo-primeira-carga.mjs
      Relatório: lê a NEO e mostra o que seria feito. Não grava nada.
  node --experimental-strip-types scripts/neo-primeira-carga.mjs --aplicar --sim-eu-sei --backup <arquivo.json>
      Aplica a primeira carga, depois de gravar o backup no arquivo informado
      (que precisa ficar fora do repositório e ainda não existir).`;

/** `true` se `alvo` está dentro de `raiz` (ou é a própria raiz). */
function dentroDe(raiz, alvo) {
  const rel = path.relative(raiz, alvo);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function interpretarArgs(argv, raiz) {
  let aplicar = false;
  let simEuSei = false;
  let backupBruto = null;
  let temBackup = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--aplicar") aplicar = true;
    else if (a === "--sim-eu-sei") simEuSei = true;
    else if (a === "--backup") {
      temBackup = true;
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) {
        return { ok: false, erro: `--backup precisa do caminho de um arquivo.\n\n${USO}` };
      }
      backupBruto = valor;
      i++;
    } else {
      return { ok: false, erro: `Argumento desconhecido: ${a}\n\n${USO}` };
    }
  }

  if (!aplicar) {
    if (temBackup || simEuSei) {
      return { ok: false, erro: `--backup e --sim-eu-sei só valem junto com --aplicar.\n\n${USO}` };
    }
    return { ok: true, modo: "relatorio", backup: null };
  }

  if (!simEuSei || backupBruto === null) {
    return {
      ok: false,
      erro:
        "--aplicar exige --sim-eu-sei e --backup <arquivo> juntos. " +
        "Confirme antes que o backup do Supabase está ativo.\n\n" + USO,
    };
  }

  const backup = path.resolve(raiz, backupBruto);
  if (dentroDe(raiz, backup)) {
    return {
      ok: false,
      erro: "O arquivo de backup precisa ficar fora do repositório: ele guarda CPF e nome de colaboradores.",
    };
  }
  return { ok: true, modo: "aplicar", backup };
}
