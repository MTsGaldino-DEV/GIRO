// Teste de isolamento por RLS.
//
//   node scripts/teste-rls.mjs
//
// O teste de fluxo roda como `postgres`, que tem BYPASSRLS — ele valida as
// checagens explícitas dentro das RPCs, não as políticas. Aqui a conexão troca
// para o role `authenticated`, que é o mesmo que a aplicação usa, e só então as
// políticas passam a valer.
//
// O que se quer provar: o supervisor A não enxerga a equipe do supervisor B.
// Se isso falhar, o painel vaza dados entre equipes e o e-mail semanal também.

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

/** Abre uma transação no papel `authenticated` com o uid informado. */
async function sessao(uid, fn) {
  await client.query("begin");
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

const EMAILS = [
  "rls-a@exemplo.invalido",
  "rls-b@exemplo.invalido",
  "rls-user-a@exemplo.invalido",
  "rls-user-b@exemplo.invalido",
];

async function limpar() {
  await client.query(`delete from colaboradores where matricula in (999001, 999002)`);
  await client.query(`delete from perfis where email = any($1)`, [EMAILS]);
  await client.query(`delete from auth.users where email = any($1)`, [EMAILS]);
  await client.query(`delete from supervisores where email = any($1)`, [EMAILS]);
}

async function main() {
  await client.connect();
  console.log("Teste de isolamento por RLS\n");

  await limpar();

  const criarSupervisor = async (nome, email) => {
    const { rows } = await client.query(
      `insert into supervisores (nome, email) values ($1, $2) returning id`,
      [nome, email]
    );
    return rows[0].id;
  };

  const criarPerfilSupervisor = async (email, supervisorId) => {
    const { rows } = await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1, now(), now())
       returning id`,
      [email]
    );
    const uid = rows[0].id;
    await client.query(
      `insert into perfis (id, email, nome, papel, supervisor_id)
       values ($1, $2, 'Teste RLS', 'supervisor', $3)`,
      [uid, email, supervisorId]
    );
    return uid;
  };

  const supA = await criarSupervisor("Supervisor A", EMAILS[0]);
  const supB = await criarSupervisor("Supervisor B", EMAILS[1]);
  const uidA = await criarPerfilSupervisor(EMAILS[2], supA);
  const uidB = await criarPerfilSupervisor(EMAILS[3], supB);

  const { rows: colA } = await client.query(
    `insert into colaboradores (matricula, nome, situacao, supervisor_id)
     values (999001, 'EQUIPE DO A', 'trabalhando', $1) returning id`,
    [supA]
  );
  const { rows: colB } = await client.query(
    `insert into colaboradores (matricula, nome, situacao, supervisor_id)
     values (999002, 'EQUIPE DO B', 'trabalhando', $1) returning id`,
    [supB]
  );

  const { rows: tipo } = await client.query(
    `select id from tipos_requisito where nome = 'ASO Periódico'`
  );
  const { rows: itemA } = await client.query(
    `insert into itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento)
     values ($1, $2, current_date + 30) returning id`,
    [colA[0].id, tipo[0].id]
  );

  const { rows: perfilQsms } = await client.query(
    `select id from perfis where papel = 'qsms' and ativo limit 1`
  );

  console.log("Cenário: 2 supervisores, 1 colaborador cada, 1 item na equipe do A.\n");

  // -------------------------------------------------------------------------
  console.log("Leitura de colaboradores");
  // -------------------------------------------------------------------------
  await sessao(uidA, async () => {
    const { rows } = await client.query(
      `select matricula from colaboradores where matricula in (999001, 999002)`
    );
    if (rows.length === 1 && rows[0].matricula === 999001) {
      ok("supervisor A vê só o colaborador da equipe dele");
    } else {
      erro("supervisor A vê só o seu", `veio ${JSON.stringify(rows.map((r) => r.matricula))}`);
    }
  });

  await sessao(uidB, async () => {
    const { rows } = await client.query(
      `select matricula from colaboradores where matricula in (999001, 999002)`
    );
    if (rows.length === 1 && rows[0].matricula === 999002) {
      ok("supervisor B vê só o colaborador da equipe dele");
    } else {
      erro("supervisor B vê só o seu", `veio ${JSON.stringify(rows.map((r) => r.matricula))}`);
    }
  });

  await sessao(perfilQsms[0].id, async () => {
    const { rows } = await client.query(
      `select matricula from colaboradores where matricula in (999001, 999002)`
    );
    if (rows.length === 2) ok("QSMS vê os dois");
    else erro("QSMS vê os dois", `viu ${rows.length}`);
  });

  // -------------------------------------------------------------------------
  console.log("\nView de status (security_invoker)");
  // -------------------------------------------------------------------------
  await sessao(uidA, async () => {
    const { rows } = await client.query(
      `select matricula from vw_status_colaborador where matricula in (999001, 999002)`
    );
    if (rows.length === 1 && rows[0].matricula === 999001) {
      ok("vw_status_colaborador respeita a RLS de colaboradores");
    } else {
      erro("vw_status_colaborador respeita RLS", `veio ${JSON.stringify(rows.map((r) => r.matricula))}`);
    }
  });

  await sessao(uidB, async () => {
    const { rows } = await client.query(
      `select item_id from vw_itens_abertos where item_id = $1`,
      [itemA[0].id]
    );
    if (rows.length === 0) ok("supervisor B não enxerga item da equipe do A");
    else erro("supervisor B não enxerga item do A", `enxergou ${rows.length}`);
  });

  // -------------------------------------------------------------------------
  console.log("\nEscrita");
  // -------------------------------------------------------------------------
  await sessao(uidB, async () => {
    try {
      await client.query(`select fn_propor_data($1, current_date + 5, null)`, [itemA[0].id]);
      erro("supervisor B não pode agir em item do A", "a chamada foi aceita");
    } catch (e) {
      if (e.message.includes("não é da sua equipe")) {
        ok("supervisor B barrado ao agir em item do A");
      } else {
        erro("supervisor B barrado em item do A", `outro motivo: ${e.message}`);
      }
    }
  });

  await sessao(uidA, async () => {
    const { rowCount } = await client.query(
      `update colaboradores set cargo = 'HACK' where matricula = 999001`
    );
    if (rowCount === 0) ok("supervisor não consegue editar colaborador direto");
    else erro("supervisor não consegue editar colaborador", `alterou ${rowCount} linha(s)`);
  });

  await sessao(uidA, async () => {
    try {
      await client.query(
        `insert into eventos_requisito (colaborador_id, tipo_requisito_id, data_documento)
         values ($1, $2, current_date)`,
        [colA[0].id, tipo[0].id]
      );
      erro("supervisor não pode criar evento de ASO", "o insert passou");
    } catch (e) {
      if (e.message.includes("row-level security")) ok("supervisor não pode criar evento de ASO");
      else erro("supervisor barrado ao criar evento", `outro motivo: ${e.message}`);
    }
  });

  await sessao(uidA, async () => {
    try {
      await client.query(
        `update itens_pendencia set etapa = 'concluido' where id = $1`,
        [itemA[0].id]
      );
      const { rows } = await client.query(`select etapa from itens_pendencia where id = $1`, [
        itemA[0].id,
      ]);
      // Sem política de UPDATE para supervisor, o update casa zero linhas.
      if (rows.length === 0 || rows[0].etapa !== "concluido") {
        ok("supervisor não muda etapa por UPDATE direto");
      } else {
        erro("supervisor não muda etapa por UPDATE direto", "a etapa mudou");
      }
    } catch {
      ok("supervisor não muda etapa por UPDATE direto");
    }
  });

  // -------------------------------------------------------------------------
  console.log("\nPerfis");
  // -------------------------------------------------------------------------
  await sessao(uidA, async () => {
    const { rows } = await client.query(`select email from perfis`);
    if (rows.length === 1 && rows[0].email === EMAILS[2]) {
      ok("supervisor vê só o próprio perfil");
    } else {
      erro("supervisor vê só o próprio perfil", `viu ${rows.length} linha(s)`);
    }
  });

  await limpar();

  console.log(`\n${passou} passaram, ${falhou} falharam.`);
  if (falhou > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nErro no teste:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
