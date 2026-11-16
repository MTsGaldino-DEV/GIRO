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

const MATRICULAS = [999501, 999502, 999511, 999512, 999513, 999514, 999515, 999516, 999517, 999518, 999520, 999521];
const EMAILS = [
  "neo-sup@exemplo.invalido",
  "neo-sup-perfil@exemplo.invalido",
  "neo-qsms@exemplo.invalido",
  "neo-sem-perfil@exemplo.invalido",
  "neo-sup-outro@exemplo.invalido",
  "neo-joao@exemplo.invalido",
];
const MARCA_ERRO = "teste-neo-sync"; // marca as linhas de neo_sincronizacoes criadas pelo teste

// Fixtures do teste de desempenho (1100 pessoas ligadas): fora do intervalo das demais.
const FAIXA_DESEMPENHO = [1000001, 1001100];

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
  await client.query(`delete from colaboradores where matricula = any($1) or matricula between $2 and $3`,
    [MATRICULAS, FAIXA_DESEMPENHO[0], FAIXA_DESEMPENHO[1]]);
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
       (select count(*) from colaboradores where matricula = any($1) or matricula between $3 and $4)::int as colaboradores,
       (select count(*) from perfis where email = any($2))::int as perfis,
       (select count(*) from auth.users where email = any($2))::int as usuarios,
       (select count(*) from supervisores where email = any($2))::int as supervisores,
       (select count(*) from auditoria_colaborador a
          join colaboradores c on c.id = a.colaborador_id
         where c.matricula = any($1))::int as auditoria`,
    [MATRICULAS, EMAILS, FAIXA_DESEMPENHO[0], FAIXA_DESEMPENHO[1]]
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
    // Revisão final (I4): quem grava a falha é o servidor do GIRO com a service role; o operador
    // não chama a função direto (texto livre forjado). O usuário vai no parâmetro p_usuario_id.
    await sessao(uidSup, async () => {
      const f = await tentar(`select fn_registrar_falha_neo('manual', 'x')`);
      confere(!f.ok && f.codigo === "42501", "operador não executa fn_registrar_falha_neo direto (42501)", f.ok ? "passou" : f.codigo);
    });
    await sessaoPapel("service_role", async () => {
      const longo = "x".repeat(900);
      const f = await tentar(`select fn_registrar_falha_neo('manual', $1, $2::uuid)`, [longo, uidSup]);
      confere(f.ok, "service_role registra falha em nome de um usuário", f.mensagem);
      const { rows: fal } = await client.query(
        `select length(erro)::int as n, usuario_id, resumo from neo_sincronizacoes where erro like 'xxxx%'`);
      confere(fal.length === 1 && fal[0].n === 500 && fal[0].usuario_id === uidSup && fal[0].resumo === null,
        "…truncada em 500 caracteres, com o usuário e sem resumo", JSON.stringify(fal));
      const g = await tentar(`select fn_registrar_falha_neo('cron', $1)`, [MARCA_ERRO]);
      confere(g.ok, "service_role (cron) registra falha", g.mensagem);
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
    const permPriv = (nome) => priv.find((r) => r.proname === nome);
    confere(priv.length === 3 && priv.every((r) => !r.anon && r.servico) &&
            permPriv("fn_normalizar_texto").auth && permPriv("fn_vincular_apelido_supervisor").auth &&
            !permPriv("fn_registrar_falha_neo").auth,
      "execute: anon nunca; authenticated só no normalizador e no vínculo de apelido; fn_registrar_falha_neo só service_role", JSON.stringify(priv));
    const origemRuim = await tentar(`select fn_registrar_falha_neo('qualquer', 'x')`);
    confere(!origemRuim.ok, "origem fora de cron/manual/carga é recusada", origemRuim.ok ? "passou" : "");

    // ======================= 0024: fn_sincronizar_neo =============================
    console.log("\nfn_sincronizar_neo");
    const SUP_NOME = "João da Silva Neotest";   // nome distintivo: nunca casa com supervisor real
    const supJoao = await supervisor(SUP_NOME, "neo-joao@exemplo.invalido");

    const N = (n) => `bbbbbbbb-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
    const insere = async (matricula, extra = {}) => {
      const { rows } = await client.query(
        `insert into colaboradores (matricula, nome, cargo, cpf, situacao, ativo, neo_id,
                                    data_desligamento, supervisor_id)
         values ($1, $2, $3, $4, 'trabalhando', true, $5, $6, $7) returning id`,
        [matricula, extra.nome ?? "TESTE NEO", extra.cargo ?? "Cargo Teste", extra.cpf ?? null,
         extra.neo ?? null, extra.deslig ?? null, extra.sup ?? null]);
      return rows[0].id;
    };
    const p1 = await insere(999511, { cargo: "Cargo P1" });                          // liga e preenche
    const p2 = await insere(999512, { cpf: "00000000272" });                         // CPF diferente
    const p3 = await insere(999513, { neo: N(90) });                                 // já ligada a outro
    const p4 = await insere(999514, { cargo: "Eletricista", nome: "TESTE NEO P4",
                                      neo: N(4), deslig: "2026-01-01" });            // NEO manda vazio
    const p5 = await insere(999515);                                                 // supervisor casa pelo nome
    const p6 = await insere(999516, { sup: supB });                                  // supervisor sem casamento
    const p7 = await insere(999517, { neo: N(7) });                                  // desligada na NEO
    const p8 = await insere(999518, { neo: N(8) });                                  // matrícula diferente na NEO
    const p9 = await insere(999520);                                                 // sem CPF e nome diferente: não liga
    const p10 = await insere(999521);                                                // matrícula repetida na NEO: não liga
    const todos = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10];

    const L = (n, extra = {}) => ({
      id: N(n), nome: "TESTE NEO", cpf: null, matricula_cemig: null, matricula_engelmig: null,
      cargo: null, supervisor: null, base: null, data_admissao: null, data_desligamento: null,
      ativo: true, atualizado_em: "2026-11-16T10:00:00Z", ...extra,
    });
    const CPF_P1 = "00000000191";
    const linhas = [
      L(1, { nome: "Teste Neo", cpf: CPF_P1, matricula_cemig: "e999511", matricula_engelmig: "999511",
             cargo: "Novo Cargo P1", base: "Base Teste A", data_admissao: "2020-05-04",
             data_desligamento: "2026-10-01" }),
      L(2, { nome: "OUTRO NOME", cpf: "00000000353", matricula_engelmig: "999512" }),
      L(3, { matricula_engelmig: "999513" }),
      L(4, { nome: "", cargo: null, matricula_engelmig: "999514", data_desligamento: null }),
      L(5, { nome: "Teste Neo", matricula_engelmig: "999515", base: "Base Teste A",
             supervisor: "  JOÃO  da Silva Neotest " }),
      L(6, { matricula_engelmig: "999516", supervisor: "Zé Ninguém Neotest" }),
      L(7, { matricula_engelmig: "999517", ativo: false, data_desligamento: "2026-11-01" }),
      L(8, { matricula_engelmig: "999519" }),
      L(9, { matricula_engelmig: "e272662" }),
      L(10, { matricula_engelmig: null }),
      L(11, { matricula_engelmig: "" }),
      L(12, { matricula_engelmig: "999999" }),
      L(13, { nome: "OUTRA PESSOA TOTALMENTE", matricula_engelmig: "999520" }),
      L(14, { matricula_engelmig: "999521" }),
      L(15, { matricula_engelmig: "0999521" }),
    ];

    // Datas viram texto na consulta para não depender do fuso do driver.
    const foto = async () => {
      const { rows } = await client.query(
        `select c.id, c.neo_id, c.nome, c.cpf, c.cargo, c.data_admissao::text as adm, c.matricula_cemig,
                c.ativo, c.data_desligamento::text as deslig, c.supervisor_id,
                c.neo_sincronizado_em::text as sinc, c.atualizado_em::text as atual
           from colaboradores c where c.id = any($1) order by c.matricula`, [todos]);
      const { rows: a } = await client.query(
        `select count(*)::int as n from auditoria_colaborador where colaborador_id = any($1)`, [todos]);
      const { rows: ns } = await client.query(`select count(*)::int as n from neo_sincronizacoes`);
      return JSON.stringify({ colaboradores: rows, auditoria: a[0].n, sincronizacoes: ns[0].n });
    };
    const chamar = async (ls, aplicar, origem = "carga", usuario = null) => {
      const r = await tentar(`select fn_sincronizar_neo($1::jsonb, $2, $3, $4::uuid) as r`,
        [JSON.stringify(ls), aplicar, origem, usuario]);
      if (!r.ok) throw new Error(`fn_sincronizar_neo falhou: ${r.codigo} ${r.mensagem}`);
      return r.rows[0].r;
    };
    const um = async (id) => (await client.query(
      `select *, data_desligamento::text as deslig from colaboradores where id = $1`, [id])).rows[0];
    const auditoria = async (id) => (await client.query(
      `select campo, valor_anterior, valor_novo, origem, acao, entidade, usuario_id
         from auditoria_colaborador where colaborador_id = $1 and origem = 'Sincronização NEO' order by campo`,
      [id])).rows;

    // Revisão final (I1): cron e botão não fazem a primeira carga. Apaga (nesta transação desfeita)
    // qualquer carga real já registrada, para provar a trava.
    await client.query(`delete from neo_sincronizacoes where origem = 'carga'`);
    await sessaoPapel("service_role", async () => {
      for (const origem of ["manual", "cron"]) {
        const r = await tentar(`select fn_sincronizar_neo($1::jsonb, true, $2) as r`, [JSON.stringify(linhas), origem]);
        confere(!r.ok && r.codigo === "55000" && /primeira carga/i.test(r.mensagem),
          `aplicar com origem '${origem}' antes da primeira carga é recusado (55000)`, r.ok ? "passou" : `${r.codigo} ${r.mensagem}`);
      }
      const seco0 = await tentar(`select fn_sincronizar_neo($1::jsonb, false, 'manual') as r`, [JSON.stringify(linhas)]);
      confere(seco0.ok, "…mas o relatório (p_aplicar=false) vale com qualquer origem", seco0.mensagem);
    });
    await sessaoPapel("service_role", async () => {
      // (f) p_aplicar = false não grava nada e devolve o relatório que a aplicação devolveria
      const antes = await foto();
      const seco = await chamar(linhas, false);
      confere((await foto()) === antes, "(f) p_aplicar=false não altera linha, auditoria nem neo_sincronizacoes");

      const r1 = await chamar(linhas, true, "carga");
      confere(JSON.stringify(r1) === JSON.stringify(seco),
        "(f) o relatório do ensaio é idêntico ao da aplicação", `${JSON.stringify(seco)}\n${JSON.stringify(r1)}`);

      // contagens do relatório
      confere(r1.total_neo === 15, "total_neo", String(r1.total_neo));
      confere(r1.nao_numericas === 3, "(c) matrícula 'e272662', nula e vazia: 3 não numéricas", String(r1.nao_numericas));
      confere(r1.na_neo_fora_do_giro === 1, "linha da NEO sem pessoa no GIRO não cria ninguém", String(r1.na_neo_fora_do_giro));
      confere(r1.ligados_novos === 3, "ligados_novos = 3 (P1, P5, P6)", String(r1.ligados_novos));
      confere(r1.atualizados === 4, "atualizados = 4 (P1, P4, P5, P7)", String(r1.atualizados));
      confere(r1.sem_mudanca === 1, "sem_mudanca = 1 (P8, ligada e igual)", String(r1.sem_mudanca));
      confere(r1.matricula_diferente === 1, "matricula_diferente = 1 (P8)", String(r1.matricula_diferente));
      confere(r1.desligados_novos === 1, "(h) desligados_novos = 1", String(r1.desligados_novos));
      confere(r1.supervisores_vinculados === 1, "supervisores_vinculados = 1", String(r1.supervisores_vinculados));
      const dv = (r1.divergencias ?? []).map((d) => `${d.matricula}:${d.motivo}`).sort();
      confere(JSON.stringify(dv) === JSON.stringify(["999512:cpf_diferente", "999513:ja_ligada_a_outro", "999520:nome_diferente", "999521:matricula_duplicada_na_neo"]),
        "(b) divergências: cpf_diferente, ja_ligada_a_outro, nome_diferente (sem CPF para confirmar) e matrícula duplicada no lote", JSON.stringify(dv));
      const d9 = await um(p9), d10 = await um(p10);
      confere(d9.neo_id === null && d9.nome === "TESTE NEO", "(I2) sem CPF nos dois lados e nome diferente: não liga nem renomeia", JSON.stringify(d9));
      confere(d10.neo_id === null, "(I5) matrícula 999521 e 0999521 na mesma lista: nenhuma liga, a pessoa fica como está", JSON.stringify(d10));
      confere(JSON.stringify(r1.bases) === JSON.stringify([{ base: "Base Teste A", quantidade: 2 }]),
        "bases listadas com quantidade (não grava local)", JSON.stringify(r1.bases));
      confere(r1.campos_alterados.cargo === 1 && r1.campos_alterados.data_desligamento === 3 &&
              r1.campos_alterados.ativo === 1 && r1.campos_alterados.supervisor_id === 1,
        "campos_alterados por campo", JSON.stringify(r1.campos_alterados));
      confere(typeof r1.no_giro_sem_neo === "number", "no_giro_sem_neo é número", String(r1.no_giro_sem_neo));

      // (a) liga por matrícula e preenche as colunas novas
      const a = await um(p1);
      confere(a.neo_id === N(1) && a.matricula_cemig === "e999511" && a.deslig === "2026-10-01",
        "(a) liga P1 por matrícula: neo_id, matricula_cemig e data_desligamento", JSON.stringify(a));
      confere(a.cargo === "Novo Cargo P1" && a.cpf === CPF_P1 && a.nome === "Teste Neo" && a.neo_sincronizado_em !== null,
        "(a) …e atualiza cargo, cpf, nome e neo_sincronizado_em", JSON.stringify(a));
      confere(a.matricula === 999511, "(a) a matrícula do GIRO não muda");

      // (b) divergência: nenhuma ligação, nada corrigido
      const b2 = await um(p2), b3 = await um(p3);
      confere(b2.neo_id === null && b2.cpf === "00000000272" && b2.nome === "TESTE NEO",
        "(b) CPF diferente: não liga e não corrige", JSON.stringify(b2));
      confere(b3.neo_id === N(90), "(b) já ligada a outro: mantém o neo_id antigo", String(b3.neo_id));

      // (d) vazio da NEO não apaga; data de desligamento nula limpa
      const d = await um(p4);
      confere(d.cargo === "Eletricista" && d.nome === "TESTE NEO P4" && d.data_desligamento === null,
        "(d) cargo e nome vazios não apagam; data_desligamento nula limpa a data", JSON.stringify(d));
      const ad = (await auditoria(p4)).find((x) => x.campo === "desligamento");
      confere(ad && ad.valor_anterior === "2026-01-01" && ad.valor_novo === null,
        "(d) a limpeza da data fica na auditoria", JSON.stringify(ad));

      // (e) supervisor: casa por nome normalizado; sem casamento não mexe e vai ao relatório
      const e5 = await um(p5), e6 = await um(p6);
      confere(e5.supervisor_id === supJoao, "(e) '  JOÃO  da Silva Neotest ' casa com o supervisor", String(e5.supervisor_id));
      confere(e6.supervisor_id === supB, "(e) texto sem casamento não mexe no vínculo atual", String(e6.supervisor_id));
      confere(JSON.stringify(r1.supervisores_sem_vinculo) === JSON.stringify([{ texto: "Zé Ninguém Neotest", quantidade: 1 }]),
        "(e) o nome sem casamento aparece em supervisores_sem_vinculo", JSON.stringify(r1.supervisores_sem_vinculo));

      // (h) ativo=false da NEO desativa
      const h = await um(p7);
      confere(h.ativo === false, "(h) ativo=false da NEO desativa a pessoa ligada");

      // auditoria da sincronização
      const aud1 = await auditoria(p1);
      confere(aud1.length === 7 && aud1.every((x) => x.acao === "alterou" && x.entidade === "colaborador"),
        "auditoria de P1: ligar + 6 campos, todas com origem 'Sincronização NEO'", JSON.stringify(aud1.map((x) => x.campo)));
      confere(aud1.some((x) => x.campo === "neo_id" && x.valor_novo === N(1)), "ligar grava a linha 'neo_id'");
      confere((await auditoria(p8)).length === 0, "pessoa sem mudança não gera auditoria");
      confere((await auditoria(p2)).length === 0 && (await auditoria(p3)).length === 0 &&
              (await auditoria(p9)).length === 0 && (await auditoria(p10)).length === 0,
        "divergências não geram auditoria");
      const { rows: ns } = await client.query(
        `select origem, usuario_id, resumo from neo_sincronizacoes where origem = 'carga' and resumo is not null`);
      // (now() é o mesmo em toda a transação do teste: por isso se filtra, não se ordena)
      confere(ns.length === 1 && ns[0].origem === "carga" && ns[0].usuario_id === null && ns[0].resumo?.total_neo === 15,
        "a aplicação grava uma linha em neo_sincronizacoes com o resumo", JSON.stringify(ns[0]).slice(0, 120));

      // (g) segunda aplicação seguida
      const meio = JSON.parse(await foto());
      const r2 = await chamar(linhas, true, "carga");
      const depois = JSON.parse(await foto());
      confere(r2.atualizados === 0 && r2.ligados_novos === 0 && r2.desligados_novos === 0,
        "(g) segunda aplicação: atualizados = 0, ligados_novos = 0, desligados_novos = 0",
        JSON.stringify({ a: r2.atualizados, l: r2.ligados_novos, d: r2.desligados_novos }));
      confere(r2.sem_mudanca === 6, "(g) …e sem_mudanca = 6", String(r2.sem_mudanca));
      confere(JSON.stringify(depois.colaboradores) === JSON.stringify(meio.colaboradores) &&
              depois.auditoria === meio.auditoria,
        "(g) …nenhuma linha de colaborador mexe e nenhuma auditoria nova");

      // (j) o relatório não tem CPF nem nome de colaborador
      const texto = JSON.stringify(r1);
      confere(!texto.includes(CPF_P1) && !texto.includes("00000000353") && !texto.includes("TESTE NEO") &&
              !texto.includes("OUTRO NOME"),
        "(j) o relatório não contém CPF nem nome de colaborador");

      // entradas inválidas
      const o = await tentar(`select fn_sincronizar_neo('[]'::jsonb, false, 'qualquer')`);
      confere(!o.ok && /origem/i.test(o.mensagem), "origem inválida é recusada", o.mensagem);
      const l = await tentar(`select fn_sincronizar_neo('{"a":1}'::jsonb, false, 'manual')`);
      confere(!l.ok && /lista/i.test(l.mensagem), "p_linhas que não é lista é recusado", l.mensagem);
      const vazia = await chamar([], false, "manual");
      confere(vazia.total_neo === 0 && vazia.ligados_novos === 0, "lista vazia dá relatório zerado");
    });

    // A sessão acima foi desfeita (savepoint), inclusive a carga que ela aplicou: registra uma carga
    // concluída para as aplicações 'manual' abaixo passarem pela trava da primeira carga.
    await client.query(`insert into neo_sincronizacoes (origem, resumo) values ('carga', '{}'::jsonb)`);

    // vínculo por apelido: o QSMS vincula com a sessão dele; a sincronização roda com a service role
    // e recebe o usuário em p_usuario_id (a ação do app confere o operador antes).
    await sessao(uidQsms, async () => {
      const v = await tentar(`select fn_vincular_apelido_supervisor($1, $2)`, ["zé ninguém neotest", supJoao]);
      confere(v.ok, "QSMS vincula o nome sem casamento a um supervisor", v.mensagem);
      const apelido = await client.query(`select count(*)::int as n from supervisor_apelidos where texto_normalizado = 'ze ninguem neotest'`);
      confere(apelido.rows[0].n === 1, "…e o apelido fica guardado normalizado", String(apelido.rows[0].n));
    });
    await sessaoPapel("service_role", async () => {
      await client.query(`insert into supervisor_apelidos (texto_normalizado, supervisor_id) values ('ze ninguem neotest', $1)`, [supJoao]);
      const r = await chamar([linhas[5]], true, "manual", uidQsms);
      confere(r.supervisores_vinculados === 1 && r.supervisores_sem_vinculo.length === 0,
        "(e) o apelido resolve o nome sem casamento", JSON.stringify(r));
      const c = (await client.query(`select supervisor_id from colaboradores where id = $1`, [p6])).rows[0];
      confere(c.supervisor_id === supJoao, "(e) …e o vínculo da pessoa muda", String(c.supervisor_id));
      const { rows: ns } = await client.query(
        `select origem, usuario_id from neo_sincronizacoes where origem = 'manual' and resumo is not null`);
      confere(ns.length === 1 && ns[0].usuario_id === uidQsms,
        "a aplicação manual grava origem e o usuário recebido em p_usuario_id", JSON.stringify(ns[0]));
      const au = await client.query(
        `select usuario_id from auditoria_colaborador where colaborador_id = $1 and origem = 'Sincronização NEO' and campo = 'supervisor'`, [p6]);
      confere(au.rows.length === 1 && au.rows[0].usuario_id === uidQsms, "…e a auditoria leva esse usuário", JSON.stringify(au.rows));
    });

    // (i) quem não pode, não executa
    await sessao(uidSup, async () => {
      const r = await tentar(`select fn_sincronizar_neo('[]'::jsonb, false, 'manual')`);
      confere(!r.ok && r.codigo === "42501", "(I4) operador não executa fn_sincronizar_neo direto (linhas forjadas) (42501)", r.ok ? "passou" : `${r.codigo}`);
    });
    await sessao(uidSemPerfil, async () => {
      const r = await tentar(`select fn_sincronizar_neo('[]'::jsonb, false, 'manual')`);
      confere(!r.ok && r.codigo === "42501", "(i) usuário sem perfil não executa (42501)", r.ok ? "passou" : `${r.codigo}`);
    });
    await sessaoPapel("anon", async () => {
      const r = await tentar(`select fn_sincronizar_neo('[]'::jsonb, false, 'manual')`);
      confere(!r.ok && r.codigo === "42501", "(i) anon não executa (42501)", r.ok ? "passou" : `${r.codigo}`);
    });
    // ======================= desempenho =========================================
    // A listagem real tem ~1100 pessoas; este teste cria 1100 fixtures ligadas e mede a
    // aplicação com a service role (cron e botão), com folga sobre o limite de 60 s da rota.
    console.log("\ndesempenho");
    await client.query(
      `insert into colaboradores (matricula, nome, cargo, situacao, ativo, neo_id)
       select g, 'TESTE NEO PERF', 'Cargo Teste', 'trabalhando', true, gen_random_uuid()
         from generate_series($1::int, $2::int) g`, FAIXA_DESEMPENHO);
    const { rows: perfLinhas } = await client.query(
      `select jsonb_agg(jsonb_build_object(
                'id', neo_id, 'nome', 'TESTE NEO PERF', 'matricula_engelmig', matricula::text,
                'cargo', 'Cargo Novo', 'supervisor', 'Supervisor Neo Um (teste)', 'ativo', true,
                'atualizado_em', '2026-11-16T10:00:00Z')) as l
         from colaboradores where matricula between $1 and $2`, FAIXA_DESEMPENHO);
    await sessaoPapel("service_role", async () => {
      const t0 = Date.now();
      const r = await tentar(`select fn_sincronizar_neo($1::jsonb, true, 'manual', $2::uuid) as r`, [JSON.stringify(perfLinhas[0].l), uidSup]);
      const ms = Date.now() - t0;
      confere(r.ok && r.rows[0].r.atualizados === 1100, `1100 pessoas aplicadas: ${ms} ms`,
        r.ok ? String(r.rows[0].r.atualizados) : r.mensagem);
      confere(ms < 10000, "…com folga (menos de 10 s)", `${ms} ms`);
    });

    const { rows: pr } = await client.query(
      `select has_function_privilege('anon', 'public.fn_sincronizar_neo(jsonb, boolean, text, uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.fn_sincronizar_neo(jsonb, boolean, text, uuid)', 'execute') as auth,
              has_function_privilege('service_role', 'public.fn_sincronizar_neo(jsonb, boolean, text, uuid)', 'execute') as servico`);
    confere(!pr[0].anon && !pr[0].auth && pr[0].servico,
      "fn_sincronizar_neo: execute só para service_role", JSON.stringify(pr[0]));
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
