// Aplica supabase/migrations/*.sql em ordem, cada arquivo numa transação.
//
// Não substitui a CLI do Supabase — existe para não depender de Docker nem de
// login interativo numa máquina Windows. Os arquivos são idempotentes
// (create or replace / if not exists / drop policy if exists), então reaplicar
// é seguro.
//
//   npm run db:push
//   npm run db:push -- --only 0003

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Defina SUPABASE_DB_URL no .env (Supabase > Settings > Database).");
  process.exit(1);
}

const filtro = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

const dir = path.join(raiz, "supabase", "migrations");
const arquivos = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => !filtro || f.includes(filtro))
  .sort();

if (arquivos.length === 0) {
  console.error(filtro ? `Nenhuma migration casa com "${filtro}".` : "Nenhuma migration encontrada.");
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
