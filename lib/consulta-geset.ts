import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendenciaGeset } from "./tipos";

/**
 * Fila "Falta lançar no GESET" (migration 0019): ASO/AVP já concluído no GIRO
 * que o QSMS ainda precisa lançar à mão no GESET.
 *
 * Mesmo desenho de `consulta-itens.ts`: a consulta roda no servidor (primeira
 * página, que precisa vir no HTML) e no navegador (busca, filtro e página).
 * `vw_pendencias_geset` é `security_invoker`, então a RLS decide o que volta.
 *
 * Só `import type` aqui: o arquivo roda sob `node --experimental-strip-types`
 * nos testes, sem o resolvedor do Next.
 */

/** Igual ao Radar: 25 por página. */
export const POR_PAGINA_GESET = 25;

export interface FiltrosGeset {
  busca?: string;
  requisito?: string;
  /** Número ou texto (vem da URL). Inválido cai em 1. */
  pagina?: number | string;
}

export interface FiltrosGesetNormalizados {
  busca: string;
  requisito: string | undefined;
  pagina: number;
}

export interface PaginaGeset {
  linhas: PendenciaGeset[];
  total: number;
  erro: string | null;
}

/**
 * Vírgula, parênteses, curingas e barra saem antes: dentro de `.or()` eles são
 * sintaxe do PostgREST, e um nome com vírgula quebraria a consulta. Mesma regra
 * de `montarConsultaItens`.
 */
export function limparBuscaGeset(busca: string | undefined): string {
  return (busca ?? "").replace(/[,()%*\\]/g, " ").trim();
}

export function normalizarFiltrosGeset(filtros: FiltrosGeset): FiltrosGesetNormalizados {
  const numero = Math.floor(Number(filtros.pagina));
  return {
    busca: limparBuscaGeset(filtros.busca),
    requisito: filtros.requisito ? filtros.requisito : undefined,
    pagina: Number.isFinite(numero) && numero >= 1 ? numero : 1,
  };
}

/** Query string para manter a URL compartilhável; `fila=geset` sempre vai. */
export function filtrosGesetParaBusca(filtros: FiltrosGeset): string {
  const { busca, requisito, pagina } = normalizarFiltrosGeset(filtros);
  const params = new URLSearchParams({ fila: "geset" });
  if (busca) params.set("busca", busca);
  if (requisito) params.set("requisito", requisito);
  if (pagina > 1) params.set("pagina", String(pagina));
  return params.toString();
}

export function totalDePaginas(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA_GESET));
}

/** Mais antigo a vencer primeiro (é o que mais urgentemente precisa estar no GESET), depois nome. */
export function montarConsultaGeset(supabase: SupabaseClient, filtros: FiltrosGeset) {
  const { busca, requisito, pagina } = normalizarFiltrosGeset(filtros);

  let consulta = supabase
    .from("vw_pendencias_geset")
    .select("*", { count: "exact" })
    .order("data_vencimento", { ascending: true })
    .order("nome", { ascending: true })
    // Desempate estável: sem ele, duas linhas iguais podem trocar de página.
    .order("evento_id", { ascending: true });

  if (busca) {
    consulta = /^\d+$/.test(busca)
      ? consulta.or(`matricula.eq.${busca},nome.ilike.%${busca}%`)
      : consulta.ilike("nome", `%${busca}%`);
  }
  if (requisito) consulta = consulta.eq("requisito", requisito);

  const inicio = (pagina - 1) * POR_PAGINA_GESET;
  return consulta.range(inicio, inicio + POR_PAGINA_GESET - 1);
}

export async function buscarPendenciasGeset(
  supabase: SupabaseClient,
  filtros: FiltrosGeset
): Promise<PaginaGeset> {
  const { data, error, count } = await montarConsultaGeset(supabase, filtros);
  return {
    linhas: (data ?? []) as PendenciaGeset[],
    total: count ?? 0,
    erro: error?.message ?? null,
  };
}

/**
 * Quantas pendências há no GESET, sem trazer linhas. `null` em erro: o
 * chamador mostra "—", não um 0 que diria "tudo lançado" por engano.
 */
export async function contarPendenciasGeset(supabase: SupabaseClient): Promise<number | null> {
  const { count, error } = await supabase
    .from("vw_pendencias_geset")
    .select("evento_id", { count: "exact", head: true });
  if (error || count === null || count === undefined) return null;
  return count;
}
