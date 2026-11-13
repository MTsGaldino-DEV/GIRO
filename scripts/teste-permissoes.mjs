// Teste de permissões do operador (migration 0016).
//
//   npm run teste:permissoes
//
// Decisão de 10/11: admin, QSMS e supervisor leem e gravam em toda a UEN, não
// só na própria equipe. Gestão de usuários (perfis, supervisores) e cadastro de
// tipos continuam restritos.
//
// Como o teste de RLS, a conexão troca para o role `authenticated` com o uid do
// usuário de teste, e só então as políticas passam a valer.
//
// Só existe o banco de produção. Por isso tudo roda dentro de UMA transação que
// termina em rollback: os dados de teste (matrícula >= 999000, e-mails
// @exemplo.invalido) nunca chegam a ser gravados. Cada asserção roda num
// savepoint próprio, desfeito ao fim. A limpeza no `finally` é uma segunda
// garantia, caso algo tenha sido gravado fora da transação.

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

const MATRICULAS = [999101, 999102];
const EMAILS = [
  "perm-sup-a@exemplo.invalido",
  "perm-sup-b@exemplo.invalido",
  "perm-user-a@exemplo.invalido",
  "perm-user-b@exemplo.invalido",
  "perm-sem-perfil@exemplo.invalido",
  "perm-forjado@exemplo.invalido",
];

// Funções do fluxo abertas ao operador pela 0016.
const FUNCOES_FLUXO = [
  "fn_solicitar_data",
  "fn_registrar_data_supervisor",
  "fn_agendar",
  "fn_informar_dados",
  "fn_enviar_clinica",
  "fn_registrar_desfecho",
  "fn_concluir_item",
  "fn_encerrar_inapto",
  "fn_cancelar_item",
  "fn_devolver_ao_supervisor",
  "fn_registrar_auditoria",
  "fn_registrar_aso_retroativo",
];

let sp = 0;

/**
 * Roda `fn` no papel `authenticated` com o uid informado, dentro de um
 * savepoint que é sempre desfeito. `preparo`, se vier, roda antes como
 * `postgres` (BYPASSRLS) no mesmo savepoint, para montar a etapa do item.
 */
