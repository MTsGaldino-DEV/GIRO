// Teste da integração com a NEO: estrutura e normalizador (migration 0023) e,
// depois da Task 3, a sincronização (migration 0024).
//
//   npm run teste:neo-sync              testa o banco como ele está (migrations aplicadas)
//   npm run teste:neo-sync -- --ensaio  aplica as migrations 0023/0024 DENTRO da transação
//                                       desfeita (duas vezes, para provar idempotência) e
//                                       testa; nada fica gravado. É o ensaio de antes de aplicar.
//
// Só existe o banco de produção. Por isso tudo roda dentro de UMA transação que
// termina em rollback: os dados de teste (matrícula >= 999000, e-mails
// @exemplo.invalido) nunca chegam a ser gravados. A limpeza no `finally` e a
// conferência de resíduo são uma segunda garantia.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const ENSAIO = process.argv.includes("--ensaio");
const MIGRATIONS = ["0023_neo_estrutura.sql", "0024_neo_sincronizacao.sql"];

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

let passou = 0;
let falhou = 0;
const ok = (d) => { passou++; console.log(`  ok    ${d}`); };
const erro = (d, x) => { falhou++; console.log(`  FALHA ${d}${x ? `\n        ${x}` : ""}`); };
const confere = (cond, d, x) => (cond ? ok(d) : erro(d, x));

const MATRICULAS = [999501, 999502, 999503, 999504, 999505, 999506];
const EMAILS = [
  "neo-sup@exemplo.invalido",
  "neo-sup-perfil@exemplo.invalido",
  "neo-qsms@exemplo.invalido",
  "neo-sem-perfil@exemplo.invalido",
  "neo-sup-outro@exemplo.invalido",
];
const MARCA_ERRO = "teste-neo-sync"; // marca as linhas de neo_sincronizacoes criadas pelo teste

let sp = 0;

/** Roda `fn` como `authenticated` com o uid informado, num savepoint sempre desfeito. */
async function sessao(uid, fn) {
  const nome = `sp_${++sp}`;
  await client.query(`savepoint ${nome}`);
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    return await fn();
  } finally {
    await client.query(`rollback to savepoint ${nome}`);
    const { rows } = await client.query("select current_user as u");
    if (rows[0].u === "authenticated") {
      throw new Error("o papel authenticated não foi desfeito ao fim da sessão");
    }
  }
}

/** Roda `fn` como um papel sem usuário (service_role ou anon), num savepoint sempre desfeito. */
async function sessaoPapel(papel, fn) {
  const nome = `sp_${++sp}`;
  await client.query(`savepoint ${nome}`);
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: papel }),
    ]);
    await client.query(`set local role ${papel}`);
    return await fn();
  } finally {
    await client.query(`rollback to savepoint ${nome}`);
    const { rows } = await client.query("select current_user as u");
    if (rows[0].u === papel) throw new Error(`o papel ${papel} não foi desfeito ao fim da sessão`);
  }
}

/** Devolve a mensagem de erro (e o código), se houver; o savepoint mantém a transação viva. */
async function tentar(sql, params) {
  await client.query("savepoint chamada");
  try {
    const r = await client.query(sql, params);
    await client.query("release savepoint chamada");
    return { ok: true, rows: r.rows, rowCount: r.rowCount, mensagem: null, codigo: null };
  } catch (e) {
    await client.query("rollback to savepoint chamada");
    return { ok: false, rows: [], rowCount: 0, mensagem: e.message, codigo: e.code };
  }
}

async function limpar() {
  await client.query(`delete from colaboradores where matricula = any($1)`, [MATRICULAS]);
  await client.query(`delete from perfis where email = any($1)`, [EMAILS]);
  await client.query(`delete from auth.users where email = any($1)`, [EMAILS]);
  await client.query(`delete from supervisores where email = any($1)`, [EMAILS]);
}

async function existeTabela(nome) {
  const { rows } = await client.query(`select to_regclass($1) is not null as existe`, [`public.${nome}`]);
  return rows[0].existe;
}

