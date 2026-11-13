// Aplica migrations de supabase/migrations/, em ordem, cada arquivo numa
// transação.
//
// Não substitui a CLI do Supabase — existe para não depender de Docker nem de
// login interativo numa máquina Windows.
//
// As migrations NÃO são todas reaplicáveis: reaplicar todas no banco de
// produção recria funções antigas e para na 0003 sem consertar (detalhes em
// scripts/lib/db-push-args.mjs). Por isso o filtro é obrigatório:
//
//   npm run db:push -- --only 0021
//   npm run db:push -- --only 0020,0021
//   npm run db:push -- --todas --sim-eu-sei   # só em banco vazio

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";
import { selecionarMigrations, AVISO_TODAS } from "./lib/db-push-args.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(raiz, "supabase", "migrations");

// Argumentos antes de tudo: uma chamada recusada não lê .env nem conecta.
const selecao = selecionarMigrations(process.argv.slice(2), fs.readdirSync(dir));
if (!selecao.ok) {
  console.error(selecao.erro);
  process.exit(1);
}
const arquivos = selecao.arquivos;
if (selecao.todas) console.warn(`${AVISO_TODAS}\n`);

carregarEnv(raiz);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Defina SUPABASE_DB_URL no .env (Supabase > Settings > Database).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log(`Conectado. ${arquivos.length} migration(s) a aplicar.\n`);

  for (const arquivo of arquivos) {
    const sql = fs.readFileSync(path.join(dir, arquivo), "utf-8");
    process.stdout.write(`  ${arquivo} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.log("FALHOU");
      console.error(`\n  ${err.message}`);
      if (err.position) {
        const antes = sql.slice(0, Number(err.position));
        console.error(`  linha ${antes.split("\n").length} de ${arquivo}`);
      }
      if (err.hint) console.error(`  dica: ${err.hint}`);
      process.exitCode = 1;
      break;
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
