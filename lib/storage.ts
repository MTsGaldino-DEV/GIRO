import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_ASOS = "asos";

/**
 * Bucket das fotos de colaborador.
 *
 * Mora aqui, junto de BUCKET_ASOS, e não em lib/colaborador.ts: aquele módulo
 * importa `next/headers` para montar o cliente de servidor, então importá-lo
 * de um componente de navegador quebra o build inteiro.
 */
export const BUCKET_FOTOS = "fotos";

/**
 * Bucket dos anexos do colaborador (avaliação psicológica, certificados, RG).
 *
 * Separado de `asos` porque as políticas diferem: `asos` é só QSMS na leitura;
 * aqui o supervisor precisa enxergar o documento da própria equipe.
 */
export const BUCKET_DOCUMENTOS = "documentos";

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

/**
 * A mesma URL assinada, mas o navegador baixa em vez de abrir.
 *
 * O Storage do Supabase lê o parâmetro `download` e responde com
 * `Content-Disposition: attachment` — é o que `createSignedUrl(..., { download })`
 * faz por dentro. Montar aqui evita uma segunda assinatura por documento.
 */
export function urlParaBaixar(urlAssinada: string, nomeArquivo: string): string {
  const url = new URL(urlAssinada);
  url.searchParams.set("download", nomeArquivo);
  return url.toString();
}

/** "ASO Periódico", "2026-07-30", "x/y.pdf" → "ASO Periodico 30-07-2026.pdf". */
export function nomeArquivoExame(requisito: string, dataDocumento: string, caminho: string): string {
  const extensao = caminho.split(".").pop()?.toLowerCase() || "pdf";
  const rotulo = requisito
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, "")
    .trim();
  return `${rotulo} ${dataDocumento.split("-").reverse().join("-")}.${extensao}`;
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
