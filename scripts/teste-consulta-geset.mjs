// Testa a lógica pura da fila "Falta lançar no GESET" (sem banco).
// Rodar: npm run teste:geset-ui
import assert from "node:assert/strict";
import {
  POR_PAGINA_GESET,
  limparBuscaGeset,
  normalizarFiltrosGeset,
  filtrosGesetParaBusca,
  totalDePaginas,
  montarConsultaGeset,
  buscarPendenciasGeset,
  contarPendenciasGeset,
} from "../lib/consulta-geset.ts";

let falhas = 0;
const pendentes = [];
function caso(nome, fn) {
  pendentes.push(
    Promise.resolve()
      .then(fn)
      .then(() => console.log(`ok   ${nome}`))
      .catch((e) => {
        falhas++;
        console.log(`FALHA ${nome}\n     ${e.message}`);
      })
  );
}

/**
 * Cliente falso: grava cada chamada encadeada e responde `resultado` ao
 * `await`. Basta para conferir a consulta montada sem abrir banco.
 */
function clienteFalso(resultado = { data: [], error: null, count: 0 }) {
  const chamadas = [];
  const construtor = new Proxy(
    {},
    {
      get(_, metodo) {
        if (metodo === "then") {
          return (ok, falha) => Promise.resolve(resultado).then(ok, falha);
        }
        return (...args) => {
          chamadas.push([metodo, ...args]);
          return construtor;
        };
      },
    }
  );
  return {
    chamadas,
    from(tabela) {
      chamadas.push(["from", tabela]);
      return construtor;
    },
  };
}

// --- limparBuscaGeset ------------------------------------------------------
caso("busca: vírgula, parênteses, curingas e barra viram espaço", () => {
  assert.equal(limparBuscaGeset("AN,A"), "AN A");
  assert.equal(limparBuscaGeset("(%x*)"), "x");
  assert.equal(limparBuscaGeset("a\\b"), "a b");
});
caso("busca: indefinida vira vazio", () => assert.equal(limparBuscaGeset(undefined), ""));
caso("busca: só espaços vira vazio", () => assert.equal(limparBuscaGeset("   "), ""));

// --- normalizarFiltrosGeset ------------------------------------------------
caso("filtros: padrão é busca vazia, sem requisito, página 1", () =>
  assert.deepEqual(normalizarFiltrosGeset({}), { busca: "", requisito: undefined, pagina: 1 }));
caso("filtros: página inválida ou menor que 1 cai em 1", () => {
  assert.equal(normalizarFiltrosGeset({ pagina: 0 }).pagina, 1);
  assert.equal(normalizarFiltrosGeset({ pagina: -3 }).pagina, 1);
  assert.equal(normalizarFiltrosGeset({ pagina: Number.NaN }).pagina, 1);
  assert.equal(normalizarFiltrosGeset({ pagina: "abc" }).pagina, 1);
});
caso("filtros: página vinda da URL como texto", () =>
  assert.equal(normalizarFiltrosGeset({ pagina: "3" }).pagina, 3));
caso("filtros: página fracionária é arredondada para baixo", () =>
  assert.equal(normalizarFiltrosGeset({ pagina: 2.9 }).pagina, 2));
caso("filtros: requisito vazio vira indefinido", () =>
  assert.equal(normalizarFiltrosGeset({ requisito: "" }).requisito, undefined));
caso("filtros: busca é aparada e higienizada", () =>
  assert.equal(normalizarFiltrosGeset({ busca: " Ana, " }).busca, "Ana"));

// --- filtrosGesetParaBusca -------------------------------------------------
caso("URL: sempre leva fila=geset", () => assert.equal(filtrosGesetParaBusca({}), "fila=geset"));
caso("URL: inclui busca, requisito e página > 1", () => {
  const lido = Object.fromEntries(
    new URLSearchParams(filtrosGesetParaBusca({ busca: "ana", requisito: "ASO", pagina: 2 }))
  );
  assert.deepEqual(lido, { fila: "geset", busca: "ana", requisito: "ASO", pagina: "2" });
});
caso("URL: página 1 não aparece", () => assert.equal(filtrosGesetParaBusca({ pagina: 1 }), "fila=geset"));

