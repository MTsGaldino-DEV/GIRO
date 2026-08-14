// Leitor mínimo de .env.local para os scripts de linha de comando.
// A aplicação Next carrega o .env sozinha; os scripts rodam fora dela.

import fs from "node:fs";
import path from "node:path";

export function carregarEnv(raiz) {
  for (const nome of [".env.local", ".env"]) {
    const arquivo = path.join(raiz, nome);
    if (!fs.existsSync(arquivo)) continue;

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
}
