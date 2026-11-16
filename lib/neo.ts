/**
 * Cliente da porta de leitura da CENTRAL-NEO (Edge Function `giro-colaboradores`).
 *
 * Só LISTA. O segredo (`NEO_INTEGRACAO_SEGREDO`) e a URL (`NEO_INTEGRACAO_URL`)
 * vêm do ambiente do servidor e nunca aparecem em mensagem de erro, log nem
 * resposta: toda falha vira um `ErroNeo` com texto em português escrito aqui,
 * sem repassar o corpo da resposta nem a mensagem original da rede.
 *
 * Arquivo puro (só tipos e funções), testado com `node --experimental-strip-types`
 * em scripts/teste-neo-cliente.mjs: sem Zod, sem importar nada do app.
 */

/** O contrato da função da NEO (plano da fase 1). Datas em AAAA-MM-DD. */
export type LinhaNeo = {
  id: string;
  nome: string;
  cpf: string | null;
  matricula_cemig: string | null;
  matricula_engelmig: string | null;
  cargo: string | null;
  supervisor: string | null;
  base: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  ativo: boolean;
  atualizado_em: string;
};

export class ErroNeo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroNeo";
  }
}

const PAGINAS_MAXIMAS = 20;
const TEMPO_LIMITE_PADRAO_MS = 15_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function textoOuNulo(x: Record<string, unknown>, campo: string): string | null {
  const v = x[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ErroNeo("A NEO enviou um cadastro em formato inesperado.");
  return v;
}

function dataOuNula(x: Record<string, unknown>, campo: string): string | null {
  const v = textoOuNulo(x, campo);
  if (v !== null && !DATA.test(v)) throw new ErroNeo("A NEO enviou uma data em formato inesperado.");
  return v;
}

/** Confere uma linha da NEO; lança `ErroNeo` se faltar `id`, `nome` ou `ativo`, ou se um tipo estiver errado. */
export function validarLinha(x: unknown): LinhaNeo {
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    throw new ErroNeo("A NEO enviou um cadastro em formato inesperado.");
  }
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id === "") throw new ErroNeo("A NEO enviou um cadastro sem identificador.");
  if (typeof o.nome !== "string") throw new ErroNeo("A NEO enviou um cadastro sem nome.");
  if (typeof o.ativo !== "boolean") throw new ErroNeo("A NEO enviou um cadastro sem a situação ativo.");
  return {
    id: o.id,
    nome: o.nome,
    cpf: textoOuNulo(o, "cpf"),
    matricula_cemig: textoOuNulo(o, "matricula_cemig"),
    matricula_engelmig: textoOuNulo(o, "matricula_engelmig"),
    cargo: textoOuNulo(o, "cargo"),
    supervisor: textoOuNulo(o, "supervisor"),
    base: textoOuNulo(o, "base"),
    data_admissao: dataOuNula(o, "data_admissao"),
    data_desligamento: dataOuNula(o, "data_desligamento"),
    ativo: o.ativo,
    atualizado_em: typeof o.atualizado_em === "string" ? o.atualizado_em : "",
  };
}

export type OpcoesNeo = {
  buscar?: typeof fetch;
  url?: string;
  segredo?: string;
  tempoLimiteMs?: number;
};

/**
 * Lê TODO o cadastro da NEO, página a página (até 500 linhas por chamada), e só
 * devolve se a listagem veio completa: a quantidade recebida precisa ser igual ao
 * `total` informado pela última página. Qualquer falha lança `ErroNeo` — nunca
 * devolve uma lista parcial.
 */
export async function listarColaboradoresNeo(opcoes: OpcoesNeo = {}): Promise<LinhaNeo[]> {
  const url = opcoes.url ?? process.env.NEO_INTEGRACAO_URL;
  const segredo = opcoes.segredo ?? process.env.NEO_INTEGRACAO_SEGREDO;
  if (!url || !segredo) throw new ErroNeo("Integração com a NEO não configurada.");

  const buscar = opcoes.buscar ?? fetch;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;

  const todas: LinhaNeo[] = [];
  let apos: string | null = null;
  let total = -1;

  for (let pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina++) {
    const corpo: { acao: "listar"; apos?: string } = { acao: "listar" };
    if (apos !== null) corpo.apos = apos;

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
    let resposta: Response;
    try {
      resposta = await buscar(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-giro-segredo": segredo },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });
    } catch {
      throw new ErroNeo(
        controle.signal.aborted
          ? "A NEO demorou demais para responder (tempo limite)."
          : "Não foi possível falar com a NEO."
      );
    } finally {
      clearTimeout(relogio);
    }

    if (resposta.status === 401) throw new ErroNeo("A NEO recusou o acesso da integração.");
    if (!resposta.ok) throw new ErroNeo(`A NEO respondeu com erro (HTTP ${resposta.status}).`);

    let dados: unknown;
    try {
      dados = await resposta.json();
    } catch {
      throw new ErroNeo("Resposta inválida da NEO.");
    }
    const d = dados as { linhas?: unknown; proxima?: unknown; total?: unknown } | null;
    if (!d || !Array.isArray(d.linhas) || typeof d.total !== "number" ||
        (d.proxima !== null && typeof d.proxima !== "string")) {
      throw new ErroNeo("Resposta inválida da NEO.");
    }

    for (const l of d.linhas) todas.push(validarLinha(l));
    total = d.total;

    if (d.proxima === null) {
      if (todas.length !== total) throw new ErroNeo("Resposta incompleta da NEO.");
      return todas;
    }
    apos = d.proxima;
  }

  throw new ErroNeo("A NEO devolveu páginas demais; a listagem foi interrompida.");
}
