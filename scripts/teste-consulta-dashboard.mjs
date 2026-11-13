// Testa a lógica pura do Dashboard (sem banco).
// Rodar: npm run teste:dashboard
import assert from "node:assert/strict";
import {
  resolverEscopoDashboard,
  podeEscolherEquipe,
  lerDetalhe,
  detalheParaTexto,
  hrefDashboard,
  piorPorPessoa,
  resumirPorPessoa,
  percentual,
  contarPorEtapa,
  agruparEtapas,
  totalPorDono,
  porResponsavel,
  maisProximosDeVencer,
  mediaDiasParados,
  mediaDiasPorEtapa,
  primeiroDiaDoMes,
  conclusoesPorMes,
  montarDetalhe,
} from "../lib/regras-dashboard.ts";
import { buscarTodas } from "../lib/consulta-dashboard.ts";

let falhas = 0;
const pendentes = [];
function caso(nome, fn) {
  pendentes.push(
    Promise.resolve()
      .then(fn)
      .then(() => console.log(`ok   ${nome}`))
      .catch((e) => {
        falhas++;
        console.log(`FALHA ${nome}\n     ${e.message}`);
      })
  );
}

// --- escopo ----------------------------------------------------------------
const supervisor = { papel: "supervisor", supervisor_id: "sup-1" };
const supervisorSemEquipe = { papel: "supervisor", supervisor_id: null };
const qsms = { papel: "qsms", supervisor_id: null };

caso("escopo: padrão é a UEN para todos, inclusive supervisor", () => {
  assert.equal(resolverEscopoDashboard(supervisor, undefined), "todas");
  assert.equal(resolverEscopoDashboard(qsms, undefined), "todas");
});
caso("escopo: supervisor com equipe pode pedir a sua", () =>
  assert.equal(resolverEscopoDashboard(supervisor, "minha"), "minha"));
caso("escopo: sem supervisor_id, 'minha' cai na UEN", () => {
  assert.equal(resolverEscopoDashboard(qsms, "minha"), "todas");
  assert.equal(resolverEscopoDashboard(supervisorSemEquipe, "minha"), "todas");
});
caso("escopo: valor desconhecido cai na UEN", () =>
  assert.equal(resolverEscopoDashboard(supervisor, "xyz"), "todas"));
caso("escopo: segmento só para quem tem supervisor_id", () => {
  assert.equal(podeEscolherEquipe(supervisor), true);
  assert.equal(podeEscolherEquipe(qsms), false);
  assert.equal(podeEscolherEquipe(supervisorSemEquipe), false);
});

// --- chave de detalhe ------------------------------------------------------
caso("detalhe: status válidos", () => {
  for (const s of ["vencido", "sem_registro", "critico", "atencao", "programar", "ok"]) {
    assert.deepEqual(lerDetalhe(s), { tipo: "status", status: s });
  }
});
caso("detalhe: chaves de processo", () => {
  for (const t of ["radar", "agendados", "parados", "concluidos", "abertos"]) {
    assert.deepEqual(lerDetalhe(t), { tipo: t });
  }
});
caso("detalhe: etapa, dono e responsável", () => {
  assert.deepEqual(lerDetalhe("etapa-data_proposta"), { tipo: "etapa", etapa: "data_proposta" });
  assert.deepEqual(lerDetalhe("dono-qsms"), { tipo: "dono", dono: "qsms" });
  assert.deepEqual(lerDetalhe("resp-qsms"), { tipo: "responsavel", id: "qsms" });
  assert.deepEqual(lerDetalhe("resp-sem-supervisor"), { tipo: "responsavel", id: "sem-supervisor" });
  const uuid = "3f2a0c4e-1b2c-4d5e-8f90-123456789abc";
  assert.deepEqual(lerDetalhe(`resp-${uuid}`), { tipo: "responsavel", id: uuid });
});
caso("detalhe: inválidos viram null", () => {
  for (const v of [undefined, "", "etapa-concluido", "etapa-xyz", "dono-ninguem", "resp-abc", "resp-", "outra"]) {
    assert.equal(lerDetalhe(v), null, String(v));
  }
});
caso("detalhe: ida e volta pelo texto", () => {
  for (const v of ["vencido", "radar", "etapa-agendado", "dono-supervisor", "resp-qsms"]) {
    assert.equal(detalheParaTexto(lerDetalhe(v)), v);
  }
});
caso("href: UEN limpa, equipe e âncora", () => {
  assert.equal(hrefDashboard("todas"), "/dashboard");
  assert.equal(hrefDashboard("minha"), "/dashboard?equipe=minha");
  assert.equal(hrefDashboard("todas", "vencido"), "/dashboard?detalhe=vencido#detalhe");
  assert.equal(hrefDashboard("minha", "etapa-agendado"), "/dashboard?equipe=minha&detalhe=etapa-agendado#detalhe");
});

