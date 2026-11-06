// Importa o último ASO e a última avaliação psicológica de cada colaborador.
//
//   node scripts/importar-exames.mjs "import/ASO E PSICOLOGICA 211.xlsx" --simular
//   node scripts/importar-exames.mjs "import/ASO E PSICOLOGICA 211.xlsx"
//
// A planilha saiu da leitura das pastas do SharePoint (04/11/2026): a data foi
// lida dentro de cada documento, não no nome do arquivo. Colunas usadas:
// Matrícula, Último ASO, Arquivo ASO, Última av. psicológica, Arquivo av.
// psicológica. Célula sem data ("NÃO IDENTIFICADO") é ignorada.
//
// Cada data vira um evento apto em eventos_requisito — o mesmo registro que o
// fluxo grava ao concluir um item. A AVP só aparece no semáforo para quem tem
// exige_avp; por decisão de Matheus, fica marcado quem tem avaliação na pasta.
//
// Os itens 'previsto' que nunca andaram foram abertos pela importação dos
// ativos, quando ninguém tinha registro, e apontam para o dia da carga. Eles
// são apagados e a fila é refeita por fn_gerar_itens_pendentes, a mesma do
// cron diário. Item que já saiu de 'previsto' não é tocado.
//
// Idempotente: evento igual (colaborador, requisito, data) não é duplicado.

import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const args = process.argv.slice(2);
const simular = args.includes("--simular");
const arquivo = args.find((a) => !a.startsWith("--"));

const ASO = "ASO Periódico";
const AVP = "Avaliação Psicossocial (AVP)";

if (!arquivo) {
  console.error('Uso: node scripts/importar-exames.mjs "<planilha.xlsx>" [--simular]');
  process.exit(1);
}

/** "Última av. psicológica" → "ultima_av_psicologica": cabeçalho sem acento, caixa ou espaço. */
const chave = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const isoData = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : null);
const texto = (v) => {
  const t = String(v?.text ?? v?.result ?? v ?? "").trim();
  return t || null;
};

async function carregarLista() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(raiz, arquivo));
  const ws = wb.worksheets[0];
  const cabecalho = ws.getRow(1).values.map(chave);
  const col = (nome) => {
    const i = cabecalho.indexOf(nome);
    if (i < 0) throw new Error(`Coluna "${nome}" não encontrada na planilha.`);
    return i;
  };
  const c = {
    matricula: col("matricula"),
    aso: col("ultimo_aso"),
    arquivoAso: col("arquivo_aso"),
    avp: col("ultima_av_psicologica"),
    arquivoAvp: col("arquivo_av_psicologica"),
  };

  const lista = [];
  const erros = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const matricula = Number(row.getCell(c.matricula).value);
    if (!matricula) return;
    if (!Number.isInteger(matricula)) erros.push(`linha ${i}: matrícula inválida`);
    lista.push({
      matricula,
      aso: isoData(row.getCell(c.aso).value),
      arquivoAso: texto(row.getCell(c.arquivoAso).value),
      avp: isoData(row.getCell(c.avp).value),
      arquivoAvp: texto(row.getCell(c.arquivoAvp).value),
    });
  });

  const repetidas = lista.map((l) => l.matricula).filter((m, i, a) => a.indexOf(m) !== i);
  if (repetidas.length) erros.push(`matrículas repetidas: ${[...new Set(repetidas)].join(", ")}`);
  if (erros.length) {
    console.error("A planilha tem problemas; nada foi gravado:\n  " + erros.join("\n  "));
    process.exit(1);
  }
  return lista;
}

const observacao = (arquivoLido) =>
  `Importado das pastas do SharePoint em 04/11/2026` + (arquivoLido ? ` (arquivo: ${arquivoLido}).` : ".");

