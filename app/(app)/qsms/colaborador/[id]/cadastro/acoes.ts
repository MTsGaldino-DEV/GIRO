"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirQsms } from "@/lib/perfil";
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

  const supabase = await criarClienteServidor();
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

  revalidatePath(`/qsms/colaborador/${id}`, "layout");
  revalidatePath("/qsms");
  return { ok: true, mensagem: "Cadastro atualizado." };
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

  revalidatePath(`/qsms/colaborador/${id.data}`, "layout");
  revalidatePath("/qsms");
  return { ok: true, mensagem: "Foto atualizada." };
}
