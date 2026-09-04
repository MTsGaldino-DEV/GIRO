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
  clinica_id: z.string().uuid().optional(),
  clinica: z.string().trim().optional(),
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
    clinica_id: formData.get("clinica_id") || undefined,
    clinica: formData.get("clinica") || undefined,
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

  // Clínica do cadastro ou nome digitado. O mapa de clínicas por polo ainda é
  // [PENDENTE], então o campo livre continua valendo.
  if (!analise.data.clinica_id && !analise.data.clinica) {
    return { ok: false, erro: "Informe a clínica." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_agendar", {
    p_item_id: analise.data.item_id,
    p_clinica_id: analise.data.clinica_id ?? null,
    p_clinica: analise.data.clinica ?? null,
    p_endereco: analise.data.endereco ?? null,
    p_medico: analise.data.medico ?? null,
    p_data: analise.data.data_agendada,
    p_hora: analise.data.hora_agendada,
    p_psicossocial: analise.data.psicossocial ?? false,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return {
    ok: true,
    mensagem: "Agendamento registrado. Agora informe clínica, horário e orientações ao supervisor.",
  };
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
        ? "Resultado registrado. O processo entrou em tratativa de inapto e fica travado até resolução explícita — o colaborador permanece bloqueado."
        : "Resultado registrado. O próximo ciclo foi aberto a partir da data de realização do exame.",
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
  return { ok: true, mensagem: "Item devolvido ao supervisor para propor outra data." };
}

// ---------------------------------------------------------------------------
// Fase 1 — passos 2 a 7 do plano de ação.
//
// Na Fase 1 o supervisor não tem login: o QSMS conduz o fluxo inteiro e
// registra as decisões dele. Quem pode fazer o quê é decidido nas RPCs, não
// aqui — estas funções só validam formato e traduzem a mensagem de erro.
// ---------------------------------------------------------------------------

const esquemaSolicitarData = z.object({
  item_id: z.string().uuid(),
  canal: z.enum(["e-mail", "WhatsApp", "telefone", "pessoalmente"]).optional(),
  observacao: z.string().trim().optional(),
});

export async function solicitarData(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaSolicitarData.safeParse({
    item_id: formData.get("item_id"),
    canal: formData.get("canal") || undefined,
    observacao: formData.get("observacao") || undefined,
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_solicitar_data", {
    p_item_id: analise.data.item_id,
    p_canal: analise.data.canal ?? null,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Solicitação registrada. O item está com a supervisão." };
}

// ---------------------------------------------------------------------------

const esquemaDataSupervisor = z.object({
  item_id: z.string().uuid(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de liberação.")
    .refine((d) => d >= hojeIso(), "A data de liberação não pode estar no passado."),
  em_nome_de: z.string().trim().min(2, "Informe em nome de qual supervisor."),
  observacao: z.string().trim().optional(),
});

export async function registrarDataSupervisor(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaDataSupervisor.safeParse({
    item_id: formData.get("item_id"),
    data: formData.get("data"),
    em_nome_de: formData.get("em_nome_de"),
    observacao: formData.get("observacao") || undefined,
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_registrar_data_supervisor", {
    p_item_id: analise.data.item_id,
    p_data: analise.data.data,
    p_em_nome_de: analise.data.em_nome_de,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Data registrada em nome do supervisor. Agora é checar a clínica." };
}

// ---------------------------------------------------------------------------

const esquemaInformarDados = z.object({
  item_id: z.string().uuid(),
  em_nome_de: z.string().trim().optional(),
  observacao: z.string().trim().optional(),
});

export async function informarDados(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaInformarDados.safeParse({
    item_id: formData.get("item_id"),
    em_nome_de: formData.get("em_nome_de") || undefined,
    observacao: formData.get("observacao") || undefined,
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_informar_dados", {
    p_item_id: analise.data.item_id,
    p_em_nome_de: analise.data.em_nome_de ?? null,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Registrado: a supervisão recebeu clínica, horário e orientações." };
}

// ---------------------------------------------------------------------------

export async function enviarAClinica(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const itemId = z.string().uuid().safeParse(formData.get("item_id"));
  if (!itemId.success) return { ok: false, erro: "Item inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_enviar_clinica", {
    p_item_id: itemId.data,
    p_observacao: (formData.get("observacao") as string) || null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(itemId.data);
  return { ok: true, mensagem: "Envio registrado. Falta o desfecho do exame." };
}

// ---------------------------------------------------------------------------
// Desfecho (plano, seção 6.3).
//
// Quatro dos cinco não fecham o ciclo. Ir à clínica não é conformidade.
// ---------------------------------------------------------------------------

const esquemaDesfecho = z.object({
  item_id: z.string().uuid(),
  desfecho: z.enum(["fez_apto", "fez_inapto", "faltou", "incompleto", "retorno_necessario"]),
  observacao: z.string().trim().optional(),
});

const MENSAGEM_DESFECHO: Record<string, string> = {
  fez_apto: "Desfecho registrado. Agora é obter o documento e lançar no GESET.",
  fez_inapto:
    "Desfecho registrado. O processo está travado em tratativa de inapto e o colaborador permanece bloqueado.",
  faltou: "Desfecho registrado. O ciclo voltou ao supervisor para propor nova data.",
  incompleto: "Desfecho registrado. O ciclo voltou ao supervisor para propor nova data.",
  retorno_necessario: "Desfecho registrado. O ciclo voltou ao supervisor para marcar o retorno.",
};

export async function registrarDesfecho(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaDesfecho.safeParse({
    item_id: formData.get("item_id"),
    desfecho: formData.get("desfecho"),
    observacao: formData.get("observacao") || undefined,
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_registrar_desfecho", {
    p_item_id: analise.data.item_id,
    p_desfecho: analise.data.desfecho,
    p_observacao: analise.data.observacao ?? null,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: MENSAGEM_DESFECHO[analise.data.desfecho] };
}

// ---------------------------------------------------------------------------
// Saída da tratativa de inapto.
//
// [PENDENTE] O procedimento (tornar apto vs. dispensar) não foi definido com o
// QSMS, e o plano manda não inventar regra. O sistema não decide nada aqui: só
// encerra o item com o motivo registrado no histórico.
// ---------------------------------------------------------------------------

const esquemaInapto = z.object({
  item_id: z.string().uuid(),
  resolucao: z.string().trim().min(5, "Descreva como o caso foi resolvido."),
});

export async function encerrarInapto(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaInapto.safeParse({
    item_id: formData.get("item_id"),
    resolucao: formData.get("resolucao"),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_encerrar_inapto", {
    p_item_id: analise.data.item_id,
    p_resolucao: analise.data.resolucao,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return {
    ok: true,
    mensagem:
      "Tratativa encerrada. Se houve novo exame, gere um item novo; se foi dispensa, inative o colaborador no cadastro.",
  };
}

// ---------------------------------------------------------------------------

const esquemaCancelar = z.object({
  item_id: z.string().uuid(),
  motivo: z.string().trim().min(5, "Informe o motivo do cancelamento."),
});

export async function cancelarItem(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaCancelar.safeParse({
    item_id: formData.get("item_id"),
    motivo: formData.get("motivo"),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_cancelar_item", {
    p_item_id: analise.data.item_id,
    p_motivo: analise.data.motivo,
  });

  if (error) return { ok: false, erro: mensagemDeErro(error.message) };

  revalidarPaineis(analise.data.item_id);
  return { ok: true, mensagem: "Item cancelado." };
}
