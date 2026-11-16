"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirOperador } from "@/lib/perfil";
import { hojeIso } from "@/lib/dominio";
import { BUCKET_ASOS, enviarDocumentoAso } from "@/lib/storage";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

export type ResultadoGeracao =
  | { ok: true; criados: number; sem_registro: number; a_vencer: number }
  | { ok: false; erro: string };

function revalidarPaineis(itemId?: string) {
  revalidatePath("/radar");
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
  await exigirOperador();

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
  await exigirOperador();

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
  observacoes: z.string().trim().optional(),
});

/**
 * "Anexar ASO e concluir" (itens em `aguardando_documento`).
 *
 * Apto e apto com restrição fecham o ciclo, então exigem o arquivo do ASO:
 * sem isso, um item concluído mostraria a pessoa "Em dia" por 12 meses sem
 * documento nenhum (spec 2026-11-13-telas-e-fluxo, seção 2: "nenhuma
 * conformidade falsa"). Desde a migration 0021, fn_concluir_item também
 * recusa apto sem documento; a checagem aqui é a primeira barreira, com
 * mensagem amigável. Só inapto pode seguir sem arquivo: não fecha o ciclo.
 *
 * O caminho do documento é sempre o do upload feito aqui; um `documento_url`
 * vindo do formulário é ignorado, senão qualquer arquivo do bucket poderia ser
 * "anexado" a qualquer item.
 */
