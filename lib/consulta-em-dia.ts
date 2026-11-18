import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarLinhasStatus } from "./consulta-dashboard";
import { lerResumo, percentual, pessoasEmDia, resumirPorPessoa, type ContagemStatus } from "./regras-dashboard";
import type { ResumoEmDia } from "./sidebar";
import type { Perfil } from "./tipos";

/**
 * Resumo "Em dia" do cartão da sidebar: mesma regra do Dashboard (colaborador
 * ativo que não está vencido nem sem registro; ver `pessoasEmDia`).
 *
 * QSMS e admin veem a UEN (`fn_resumo_status`); supervisor com equipe vinculada
 * vê a própria equipe; supervisor sem vínculo vê a UEN. Falha na consulta ou
 * total 0 devolvem null: o anel some, nunca mostra 0% inventado.
 */
export async function carregarEmDia(
  supabase: SupabaseClient,
  perfil: Pick<Perfil, "papel" | "supervisor_id">
): Promise<ResumoEmDia | null> {
  const equipe = perfil.papel === "supervisor" ? perfil.supervisor_id : null;

  let contagem: ContagemStatus | null;
  if (equipe) {
    const status = await buscarLinhasStatus(supabase, equipe);
    contagem = status.erro ? null : resumirPorPessoa(status.linhas);
  } else {
    const { data, error } = await supabase.rpc("fn_resumo_status");
    contagem = error ? null : lerResumo(data);
  }

  if (!contagem || !(contagem.total > 0)) return null;
  const emDia = pessoasEmDia(contagem);
  const pct = percentual(emDia, contagem.total);
  if (pct === null) return null;
  return { emDia, total: contagem.total, percentual: pct, equipe: !!equipe };
}