async function residuo() {
  const { rows } = await client.query(
    `select
       (select count(*) from colaboradores where matricula = any($1))::int as colaboradores,
       (select count(*) from perfis where email = any($2))::int as perfis,
       (select count(*) from auth.users where email = any($2))::int as usuarios,
       (select count(*) from supervisores where email = any($2))::int as supervisores,
       (select count(*) from auditoria_colaborador a
          join colaboradores c on c.id = a.colaborador_id
         where c.matricula = any($1))::int as auditoria`,
    [MATRICULAS, EMAILS]
  );
  const r = rows[0];
  if (await existeTabela("neo_sincronizacoes")) {
    const { rows: n } = await client.query(
      `select count(*)::int as n from neo_sincronizacoes where erro = $1`, [MARCA_ERRO]);
    r.neo_sincronizacoes = n[0].n;
  }
  if (await existeTabela("supervisor_apelidos")) {
    const { rows: n } = await client.query(
      `select count(*)::int as n from supervisor_apelidos a
        join supervisores s on s.id = a.supervisor_id where s.email = any($1)`, [EMAILS]);
    r.supervisor_apelidos = n[0].n;
  }
  return r;
}

async function aplicarMigrationsNaTransacao() {
  for (const arq of MIGRATIONS) {
    const caminho = path.join(raiz, "supabase", "migrations", arq);
    if (!fs.existsSync(caminho)) continue;
    const sql = fs.readFileSync(caminho, "utf8");
    // duas vezes: a segunda prova que a migration é idempotente
    await client.query(sql);
    await client.query(sql);
    console.log(`  (ensaio) ${arq} aplicada duas vezes na transação`);
  }
}

