import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tela de Tratamento (só admin): o que falta no cadastro, uma tarefa por lacuna.
 *
 * A lista é calculada na hora a partir do estado do banco — não há tabela de
 * tarefas. Corrigido o dado, a tarefa some sozinha (spec de 17/11/2026).
 *
 * ASO e AVP vencidos também entram (pedido de Matheus em 18/11/2026), além de
 * seguirem no Radar. Só `import type` aqui, para rodar sob
 * `node --experimental-strip-types` no teste puro.
 */

export type TipoTarefa = "sem_supervisor" | "sem_aso" | "sem_avp" | "aso_vencido" | "avp_vencido" | "fora_neo";

export const TIPOS_TAREFA: readonly TipoTarefa[] = [
  "sem_supervisor",
  "sem_aso",
  "sem_avp",
  "aso_vencido",
  "avp_vencido",
  "fora_neo",
];

export const ROTULO_TAREFA: Record<TipoTarefa, string> = {
  sem_supervisor: "Sem supervisor",
  sem_aso: "Sem ASO",
  sem_avp: "Sem AVP",
  aso_vencido: "ASO vencido",
  avp_vencido: "AVP vencido",
  fora_neo: "Fora da NEO",
};

export const DESCRICAO_TAREFA: Record<TipoTarefa, string> = {
  sem_supervisor: 'Não está ligado a nenhuma equipe; não aparece em "Minha equipe".',
  sem_aso: "Nenhum ASO registrado. Conta como vencido no semáforo.",
  sem_avp: "Exige AVP e não há avaliação registrada.",
  aso_vencido: "O último ASO venceu. Registre o novo, se já foi feito.",
  avp_vencido: "A última AVP venceu. Registre a nova, se já foi feita.",
  fora_neo: "Ativo no GIRO, mas não ligado ao cadastro da NEO.",
};

export interface ColaboradorTratamento {
  id: string;
  nome: string;
  matricula: number;
  ativo: boolean;
  supervisor_id: string | null;
  neo_id: string | null;
}

export interface StatusTratamento {
  colaborador_id: string;
  requisito: string;
  status: string;
  /** `dias_restantes` da view: negativo quando vencido. */
  dias_restantes?: number | null;
}

export interface TarefaTratamento {
  /** `${tipo}:${colaboradorId}` — chave estável da linha. */
  chave: string;
  tipo: TipoTarefa;
  colaboradorId: string;
  nome: string;
  matricula: number;
  /** Só nos vencidos: dias desde o vencimento (positivo). */
  diasVencido?: number;
}

/** Requisito do catálogo → tarefa de "sem registro". Nomes exatos de `tipos_requisito`. */
const SEM_REGISTRO: Record<string, TipoTarefa> = {
  "ASO Periódico": "sem_aso",
  "Avaliação Psicossocial (AVP)": "sem_avp",
};

/** Requisito do catálogo → tarefa de "vencido". */
const VENCIDO: Record<string, TipoTarefa> = {
  "ASO Periódico": "aso_vencido",
  "Avaliação Psicossocial (AVP)": "avp_vencido",
};

export function montarTarefas(
  colaboradores: ColaboradorTratamento[],
  status: StatusTratamento[]
): TarefaTratamento[] {
  const ativos = new Map(colaboradores.filter((c) => c.ativo).map((c) => [c.id, c]));
  const tarefas: TarefaTratamento[] = [];
  const incluir = (tipo: TipoTarefa, c: ColaboradorTratamento, diasVencido?: number) =>
    tarefas.push({
      chave: `${tipo}:${c.id}`,
      tipo,
      colaboradorId: c.id,
      nome: c.nome,
      matricula: c.matricula,
      ...(diasVencido === undefined ? {} : { diasVencido }),
    });

  for (const c of ativos.values()) {
    if (!c.supervisor_id) incluir("sem_supervisor", c);
    if (!c.neo_id) incluir("fora_neo", c);
  }
  for (const s of status) {
    const c = ativos.get(s.colaborador_id);
    if (!c) continue;
    if (s.status === "sem_registro" && SEM_REGISTRO[s.requisito]) incluir(SEM_REGISTRO[s.requisito], c);
    if (s.status === "vencido" && VENCIDO[s.requisito]) {
      incluir(VENCIDO[s.requisito], c, Math.max(0, -(s.dias_restantes ?? 0)));
    }
  }

  // Por tipo; dentro dos vencidos, o mais atrasado primeiro; depois nome.
  return tarefas.sort(
    (a, b) =>
      TIPOS_TAREFA.indexOf(a.tipo) - TIPOS_TAREFA.indexOf(b.tipo) ||
      (b.diasVencido ?? 0) - (a.diasVencido ?? 0) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

export function contarPorTipo(tarefas: TarefaTratamento[]): Record<TipoTarefa, number> {
  const contagem = { sem_supervisor: 0, sem_aso: 0, sem_avp: 0, aso_vencido: 0, avp_vencido: 0, fora_neo: 0 };
  for (const t of tarefas) contagem[t.tipo]++;
  return contagem;
}

export async function carregarTratamento(supabase: SupabaseClient): Promise<TarefaTratamento[]> {
  const [colaboradores, status] = await Promise.all([
    supabase.from("colaboradores").select("id, nome, matricula, ativo, supervisor_id, neo_id").eq("ativo", true),
    supabase
      .from("vw_status_colaborador")
      .select("colaborador_id, requisito, status, dias_restantes")
      .in("status", ["sem_registro", "vencido"]),
  ]);
  if (colaboradores.error) throw new Error(colaboradores.error.message);
  if (status.error) throw new Error(status.error.message);
  return montarTarefas(
    (colaboradores.data ?? []) as ColaboradorTratamento[],
    (status.data ?? []) as StatusTratamento[]
  );
}
