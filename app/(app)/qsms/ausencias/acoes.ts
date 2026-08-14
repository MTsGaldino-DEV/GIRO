"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirQsms } from "@/lib/perfil";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquema = z
  .object({
    colaborador_id: z.string().uuid("Escolha o colaborador."),
    tipo: z.enum(["ferias", "atestado", "afastamento"]),
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início."),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  })
  .refine((d) => !d.data_fim || d.data_fim >= d.data_inicio, {
    message: "O retorno não pode ser antes do início.",
    path: ["data_fim"],
  });

/**
 * Registro manual de ausência (P7).
 *
 * A coluna "Férias" do CSV de origem veio inteiramente vazia e não há sistema
 * integrado, então o QSMS alimenta à mão. É o padrão previsto no plano — e a
 * razão de a tela existir em vez de a informação simplesmente faltar.
 */
export async function registrarAusencia(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquema.safeParse({
    colaborador_id: formData.get("colaborador_id"),
    tipo: formData.get("tipo"),
    data_inicio: formData.get("data_inicio"),
    data_fim: formData.get("data_fim") || "",
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("ausencias").insert({
    colaborador_id: analise.data.colaborador_id,
    tipo: analise.data.tipo,
    data_inicio: analise.data.data_inicio,
    data_fim: analise.data.data_fim || null,
  });

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/qsms/ausencias");
  revalidatePath("/qsms");
  revalidatePath("/supervisor");
  return { ok: true, mensagem: "Ausência registrada." };
}

export async function removerAusencia(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, erro: "Ausência inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("ausencias").delete().eq("id", id.data);

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/qsms/ausencias");
  revalidatePath("/qsms");
  revalidatePath("/supervisor");
  return { ok: true, mensagem: "Ausência removida." };
}
