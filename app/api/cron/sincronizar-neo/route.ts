import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron";
import { ErroNeo, listarColaboradoresNeo } from "@/lib/neo";
import { executarSincronizacao, resumoContagens } from "@/lib/sincronizar-neo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário (08:30, antes do gerar-itens das 09:00): sincroniza o cadastro de
 * colaboradores com a CENTRAL-NEO.
 *
 * Idempotente: rodar duas vezes seguidas não altera nenhuma linha. Se a NEO falhar,
 * nada é aplicado, a falha fica em neo_sincronizacoes e a rota responde erro.
 * A resposta e o log só têm contagens (nunca nome, CPF ou matrícula).
 */
async function executar(request: NextRequest) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  try {
    const relatorio = await executarSincronizacao(criarClienteAdmin(), {
      aplicar: true,
      origem: "cron",
      listar: listarColaboradoresNeo,
    });
    const resultado = { ...resumoContagens(relatorio), em: new Date().toISOString() };
    console.log("[cron:sincronizar-neo]", resultado);
    return NextResponse.json(resultado);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha na sincronização.";
    console.error("[cron:sincronizar-neo]", mensagem);
    return NextResponse.json({ erro: mensagem }, { status: e instanceof ErroNeo ? 502 : 500 });
  }
}

export async function GET(request: NextRequest) {
  return executar(request);
}

export async function POST(request: NextRequest) {
  return executar(request);
}
