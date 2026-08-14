// Importa data/ASO_Proximos_vencimentos.CSV e cria os eventos retroativos.
//
//   npm run seed:aso -- --dry-run
//   npm run seed:aso
//   npm run seed:aso -- --casar-por-nome
//
// A origem traz "Prox. Exame", não a data do documento. O evento é criado com
// data_documento = Prox. Exame − periodicidade, e marcado estimado = true.
//
// Isso é uma inferência, não um dado da clínica (pendência P3 do plano: não foi
// confirmado se o vencimento na origem conta a partir do exame, da emissão do
// documento ou do mês de admissão). A flag `estimado` existe para que, quando a
// regra real aparecer, dê para achar e corrigir exatamente estas linhas —
// e para que a tela mostre ao QSMS que aquela data é estimativa.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { criarClienteAdmin } from "./lib/supabase.mjs";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const ARQUIVO = path.join(raiz, "data", "ASO_Proximos_vencimentos.CSV");
const DRY_RUN = process.argv.includes("--dry-run");
const CASAR_POR_NOME = process.argv.includes("--casar-por-nome");

function normalizarNome(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lerDataBr(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const iso = `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
  // Rejeita 31/02 e afins: o Date normalizaria para 03/03 em silêncio.
  const dt = new Date(`${iso}T00:00:00Z`);
  return dt.toISOString().slice(0, 10) === iso ? iso : null;
}

function subtrairMeses(iso, meses) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const diaOriginal = dt.getUTCDate();
  dt.setUTCMonth(dt.getUTCMonth() - meses);
  // 31/03 menos 12 meses é 31/03. Mas 29/02 menos 12 vira 01/03 no Date;
  // recuar para o último dia do mês anterior é o comportamento correto.
  if (dt.getUTCDate() !== diaOriginal) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

// Acha a coluna por nome aproximado: os exports variam entre "Prox. Exame",
// "Próx. Exame" e "PROX EXAME".
function acharColuna(cabecalhos, ...candidatos) {
  const norm = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  for (const c of candidatos) {
    const alvo = norm(c);
    const achado = cabecalhos.find((h) => norm(h) === alvo);
    if (achado) return achado;
  }
  for (const c of candidatos) {
    const alvo = norm(c);
    const achado = cabecalhos.find((h) => norm(h).includes(alvo));
    if (achado) return achado;
  }
  return null;
}

async function main() {
  if (!fs.existsSync(ARQUIVO)) {
    console.error(`Arquivo não encontrado: ${ARQUIVO}`);
    console.error("");
    console.error("Coloque o CSV de próximos vencimentos em:");
    console.error(`  ${ARQUIVO}`);
    console.error("");
    console.error("Esperado: separador ';', encoding cp1252, com as colunas");
    console.error("'Matricula', 'Nome colaborador' e 'Prox. Exame' (dd/mm/aaaa).");
    process.exit(1);
  }

  // cp1252 e não utf-8: é export de sistema legado. Ler como utf-8 transforma
  // "José" em "Jos?" e o casamento por nome quebra.
  const bruto = iconv.decode(fs.readFileSync(ARQUIVO), "win1252");
  const linhas = parse(bruto, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  if (linhas.length === 0) {
    console.error("O CSV não tem nenhuma linha de dados.");
    process.exit(1);
  }

  const cabecalhos = Object.keys(linhas[0]);
  const colMatricula = acharColuna(cabecalhos, "Matricula", "Matrícula");
  const colNome = acharColuna(cabecalhos, "Nome colaborador", "Colaborador", "Nome");
  const colProximo = acharColuna(cabecalhos, "Prox. Exame", "Próx. Exame", "Proximo Exame");

  if (!colProximo) {
    console.error(`Coluna de próximo exame não encontrada. Cabeçalhos: ${cabecalhos.join(" | ")}`);
    process.exit(1);
  }
  if (!colMatricula && !colNome) {
    console.error(`Nem matrícula nem nome no CSV. Cabeçalhos: ${cabecalhos.join(" | ")}`);
    process.exit(1);
  }

  console.log(`CSV lido: ${linhas.length} linha(s).`);
  console.log(`  matrícula -> "${colMatricula ?? "(ausente)"}"`);
  console.log(`  nome      -> "${colNome ?? "(ausente)"}"`);
  console.log(`  vencimento-> "${colProximo}"`);

  const supabase = criarClienteAdmin();

  const { data: tipo, error: erroTipo } = await supabase
    .from("tipos_requisito")
    .select("id, nome, periodicidade_meses")
    .eq("nome", "ASO Periódico")
    .single();
  if (erroTipo || !tipo) {
    console.error("Tipo 'ASO Periódico' não encontrado. Rode as migrations antes.");
    process.exit(1);
  }

  const { data: colaboradores, error: erroCol } = await supabase
    .from("colaboradores")
    .select("id, matricula, nome")
    .eq("ativo", true);
  if (erroCol) {
    console.error("Falha ao ler colaboradores:", erroCol.message);
    process.exit(1);
  }

  const porMatricula = new Map(colaboradores.map((c) => [String(c.matricula), c]));
  const porNome = new Map();
  for (const c of colaboradores) {
    const chave = normalizarNome(c.nome);
    // Nome repetido não serve de chave: na dúvida, ninguém.
    porNome.set(chave, porNome.has(chave) ? null : c);
  }

  const eventos = [];
  const semData = [];
  const semColaborador = [];
  const dataInvalida = [];
  let casadosPorNome = 0;

  for (const linha of linhas) {
    const proximo = lerDataBr(linha[colProximo]);
    const identificacao = linha[colNome] ?? linha[colMatricula] ?? "(sem identificação)";

    if (!linha[colProximo] || String(linha[colProximo]).trim() === "") {
      semData.push(identificacao);
      continue;
    }
    if (!proximo) {
      dataInvalida.push(`${identificacao}: "${linha[colProximo]}"`);
      continue;
    }

    let colaborador = null;

    if (colMatricula) {
      const digitos = String(linha[colMatricula] ?? "").replace(/\D/g, "");
      if (digitos) colaborador = porMatricula.get(String(Number(digitos))) ?? null;
    }

    if (!colaborador && colNome && CASAR_POR_NOME) {
      const achado = porNome.get(normalizarNome(linha[colNome]));
      if (achado) {
        colaborador = achado;
        casadosPorNome++;
      }
    }

    if (!colaborador) {
      semColaborador.push(identificacao);
      continue;
    }

    eventos.push({
      colaborador_id: colaborador.id,
      tipo_requisito_id: tipo.id,
      data_documento: subtrairMeses(proximo, tipo.periodicidade_meses),
      resultado: "apto",
      estimado: true,
      observacoes:
        `Data estimada na carga inicial: Prox. Exame ${linha[colProximo]} ` +
        `menos ${tipo.periodicidade_meses} meses. Confirmar com o documento original (P3).`,
    });
  }

  console.log("\nResultado da leitura");
  console.log(`  eventos a criar:        ${eventos.length}`);
  console.log(`  linhas sem data:        ${semData.length}  (seguem como 'sem_registro')`);
  if (dataInvalida.length) {
    console.log(`  datas ilegíveis:        ${dataInvalida.length}`);
    for (const d of dataInvalida.slice(0, 5)) console.log(`     - ${d}`);
  }
  if (casadosPorNome) console.log(`  casados por nome:       ${casadosPorNome}`);
  if (semColaborador.length) {
    console.log(`  sem correspondência:    ${semColaborador.length}`);
    for (const n of semColaborador.slice(0, 10)) console.log(`     - ${n}`);
    if (!CASAR_POR_NOME && colNome) {
      console.log("     (a matrícula do CSV pode ser de outro sistema — tente --casar-por-nome)");
    }
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nada foi gravado.");
    if (eventos.length) {
      console.log("Amostra:");
      console.table(eventos.slice(0, 5).map((e) => ({
        colaborador: colaboradores.find((c) => c.id === e.colaborador_id)?.nome,
        data_documento: e.data_documento,
      })));
    }
    return;
  }

  if (eventos.length === 0) {
    console.log("\nNada a gravar.");
    return;
  }

  // Não duplicar numa reexecução: só grava quem ainda não tem evento estimado.
  const { data: jaTem } = await supabase
    .from("eventos_requisito")
    .select("colaborador_id")
    .eq("tipo_requisito_id", tipo.id)
    .eq("estimado", true);

  const jaEstimados = new Set((jaTem ?? []).map((e) => e.colaborador_id));
  const novos = eventos.filter((e) => !jaEstimados.has(e.colaborador_id));

  if (novos.length < eventos.length) {
    console.log(`  ${eventos.length - novos.length} já tinham evento estimado — ignorados.`);
  }

  if (novos.length) {
    const { error } = await supabase.from("eventos_requisito").insert(novos);
    if (error) {
      console.error("Falha ao inserir eventos:", error.message);
      process.exit(1);
    }
    console.log(`\n${novos.length} evento(s) retroativo(s) criado(s), marcados como estimados.`);
  }

  const { data: resumo } = await supabase.rpc("fn_resumo_status");
  if (resumo?.[0]) {
    const r = resumo[0];
    console.log(
      `\nSemáforo agora: sem_registro=${r.sem_registro} vencido=${r.vencido} ` +
        `critico=${r.critico} atencao=${r.atencao} programar=${r.programar} ok=${r.ok}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
