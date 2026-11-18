// Anexa o PDF do ASO (ou da AVP) a cada evento importado das pastas do SharePoint.
//
//   node scripts/importar-documentos-aso.mjs --simular
//   node scripts/importar-documentos-aso.mjs
//   node scripts/importar-documentos-aso.mjs --requisito avp [--simular]
//   node scripts/importar-documentos-aso.mjs --pasta "<Colaboradores>" --manuais data/aso-arquivos-manuais.csv
//
// Contexto: `importar-exames.mjs` (04/11/2026) gravou a data do último ASO de
// cada pessoa, mas sem o arquivo — o evento ficou com `documento_url` vazio e o
// nome do arquivo lido nas observações ("... (arquivo: ASO 2026.pdf).").
//
// Este script acha esse arquivo na cópia local das pastas (baixada por
// `baixar-sharepoint.mjs` para `Área de Trabalho\Colaboradores\<nome oficial>`),
// envia para o bucket privado `asos` e grava o caminho no evento — o mesmo
// formato que o app grava ao registrar resultado.
//
// Onde o arquivo vem:
//   1. observação com "(arquivo: X)": X é procurado em todas as subpastas da
//      pessoa. Mais de um com o mesmo nome só passa se o conteúdo for igual.
//   2. sem nome na observação (datas completadas à mão por Matheus): o caminho
//      relativo vem de `data/aso-arquivos-manuais.csv` (matricula;arquivo),
//      ignorado pelo Git porque traz nomes de pessoas.
//
// Só toca o requisito escolhido com `documento_url` vazio, então é retomável: rodar de
// novo não reenvia o que já foi anexado. O caminho no bucket é fixo por evento
// (`<colaborador>/<aso|avp>-importado-<evento>.<ext>`), então uma queda entre o envio
// e o update não deixa arquivo duplicado.
//
// Relatório (para conferir ou desfazer) em `data/importacao-documentos-aso.csv`,
// também ignorado pelo Git.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";
import { criarClienteAdmin } from "./lib/supabase.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const args = process.argv.slice(2);
const simular = args.includes("--simular");
const valorDe = (flag, padrao) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const pastaBase = valorDe(
  "--pasta",
  path.join(os.homedir(), "OneDrive - ENGELMIG ENERGIA LTDA", "Área de Trabalho", "Colaboradores")
);
const REQUISITOS = {
  aso: { nome: "ASO Periódico", rotulo: "ASO" },
  avp: { nome: "Avaliação Psicossocial (AVP)", rotulo: "AVP" },
};
const chaveRequisito = valorDe("--requisito", "aso");
const REQUISITO = REQUISITOS[chaveRequisito];
if (!REQUISITO) {
  console.error(`--requisito deve ser ${Object.keys(REQUISITOS).join(" ou ")}.`);
  process.exit(1);
}
const arquivoManuais = path.resolve(raiz, valorDe("--manuais", `data/${chaveRequisito}-arquivos-manuais.csv`));
const arquivoRelatorio = path.resolve(raiz, `data/importacao-documentos-${chaveRequisito}.csv`);

const BUCKET = "asos";
const TAMANHO_MAXIMO = 8 * 1024 * 1024; // mesmo limite do envio pelo app (lib/storage.ts)
const TIPOS = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
const ORIGEM = "Importação: pastas do SharePoint";

/** Nome de pasta comparável com o nome do cadastro: sem acento, caixa ou espaço duplo. */
const normalizar = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const listarArquivos = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listarArquivos(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );

const hash = (arquivo) => crypto.createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex");

function carregarManuais() {
  if (!fs.existsSync(arquivoManuais)) return new Map();
  const linhas = fs.readFileSync(arquivoManuais, "utf-8").split(/\r?\n/).slice(1);
  return new Map(
    linhas
      .filter((l) => l.trim())
      .map((l) => {
        const [matricula, ...resto] = l.split(";");
        return [Number(matricula), resto.join(";").trim()];
      })
  );
}

/** Acha o arquivo do evento; devolve { arquivo } ou { erro }. */
function localizar(evento, pastasPorNome, manuais) {
  const manual = manuais.get(evento.matricula);
  if (manual) {
    const arquivo = path.join(pastaBase, manual);
    return fs.existsSync(arquivo) ? { arquivo } : { erro: "arquivo do mapa manual não existe" };
  }

  const nome = /\(arquivo: (.*)\)\.$/.exec(evento.observacoes ?? "")?.[1];
  if (!nome) return { erro: "sem nome de arquivo na observação nem no mapa manual" };

  const pasta = pastasPorNome.get(normalizar(evento.nome));
  if (!pasta) return { erro: "pasta da pessoa não encontrada" };

  const achados = listarArquivos(path.join(pastaBase, pasta)).filter((f) => path.basename(f) === nome);
  if (achados.length === 0) return { erro: `arquivo "${nome}" não encontrado na pasta` };
  if (new Set(achados.map(hash)).size > 1) return { erro: `"${nome}" aparece ${achados.length}x com conteúdos diferentes` };
  return { arquivo: achados[0] };
}

