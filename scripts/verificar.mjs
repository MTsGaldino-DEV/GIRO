// Consulta de conferência da base. Roda com service_role, então enxerga tudo.
//
//   node scripts/verificar.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const consultas = [
  ["Colaboradores por situação", `
    select situacao, count(*) from colaboradores where ativo group by 1 order by 2 desc`],
  ["Amostra de datas convertidas", `
    select matricula, nome, data_nascimento, data_admissao, polo
      from colaboradores order by matricula limit 5`],
  ["Catálogo de requisitos", `
    select nome, periodicidade_meses, exige_jejum from tipos_requisito`],
  ["Semáforo (vw_status_colaborador)", `
    select status, count(*) from vw_status_colaborador group by 1 order by 2 desc`],
  ["Resumo (fn_resumo_status)", `select * from fn_resumo_status()`],
  ["Itens em aberto por etapa", `
    select etapa, dono, count(*) from vw_itens_abertos group by 1,2 order by 3 desc`],
];

async function main() {
  await client.connect();
  for (const [titulo, sql] of consultas) {
    console.log(`\n== ${titulo}`);
    try {
      const { rows } = await client.query(sql);
      if (rows.length === 0) console.log("   (vazio)");
      else console.table(rows);
    } catch (err) {
      console.error(`   erro: ${err.message}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