async function main() {
  await client.connect();
  console.log(`Teste da integração NEO${ENSAIO ? " [ENSAIO: migrations aplicadas na transação]" : ""}\n`);

  const antes = await residuo();
  if (Object.values(antes).some((n) => n > 0)) {
    throw new Error(`há resíduo de teste antes de começar: ${JSON.stringify(antes)}`);
  }

  await client.query("begin");
  try {
    if (ENSAIO) await aplicarMigrationsNaTransacao();

    // ---- fixtures -------------------------------------------------------------
    const colab = async (matricula, extra = {}) => {
      const { rows } = await client.query(
        `insert into colaboradores (matricula, nome, cargo, situacao, ativo)
         values ($1, 'TESTE NEO', $2, 'trabalhando', true) returning id`,
        [matricula, extra.cargo ?? "Cargo Teste"]
      );
      return rows[0].id;
    };
    const supervisor = async (nome, email) => {
      const { rows } = await client.query(
        `insert into supervisores (nome, email) values ($1, $2) returning id`, [nome, email]);
      return rows[0].id;
    };
    const usuario = async (email) => {
      const { rows } = await client.query(
        `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                 'authenticated', $1, now(), now()) returning id`,
        [email]
      );
      return rows[0].id;
    };

    const cA = await colab(999501);
    const cB = await colab(999502);
    const supA = await supervisor("Supervisor Neo Um (teste)", EMAILS[0]);
    const supB = await supervisor("Supervisor Neo Dois (teste)", EMAILS[4]);

    const uidSup = await usuario(EMAILS[1]);
    await client.query(
      `insert into perfis (id, email, nome, papel, supervisor_id)
       values ($1, $2, 'Teste NEO', 'supervisor', $3)`, [uidSup, EMAILS[1], supA]);
    const uidQsms = await usuario(EMAILS[2]);
    await client.query(
      `insert into perfis (id, email, nome, papel) values ($1, $2, 'Teste NEO', 'qsms')`,
      [uidQsms, EMAILS[2]]);
    const uidSemPerfil = await usuario(EMAILS[3]);

    // ======================= 0023: normalizador ===================================
    console.log("normalizador");
    const norm = async (txt) => {
      const r = await tentar(`select fn_normalizar_texto($1) as t`, [txt]);
      return r.ok ? r.rows[0].t : `ERRO: ${r.mensagem}`;
    };
    confere((await norm("  João  da  SILVA ")) === "joao da silva",
      "'  João  da  SILVA ' vira 'joao da silva'", await norm("  João  da  SILVA "));
    confere((await norm("AÇÃO é Útil")) === "acao e util", "tira acento e ç", await norm("AÇÃO é Útil"));
    confere((await norm(null)) === null, "null dá null");
    confere((await norm("   ")) === null, "só espaços dá null");
    confere((await norm("")) === null, "vazio dá null");
    confere((await norm("A\tB")) === "a b", "tabulação colapsa em um espaço", await norm("A\tB"));

    // ======================= 0023: neo_id único e colunas ========================
    console.log("\ncolunas e unicidade");
    const { rows: cols } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'colaboradores'
          and column_name in ('neo_id','matricula_cemig','data_desligamento','neo_sincronizado_em')`);
    confere(cols.length === 4, "colaboradores ganhou as 4 colunas novas", JSON.stringify(cols));

    const neoUuid = "aaaaaaaa-0000-4000-8000-000000000001";
    await client.query(`update colaboradores set neo_id = $1 where id = $2`, [neoUuid, cA]);
    const dup = await tentar(`update colaboradores set neo_id = $1 where id = $2`, [neoUuid, cB]);
    confere(!dup.ok && dup.codigo === "23505", "neo_id repetido falha com 23505",
      dup.ok ? "passou" : `${dup.codigo} ${dup.mensagem}`);
    await client.query(`update colaboradores set neo_id = null where id = $1`, [cA]);

    // ======================= 0023: apelidos de supervisor =========================
    console.log("\nfn_vincular_apelido_supervisor");
    await sessao(uidQsms, async () => {
      const f = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["  JOÃO  S. ", supA]);
      confere(f.ok, "QSMS vincula apelido", f.mensagem);
      const { rows: ap } = await client.query(
        `select supervisor_id, criado_por from supervisor_apelidos where texto_normalizado = 'joao s.'`);
      confere(ap.length === 1 && ap[0].supervisor_id === supA && ap[0].criado_por === uidQsms,
        "grava o texto normalizado, o supervisor e quem vinculou", JSON.stringify(ap));
      const g = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["joao s.", supB]);
      confere(g.ok, "vincular de novo o mesmo texto troca o supervisor (sem erro)", g.mensagem);
      const { rows: ap2 } = await client.query(
        `select supervisor_id from supervisor_apelidos where texto_normalizado = 'joao s.'`);
      confere(ap2.length === 1 && ap2[0].supervisor_id === supB, "…e continua uma linha só", JSON.stringify(ap2));
    });
    await sessao(uidSup, async () => {
      const f = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["x y", supA]);
      confere(!f.ok && f.codigo === "42501", "supervisor não vincula (42501)", f.ok ? "passou" : `${f.codigo} ${f.mensagem}`);
    });
    await sessao(uidSemPerfil, async () => {
      const f = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["x y", supA]);
      confere(!f.ok && f.codigo === "42501", "usuário sem perfil não vincula (42501)", f.ok ? "passou" : `${f.codigo}`);
    });
    await sessaoPapel("anon", async () => {
      const f = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["x y", supA]);
      confere(!f.ok && f.codigo === "42501", "anon não executa (42501)", f.ok ? "passou" : `${f.codigo}`);
    });
    await sessao(uidQsms, async () => {
      const v = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["   ", supA]);
      confere(!v.ok && /vazio|informe/i.test(v.mensagem), "texto vazio dá erro em português", v.mensagem);
      const s = await tentar(`select fn_vincular_apelido_supervisor($1, gen_random_uuid())`, ["fulano"]);
      confere(!s.ok && /supervisor/i.test(s.mensagem), "supervisor inexistente dá erro em português", s.mensagem);
    });

    // ======================= 0023: permissões nas tabelas =========================
    console.log("\npermissões");
    await sessao(uidSup, async () => {
      for (const col of ["neo_id", "matricula_cemig", "data_desligamento", "neo_sincronizado_em"]) {
        const valor = { neo_id: "gen_random_uuid()", matricula_cemig: "'e1'",
          data_desligamento: "current_date", neo_sincronizado_em: "now()" }[col];
        const u = await tentar(`update colaboradores set ${col} = ${valor} where id = $1`, [cB]);
        confere(!u.ok && u.codigo === "42501", `operador não atualiza colaboradores.${col} (42501)`,
          u.ok ? "passou" : `${u.codigo} ${u.mensagem}`);
      }
      const c = await tentar(`update colaboradores set cargo = 'Outro Cargo' where id = $1`, [cB]);
      confere(c.ok && c.rowCount === 1, "…mas continua atualizando cargo (0021 intacta)", c.mensagem);
      const i1 = await tentar(`insert into supervisor_apelidos (texto_normalizado, supervisor_id) values ('zz', $1)`, [supA]);
      confere(!i1.ok && i1.codigo === "42501", "operador não insere em supervisor_apelidos (42501)", i1.ok ? "passou" : i1.codigo);
      const i2 = await tentar(`insert into neo_sincronizacoes (origem, erro) values ('manual', $1)`, [MARCA_ERRO]);
      confere(!i2.ok && i2.codigo === "42501", "operador não insere em neo_sincronizacoes (42501)", i2.ok ? "passou" : i2.codigo);
      const d1 = await tentar(`delete from supervisor_apelidos`);
      confere(!d1.ok && d1.codigo === "42501", "operador não apaga apelidos (42501)", d1.ok ? "passou" : d1.codigo);
      const u1 = await tentar(`update supervisor_apelidos set supervisor_id = supervisor_id`);
      confere(!u1.ok && u1.codigo === "42501", "operador não altera apelidos (42501)", u1.ok ? "passou" : u1.codigo);
    });

    await client.query(
      `insert into neo_sincronizacoes (origem, erro) values ('manual', $1)`, [MARCA_ERRO]);
    await client.query(
      `insert into supervisor_apelidos (texto_normalizado, supervisor_id) values ('apelido de leitura', $1)`, [supA]);
    await sessao(uidSup, async () => {
      const a = await client.query(`select count(*)::int as n from supervisor_apelidos`);
      const s = await client.query(`select count(*)::int as n from neo_sincronizacoes where erro = $1`, [MARCA_ERRO]);
      confere(a.rows[0].n === 1, "operador lê supervisor_apelidos", `n=${a.rows[0].n}`);
      confere(s.rows[0].n === 1, "operador lê neo_sincronizacoes", `n=${s.rows[0].n}`);
    });
    await sessao(uidSemPerfil, async () => {
      const a = await client.query(`select count(*)::int as n from supervisor_apelidos`);
      const s = await client.query(`select count(*)::int as n from neo_sincronizacoes`);
      confere(a.rows[0].n === 0 && s.rows[0].n === 0, "usuário sem perfil não enxerga nenhuma linha",
        `apelidos=${a.rows[0].n} sincronizacoes=${s.rows[0].n}`);
    });
    const { rows: anonPriv } = await client.query(
      `select has_table_privilege('anon', 'public.supervisor_apelidos', 'select') as ap,
              has_table_privilege('anon', 'public.neo_sincronizacoes', 'select') as ns`);
    confere(!anonPriv[0].ap && !anonPriv[0].ns, "anon não tem select nas tabelas novas", JSON.stringify(anonPriv[0]));

    // ======================= 0023: fn_registrar_falha_neo =========================
    console.log("\nfn_registrar_falha_neo");
    await sessao(uidSup, async () => {
      const longo = "x".repeat(900);
      const f = await tentar(`select fn_registrar_falha_neo('manual', $1)`, [longo]);
      confere(f.ok, "operador registra falha", f.mensagem);
      const { rows: fal } = await client.query(
        `select length(erro)::int as n, usuario_id, resumo from neo_sincronizacoes where erro like 'xxxx%'`);
      confere(fal.length === 1 && fal[0].n === 500 && fal[0].usuario_id === uidSup && fal[0].resumo === null,
        "…truncada em 500 caracteres, com o usuário e sem resumo", JSON.stringify(fal));
    });
    await sessaoPapel("service_role", async () => {
      const f = await tentar(`select fn_registrar_falha_neo('cron', $1)`, [MARCA_ERRO]);
      confere(f.ok, "service_role (cron) registra falha", f.mensagem);
      const { rows: cron } = await client.query(
        `select usuario_id from neo_sincronizacoes where origem = 'cron' and erro = $1`, [MARCA_ERRO]);
      confere(cron.length === 1 && cron[0].usuario_id === null, "…com usuario_id nulo", JSON.stringify(cron));
    });
    await sessao(uidSemPerfil, async () => {
      const f = await tentar(`select fn_registrar_falha_neo('manual', 'x')`);
      confere(!f.ok && f.codigo === "42501", "usuário sem perfil não registra (42501)", f.ok ? "passou" : f.codigo);
    });
    await sessaoPapel("anon", async () => {
      const f = await tentar(`select fn_registrar_falha_neo('manual', 'x')`);
      confere(!f.ok && f.codigo === "42501", "anon não executa (42501)", f.ok ? "passou" : f.codigo);
    });
    const { rows: priv } = await client.query(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as servico
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('fn_normalizar_texto','fn_vincular_apelido_supervisor','fn_registrar_falha_neo')`);
    confere(priv.length === 3 && priv.every((r) => !r.anon && r.auth && r.servico),
      "as 3 funções: execute só para authenticated e service_role (anon sem execute)", JSON.stringify(priv));
    const origemRuim = await tentar(`select fn_registrar_falha_neo('qualquer', 'x')`);
    confere(!origemRuim.ok, "origem fora de cron/manual/carga é recusada", origemRuim.ok ? "passou" : "");

    // (Task 3 acrescenta aqui os casos de fn_sincronizar_neo.)
  } finally {
    await client.query("rollback");
    await limpar();
  }

  const depois = await residuo();
  confere(Object.values(depois).every((n) => n === 0),
    "nenhum dado de teste ficou no banco", JSON.stringify(depois));

  console.log(`\n${passou} passaram, ${falhou} falharam.`);
  if (falhou > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nErro no teste:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
