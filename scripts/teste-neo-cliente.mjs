// Testa o cliente da NEO (lib/neo.ts): paginação, conferência do total, erros e
// ausência de segredo nas mensagens. Sem rede e sem banco: `fetch` é injetado.
// Rodar: npm run teste:neo-cliente
import assert from "node:assert/strict";
import { ErroNeo, listarColaboradoresNeo, validarLinha } from "../lib/neo.ts";

let falhas = 0;
async function caso(nome, fn) {
  try {
    await fn();
    console.log(`ok   ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHA ${nome}\n     ${e.message}`);
  }
}

const SEGREDO = "segredo-super-secreto-123";
const URL_NEO = "https://neo.exemplo.invalido/functions/v1/giro-colaboradores";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const linha = (n, extra = {}) => ({
  id: uuid(n), nome: `Pessoa ${n}`, cpf: null, matricula_cemig: null, matricula_engelmig: String(n),
  cargo: null, supervisor: null, base: null, data_admissao: null, data_desligamento: null,
  ativo: true, atualizado_em: "2026-11-16T10:00:00Z", ...extra,
});

/** Resposta falsa no formato do fetch. */
const resposta = (corpo, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (corpo instanceof Error) throw corpo;
    return corpo;
  },
});

/** `fetch` falso que serve `paginas` em ordem e guarda o que recebeu. */
function falso(paginas) {
  const chamadas = [];
  const buscar = async (url, init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    const p = paginas[chamadas.length - 1];
    if (p === undefined) throw new Error("chamada a mais do que o esperado");
    return typeof p === "function" ? p() : p;
  };
  return { buscar, chamadas };
}

const opcoes = (buscar, extra = {}) => ({ buscar, url: URL_NEO, segredo: SEGREDO, ...extra });
const pagina = (de, ate, proxima, total) => resposta({
  linhas: Array.from({ length: ate - de + 1 }, (_, i) => linha(de + i)),
  proxima, total,
});

await caso("três páginas (500, 500, 120) viram 1120 linhas, em ordem", async () => {
  const { buscar, chamadas } = falso([
    pagina(1, 500, uuid(500), 1120),
    pagina(501, 1000, uuid(1000), 1120),
    pagina(1001, 1120, null, 1120),
  ]);
  const r = await listarColaboradoresNeo(opcoes(buscar));
  assert.equal(r.length, 1120);
  assert.equal(r[0].id, uuid(1));
  assert.equal(r[1119].id, uuid(1120));
  assert.equal(chamadas.length, 3);
});

await caso("a primeira chamada não manda apos; as seguintes mandam o cursor", async () => {
  const { buscar, chamadas } = falso([
    pagina(1, 2, uuid(2), 3),
    pagina(3, 3, null, 3),
  ]);
  await listarColaboradoresNeo(opcoes(buscar));
  assert.deepEqual(chamadas[0].corpo, { acao: "listar" });
  assert.deepEqual(chamadas[1].corpo, { acao: "listar", apos: uuid(2) });
});

await caso("o cabeçalho x-giro-segredo vai em todas as chamadas, por POST, na URL configurada", async () => {
  const { buscar, chamadas } = falso([pagina(1, 2, uuid(2), 3), pagina(3, 3, null, 3)]);
  await listarColaboradoresNeo(opcoes(buscar));
  for (const c of chamadas) {
    assert.equal(c.url, URL_NEO);
    assert.equal(c.init.method, "POST");
    assert.equal(c.init.headers["x-giro-segredo"], SEGREDO);
  }
});

await caso("total diferente do recebido lança ErroNeo (resposta incompleta)", async () => {
  const { buscar } = falso([pagina(1, 3, null, 4)]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)),
    (e) => e instanceof ErroNeo && e.message === "Resposta incompleta da NEO.");
});

