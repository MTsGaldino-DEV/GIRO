// Testa a leitura dos argumentos do script da primeira carga da NEO
// (scripts/lib/neo-carga-args.mjs). O script padrão só gera RELATÓRIO; aplicar exige
// três coisas juntas, e o backup tem de ficar fora do repositório.
// Rodar: npm run teste:neo-carga-args
import assert from "node:assert/strict";
import path from "node:path";
import { interpretarArgs } from "./lib/neo-carga-args.mjs";

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

const RAIZ = path.resolve("/projeto/giro");
const FORA = path.resolve("/backups/neo-carga.json");

caso("sem argumentos: modo relatório (não grava)", () => {
  assert.deepEqual(interpretarArgs([], RAIZ), { ok: true, modo: "relatorio", backup: null });
});

caso("--aplicar sozinho é recusado com mensagem clara", () => {
  const r = interpretarArgs(["--aplicar"], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /--sim-eu-sei/);
  assert.match(r.erro, /--backup/);
});

caso("--aplicar sem --backup é recusado", () => {
  const r = interpretarArgs(["--aplicar", "--sim-eu-sei"], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /--backup/);
});

caso("--aplicar sem --sim-eu-sei é recusado", () => {
  const r = interpretarArgs(["--aplicar", "--backup", FORA], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /--sim-eu-sei/);
});

caso("--aplicar completo, com backup fora do repositório, é aceito", () => {
  const r = interpretarArgs(["--aplicar", "--sim-eu-sei", "--backup", FORA], RAIZ);
  assert.deepEqual(r, { ok: true, modo: "aplicar", backup: FORA });
});

caso("backup dentro do repositório é recusado (dados pessoais não ficam perto do Git)", () => {
  const dentro = path.join(RAIZ, "backup.json");
  const r = interpretarArgs(["--aplicar", "--sim-eu-sei", "--backup", dentro], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /fora do repositório/);
  const r2 = interpretarArgs(["--aplicar", "--sim-eu-sei", "--backup", RAIZ], RAIZ);
  assert.equal(r2.ok, false);
});

caso("backup com caminho relativo é resolvido a partir do repositório e recusado se cair dentro dele", () => {
  const r = interpretarArgs(["--aplicar", "--sim-eu-sei", "--backup", "backup.json"], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /fora do repositório/);
});

caso("--backup sem --aplicar é recusado (evita achar que gravou backup num relatório)", () => {
  const r = interpretarArgs(["--backup", FORA], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /--aplicar/);
});

caso("--backup sem valor e argumento desconhecido são recusados", () => {
  assert.equal(interpretarArgs(["--aplicar", "--sim-eu-sei", "--backup"], RAIZ).ok, false);
  const r = interpretarArgs(["--qualquer"], RAIZ);
  assert.equal(r.ok, false);
  assert.match(r.erro, /--qualquer/);
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntodos os casos passaram");
