// Primeira carga do cadastro da NEO no GIRO (integração fase 1).
//
//   node --experimental-strip-types scripts/neo-primeira-carga.mjs
//     Relatório: lê a NEO e roda fn_sincronizar_neo com p_aplicar = false. NÃO grava nada.
//
//   node --experimental-strip-types scripts/neo-primeira-carga.mjs --aplicar --sim-eu-sei --backup <arquivo.json>
//     Grava o backup dos colaboradores no arquivo (fora do repositório) e só então aplica.
//
// Precisa de NEO_INTEGRACAO_URL e NEO_INTEGRACAO_SEGREDO (no .env ou no ambiente) e de
// SUPABASE_DB_URL. As migrations 0023 e 0024 têm de estar aplicadas.
//
// O que é impresso: contagens, matrículas das divergências, textos de supervisor sem
// vínculo e nomes de base. NUNCA CPF nem nome de colaborador. O arquivo de backup, sim,
// contém CPF e nome (é a cópia de segurança): por isso fica fora do repositório.
//
// Aplicar exige autorização expressa do dono do projeto e a confirmação de que o backup
// do Supabase está ativo. Depois da carga, scripts/importar-ativos.mjs vira contingência.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";
import { interpretarArgs } from "./lib/neo-carga-args.mjs";
import { ErroNeo, listarColaboradoresNeo } from "../lib/neo.ts";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Argumentos antes de tudo: uma chamada recusada não lê .env nem conecta.
const args = interpretarArgs(process.argv.slice(2), raiz);
if (!args.ok) {
  console.error(args.erro);
  process.exit(1);
}
if (args.modo === "aplicar" && fs.existsSync(args.backup)) {
  console.error(`O arquivo de backup já existe e não será sobrescrito: ${args.backup}`);
  process.exit(1);
}

carregarEnv(raiz);
if (!process.env.SUPABASE_DB_URL) {
  console.error("Defina SUPABASE_DB_URL no .env (Supabase > Settings > Database).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function contagens() {
  const { rows } = await client.query(
    `select count(*)::int as colaboradores,
            count(*) filter (where ativo)::int as ativos,
            count(neo_id)::int as com_neo_id,
            count(supervisor_id)::int as com_supervisor
       from colaboradores`
  );
  return rows[0];
}

function imprimirRelatorio(r) {
  console.log("\nRelatório da sincronização");
  console.log(`  linhas na NEO ........................ ${r.total_neo}`);
  console.log(`  ligados agora (por matrícula) ........ ${r.ligados_novos}`);
  console.log(`  atualizados .......................... ${r.atualizados}`);
  console.log(`  já iguais ............................ ${r.sem_mudanca}`);
  console.log(`  matrícula Engelmig não numérica ...... ${r.nao_numericas}`);
  console.log(`  na NEO e fora do GIRO ................ ${r.na_neo_fora_do_giro}`);
  console.log(`  no GIRO (ativos) e fora da NEO ....... ${r.no_giro_sem_neo}`);
  console.log(`  matrícula diferente (ligados) ........ ${r.matricula_diferente}`);
  console.log(`  desligados pela NEO .................. ${r.desligados_novos}`);
  console.log(`  supervisores resolvidos .............. ${r.supervisores_vinculados}`);
  console.log(`  campos alterados: ${JSON.stringify(r.campos_alterados)}`);

  console.log(`\nDivergências (${r.divergencias.length}) — nada foi ligado nem corrigido nelas:`);
  for (const d of r.divergencias) console.log(`  matrícula ${d.matricula}: ${d.motivo}`);

  console.log(`\nNomes de supervisor sem vínculo (${r.supervisores_sem_vinculo.length}):`);
  for (const s of r.supervisores_sem_vinculo) console.log(`  "${s.texto}" — ${s.quantidade} pessoa(s)`);

  console.log(`\nBases na NEO (${r.bases.length}) — o GIRO ainda não grava local a partir delas:`);
  for (const b of r.bases) console.log(`  "${b.base}" — ${b.quantidade}`);
}

async function main() {
  console.log(args.modo === "aplicar" ? "PRIMEIRA CARGA — APLICAR\n" : "Primeira carga da NEO — RELATÓRIO (não grava nada)\n");

  const linhas = await listarColaboradoresNeo();
  console.log(`NEO: ${linhas.length} cadastros lidos, listagem completa.`);

  await client.connect();
  const antes = await contagens();
  console.log(`GIRO antes: ${JSON.stringify(antes)}`);

  const { rows: seco } = await client.query(`select fn_sincronizar_neo($1::jsonb, false, 'carga') as r`, [
    JSON.stringify(linhas),
  ]);
  imprimirRelatorio(seco[0].r);

  if (args.modo !== "aplicar") {
    console.log("\nNada foi gravado. Para aplicar: --aplicar --sim-eu-sei --backup <arquivo fora do repositório>.");
    return;
  }

  // Backup de tudo o que a sincronização pode alterar (um superconjunto das linhas tocadas).
  const { rows: copia } = await client.query(
    `select id, matricula, nome, cpf, cargo, data_admissao::text as data_admissao, ativo, supervisor_id,
            neo_id, matricula_cemig, data_desligamento::text as data_desligamento,
            neo_sincronizado_em::text as neo_sincronizado_em
       from colaboradores order by matricula`
  );
  fs.mkdirSync(path.dirname(args.backup), { recursive: true });
  fs.writeFileSync(args.backup, JSON.stringify({ gerado_em: new Date().toISOString(), colaboradores: copia }, null, 1), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(`\nBackup gravado: ${copia.length} colaboradores em ${args.backup}`);

  const { rows: aplicado } = await client.query(`select fn_sincronizar_neo($1::jsonb, true, 'carga') as r`, [
    JSON.stringify(linhas),
  ]);
  const depois = await contagens();
  console.log(`\nAplicado. GIRO depois: ${JSON.stringify(depois)}`);
  console.log(
    `ligados agora: ${aplicado[0].r.ligados_novos}, atualizados: ${aplicado[0].r.atualizados}, ` +
      `divergências: ${aplicado[0].r.divergencias.length}`
  );
}

main()
  .catch((e) => {
    // ErroNeo já tem texto próprio, sem segredo; o resto mostra só a mensagem.
    console.error("\nErro:", e instanceof ErroNeo ? e.message : e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
