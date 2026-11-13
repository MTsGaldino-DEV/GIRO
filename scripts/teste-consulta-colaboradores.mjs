// Testa a lógica pura da lista de Colaboradores (sem banco).
// Rodar: npm run teste:colaboradores
import assert from "node:assert/strict";
import {
  POR_PAGINA_COLABORADORES,
  SEM_SUPERVISOR,
  equipePadrao,
  podeEscolherMinha,
  normalizarFiltros,
  combinarCargas,
  montarPessoas,
  filtrarPessoas,
  paginar,
  consultarColaboradores,
  filtrosParaBusca,
  totalDePaginas,
  semEquipeVinculada,
  textoDoParametro,
} from "../lib/regras-colaboradores.ts";
import { piorPorPessoa } from "../lib/regras-dashboard.ts";

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

// --- perfis ------------------------------------------------------------------
const supervisor = { papel: "supervisor", supervisor_id: "sup-1" };
const supervisorSemEquipe = { papel: "supervisor", supervisor_id: null };
const qsms = { papel: "qsms", supervisor_id: null };
const admin = { papel: "admin", supervisor_id: null };
const adminComEquipe = { papel: "admin", supervisor_id: "sup-2" };

// --- fixtures ----------------------------------------------------------------
const PESO = { sem_registro: 0, vencido: 1, critico: 2, atencao: 3, programar: 4, ok: 5 };

function colab(id, matricula, nome, extra = {}) {
  return {
    id,
    matricula,
    nome,
    cargo: "Eletricista",
    supervisor_id: null,
    supervisores: null,
    foto_url: null,
    ativo: true,
    ...extra,
  };
}
function linha(colaborador_id, requisito, status, dias_restantes) {
  return {
    colaborador_id,
    tipo_requisito_id: requisito === "ASO Periódico" ? "t-aso" : "t-avp",
    requisito,
    status,
    peso_status: PESO[status],
    dias_restantes,
  };
}

const colaboradores = [
  colab("c1", 100, "Ana Souza", { supervisor_id: "sup-1", supervisores: { nome: "Carlos" } }),
  colab("c2", 1000, "Bruno Lima", { supervisor_id: "sup-1", supervisores: { nome: "Carlos" } }),
  colab("c3", 2000, "Álvaro Dias", { supervisor_id: "sup-2", supervisores: { nome: "Marta" } }),
  colab("c4", 3000, "Carla Mendes"),
  colab("c5", 4000, "Daniel Rocha", { cargo: null }),
  colab("d1", 9001, "Eduardo Antigo", { ativo: false, supervisor_id: "sup-1", supervisores: { nome: "Carlos" } }),
  colab("d2", 9002, "Fernanda Antiga", { ativo: false }),
];
const linhasStatus = [
  linha("c1", "ASO Periódico", "ok", 200),
  linha("c1", "Avaliação Psicológica", "vencido", -10), // pior: AVP vencida
  linha("c2", "ASO Periódico", "critico", 5),
  linha("c3", "ASO Periódico", "atencao", 20),
  linha("c3", "Avaliação Psicológica", "atencao", 25),
  linha("c4", "ASO Periódico", "sem_registro", null),
  linha("c5", "ASO Periódico", "ok", 300),
];

const carga = combinarCargas(
  { linhas: colaboradores, erro: null },
  { linhas: linhasStatus, erro: null }
);
const pessoas = carga.pessoas;
const filtros = (extra = {}) => normalizarFiltros(extra, qsms);
const nomes = (lista) => lista.map((p) => p.nome);

// --- parâmetros da URL -------------------------------------------------------
caso("textoDoParametro: só texto simples vale", () => {
  assert.equal(textoDoParametro("a"), "a");
  assert.equal(textoDoParametro(["a", "b"]), undefined);
  assert.equal(textoDoParametro(undefined), undefined);
});

caso("normalizar: padrão é Ativos, UEN inteira, página 1 (qsms)", () => {
  const f = normalizarFiltros({}, qsms);
  assert.deepEqual(f, {
    busca: "",
    status: undefined,
    requisito: undefined,
    supervisor: undefined,
    situacao: "ativos",
    equipe: "todas",
    pagina: 1,
  });
});