// --- pior status por pessoa -----------------------------------------------
const linhas = [
  // A: ASO em dia, AVP vencida → vencido
  { colaborador_id: "A", tipo_requisito_id: "aso", status: "ok", peso_status: 5, dias_restantes: 200 },
  { colaborador_id: "A", tipo_requisito_id: "avp", status: "vencido", peso_status: 1, dias_restantes: -3 },
  // B: só ASO crítico
  { colaborador_id: "B", tipo_requisito_id: "aso", status: "critico", peso_status: 2, dias_restantes: 10 },
  // C: sem registro em um, programar no outro → sem registro
  { colaborador_id: "C", tipo_requisito_id: "aso", status: "programar", peso_status: 4, dias_restantes: 70 },
  { colaborador_id: "C", tipo_requisito_id: "avp", status: "sem_registro", peso_status: 0, dias_restantes: null },
  // D: dois atenção, fica com o mais urgente
  { colaborador_id: "D", tipo_requisito_id: "aso", status: "atencao", peso_status: 3, dias_restantes: 25 },
  { colaborador_id: "D", tipo_requisito_id: "avp", status: "atencao", peso_status: 3, dias_restantes: 16 },
  // E: em dia
  { colaborador_id: "E", tipo_requisito_id: "aso", status: "ok", peso_status: 5, dias_restantes: 300 },
];

caso("pior por pessoa: uma linha por colaborador, menor peso", () => {
  const piores = piorPorPessoa(linhas);
  assert.equal(piores.length, 5);
  const porId = Object.fromEntries(piores.map((p) => [p.colaborador_id, p]));
  assert.equal(porId.A.status, "vencido");
  assert.equal(porId.C.status, "sem_registro");
  assert.equal(porId.D.dias_restantes, 16);
});
caso("resumo por pessoa: seis faixas somam o total", () => {
  const r = resumirPorPessoa(linhas);
  assert.deepEqual(r, { total: 5, sem_registro: 1, vencido: 1, critico: 1, atencao: 1, programar: 0, ok: 1 });
  const soma = r.sem_registro + r.vencido + r.critico + r.atencao + r.programar + r.ok;
  assert.equal(soma, r.total);
});
caso("resumo por pessoa: lista vazia é tudo zero", () =>
  assert.deepEqual(resumirPorPessoa([]), { total: 0, sem_registro: 0, vencido: 0, critico: 0, atencao: 0, programar: 0, ok: 0 }));

caso("percentual: arredonda e protege divisão por zero", () => {
  assert.equal(percentual(193, 252), 77);
  assert.equal(percentual(0, 10), 0);
  assert.equal(percentual(5, 0), null);
});

// --- itens -----------------------------------------------------------------
const itens = [
  { item_id: "i1", colaborador_id: "A", tipo_requisito_id: "avp", nome: "Ana", requisito: "AVP", supervisor_id: "s1", supervisor_nome: "Pedro", etapa: "previsto", dono: "supervisor", status: "vencido", dias_restantes: -3, dias_parados: 9, sla_estourado: true },
  { item_id: "i2", colaborador_id: "B", tipo_requisito_id: "aso", nome: "Bruno", requisito: "ASO", supervisor_id: "s1", supervisor_nome: "Pedro", etapa: "agendado", dono: "supervisor", status: "critico", dias_restantes: 10, dias_parados: 2, sla_estourado: false },
  { item_id: "i3", colaborador_id: "C", tipo_requisito_id: "aso", nome: "Carla", requisito: "ASO", supervisor_id: "s2", supervisor_nome: "Elton", etapa: "data_proposta", dono: "qsms", status: "programar", dias_restantes: 70, dias_parados: 4, sla_estourado: true },
  { item_id: "i4", colaborador_id: "F", tipo_requisito_id: "aso", nome: "Fábio", requisito: "ASO", supervisor_id: null, supervisor_nome: null, etapa: "previsto", dono: "supervisor", status: "atencao", dias_restantes: 20, dias_parados: 1, sla_estourado: false },
];

