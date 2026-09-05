"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirAdmin, exigirQsms } from "@/lib/perfil";
import { BUCKET_FOTOS } from "@/lib/colaborador";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquema = z.object({
  id: z.string().uuid(),
  cargo: z.string().trim().max(120).optional(),
  polo: z.string().trim().max(120).optional(),
  local: z.string().trim().max(160).optional(),
  situacao: z.enum([
    "trabalhando",
    "ferias",
    "auxilio_doenca",
    "atestado",
    "afastamento",
    "outro",
  ]),
  supervisor_id: z.string().uuid().or(z.literal("")),
});

/**
 * Edita o cadastro.
 *
 * Nome, matrícula e CPF ficam de fora: vêm da folha e corrigi-los aqui criaria
 * divergência silenciosa com o RH na próxima reimportação. O que se edita aqui
 * é o que a operação do QSMS conhece melhor que a folha — lotação, situação e
 * de quem a pessoa responde.
 */
export async function salvarCadastro(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquema.safeParse({
    id: formData.get("id"),
    cargo: formData.get("cargo") ?? undefined,
    polo: formData.get("polo") ?? undefined,
    local: formData.get("local") ?? undefined,
    situacao: formData.get("situacao"),
    supervisor_id: formData.get("supervisor_id") ?? "",
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { id, cargo, polo, local, situacao, supervisor_id } = analise.data;
  const origem = String(formData.get("origem") ?? "Cadastro do colaborador");

  const supabase = await criarClienteServidor();

  // Lê antes de escrever: a auditoria precisa do valor anterior, e depois do
  // UPDATE ele não existe mais em lugar nenhum. Os nomes de supervisor vêm
  // junto porque "Carlos → Maria" é legível e "uuid → uuid" não é.
  const { data: antes } = await supabase
    .from("colaboradores")
    .select("cargo, polo, local, situacao, supervisor_id, supervisores(nome)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("colaboradores")
    .update({
      cargo: cargo || null,
      polo: polo || null,
      local: local || null,
      situacao,
      supervisor_id: supervisor_id || null,
    })
    .eq("id", id);

  if (error) return { ok: false, erro: error.message };

  await registrarMudancasDeCadastro(supabase, id, antes, analise.data, origem);

  revalidatePath(`/qsms/colaborador/${id}`, "layout");
  revalidatePath("/qsms");
  return { ok: true, mensagem: "Cadastro atualizado." };
}

/** Linha de auditoria do supervisor precisa de nome, não de uuid. */
async function nomeDoSupervisor(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  supervisorId: string
): Promise<string | null> {
  if (!supervisorId) return null;
  const { data } = await supabase
    .from("supervisores")
    .select("nome")
    .eq("id", supervisorId)
    .maybeSingle();
  return data?.nome ?? supervisorId;
}

/**
 * Uma linha de auditoria por campo que mudou de fato.
 *
 * Campo que o usuário abriu e salvou sem tocar não gera registro: uma trilha
 * que anota "cadastro salvo" toda vez enterra as alterações reais no meio de
 * ruído, e é justamente para achar a alteração real que ela existe.
 *
 * Falha aqui não derruba o salvamento — o dado já foi gravado, e devolver erro
 * faria o usuário salvar de novo, duplicando a alteração. O `catch` silencioso
 * é uma escolha: perder uma linha de auditoria é ruim, reverter uma edição
 * bem-sucedida por causa dela é pior.
 */
async function registrarMudancasDeCadastro(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  colaboradorId: string,
  antes: Record<string, unknown> | null,
  depois: { cargo?: string; polo?: string; local?: string; situacao: string; supervisor_id: string },
  origem: string
): Promise<void> {
  if (!antes) return;

  const anteriorSupervisor = (antes.supervisores as { nome: string } | null)?.nome ?? null;
  const novoSupervisor = await nomeDoSupervisor(supabase, depois.supervisor_id);

  const comparacoes: { campo: string; de: string | null; para: string | null }[] = [
    { campo: "cargo", de: (antes.cargo as string) ?? null, para: depois.cargo || null },
    { campo: "polo", de: (antes.polo as string) ?? null, para: depois.polo || null },
    { campo: "local", de: (antes.local as string) ?? null, para: depois.local || null },
    { campo: "situacao", de: (antes.situacao as string) ?? null, para: depois.situacao },
    { campo: "supervisor", de: anteriorSupervisor, para: novoSupervisor },
  ];

  await registrarCampos(supabase, colaboradorId, comparacoes, origem);
}

/** Uma linha por campo que mudou. Compartilhado pelos dois formulários. */
async function registrarCampos(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  colaboradorId: string,
  comparacoes: { campo: string; de: string | null; para: string | null }[],
  origem: string
): Promise<void> {
  for (const { campo, de, para } of comparacoes) {
    if (de === para) continue;
    try {
      await supabase.rpc("fn_registrar_auditoria", {
        p_colaborador_id: colaboradorId,
        p_acao: "alterou",
        p_entidade: "colaborador",
        p_entidade_id: colaboradorId,
        p_campo: campo,
        p_valor_anterior: de,
        p_valor_novo: para,
        p_origem: origem,
      });
    } catch {
      // Ver o comentário acima: auditoria perdida não invalida a escrita.
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Recebe a foto já reduzida a 256px pelo navegador.
 *
 * O teto de 512 kB é a segunda barreira, não a primeira: o redimensionamento no
 * cliente é quem garante que uma foto de celular não trafegue inteira. Este
 * limite existe para o caso de alguém chamar a ação por fora do formulário.
 */
export async function salvarFoto(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, erro: "Colaborador inválido." };

  const arquivo = formData.get("foto");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha uma imagem." };
  }
  if (arquivo.size > 512 * 1024) {
    return { ok: false, erro: "Imagem grande demais mesmo após a redução. Tente outra." };
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
    return { ok: false, erro: "Formato não aceito. Envie JPG, PNG ou WebP." };
  }

  const supabase = await criarClienteServidor();

  // Caminho novo a cada envio: sobrescrever o mesmo nome deixaria a foto antiga
  // no cache do navegador e do CDN por tempo indeterminado.
  const caminho = `${id.data}/${Date.now()}.jpg`;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });

  if (erroUpload) return { ok: false, erro: `Falha ao enviar: ${erroUpload.message}` };

  const { data: anterior } = await supabase
    .from("colaboradores")
    .select("foto_url")
    .eq("id", id.data)
    .maybeSingle();

  const { error } = await supabase
    .from("colaboradores")
    .update({ foto_url: caminho })
    .eq("id", id.data);

  if (error) {
    // Banco não aceitou: remover o arquivo recém-enviado para não deixar órfão.
    await supabase.storage.from(BUCKET_FOTOS).remove([caminho]);
    return { ok: false, erro: error.message };
  }

  if (anterior?.foto_url) {
    await supabase.storage.from(BUCKET_FOTOS).remove([anterior.foto_url]);
  }

  // O caminho no bucket não diz nada a quem lê a trilha, e a foto anterior já
  // foi apagada — não há como voltar a ela. O que importa registrar é que a
  // imagem trocou, quem trocou e quando.
  try {
    await supabase.rpc("fn_registrar_auditoria", {
      p_colaborador_id: id.data,
      p_acao: anterior?.foto_url ? "alterou" : "criou",
      p_entidade: "foto",
      p_entidade_id: id.data,
      p_campo: "foto",
      p_valor_anterior: anterior?.foto_url ? "foto anterior" : null,
      p_valor_novo: "nova foto",
      p_origem: String(formData.get("origem") ?? "Cadastro do colaborador"),
    });
  } catch {
    // Mesma escolha de registrarMudancasDeCadastro: a foto já subiu e o banco
    // já aponta para ela; perder a linha de trilha não justifica desfazer isso.
  }

  revalidatePath(`/qsms/colaborador/${id.data}`, "layout");
  revalidatePath("/qsms");
  return { ok: true, mensagem: "Foto atualizada." };
}

// ---------------------------------------------------------------------------

/** Só dígitos: é como a base guarda, e comparar formatos diferentes geraria
 *  uma linha de auditoria falsa a cada salvamento. */
function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

const esquemaFolha = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(3, "Nome muito curto.").max(160),
  matricula: z.coerce
    .number({ message: "Matrícula precisa ser um número." })
    .int("Matrícula precisa ser um número inteiro.")
    .positive("Matrícula precisa ser positiva.")
    .max(2147483647),
  cpf: z
    .string()
    .transform(apenasDigitos)
    .refine((v) => v === "" || v.length === 11, "CPF precisa ter 11 dígitos."),
  uen: z.string().trim().max(120),
  data_admissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").or(z.literal("")),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").or(z.literal("")),
});