caso("normalizar: valores soltos viram padrão (status inválido, situação inválida, página lixo)", () => {
  const f = normalizarFiltros({ status: "xyz", situacao: "outra", pagina: "abc", equipe: "qualquer" }, qsms);
  assert.equal(f.status, undefined);
  assert.equal(f.situacao, "ativos");
  assert.equal(f.pagina, 1);
  assert.equal(f.equipe, "todas");
});

caso("normalizar: página zero, negativa ou fracionária", () => {
  assert.equal(normalizarFiltros({ pagina: "0" }, qsms).pagina, 1);
  assert.equal(normalizarFiltros({ pagina: "-3" }, qsms).pagina, 1);
  assert.equal(normalizarFiltros({ pagina: "2.7" }, qsms).pagina, 2);
  assert.equal(normalizarFiltros({ pagina: "3" }, qsms).pagina, 3);
});

caso("normalizar: parâmetro repetido (string[]) cai no padrão, sem quebrar", () => {
  const f = normalizarFiltros(
    {
      busca: ["a", "b"],
      status: ["vencido", "ok"],
      requisito: ["ASO Periódico", "x"],
      supervisor: ["s1", "s2"],
      situacao: ["desligados", "ativos"],
      equipe: ["minha", "todas"],
      pagina: ["2", "3"],
    },
    supervisor
  );
  assert.equal(f.busca, "");
  assert.equal(f.status, undefined);
  assert.equal(f.requisito, undefined);
  assert.equal(f.supervisor, undefined);
  assert.equal(f.situacao, "ativos");
  assert.equal(f.equipe, "minha"); // padrão do supervisor com equipe
  assert.equal(f.pagina, 1);
});

caso("normalizar: busca tira vírgula, parênteses e curingas", () => {
  assert.equal(normalizarFiltros({ busca: "  Silva, (João)* " }, qsms).busca, "Silva   João");
});

caso("normalizar: Desligados ignora status e requisito (não há status para filtrar)", () => {
  const f = normalizarFiltros({ situacao: "desligados", status: "vencido", requisito: "ASO Periódico" }, qsms);
  assert.equal(f.situacao, "desligados");
  assert.equal(f.status, undefined);
  assert.equal(f.requisito, undefined);
});

// --- escopo da equipe --------------------------------------------------------
caso("equipe: padrão por perfil", () => {
  assert.equal(equipePadrao(supervisor), "minha");
  assert.equal(equipePadrao(supervisorSemEquipe), "todas");
  assert.equal(equipePadrao(qsms), "todas");
  assert.equal(equipePadrao(admin), "todas");
  assert.equal(equipePadrao(adminComEquipe), "todas");
});

caso("equipe: 'Minha equipe' só existe para quem tem supervisor_id", () => {
  assert.equal(podeEscolherMinha(supervisor), true);
  assert.equal(podeEscolherMinha(adminComEquipe), true);
  assert.equal(podeEscolherMinha(supervisorSemEquipe), false);
  assert.equal(podeEscolherMinha(qsms), false);
});

caso("equipe: supervisor sem supervisor_id abre em Todos, sem erro", () => {
  assert.equal(normalizarFiltros({}, supervisorSemEquipe).equipe, "todas");
  assert.equal(normalizarFiltros({ equipe: "minha" }, supervisorSemEquipe).equipe, "todas");
  assert.equal(semEquipeVinculada(supervisorSemEquipe, "todas"), false);
});

caso("equipe: supervisor com equipe abre em Minha equipe e pode pedir Todos", () => {
  assert.equal(normalizarFiltros({}, supervisor).equipe, "minha");
  assert.equal(normalizarFiltros({ equipe: "todas" }, supervisor).equipe, "todas");
});

caso("equipe: qsms/admin com 'minha' na URL sem vínculo cai em Todos; admin com vínculo respeita", () => {
  assert.equal(normalizarFiltros({ equipe: "minha" }, qsms).equipe, "todas");
  assert.equal(normalizarFiltros({ equipe: "minha" }, admin).equipe, "todas");
  assert.equal(normalizarFiltros({ equipe: "minha" }, adminComEquipe).equipe, "minha");
});

