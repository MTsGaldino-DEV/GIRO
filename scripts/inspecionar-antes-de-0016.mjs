// Fotografia SOMENTE LEITURA do banco antes das migrations 0016 a 0019.
// Executa apenas `select`; não grava nada. Imprime só contagens (sem nomes,
// CPF ou matrícula).
//
//   node scripts/inspecionar-antes-de-0016.mjs

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

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  // Garantia extra: a sessão inteira é somente leitura.
  await client.query("set default_transaction_read_only = on");

  console.log("1) Itens de pendência por etapa");
  const etapas = await client.query(`
    select etapa, count(*)::int as itens
      from public.itens_pendencia
     group by etapa
     order by itens desc, etapa
  `);
  console.table(etapas.rows);

  console.log("2) Eventos apto / apto_com_restricao por requisito");
  const eventos = await client.query(`
    select t.nome as requisito,
           t.periodicidade_meses,
           count(e.id)::int as eventos
      from public.eventos_requisito e
      join public.tipos_requisito t on t.id = e.tipo_requisito_id
     where e.resultado in ('apto', 'apto_com_restricao')
     group by t.nome, t.periodicidade_meses
     order by t.nome
  `);
  console.table(eventos.rows);

  console.log("3) Último evento por colaborador x requisito com vencimento > hoje + 90 dias");
  const vencimentos = await client.query(`
    with ultimo as (
      select distinct on (e.colaborador_id, e.tipo_requisito_id)
             e.colaborador_id,
             e.tipo_requisito_id,
             (e.data_documento + make_interval(months => t.periodicidade_meses))::date as vencimento
        from public.eventos_requisito e
        join public.tipos_requisito t on t.id = e.tipo_requisito_id
       where e.resultado in ('apto', 'apto_com_restricao')
       order by e.colaborador_id, e.tipo_requisito_id, e.data_documento desc, e.criado_em desc
    )
    select t.nome as requisito,
           count(*)::int as ultimos_eventos,
           count(*) filter (where u.vencimento > current_date + 90)::int as vencimento_maior_90_dias
      from ultimo u
      join public.tipos_requisito t on t.id = u.tipo_requisito_id
     group by t.nome
     order by t.nome
  `);
  console.table(vencimentos.rows);

  const total = vencimentos.rows.reduce(
    (acc, r) => ({
      ultimos: acc.ultimos + r.ultimos_eventos,
      maior90: acc.maior90 + r.vencimento_maior_90_dias,
    }),
    { ultimos: 0, maior90: 0 },
  );
  console.log(
    `Total: ${total.ultimos} últimos eventos; ${total.maior90} com vencimento > 90 dias hoje.`,
  );

  const aguardando = etapas.rows.find((r) => r.etapa === "aguardando_documento");
  console.log(`Itens em aguardando_documento: ${aguardando ? aguardando.itens : 0}`);
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