/**
 * Edita o que vem da folha: nome, matrícula, CPF, UEN e datas.
 *
 * Separado de `salvarCadastro` porque são operações diferentes com permissões
 * diferentes. Lotação e supervisor o QSMS conhece melhor que o RH e edita todo
 * dia; identidade é correção de cadastro, e uma matrícula trocada por engano
 * reaponta ASOs, itens e histórico de uma pessoa para outra.
 *
 * `exigirAdmin()` é regra de produto, não barreira de banco: a política
 * `colaboradores_escrita_qsms` é `for all` e `fn_e_qsms()` já inclui os dois
 * papéis, então um usuário QSMS que chame o PostgREST direto continua podendo
 * escrever estas colunas — como sempre pôde. Transformar isso em barreira real
 * exigiria um trigger, que não faz parte desta entrega.
 */
export async function salvarDadosDaFolha(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirAdmin();

  const analise = esquemaFolha.safeParse({
    id: formData.get("id"),
    nome: formData.get("nome"),
    matricula: formData.get("matricula"),
    cpf: formData.get("cpf") ?? "",
    uen: formData.get("uen") ?? "",
    data_admissao: formData.get("data_admissao") ?? "",
    data_nascimento: formData.get("data_nascimento") ?? "",
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { id, nome, matricula, cpf, uen, data_admissao, data_nascimento } = analise.data;
  const origem = String(formData.get("origem") ?? "Cadastro do colaborador");

  const supabase = await criarClienteServidor();

  const { data: antes } = await supabase
    .from("colaboradores")
    .select("nome, matricula, cpf, uen, data_admissao, data_nascimento")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("colaboradores")
    .update({
      nome,
      matricula,
      cpf: cpf || null,
      uen: uen || null,
      data_admissao: data_admissao || null,
      data_nascimento: data_nascimento || null,
    })
    .eq("id", id);

  if (error) {
    // `matricula` é única na base. A mensagem crua do Postgres cita o nome do
    // índice e não diz de quem é a matrícula ocupada.
    if (error.code === "23505") {
      return { ok: false, erro: `A matrícula ${matricula} já pertence a outro colaborador.` };
    }
    return { ok: false, erro: error.message };
  }

  if (antes) {
    await registrarCampos(
      supabase,
      id,
      [
        { campo: "nome", de: (antes.nome as string) ?? null, para: nome },
        {
          campo: "matrícula",
          de: antes.matricula === null ? null : String(antes.matricula),
          para: String(matricula),
        },
        { campo: "CPF", de: (antes.cpf as string) ?? null, para: cpf || null },
        { campo: "UEN", de: (antes.uen as string) ?? null, para: uen || null },
        {
          campo: "admissão",
          de: (antes.data_admissao as string) ?? null,
          para: data_admissao || null,
        },
        {
          campo: "nascimento",
          de: (antes.data_nascimento as string) ?? null,
          para: data_nascimento || null,
        },
      ],
      origem
    );
  }

  revalidatePath(`/qsms/colaborador/${id}`, "layout");
  revalidatePath("/qsms");
  revalidatePath("/qsms/base");
  return { ok: true, mensagem: "Dados da folha atualizados." };
}

/**
 * Desliga ou reativa o colaborador.
 *
 * Não é exclusão: a linha continua na base com todo o histórico, ASOs e
 * documentos. O que muda é que `vw_status_colaborador` e a geração de itens
 * filtram por `ativo = true`, então um desligado sai do semáforo e para de
 * gerar pendência — ninguém é cobrado por quem não trabalha mais aqui.
 * Reativar devolve tudo, sem perda.
 */
export async function alternarAtivo(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirAdmin();

  const analise = z
    .object({ id: z.string().uuid(), ativo: z.enum(["true", "false"]) })
    .safeParse({ id: formData.get("id"), ativo: formData.get("ativo") });

  if (!analise.success) return { ok: false, erro: "Dados inválidos." };

  const { id } = analise.data;
  const ativo = analise.data.ativo === "true";
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from("colaboradores").update({ ativo }).eq("id", id);
  if (error) return { ok: false, erro: error.message };

  await registrarCampos(
    supabase,
    id,
    [{ campo: "situação no quadro", de: ativo ? "desligado" : "ativo", para: ativo ? "ativo" : "desligado" }],
    String(formData.get("origem") ?? "Cadastro do colaborador")
  );

  revalidatePath(`/qsms/colaborador/${id}`, "layout");
  revalidatePath("/qsms");
  revalidatePath("/qsms/base");
  return { ok: true, mensagem: ativo ? "Colaborador reativado." : "Colaborador desligado." };
}
