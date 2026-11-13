// Testa a lógica pura de escopo do Radar (sem banco).
// Rodar: npm run teste:consulta
import assert from "node:assert/strict";
import {
  equipePadrao,
  resolverEquipe,
  equipeSemVinculo,
  filtrosParaBusca,
} from "../lib/consulta-itens.ts";

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

const supervisor = { papel: "supervisor", supervisor_id: "sup-1" };
const supervisorSemEquipe = { papel: "supervisor", supervisor_id: null };
const qsms = { papel: "qsms", supervisor_id: null };
const admin = { papel: "admin", supervisor_id: null };

caso("padrão: supervisor = minha", () => assert.equal(resolverEquipe(supervisor, {}), "minha"));
caso("padrão: qsms = todas", () => assert.equal(resolverEquipe(qsms, {}), "todas"));
caso("padrão: admin = todas", () => assert.equal(resolverEquipe(admin, {}), "todas"));
caso("supervisor escolhe todas", () =>
  assert.equal(resolverEquipe(supervisor, { equipe: "todas" }), "todas"));
caso("qsms com vínculo pode escolher minha", () =>
  assert.equal(resolverEquipe({ papel: "qsms", supervisor_id: "sup-2" }, { equipe: "minha" }), "minha"));
caso("qsms sem vínculo pedindo minha cai em todas", () =>
  assert.equal(resolverEquipe(qsms, { equipe: "minha" }), "todas"));
caso("valor inválido na URL cai no padrão", () => {
  assert.equal(resolverEquipe(supervisor, { equipe: "xyz" }), "minha");
  assert.equal(resolverEquipe(qsms, { equipe: "xyz" }), "todas");
});
caso("supervisor sem equipe: minha continua minha, mas sem vínculo", () => {
  const eq = resolverEquipe(supervisorSemEquipe, {});
  assert.equal(eq, "minha");
  assert.equal(equipeSemVinculo(supervisorSemEquipe, eq), true);
});
caso("supervisor sem equipe escolhendo todas não é 'sem vínculo'", () => {
  const eq = resolverEquipe(supervisorSemEquipe, { equipe: "todas" });
  assert.equal(eq, "todas");
  assert.equal(equipeSemVinculo(supervisorSemEquipe, eq), false);
});
caso("supervisor com equipe não é 'sem vínculo'", () =>
  assert.equal(equipeSemVinculo(supervisor, "minha"), false));
caso("equipePadrao", () => {
  assert.equal(equipePadrao(supervisor), "minha");
  assert.equal(equipePadrao(qsms), "todas");
});

caso("URL: equipe igual ao padrão não aparece", () =>
  assert.equal(filtrosParaBusca({ equipe: "minha" }, "minha"), ""));
caso("URL: equipe diferente do padrão aparece e volta igual", () => {
  const busca = filtrosParaBusca({ equipe: "todas", status: "vencido" }, "minha");
  const lido = Object.fromEntries(new URLSearchParams(busca));
  assert.deepEqual(lido, { equipe: "todas", status: "vencido" });
  assert.equal(resolverEquipe(supervisor, lido), "todas");
});
caso("URL: sem padrão informado mantém equipe", () =>
  assert.equal(filtrosParaBusca({ equipe: "minha" }), "equipe=minha"));

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
