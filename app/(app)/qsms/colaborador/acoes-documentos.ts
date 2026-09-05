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

// ---------------------------------------------------------------------------
// Edição de metadados (seção 19 do plano)
// ---------------------------------------------------------------------------

const esquemaEdicao = z.object({
  id: z.string().uuid(),
  colaborador_id: z.string().uuid(),
  tipo: z.string().trim().min(1, "Escolha o tipo do documento.").max(120),
  data_documento: z.string().trim().optional(),
  data_validade: z.string().trim().optional(),
  descricao: z.string().trim().max(500).optional(),
});

/** Rótulo do campo na trilha. "data_validade → validade" se lê; o nome da coluna não. */
const CAMPO_AUDITAVEL: Record<string, string> = {
  tipo: "tipo",
  data_documento: "data do documento",
  data_validade: "validade",
  descricao: "descrição",
};

/**
 * Edita os metadados de um documento já anexado.
 *
 * O arquivo em si não é trocado — para isso, anexa-se outro. Trocar o binário
 * mantendo a mesma linha exigiria versionamento, que está fora desta entrega
 * (seção 37).
 *
 * Uma linha de auditoria por campo alterado, igual ao cadastro: "alterou a
 * validade de 03/2027 para 06/2027" responde alguma coisa; "documento
 * atualizado" não responde nada.
 */
export async function editarDocumento(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaEdicao.safeParse({
    id: formData.get("id"),
    colaborador_id: formData.get("colaborador_id"),
    tipo: formData.get("tipo"),
    data_documento: formData.get("data_documento") ?? undefined,
    data_validade: formData.get("data_validade") ?? undefined,
    descricao: formData.get("descricao") ?? undefined,
  });

  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { id, colaborador_id, tipo, data_documento, data_validade, descricao } = analise.data;

  const inicio = dataOuNulo(data_documento);
  const validade = dataOuNulo(data_validade);
  if (inicio && validade && validade < inicio) {
    return { ok: false, erro: "A validade não pode ser anterior à data do documento." };
  }

  const supabase = await criarClienteServidor();

  // Lê antes de escrever: depois do UPDATE o valor anterior não existe mais.
  const { data: antes } = await supabase
    .from("documentos_colaborador")
    .select("nome_arquivo, tipo, data_documento, data_validade, descricao")
    .eq("id", id)
    .maybeSingle();

  if (!antes) return { ok: false, erro: "Documento não encontrado." };

  const { data: usuario } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("documentos_colaborador")
    .update({
      tipo,
      data_documento: inicio,
      data_validade: validade,
      descricao: descricao || null,
      atualizado_por: usuario.user?.id ?? null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, erro: error.message };

  const comparacoes: { campo: string; de: string | null; para: string | null }[] = [
    { campo: "tipo", de: antes.tipo as string, para: tipo },
    { campo: "data_documento", de: (antes.data_documento as string) ?? null, para: inicio },
    { campo: "data_validade", de: (antes.data_validade as string) ?? null, para: validade },
    { campo: "descricao", de: (antes.descricao as string) ?? null, para: descricao || null },
  ];

  for (const { campo, de, para } of comparacoes) {
    if (de === para) continue;
    try {
      await supabase.rpc("fn_registrar_auditoria", {
        p_colaborador_id: colaborador_id,
        p_acao: "alterou",
        p_entidade: "documento",
        p_entidade_id: id,
        // O nome do arquivo entra no campo para a trilha dizer de QUAL documento
        // se trata — sem isso, "alterou validade" não identifica nada.
        p_campo: `${CAMPO_AUDITAVEL[campo] ?? campo} de "${antes.nome_arquivo}"`,
        p_valor_anterior: de,
        p_valor_novo: para,
        p_origem: "Perfil do Colaborador",
      });
    } catch {
      // Mesma escolha do cadastro: trilha perdida não desfaz escrita válida.
    }
  }

  revalidatePath(`/qsms/colaborador/${colaborador_id}`, "layout");
  return { ok: true, mensagem: "Documento atualizado." };
}

// ---------------------------------------------------------------------------
// Exclusão (seção 20 do plano)
// ---------------------------------------------------------------------------

/**
 * Remove o documento e o arquivo do bucket.
 *
 * Exclusão física, não soft delete: é o padrão que o projeto já usa
 * (`removerAusencia` em qsms/ausencias/acoes.ts), e a seção 20 pede para seguir
 * o padrão existente em vez de inventar outro. O rastro fica na auditoria — a
 * linha registra nome, tipo, quem removeu e quando, então a exclusão não é
 * silenciosa mesmo sem a linha original sobreviver.
 *
 * A auditoria é gravada ANTES do delete: `documentos_colaborador` tem
 * `on delete cascade` a partir de colaboradores, e a ordem inversa deixaria uma
 * janela em que o arquivo já sumiu e a trilha ainda não existe.
 */
export async function excluirDocumento(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirQsms();

  const analise = z
    .object({ id: z.string().uuid(), colaborador_id: z.string().uuid() })
    .safeParse({
      id: formData.get("id"),
      colaborador_id: formData.get("colaborador_id"),
    });

  if (!analise.success) return { ok: false, erro: "Documento inválido." };
  const { id, colaborador_id } = analise.data;

  const supabase = await criarClienteServidor();

  const { data: documento } = await supabase
    .from("documentos_colaborador")
    .select("nome_arquivo, tipo, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!documento) return { ok: false, erro: "Documento não encontrado." };

  try {
    await supabase.rpc("fn_registrar_auditoria", {
      p_colaborador_id: colaborador_id,
      p_acao: "removeu",
      p_entidade: "documento",
      p_entidade_id: id,
      p_campo: documento.tipo as string,
      p_valor_anterior: documento.nome_arquivo as string,
      p_valor_novo: null,
      p_origem: "Perfil do Colaborador",
    });
  } catch {
    // Ver o comentário acima sobre a ordem.
  }

  const { error } = await supabase.from("documentos_colaborador").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };

  // O arquivo sai depois da linha: um objeto órfão no bucket é invisível e
  // inofensivo; uma linha apontando para arquivo inexistente quebra o download.
  await supabase.storage.from(BUCKET_DOCUMENTOS).remove([documento.storage_path as string]);

  revalidatePath(`/qsms/colaborador/${colaborador_id}`, "layout");
  return { ok: true, mensagem: "Documento removido." };
}
