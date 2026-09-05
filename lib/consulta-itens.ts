import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemAberto } from "./tipos";

/** Colunas que aceitam ordenação, e como cada uma vira ORDER BY na consulta. */
export const COLUNAS_ORDENAVEIS = {
  nome: { coluna: "nome", ascPadrao: true },
  vencimento: { coluna: "data_vencimento", ascPadrao: true },
  status: { coluna: "peso_status", ascPadrao: true },
  parados: { coluna: "dias_parados", ascPadrao: false },
} as const;

export type ChaveOrdenacao = keyof typeof COLUNAS_ORDENAVEIS;

export function ehChaveOrdenacao(v: string | undefined): v is ChaveOrdenacao {
  return !!v && v in COLUNAS_ORDENAVEIS;
}

export const POR_PAGINA = 25;

/** Valor de supervisor que representa "nenhum vínculo", já que null não vai na URL. */
export const SEM_SUPERVISOR = "sem-supervisor";

export interface FiltrosPainel {
  status?: string;
  etapa?: string;
  supervisor?: string;
  polo?: string;
  parados?: string;
  ordem?: string;
  dir?: string;
  pagina?: string;
}

/**
 * Monta a consulta do painel a partir dos filtros.
 *
 * Um lugar só porque a mesma consulta roda dos dois lados: no servidor para a
 * primeira página (que precisa vir no HTML) e no navegador a cada filtro,
 * ordenação ou troca de página. Duas cópias divergiriam no primeiro filtro
 * novo, e o bug apareceria só numa das metades.
 *
 * O tipo do cliente é o mesmo nos dois casos — a RLS é que decide o que volta,
 * não quem chama.
 */
export function montarConsultaItens(supabase: SupabaseClient, filtros: FiltrosPainel) {
  let consulta = supabase.from("vw_itens_abertos").select("*", { count: "exact" });

  const ordem = ehChaveOrdenacao(filtros.ordem) ? filtros.ordem : null;
  const direcao = filtros.dir === "desc" ? "desc" : "asc";

  if (ordem) {
    consulta = consulta.order(COLUNAS_ORDENAVEIS[ordem].coluna, { ascending: direcao === "asc" });
  } else {
    // Padrão: pior primeiro, e dentro do mesmo status quem está parado há mais
    // tempo. É a ordem que responde "o que eu faço agora".
    consulta = consulta.order("peso_status").order("dias_parados", { ascending: false });
  }

  if (filtros.status) consulta = consulta.eq("status", filtros.status);
  if (filtros.etapa) consulta = consulta.eq("etapa", filtros.etapa);
  if (filtros.polo) consulta = consulta.eq("polo", filtros.polo);
  if (filtros.parados === "1") consulta = consulta.eq("sla_estourado", true);
  if (filtros.supervisor === SEM_SUPERVISOR) consulta = consulta.is("supervisor_id", null);
  else if (filtros.supervisor) consulta = consulta.eq("supervisor_id", filtros.supervisor);

  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const inicio = (pagina - 1) * POR_PAGINA;

  return consulta.range(inicio, inicio + POR_PAGINA - 1);
}

export interface PaginaItens {
  itens: ItemAberto[];
  total: number;
  erro: string | null;
}

/** Executa a consulta e normaliza o retorno para os dois lados. */
export async function buscarPaginaItens(
  supabase: SupabaseClient,
  filtros: FiltrosPainel
): Promise<PaginaItens> {
  const { data, error, count } = await montarConsultaItens(supabase, filtros);
  return {
    itens: (data ?? []) as ItemAberto[],
    total: count ?? 0,
    erro: error?.message ?? null,
  };
}

/** Filtros vigentes como query string, para manter a URL compartilhável. */
export function filtrosParaBusca(filtros: FiltrosPainel): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) busca.set(chave, String(valor));
  }
  return busca.toString();
}