caso("por etapa: contagem, estourados e máximo, na ordem do fluxo", () => {
  const r = contarPorEtapa(itens);
  assert.deepEqual(
    r.map((l) => [l.etapa, l.dono, l.quantidade, l.estourados, l.dias_max]),
    [
      ["previsto", "supervisor", 2, 1, 9],
      ["data_proposta", "qsms", 1, 1, 4],
      ["agendado", "supervisor", 1, 0, 2],
    ]
  );
});
caso("por etapa: linhas da RPC (bigint em texto) normalizadas e na ordem do fluxo", () => {
  const rpc = [
    { etapa: "agendado", dono: "supervisor", quantidade: "3", estourados: "1", dias_max: 5 },
    { etapa: "previsto", dono: "supervisor", quantidade: "77", estourados: "72", dias_max: 9 },
  ];
  assert.deepEqual(agruparEtapas(rpc), [
    { etapa: "previsto", dono: "supervisor", quantidade: 77, estourados: 72, dias_max: 9 },
    { etapa: "agendado", dono: "supervisor", quantidade: 3, estourados: 1, dias_max: 5 },
  ]);
});
caso("por dono: soma supervisão × QSMS", () =>
  assert.deepEqual(totalPorDono(contarPorEtapa(itens)), { supervisor: 3, qsms: 1 }));

caso("por responsável: supervisor da equipe quando a bola é da supervisão; QSMS por último", () => {
  const r = porResponsavel(itens);
  assert.deepEqual(
    r.map((l) => [l.id, l.nome, l.emMaos, l.vencidos, l.parados]),
    [
      ["s1", "Pedro", 2, 1, 1],
      ["sem-supervisor", "Sem supervisor", 1, 0, 0],
      ["qsms", "QSMS", 1, 0, 1],
    ]
  );
  const soma = r.reduce((s, l) => s + l.emMaos, 0);
  assert.equal(soma, itens.length);
});

caso("mais próximos: ordena por dias, ignora sem data, limita", () => {
  const r = maisProximosDeVencer(linhas, 3);
  assert.deepEqual(r.map((l) => l.dias_restantes), [-3, 10, 16]);
  assert.equal(maisProximosDeVencer(linhas, 20).length, 7);
});

caso("média de dias parados: geral e por etapa", () => {
  assert.equal(mediaDiasParados(itens), 4);
  assert.equal(mediaDiasParados([]), null);
  assert.deepEqual(mediaDiasPorEtapa(itens), { previsto: 5, agendado: 2, data_proposta: 4 });
});

// --- meses -----------------------------------------------------------------
caso("primeiro dia do mês, com deslocamento e virada de ano", () => {
  assert.equal(primeiroDiaDoMes("2026-11-13"), "2026-11-01");
  assert.equal(primeiroDiaDoMes("2026-11-13", 1), "2026-12-01");
  assert.equal(primeiroDiaDoMes("2026-11-13", 2), "2027-01-01");
  assert.equal(primeiroDiaDoMes("2026-02-28", -5), "2025-09-01");
});
caso("conclusões por mês: mês vazio aparece, fora da janela não conta", () => {
  const r = conclusoesPorMes(["2026-11-02", "2026-11-10", "2026-09-30", "2026-05-01", "2026-12-01"], "2026-11-13", 3);
  assert.deepEqual(r, [
    { mes: "2026-09-01", quantidade: 1 },
    { mes: "2026-10-01", quantidade: 0 },
    { mes: "2026-11-01", quantidade: 2 },
  ]);
});

