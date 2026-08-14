import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário: cria os itens dos vencimentos dos próximos 60 dias.
 *
 * Idempotente pelo índice uq_item_aberto — rodar duas vezes no mesmo dia não
 * duplica nada. Toda a regra está em fn_gerar_itens_pendentes.
 */
async function executar(request: NextRequest) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase.rpc("fn_gerar_itens_pendentes");

  if (error) {
    console.error("[cron:gerar-itens]", error.message);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const linha = data?.[0] ?? { criados: 0, sem_registro: 0, a_vencer: 0 };
  const resultado = {
    criados: Number(linha.criados ?? 0),
    sem_registro: Number(linha.sem_registro ?? 0),
    a_vencer: Number(linha.a_vencer ?? 0),
    em: new Date().toISOString(),
  };

  console.log("[cron:gerar-itens]", resultado);
  return NextResponse.json(resultado);
}

export async function GET(request: NextRequest) {
  return executar(request);
}

export async function POST(request: NextRequest) {
  return executar(request);
}