async function sessao(uid, fn, preparo) {
  const nome = `sp_${++sp}`;
  await client.query(`savepoint ${nome}`);
  try {
    if (preparo) await preparo();
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

/**
 * Espera que a chamada passe; devolve a mensagem de erro, se houver. O
 * savepoint mantém a transação utilizável depois de um erro.
 */
async function tentar(sql, params) {
  await client.query("savepoint chamada");
  try {
    await client.query(sql, params);
    await client.query("release savepoint chamada");
    return null;
  } catch (e) {
    await client.query("rollback to savepoint chamada");
    return e.message;
  }
}

async function limpar() {
  await client.query(`delete from colaboradores where matricula = any($1)`, [MATRICULAS]);
  await client.query(`delete from perfis where email = any($1)`, [EMAILS]);
  await client.query(`delete from auth.users where email = any($1)`, [EMAILS]);
  await client.query(`delete from supervisores where email = any($1)`, [EMAILS]);
}

async function residuo() {
  const { rows } = await client.query(
    `select
       (select count(*) from colaboradores where matricula = any($1))::int as colaboradores,
       (select count(*) from perfis where email = any($2))::int as perfis,
       (select count(*) from auth.users where email = any($2))::int as usuarios,
       (select count(*) from supervisores where email = any($2))::int as supervisores`,
    [MATRICULAS, EMAILS]
  );
  return rows[0];
}

async function cenario() {
  const criarSupervisor = async (nome, email) => {
    const { rows } = await client.query(
      `insert into supervisores (nome, email) values ($1, $2) returning id`,
      [nome, email]
    );
    return rows[0].id;
  };

  const criarUsuario = async (email) => {
    const { rows } = await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1, now(), now())
       returning id`,
      [email]
    );
    return rows[0].id;
  };

  const criarPerfilSupervisor = async (email, supervisorId) => {
    const uid = await criarUsuario(email);
    await client.query(
      `insert into perfis (id, email, nome, papel, supervisor_id)
       values ($1, $2, 'Teste Permissões', 'supervisor', $3)`,
      [uid, email, supervisorId]
    );
    return uid;
  };

  const supA = await criarSupervisor("Supervisor A (teste)", EMAILS[0]);
  const supB = await criarSupervisor("Supervisor B (teste)", EMAILS[1]);
  const uidA = await criarPerfilSupervisor(EMAILS[2], supA);
  const uidB = await criarPerfilSupervisor(EMAILS[3], supB);
  const uidSemPerfil = await criarUsuario(EMAILS[4]);

  const criarColaborador = async (matricula, nome, supervisorId) => {
    const { rows } = await client.query(
      `insert into colaboradores (matricula, nome, situacao, supervisor_id)
       values ($1, $2, 'trabalhando', $3) returning id`,
      [matricula, nome, supervisorId]
    );
    return rows[0].id;
  };

  const colA = await criarColaborador(MATRICULAS[0], "EQUIPE DO A", supA);
  const colB = await criarColaborador(MATRICULAS[1], "EQUIPE DO B", supB);

  const { rows: tipo } = await client.query(
    `select id from tipos_requisito where nome = 'ASO Periódico'`
  );
  if (tipo.length === 0) throw new Error("tipo 'ASO Periódico' não encontrado");

  // Um item aberto na equipe do B, em `previsto`. As outras etapas são montadas
  // dentro de cada sessão (preparo), e desfeitas ao fim dela.
  const { rows: item } = await client.query(
    `insert into itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento)
     values ($1, $2, current_date + 30) returning id`,
    [colB, tipo[0].id]
  );

  // Evento e ausência no passado, para a leitura ter o que achar sem bloquear
  // o agendamento.
  await client.query(
    `insert into eventos_requisito (colaborador_id, tipo_requisito_id, data_documento, resultado, observacoes)
     values ($1, $2, current_date - 300, 'apto', 'teste de permissões')`,
    [colB, tipo[0].id]
  );
  await client.query(
    `insert into ausencias (colaborador_id, tipo, data_inicio, data_fim)
     values ($1, 'ferias', current_date - 400, current_date - 390)`,
    [colB]
  );

  return { supA, supB, uidA, uidB, uidSemPerfil, colA, colB, itemB: item[0].id, tipoId: tipo[0].id };
}

async function etapa(itemId) {
  const { rows } = await client.query(`select etapa from itens_pendencia where id = $1`, [itemId]);
  return rows[0]?.etapa ?? "(invisível)";
}

async function main() {
  await client.connect();
  console.log("Teste de permissões do operador (0016)\n");

  const antes = await residuo();
  if (Object.values(antes).some((n) => n > 0)) {
    throw new Error(`há resíduo de teste antes de começar: ${JSON.stringify(antes)}`);
  }

  await client.query("begin");
  try {
    const c = await cenario();
    const paraDataProposta = () =>
      client.query(
        `update itens_pendencia
            set etapa = 'data_proposta', data_liberacao_proposta = current_date + 5
          where id = $1`,
        [c.itemB]
      );

    console.log("Cenário: 2 supervisores, 1 colaborador cada, item na equipe do B.\n");

    // -----------------------------------------------------------------------
    console.log("Fluxo do ASO em outra equipe");
    // -----------------------------------------------------------------------
    await sessao(c.uidA, async () => {
      const falha = await tentar(`select fn_solicitar_data($1, 'teste', null)`, [c.itemB]);
      const e = await etapa(c.itemB);
      if (!falha && e === "data_solicitada") {
        ok("supervisor A pode solicitar data em item de colaborador da equipe B");
      } else {
        erro("supervisor A pode solicitar data em item de colaborador da equipe B", falha ?? `etapa ${e}`);
      }
    });

    await sessao(
      c.uidA,
      async () => {
        const falha =
          (await tentar(
            `select fn_agendar($1, null, 'Clínica Teste', 'Rua Teste', null, current_date + 7, '08:00', false, null)`,
            [c.itemB]
          )) ??
          (await tentar(`select fn_enviar_clinica($1, null)`, [c.itemB])) ??
          (await tentar(`select fn_registrar_desfecho($1, 'fez_apto', null)`, [c.itemB]));
        const e = await etapa(c.itemB);
        if (!falha && e === "aguardando_documento") {
          ok("supervisor A pode agendar, enviar à clínica e registrar desfecho em item da equipe B");
        } else {
          erro("supervisor A pode agendar, enviar à clínica e registrar desfecho em item da equipe B", falha ?? `etapa ${e}`);
        }
      },
      paraDataProposta
    );

    await sessao(
      c.uidA,
      async () => {
        const falha =
          (await tentar(`select fn_devolver_ao_supervisor($1, 'teste')`, [c.itemB])) ??
          (await tentar(`select fn_cancelar_item($1, 'teste')`, [c.itemB]));
        const e = await etapa(c.itemB);
        if (!falha && e === "cancelado") {
          ok("supervisor A pode cancelar e devolver item da equipe B");
        } else {
          erro("supervisor A pode cancelar e devolver item da equipe B", falha ?? `etapa ${e}`);
        }
      },
      paraDataProposta
    );

    // -----------------------------------------------------------------------
    console.log("\nLeitura e escrita direta em outra equipe");
    // -----------------------------------------------------------------------
    await sessao(c.uidA, async () => {
      const contar = async (sql) => (await client.query(sql, [c.colB])).rows[0].n;
      const visto = {
        colaboradores: await contar(`select count(*)::int n from colaboradores where id = $1`),
        eventos: await contar(`select count(*)::int n from eventos_requisito where colaborador_id = $1`),
        itens: await contar(`select count(*)::int n from itens_pendencia where colaborador_id = $1`),
        ausencias: await contar(`select count(*)::int n from ausencias where colaborador_id = $1`),
      };
      if (Object.values(visto).every((n) => n >= 1)) {
        ok("supervisor A lê colaboradores, eventos, itens e ausências da equipe B");
      } else {
        erro("supervisor A lê colaboradores, eventos, itens e ausências da equipe B", JSON.stringify(visto));
      }
    });

    await sessao(c.uidA, async () => {
      const { rows: direto } = await client.query(
        `select count(*)::int n from historico_item where item_id = $1`,
        [c.itemB]
      );
      const { rows: rpc } = await client.query(
        `select count(*)::int n from fn_historico_do_item($1)`,
        [c.itemB]
      );
      if (direto[0].n >= 1 && rpc[0].n >= 1) {
        ok("supervisor A lê histórico de item da equipe B");
      } else {
        erro("supervisor A lê histórico de item da equipe B", `tabela ${direto[0].n}, rpc ${rpc[0].n}`);
      }
    });

    await sessao(c.uidA, async () => {
      try {
        const { rowCount } = await client.query(
          `update colaboradores set cargo = 'TESTE PERMISSOES' where id = $1`,
          [c.colB]
        );
        if (rowCount === 1) ok("supervisor A atualiza campo de colaborador da equipe B");
        else erro("supervisor A atualiza campo de colaborador da equipe B", `alterou ${rowCount} linha(s)`);
      } catch (e) {
        erro("supervisor A atualiza campo de colaborador da equipe B", e.message);
      }
    });

    // -----------------------------------------------------------------------
    console.log("\nO que continua restrito");
    // -----------------------------------------------------------------------

    /** Escrita barrada: erro de RLS (42501) ou nenhuma linha afetada. */
    const barrada = async (sql, params) => {
      await client.query("savepoint escrita");
      try {
        const { rowCount } = await client.query(sql, params);
        return rowCount === 0 ? null : `alterou ${rowCount} linha(s): ${sql}`;
      } catch (e) {
        return e.code === "42501" ? null : `outro motivo (${e.code}): ${e.message}`;
      } finally {
        await client.query("rollback to savepoint escrita");
      }
    };

    await sessao(c.uidA, async () => {
      const motivo =
        (await barrada(`update perfis set papel = 'admin' where id = $1`, [c.uidA])) ??
        (await barrada(`update perfis set nome = 'HACK' where id = $1`, [c.uidB])) ??
        (await barrada(`update perfis set supervisor_id = $2 where id = $1`, [c.uidA, c.supB])) ??
        (await barrada(`delete from perfis where id = $1`, [c.uidB]));
      if (!motivo) ok("supervisor A NÃO escreve em perfis");
      else erro("supervisor A NÃO escreve em perfis", motivo);
    });

    await sessao(c.uidA, async () => {
      const motivo =
        (await barrada(`update supervisores set nome = 'HACK' where id = $1`, [c.supB])) ??
        (await barrada(`insert into supervisores (nome, email) values ('HACK', $1)`, [EMAILS[5]])) ??
        (await barrada(`delete from supervisores where id = $1`, [c.supB]));
      if (!motivo) ok("supervisor A NÃO escreve em supervisores");
      else erro("supervisor A NÃO escreve em supervisores", motivo);
    });

    await sessao(c.uidA, async () => {
      const motivo = await barrada(
        `update tipos_requisito set periodicidade_meses = periodicidade_meses where id = $1`,
        [c.tipoId]
      );
      if (!motivo) ok("supervisor A NÃO escreve em tipos_requisito");
      else erro("supervisor A NÃO escreve em tipos_requisito", motivo);
    });

    await sessao(c.uidSemPerfil, async () => {
      try {
        await client.query(`select fn_solicitar_data($1, 'teste', null)`, [c.itemB]);
        erro("usuário sem perfil ativo NÃO executa fn_solicitar_data", "a chamada foi aceita");
      } catch (e) {
        if (e.code === "42501") ok("usuário sem perfil ativo NÃO executa fn_solicitar_data");
        else erro("usuário sem perfil ativo NÃO executa fn_solicitar_data", `outro motivo (${e.code}): ${e.message}`);
      }
    });

    await sessao(c.uidSemPerfil, async () => {
      const { rows } = await client.query(
        `select count(*)::int n from colaboradores where id = $1`,
        [c.colB]
      );
      if (rows[0].n === 0) ok("usuário sem perfil ativo NÃO lê colaboradores");
      else erro("usuário sem perfil ativo NÃO lê colaboradores", `viu ${rows[0].n}`);
    });

    // -----------------------------------------------------------------------
    console.log("\nQSMS e admin seguem operando");
    // -----------------------------------------------------------------------
    for (const papel of ["qsms", "admin"]) {
      const { rows } = await client.query(
        `select id from perfis where papel = $1 and ativo limit 1`,
        [papel]
      );
      if (rows.length === 0) {
        console.log(`  (sem perfil ${papel} ativo na base; pulado)`);
        continue;
      }
      await sessao(rows[0].id, async () => {
        const falha = await tentar(`select fn_solicitar_data($1, 'teste', null)`, [c.itemB]);
        if (!falha) ok(`${papel} continua solicitando data`);
        else erro(`${papel} continua solicitando data`, falha);
      });
    }

    // -----------------------------------------------------------------------
    console.log("\nEstrutura das funções do fluxo");
    // -----------------------------------------------------------------------
    const { rows: funcoes } = await client.query(
      `select p.proname,
              p.prosecdef,
              coalesce(array_to_string(p.proconfig, ','), '') as config,
              coalesce(p.proacl::text, '') as acl,
              pg_get_functiondef(p.oid) as def
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [FUNCOES_FLUXO]
    );
    const faltando = FUNCOES_FLUXO.filter((f) => !funcoes.some((r) => r.proname === f));
    const comQsms = funcoes.filter((r) => r.def.includes("fn_e_qsms")).map((r) => r.proname);
    const semOperador = funcoes.filter((r) => !r.def.includes("public.fn_e_operador()")).map((r) => r.proname);
    if (faltando.length === 0 && comQsms.length === 0 && semOperador.length === 0) {
      ok("as 12 funções do fluxo checam fn_e_operador()");
    } else {
      erro("as 12 funções do fluxo checam fn_e_operador()",
        JSON.stringify({ faltando, comQsms, semOperador }));
    }
    const estrutura = funcoes.filter(
      (r) =>
        !r.prosecdef ||
        !r.config.includes("search_path=public") ||
        /(^|[{,])=X\//.test(r.acl) ||
        !r.acl.includes("authenticated=X/")
    );
    if (estrutura.length === 0) {
      ok("funções seguem security definer, search_path e grants de antes");
    } else {
      erro("funções seguem security definer, search_path e grants de antes",
        JSON.stringify(estrutura.map((r) => ({ f: r.proname, secdef: r.prosecdef, config: r.config, acl: r.acl }))));
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
