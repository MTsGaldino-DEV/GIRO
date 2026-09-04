// Leitor mínimo de .env para os scripts de linha de comando.
// A aplicação Next carrega o arquivo sozinha; os scripts rodam fora dela.
//
// Um arquivo só, por decisão: dois arquivos com precedência entre eles fazem
// alguém editar o que não vale e perder meia hora achando que o valor não foi
// lido. Variável já presente no ambiente continua ganhando do arquivo — é o que
// permite `SUPABASE_DB_URL=... npm run db:push` apontar para outro banco sem
// editar nada.

import fs from "node:fs";
import path from "node:path";

export function carregarEnv(raiz) {
  const arquivo = path.join(raiz, ".env");
  if (!fs.existsSync(arquivo)) return;

  for (const linha of fs.readFileSync(arquivo, "utf-8").split("\n")) {
    const texto = linha.trim();
    if (!texto || texto.startsWith("#")) continue;

    const igual = texto.indexOf("=");
    if (igual === -1) continue;

    const chave = texto.slice(0, igual).trim();
    let valor = texto.slice(igual + 1).trim();

    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    if (!(chave in process.env)) process.env[chave] = valor;
  }
}
