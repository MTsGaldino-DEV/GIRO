import type { Dono, Etapa, ItemAberto, LinhaStatus, Perfil, StatusConformidade } from "./tipos";

/**
 * Regras puras do Dashboard (spec 2026-11-13-telas-e-fluxo, seção 6). As
 * consultas ao banco ficam em `consulta-dashboard.ts`.
 *
 * Visão da UEN para todos; quem tem `supervisor_id` pode recortar a própria
 * equipe (`?equipe=minha`). Cada número abre, no fim da página, a lista de
 * quem está nele (`?detalhe=<chave>`).
 *
 * Só `import type` e caminho relativo: o arquivo roda sob
 * `node --experimental-strip-types` em `scripts/teste-consulta-dashboard.mjs`.
 */

// ---------------------------------------------------------------------------
// Escopo
// ---------------------------------------------------------------------------

export type EscopoDashboard = "todas" | "minha";

type PerfilEscopo = Pick<Perfil, "supervisor_id">;

/** Valor cru de `searchParams`: o Next entrega lista quando o parâmetro se repete. */
export type ParametroUrl = string | string[] | undefined;

/** Só texto simples vale; lista (`?detalhe=a&detalhe=b`) ou ausência viram `undefined`. */
export function textoDoParametro(valor: ParametroUrl): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

/** O segmento "UEN / Minha equipe" só existe para quem tem equipe vinculada. */
export function podeEscolherEquipe(perfil: PerfilEscopo): boolean {
  return !!perfil.supervisor_id;
}

/** Padrão é a UEN para todos os papéis; "minha" só vale com vínculo. */
export function resolverEscopoDashboard(perfil: PerfilEscopo, pedido: ParametroUrl): EscopoDashboard {
  return textoDoParametro(pedido) === "minha" && podeEscolherEquipe(perfil) ? "minha" : "todas";
}

// ---------------------------------------------------------------------------
// Chave do detalhe (?detalhe=)
// ---------------------------------------------------------------------------

export const STATUS_DETALHE: readonly StatusConformidade[] = [
  "vencido",
  "sem_registro",
  "critico",
  "atencao",
  "programar",
  "ok",
];

/** Etapas em aberto, na ordem do fluxo. */
export const ETAPAS_ABERTAS: readonly Etapa[] = [
  "previsto",
  "data_solicitada",
  "data_proposta",
  "agendado",
  "enviado_clinica",
  "aguardando_documento",
  "inapto_em_tratativa",
];

const SIMPLES = ["radar", "agendados", "parados", "concluidos", "abertos"] as const;

export type ChaveDetalhe =
  | { tipo: "status"; status: StatusConformidade }
  | { tipo: (typeof SIMPLES)[number] }
  | { tipo: "etapa"; etapa: Etapa }
  | { tipo: "dono"; dono: "supervisor" | "qsms" }
  /** Responsável: id do supervisor, "sem-supervisor" ou "qsms". */
  | { tipo: "responsavel"; id: string };

export const SEM_SUPERVISOR = "sem-supervisor";
export const RESPONSAVEL_QSMS = "qsms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valor da URL → chave. Qualquer coisa fora do previsto vira `null` (sem lista). */
export function lerDetalhe(parametro: ParametroUrl): ChaveDetalhe | null {
  const valor = textoDoParametro(parametro);
  if (!valor) return null;
  if ((STATUS_DETALHE as readonly string[]).includes(valor)) {
    return { tipo: "status", status: valor as StatusConformidade };
  }
  if ((SIMPLES as readonly string[]).includes(valor)) {
    return { tipo: valor as (typeof SIMPLES)[number] };
  }
  if (valor.startsWith("etapa-")) {
    const etapa = valor.slice(6);
    return (ETAPAS_ABERTAS as readonly string[]).includes(etapa) ? { tipo: "etapa", etapa: etapa as Etapa } : null;
  }
  if (valor === "dono-supervisor" || valor === "dono-qsms") {
    return { tipo: "dono", dono: valor.slice(5) as "supervisor" | "qsms" };
  }
  if (valor.startsWith("resp-")) {
    const id = valor.slice(5);
    if (id === RESPONSAVEL_QSMS || id === SEM_SUPERVISOR || UUID.test(id)) return { tipo: "responsavel", id };
  }
  return null;
}

export function detalheParaTexto(chave: ChaveDetalhe): string {
  switch (chave.tipo) {
    case "status":
      return chave.status;
    case "etapa":
      return `etapa-${chave.etapa}`;
    case "dono":
      return `dono-${chave.dono}`;
    case "responsavel":
      return `resp-${chave.id}`;
    default:
      return chave.tipo;
  }
}

