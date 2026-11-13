import type { Perfil, StatusConformidade } from "./tipos";

/**
 * Regras puras da lista de Colaboradores (spec 2026-11-13-telas-e-fluxo, seção
 * 9). A leitura do banco fica em `consulta-colaboradores.ts`.
 *
 * Lista única da UEN (cerca de 250 pessoas): a página lê tudo uma vez e o
 * navegador filtra e pagina aqui, sem nova ida ao servidor a cada filtro.
 * Quem pode ver o quê continua sendo da RLS — nenhuma regra de papel mora neste
 * arquivo, só o escopo "minha equipe" como recorte de tela.
 *
 * Só `import type` e caminho relativo: o arquivo roda sob
 * `node --experimental-strip-types` em `scripts/teste-consulta-colaboradores.mjs`.
 */

/** Igual ao Radar: 25 por página. */
export const POR_PAGINA_COLABORADORES = 25;

/** Valor de supervisor que representa "nenhum vínculo", já que null não vai na URL. */
export const SEM_SUPERVISOR = "sem-supervisor";

export type SituacaoQuadro = "ativos" | "desligados";
export type EquipeColaboradores = "minha" | "todas";

/** Valor cru de `searchParams`: o Next entrega lista quando o parâmetro se repete. */
export type ParametroUrl = string | string[] | undefined;

type PerfilEscopo = Pick<Perfil, "papel" | "supervisor_id">;

/** Do pior para o melhor: a ordem do semáforo e o peso usado para ordenar. */
const ORDEM_STATUS: readonly StatusConformidade[] = [
  "sem_registro",
  "vencido",
  "critico",
  "atencao",
  "programar",
  "ok",
];
const PESO_NENHUM = ORDEM_STATUS.length;

// ---------------------------------------------------------------------------
// Filtros vindos da URL
// ---------------------------------------------------------------------------

export interface FiltrosColaboradores {
  /** Já sem sintaxe de consulta; vazio = sem busca. */
  busca: string;
  /** Status da pessoa (o pior, ou o do requisito escolhido). */
  status: StatusConformidade | undefined;
  /** Nome do requisito (ASO Periódico, Avaliação Psicológica…). */
  requisito: string | undefined;
  /** Id do supervisor ou `SEM_SUPERVISOR`. */
  supervisor: string | undefined;
  situacao: SituacaoQuadro;
  equipe: EquipeColaboradores;
  /** 1 em diante; o resultado ajusta o que passar do fim. */
  pagina: number;
}

export type ParametrosUrl = Partial<Record<keyof FiltrosColaboradores, ParametroUrl>>;

/** Só texto simples vale; lista (`?status=a&status=b`) ou ausência viram `undefined`. */
export function textoDoParametro(valor: ParametroUrl): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

/** O segmento "Minha equipe / Todos" só tem "Minha equipe" para quem tem equipe vinculada. */
export function podeEscolherMinha(perfil: Pick<Perfil, "supervisor_id">): boolean {
  return !!perfil.supervisor_id;
}

/** Supervisor com equipe abre na sua; os demais, e supervisor sem equipe, na UEN. */
export function equipePadrao(perfil: PerfilEscopo): EquipeColaboradores {
  return perfil.papel === "supervisor" && podeEscolherMinha(perfil) ? "minha" : "todas";
}

/** "Minha equipe" sem vínculo: não há o que mostrar. Só alcançável por filtros montados à mão. */
export function semEquipeVinculada(perfil: Pick<Perfil, "supervisor_id">, equipe: EquipeColaboradores): boolean {
  return equipe === "minha" && !perfil.supervisor_id;
}

/**
 * Vírgula, parênteses, curingas e barra saem antes, como na busca do Radar:
 * não fazem parte de nome nenhum.
 */
export function limparBusca(busca: string | undefined): string {
  return (busca ?? "").replace(/[,()%*\\]/g, " ").trim();
}

/**
 * URL → filtros utilizáveis. Qualquer valor fora do previsto (inclusive lista)
 * cai no padrão; nada aqui lança. Desligados não têm status nem requisito: os
 * dois filtros somem para essa situação.
 */
export function normalizarFiltros(params: ParametrosUrl, perfil: PerfilEscopo): FiltrosColaboradores {
  const situacao: SituacaoQuadro = textoDoParametro(params.situacao) === "desligados" ? "desligados" : "ativos";

  const pedidoEquipe = textoDoParametro(params.equipe);
  let equipe: EquipeColaboradores =
    pedidoEquipe === "minha" || pedidoEquipe === "todas" ? pedidoEquipe : equipePadrao(perfil);
  if (equipe === "minha" && !podeEscolherMinha(perfil)) equipe = "todas";

  const statusPedido = textoDoParametro(params.status);
  const status =
    situacao === "ativos" && (ORDEM_STATUS as readonly string[]).includes(statusPedido ?? "")
      ? (statusPedido as StatusConformidade)
      : undefined;

  const numero = Math.floor(Number(textoDoParametro(params.pagina)));

  return {
    busca: limparBusca(textoDoParametro(params.busca)),
    status,
    requisito: situacao === "ativos" ? textoDoParametro(params.requisito) || undefined : undefined,
    supervisor: textoDoParametro(params.supervisor) || undefined,
    situacao,
    equipe,
    pagina: Number.isFinite(numero) && numero >= 1 ? numero : 1,
  };
}

