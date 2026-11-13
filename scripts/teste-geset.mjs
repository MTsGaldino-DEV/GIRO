// Teste da marca de lançamento no GESET (migration 0019).
//
//   npm run teste:geset
//
// Decisão de 13/11 (spec 2026-11-13-telas-e-fluxo, seção 8): o GIRO guarda se
// o ASO/AVP já foi lançado no GESET. A carga inicial marca como já lançado o
// último evento apto de cada colaborador × requisito com vencimento a mais de
// 90 dias; o resto fica pendente e aparece em vw_pendencias_geset.
//
// Só existe o banco de produção. Por isso tudo roda dentro de UMA transação que
// termina em rollback: os dados de teste (matrícula >= 999000, e-mails
// @exemplo.invalido) nunca chegam a ser gravados. A carga é exercida sobre
// fixtures; nas linhas reais o teste só lê contagens. A limpeza no `finally` e
// a conferência de resíduo são uma segunda garantia.

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
const confere = (cond, d, x) => (cond ? ok(d) : erro(d, x));

const MATRICULAS = [999301, 999302, 999303, 999304, 999305, 999306, 999307];
const EMAILS = [
  "geset-sup@exemplo.invalido",
  "geset-sup-perfil@exemplo.invalido",
  "geset-qsms@exemplo.invalido",
  "geset-sem-perfil@exemplo.invalido",
];
const OBSERVACAO = "teste de geset";
const COLUNAS_VIEW = [
  "evento_id", "colaborador_id", "matricula", "nome", "cargo", "requisito",
  "data_documento", "data_vencimento", "dias_restantes", "foto_url", "supervisor_nome",
];

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

