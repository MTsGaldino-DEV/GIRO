import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import type { Etapa, ItemAberto, Perfil } from "./tipos";

/** Colunas que aceitam ordenação, e como cada uma vira ORDER BY na consulta. */
export const COLUNAS_ORDENAVEIS = {
  nome: { coluna: "nome", ascPadrao: true },
  vencimento: { coluna: "data_vencimento", ascPadrao: true },
  status: { coluna: "peso_status", ascPadrao: true },
} as const;

export type ChaveOrdenacao = keyof typeof COLUNAS_ORDENAVEIS;

export function ehChaveOrdenacao(v: string | undefined): v is ChaveOrdenacao {
  return !!v && v in COLUNAS_ORDENAVEIS;
}

// Era 24 para dividir as colunas da grade de cartões; na lista, 25.
export const POR_PAGINA = 25;

/** Valor de supervisor que representa "nenhum vínculo", já que null não vai na URL. */
export const SEM_SUPERVISOR = "sem-supervisor";

/** Escopo da lista: a equipe do próprio supervisor ou a UEN inteira. */
export type Equipe = "minha" | "todas";

/** Janela do Radar: quem vence em até 90 dias (vencidos e sem registro entram sempre). */
const DIAS_RADAR = 90;

/** Zero UUID: nunca casa com supervisor real. Usado só como cinto de segurança. */
const NENHUM_SUPERVISOR = "00000000-0000-0000-0000-000000000000";

type PerfilEscopo = Pick<Perfil, "papel" | "supervisor_id">;