/**
 * Filtros como query string, para manter a URL compartilhável. Só entra o que
 * difere do padrão: o endereço limpo continua abrindo a visão certa para cada
 * papel.
 */
export function filtrosParaBusca(filtros: FiltrosColaboradores, equipeDoPadrao: EquipeColaboradores): string {
  const busca = new URLSearchParams();
  if (filtros.busca) busca.set("busca", filtros.busca);
  if (filtros.status) busca.set("status", filtros.status);
  if (filtros.requisito) busca.set("requisito", filtros.requisito);
  if (filtros.supervisor) busca.set("supervisor", filtros.supervisor);
  if (filtros.situacao !== "ativos") busca.set("situacao", filtros.situacao);
  if (filtros.equipe !== equipeDoPadrao) busca.set("equipe", filtros.equipe);
  if (filtros.pagina > 1) busca.set("pagina", String(filtros.pagina));
  return busca.toString();
}

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

/** Linha de `colaboradores` com o nome do supervisor embutido. */
export interface ColaboradorBruto {
  id: string;
  matricula: number;
  nome: string;
  cargo: string | null;
  supervisor_id: string | null;
  supervisores: { nome: string } | null;
  foto_url: string | null;
  ativo: boolean;
}

/** Linha de `vw_status_colaborador` (pessoa × requisito). */
export interface LinhaStatusBruta {
  colaborador_id: string;
  requisito: string;
  status: StatusConformidade;
  peso_status: number;
  dias_restantes: number | null;
}

export interface EstadoRequisito {
  status: StatusConformidade;
  peso: number;
  dias: number | null;
}

export interface PessoaLista {
  colaborador_id: string;
  matricula: number;
  nome: string;
  cargo: string | null;
  supervisor_id: string | null;
  supervisor_nome: string | null;
  foto_url: string | null;
  ativo: boolean;
  /** Pior status da pessoa (ou o do requisito filtrado); nulo para desligado ou sem linha na view. */
  status: StatusConformidade | null;
  dias: number | null;
  /** Requisito que causa `status`. */
  requisito: string | null;
  /** Estado em cada requisito, por nome. */
  requisitos: Record<string, EstadoRequisito>;
}

/** Mais urgente primeiro; sem data (sem registro) conta como o mais urgente. */
function maisUrgente(a: EstadoRequisito, b: EstadoRequisito): boolean {
  return a.peso < b.peso || (a.peso === b.peso && (a.dias ?? -Infinity) < (b.dias ?? -Infinity));
}

/**
 * Uma linha por colaborador, com o pior requisito (menor `peso_status`; no
 * empate, o de menos dias — a mesma regra de `piorPorPessoa`, do Dashboard).
 * Desligados não entram na view, então ficam sem status.
 */
export function montarPessoas(
  colaboradores: readonly ColaboradorBruto[],
  linhas: readonly LinhaStatusBruta[]
): PessoaLista[] {
  const porPessoa = new Map<string, Record<string, EstadoRequisito>>();
  for (const l of linhas) {
    const estados = porPessoa.get(l.colaborador_id) ?? {};
    estados[l.requisito] = { status: l.status, peso: l.peso_status, dias: l.dias_restantes };
    porPessoa.set(l.colaborador_id, estados);
  }

  return colaboradores.map((c): PessoaLista => {
    const requisitos = c.ativo ? (porPessoa.get(c.id) ?? {}) : {};
    let pior: { requisito: string; estado: EstadoRequisito } | null = null;
    for (const [requisito, estado] of Object.entries(requisitos)) {
      if (!pior || maisUrgente(estado, pior.estado)) pior = { requisito, estado };
    }
    return {
      colaborador_id: c.id,
      matricula: c.matricula,
      nome: c.nome,
      cargo: c.cargo,
      supervisor_id: c.supervisor_id,
      supervisor_nome: c.supervisores?.nome ?? null,
      foto_url: c.foto_url,
      ativo: c.ativo,
      status: pior?.estado.status ?? null,
      dias: pior?.estado.dias ?? null,
      requisito: pior?.requisito ?? null,
      requisitos,
    };
  });
}

export interface DadosColaboradores {
  pessoas: PessoaLista[];
  /** Mensagem pronta para mostrar; nunca vem junto de uma lista "válida". */
  erro: string | null;
}