const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  if (!fs.existsSync(pastaBase)) {
    console.error(`Pasta dos colaboradores não encontrada: ${pastaBase}\nUse --pasta "<caminho>".`);
    process.exit(1);
  }
  const pastasPorNome = new Map(
    fs
      .readdirSync(pastaBase, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => [normalizar(e.name), e.name])
  );
  const manuais = carregarManuais();

  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const supabase = criarClienteAdmin();

  const relatorio = [];
  const resumo = { anexados: 0, falhas: 0 };

  try {
    const { rows: eventos } = await db.query(
      `select e.id, e.colaborador_id, e.data_documento::text as data_documento, e.observacoes,
              c.matricula, c.nome
         from eventos_requisito e
         join colaboradores c on c.id = e.colaborador_id
         join tipos_requisito t on t.id = e.tipo_requisito_id
        where t.nome = $1 and e.documento_url is null
        order by c.nome, e.data_documento`,
      [REQUISITO.nome]
    );

    for (const evento of eventos) {
      const linha = { matricula: evento.matricula, data: evento.data_documento, evento: evento.id };
      const { arquivo, erro } = localizar(evento, pastasPorNome, manuais);
      if (erro) {
        relatorio.push({ ...linha, situacao: "falha", detalhe: erro });
        resumo.falhas++;
        continue;
      }

      const extensao = path.extname(arquivo).slice(1).toLowerCase();
      const tipo = TIPOS[extensao];
      const tamanho = fs.statSync(arquivo).size;
      const relativo = path.relative(pastaBase, arquivo);
      if (!tipo || tamanho === 0 || tamanho > TAMANHO_MAXIMO) {
        relatorio.push({ ...linha, situacao: "falha", detalhe: `formato ou tamanho fora do aceito (${relativo})` });
        resumo.falhas++;
        continue;
      }

      const caminho = `${evento.colaborador_id}/${chaveRequisito}-importado-${evento.id}.${extensao}`;
      if (!simular) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(caminho, fs.readFileSync(arquivo), { contentType: tipo, upsert: true });
        if (error) {
          relatorio.push({ ...linha, situacao: "falha", detalhe: `envio: ${error.message}` });
          resumo.falhas++;
          continue;
        }

        await db.query("begin");
        await db.query(
          "update eventos_requisito set documento_url = $2 where id = $1 and documento_url is null",
          [evento.id, caminho]
        );
        // Inserção direta: sem sessão não há auth.uid() para fn_registrar_auditoria carimbar.
        await db.query(
          `insert into auditoria_colaborador (colaborador_id, acao, entidade, entidade_id, campo, valor_novo, origem)
           values ($1, 'anexou', 'colaborador', $1, $4, $2, $3)`,
          [evento.colaborador_id, `${REQUISITO.rotulo} de ${evento.data_documento.split("-").reverse().join("/")} (${path.basename(arquivo)})`, ORIGEM, `documento do ${REQUISITO.rotulo}`]
        );
        await db.query("commit");
      }

      relatorio.push({ ...linha, situacao: simular ? "simulado" : "anexado", detalhe: relativo, caminho });
      resumo.anexados++;
    }
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }

  fs.mkdirSync(path.dirname(arquivoRelatorio), { recursive: true });
  fs.writeFileSync(
    arquivoRelatorio,
    "matricula;data_documento;evento;situacao;arquivo_local;caminho_bucket\n" +
      relatorio
        .map((r) => [r.matricula, r.data, r.evento, r.situacao, r.detalhe, r.caminho].map(csv).join(";"))
        .join("\n") +
      "\n",
    "utf-8"
  );

  console.log(simular ? "\nSIMULAÇÃO — nada foi enviado nem gravado.\n" : "\nDocumentos anexados.\n");
  console.table(resumo);
  const falhas = relatorio.filter((r) => r.situacao === "falha");
  if (falhas.length) {
    console.log("Falhas (matrícula: motivo):");
    for (const f of falhas) console.log(`  ${f.matricula}: ${f.detalhe}`);
  }
  console.log(`Relatório: ${path.relative(raiz, arquivoRelatorio)}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
