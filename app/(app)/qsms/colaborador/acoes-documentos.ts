"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirQsms } from "@/lib/perfil";
import { BUCKET_DOCUMENTOS } from "@/lib/storage";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

const esquema = z.object({
  colaborador_id: z.string().uuid(),
  tipo: z.string().trim().min(1, "Escolha o tipo do documento.").max(120),
  data_documento: z.string().trim().optional(),
  data_validade: z.string().trim().optional(),
  descricao: z.string().trim().max(500).optional(),
});

/** Data em branco vira null; o campo é opcional e "" não é data. */
function dataOuNulo(valor: string | undefined): string | null {
  return valor && valor.length > 0 ? valor : null;
}

/**
 * Anexa um documento ao colaborador.
 *
 * Grava o arquivo no bucket privado `documentos` e os metadados na tabela.
 * O caminho é `{colaborador_id}/{timestamp}.{ext}` — o prefixo por colaborador
 * mantém o bucket navegável e o timestamp evita colisão sem precisar consultar
 * o que já existe lá.
 *
 * Se o INSERT falhar depois do upload, o arquivo é removido: um objeto no
 * Storage sem linha correspondente é invisível para a interface e nunca mais
 * seria encontrado por ninguém.
 */
export async function anexarDocumento(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquema.safeParse({
    colaborador_id: formData.get("colaborador_id"),
    tipo: formData.get("tipo"),
    data_documento: formData.get("data_documento") ?? undefined,
    data_validade: formData.get("data_validade") ?? undefined,
    descricao: formData.get("descricao") ?? undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { colaborador_id, tipo, data_documento, data_validade, descricao } = analise.data;

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha um arquivo." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "O arquivo passa de 8 MB. Reduza a resolução da digitalização." };
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return { ok: false, erro: "Formato não aceito. Envie PDF, JPG, PNG ou WebP." };
  }

  const inicio = dataOuNulo(data_documento);
  const validade = dataOuNulo(data_validade);
  if (inicio && validade && validade < inicio) {
    return { ok: false, erro: "A validade não pode ser anterior à data do documento." };
  }

  const supabase = await criarClienteServidor();

  const extensao =
    arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const caminho = `${colaborador_id}/${Date.now()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });

  if (erroUpload) return { ok: false, erro: `Falha ao enviar o arquivo: ${erroUpload.message}` };

  const { data: usuario } = await supabase.auth.getUser();

  const { data: inserido, error } = await supabase
    .from("documentos_colaborador")
    .insert({
      colaborador_id,
      nome_arquivo: arquivo.name,
      tipo,
      storage_path: caminho,
      tamanho_bytes: arquivo.size,
      mime_type: arquivo.type,
      data_documento: inicio,
      data_validade: validade,
      descricao: descricao || null,
      criado_por: usuario.user?.id ?? null,
      atualizado_por: usuario.user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    return { ok: false, erro: error.message };
  }

  // A auditoria é o que faz o anexo aparecer na aba Histórico. Falha aqui não
  // desfaz o anexo — o arquivo está salvo e válido; perder a linha de trilha é
  // um mal menor que apagar um documento que o usuário acabou de enviar.
  try {
    await supabase.rpc("fn_registrar_auditoria", {
      p_colaborador_id: colaborador_id,
      p_acao: "anexou",
      p_entidade: "documento",
      p_entidade_id: inserido?.id ?? null,
      p_campo: null,
      p_valor_anterior: null,
      p_valor_novo: arquivo.name,
      p_origem: "Perfil do Colaborador",
    });
  } catch {
    // Ver comentário acima.
  }

  revalidatePath(`/qsms/colaborador/${colaborador_id}`, "layout");
  return { ok: true, mensagem: "Documento anexado." };
}