async function main() {
  const lista = await carregarLista();
  const origem = `Importação: ${path.basename(arquivo)}`;

  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  const resumo = { eventos_aso: 0, eventos_avp: 0, ja_existiam: 0, marcados_avp: 0, itens_apagados: 0 };
  const foraDoBanco = [];
  const futuras = [];

  try {
    await db.query("begin");

    const { rows: tipos } = await db.query("select id, nome from tipos_requisito where nome = any($1)", [[ASO, AVP]]);
    const tipo = Object.fromEntries(tipos.map((t) => [t.nome, t.id]));
    if (!tipo[ASO] || !tipo[AVP]) throw new Error("Tipos de requisito ASO/AVP não encontrados no catálogo.");

    const { rows: hoje } = await db.query("select public.hoje()::text as d");
    const { rows: colaboradores } = await db.query("select id, matricula, exige_avp from colaboradores where ativo");
    const porMatricula = new Map(colaboradores.map((c) => [c.matricula, c]));

    const registrar = async (colaboradorId, tipoId, data, arquivoLido) => {
      const { rowCount } = await db.query(
        `insert into eventos_requisito (colaborador_id, tipo_requisito_id, data_documento, resultado, estimado, observacoes)
         select $1, $2, $3, 'apto', false, $4
          where not exists (select 1 from eventos_requisito
                             where colaborador_id = $1 and tipo_requisito_id = $2 and data_documento = $3)`,
        [colaboradorId, tipoId, data, observacao(arquivoLido)]
      );
      return rowCount;
    };

    for (const l of lista) {
      const c = porMatricula.get(l.matricula);
      if (!c) {
        foraDoBanco.push(l.matricula);
        continue;
      }
      for (const [d, rotulo] of [[l.aso, "ASO"], [l.avp, "AVP"]]) {
        if (d && d > hoje[0].d) futuras.push(`${l.matricula} ${rotulo} ${d}`);
      }

      if (l.aso) {
        if (await registrar(c.id, tipo[ASO], l.aso, l.arquivoAso)) resumo.eventos_aso++;
        else resumo.ja_existiam++;
      }
      if (l.avp) {
        if (await registrar(c.id, tipo[AVP], l.avp, l.arquivoAvp)) resumo.eventos_avp++;
        else resumo.ja_existiam++;
        if (!c.exige_avp) {
          await db.query("update colaboradores set exige_avp = true where id = $1", [c.id]);
          // Inserção direta: sem sessão não há auth.uid() para fn_registrar_auditoria carimbar.
          await db.query(
            `insert into auditoria_colaborador (colaborador_id, acao, entidade, entidade_id, campo, valor_anterior, valor_novo, origem)
             values ($1, 'alterou', 'colaborador', $1, 'exige AVP', 'não', 'sim', $2)`,
            [c.id, origem]
          );
          resumo.marcados_avp++;
        }
      }
    }

    if (futuras.length) throw new Error("Datas no futuro, nada foi gravado:\n  " + futuras.join("\n  "));

    // Itens 'previsto' que nunca andaram: o histórico só tem a criação.
    const { rowCount: apagados } = await db.query(
      `delete from itens_pendencia i
        where i.etapa = 'previsto'
          and not exists (select 1 from historico_item h where h.item_id = i.id and h.etapa_de is not null)`
    );
    resumo.itens_apagados = apagados;

    const { rows: geracao } = await db.query("select * from fn_gerar_itens_pendentes()");
    resumo.itens_criados = Number(geracao[0]?.criados ?? 0);

    const { rows: status } = await db.query(
      `select requisito, status, count(*)::int as total
         from vw_status_colaborador group by 1, 2 order by 1, min(peso_status)`
    );

    const { rows: fila } = await db.query(
      `select t.nome as requisito, i.etapa, count(*)::int as total, min(i.data_vencimento)::text as menor_venc,
              max(i.data_vencimento)::text as maior_venc
         from itens_pendencia i join tipos_requisito t on t.id = i.tipo_requisito_id
        where i.etapa not in ('concluido', 'cancelado')
        group by 1, 2 order by 1, 2`
    );

    await db.query(simular ? "rollback" : "commit");

    console.log(simular ? "\nSIMULAÇÃO — nada foi gravado.\n" : "\nImportação gravada.\n");
    console.log(`Planilha: ${lista.length} linhas (${path.basename(arquivo)})`);
    console.log(`Sem data de ASO: ${lista.filter((l) => !l.aso).map((l) => l.matricula).join(", ") || "nenhum"}`);
    if (foraDoBanco.length) console.log(`Matrículas fora do banco (ignoradas): ${foraDoBanco.join(", ")}`);
    console.table(resumo);
    console.log("Semáforo depois da importação:");
    console.table(status);
    console.log("Fila aberta depois da importação:");
    console.table(fila);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
