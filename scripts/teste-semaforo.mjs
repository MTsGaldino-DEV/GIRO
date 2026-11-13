// Teste das faixas do semáforo (migration 0017).
//
//   node scripts/teste-semaforo.mjs
//
// Decisão de 13/11: `programar` cobre de 90 a 31 dias e `ok` passa a ser mais de
// 90. Atenção (30 a 15), crítico (menos de 15), vencido e sem registro não mudam.
//
// Só existe o banco de produção. Por isso tudo roda dentro de UMA transação que
// termina em rollback: os colaboradores de teste (matrícula >= 999000) nunca
// chegam a ser gravados. A limpeza no `finally` e a conferência de resíduo são
// uma segunda garantia.

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

let passou = 0;
let falhou = 0;
const ok = (d) => { passou++; console.log(`  ok    ${d}`); };
const erro = (d, x) => { falhou++; console.log(`  FALHA ${d}${x ? `\n        ${x}` : ""}`); };

const OBSERVACAO = "teste de semáforo";

// Dias até o vencimento -> status esperado, uma pessoa por caso.
const CASOS = [
  { matricula: 999201, dias: 91, esperado: "ok", peso: 5 },
  { matricula: 999202, dias: 90, esperado: "programar", peso: 4 },
  { matricula: 999208, dias: 61, esperado: "programar", peso: 4 },
  { matricula: 999203, dias: 31, esperado: "programar", peso: 4 },
  { matricula: 999204, dias: 30, esperado: "atencao", peso: 3 },
  { matricula: 999205, dias: 14, esperado: "critico", peso: 2 },
  { matricula: 999206, dias: -1, esperado: "vencido", peso: 1 },
];
const SEM_REGISTRO = { matricula: 999207, esperado: "sem_registro", peso: 0 };
const MATRICULAS = [...CASOS.map((c) => c.matricula), SEM_REGISTRO.matricula];

async function limpar() {
  await client.query(`delete from colaboradores where matricula = any($1)`, [MATRICULAS]);
}

async function residuo() {
  const { rows } = await client.query(
    `select
       (select count(*) from colaboradores where matricula = any($1))::int as colaboradores,
       (select count(*) from eventos_requisito where observacoes = $2)::int as eventos,
       (select count(*) from auditoria_colaborador a
          join colaboradores c on c.id = a.colaborador_id
         where c.matricula = any($1))::int as auditoria`,
    [MATRICULAS, OBSERVACAO]
  );
  return rows[0];
}

const resumo = async () => {
  const { rows } = await client.query(`select * from fn_resumo_status()`);
  return Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]));
};

async function main() {
  await client.connect();
  console.log("Teste das faixas do semáforo (0017)\n");

  const antes = await residuo();
  if (Object.values(antes).some((n) => n > 0)) {
    throw new Error(`há resíduo de teste antes de começar: ${JSON.stringify(antes)}`);
  }

  await client.query("begin");
  try {
    const { rows: tipo } = await client.query(
      `select id, periodicidade_meses from tipos_requisito where nome = 'ASO Periódico'`
    );
    if (tipo.length === 0) throw new Error("tipo 'ASO Periódico' não encontrado");

    const base = await resumo();

    const criar = async (matricula) => {
      const { rows } = await client.query(
        `insert into colaboradores (matricula, nome, situacao)
         values ($1, 'TESTE SEMAFORO', 'trabalhando') returning id`,
        [matricula]
      );
      return rows[0].id;
    };

    console.log("Faixas por dias até o vencimento (ASO Periódico)");
    const ids = new Map();
    for (const caso of CASOS) {
      const id = await criar(caso.matricula);
      ids.set(caso.matricula, id);
      // data_documento = vencimento desejado - periodicidade; a view soma a
      // periodicidade de volta.
      await client.query(
        `insert into eventos_requisito
           (colaborador_id, tipo_requisito_id, data_documento, resultado, observacoes)
         values ($1, $2,
                 (public.hoje() + $3::int - ($4 || ' months')::interval)::date,
                 'apto', $5)`,
        [id, tipo[0].id, caso.dias, tipo[0].periodicidade_meses, OBSERVACAO]
      );
    }
    ids.set(SEM_REGISTRO.matricula, await criar(SEM_REGISTRO.matricula));

    const { rows: linhas } = await client.query(
      `select c.matricula, v.dias_restantes, v.status, v.peso_status
         from vw_status_colaborador v
         join colaboradores c on c.id = v.colaborador_id
        where c.matricula = any($1) and v.requisito = 'ASO Periódico'`,
      [MATRICULAS]
    );
    const porMatricula = new Map(linhas.map((l) => [l.matricula, l]));

    for (const caso of CASOS) {
      const l = porMatricula.get(caso.matricula);
      const rotulo = `${caso.dias} dias até vencer -> ${caso.esperado}`;
      if (!l) {
        erro(rotulo, "linha não encontrada na view");
      } else if (l.dias_restantes !== caso.dias) {
        erro(rotulo, `cenário montado errado: dias_restantes = ${l.dias_restantes}`);
      } else if (l.status !== caso.esperado || l.peso_status !== caso.peso) {
        erro(rotulo, `veio ${l.status} (peso ${l.peso_status}), esperado ${caso.esperado} (peso ${caso.peso})`);
      } else {
        ok(rotulo);
      }
    }

    const sr = porMatricula.get(SEM_REGISTRO.matricula);
    if (sr && sr.status === "sem_registro" && sr.peso_status === 0) {
      ok("sem evento -> sem_registro");
    } else {
      erro("sem evento -> sem_registro", JSON.stringify(sr));
    }

    console.log("\nResumo por pessoa (fn_resumo_status)");
    const depois = await resumo();
    const delta = (k) => depois[k] - base[k];
    const esperados = {
      total: 8,
      programar: 3, // 90, 61 e 31 dias
      ok: 1, // 91 dias
      atencao: 1,
      critico: 1,
      vencido: 1,
      sem_registro: 1,
    };
    for (const [k, n] of Object.entries(esperados)) {
      const rotulo = `fn_resumo_status().${k} sobe ${n} com os 8 colaboradores de teste`;
      if (delta(k) === n) ok(rotulo);
      else erro(rotulo, `subiu ${delta(k)}`);
    }
  } finally {
    await client.query("rollback");
    await limpar();
  }

  const depois = await residuo();
  if (Object.values(depois).every((n) => n === 0)) ok("nenhum dado de teste ficou no banco");
  else erro("nenhum dado de teste ficou no banco", JSON.stringify(depois));

  console.log(`\n${passou} passaram, ${falhou} falharam.`);
  if (falhou > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nErro no teste:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
