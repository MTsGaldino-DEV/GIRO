"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirAdmin, exigirQsms } from "@/lib/perfil";
import { BUCKET_FOTOS } from "@/lib/colaborador";
import { SITUACAO_ROTULO } from "@/lib/dominio";
import { CAMPOS_COLABORADOR, type CampoColaborador } from "@/lib/campos-colaborador";
import type { Situacao } from "@/lib/tipos";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

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

const dataOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .or(z.literal(""))
  .transform((v) => v || null);

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/**
 * Como cada campo é validado. Chaves iguais às de `CAMPOS_COLABORADOR`.
 *
 * Fica aqui e não no módulo compartilhado para o zod não viajar junto para o
 * navegador: o componente só precisa de rótulo e tipo de entrada.
 */
const ESQUEMAS: Record<CampoColaborador, z.ZodType> = {
  nome: z.string().trim().min(3, "Nome muito curto.").max(160),
  matricula: z.coerce
    .number({ message: "Matrícula precisa ser um número." })
    .int("Matrícula precisa ser um número inteiro.")
    .positive("Matrícula precisa ser positiva.")
    .max(2147483647),
  cpf: z
    .string()
    .transform(apenasDigitos)
    .refine((v) => v === "" || v.length === 11, "CPF precisa ter 11 dígitos.")
    .transform((v) => v || null),
  uen: opcional(120),
  data_admissao: dataOpcional,
  data_nascimento: dataOpcional,
  cargo: opcional(120),
  polo: opcional(120),
  local: opcional(160),
  situacao: z.enum([
    "trabalhando",
    "ferias",
    "auxilio_doenca",
    "atestado",
    "afastamento",
    "outro",
  ]),
  supervisor_id: z
    .string()
    .uuid("Supervisor inválido.")
    .or(z.literal(""))
    .transform((v) => v || null),
};

/**
 * Salva um campo do cadastro, sozinho.
 *
 * A lista fechada `CAMPOS_COLABORADOR` é a barreira: sem ela, o `campo` que
 * chega do formulário escreveria qualquer coluna da tabela — `ativo`,
 * `foto_url`, `id`. Cada campo declara também quem pode escrevê-lo, e é isso
 * que separa a identidade (só admin, porque trocar matrícula reaponta ASOs,
 * itens e histórico de uma pessoa para outra) da lotação (o QSMS mexe todo
 * dia).
 *
 * Salvar campo a campo custa uma coisa: não existe mais "cancelar tudo". Cada
 * confirmação já gravou. Para cadastro é o comportamento certo — corrigir o
 * cargo não tem por que depender de o supervisor estar certo na mesma tela.
 */
export async function salvarCampo(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  const bruto = String(formData.get("campo") ?? "");
  if (!Object.hasOwn(CAMPOS_COLABORADOR, bruto)) {
    return { ok: false, erro: "Campo inválido." };
  }
  const campo = bruto as CampoColaborador;
  const definicao = CAMPOS_COLABORADOR[campo];

  if (definicao.papel === "admin") await exigirAdmin();
  else await exigirQsms();

  const id = z.string().uuid().safeParse(formData.get("colaborador_id"));
  if (!id.success) return { ok: false, erro: "Colaborador inválido." };

  const analise = ESQUEMAS[campo].safeParse(formData.get("valor") ?? "");
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Valor inválido." };
  }
  const valor = analise.data as string | number | null;
  const origem = String(formData.get("origem") ?? "Cadastro do colaborador");

  const supabase = await criarClienteServidor();

  // Lê antes de escrever: depois do UPDATE o valor anterior não existe mais em
  // lugar nenhum, e é metade do que a trilha precisa registrar.
  // A seleção é montada em tempo de execução, então o parser de tipos do
  // supabase-js não consegue inferir a forma da linha — daí o cast.
  const selecao = campo === "supervisor_id" ? "supervisor_id, supervisores(nome)" : campo;
  const { data } = await supabase
    .from("colaboradores")
    .select(selecao)
    .eq("id", id.data)
    .maybeSingle();
  const antes = (data ?? null) as Record<string, unknown> | null;

  const { error } = await supabase
    .from("colaboradores")
    .update({ [campo]: valor })
    .eq("id", id.data);

  if (error) {
    // `matricula` é única na base, e a mensagem crua do Postgres cita o nome do
    // índice em vez de dizer de quem é a matrícula ocupada.
    if (error.code === "23505") {
      return { ok: false, erro: `A matrícula ${valor} já pertence a outro colaborador.` };
    }
    return { ok: false, erro: error.message };
  }

  const { de, para } = await textoDaMudanca(supabase, campo, antes, valor);
  await registrarCampos(supabase, id.data, [{ campo: definicao.auditoria, de, para }], origem);

  revalidatePath(`/qsms/colaborador/${id.data}`, "layout");
  revalidatePath("/qsms");
  revalidatePath("/qsms/base");
  return { ok: true, mensagem: `${definicao.rotulo} atualizado.` };
}

/**
 * O par antes/depois como uma pessoa lê.
 *
 * "Carlos → Maria" é legível; "uuid → uuid" não é, e "ferias → trabalhando"
 * está a meio caminho. As datas ficam em ISO de propósito: quem formata é a
 * linha do tempo, que já trata o formato.
 */
async function textoDaMudanca(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  campo: CampoColaborador,
  antes: Record<string, unknown> | null,
  valor: string | number | null
): Promise<{ de: string | null; para: string | null }> {
  if (campo === "supervisor_id") {
    const anterior = (antes?.supervisores as { nome: string } | null | undefined)?.nome ?? null;
    return { de: anterior, para: valor ? await nomeDoSupervisor(supabase, String(valor)) : null };
  }

  if (campo === "situacao") {
    const anterior = (antes?.situacao as string | null) ?? null;
    return {
      de: anterior ? SITUACAO_ROTULO[anterior as Situacao] ?? anterior : null,
      para: SITUACAO_ROTULO[valor as Situacao] ?? String(valor),
    };
  }

  const anterior = antes?.[campo] ?? null;
  return {
    de: anterior === null ? null : String(anterior),
    para: valor === null ? null : String(valor),
  };
}

// ---------------------------------------------------------------------------

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
