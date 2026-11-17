import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tela de Tratamento (só admin): o que falta no cadastro, uma tarefa por lacuna.
 *
 * A lista é calculada na hora a partir do estado do banco — não há tabela de
 * tarefas. Corrigido o dado, a tarefa some sozinha (spec de 17/11/2026).
 *
 * Vencimentos não entram: são o trabalho do Radar. Só `import type` aqui, para
 * rodar sob `node --experimental-strip-types` no teste puro.
 */

export type TipoTarefa = "sem_supervisor" | "sem_aso" | "sem_avp" | "fora_neo";

export const TIPOS_TAREFA: readonly TipoTarefa[] = ["sem_supervisor", "sem_aso", "sem_avp", "fora_neo"];

export const ROTULO_TAREFA: Record<TipoTarefa, string> = {
  sem_supervisor: "Sem supervisor",
  sem_aso: "Sem ASO",
  sem_avp: "Sem AVP",
  fora_neo: "Fora da NEO",
};

export const DESCRICAO_TAREFA: Record<TipoTarefa, string> = {
  sem_supervisor: 'Não está ligado a nenhuma equipe; não aparece em "Minha equipe".',
  sem_aso: "Nenhum ASO registrado. Conta como vencido no semáforo.",
  sem_avp: "Exige AVP e não há avaliação registrada.",
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
}

export interface TarefaTratamento {
  /** `${tipo}:${colaboradorId}` — chave estável da linha. */
  chave: string;
  tipo: TipoTarefa;
  colaboradorId: string;
  nome: string;
  matricula: number;
}

/** Requisito do catálogo → tarefa de "sem registro". Nomes exatos de `tipos_requisito`. */
const SEM_REGISTRO: Record<string, TipoTarefa> = {
  "ASO Periódico": "sem_aso",
  "Avaliação Psicossocial (AVP)": "sem_avp",
};

export function montarTarefas(
  colaboradores: ColaboradorTratamento[],
  status: StatusTratamento[]
): TarefaTratamento[] {
  const ativos = new Map(colaboradores.filter((c) => c.ativo).map((c) => [c.id, c]));
  const tarefas: TarefaTratamento[] = [];
  const incluir = (tipo: TipoTarefa, c: ColaboradorTratamento) =>
    tarefas.push({ chave: `${tipo}:${c.id}`, tipo, colaboradorId: c.id, nome: c.nome, matricula: c.matricula });

  for (const c of ativos.values()) {
    if (!c.supervisor_id) incluir("sem_supervisor", c);
    if (!c.neo_id) incluir("fora_neo", c);
  }
  for (const s of status) {
    const tipo = SEM_REGISTRO[s.requisito];
    const c = ativos.get(s.colaborador_id);
    if (tipo && c && s.status === "sem_registro") incluir(tipo, c);
  }

  return tarefas.sort(
    (a, b) => TIPOS_TAREFA.indexOf(a.tipo) - TIPOS_TAREFA.indexOf(b.tipo) || a.nome.localeCompare(b.nome, "pt-BR")
  );
}

export function contarPorTipo(tarefas: TarefaTratamento[]): Record<TipoTarefa, number> {
  const contagem = { sem_supervisor: 0, sem_aso: 0, sem_avp: 0, fora_neo: 0 };
  for (const t of tarefas) contagem[t.tipo]++;
  return contagem;
}

export async function carregarTratamento(supabase: SupabaseClient): Promise<TarefaTratamento[]> {
  const [colaboradores, status] = await Promise.all([
    supabase.from("colaboradores").select("id, nome, matricula, ativo, supervisor_id, neo_id").eq("ativo", true),
    supabase.from("vw_status_colaborador").select("colaborador_id, requisito, status").eq("status", "sem_registro"),
  ]);
  if (colaboradores.error) throw new Error(colaboradores.error.message);
  if (status.error) throw new Error(status.error.message);
  return montarTarefas(
    (colaboradores.data ?? []) as ColaboradorTratamento[],
    (status.data ?? []) as StatusTratamento[]
  );
}