/** Endereço do Dashboard; com detalhe, rola até a lista no fim da página. */
export function hrefDashboard(escopo: EscopoDashboard, detalhe?: string): string {
  const busca = new URLSearchParams();
  if (escopo === "minha") busca.set("equipe", "minha");
  if (detalhe) busca.set("detalhe", detalhe);
  const texto = busca.toString();
  return `/dashboard${texto ? `?${texto}` : ""}${detalhe ? "#detalhe" : ""}`;
}

// ---------------------------------------------------------------------------
// Semáforo por pessoa
// ---------------------------------------------------------------------------

type LinhaPessoa = Pick<LinhaStatus, "colaborador_id" | "tipo_requisito_id" | "status" | "peso_status" | "dias_restantes">;

/**
 * Uma linha por colaborador: a de pior status (menor `peso_status`), como em
 * `fn_resumo_status` (0015). No empate, a mais urgente (menos dias).
 */
export function piorPorPessoa<T extends LinhaPessoa>(linhas: readonly T[]): T[] {
  const pior = new Map<string, T>();
  for (const linha of linhas) {
    const atual = pior.get(linha.colaborador_id);
    if (
      !atual ||
      linha.peso_status < atual.peso_status ||
      (linha.peso_status === atual.peso_status && (linha.dias_restantes ?? -Infinity) < (atual.dias_restantes ?? -Infinity))
    ) {
      pior.set(linha.colaborador_id, linha);
    }
  }
  return [...pior.values()];
}

export interface ContagemStatus {
  total: number;
  sem_registro: number;
  vencido: number;
  critico: number;
  atencao: number;
  programar: number;
  ok: number;
}

export function resumirPorPessoa(linhas: readonly LinhaPessoa[]): ContagemStatus {
  const r: ContagemStatus = { total: 0, sem_registro: 0, vencido: 0, critico: 0, atencao: 0, programar: 0, ok: 0 };
  for (const p of piorPorPessoa(linhas)) {
    r.total++;
    r[p.status]++;
  }
  return r;
}

