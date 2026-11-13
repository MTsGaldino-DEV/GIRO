// Testa a leitura de argumentos do db-push (lógica pura, sem banco).
// Rodar: npm run teste:db-push-args
import assert from "node:assert/strict";
import { selecionarMigrations } from "./lib/db-push-args.mjs";

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

const ARQUIVOS = [
  "0001_schema.sql",
  "0002_maquina_estados.sql",
  "0010_dashboard.sql",
  "0011_fase1_workflow.sql",
  "0016_permissoes_operador.sql",
  "0017_faixa_90_dias.sql",
  "0019_geset.sql",
  "leia-me.txt",
];

function recusa(argv) {
  const r = selecionarMigrations(argv, ARQUIVOS);
  assert.equal(r.ok, false, `esperava recusa, veio ${JSON.stringify(r)}`);
  assert.ok(typeof r.erro === "string" && r.erro.length > 0, "recusa sem mensagem");
  return r;
}

function aceita(argv) {
  const r = selecionarMigrations(argv, ARQUIVOS);
  assert.equal(r.ok, true, `esperava aceitar, veio ${JSON.stringify(r)}`);
  return r;
}

caso("sem argumentos: recusa", () => {
  recusa([]);
});

caso("--only sem valor: recusa", () => {
  recusa(["--only"]);
});

caso("--only vazio: recusa", () => {
  recusa(["--only", ""]);
  recusa(["--only", " , "]);
});

caso("--only seguido de outra opção: recusa", () => {
  recusa(["--only", "--todas"]);
});

caso("--only 001 (três dígitos): recusa, não casa 0010–0019", () => {
  recusa(["--only", "001"]);
});

caso("--only com texto que não é número de 4 dígitos: recusa", () => {
  recusa(["--only", "geset"]);
  recusa(["--only", "00016"]);
  recusa(["--only", "0016_permissoes_operador.sql"]);
});

caso("--only 0016: só 0016", () => {
  const r = aceita(["--only", "0016"]);
  assert.deepEqual(r.arquivos, ["0016_permissoes_operador.sql"]);
  assert.equal(r.todas, false);
});

caso("--only 0016,0017: as duas, em ordem", () => {
  const r = aceita(["--only", "0017,0016"]);
  assert.deepEqual(r.arquivos, ["0016_permissoes_operador.sql", "0017_faixa_90_dias.sql"]);
});

caso("--only=0016 também vale", () => {
  const r = aceita(["--only=0016"]);
  assert.deepEqual(r.arquivos, ["0016_permissoes_operador.sql"]);
});

caso("--only 0001 não pega 0010/0011 (prefixo exato)", () => {
  const r = aceita(["--only", "0001"]);
  assert.deepEqual(r.arquivos, ["0001_schema.sql"]);
});

caso("prefixo inexistente: erro", () => {
  const r = recusa(["--only", "0099"]);
  assert.match(r.erro, /0099/);
});

caso("um prefixo inexistente na lista: erro (não aplica só os outros)", () => {
  const r = recusa(["--only", "0016,0099"]);
  assert.match(r.erro, /0099/);
});

caso("--todas sozinho: recusa", () => {
  recusa(["--todas"]);
});

caso("--sim-eu-sei sozinho: recusa", () => {
  recusa(["--sim-eu-sei"]);
});

caso("--todas --sim-eu-sei: todas as .sql, em ordem", () => {
  const r = aceita(["--todas", "--sim-eu-sei"]);
  assert.equal(r.todas, true);
  assert.deepEqual(r.arquivos, [
    "0001_schema.sql",
    "0002_maquina_estados.sql",
    "0010_dashboard.sql",
    "0011_fase1_workflow.sql",
    "0016_permissoes_operador.sql",
    "0017_faixa_90_dias.sql",
    "0019_geset.sql",
  ]);
});

caso("--todas junto com --only: recusa (ambíguo)", () => {
  recusa(["--todas", "--sim-eu-sei", "--only", "0016"]);
});

caso("opção desconhecida: recusa", () => {
  recusa(["--only", "0016", "--forca"]);
});

if (falhas > 0) {
  console.log(`\n${falhas} caso(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os casos passaram.");
