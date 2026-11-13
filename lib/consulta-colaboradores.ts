import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTodas } from "./consulta-dashboard";
import {
  combinarCargas,
  consultarColaboradores,
  type ColaboradorBruto,
  type DadosColaboradores,
  type FiltrosColaboradores,
  type LinhaStatusBruta,
  type ResultadoColaboradores,
} from "./regras-colaboradores";

/**
 * Leitura da lista de Colaboradores. As regras (filtro, escopo, ordem e
 * paginação) ficam em `regras-colaboradores.ts`, testadas sem banco.
 *
 * Duas leituras, ambas por `buscarTodas` (o PostgREST corta cada resposta em
 * 1000 linhas e a view tem uma linha por pessoa × requisito):
 *
 *   - `colaboradores`: todos, ativos e desligados. Desligado não está na view
 *     de status (é o que o tira do semáforo), então só aqui ele aparece.
 *   - `vw_status_colaborador`: o semáforo de quem está ativo.
 *
 * A RLS decide o que volta; nenhum filtro de papel mora aqui.
 */
export async function carregarColaboradores(supabase: SupabaseClient): Promise<DadosColaboradores> {
  const [colaboradores, status] = await Promise.all([
    buscarTodas<ColaboradorBruto>((de, ate) =>
      supabase
        .from("colaboradores")
        .select("id, matricula, nome, cargo, supervisor_id, foto_url, ativo, supervisores(nome)")
        .order("matricula")
        .range(de, ate)
    ),
    buscarTodas<LinhaStatusBruta>((de, ate) =>
      supabase
        .from("vw_status_colaborador")
        .select("colaborador_id, tipo_requisito_id, requisito, status, peso_status, dias_restantes")
        .order("colaborador_id")
        .order("tipo_requisito_id")
        .range(de, ate)
    ),
  ]);
  return combinarCargas(colaboradores, status);
}

/**
 * Leitura + filtro + página numa chamada: `{ linhas, total }` (25 por página)
 * mais o que a tela precisa para paginar. `supervisorIdPerfil` é o vínculo de
 * quem consulta, usado só no escopo "Minha equipe".
 */
export async function buscarColaboradores(
  supabase: SupabaseClient,
  filtros: FiltrosColaboradores,
  supervisorIdPerfil: string | null
): Promise<ResultadoColaboradores> {
  return consultarColaboradores(await carregarColaboradores(supabase), filtros, supervisorIdPerfil);
}
