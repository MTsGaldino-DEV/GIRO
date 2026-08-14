// Importa data/Colaboradores_211.xlsx (aba "Export") para public.colaboradores.
//
//   npm run seed:colaboradores
//   npm run seed:colaboradores -- --dry-run
//
// Reimportação é o fluxo previsto na pendência P8: o script faz upsert por
// matrícula e imprime um relatório de diferenças (novos, alterados, ausentes).
// Quem sumiu da planilha NÃO é apagado — é marcado ativo = false, porque
// desligamento é fato de RH e o histórico de ASO precisa sobreviver a ele.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { criarClienteAdmin } from "./lib/supabase.mjs";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const ARQUIVO = path.join(raiz, "data", "Colaboradores_211.xlsx");
const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Normalizações
// ---------------------------------------------------------------------------

// A planilha traz "1-Trabalhando", "2-Férias", "3-Auxílio Doença",
// "14-Atestado por Doença". Só 'trabalhando' libera agendamento; o resto
// bloqueia, então um valor desconhecido cai em 'outro' — que também bloqueia.
// Errar para o lado de bloquear é o lado seguro: no máximo alguém liga para
// conferir. O contrário manda um colaborador afastado para a clínica.
const SITUACOES = {
  trabalhando: "trabalhando",
  ferias: "ferias",
  "auxilio doenca": "auxilio_doenca",
  "atestado por doenca": "atestado",
  atestado: "atestado",
  afastamento: "afastamento",
  afastado: "afastamento",
};

function semAcento(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarSituacao(bruto) {
  if (!bruto) return { valor: "trabalhando", reconhecida: true };
  // Descarta o prefixo numérico: "14-Atestado por Doença" -> "Atestado por Doença"
  const limpo = semAcento(String(bruto).replace(/^\s*\d+\s*-\s*/, ""));
  const valor = SITUACOES[limpo];
  return valor ? { valor, reconhecida: true } : { valor: "outro", reconhecida: false };
}

// O Excel guarda data como serial desde 1899-12-30. ExcelJS já converte a
// maioria para Date, mas células sem formato de data voltam como número cru.
function normalizarData(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date) {
    // ExcelJS devolve em UTC; converter com getFullYear local deslocaria um dia.
    return valor.toISOString().slice(0, 10);
  }

  if (typeof valor === "number" && Number.isFinite(valor)) {
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }

  const texto = String(valor).trim();
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  return null;
}

function normalizarCpf(valor) {
  if (!valor) return null;
  const digitos = String(valor).replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

// "Multifuncional Gov. Valadares" -> "Gov. Valadares".
// Hoje os 261 estão no mesmo local, mas o plano já prevê Aimorés e o polo é o
// eixo de agrupamento por clínica (P9).
function extrairPolo(local) {
  if (!local) return null;
  return String(local).replace(/^\s*multifuncional\s+/i, "").trim() || null;
}

function celula(linha, indice) {
  const valor = linha.getCell(indice).value;
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "object" && "result" in valor) return valor.result;
  if (typeof valor === "object" && "text" in valor) return valor.text;
  return valor;
}

// ---------------------------------------------------------------------------

async function lerPlanilha() {
  if (!fs.existsSync(ARQUIVO)) {
    console.error(`Arquivo não encontrado: ${ARQUIVO}`);
    console.error("Coloque a planilha de colaboradores em data/Colaboradores_211.xlsx");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ARQUIVO);

  const aba = wb.getWorksheet("Export") ?? wb.worksheets[0];
  if (!aba) {
    console.error("A planilha não tem nenhuma aba legível.");
    process.exit(1);
  }

  // Mapeia por nome de cabeçalho: a ordem das colunas do export pode mudar.
  const cabecalho = {};
  aba.getRow(1).eachCell((cel, col) => {
    const nome = semAcento(String(cel.value ?? ""));
    if (nome) cabecalho[nome] = col;
  });

  const obrigatorias = ["matricula", "colaborador"];
  const faltando = obrigatorias.filter((c) => !(c in cabecalho));
  if (faltando.length) {
    console.error(`Colunas obrigatórias ausentes na planilha: ${faltando.join(", ")}`);
    console.error(`Cabeçalhos encontrados: ${Object.keys(cabecalho).join(", ")}`);
    process.exit(1);
  }

  const col = (nome) => cabecalho[nome] ?? null;
  const ler = (linha, nome) => (col(nome) ? celula(linha, col(nome)) : null);

  const registros = [];
  const descartes = [];
  const situacoesDesconhecidas = new Set();

  aba.eachRow((linha, numero) => {
    if (numero === 1) return;

    const matriculaBruta = ler(linha, "matricula");
    const nome = ler(linha, "colaborador");

    const matricula = Number.parseInt(String(matriculaBruta ?? "").replace(/\D/g, ""), 10);
    if (!Number.isFinite(matricula) || !nome) {
      if (matriculaBruta || nome) {
        descartes.push({ linha: numero, matricula: matriculaBruta, nome });
      }
      return;
    }

    const situacaoBruta = ler(linha, "situacao");
    const { valor: situacao, reconhecida } = normalizarSituacao(situacaoBruta);
    if (!reconhecida) situacoesDesconhecidas.add(String(situacaoBruta));

    const local = ler(linha, "local");

    registros.push({
      matricula,
      nome: String(nome).trim(),
      cpf: normalizarCpf(ler(linha, "cpf")),
      cargo: ler(linha, "cargo") ? String(ler(linha, "cargo")).trim() : null,
      uen: ler(linha, "uen") ? String(ler(linha, "uen")).trim() : null,
      local: local ? String(local).trim() : null,
      polo: extrairPolo(local),
      data_admissao: normalizarData(ler(linha, "data admissao")),
      data_nascimento: normalizarData(ler(linha, "data nascimento")),
      situacao,
      ativo: true,
      // P1 permanece em aberto: o vínculo com supervisor não existe em nenhum
      // arquivo de origem. Fica nulo e o painel do QSMS agrupa em
      // "Sem supervisor" até o mapa oficial chegar.
      supervisor_id: null,
    });
  });

  return { registros, descartes, situacoesDesconhecidas };
}