await caso("HTTP 401: ErroNeo e a mensagem não contém o segredo", async () => {
  const { buscar } = falso([resposta({ erro: `segredo ${SEGREDO} recusado` }, 401)]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), (e) =>
    e instanceof ErroNeo && !e.message.includes(SEGREDO) && !e.message.includes("recusado"));
});

await caso("HTTP 500 lança ErroNeo sem o corpo da resposta", async () => {
  const { buscar } = falso([resposta({ erro: "detalhe interno do servidor" }, 500)]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), (e) =>
    e instanceof ErroNeo && e.message.includes("500") && !e.message.includes("detalhe interno"));
});

await caso("rede caindo (fetch rejeitado) lança ErroNeo sem repassar a mensagem original", async () => {
  const { buscar } = falso([() => { throw new Error(`falha de rede em ${URL_NEO} com ${SEGREDO}`); }]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), (e) =>
    e instanceof ErroNeo && !e.message.includes(SEGREDO) && !e.message.includes("neo.exemplo"));
});

await caso("corpo que não é JSON lança ErroNeo", async () => {
  const { buscar } = falso([resposta(new Error("Unexpected token <"))]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), ErroNeo);
});

await caso("linhas que não é array lança ErroNeo", async () => {
  const { buscar } = falso([resposta({ linhas: "nada", proxima: null, total: 0 })]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), ErroNeo);
});

await caso("linha sem ativo lança ErroNeo", async () => {
  const ruim = linha(1);
  delete ruim.ativo;
  const { buscar } = falso([resposta({ linhas: [ruim], proxima: null, total: 1 })]);
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), ErroNeo);
});

await caso("sem url ou sem segredo: ErroNeo('Integração com a NEO não configurada.')", async () => {
  const { buscar } = falso([]);
  for (const extra of [{ url: "" }, { segredo: "" }, { url: undefined, segredo: undefined }]) {
    await assert.rejects(
      listarColaboradoresNeo({ buscar, url: URL_NEO, segredo: SEGREDO, ...extra }),
      (e) => e instanceof ErroNeo && e.message === "Integração com a NEO não configurada.");
  }
});

await caso("mais de 20 páginas lança ErroNeo (proteção contra laço)", async () => {
  const sempre = () => resposta({ linhas: [linha(1)], proxima: uuid(1), total: 999 });
  const buscar = async () => sempre();
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar)), (e) =>
    e instanceof ErroNeo && /páginas/.test(e.message));
});

await caso("tempo limite: fetch que não responde vira ErroNeo", async () => {
  const buscar = (url, init) => new Promise((_, rejeitar) => {
    init.signal.addEventListener("abort", () => rejeitar(new Error("abortado")));
  });
  const t0 = Date.now();
  await assert.rejects(listarColaboradoresNeo(opcoes(buscar, { tempoLimiteMs: 40 })), (e) =>
    e instanceof ErroNeo && /tempo/i.test(e.message));
  assert.ok(Date.now() - t0 < 2000, "demorou demais para estourar o tempo limite");
});

await caso("validarLinha aceita a linha completa e normaliza campos ausentes para null", () => {
  const v = validarLinha({ id: uuid(1), nome: "A", ativo: false, atualizado_em: "t" });
  assert.equal(v.cpf, null);
  assert.equal(v.supervisor, null);
  assert.equal(v.ativo, false);
});

await caso("validarLinha rejeita tipos errados e datas fora do formato", () => {
  assert.throws(() => validarLinha(null), ErroNeo);
  assert.throws(() => validarLinha({ ...linha(1), id: 5 }), ErroNeo);
  assert.throws(() => validarLinha({ ...linha(1), nome: undefined }), ErroNeo);
  assert.throws(() => validarLinha({ ...linha(1), ativo: "sim" }), ErroNeo);
  assert.throws(() => validarLinha({ ...linha(1), cpf: 123 }), ErroNeo);
  assert.throws(() => validarLinha({ ...linha(1), data_desligamento: "16/11/2026" }), ErroNeo);
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntodos os casos passaram");