caso("equipe 'minha' lista só a equipe do perfil", () => {
  const r = consultarColaboradores(carga, normalizarFiltros({}, supervisor), "sup-1");
  assert.deepEqual(nomes(r.linhas).sort(), ["Ana Souza", "Bruno Lima"]);
  assert.equal(r.total, 2);
});

caso("equipe 'minha' sem supervisor_id: lista vazia (sem erro), com aviso possível", () => {
  const f = { ...filtros(), equipe: "minha" };
  const r = consultarColaboradores(carga, f, null);
  assert.equal(r.total, 0);
  assert.equal(r.erro, null);
  assert.equal(semEquipeVinculada(supervisorSemEquipe, "minha"), true);
});

caso("equipe 'todas' lista a UEN inteira", () => {
  const r = consultarColaboradores(carga, normalizarFiltros({ equipe: "todas" }, supervisor), "sup-1");
  assert.equal(r.total, 5);
});

// --- montar pessoas ----------------------------------------------------------
caso("montarPessoas: pior status por pessoa, igual a piorPorPessoa do Dashboard", () => {
  const referencia = new Map(piorPorPessoa(linhasStatus).map((l) => [l.colaborador_id, l]));
  for (const p of pessoas.filter((x) => x.ativo)) {
    const ref = referencia.get(p.colaborador_id);
    assert.equal(p.status, ref.status, p.nome);
    assert.equal(p.dias, ref.dias_restantes, p.nome);
    assert.equal(p.requisito, ref.requisito, p.nome);
  }
});

caso("montarPessoas: empate de status fica com o requisito mais urgente", () => {
  const c3 = pessoas.find((p) => p.colaborador_id === "c3");
  assert.equal(c3.status, "atencao");
  assert.equal(c3.dias, 20);
  assert.equal(c3.requisito, "ASO Periódico");
});

caso("montarPessoas: supervisor 'Sem supervisor' fica nulo e desligados não têm status", () => {
  const c4 = pessoas.find((p) => p.colaborador_id === "c4");
  assert.equal(c4.supervisor_nome, null);
  const d1 = pessoas.find((p) => p.colaborador_id === "d1");
  assert.equal(d1.ativo, false);
  assert.equal(d1.status, null);
  assert.equal(d1.requisito, null);
  assert.equal(d1.supervisor_nome, "Carlos");
});

caso("montarPessoas: ativo sem nenhuma linha na view segue na lista, sem status", () => {
  const r = montarPessoas([colab("x", 1, "Sem Linha")], []);
  assert.equal(r.length, 1);
  assert.equal(r[0].status, null);
});

// --- busca -------------------------------------------------------------------
caso("busca só dígitos: matrícula exata, sem pegar prefixo", () => {
  const r = filtrarPessoas(pessoas, filtros({ busca: "100" }), null);
  assert.deepEqual(nomes(r), ["Ana Souza"]);
});

caso("busca só dígitos: matrícula que não existe não devolve ninguém", () => {
  assert.deepEqual(filtrarPessoas(pessoas, filtros({ busca: "99" }), null), []);
});

caso("busca por texto: 'contém' no nome, sem acento nem caixa", () => {
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ busca: "alvaro" }), null)), ["Álvaro Dias"]);
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ busca: "ÁLVARO" }), null)), ["Álvaro Dias"]);
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ busca: "ou" }), null)), ["Ana Souza"]);
});

caso("busca por texto não casa com matrícula", () => {
  assert.deepEqual(filtrarPessoas(pessoas, filtros({ busca: "10 0" }), null), []);
});

// --- status e requisito ------------------------------------------------------
caso("status: filtra pelo pior status da pessoa", () => {
  // Ana tem ASO ok e AVP vencida: o pior é vencido.
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ status: "vencido" }), null)), ["Ana Souza"]);
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ status: "ok" }), null)), ["Daniel Rocha"]);
});

caso("status: 'ok' não pega quem tem requisito ok mas outro pior", () => {
  assert.ok(!nomes(filtrarPessoas(pessoas, filtros({ status: "ok" }), null)).includes("Ana Souza"));
});