/** Devolve a mensagem de erro (e o código), se houver; o savepoint mantém a transação viva. */
async function tentar(sql, params) {
  await client.query("savepoint chamada");
  try {
    await client.query(sql, params);
    await client.query("release savepoint chamada");
    return null;
  } catch (e) {
    await client.query("rollback to savepoint chamada");
    return { mensagem: e.message, codigo: e.code };
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
       (select count(*) from eventos_requisito where observacoes = $3)::int as eventos,
       (select count(*) from perfis where email = any($2))::int as perfis,
       (select count(*) from auth.users where email = any($2))::int as usuarios,
       (select count(*) from supervisores where email = any($2))::int as supervisores,
       (select count(*) from auditoria_colaborador a
          join colaboradores c on c.id = a.colaborador_id
         where c.matricula = any($1))::int as auditoria`,
    [MATRICULAS, EMAILS, OBSERVACAO]
  );
  return rows[0];
}

const contaCarga = async () => {
  const { rows } = await client.query(
    `select count(*)::int as n from auditoria_colaborador where origem = 'carga inicial'`
  );
  return rows[0].n;
};

async function main() {
  await client.connect();
  console.log("Teste da marca de lançamento no GESET (0019)\n");

  const antes = await residuo().catch((e) => {
    throw new Error(`não foi possível conferir resíduo (migration 0019 aplicada?): ${e.message}`);
  });
  if (Object.values(antes).some((n) => n > 0)) {
    throw new Error(`há resíduo de teste antes de começar: ${JSON.stringify(antes)}`);
  }

  await client.query("begin");
  try {
    const { rows: tipos } = await client.query(
      `select id, nome, periodicidade_meses from tipos_requisito
        where nome in ('ASO Periódico', 'Avaliação Psicossocial (AVP)')`
    );
    const aso = tipos.find((t) => t.nome === "ASO Periódico");
    const avp = tipos.find((t) => t.nome === "Avaliação Psicossocial (AVP)");
    if (!aso || !avp) throw new Error("tipos ASO/AVP não encontrados");

    // ---- cenário -----------------------------------------------------------
    const colab = async (matricula, extra = {}) => {
      const { rows } = await client.query(
        `insert into colaboradores (matricula, nome, cargo, situacao, ativo, exige_avp)
         values ($1, 'TESTE GESET', 'Cargo Teste', 'trabalhando', $2, $3) returning id`,
        [matricula, extra.ativo ?? true, extra.exigeAvp ?? false]
      );
      return rows[0].id;
    };
    // `dias` = dias até o vencimento; a view soma a periodicidade de volta.
    const evento = async (colabId, tipo, dias, resultado = "apto") => {
      const { rows } = await client.query(
        `insert into eventos_requisito
           (colaborador_id, tipo_requisito_id, data_documento, resultado, observacoes)
         values ($1, $2, (public.hoje() + $3::int - ($4 || ' months')::interval)::date, $5, $6)
         returning id`,
        [colabId, tipo.id, dias, tipo.periodicidade_meses, resultado, OBSERVACAO]
      );
      return rows[0].id;
    };

    const cA = await colab(999301);                         // +91: carga lança
    const evA = await evento(cA, aso, 91);
    const cB = await colab(999302);                         // +90: fica pendente
    const evB = await evento(cB, aso, 90);
    const cC = await colab(999303);                         // dois eventos: o último lança, o anterior não
    const evCantigo = await evento(cC, aso, -250);
    const evCultimo = await evento(cC, aso, 120);
    const cD = await colab(999304);                         // anterior vencido, último a 20 dias
    const evDantigo = await evento(cD, aso, -300);
    const evDultimo = await evento(cD, aso, 20);
    const cE = await colab(999305);                         // inapto: nunca entra
    const evE = await evento(cE, aso, 200, "inapto");
    const cF = await colab(999306, { ativo: false });       // desligado: nunca entra
    const evF = await evento(cF, aso, 200);
    const cG = await colab(999307, { exigeAvp: true });     // AVP também: +120 lança, ASO +10 pendente
    const evGavp = await evento(cG, avp, 120);
    const evGaso = await evento(cG, aso, 10);

    // Usuários: supervisor, qsms e um sem perfil.
    const { rows: s } = await client.query(
      `insert into supervisores (nome, email) values ('Supervisor GESET (teste)', $1) returning id`,
      [EMAILS[0]]
    );
    const usuario = async (email) => {
      const { rows } = await client.query(
        `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                 'authenticated', $1, now(), now()) returning id`,
        [email]
      );
      return rows[0].id;
    };
    const uidSup = await usuario(EMAILS[1]);
    await client.query(
      `insert into perfis (id, email, nome, papel, supervisor_id)
       values ($1, $2, 'Teste GESET', 'supervisor', $3)`,
      [uidSup, EMAILS[1], s[0].id]
    );
    const uidQsms = await usuario(EMAILS[2]);
    await client.query(
      `insert into perfis (id, email, nome, papel) values ($1, $2, 'Teste GESET', 'qsms')`,
      [uidQsms, EMAILS[2]]
    );
    const uidSemPerfil = await usuario(EMAILS[3]);

    const estado = async (id) => {
      const { rows } = await client.query(
        `select geset_lancado_em, geset_lancado_por from eventos_requisito where id = $1`,
        [id]
      );
      return rows[0];
    };
    const pendentesDaView = async () => {
      const { rows } = await client.query(
        `select evento_id from vw_pendencias_geset where matricula = any($1)`,
        [MATRICULAS]
      );
      return new Set(rows.map((r) => r.evento_id));
    };

    // ---- carga inicial -----------------------------------------------------
    console.log("Carga inicial");
    const cargaAntes = await contaCarga();
    await client.query(`select public.fn_carga_inicial_geset()`);

    const lancados = [[evA, "ASO +91"], [evCultimo, "último evento (+120) de quem tem dois"], [evGavp, "AVP +120"]];
    for (const [id, rotulo] of lancados) {
      const e = await estado(id);
      confere(e.geset_lancado_em && e.geset_lancado_por === null,
        `carga: ${rotulo} fica lançado, sem quem marcou`,
        JSON.stringify(e));
    }
    const naoLancados = [
      [evB, "vencimento em 90 dias"], [evCantigo, "evento anterior (não o último)"],
      [evDantigo, "evento anterior vencido"], [evDultimo, "último a 20 dias"],
      [evE, "inapto"], [evF, "colaborador desligado"], [evGaso, "ASO a 10 dias"],
    ];
    for (const [id, rotulo] of naoLancados) {
      const e = await estado(id);
      confere(e.geset_lancado_em === null, `carga: ${rotulo} segue pendente`, JSON.stringify(e));
    }

    const { rows: aud } = await client.query(
      `select entidade_id, usuario_id, acao, entidade, campo, valor_anterior, valor_novo, origem
         from auditoria_colaborador where colaborador_id = any($1) and origem = 'carga inicial'`,
      [[cA, cB, cC, cD, cE, cF, cG]]
    );
    const audA = aud.find((a) => a.entidade_id === evA);
    confere(
      aud.length === 3 && audA &&
        audA.usuario_id === null && audA.acao === "alterou" && audA.entidade === "colaborador" &&
        audA.campo === "GESET ASO Periódico" && audA.valor_anterior === "pendente" &&
        audA.valor_novo === "lançado",
      "carga: grava uma auditoria 'carga inicial' só nas 3 linhas que mudou",
      JSON.stringify(aud)
    );

    // Invariante nos dados reais (somente leitura): depois da 0019, nenhum
    // último evento ativo com vencimento > 90 dias pode estar pendente.
    const { rows: real } = await client.query(
      `with ultimos as (
         select distinct on (e.colaborador_id, e.tipo_requisito_id)
                e.id, e.geset_lancado_em,
                (coalesce(e.data_realizado, e.data_documento)
                  + (t.periodicidade_meses || ' months')::interval)::date as venc
           from eventos_requisito e
           join colaboradores c on c.id = e.colaborador_id and c.ativo
           join tipos_requisito t on t.id = e.tipo_requisito_id and t.ativo
          where e.resultado in ('apto', 'apto_com_restricao') and c.matricula < 999000
          order by e.colaborador_id, e.tipo_requisito_id,
                   coalesce(e.data_realizado, e.data_documento) desc, e.criado_em desc, e.id)
       select count(*) filter (where venc > public.hoje() + 90)::int as acima_90,
              count(*) filter (where venc > public.hoje() + 90 and geset_lancado_em is null)::int as acima_90_pendentes,
              count(*) filter (where venc <= public.hoje() + 90 and geset_lancado_em is not null)::int as ate_90_lancados,
              count(*) filter (where geset_lancado_em is null)::int as pendentes,
              count(*)::int as total
         from ultimos`
    );
    confere(real[0].acima_90_pendentes === 0,
      "a migration não deixa pendente quem tem vencimento > 90 dias (dados reais)",
      JSON.stringify(real[0]));
    console.log(`        (real: ${real[0].total} últimos eventos ativos, ${real[0].acima_90} com mais de 90 dias, ${real[0].pendentes} pendentes agora)`);

    // ---- idempotência ------------------------------------------------------
    console.log("\nIdempotência");
    const cargaMeio = await contaCarga();
    const fotos = async () => {
      const r = [];
      for (const id of [evA, evCultimo, evGavp, evB]) r.push(await estado(id));
      return r;
    };
    const fotoAntes = await fotos();
    await client.query(`select public.fn_carga_inicial_geset()`);
    const fotoDepois = await fotos();
    const cargaFim = await contaCarga();
    confere(
      JSON.stringify(fotoAntes) === JSON.stringify(fotoDepois) &&
        cargaFim === cargaMeio && cargaMeio === cargaAntes + 3,
      "rodar o bloco de carga duas vezes não altera geset_lancado_em nem duplica auditoria",
      `auditoria carga: antes ${cargaAntes}, depois da 1ª ${cargaMeio}, depois da 2ª ${cargaFim}`
    );

    // ---- view --------------------------------------------------------------
    console.log("\nvw_pendencias_geset");
    const { rows: vcols } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'vw_pendencias_geset'
        order by ordinal_position`
    );
    confere(JSON.stringify(vcols.map((c) => c.column_name)) === JSON.stringify(COLUNAS_VIEW),
      "a view expõe exatamente as colunas do contrato",
      vcols.map((c) => c.column_name).join(", "));

    const { rows: opt } = await client.query(
      `select reloptions from pg_class where relname = 'vw_pendencias_geset'`
    );
    confere((opt[0]?.reloptions ?? []).includes("security_invoker=true"),
      "a view é security_invoker", JSON.stringify(opt[0]));

    const pend = await sessao(uidSup, pendentesDaView);
    confere(pend.has(evB), "evento com vencimento <= 90 dias aparece na vw_pendencias_geset");
    confere(pend.has(evDultimo) && pend.has(evGaso),
      "último evento a 20 dias e ASO a 10 dias aparecem");
    confere(!pend.has(evA) && !pend.has(evCultimo) && !pend.has(evGavp),
      "lançados pela carga não aparecem");
    confere(!pend.has(evCantigo) && !pend.has(evDantigo),
      "evento anterior (não o último) nunca aparece como pendente");
    confere(!pend.has(evE), "evento inapto nunca aparece");
    confere(!pend.has(evF), "colaborador desligado nunca aparece");

    const { rows: linha } = await client.query(
      `select * from vw_pendencias_geset where evento_id = $1`, [evB]
    );
    confere(
      linha.length === 1 && linha[0].matricula === 999302 && linha[0].requisito === "ASO Periódico" &&
        linha[0].dias_restantes === 90 && linha[0].colaborador_id === cB && linha[0].cargo === "Cargo Teste" &&
        typeof linha[0].data_vencimento === "object" && typeof linha[0].data_documento === "object",
      "a linha da view traz matrícula, requisito, dias_restantes e datas", JSON.stringify(linha[0]));

    // ---- fn_marcar_geset ---------------------------------------------------
    console.log("\nfn_marcar_geset");
    await sessao(uidSup, async () => {
      const f1 = await tentar(`select fn_marcar_geset($1)`, [evB]);
      if (f1) { erro("supervisor marca o evento como lançado", f1.mensagem); return; }
      const e = await estado(evB);
      confere(e.geset_lancado_por === uidSup && e.geset_lancado_em !== null,
        "fn_marcar_geset grava quem e quando", JSON.stringify(e));
      confere(!(await pendentesDaView()).has(evB), "…e o evento some da view");

      await client.query(`select fn_marcar_geset($1)`, [evB]);
      const { rows: a } = await client.query(
        `select usuario_id, acao, entidade, entidade_id, campo, valor_anterior, valor_novo, origem
           from auditoria_colaborador where colaborador_id = $1 and origem = 'GESET'`, [cB]
      );
      confere(
        a.length === 1 && a[0].usuario_id === uidSup && a[0].acao === "alterou" &&
          a[0].entidade === "colaborador" && a[0].entidade_id === evB &&
          a[0].campo === "GESET ASO Periódico" && a[0].valor_anterior === "pendente" &&
          a[0].valor_novo === "lançado",
        "…registra uma única linha de auditoria (marcar de novo não duplica)", JSON.stringify(a));

      const f2 = await tentar(`select fn_marcar_geset($1, false)`, [evB]);
      if (f2) { erro("fn_marcar_geset(false) devolve à view", f2.mensagem); return; }
      const d = await estado(evB);
      confere(d.geset_lancado_em === null && d.geset_lancado_por === null &&
        (await pendentesDaView()).has(evB),
        "fn_marcar_geset(false) devolve à view e limpa quem e quando", JSON.stringify(d));
      const { rows: a2 } = await client.query(
        `select valor_anterior, valor_novo from auditoria_colaborador
          where colaborador_id = $1 and origem = 'GESET' `, [cB]
      );
      // criado_em é now() da transação (igual nas duas linhas): conferir por conteúdo, não por ordem.
      confere(a2.length === 2 &&
        a2.some((x) => x.valor_anterior === "lançado" && x.valor_novo === "pendente"),
        "…e registra a desmarcação na auditoria", JSON.stringify(a2));
    });

    await sessao(uidQsms, async () => {
      const f = await tentar(`select fn_marcar_geset($1)`, [evDultimo]);
      confere(!f && (await estado(evDultimo)).geset_lancado_por === uidQsms,
        "qsms consegue marcar", f?.mensagem);
    });

    await sessao(uidSemPerfil, async () => {
      const f = await tentar(`select fn_marcar_geset($1)`, [evDultimo]);
      confere(f && f.codigo === "42501", "usuário sem perfil não marca (insufficient_privilege)",
        f ? `${f.codigo} ${f.mensagem}` : "passou");
    });

    await sessao(uidSup, async () => {
      const f = await tentar(`select fn_marcar_geset(gen_random_uuid())`);
      confere(f !== null, "evento inexistente dá erro", "passou");
      const g = await tentar(`select fn_marcar_geset($1)`, [evE]);
      confere(g !== null, "evento inapto não pode ser marcado", "passou");
    });

    await sessao(uidSup, async () => {
      const { rows } = await client.query(`select count(*)::int as n from vw_pendencias_geset`);
      confere(rows[0].n > 0, "supervisor lê a view (RLS do operador)", `n = ${rows[0].n}`);
    });

    const { rows: anon } = await client.query(
      `select has_function_privilege('anon', 'public.fn_marcar_geset(uuid, boolean)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.fn_marcar_geset(uuid, boolean)', 'execute') as auth,
              has_function_privilege('anon', 'public.fn_carga_inicial_geset()', 'execute') as carga_anon,
              has_function_privilege('authenticated', 'public.fn_carga_inicial_geset()', 'execute') as carga_auth`
    );
    confere(!anon[0].anon && anon[0].auth, "fn_marcar_geset: execute só para authenticated", JSON.stringify(anon[0]));
    confere(!anon[0].carga_anon && !anon[0].carga_auth,
      "fn_carga_inicial_geset não é executável por anon nem authenticated", JSON.stringify(anon[0]));
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
