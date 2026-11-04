// Importa a lista de ativos enviada pelo RH e substitui a base fictícia.
//
//   node scripts/importar-ativos.mjs "import/ATIVOS 211 - 031126.xlsx" --simular
//   node scripts/importar-ativos.mjs "import/ATIVOS 211 - 031126.xlsx"
//
// A lista é a fonte da folha: matrícula, nome, cargo, admissão e CPF. Quem
// está na lista entra (ou é atualizado) como ativo; quem é real, está ativo na
// base e saiu da lista é desligado — não excluído, para não perder histórico.
// Supervisor, polo e situação não vêm na lista e não são tocados.
//
// Nascimento e local vêm, quando existirem, de data/Colaboradores_211.xlsx
// (exportação anterior, mesma matrícula e CPF). Só preenchem campo vazio: o que
// o QSMS já corrigiu na tela não é sobrescrito por uma planilha mais velha.
// A situação daquela exportação não é usada — férias de setembro não podem
// bloquear agendamento em novembro.
//
// Os 20 colaboradores do seed fictício (matrícula 90000+) são apagados junto
// com eventos, itens, documentos e arquivos no Storage. As contas de teste
// ficam, para o acesso continuar funcionando.
//
// Ao fim roda fn_gerar_itens_pendentes, a mesma do cron diário, para o Painel
// já abrir com a fila de quem não tem registro.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";
import { criarClienteAdmin } from "./lib/supabase.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const args = process.argv.slice(2);
const simular = args.includes("--simular");
const arquivo = args.find((a) => !a.startsWith("--"));
const COMPLEMENTO = path.join(raiz, "data", "Colaboradores_211.xlsx");
const MATRICULA_FICTICIA = 90000;

if (!arquivo) {
  console.error('Uso: node scripts/importar-ativos.mjs "<lista.xlsx>" [--simular]');
  process.exit(1);
}

/** "data_admissão" → "data_admissao": cabeçalho sem acento, caixa ou espaço. */
const chave = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const somenteDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const isoData = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : null);
const texto = (v) => {
  const t = String(v?.text ?? v?.result ?? v ?? "").trim().replace(/\s+/g, " ");
  return t || null;
};

/** Linhas da primeira aba como objetos, indexados pelo cabeçalho normalizado. */
async function lerPlanilha(caminho) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  const cabecalho = ws.getRow(1).values.map(chave);
  const linhas = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const obj = {};
    row.values.forEach((v, col) => cabecalho[col] && (obj[cabecalho[col]] = v));
    linhas.push(obj);
  });
  return linhas;
}

/** Primeiro campo presente entre os nomes aceitos — a planilha muda de rótulo entre exportações. */
const campo = (linha, ...nomes) => nomes.map((n) => linha[n]).find((v) => v != null && v !== "");

async function carregarLista() {
  const linhas = await lerPlanilha(path.resolve(raiz, arquivo));
  const erros = [];
  const lista = [];

  linhas.forEach((l, i) => {
    const matricula = Number(campo(l, "matricula_engelmig", "matricula"));
    const nome = texto(campo(l, "nome", "colaborador"));
    if (!matricula && !nome) return; // linha em branco no fim da planilha
    const cpf = somenteDigitos(campo(l, "cpf"));

    if (!Number.isInteger(matricula) || matricula <= 0) erros.push(`linha ${i + 2}: matrícula inválida`);
    else if (matricula >= MATRICULA_FICTICIA) erros.push(`linha ${i + 2}: matrícula ${matricula} cai na faixa do seed fictício`);
    if (!nome) erros.push(`linha ${i + 2}: sem nome`);
    if (cpf && cpf.length !== 11) erros.push(`linha ${i + 2}: CPF com ${cpf.length} dígitos`);

    lista.push({
      matricula,
      nome,
      cargo: texto(campo(l, "cargo")),
      data_admissao: isoData(campo(l, "data_admissao")),
      cpf: cpf || null,
    });
  });

  const repetidas = lista.map((c) => c.matricula).filter((m, i, a) => a.indexOf(m) !== i);
  if (repetidas.length) erros.push(`matrículas repetidas: ${[...new Set(repetidas)].join(", ")}`);

  if (erros.length) {
    console.error("A lista tem problemas; nada foi gravado:\n  " + erros.join("\n  "));
    process.exit(1);
  }
  return lista;
}

/** Matrícula → { data_nascimento, local } da exportação anterior, quando o CPF confere. */
async function carregarComplemento() {
  if (!fs.existsSync(COMPLEMENTO)) return new Map();
  const mapa = new Map();
  for (const l of await lerPlanilha(COMPLEMENTO)) {
    mapa.set(Number(campo(l, "matricula")), {
      cpf: somenteDigitos(campo(l, "cpf")),
      data_nascimento: isoData(campo(l, "data_nascimento")),
      local: texto(campo(l, "local")),
    });
  }
  return mapa;
}

// Rótulos iguais aos de CAMPOS_COLABORADOR.auditoria, para a trilha do perfil
// ler a importação na mesma gramática de uma edição feita na tela.
const ROTULO = {
  nome: "nome",
  cpf: "CPF",
  cargo: "cargo",
  data_admissao: "admissão",
  data_nascimento: "nascimento",
  local: "local",
};

