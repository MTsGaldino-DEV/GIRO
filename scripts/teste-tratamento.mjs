// Testa a lógica pura da tela de Tratamento (sem banco).
// Rodar: npm run teste:tratamento
import assert from "node:assert/strict";
import { TIPOS_TAREFA, montarTarefas, contarPorTipo } from "../lib/consulta-tratamento.ts";

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

const ASO = "ASO Periódico";
const AVP = "Avaliação Psicossocial (AVP)";

/** Colaborador sem nenhuma lacuna; cada caso estraga só o que testa. */
const pessoa = (id, extra = {}) => ({
  id,
  nome: `PESSOA ${id}`,
  matricula: 1000,
  ativo: true,
  supervisor_id: "sup-1",
  neo_id: "neo-1",
  ...extra,
});
const tipos = (tarefas) => tarefas.map((t) => t.tipo);

caso("sem supervisor", () => {
  const r = montarTarefas([pessoa("a", { supervisor_id: null })], []);
  assert.deepEqual(tipos(r), ["sem_supervisor"]);
  assert.equal(r[0].colaboradorId, "a");
  assert.equal(r[0].chave, "sem_supervisor:a");
});

caso("sem ASO só quando sem_registro", () => {
  assert.deepEqual(tipos(montarTarefas([pessoa("a")], [{ colaborador_id: "a", requisito: ASO, status: "sem_registro" }])), ["sem_aso"]);
  assert.deepEqual(tipos(montarTarefas([pessoa("a")], [{ colaborador_id: "a", requisito: ASO, status: "vencido" }])), []);
});

caso("sem AVP", () => {
  const r = montarTarefas([pessoa("a")], [{ colaborador_id: "a", requisito: AVP, status: "sem_registro" }]);
  assert.deepEqual(tipos(r), ["sem_avp"]);
});

caso("fora da NEO", () => {
  assert.deepEqual(tipos(montarTarefas([pessoa("a", { neo_id: null })], [])), ["fora_neo"]);
});

caso("duas lacunas, duas linhas", () => {
  const r = montarTarefas(
    [pessoa("a", { supervisor_id: null })],
    [{ colaborador_id: "a", requisito: ASO, status: "sem_registro" }]
  );
  assert.deepEqual(tipos(r), ["sem_supervisor", "sem_aso"]);
  assert.notEqual(r[0].chave, r[1].chave);
});

caso("desligado não entra", () => {
  const r = montarTarefas(
    [pessoa("a", { ativo: false, supervisor_id: null, neo_id: null })],
    [
      { colaborador_id: "a", requisito: ASO, status: "sem_registro" },
      { colaborador_id: "a", requisito: AVP, status: "sem_registro" },
    ]
  );
  assert.deepEqual(r, []);
});

caso("ordem: por tipo, depois nome em português", () => {
  const r = montarTarefas(
    [
      pessoa("b", { nome: "BRUNO", neo_id: null }),
      pessoa("a", { nome: "ÁLVARO", neo_id: null }),
      pessoa("c", { nome: "CARLA", supervisor_id: null }),
    ],
    []
  );
  assert.deepEqual(r.map((t) => `${t.tipo}:${t.nome}`), ["sem_supervisor:CARLA", "fora_neo:ÁLVARO", "fora_neo:BRUNO"]);
  assert.deepEqual(TIPOS_TAREFA, ["sem_supervisor", "sem_aso", "sem_avp", "fora_neo"]);
});

caso("contarPorTipo traz os quatro tipos, inclusive zero", () => {
  const r = montarTarefas([pessoa("a", { neo_id: null })], []);
  assert.deepEqual(contarPorTipo(r), { sem_supervisor: 0, sem_aso: 0, sem_avp: 0, fora_neo: 1 });
});

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTodos os casos passaram.");
