"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOperador } from "@/lib/perfil";
import { hojeIso } from "@/lib/dominio";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

/** As duas datas de um exame que se corrigem com o lápis, e como cada uma aparece na trilha. */
const CAMPOS = {
  data_documento: "data do documento",
  data_realizado: "data de realização",
} as const;

const esquema = z.object({
  evento_id: z.string().uuid("Exame inválido."),
  campo: z.enum(["data_documento", "data_realizado"], { message: "Campo inválido." }),
  valor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.")
    .refine((d) => d <= hojeIso(), "A data não pode estar no futuro."),
  origem: z.string().default("Perfil do Colaborador"),
});

/**
 * Corrige uma data de um exame já registrado.
 *
 * Existe para consertar o que veio errado da carga inicial (datas lidas à mão
 * nos documentos das pastas) sem apagar e relançar o evento — apagar perderia
 * o vínculo com o item que o concluiu. Só admin: é reescrever um fato, e a
 * política `eventos_escrita_qsms` sozinha deixaria o QSMS inteiro fazer isso.
 *
 * O vencimento é derivado do último exame apto (vw_status_colaborador), então
 * a correção já move o semáforo. O que não se move sozinho é o item aberto,
 * que guarda o vencimento em coluna: ele é reposicionado aqui, como faz
 * `fn_registrar_aso_retroativo`. Se a data nova puser o vencimento dentro da
 * janela de 90 dias, `fn_gerar_itens_pendentes` abre o item agora em vez de
 * esperar o cron da madrugada.
 */
export async function corrigirDataExame(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirOperador();

  const analise = esquema.safeParse({
    evento_id: formData.get("evento_id"),
    campo: formData.get("campo"),
    valor: formData.get("valor") ?? "",
    origem: formData.get("origem") ?? undefined,
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { evento_id, campo, valor, origem } = analise.data;

  const supabase = await criarClienteServidor();

  const { data: evento } = await supabase
    .from("eventos_requisito")
    .select("colaborador_id, tipo_requisito_id, data_documento, data_realizado, tipos_requisito(nome)")
    .eq("id", evento_id)
    .maybeSingle();
  if (!evento) return { ok: false, erro: "Exame não encontrado." };

  const anterior = (evento as Record<string, unknown>)[campo] as string | null;
  if (anterior === valor) return { ok: true, mensagem: "Nada mudou." };

  const { error } = await supabase
    .from("eventos_requisito")
    .update({ [campo]: valor })
    .eq("id", evento_id);
  if (error) return { ok: false, erro: error.message };

  const { data: status } = await supabase
    .from("vw_status_colaborador")
    .select("data_vencimento")
    .eq("colaborador_id", evento.colaborador_id)
    .eq("tipo_requisito_id", evento.tipo_requisito_id)
    .maybeSingle();

  if (status?.data_vencimento) {
    await supabase
      .from("itens_pendencia")
      .update({ data_vencimento: status.data_vencimento })
      .eq("colaborador_id", evento.colaborador_id)
      .eq("tipo_requisito_id", evento.tipo_requisito_id)
      .not("etapa", "in", "(concluido,cancelado)");
  }
  await supabase.rpc("fn_gerar_itens_pendentes");

  const requisito = (evento.tipos_requisito as unknown as { nome: string } | null)?.nome ?? "exame";
  try {
    await supabase.rpc("fn_registrar_auditoria", {
      p_colaborador_id: evento.colaborador_id,
      p_acao: "alterou",
      p_entidade: "colaborador",
      p_entidade_id: evento.colaborador_id,
      p_campo: `${CAMPOS[campo]} (${requisito})`,
      p_valor_anterior: anterior,
      p_valor_novo: valor,
      p_origem: origem,
    });
  } catch {
    // Mesma escolha de salvarCampo: auditoria perdida não desfaz a correção.
  }

  revalidatePath(`/qsms/colaborador/${evento.colaborador_id}`, "layout");
  revalidatePath("/radar");
  revalidatePath("/dashboard");
  return { ok: true, mensagem: "Data corrigida." };
}
