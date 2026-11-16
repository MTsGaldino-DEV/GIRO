// Testa a leitura do estado da sincronização com a NEO (lib/estado-neo.ts): última
// sincronização bem-sucedida, aviso de falha e nomes de supervisor sem vínculo.
// Lógica pura, sem banco. Rodar: npm run teste:estado-neo
import assert from "node:assert/strict";
import { estadoDaSincronizacao } from "../lib/estado-neo.ts";

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

const ok = (em, semVinculo = []) => ({
  iniciado_em: em, origem: "cron", erro: null,
  resumo: { total_neo: 10, supervisores_sem_vinculo: semVinculo },
});
const falha = (em) => ({ iniciado_em: em, origem: "manual", erro: "A NEO recusou o acesso da integração.", resumo: null });

caso("sem nenhuma tentativa: nada de última sincronização, sem aviso", () => {
  assert.deepEqual(estadoDaSincronizacao([]), { ultimaSucessoEm: null, ultimaFalhou: false, semVinculo: [] });
});

caso("a mais recente deu certo: devolve a data dela e sem aviso", () => {
  const e = estadoDaSincronizacao([ok("2026-11-17T08:30:00Z"), ok("2026-11-16T08:30:00Z")]);
  assert.equal(e.ultimaSucessoEm, "2026-11-17T08:30:00Z");
  assert.equal(e.ultimaFalhou, false);
});

caso("a mais recente falhou: avisa, mas a última sincronização é a bem-sucedida anterior", () => {
  const e = estadoDaSincronizacao([falha("2026-11-17T09:00:00Z"), ok("2026-11-16T08:30:00Z")]);
  assert.equal(e.ultimaFalhou, true);
  assert.equal(e.ultimaSucessoEm, "2026-11-16T08:30:00Z");
});

caso("só falhas: avisa e não há última sincronização", () => {
  const e = estadoDaSincronizacao([falha("2026-11-17T09:00:00Z")]);
  assert.equal(e.ultimaFalhou, true);
  assert.equal(e.ultimaSucessoEm, null);
});

caso("nomes sem vínculo vêm do resumo da última sincronização bem-sucedida, na ordem recebida", () => {
  const e = estadoDaSincronizacao([
    falha("2026-11-17T09:00:00Z"),
    ok("2026-11-16T08:30:00Z", [{ texto: "Zé Ninguém", quantidade: 3 }, { texto: "Maria S.", quantidade: 1 }]),
    ok("2026-11-15T08:30:00Z", [{ texto: "Antigo", quantidade: 9 }]),
  ]);
  assert.deepEqual(e.semVinculo, [{ texto: "Zé Ninguém", quantidade: 3 }, { texto: "Maria S.", quantidade: 1 }]);
});

caso("resumo malformado não quebra: entradas inválidas são descartadas", () => {
  const e = estadoDaSincronizacao([{
    iniciado_em: "2026-11-16T08:30:00Z", origem: "cron", erro: null,
    resumo: { supervisores_sem_vinculo: [{ texto: "Ok", quantidade: 2 }, { quantidade: 1 }, { texto: 5, quantidade: 1 }, null, { texto: "Sem qtd" }] },
  }]);
  assert.deepEqual(e.semVinculo, [{ texto: "Ok", quantidade: 2 }]);
  const f = estadoDaSincronizacao([{ iniciado_em: "2026-11-16T08:30:00Z", origem: "cron", erro: null, resumo: null }]);
  assert.deepEqual(f.semVinculo, []);
  const g = estadoDaSincronizacao([{ iniciado_em: "2026-11-16T08:30:00Z", origem: "cron", erro: null, resumo: { supervisores_sem_vinculo: "texto" } }]);
  assert.deepEqual(g.semVinculo, []);
});

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntodos os casos passaram");
