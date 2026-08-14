"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirQsms } from "@/lib/perfil";
import { hojeIso } from "@/lib/dominio";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquema = z.object({
  colaborador_id: z.string().uuid("Colaborador inválido."),
  tipo_requisito_id: z.string().uuid("Requisito inválido."),
  data_documento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato dd/mm/aaaa.")
    .refine((d) => d <= hojeIso(), "A data do ASO não pode estar no futuro.")
    // Um ASO de 2015 quase certamente é erro de digitação no ano.
    .refine((d) => d >= "2000-01-01", "Data anterior a 2000 — confira o ano."),
  estimado: z.boolean().optional(),
});

/**
 * Registra o último ASO conhecido de um colaborador (Fase 0).
 *
 * Cria evento retroativo e reposiciona o vencimento do item que existia por
 * falta de registro. Toda a regra está em fn_registrar_aso_retroativo.
 */
export async function registrarAsoRetroativo(
  _anterior: Resultado | null,
  formData: FormData
): Promise<Resultado> {
  await exigirQsms();

  const analise = esquema.safeParse({
    colaborador_id: formData.get("colaborador_id"),
    tipo_requisito_id: formData.get("tipo_requisito_id"),
    data_documento: formData.get("data_documento"),
    estimado: formData.get("estimado") === "on",
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_registrar_aso_retroativo", {
    p_colaborador_id: analise.data.colaborador_id,
    p_tipo_requisito_id: analise.data.tipo_requisito_id,
    p_data_documento: analise.data.data_documento,
    p_estimado: analise.data.estimado ?? false,
    p_observacoes: null,
  });

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/qsms/base");
  revalidatePath("/qsms");

  return { ok: true, mensagem: "Registrado." };
}