async function main() {
  const { registros, descartes, situacoesDesconhecidas } = await lerPlanilha();

  console.log(`Planilha lida: ${registros.length} colaboradores válidos.`);
  if (descartes.length) {
    console.warn(`  ${descartes.length} linha(s) descartada(s) por falta de matrícula ou nome:`);
    for (const d of descartes.slice(0, 5)) {
      console.warn(`    linha ${d.linha}: matricula=${d.matricula ?? "-"} nome=${d.nome ?? "-"}`);
    }
  }
  if (situacoesDesconhecidas.size) {
    console.warn(
      `  situação não mapeada (entraram como 'outro', que bloqueia agendamento): ` +
        `${[...situacoesDesconhecidas].join(", ")}`
    );
  }

  const duplicadas = registros
    .map((r) => r.matricula)
    .filter((m, i, arr) => arr.indexOf(m) !== i);
  if (duplicadas.length) {
    console.error(`Matrículas duplicadas na planilha: ${[...new Set(duplicadas)].join(", ")}`);
    console.error("Corrija a origem antes de importar — a matrícula é a chave do upsert.");
    process.exit(1);
  }

  const supabase = criarClienteAdmin();

  const { data: existentes, error: erroLeitura } = await supabase
    .from("colaboradores")
    .select("matricula, nome, cargo, situacao, ativo, supervisor_id");
  if (erroLeitura) {
    console.error("Falha ao ler a base atual:", erroLeitura.message);
    process.exit(1);
  }

  const porMatricula = new Map(existentes.map((c) => [c.matricula, c]));
  const naPlanilha = new Set(registros.map((r) => r.matricula));

  const novos = registros.filter((r) => !porMatricula.has(r.matricula));
  const alterados = registros.filter((r) => {
    const atual = porMatricula.get(r.matricula);
    if (!atual) return false;
    return (
      atual.nome !== r.nome ||
      atual.cargo !== r.cargo ||
      atual.situacao !== r.situacao ||
      atual.ativo !== true
    );
  });
  const ausentes = existentes.filter((c) => c.ativo && !naPlanilha.has(c.matricula));

  console.log("\nRelatório de diferenças");
  console.log(`  novos:      ${novos.length}`);
  console.log(`  alterados:  ${alterados.length}`);
  console.log(`  ausentes:   ${ausentes.length}  (serão marcados como inativos, não apagados)`);
  for (const c of ausentes.slice(0, 10)) console.log(`     - ${c.matricula} ${c.nome}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nada foi gravado.");
    return;
  }

  // supervisor_id fica de fora do upsert de propósito: quando o vínculo for
  // feito na aplicação, uma reimportação da planilha não pode desfazê-lo.
  const paraGravar = registros.map(({ supervisor_id, ...resto }) => resto);

  const LOTE = 200;
  for (let i = 0; i < paraGravar.length; i += LOTE) {
    const lote = paraGravar.slice(i, i + LOTE);
    const { error } = await supabase
      .from("colaboradores")
      .upsert(lote, { onConflict: "matricula" });
    if (error) {
      console.error(`\nFalha no upsert (lote ${i / LOTE + 1}):`, error.message);
      process.exit(1);
    }
    process.stdout.write(`\r  gravados ${Math.min(i + LOTE, paraGravar.length)}/${paraGravar.length}`);
  }
  console.log("");

  if (ausentes.length) {
    const { error } = await supabase
      .from("colaboradores")
      .update({ ativo: false })
      .in("matricula", ausentes.map((c) => c.matricula));
    if (error) console.error("Falha ao inativar ausentes:", error.message);
    else console.log(`  ${ausentes.length} colaborador(es) marcado(s) como inativo(s).`);
  }

  const { count } = await supabase
    .from("colaboradores")
    .select("*", { count: "exact", head: true })
    .eq("ativo", true);

  const { count: semSupervisor } = await supabase
    .from("colaboradores")
    .select("*", { count: "exact", head: true })
    .eq("ativo", true)
    .is("supervisor_id", null);

  console.log(`\nBase atual: ${count} colaboradores ativos.`);
  if (semSupervisor) {
    console.log(
      `  ${semSupervisor} sem supervisor vinculado (pendência P1 do plano — ` +
        `aparecem no grupo "Sem supervisor" no painel do QSMS).`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
