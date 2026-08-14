"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirQsms } from "@/lib/perfil";
import { hojeIso } from "@/lib/dominio";
import { enviarDocumentoAso } from "@/lib/storage";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

export type ResultadoGeracao =
  | { ok: true; criados: number; sem_registro: number; a_vencer: number }
  | { ok: false; erro: string };

function revalidarPaineis(itemId?: string) {
  revalidatePath("/qsms");
  revalidatePath("/supervisor");
  if (itemId) {
    revalidatePath(`/qsms/item/${itemId}`);
    revalidatePath(`/supervisor/item/${itemId}`);
  }
}

/**
 * As mensagens do Postgres saem legíveis (as RPCs usam `raise exception` com
 * texto em português), mas erros de infraestrutura não. Traduzir o que dá e
 * não expor stack para o usuário final.
 */
function mensagemDeErro(mensagem: string): string {
  if (mensagem.includes("insufficient_privilege") || mensagem.includes("privilege")) {
    return "Você não tem permissão para esta ação.";
  }
  if (mensagem.includes("uq_item_aberto")) {
    return "Já existe um ciclo aberto para este colaborador.";
  }
  return mensagem;
}

// ---------------------------------------------------------------------------

export async function gerarItens(
  _anterior?: ResultadoGeracao | null,
  _formData?: FormData
): Promise<ResultadoGeracao> {
  await exigirQsms();

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("fn_gerar_itens_pendentes");

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis();
  const linha = data?.[0] ?? { criados: 0, sem_registro: 0, a_vencer: 0 };
  return {
    ok: true,
    criados: Number(linha.criados ?? 0),
    sem_registro: Number(linha.sem_registro ?? 0),
    a_vencer: Number(linha.a_vencer ?? 0),
  };
}

// ---------------------------------------------------------------------------

const esquemaAgendar = z.object({
  item_id: z.string().uuid(),
  clinica: z.string().trim().min(1, "Informe a clínica."),
  endereco: z.string().trim().optional(),
  medico: z.string().trim().optional(),
  data_agendada: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do exame.")
    .refine((d) => d >= hojeIso(), "A data do exame não pode estar no passado."),
  hora_agendada: z.string().regex(/^\d{2}:\d{2}$/, "Informe a hora do exame."),
  psicossocial: z.boolean().optional(),
  observacao: z.string().trim().optional(),
});

export async function agendarItem(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaAgendar.safeParse({
    item_id: formData.get("item_id"),
    clinica: formData.get("clinica"),
    endereco: formData.get("endereco") || undefined,
    medico: formData.get("medico") || undefined,
    data_agendada: formData.get("data_agendada"),
    hora_agendada: formData.get("hora_agendada"),
    psicossocial: formData.get("psicossocial") === "on",
    observacao: formData.get("observacao") || undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_agendar", {
    p_item_id: analise.data.item_id,
    p_clinica: analise.data.clinica,
    p_endereco: analise.data.endereco ?? null,
    p_medico: analise.data.medico ?? null,
    p_data: analise.data.data_agendada,
    p_hora: analise.data.hora_agendada,
    p_psicossocial: analise.data.psicossocial ?? false,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Agendamento registrado. O item passou para o supervisor." };
}

// ---------------------------------------------------------------------------

const esquemaConcluir = z.object({
  item_id: z.string().uuid(),
  data_documento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do documento.")
    .refine((d) => d <= hojeIso(), "A data do documento não pode estar no futuro."),
  data_realizado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  resultado: z.enum(["apto", "inapto", "apto_com_restricao"]),
  medico: z.string().trim().optional(),
  documento_url: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});

export async function concluirItem(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaConcluir.safeParse({
    item_id: formData.get("item_id"),
    data_documento: formData.get("data_documento"),
    data_realizado: formData.get("data_realizado") || "",
    resultado: formData.get("resultado"),
    medico: formData.get("medico") || undefined,
    documento_url: formData.get("documento_url") || undefined,
    observacoes: formData.get("observacoes") || undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();

  // Upload antes de concluir: se o arquivo falhar, o item não muda de etapa.
  // O contrário deixaria um ASO concluído sem documento e sem como voltar atrás.
  let caminhoDocumento = analise.data.documento_url ?? null;
  const arquivo = formData.get("documento");

  if (arquivo instanceof File && arquivo.size > 0) {
    const { data: item } = await supabase
      .from("itens_pendencia")
      .select("colaborador_id")
      .eq("id", analise.data.item_id)
      .maybeSingle();

    if (!item) return { ok: false, erro: "Item não encontrado." };

    const envio = await enviarDocumentoAso(supabase, item.colaborador_id, arquivo);
    if (!envio.ok) return { ok: false, erro: envio.erro };
    caminhoDocumento = envio.caminho;
  }

  const { error } = await supabase.rpc("fn_concluir_item", {
    p_item_id: analise.data.item_id,
    p_data_documento: analise.data.data_documento,
    p_resultado: analise.data.resultado,
    p_data_realizado: analise.data.data_realizado || null,
    p_medico: analise.data.medico ?? null,
    p_documento_url: caminhoDocumento,
    p_observacoes: analise.data.observacoes ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);

  return {
    ok: true,
    mensagem:
      analise.data.resultado === "inapto"
        ? "Resultado registrado. O colaborador permanece bloqueado: inapto não gera conformidade nem abre o próximo ciclo."
        : "Resultado registrado. O próximo ciclo foi aberto automaticamente.",
  };
}

// ---------------------------------------------------------------------------

const esquemaCemig = z.object({
  item_id: z.string().uuid(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da comunicação.")
    .refine((d) => d <= hojeIso(), "A data não pode estar no futuro."),
});

export async function registrarComunicacaoCemig(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaCemig.safeParse({
    item_id: formData.get("item_id"),
    data: formData.get("data"),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_registrar_comunicacao_cemig", {
    p_item_id: analise.data.item_id,
    p_data: analise.data.data,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Comunicação registrada." };
}

// ---------------------------------------------------------------------------
// Devolver ao supervisor quando a data proposta não serve para a clínica.
// ---------------------------------------------------------------------------

const esquemaDevolver = z.object({
  item_id: z.string().uuid(),
  motivo: z.string().trim().min(3, "Explique por que a data não serve."),
});

export async function devolverAoSupervisor(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaDevolver.safeParse({
    item_id: formData.get("item_id"),
    motivo: formData.get("motivo"),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();

  // A transição data_proposta -> previsto é legal na máquina de estados; o
  // trigger grava o histórico com o motivo.
  const { error: erroObs } = await supabase.rpc("fn_devolver_ao_supervisor", {
    p_item_id: analise.data.item_id,
    p_motivo: analise.data.motivo,
  });

  if (erroObs) return { ok: false, erro: mensagemDeErro(erroObs.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Item devolvido ao supervisor." };
}
