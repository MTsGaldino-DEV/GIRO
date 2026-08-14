import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_ASOS = "asos";

const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

/**
 * Envia o documento do ASO para o bucket privado.
 *
 * Devolve o caminho, não uma URL: o bucket é privado e o link tem que ser
 * assinado no momento da leitura. Guardar URL assinada no banco criaria
 * registros que expiram sozinhos.
 */
export async function enviarDocumentoAso(
  supabase: SupabaseClient,
  colaboradorId: string,
  arquivo: File
): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  if (arquivo.size === 0) return { ok: false, erro: "O arquivo está vazio." };
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "O arquivo passa de 8 MB. Reduza a resolução da digitalização." };
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return { ok: false, erro: "Formato não aceito. Envie PDF, JPG ou PNG." };
  }

  const extensao = arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const caminho = `${colaboradorId}/${Date.now()}.${extensao}`;

  const { error } = await supabase.storage
    .from(BUCKET_ASOS)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });

  if (error) return { ok: false, erro: `Falha ao enviar o arquivo: ${error.message}` };

  return { ok: true, caminho };
}

/** URL temporária para abrir o documento. Uma hora é suficiente para conferir e fechar. */
export async function urlAssinada(
  supabase: SupabaseClient,
  caminho: string,
  segundos = 3600
): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_ASOS).createSignedUrl(caminho, segundos);
  return data?.signedUrl ?? null;
}
