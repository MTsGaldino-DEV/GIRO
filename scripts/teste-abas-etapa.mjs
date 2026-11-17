// Testa as abas de etapa do Radar: contagem, ordem e "sua vez" por papel (lógica pura, sem banco).
// Rodar: npm run teste:abas
import assert from "node:assert/strict";
import { montarAbas } from "../lib/abas-etapa.ts";
import { ETAPAS_ABERTAS } from "../lib/regras-dashboard.ts";

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

const contagens = { previsto: 41, data_solicitada: 12, agendado: 9 };
const suaVez = (papel) => montarAbas(papel, contagens).filter((a) => a.suaVez).map((a) => a.etapa);
const ordenado = (v) => [...v].sort();

caso("primeira aba é Todos, com a soma das contagens", () =>
  assert.deepEqual(montarAbas("qsms", contagens)[0], { etapa: undefined, rotulo: "Todos", quantidade: 62, suaVez: false }));

caso("uma aba por etapa aberta, depois de Todos", () =>
  assert.equal(montarAbas("qsms", contagens).length, 1 + ETAPAS_ABERTAS.length));

caso("abas seguem a ordem de ETAPAS_ABERTAS", () =>
  assert.deepEqual(montarAbas("qsms", contagens).slice(1).map((a) => a.etapa), [...ETAPAS_ABERTAS]));

caso("etapa sem contagem tem quantidade 0", () => {
  const aba = montarAbas("qsms", contagens).find((a) => a.etapa === "enviado_clinica");
  assert.equal(aba?.quantidade, 0);
});

caso("rótulos preenchidos", () => {
  for (const a of montarAbas("qsms", contagens)) assert.ok(a.rotulo.trim().length > 0);
});

caso("qsms: sua vez em previsto, data_proposta, aguardando_documento, inapto_em_tratativa", () =>
  assert.deepEqual(ordenado(suaVez("qsms")), ordenado(["previsto", "data_proposta", "aguardando_documento", "inapto_em_tratativa"])));

caso("admin igual a qsms", () => assert.deepEqual(suaVez("admin"), suaVez("qsms")));

caso("supervisor: sua vez em data_solicitada, agendado, enviado_clinica", () =>
  assert.deepEqual(ordenado(suaVez("supervisor")), ordenado(["data_solicitada", "agendado", "enviado_clinica"])));

caso("papel desconhecido: nenhuma aba com sua vez", () => assert.deepEqual(suaVez("outro"), []));

caso("Todos nunca é sua vez", () => {
  for (const papel of ["qsms", "supervisor", "admin", "outro"]) assert.equal(montarAbas(papel, contagens)[0].suaVez, false);
});

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
if (falhas > 0) process.exitCode = 1;