/**
 * Junta as duas leituras. Se qualquer uma falhou, o resultado é erro e lista
 * vazia: sem os status, mostrar todos os colaboradores "sem status" seria dado
 * falso, e sem os colaboradores não há o que listar.
 */
export function combinarCargas(
  colaboradores: { linhas: ColaboradorBruto[]; erro: string | null },
  status: { linhas: LinhaStatusBruta[]; erro: string | null }
): DadosColaboradores {
  const falha = colaboradores.erro ?? status.erro;
  if (falha) return { pessoas: [], erro: `Não foi possível carregar os colaboradores: ${falha}` };
  return { pessoas: montarPessoas(colaboradores.linhas, status.linhas), erro: null };
}

// ---------------------------------------------------------------------------
// Filtrar, ordenar, paginar
// ---------------------------------------------------------------------------

/** Minúsculas, sem acento e com espaços normais: "ALVARO" acha "Álvaro". */
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function casaBusca(pessoa: PessoaLista, busca: string): boolean {
  const termo = normalizarTexto(busca);
  if (!termo) return true;
  // Só dígitos: a matrícula é exata ("100" não acha a 1000); o nome segue
  // valendo, como na busca do Radar.
  if (/^\d+$/.test(termo) && pessoa.matricula === Number(termo)) return true;
  return normalizarTexto(pessoa.nome).includes(termo);
}

/**
 * Filtra e ordena. Com requisito escolhido, a linha passa a mostrar o estado da
 * pessoa nele, e o filtro de status vale para esse estado; sem requisito, vale
 * o pior. Quem não tem o requisito (a AVP é opcional) fica fora.
 *
 * Ordem: pior status primeiro, depois quem vence antes, depois nome — a mesma
 * pergunta do Radar, "quem pede ação". Desligados, sem status, saem por nome.
 */
export function filtrarPessoas(
  pessoas: readonly PessoaLista[],
  filtros: FiltrosColaboradores,
  supervisorIdPerfil: string | null
): PessoaLista[] {
  const doQuadro = pessoas.filter((p) => p.ativo === (filtros.situacao === "ativos"));

  const resultado: PessoaLista[] = [];
  for (const p of doQuadro) {
    if (filtros.equipe === "minha" && (!supervisorIdPerfil || p.supervisor_id !== supervisorIdPerfil)) continue;
    if (filtros.supervisor === SEM_SUPERVISOR) {
      if (p.supervisor_id !== null) continue;
    } else if (filtros.supervisor && p.supervisor_id !== filtros.supervisor) continue;
    if (!casaBusca(p, filtros.busca)) continue;

    let linha = p;
    if (filtros.requisito) {
      const estado = p.requisitos[filtros.requisito];
      if (!estado) continue;
      linha = { ...p, status: estado.status, dias: estado.dias, requisito: filtros.requisito };
    }
    if (filtros.status && linha.status !== filtros.status) continue;

    resultado.push(linha);
  }

  const peso = (p: PessoaLista) => (p.status ? ORDEM_STATUS.indexOf(p.status) : PESO_NENHUM);
  return resultado.sort(
    (a, b) =>
      peso(a) - peso(b) ||
      (a.dias ?? -Infinity) - (b.dias ?? -Infinity) ||
      a.nome.localeCompare(b.nome, "pt-BR") ||
      a.matricula - b.matricula
  );
}

export function totalDePaginas(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA_COLABORADORES));
}

export interface PaginaColaboradores {
  linhas: PessoaLista[];
  total: number;
  /** Página efetivamente mostrada (o pedido, ajustado ao intervalo existente). */
  pagina: number;
  totalPaginas: number;
}

export function paginar(lista: readonly PessoaLista[], pedida: number): PaginaColaboradores {
  const totalPaginas = totalDePaginas(lista.length);
  const pagina = Math.min(Math.max(1, Math.floor(pedida) || 1), totalPaginas);
  const inicio = (pagina - 1) * POR_PAGINA_COLABORADORES;
  return {
    linhas: lista.slice(inicio, inicio + POR_PAGINA_COLABORADORES),
    total: lista.length,
    pagina,
    totalPaginas,
  };
}

export interface ResultadoColaboradores extends PaginaColaboradores {
  erro: string | null;
}

/** Tudo junto: filtra, ordena e pagina. Com erro de carga, devolve a mensagem e nada mais. */
export function consultarColaboradores(
  dados: DadosColaboradores,
  filtros: FiltrosColaboradores,
  supervisorIdPerfil: string | null
): ResultadoColaboradores {
  if (dados.erro) return { ...paginar([], 1), erro: dados.erro };
  return { ...paginar(filtrarPessoas(dados.pessoas, filtros, supervisorIdPerfil), filtros.pagina), erro: null };
}