export interface FiltrosPainel {
  /** Escopo da equipe. Ausente = padrão do papel (ver `equipePadrao`). */
  equipe?: Equipe;
  /** Nome (parte dele) ou matrícula. */
  busca?: string;
  requisito?: string;
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
 * Regras do Radar que valem para a lista e para as contagens da faixa "Para
 * você agir": entrada (vencidos e sem registro sempre; os demais, até 90 dias;
 * cancelados fora) e escopo da equipe. Um lugar só, para a contagem da faixa
 * nunca divergir do total da lista.
 *
 * Aplicada só aqui (a view segue intacta para as outras telas). `.or()`
 * repetido vira AND no PostgREST, então combina com o `.or()` da busca por
 * matrícula.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarRegrasRadar<Q extends PostgrestFilterBuilder<any, any, any, any, any, any, any>>(
  consulta: Q,
  filtros: Pick<FiltrosPainel, "equipe">,
  supervisorIdPerfil: string | null
): Q {
  let q = consulta.neq("etapa", "cancelado").or(`status.in.(sem_registro,vencido),dias_restantes.lte.${DIAS_RADAR}`);

  // Escopo "minha equipe": o vínculo vem do perfil de quem consulta.
  if (filtros.equipe === "minha") {
    q = q.eq("supervisor_id", supervisorIdPerfil ?? NENHUM_SUPERVISOR);
  }
  return q as Q;
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
export function montarConsultaItens(
  supabase: SupabaseClient,
  filtros: FiltrosPainel,
  supervisorIdPerfil: string | null = null
) {
  let consulta = aplicarRegrasRadar(
    supabase.from("vw_itens_abertos").select("*", { count: "exact" }),
    filtros,
    supervisorIdPerfil
  );

  const ordem = ehChaveOrdenacao(filtros.ordem) ? filtros.ordem : null;
  const direcao = filtros.dir === "desc" ? "desc" : "asc";

  if (ordem) {
    consulta = consulta.order(COLUNAS_ORDENAVEIS[ordem].coluna, { ascending: direcao === "asc" });
  } else {
    // Padrão: pior primeiro, e dentro do mesmo status quem está parado há mais
    // tempo. É a ordem que responde "o que eu faço agora".
    consulta = consulta.order("peso_status").order("dias_parados", { ascending: false });
  }

  // Só dígitos procura também pela matrícula exata; o resto vira "contém" no
  // nome. Vírgula, parênteses e curingas saem antes: dentro de `.or()` eles
  // são sintaxe do PostgREST, e um nome com vírgula quebraria a consulta.
  const busca = (filtros.busca ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (busca) {
    consulta = /^\d+$/.test(busca)
      ? consulta.or(`matricula.eq.${busca},nome.ilike.%${busca}%`)
      : consulta.ilike("nome", `%${busca}%`);
  }
  if (filtros.requisito) consulta = consulta.eq("requisito", filtros.requisito);
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

/** Equipe padrão do papel: supervisor vê a sua, QSMS e admin veem a UEN. */
export function equipePadrao(perfil: Pick<PerfilEscopo, "papel">): Equipe {
  return perfil.papel === "supervisor" ? "minha" : "todas";
}

/**
 * Escopo efetivo. Valor desconhecido na URL cai no padrão; "minha" sem vínculo
 * só faz sentido para supervisor (que então vê o aviso de equipe vazia). Para
 * QSMS/admin sem `supervisor_id` a opção nem existe, então vira "todas".
 */
export function resolverEquipe(perfil: PerfilEscopo, filtros: { equipe?: string }): Equipe {
  const pedido: Equipe =
    filtros.equipe === "minha" || filtros.equipe === "todas" ? filtros.equipe : equipePadrao(perfil);
  if (pedido === "minha" && perfil.papel !== "supervisor" && !perfil.supervisor_id) return "todas";
  return pedido;
}

/** Supervisor sem equipe vinculada olhando "minha equipe": lista vazia, com aviso. */
export function equipeSemVinculo(perfil: PerfilEscopo, equipe: Equipe): boolean {
  return equipe === "minha" && !perfil.supervisor_id;
}

/** Executa a consulta e normaliza o retorno para os dois lados. */
export async function buscarPaginaItens(
  supabase: SupabaseClient,
  filtros: FiltrosPainel,
  supervisorIdPerfil: string | null = null
): Promise<PaginaItens> {
  // Sem vínculo não há o que consultar: lista vazia, não erro.
  if (filtros.equipe === "minha" && !supervisorIdPerfil) {
    return { itens: [], total: 0, erro: null };
  }
  const { data, error, count } = await montarConsultaItens(supabase, filtros, supervisorIdPerfil);
  return {
    itens: (data ?? []) as ItemAberto[],
    total: count ?? 0,
    erro: error?.message ?? null,
  };
}

/**
 * Filtros vigentes como query string, para manter a URL compartilhável.
 * `equipe` só entra quando difere do padrão do papel, para o endereço limpo
 * continuar abrindo o escopo certo.
 */
export function filtrosParaBusca(filtros: FiltrosPainel, equipeDoPadrao?: Equipe): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (chave === "equipe" && valor === equipeDoPadrao) continue;
    if (valor) busca.set(chave, String(valor));
  }
  return busca.toString();
}

/**
 * Quantos itens do Radar há em cada etapa, no escopo da equipe dado. Mesma
 * regra de entrada e de escopo da lista (`aplicarRegrasRadar`), só que sem
 * trazer linhas: `head: true` devolve apenas o total. Os demais filtros da
 * lista (busca, requisito etc.) não entram: a faixa mostra o trabalho do
 * papel, e o total da lista bate com ela quando só a etapa está aplicada.
 *
 * Supervisor sem vínculo olhando a própria equipe: tudo zero, sem consultar.
 * Erro numa etapa vira 0 naquela etapa; a lista logo abaixo já avisa falhas.
 */
export async function contarItensPorEtapa(
  supabase: SupabaseClient,
  etapas: readonly Etapa[],
  equipe: Equipe,
  supervisorIdPerfil: string | null
): Promise<Record<string, number>> {
  const zerado = Object.fromEntries(etapas.map((e) => [e, 0]));
  if (equipe === "minha" && !supervisorIdPerfil) return zerado;

  const contagens = await Promise.all(
    etapas.map(async (etapa) => {
      const { count } = await aplicarRegrasRadar(
        supabase.from("vw_itens_abertos").select("item_id", { count: "exact", head: true }),
        { equipe },
        supervisorIdPerfil
      ).eq("etapa", etapa);
      return [etapa, count ?? 0] as const;
    })
  );
  return Object.fromEntries(contagens);
}