caso("requisito: filtra pelo status da pessoa naquele requisito", () => {
  // Só quem tem linha de AVP: Ana e Álvaro.
  const avp = filtrarPessoas(pessoas, filtros({ requisito: "Avaliação Psicológica" }), null);
  assert.deepEqual(nomes(avp).sort(), ["Ana Souza", "Álvaro Dias"].sort());
  // E a linha mostra o status da AVP, não o pior geral.
  const ana = avp.find((p) => p.colaborador_id === "c1");
  assert.equal(ana.status, "vencido");
  assert.equal(ana.requisito, "Avaliação Psicológica");
});

caso("requisito + status: status é o do requisito escolhido, não o pior geral", () => {
  // Ana: ASO ok, AVP vencido. Em ASO + ok, ela entra; em AVP + ok, não.
  const asoOk = filtrarPessoas(pessoas, filtros({ requisito: "ASO Periódico", status: "ok" }), null);
  assert.ok(nomes(asoOk).includes("Ana Souza"));
  const avpOk = filtrarPessoas(pessoas, filtros({ requisito: "Avaliação Psicológica", status: "ok" }), null);
  assert.deepEqual(avpOk, []);
  const asoVencido = filtrarPessoas(pessoas, filtros({ requisito: "ASO Periódico", status: "vencido" }), null);
  assert.deepEqual(asoVencido, []);
});

caso("requisito inexistente: lista vazia, sem erro", () => {
  const r = consultarColaboradores(carga, filtros({ requisito: "Nada" }), null);
  assert.equal(r.total, 0);
  assert.equal(r.erro, null);
});

// --- supervisor --------------------------------------------------------------
caso("supervisor: por id", () => {
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ supervisor: "sup-2" }), null)), ["Álvaro Dias"]);
});

caso("supervisor: 'Sem supervisor'", () => {
  assert.deepEqual(
    nomes(filtrarPessoas(pessoas, filtros({ supervisor: SEM_SUPERVISOR }), null)).sort(),
    ["Carla Mendes", "Daniel Rocha"]
  );
});

caso("supervisor + equipe 'minha': os dois valem (E)", () => {
  const f = normalizarFiltros({ supervisor: "sup-2" }, supervisor);
  assert.equal(consultarColaboradores(carga, f, "sup-1").total, 0);
});

// --- situação ----------------------------------------------------------------
caso("situação: Ativos não traz desligados", () => {
  const r = filtrarPessoas(pessoas, filtros(), null);
  assert.ok(r.every((p) => p.ativo));
  assert.equal(r.length, 5);
});

caso("situação: Desligados traz só desligados, por nome", () => {
  const r = filtrarPessoas(pessoas, filtros({ situacao: "desligados" }), null);
  assert.deepEqual(nomes(r), ["Eduardo Antigo", "Fernanda Antiga"]);
});

caso("situação: Desligados aceita busca, supervisor e equipe", () => {
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ situacao: "desligados", busca: "9002" }), null)), ["Fernanda Antiga"]);
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros({ situacao: "desligados", supervisor: "sup-1" }), null)), ["Eduardo Antigo"]);
  const f = normalizarFiltros({ situacao: "desligados" }, supervisor);
  assert.deepEqual(nomes(consultarColaboradores(carga, f, "sup-1").linhas), ["Eduardo Antigo"]);
});

// --- ordem -------------------------------------------------------------------
caso("ordem: pior status primeiro, depois menos dias, depois nome", () => {
  assert.deepEqual(nomes(filtrarPessoas(pessoas, filtros(), null)), [
    "Carla Mendes", // sem registro
    "Ana Souza", // vencido
    "Bruno Lima", // crítico
    "Álvaro Dias", // atenção
    "Daniel Rocha", // ok
  ]);
});

// --- paginação ---------------------------------------------------------------
const muitos = Array.from({ length: 60 }, (_, i) => ({ ...pessoas[0], colaborador_id: `m${i}`, nome: `P ${String(i).padStart(2, "0")}` }));

caso("paginar: 25 por página", () => {
  assert.equal(POR_PAGINA_COLABORADORES, 25);
  const p1 = paginar(muitos, 1);
  assert.equal(p1.linhas.length, 25);
  assert.equal(p1.total, 60);
  assert.equal(p1.pagina, 1);
  assert.equal(p1.totalPaginas, 3);
});