// --- totalDePaginas --------------------------------------------------------
caso("páginas: 0 linhas = 1 página; 25 = 1; 26 = 2; 73 = 3", () => {
  assert.equal(POR_PAGINA_GESET, 25);
  assert.equal(totalDePaginas(0), 1);
  assert.equal(totalDePaginas(25), 1);
  assert.equal(totalDePaginas(26), 2);
  assert.equal(totalDePaginas(73), 3);
});

// --- montarConsultaGeset ---------------------------------------------------
caso("consulta: view certa, contagem exata, vencimento depois nome, 25 por página", () => {
  const c = clienteFalso();
  montarConsultaGeset(c, {});
  assert.deepEqual(c.chamadas[0], ["from", "vw_pendencias_geset"]);
  assert.deepEqual(c.chamadas[1], ["select", "*", { count: "exact" }]);
  assert.deepEqual(c.chamadas[2], ["order", "data_vencimento", { ascending: true }]);
  assert.deepEqual(c.chamadas[3], ["order", "nome", { ascending: true }]);
  assert.deepEqual(c.chamadas.at(-1), ["range", 0, 24]);
});
caso("consulta: página 3 pede 50–74", () => {
  const c = clienteFalso();
  montarConsultaGeset(c, { pagina: 3 });
  assert.deepEqual(c.chamadas.at(-1), ["range", 50, 74]);
});
caso("consulta: texto vira 'contém' no nome", () => {
  const c = clienteFalso();
  montarConsultaGeset(c, { busca: "ana," });
  assert.ok(c.chamadas.some((x) => x[0] === "ilike" && x[1] === "nome" && x[2] === "%ana%"));
  assert.ok(!c.chamadas.some((x) => x[0] === "or"));
});
caso("consulta: só dígitos procura matrícula exata ou nome", () => {
  const c = clienteFalso();
  montarConsultaGeset(c, { busca: "12345" });
  assert.ok(c.chamadas.some((x) => x[0] === "or" && x[1] === "matricula.eq.12345,nome.ilike.%12345%"));
});
caso("consulta: requisito filtra por igualdade", () => {
  const c = clienteFalso();
  montarConsultaGeset(c, { requisito: "AVP" });
  assert.ok(c.chamadas.some((x) => x[0] === "eq" && x[1] === "requisito" && x[2] === "AVP"));
});
caso("consulta: sem filtros não filtra", () => {
  const c = clienteFalso();
  montarConsultaGeset(c, {});
  assert.ok(!c.chamadas.some((x) => ["eq", "ilike", "or"].includes(x[0])));
});

// --- buscarPendenciasGeset -------------------------------------------------
caso("buscar: devolve linhas e total", async () => {
  const c = clienteFalso({ data: [{ evento_id: "a" }], error: null, count: 73 });
  const r = await buscarPendenciasGeset(c, {});
  assert.deepEqual(r, { linhas: [{ evento_id: "a" }], total: 73, erro: null });
});
caso("buscar: erro vira mensagem, não zero silencioso", async () => {
  const c = clienteFalso({ data: null, error: { message: "falhou" }, count: null });
  const r = await buscarPendenciasGeset(c, {});
  assert.equal(r.erro, "falhou");
  assert.deepEqual(r.linhas, []);
});

// --- contarPendenciasGeset -------------------------------------------------
caso("contar: head + contagem exata na view", async () => {
  const c = clienteFalso({ data: null, error: null, count: 73 });
  assert.equal(await contarPendenciasGeset(c), 73);
  assert.deepEqual(c.chamadas[0], ["from", "vw_pendencias_geset"]);
  assert.deepEqual(c.chamadas[1], ["select", "evento_id", { count: "exact", head: true }]);
});
caso("contar: erro devolve null, nunca 0", async () => {
  const c = clienteFalso({ data: null, error: { message: "x" }, count: null });
  assert.equal(await contarPendenciasGeset(c), null);
});
caso("contar: contagem ausente sem erro devolve null", async () => {
  const c = clienteFalso({ data: null, error: null, count: null });
  assert.equal(await contarPendenciasGeset(c), null);
});

await Promise.all(pendentes);
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
