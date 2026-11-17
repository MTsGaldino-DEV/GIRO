// Testa a faixa "Para você agir" do Radar: quais etapas cada papel enxerga (lógica pura, sem banco).
// Rodar: npm run teste:faixa
import assert from "node:assert/strict";
import { acoesDaEtapa, entradasDaFaixa, FAIXA_PARA_AGIR } from "../lib/acoes-etapa.ts";

let falhas = 0;
function caso(nome, fn) {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHA ${nome}\n     ${e.message}`);
  }
}

const etapas = (papel) => entradasDaFaixa(papel).map((e) => e.etapa);

caso("supervisor: data_solicitada, agendado, enviado_clinica, nessa ordem", () =>
  assert.deepEqual(etapas("supervisor"), ["data_solicitada", "agendado", "enviado_clinica"]));

caso("qsms: previsto, data_proposta, aguardando_documento, inapto_em_tratativa", () =>
  assert.deepEqual(etapas("qsms"), ["previsto", "data_proposta", "aguardando_documento", "inapto_em_tratativa"]));

// Mesma tabela do dono em vw_itens_abertos (migration 0025). Admin opera como qsms.
caso("faixa casa com o dono da view", () => {
  const donoDaView = {
    previsto: "qsms",
    data_solicitada: "supervisor",
    data_proposta: "qsms",
    agendado: "supervisor",
    enviado_clinica: "supervisor",
    aguardando_documento: "qsms",
    inapto_em_tratativa: "qsms",
  };
  for (const [etapa, dono] of Object.entries(donoDaView)) {
    const papeis = ["supervisor", "qsms"].filter((p) => etapas(p).includes(etapa));
    assert.deepEqual(papeis, [dono], `${etapa}: faixa de ${papeis.join(",") || "ninguém"}, esperado ${dono}`);
  }
});

caso("admin vê a faixa do qsms", () => assert.deepEqual(etapas("admin"), etapas("qsms")));

caso("papel desconhecido: faixa vazia", () => assert.deepEqual(entradasDaFaixa("outro"), []));

caso("nenhuma etapa aparece nas faixas dos dois papéis", () => {
  const sup = new Set(etapas("supervisor"));
  for (const e of etapas("qsms")) assert.ok(!sup.has(e), `${e} repetida`);
});

caso("cada etapa da faixa tem ação principal conhecida", () => {
  for (const papel of ["supervisor", "qsms"]) {
    for (const { etapa } of entradasDaFaixa(papel)) {
      const { principal } = acoesDaEtapa(etapa);
      assert.ok(principal && principal.id, `${etapa} sem ação principal`);
    }
  }
});

caso("rótulos preenchidos e únicos dentro da faixa", () => {
  for (const papel of Object.keys(FAIXA_PARA_AGIR)) {
    const rotulos = entradasDaFaixa(papel).map((e) => e.rotulo);
    for (const r of rotulos) assert.ok(r.trim().length > 0);
    assert.equal(new Set(rotulos).size, rotulos.length);
  }
});

caso("rótulos combinados com a spec", () => {
  const rotulo = (papel, etapa) => entradasDaFaixa(papel).find((e) => e.etapa === etapa)?.rotulo;
  assert.equal(rotulo("supervisor", "data_solicitada"), "Informar data");
  assert.equal(rotulo("supervisor", "enviado_clinica"), "Registrar resultado");
  assert.equal(rotulo("qsms", "previsto"), "Pedir data");
  assert.equal(rotulo("qsms", "data_proposta"), "Agendar");
  assert.equal(rotulo("qsms", "inapto_em_tratativa"), "Tratativa");
  assert.equal(rotulo("supervisor", "agendado"), "Enviar à clínica");
  assert.equal(rotulo("qsms", "aguardando_documento"), "Anexar ASO");
});

caso("mudar o retorno não altera a tabela", () => {
  const a = entradasDaFaixa("supervisor");
  a.length = 0;
  assert.equal(entradasDaFaixa("supervisor").length, 3);
});

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
if (falhas > 0) process.exitCode = 1;