export function percentual(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/** Linha de `fn_resumo_status` (bigint chega como texto); sem linha, null. */
export function lerResumo(bruto: unknown): ContagemStatus | null {
  const r = (Array.isArray(bruto) ? bruto[0] : null) as Record<string, number | string> | null;
  if (!r) return null;
  const n = (k: string) => Number(r[k]);
  return {
    total: n("total"),
    sem_registro: n("sem_registro"),
    vencido: n("vencido"),
    critico: n("critico"),
    atencao: n("atencao"),
    programar: n("programar"),
    ok: n("ok"),
  };
}

// ---------------------------------------------------------------------------
// Itens abertos
// ---------------------------------------------------------------------------

export type ItemDashboard = Pick<
  ItemAberto,
  | "item_id"
  | "colaborador_id"
  | "tipo_requisito_id"
  | "nome"
  | "requisito"
  | "supervisor_id"
  | "supervisor_nome"
  | "etapa"
  | "dono"
  | "status"
  | "dias_restantes"
  | "dias_parados"
  | "sla_estourado"
>;

export interface LinhaEtapa {
  etapa: Etapa;
  dono: Dono;
  quantidade: number;
  estourados: number;
  dias_max: number;
}

const ordemEtapa = (e: Etapa) => {
  const i = ETAPAS_ABERTAS.indexOf(e);
  return i === -1 ? ETAPAS_ABERTAS.length : i;
};

/** Linhas de `fn_resumo_por_etapa` (bigint chega como texto) na ordem do fluxo. */
export function agruparEtapas(
  linhas: readonly { etapa: string; dono: string; quantidade: number | string; estourados: number | string; dias_max: number | string }[]
): LinhaEtapa[] {
  return linhas
    .map((l) => ({
      etapa: l.etapa as Etapa,
      dono: l.dono as Dono,
      quantidade: Number(l.quantidade),
      estourados: Number(l.estourados),
      dias_max: Number(l.dias_max),
    }))
    .sort((a, b) => ordemEtapa(a.etapa) - ordemEtapa(b.etapa));
}

/** O mesmo que `fn_resumo_por_etapa`, calculado sobre os itens do escopo. */
export function contarPorEtapa(itens: readonly ItemDashboard[]): LinhaEtapa[] {
  const mapa = new Map<Etapa, LinhaEtapa>();
  for (const i of itens) {
    const l = mapa.get(i.etapa) ?? { etapa: i.etapa, dono: i.dono, quantidade: 0, estourados: 0, dias_max: 0 };
    l.quantidade++;
    if (i.sla_estourado) l.estourados++;
    l.dias_max = Math.max(l.dias_max, i.dias_parados);
    mapa.set(i.etapa, l);
  }
  return agruparEtapas([...mapa.values()]);
}

export function totalPorDono(etapas: readonly LinhaEtapa[]): { supervisor: number; qsms: number } {
  const r = { supervisor: 0, qsms: 0 };
  for (const e of etapas) if (e.dono === "supervisor" || e.dono === "qsms") r[e.dono] += e.quantidade;
  return r;
}

export interface LinhaResponsavel {
  /** id do supervisor, "sem-supervisor" ou "qsms". */
  id: string;
  nome: string;
  emMaos: number;
  vencidos: number;
  parados: number;
}

/** Com quem está a bola: o supervisor da equipe quando a etapa é da supervisão; o QSMS quando é dele. */
function responsavelDe(i: ItemDashboard): { id: string; nome: string } {
  if (i.dono === "qsms") return { id: RESPONSAVEL_QSMS, nome: "QSMS" };
  return i.supervisor_id ? { id: i.supervisor_id, nome: i.supervisor_nome ?? "Supervisor" } : { id: SEM_SUPERVISOR, nome: "Sem supervisor" };
}

/** Uma linha por responsável; as linhas somam o total de itens abertos. QSMS por último. */
export function porResponsavel(itens: readonly ItemDashboard[]): LinhaResponsavel[] {
  const mapa = new Map<string, LinhaResponsavel>();
  for (const i of itens) {
    const { id, nome } = responsavelDe(i);
    const l = mapa.get(id) ?? { id, nome, emMaos: 0, vencidos: 0, parados: 0 };
    l.emMaos++;
    if (i.status === "vencido") l.vencidos++;
    if (i.sla_estourado) l.parados++;
    mapa.set(id, l);
  }
  return [...mapa.values()].sort((a, b) => {
    if ((a.id === RESPONSAVEL_QSMS) !== (b.id === RESPONSAVEL_QSMS)) return a.id === RESPONSAVEL_QSMS ? 1 : -1;
    return b.emMaos - a.emMaos || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function mediaDiasParados(itens: readonly Pick<ItemDashboard, "dias_parados">[]): number | null {
  if (itens.length === 0) return null;
  return Math.round(itens.reduce((s, i) => s + i.dias_parados, 0) / itens.length);
}

/** Dias parados na etapa atual, em média, para cada etapa com item aberto. */
export function mediaDiasPorEtapa(itens: readonly ItemDashboard[]): Partial<Record<Etapa, number>> {
  const grupos = new Map<Etapa, ItemDashboard[]>();
  for (const i of itens) grupos.set(i.etapa, [...(grupos.get(i.etapa) ?? []), i]);
  return Object.fromEntries([...grupos].map(([etapa, lista]) => [etapa, mediaDiasParados(lista) ?? 0]));
}

// ---------------------------------------------------------------------------
// Vencimentos e conclusões
// ---------------------------------------------------------------------------

/** Quem vence primeiro (vencidos à frente, como no mockup); sem data fica fora. */
export function maisProximosDeVencer<T extends Pick<LinhaStatus, "dias_restantes">>(linhas: readonly T[], n = 20): T[] {
  return linhas
    .filter((l) => l.dias_restantes !== null && l.dias_restantes !== undefined)
    .sort((a, b) => (a.dias_restantes as number) - (b.dias_restantes as number))
    .slice(0, n);
}

/** 'YYYY-MM-01' do mês de `hojeIso`, deslocado em meses. Aritmética sobre a string, sem fuso. */
export function primeiroDiaDoMes(hojeIso: string, deslocamento = 0): string {
  const [ano, mes] = hojeIso.split("-").map(Number);
  const indice = ano * 12 + (mes - 1) + deslocamento;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}-01`;
}

/** Mesma saída de `fn_conclusoes_por_mes(meses)`: um ponto por mês, inclusive os vazios. */
export function conclusoesPorMes(datas: readonly string[], hojeIso: string, meses: number): { mes: string; quantidade: number }[] {
  const pontos = Array.from({ length: meses }, (_, i) => ({ mes: primeiroDiaDoMes(hojeIso, i - meses + 1), quantidade: 0 }));
  const porMes = new Map(pontos.map((p) => [p.mes.slice(0, 7), p]));
  for (const d of datas) {
    const ponto = porMes.get(d.slice(0, 7));
    if (ponto) ponto.quantidade++;
  }
  return pontos;
}

// ---------------------------------------------------------------------------
// Lista do detalhe
// ---------------------------------------------------------------------------

export type LinhaStatusDashboard = Pick<
  LinhaStatus,
  "colaborador_id" | "tipo_requisito_id" | "nome" | "requisito" | "supervisor_nome" | "status" | "peso_status" | "dias_restantes"
>;

export interface ConcluidoDashboard {
  id: string;
  colaborador_id: string;
  nome: string;
  requisito: string;
  supervisor_nome: string | null;
  data_documento: string;
}

export interface DadosDetalhe {
  linhasStatus: readonly LinhaStatusDashboard[];
  itens: readonly ItemDashboard[];
  /** `null` quando a consulta do Radar falhou: a lista sai vazia, nunca "todos". */
  idsRadar: ReadonlySet<string> | null;
  concluidos: readonly ConcluidoDashboard[];
}

export interface LinhaDetalhe {
  chave: string;
  colaboradorId: string;
  nome: string;
  requisito: string;
  supervisor: string;
  status: StatusConformidade | null;
  dias: number | null;
  etapa: Etapa | null;
  dono: Dono | null;
  diasParados: number | null;
  /** Data do documento (só em concluídos). */
  data: string | null;
}

export interface Detalhe {
  /** pessoas: uma linha por colaborador; itens: uma por item aberto; eventos: concluídos. */
  tipo: "pessoas" | "itens" | "eventos";
  linhas: LinhaDetalhe[];
}

const nomeSupervisor = (nome: string | null) => nome ?? "Sem supervisor";

function linhaDeItem(i: ItemDashboard): LinhaDetalhe {
  return {
    chave: i.item_id,
    colaboradorId: i.colaborador_id,
    nome: i.nome,
    requisito: i.requisito,
    supervisor: nomeSupervisor(i.supervisor_nome),
    status: i.status,
    dias: i.dias_restantes,
    etapa: i.etapa,
    dono: i.dono,
    diasParados: i.dias_parados,
    data: null,
  };
}

function filtroItens(chave: ChaveDetalhe, idsRadar: ReadonlySet<string> | null): (i: ItemDashboard) => boolean {
  switch (chave.tipo) {
    case "radar":
      return (i) => !!idsRadar?.has(i.item_id);
    case "agendados":
      return (i) => i.etapa === "agendado";
    case "parados":
      return (i) => i.sla_estourado;
    case "etapa":
      return (i) => i.etapa === chave.etapa;
    case "dono":
      return (i) => i.dono === chave.dono;
    case "responsavel":
      return (i) => responsavelDe(i).id === chave.id;
    default:
      return () => true;
  }
}

export function montarDetalhe(chave: ChaveDetalhe, dados: DadosDetalhe): Detalhe {
  if (chave.tipo === "status") {
    const itemPorRequisito = new Map(dados.itens.map((i) => [`${i.colaborador_id}|${i.tipo_requisito_id}`, i]));
    const linhas = piorPorPessoa(dados.linhasStatus)
      .filter((p) => p.status === chave.status)
      .sort((a, b) => (a.dias_restantes ?? -Infinity) - (b.dias_restantes ?? -Infinity) || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((p): LinhaDetalhe => {
        const item = itemPorRequisito.get(`${p.colaborador_id}|${p.tipo_requisito_id}`);
        return {
          chave: p.colaborador_id,
          colaboradorId: p.colaborador_id,
          nome: p.nome,
          requisito: p.requisito,
          supervisor: nomeSupervisor(p.supervisor_nome),
          status: p.status,
          dias: p.dias_restantes,
          etapa: item?.etapa ?? null,
          dono: item?.dono ?? null,
          diasParados: item?.dias_parados ?? null,
          data: null,
        };
      });
    return { tipo: "pessoas", linhas };
  }

  if (chave.tipo === "concluidos") {
    const linhas = [...dados.concluidos]
      .sort((a, b) => b.data_documento.localeCompare(a.data_documento) || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((e): LinhaDetalhe => ({
        chave: e.id,
        colaboradorId: e.colaborador_id,
        nome: e.nome,
        requisito: e.requisito,
        supervisor: nomeSupervisor(e.supervisor_nome),
        status: null,
        dias: null,
        etapa: null,
        dono: null,
        diasParados: null,
        data: e.data_documento,
      }));
    return { tipo: "eventos", linhas };
  }

  const linhas = dados.itens
    .filter(filtroItens(chave, dados.idsRadar))
    .sort((a, b) => b.dias_parados - a.dias_parados || a.nome.localeCompare(b.nome, "pt-BR"))
    .map(linhaDeItem);
  return { tipo: "itens", linhas };
}

/** Quais consultas falharam neste carregamento. */
export interface FalhasDashboard {
  status: boolean;
  itens: boolean;
  radar: boolean;
  concluidos: boolean;
}

/**
 * A lista do detalhe depende de uma consulta. Se ela falhou, a lista mostra o
 * aviso, nunca "ninguém neste número": o cartão (às vezes de uma RPC que deu
 * certo) e a lista não podem divergir em silêncio.
 */
export function detalheIndisponivel(chave: ChaveDetalhe, falhas: FalhasDashboard): boolean {
  switch (chave.tipo) {
    case "status":
      return falhas.status;
    case "concluidos":
      return falhas.concluidos;
    case "radar":
      return falhas.radar || falhas.itens;
    default:
      return falhas.itens;
  }
}