export async function concluirItem(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirOperador();

  const analise = esquemaConcluir.safeParse({
    item_id: formData.get("item_id"),
    data_documento: formData.get("data_documento"),
    data_realizado: formData.get("data_realizado") || "",
    resultado: formData.get("resultado"),
    medico: formData.get("medico") || undefined,
    observacoes: formData.get("observacoes") || undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const enviado = formData.get("documento");
  const arquivo = enviado instanceof File && enviado.size > 0 ? enviado : null;
  if (!arquivo && analise.data.resultado !== "inapto") {
    return { ok: false, erro: "Anexe o ASO (PDF, JPG ou PNG) para concluir com resultado apto." };
  }

  const supabase = await criarClienteServidor();

  // Upload antes de concluir: se o arquivo falhar, o item não muda de etapa.
  // O contrário deixaria um ASO concluído sem documento e sem como voltar atrás.
  let caminhoDocumento: string | null = null;

  if (arquivo) {
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
  await exigirOperador();

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
  await exigirOperador();

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
  await exigirOperador();

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
  await exigirOperador();

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
  await exigirOperador();

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
  await exigirOperador();

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
// Registrar resultado (spec 2026-11-13-telas-e-fluxo, seção 8; migration 0018).
//
// Um passo só: o desfecho e, quando é "fez e apto", o ASO. Fez e apto conclui
// o item na hora e abre o próximo ciclo; os outros quatro não fecham o ciclo
// (ir à clínica não é conformidade) e não levam documento — fn_registrar_resultado
// os delega a fn_registrar_desfecho e ignoraria qualquer arquivo, então nada de
// documento é enviado para eles.
//
// Substitui a antiga `registrarDesfecho`, cujo "fez e apto" ainda levava o item
// para `aguardando_documento`, etapa que saiu do fluxo normal.
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' que existe no calendário: o regex sozinho aceitaria 2026-02-31. */
function dataDeCalendario(iso: string): boolean {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

const dataIso = (mensagem: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, mensagem).refine(dataDeCalendario, mensagem);

const esquemaResultado = z.object({
  item_id: z.string().uuid(),
  desfecho: z.enum(["fez_apto", "fez_inapto", "faltou", "incompleto", "retorno_necessario"], {
    message: "Escolha o que aconteceu na clínica.",
  }),
  observacao: z.string().trim().optional(),
});

/** Só para "fez e apto". */
const esquemaAso = z.object({
  resultado: z.enum(["apto", "apto_com_restricao"], { message: "Escolha o resultado do ASO." }),
  data_documento: dataIso("Informe a data do documento.").refine(
    (d) => d <= hojeIso(),
    "A data do documento não pode estar no futuro."
  ),
  data_realizado: dataIso("Data de realização inválida.")
    .refine((d) => d <= hojeIso(), "A data de realização não pode estar no futuro.")
    .optional(),
  medico: z.string().trim().optional(),
});

const MENSAGEM_DESFECHO: Record<string, string> = {
  fez_apto: "Resultado registrado. O ASO foi anexado e o próximo ciclo foi aberto.",
  fez_inapto:
    "Desfecho registrado. O processo está travado em tratativa de inapto e o colaborador permanece bloqueado.",
  faltou: "Desfecho registrado. O ciclo voltou ao supervisor para propor nova data.",
  incompleto: "Desfecho registrado. O ciclo voltou ao supervisor para propor nova data.",
  retorno_necessario: "Desfecho registrado. O ciclo voltou ao supervisor para marcar o retorno.",
};

/**
 * Apaga o ASO recém-enviado quando o registro falhou — só com certeza de que
 * ele não ficou em uso. Arquivo órfão custa pouco; evidência apagada de um
 * item concluído, não.
 *
 * Duas condições, as duas obrigatórias:
 *   - `code` preenchido: o Postgres ou o PostgREST recusou a chamada, então a
 *     transação foi desfeita. Falha de rede ou tempo esgotado chegam sem
 *     `code`, e aí o banco pode ter concluído o item com este arquivo;
 *   - o item, relido, continua em `enviado_clinica`.
 * Na dúvida (releitura falhou, qualquer exceção), não apaga.
 */
async function removerSeNaoUsado(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  itemId: string,
  caminho: string,
  codigoErro: string | undefined
) {
  if (!codigoErro) return;
  try {
    const { data, error } = await supabase
      .from("itens_pendencia")
      .select("etapa")
      .eq("id", itemId)
      .maybeSingle();
    if (error || data?.etapa !== "enviado_clinica") return;
    await supabase.storage.from(BUCKET_ASOS).remove([caminho]);
  } catch {
    // Fica o órfão; a mensagem de erro original continua sendo a devolvida.
  }
}

export async function registrarResultado(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirOperador();

  const base = esquemaResultado.safeParse({
    item_id: formData.get("item_id"),
    desfecho: formData.get("desfecho"),
    observacao: formData.get("observacao") || undefined,
  });
  if (!base.success) {
    return { ok: false, erro: base.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { item_id, desfecho, observacao } = base.data;
  const fezApto = desfecho === "fez_apto";

  // Os campos do ASO só são lidos em "fez e apto"; nos outros desfechos o que
  // vier no formulário é descartado aqui, antes de chegar ao banco.
  let aso: z.infer<typeof esquemaAso> | null = null;
  let arquivo: File | null = null;
  if (fezApto) {
    const analise = esquemaAso.safeParse({
      resultado: formData.get("resultado"),
      data_documento: formData.get("data_documento"),
      data_realizado: formData.get("data_realizado") || undefined,
      medico: formData.get("medico") || undefined,
    });
    if (!analise.success) {
      return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
    }
    aso = analise.data;

    const enviado = formData.get("documento");
    if (!(enviado instanceof File) || enviado.size === 0) {
      return { ok: false, erro: "Anexe o ASO (PDF, JPG ou PNG) para registrar “fez e apto”." };
    }
    arquivo = enviado;
  }

  const supabase = await criarClienteServidor();

  // Conferência da etapa antes de qualquer gravação. fn_registrar_resultado lê
  // o item sem trava de linha: dois envios simultâneos de "fez e apto" podiam
  // os dois passar e gravar dois eventos. O botão já fica desabilitado durante
  // o envio; isto barra o segundo clique que chegue depois do primeiro concluir
  // (o item já não está em `enviado_clinica`) antes de subir outro arquivo.
  const { data: item } = await supabase
    .from("itens_pendencia")
    .select("colaborador_id, etapa")
    .eq("id", item_id)
    .maybeSingle();

  if (!item) return { ok: false, erro: "Item não encontrado." };
  if (item.etapa !== "enviado_clinica") {
    return {
      ok: false,
      erro: "Este item já não está aguardando o resultado da clínica. Atualize a lista.",
    };
  }

  // Upload antes de registrar, pela mesma razão de `concluirItem`: se o
  // arquivo falhar, o item não muda de etapa.
  let caminhoDocumento: string | null = null;
  if (arquivo) {
    const envio = await enviarDocumentoAso(supabase, item.colaborador_id, arquivo);
    if (!envio.ok) return { ok: false, erro: envio.erro };
    caminhoDocumento = envio.caminho;
  }

  const { error } = await supabase.rpc("fn_registrar_resultado", {
    p_item_id: item_id,
    p_desfecho: desfecho,
    p_data_documento: aso?.data_documento ?? null,
    p_data_realizado: aso?.data_realizado ?? null,
    p_resultado: aso?.resultado ?? null,
    // Vazio ou só espaços (já aparados pelo Zod) vira null, não texto vazio.
    p_medico: aso?.medico || null,
    p_documento_url: caminhoDocumento,
    p_observacoes: observacao || null,
  });

  if (error) {
    if (caminhoDocumento) await removerSeNaoUsado(supabase, item_id, caminhoDocumento, error.code);
    return { ok: false, erro: mensagemDeErro(error.message) };
  }

  revalidarPaineis(item_id);
  revalidatePath("/dashboard");
  return { ok: true, mensagem: MENSAGEM_DESFECHO[desfecho] };
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
  await exigirOperador();

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
  await exigirOperador();

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
