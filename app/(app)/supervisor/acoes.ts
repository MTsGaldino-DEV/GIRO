"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOperador } from "@/lib/perfil";
import { hojeIso } from "@/lib/dominio";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

function revalidar(itemId: string) {
  revalidatePath("/radar");
  revalidatePath(`/supervisor/item/${itemId}`);
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
  await exigirOperador();

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

const esquemaFalta = z.object({
  item_id: z.string().uuid(),
  observacao: z.string().trim().optional(),
});

/**
 * Registra a falta ao exame. Só a falta: o antigo "compareceu" levava o item
 * para `aguardando_documento` sem documento, e desde 0021 o banco o recusa.
 * Quem foi ao exame segue por "Registrar resultado", com o ASO.
 */
export async function registrarComparecimento(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirOperador();

  const analise = esquemaFalta.safeParse({
    item_id: formData.get("item_id"),
    observacao: formData.get("observacao") || undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_registrar_comparecimento", {
    p_item_id: analise.data.item_id,
    p_compareceu: false,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: error.message };

  revalidar(analise.data.item_id);

  return { ok: true, mensagem: "Falta registrada. O item voltou para você informar uma nova data." };
}
