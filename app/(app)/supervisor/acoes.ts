"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirSupervisor } from "@/lib/perfil";
import { hojeIso } from "@/lib/dominio";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

function revalidar(itemId: string) {
  revalidatePath("/supervisor");
  revalidatePath(`/supervisor/item/${itemId}`);
  revalidatePath("/qsms");
  revalidatePath(`/qsms/item/${itemId}`);
}

const esquemaData = z.object({
  item_id: z.string().uuid(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha a data em que pode liberar o colaborador.")
    .refine((d) => d >= hojeIso(), "A data não pode estar no passado."),
  observacao: z.string().trim().optional(),
});

/**
 * Supervisor informa quando libera o colaborador da equipe.
 *
 * O caminho mais curto do sistema: é o que precisa caber em 30 segundos, no
 * celular, a partir do link do e-mail.
 */
export async function informarDataLiberacao(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirSupervisor();

  const analise = esquemaData.safeParse({
    item_id: formData.get("item_id"),
    data: formData.get("data"),
    observacao: formData.get("observacao") || undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_propor_data", {
    p_item_id: analise.data.item_id,
    p_data: analise.data.data,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: error.message };

  revalidar(analise.data.item_id);
  return { ok: true, mensagem: "Data enviada. O QSMS vai agendar com a clínica." };
}

// ---------------------------------------------------------------------------

const esquemaComparecimento = z.object({
  item_id: z.string().uuid(),
  compareceu: z.enum(["sim", "nao"]),
  observacao: z.string().trim().optional(),
});

export async function registrarComparecimento(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirSupervisor();

  const analise = esquemaComparecimento.safeParse({
    item_id: formData.get("item_id"),
    compareceu: formData.get("compareceu"),
    observacao: formData.get("observacao") || undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const compareceu = analise.data.compareceu === "sim";

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_registrar_comparecimento", {
    p_item_id: analise.data.item_id,
    p_compareceu: compareceu,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: error.message };

  revalidar(analise.data.item_id);

  return {
    ok: true,
    mensagem: compareceu
      ? "Presença confirmada. Agora o QSMS busca o documento na clínica — o ASO só conta quando o documento chega."
      : "Falta registrada. O item voltou para você informar uma nova data.",
  };
}
