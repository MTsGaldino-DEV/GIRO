// Testa os helpers da linha do Radar: coluna "Faltam" e "é a vez de quem olha" (lógica pura).
// Rodar: npm run teste:radar-linha
import assert from "node:assert/strict";
import { textoFaltam, ehVezDe } from "../lib/dominio.ts";

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

caso("vencido com dias negativos (como vem do banco) vira -31d vencido", () =>
  assert.deepEqual(textoFaltam("vencido", -31), { texto: "-31d", vencido: true }));

caso("vencido com dias positivos também vira -31d vencido", () =>
  assert.deepEqual(textoFaltam("vencido", 31), { texto: "-31d", vencido: true }));

caso("crítico com 12 dias", () =>
  assert.deepEqual(textoFaltam("critico", 12), { texto: "12d", vencido: false }));

caso("regular com 0 dias", () =>
  assert.deepEqual(textoFaltam("regular", 0), { texto: "0d", vencido: false }));

caso("sem registro e sem dias vira traço", () =>
  assert.deepEqual(textoFaltam("sem_registro", null), { texto: "—", vencido: false }));

caso("vencido sem dias vira traço e não é marcado como vencido", () =>
  assert.deepEqual(textoFaltam("vencido", null), { texto: "—", vencido: false }));

caso("atenção sem dias vira traço", () =>
  assert.deepEqual(textoFaltam("atencao", null), { texto: "—", vencido: false }));

caso("qsms é a vez do qsms", () => assert.equal(ehVezDe("qsms", "qsms"), true));
caso("admin conta como qsms", () => assert.equal(ehVezDe("admin", "qsms"), true));
caso("supervisor é a vez do supervisor", () => assert.equal(ehVezDe("supervisor", "supervisor"), true));
caso("supervisor não age em etapa do qsms", () => assert.equal(ehVezDe("supervisor", "qsms"), false));
caso("qsms não age em etapa do supervisor", () => assert.equal(ehVezDe("qsms", "supervisor"), false));
caso("admin não age em etapa do supervisor", () => assert.equal(ehVezDe("admin", "supervisor"), false));
caso("ninguém nunca é a vez", () => assert.equal(ehVezDe("qsms", "ninguem"), false));
caso("papel desconhecido nunca é a vez", () => assert.equal(ehVezDe("outro", "qsms"), false));

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nok");
