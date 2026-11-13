// Testa o mapa etapa -> botões da linha do Radar (lógica pura, sem banco).
// Rodar: npm run teste:acoes
import assert from "node:assert/strict";
import { acoesDaEtapa } from "../lib/acoes-etapa.ts";

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

// Spec 2026-11-13-telas-e-fluxo, seção 7.
const PRINCIPAL = {
  previsto: ["solicitar_data", "Pedir data ao supervisor"],
  data_solicitada: ["informar_data", "Informar data"],
  data_proposta: ["agendar", "Agendar"],
  agendado: ["enviar_clinica", "Enviar à clínica"],
  enviado_clinica: ["registrar_resultado", "Registrar resultado"],
  aguardando_documento: ["concluir_documento", "Anexar ASO e concluir"],
  inapto_em_tratativa: ["encerrar_inapto", "Registrar tratativa"],
  concluido: null,
  cancelado: null,
};

// Cancelar só onde fn_transicao_valida aceita `-> cancelado` por cancelamento
// administrativo (o inapto sai por fn_encerrar_inapto, que é o botão principal).
const SECUNDARIAS = {
  previsto: ["perfil", "historico", "cancelar"],
  data_solicitada: ["perfil", "historico", "cancelar"],
  data_proposta: ["devolver", "perfil", "historico", "cancelar"],
  agendado: ["informar_dados", "registrar_falta", "perfil", "historico", "cancelar"],
  enviado_clinica: ["perfil", "historico", "cancelar"],
  aguardando_documento: ["perfil", "historico", "cancelar"],
  inapto_em_tratativa: ["perfil", "historico"],
  concluido: ["perfil", "historico"],
  cancelado: ["perfil", "historico"],
};

for (const [etapa, esperado] of Object.entries(PRINCIPAL)) {
  caso(`principal de ${etapa}`, () => {
    const { principal } = acoesDaEtapa(etapa);
    if (esperado === null) {
      assert.equal(principal, null);
    } else {
      assert.deepEqual(principal, { id: esperado[0], rotulo: esperado[1] });
    }
  });
}

for (const [etapa, esperado] of Object.entries(SECUNDARIAS)) {
  caso(`secundárias de ${etapa}`, () => {
    const { secundarias } = acoesDaEtapa(etapa);
    assert.deepEqual(secundarias.map((a) => a.id), esperado);
    for (const a of secundarias) assert.ok(a.rotulo.trim().length > 0, `rótulo vazio em ${a.id}`);
  });

  caso(`ids únicos em ${etapa}`, () => {
    const { principal, secundarias } = acoesDaEtapa(etapa);
    const ids = [principal?.id, ...secundarias.map((a) => a.id)].filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `repetido: ${ids.join(", ")}`);
  });
}

caso("devolver só em data_proposta", () => {
  for (const etapa of Object.keys(PRINCIPAL)) {
    const tem = acoesDaEtapa(etapa).secundarias.some((a) => a.id === "devolver");
    assert.equal(tem, etapa === "data_proposta", etapa);
  }
});

caso("informar_dados e registrar_falta só em agendado", () => {
  for (const etapa of Object.keys(PRINCIPAL)) {
    const ids = acoesDaEtapa(etapa).secundarias.map((a) => a.id);
    assert.equal(ids.includes("informar_dados"), etapa === "agendado", `informar_dados em ${etapa}`);
    assert.equal(ids.includes("registrar_falta"), etapa === "agendado", `registrar_falta em ${etapa}`);
  }
});

caso("mudar o retorno não altera a tabela", () => {
  const a = acoesDaEtapa("previsto");
  a.principal.rotulo = "x";
  a.secundarias.length = 0;
  const b = acoesDaEtapa("previsto");
  assert.equal(b.principal.rotulo, "Pedir data ao supervisor");
  assert.equal(b.secundarias.length, 3);
});

caso("etapa desconhecida não quebra: sem principal, só consulta", () => {
  const { principal, secundarias } = acoesDaEtapa("etapa_que_nao_existe");
  assert.equal(principal, null);
  assert.deepEqual(secundarias.map((a) => a.id), ["perfil", "historico"]);
});

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
if (falhas > 0) process.exitCode = 1;
