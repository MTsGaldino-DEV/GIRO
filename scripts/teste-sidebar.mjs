// Testa as regras puras da sidebar: estado inicial pelo cookie e iniciais do avatar (sem banco).
// Rodar: npm run teste:sidebar
import assert from "node:assert/strict";
import { estaRecolhida, iniciais } from "../lib/sidebar.ts";

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

caso("sem cookie: nasce recolhida", () => assert.equal(estaRecolhida(undefined), true));
caso("cookie 'recolhida': recolhida", () => assert.equal(estaRecolhida("recolhida"), true));
caso("cookie 'aberta': aberta", () => assert.equal(estaRecolhida("aberta"), false));
caso("cookie com valor desconhecido: recolhida", () => assert.equal(estaRecolhida("lixo"), true));

caso("iniciais: nome e sobrenome", () => assert.equal(iniciais("Maria da Silva"), "MS"));
caso("iniciais: um nome só", () => assert.equal(iniciais("ana"), "A"));
caso("iniciais: só espaços", () => assert.equal(iniciais("  "), "?"));
caso("iniciais: minúsculas viram maiúsculas, usa primeiro e último", () =>
  assert.equal(iniciais("joão pedro souza"), "JS"));

if (falhas > 0) {
  console.log(`\n${falhas} caso(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os casos passaram.");