async function main() {
  const lista = await carregarLista();
  const complemento = await carregarComplemento();
  const origem = `Importação: ${path.basename(arquivo)}`;

  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  const resumo = { inseridos: 0, atualizados: 0, sem_mudanca: 0, desligados: 0, reativados: 0, complementados: 0 };
  let ficticios = [];
  let orfaos = [];

  try {
    await db.query("begin");

    // 1. Base fictícia do seed. Eventos, itens, histórico, documentos e
    //    auditoria caem em cascata pela FK.
    ficticios = (
      await db.query("delete from colaboradores where matricula >= $1 returning id", [MATRICULA_FICTICIA])
    ).rows.map((r) => r.id);

    // 2. Upsert pela matrícula, com auditoria campo a campo.
    const { rows: atuais } = await db.query(
      "select id, matricula, nome, cpf, cargo, data_admissao::text, data_nascimento::text, local, ativo from colaboradores"
    );
    const porMatricula = new Map(atuais.map((c) => [c.matricula, c]));
    const auditoria = [];

    for (const c of lista) {
      const extra = complemento.get(c.matricula);
      const confere = extra && (!extra.cpf || !c.cpf || extra.cpf === c.cpf);
      const atual = porMatricula.get(c.matricula);

      if (!atual) {
        const { rows } = await db.query(
          `insert into colaboradores (matricula, nome, cpf, cargo, uen, data_admissao, data_nascimento, local, situacao, ativo)
           values ($1, $2, $3, $4, '211', $5, $6, $7, 'trabalhando', true) returning id`,
          [c.matricula, c.nome, c.cpf, c.cargo, c.data_admissao, confere ? extra.data_nascimento : null, confere ? extra.local : null]
        );
        auditoria.push([rows[0].id, "criou", null, null, null]);
        resumo.inseridos++;
        if (confere) resumo.complementados++;
        continue;
      }

      const novo = { nome: c.nome, cpf: c.cpf, cargo: c.cargo, data_admissao: c.data_admissao };
      if (confere && !atual.data_nascimento && extra.data_nascimento) novo.data_nascimento = extra.data_nascimento;
      if (confere && !atual.local && extra.local) novo.local = extra.local;

      const mudancas = Object.entries(novo).filter(([k, v]) => v != null && v !== atual[k]);
      if (mudancas.length === 0 && atual.ativo) {
        resumo.sem_mudanca++;
        continue;
      }

      const sets = mudancas.map(([k], i) => `${k} = $${i + 2}`);
      if (!atual.ativo) sets.push("ativo = true");
      await db.query(`update colaboradores set ${sets.join(", ")} where id = $1`, [
        atual.id,
        ...mudancas.map(([, v]) => v),
      ]);
      for (const [k, v] of mudancas) auditoria.push([atual.id, "alterou", ROTULO[k], atual[k], v]);
      if (!atual.ativo) {
        auditoria.push([atual.id, "alterou", "situação no quadro", "desligado", "ativo"]);
        resumo.reativados++;
      }
      resumo.atualizados++;
    }

    // 3. Quem é real, estava ativo e saiu da lista: desligado, com histórico preservado.
    const naLista = lista.map((c) => c.matricula);
    const { rows: saiu } = await db.query(
      "update colaboradores set ativo = false where ativo and matricula < $1 and not (matricula = any($2)) returning id",
      [MATRICULA_FICTICIA, naLista]
    );
    for (const { id } of saiu) auditoria.push([id, "alterou", "situação no quadro", "ativo", "desligado"]);
    resumo.desligados = saiu.length;

    // Inserção direta: sem sessão não há auth.uid() para fn_registrar_auditoria carimbar.
    for (const [id, acao, campoAud, de, para] of auditoria) {
      await db.query(
        `insert into auditoria_colaborador (colaborador_id, acao, entidade, entidade_id, campo, valor_anterior, valor_novo, origem)
         values ($1, $2, 'colaborador', $1, $3, $4, $5, $6)`,
        [id, acao, campoAud, de, para, origem]
      );
    }

    // 4. Fila inicial, como o cron diário faria.
    const { rows: geracao } = await db.query("select * from fn_gerar_itens_pendentes()");
    resumo.itens_criados = Number(geracao[0]?.criados ?? 0);

    const { rows: status } = await db.query(
      "select status, count(*)::int as total from vw_status_colaborador group by 1 order by 2 desc"
    );

    // Arquivos cuja pasta (o id do colaborador) não existe mais: os fictícios
    // de agora e sobras de rodadas anteriores do seed.
    orfaos = (
      await db.query(
        `select bucket_id, name from storage.objects o
          where bucket_id in ('documentos', 'fotos', 'asos')
            and not exists (select 1 from colaboradores c where c.id::text = (storage.foldername(o.name))[1])`
      )
    ).rows;

    await db.query(simular ? "rollback" : "commit");

    console.log(simular ? "\nSIMULAÇÃO — nada foi gravado.\n" : "\nImportação gravada.\n");
    console.log(`Lista: ${lista.length} colaboradores (${path.basename(arquivo)})`);
    console.log(`Fictícios removidos: ${ficticios.length}`);
    console.table(resumo);
    console.log("Semáforo depois da importação:");
    console.table(status);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }

  // 5. Arquivos órfãos. Depois do commit: o Storage não participa da
  //    transação, e apagar arquivo de uma importação que voltou atrás seria
  //    pior que deixar sobra.
  console.log(`Arquivos órfãos no Storage: ${orfaos.length}${simular ? " (seriam removidos)" : ""}`);
  if (!simular && orfaos.length) {
    const supabase = criarClienteAdmin();
    for (const bucket of new Set(orfaos.map((o) => o.bucket_id))) {
      const nomes = orfaos.filter((o) => o.bucket_id === bucket).map((o) => o.name);
      const { error } = await supabase.storage.from(bucket).remove(nomes);
      if (error) console.warn(`Aviso: não removeu arquivos de ${bucket}: ${error.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
