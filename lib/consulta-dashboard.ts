import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConcluidoDashboard, EventoAntecedencia, ItemDashboard, LinhaStatusDashboard } from "./regras-dashboard";

/**
 * Consultas do Dashboard. As regras (escopo, pior status por pessoa, contagens
 * e a lista do detalhe) ficam em `regras-dashboard.ts`.
 *
 * Só `import type` e caminho relativo: `buscarTodas` é testada sob
 * `node --experimental-strip-types` em `scripts/teste-consulta-dashboard.mjs`.
 */

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Lê todas as linhas, em páginas: o PostgREST corta cada resposta em 1000
 * linhas, e a base passa disso quando conta requisito por pessoa.
 */
export async function buscarTodas<T>(pagina: (de: number, ate: number) => Pagina, tamanho = 1000): Promise<{ linhas: T[]; erro: string | null }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await pagina(de, de + tamanho - 1);
    if (error) return { linhas: [], erro: error.message };
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < tamanho) return { linhas, erro: null };
  }
}

const COLUNAS_STATUS = "colaborador_id, tipo_requisito_id, nome, requisito, supervisor_nome, status, peso_status, dias_restantes";
const COLUNAS_ITENS =
  "item_id, colaborador_id, tipo_requisito_id, nome, requisito, supervisor_id, supervisor_nome, etapa, dono, status, dias_restantes, dias_parados, sla_estourado";

/** Linhas de `vw_status_colaborador` (pessoa × requisito), da UEN ou de uma equipe. */
export function buscarLinhasStatus(supabase: SupabaseClient, supervisorId: string | null) {
  return buscarTodas<LinhaStatusDashboard>((de, ate) => {
    let q = supabase.from("vw_status_colaborador").select(COLUNAS_STATUS);
    if (supervisorId) q = q.eq("supervisor_id", supervisorId);
    return q.order("colaborador_id").order("tipo_requisito_id").range(de, ate);
  });
}

/** Todos os itens abertos (`vw_itens_abertos` já tira concluído e cancelado), da UEN ou de uma equipe. */
export function buscarItensAbertos(supabase: SupabaseClient, supervisorId: string | null) {
  return buscarTodas<ItemDashboard>((de, ate) => {
    let q = supabase.from("vw_itens_abertos").select(COLUNAS_ITENS);
    if (supervisorId) q = q.eq("supervisor_id", supervisorId);
    return q.order("item_id").range(de, ate);
  });
}

interface EventoBruto {
  id: string;
  colaborador_id: string;
  data_documento: string;
  tipos_requisito: { nome: string } | null;
  colaboradores: { nome: string; supervisores: { nome: string } | null } | null;
}

/**
 * ASO/AVP concluídos (apto ou apto com restrição) com documento em
 * [desde, ate). Mesmo critério de `fn_conclusoes_por_mes` (0010), que conta
 * por `data_documento` e não filtra colaborador ativo.
 */
export async function buscarConcluidos(
  supabase: SupabaseClient,
  desde: string,
  ate: string,
  supervisorId: string | null
): Promise<{ linhas: ConcluidoDashboard[]; erro: string | null }> {
  const r = await buscarTodas<EventoBruto>((de, fim) => {
    let q = supabase
      .from("eventos_requisito")
      .select("id, colaborador_id, data_documento, tipos_requisito(nome), colaboradores!inner(nome, supervisor_id, supervisores(nome))")
      .in("resultado", ["apto", "apto_com_restricao"])
      .gte("data_documento", desde)
      .lt("data_documento", ate);
    if (supervisorId) q = q.eq("colaboradores.supervisor_id", supervisorId);
    return q.order("id").range(de, fim);
  });
  return {
    erro: r.erro,
    linhas: r.linhas.map((e) => ({
      id: e.id,
      colaborador_id: e.colaborador_id,
      nome: e.colaboradores?.nome ?? "—",
      requisito: e.tipos_requisito?.nome ?? "—",
      supervisor_nome: e.colaboradores?.supervisores?.nome ?? null,
      data_documento: e.data_documento,
    })),
  };
}

interface EventoAntecedenciaBruto {
  colaborador_id: string;
  tipo_requisito_id: string;
  data_documento: string;
  estimado: boolean;
  tipos_requisito: { periodicidade_meses: number } | null;
}

/**
 * Todos os ASO/AVP aptos com documento antes de `ate`, da UEN ou de uma equipe.
 * Vem o histórico inteiro porque a antecedência de cada documento depende do
 * anterior, que pode ser de anos atrás.
 */
export async function buscarEventosAntecedencia(
  supabase: SupabaseClient,
  ate: string,
  supervisorId: string | null
): Promise<{ linhas: EventoAntecedencia[]; erro: string | null }> {
  const r = await buscarTodas<EventoAntecedenciaBruto>((de, fim) => {
    let q = supabase
      .from("eventos_requisito")
      .select("id, colaborador_id, tipo_requisito_id, data_documento, estimado, tipos_requisito(periodicidade_meses), colaboradores!inner(supervisor_id)")
      .in("resultado", ["apto", "apto_com_restricao"])
      .lt("data_documento", ate);
    if (supervisorId) q = q.eq("colaboradores.supervisor_id", supervisorId);
    return q.order("id").range(de, fim);
  });
  return {
    erro: r.erro,
    linhas: r.linhas
      .filter((e) => e.tipos_requisito)
      .map((e) => ({
        colaborador_id: e.colaborador_id,
        tipo_requisito_id: e.tipo_requisito_id,
        data_documento: e.data_documento,
        estimado: e.estimado,
        periodicidade_meses: e.tipos_requisito!.periodicidade_meses,
      })),
  };
}
