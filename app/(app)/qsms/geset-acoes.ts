"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOperador } from "@/lib/perfil";
import type { Acao } from "./acoes";

// Marca de lançamento no GESET (spec 2026-11-13-telas-e-fluxo, seção 8;
// migration 0019). A regra (quem pode, inapto recusado, no-op quando já está
// no estado pedido, auditoria) fica em fn_marcar_geset; aqui só se valida o
// formato e se traduz o erro.

const esquema = z.object({
  evento_id: z.string().uuid("Evento inválido."),
  lancado: z.enum(["true", "false"], { message: "Informe se foi lançado." }),
});

/**
 * As exceções de fn_marcar_geset são frases em português escritas para o
 * usuário; o resto (rede, SQL) não pode vazar. Por isso só passam as de
 * SQLSTATE conhecido; os demais viram texto genérico.
 */
function mensagemDeErro(erro: { message: string; code?: string }): string {
  if (erro.code === "42501") return "Você não tem permissão para esta ação.";
  if (erro.code === "P0002" || erro.code === "23514") {
    return erro.message;
  }
  return "Não foi possível registrar agora. Tente de novo.";
}

export async function marcarGeset(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirOperador();

  const analise = esquema.safeParse({
    evento_id: formData.get("evento_id"),
    lancado: formData.get("lancado") ?? "true",
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const lancado = analise.data.lancado === "true";

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_marcar_geset", {
    p_evento_id: analise.data.evento_id,
    p_lancado: lancado,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error) };

  revalidatePath("/radar");
  revalidatePath("/dashboard");
  return {
    ok: true,
    mensagem: lancado ? "Marcado como lançado no GESET." : "Voltou para a fila do GESET.",
  };
}