caso("paginar: última página traz o resto", () => {
  const p3 = paginar(muitos, 3);
  assert.equal(p3.linhas.length, 10);
  assert.equal(p3.linhas[0].nome, "P 50");
});

caso("paginar: página além do fim volta para a última", () => {
  const p = paginar(muitos, 99);
  assert.equal(p.pagina, 3);
  assert.equal(p.linhas.length, 10);
});

caso("paginar: lista vazia (página 1 de 1, nada a mostrar)", () => {
  const p = paginar([], 5);
  assert.deepEqual(p.linhas, []);
  assert.equal(p.total, 0);
  assert.equal(p.pagina, 1);
  assert.equal(p.totalPaginas, 1);
});

caso("paginar: exatamente 25 cabe numa página só", () => {
  const p = paginar(muitos.slice(0, 25), 2);
  assert.equal(p.totalPaginas, 1);
  assert.equal(p.pagina, 1);
  assert.equal(p.linhas.length, 25);
  assert.equal(totalDePaginas(26), 2);
});

caso("consultar: página pedida na URL é respeitada e ajustada no resultado", () => {
  const r = consultarColaboradores({ pessoas: muitos, erro: null }, { ...filtros(), pagina: 99 }, null);
  assert.equal(r.pagina, 3);
  assert.equal(r.linhas.length, 10);
});

// --- erros -------------------------------------------------------------------
caso("erro na consulta de colaboradores: mensagem explícita, nunca lista vazia como dado", () => {
  const c = combinarCargas({ linhas: [], erro: "boom" }, { linhas: linhasStatus, erro: null });
  assert.match(c.erro, /Não foi possível carregar/);
  assert.match(c.erro, /boom/);
  const r = consultarColaboradores(c, filtros(), null);
  assert.equal(r.total, 0);
  assert.match(r.erro, /Não foi possível carregar/);
});

caso("erro na consulta de status: também é erro (sem mostrar todos 'sem status')", () => {
  const c = combinarCargas({ linhas: colaboradores, erro: null }, { linhas: [], erro: "falhou" });
  assert.match(c.erro, /Não foi possível carregar/);
  assert.deepEqual(c.pessoas, []);
});

caso("sem erro: erro nulo", () => {
  assert.equal(carga.erro, null);
  assert.equal(consultarColaboradores(carga, filtros(), null).erro, null);
});

// --- URL ---------------------------------------------------------------------
caso("filtrosParaBusca: só o que difere do padrão", () => {
  assert.equal(filtrosParaBusca(filtros(), "todas"), "");
  const f = { ...filtros({ busca: "ana", status: "vencido", requisito: "ASO Periódico" }), pagina: 2 };
  const q = new URLSearchParams(filtrosParaBusca(f, "todas"));
  assert.equal(q.get("busca"), "ana");
  assert.equal(q.get("status"), "vencido");
  assert.equal(q.get("requisito"), "ASO Periódico");
  assert.equal(q.get("pagina"), "2");
  assert.equal(q.get("equipe"), null);
  assert.equal(q.get("situacao"), null);
});

caso("filtrosParaBusca: equipe e situação só entram quando mudam o padrão", () => {
  const f = normalizarFiltros({ equipe: "todas", situacao: "desligados" }, supervisor);
  const q = new URLSearchParams(filtrosParaBusca(f, "minha"));
  assert.equal(q.get("equipe"), "todas");
  assert.equal(q.get("situacao"), "desligados");
  assert.equal(new URLSearchParams(filtrosParaBusca(normalizarFiltros({}, supervisor), "minha")).get("equipe"), null);
});

caso("ida e volta: o que sai de filtrosParaBusca volta igual por normalizarFiltros", () => {
  const original = {
    ...normalizarFiltros({ busca: "ana", supervisor: SEM_SUPERVISOR, situacao: "ativos", status: "critico" }, supervisor),
    pagina: 3,
  };
  const url = Object.fromEntries(new URLSearchParams(filtrosParaBusca(original, "minha")));
  assert.deepEqual(normalizarFiltros(url, supervisor), original);
});

await Promise.all(pendentes);
if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