// --- detalhe ---------------------------------------------------------------
const dados = {
  linhasStatus: linhas.map((l) => ({ ...l, nome: `Nome ${l.colaborador_id}`, requisito: l.tipo_requisito_id.toUpperCase(), supervisor_nome: "Pedro" })),
  itens,
  idsRadar: new Set(["i1", "i2"]),
  concluidos: [
    { id: "e1", colaborador_id: "E", nome: "Eva", requisito: "ASO", supervisor_nome: null, data_documento: "2026-11-05" },
  ],
};

caso("detalhe status: pessoas no pior status, com a etapa do item aberto", () => {
  const r = montarDetalhe({ tipo: "status", status: "vencido" }, dados);
  assert.equal(r.tipo, "pessoas");
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].colaboradorId, "A");
  assert.equal(r.linhas[0].etapa, "previsto");
});
caso("detalhe status: a lista bate com o resumo por pessoa", () => {
  const resumo = resumirPorPessoa(linhas);
  for (const s of ["vencido", "sem_registro", "critico", "atencao", "programar", "ok"]) {
    assert.equal(montarDetalhe({ tipo: "status", status: s }, dados).linhas.length, resumo[s], s);
  }
});
caso("detalhe radar: só os ids do radar", () =>
  assert.deepEqual(montarDetalhe({ tipo: "radar" }, dados).linhas.map((l) => l.chave), ["i1", "i2"]));
caso("detalhe radar: consulta falhou vira lista vazia, não tudo", () =>
  assert.equal(montarDetalhe({ tipo: "radar" }, { ...dados, idsRadar: null }).linhas.length, 0));
caso("detalhe agendados, parados, etapa, dono, responsável, abertos", () => {
  assert.equal(montarDetalhe({ tipo: "agendados" }, dados).linhas.length, 1);
  assert.equal(montarDetalhe({ tipo: "parados" }, dados).linhas.length, 2);
  assert.equal(montarDetalhe({ tipo: "etapa", etapa: "previsto" }, dados).linhas.length, 2);
  assert.equal(montarDetalhe({ tipo: "dono", dono: "supervisor" }, dados).linhas.length, 3);
  assert.equal(montarDetalhe({ tipo: "responsavel", id: "s1" }, dados).linhas.length, 2);
  assert.equal(montarDetalhe({ tipo: "responsavel", id: "qsms" }, dados).linhas.length, 1);
  assert.equal(montarDetalhe({ tipo: "responsavel", id: "sem-supervisor" }, dados).linhas.length, 1);
  assert.equal(montarDetalhe({ tipo: "abertos" }, dados).linhas.length, 4);
});
caso("detalhe itens: mais parado primeiro", () =>
  assert.deepEqual(montarDetalhe({ tipo: "abertos" }, dados).linhas.map((l) => l.diasParados), [9, 4, 2, 1]));
caso("detalhe concluídos: eventos com data", () => {
  const r = montarDetalhe({ tipo: "concluidos" }, dados);
  assert.equal(r.tipo, "eventos");
  assert.equal(r.linhas[0].data, "2026-11-05");
  assert.equal(r.linhas[0].supervisor, "Sem supervisor");
});

// --- buscarTodas -----------------------------------------------------------
caso("buscarTodas: pagina até a página incompleta", async () => {
  const pedidos = [];
  const base = Array.from({ length: 5 }, (_, i) => i);
  const r = await buscarTodas((de, ate) => {
    pedidos.push([de, ate]);
    return Promise.resolve({ data: base.slice(de, ate + 1), error: null });
  }, 2);
  assert.deepEqual(r, { linhas: [0, 1, 2, 3, 4], erro: null });
  assert.deepEqual(pedidos, [[0, 1], [2, 3], [4, 5]]);
});
caso("buscarTodas: erro interrompe e devolve a mensagem", async () => {
  const r = await buscarTodas(() => Promise.resolve({ data: null, error: { message: "boom" } }), 2);
  assert.deepEqual(r, { linhas: [], erro: "boom" });
});

await Promise.all(pendentes);
if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
