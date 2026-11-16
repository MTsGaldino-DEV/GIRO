// Testa o núcleo da sincronização com a NEO (lib/sincronizar-neo.ts) sem rede e
// sem banco: o Supabase e a listagem da NEO são injetados.
// Foco: NEO fora do ar / resposta cortada => a RPC de sincronização NEM É CHAMADA e
// nada fica aplicado pela metade; erros não vazam segredo nem detalhe interno.
// Rodar: npm run teste:neo-sincronizar
import assert from "node:assert/strict";
import { executarSincronizacao, resumoContagens } from "../lib/sincronizar-neo.ts";

let falhas = 0;
async function caso(nome, fn) {
  try {
    await fn();
    console.log(`ok   ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHA ${nome}\n     ${e.message}`);
  }
}

// ErroNeo de mentira com o mesmo nome (lib/neo.ts não é importável sem extensão aqui).
class ErroNeoFalso extends Error {
  constructor(m) { super(m); this.name = "ErroNeo"; }
}

const LINHAS = [{ id: "a", nome: "X", ativo: true }, { id: "b", nome: "Y", ativo: false }];
const RELATORIO = {
  total_neo: 2, ligados_novos: 1, atualizados: 1, sem_mudanca: 0, nao_numericas: 0,
  na_neo_fora_do_giro: 0, no_giro_sem_neo: 3,
  divergencias: [{ matricula: 1001, motivo: "cpf_diferente" }],
  matricula_diferente: 0, campos_alterados: { cargo: 1 }, desligados_novos: 0,
  supervisores_vinculados: 1,
  supervisores_sem_vinculo: [{ texto: "Fulano Sem Vinculo", quantidade: 2 }],
  bases: [{ base: "Contagem", quantidade: 2 }],
};

/** Supabase de mentira que guarda as chamadas de rpc. */
function supabaseFalso({ sincronizar = { data: RELATORIO, error: null }, registrar = { data: null, error: null } } = {}) {
  const chamadas = [];
  return {
    chamadas,
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      if (nome === "fn_sincronizar_neo") return sincronizar;
      if (nome === "fn_registrar_falha_neo") return registrar;
      throw new Error(`rpc inesperada: ${nome}`);
    },
  };
}
const nomes = (s) => s.chamadas.map((c) => c.nome);

await caso("sucesso: chama fn_sincronizar_neo com as linhas, p_aplicar e p_origem, e devolve o relatório", async () => {
  const s = supabaseFalso();
  const r = await executarSincronizacao(s, { aplicar: true, origem: "manual", listar: async () => LINHAS });
  assert.deepEqual(nomes(s), ["fn_sincronizar_neo"]);
  assert.deepEqual(s.chamadas[0].args, { p_linhas: LINHAS, p_aplicar: true, p_origem: "manual" });
  assert.deepEqual(r, RELATORIO);
});

await caso("NEO fora do ar (aplicar): a RPC de sincronização não é chamada; a falha é registrada; o erro é relançado", async () => {
  const s = supabaseFalso();
  const erro = new ErroNeoFalso("Não foi possível falar com a NEO.");
  await assert.rejects(
    executarSincronizacao(s, { aplicar: true, origem: "cron", listar: async () => { throw erro; } }),
    (e) => e === erro);
  assert.deepEqual(nomes(s), ["fn_registrar_falha_neo"]);
  assert.deepEqual(s.chamadas[0].args, { p_origem: "cron", p_erro: "Não foi possível falar com a NEO." });
});

await caso("NEO fora do ar (só relatório): nada é chamado no banco; o erro é relançado", async () => {
  const s = supabaseFalso();
  await assert.rejects(
    executarSincronizacao(s, { aplicar: false, origem: "carga", listar: async () => { throw new ErroNeoFalso("Resposta incompleta da NEO."); } }),
    /incompleta/);
  assert.deepEqual(nomes(s), []);
});

await caso("erro que não é da NEO (ex.: bug com segredo na mensagem) não vaza: mensagem genérica", async () => {
  const s = supabaseFalso();
  await assert.rejects(
    executarSincronizacao(s, { aplicar: true, origem: "manual", listar: async () => { throw new TypeError("falha com segredo-123 em https://x"); } }),
    (e) => e instanceof Error && !e.message.includes("segredo-123") && !e.message.includes("https://"));
  assert.deepEqual(nomes(s), ["fn_registrar_falha_neo"]);
  assert.ok(!s.chamadas[0].args.p_erro.includes("segredo-123"));
});

await caso("erro da RPC: registra falha (aplicar) com texto genérico e lança sem o detalhe do Postgres", async () => {
  const s = supabaseFalso({ sincronizar: { data: null, error: { message: "detalhe interno com cpf 123", code: "XX001" } } });
  await assert.rejects(
    executarSincronizacao(s, { aplicar: true, origem: "manual", listar: async () => LINHAS }),
    (e) => e instanceof Error && !e.message.includes("cpf 123") && /XX001/.test(e.message));
  assert.deepEqual(nomes(s), ["fn_sincronizar_neo", "fn_registrar_falha_neo"]);
  assert.ok(!s.chamadas[1].args.p_erro.includes("cpf 123"));
});

await caso("se registrar a falha também falhar, o erro original continua sendo o lançado", async () => {
  const s = supabaseFalso({ registrar: { data: null, error: { message: "sem permissão", code: "42501" } } });
  const erro = new ErroNeoFalso("A NEO recusou o acesso da integração.");
  await assert.rejects(
    executarSincronizacao(s, { aplicar: true, origem: "cron", listar: async () => { throw erro; } }),
    (e) => e === erro);
});

await caso("resumoContagens: listas viram números e nenhuma pessoa, matrícula ou texto aparece", () => {
  const r = resumoContagens(RELATORIO);
  assert.equal(r.divergencias, 1);
  assert.equal(r.supervisores_sem_vinculo, 1);
  assert.equal(r.ligados_novos, 1);
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes("Fulano") && !texto.includes("1001") && !texto.includes("Contagem"));
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntodos os casos passaram");
