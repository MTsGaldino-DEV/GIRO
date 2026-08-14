"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { exigirQsms } from "@/lib/perfil";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquemaSupervisor = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
});

/**
 * Cadastra o supervisor e já libera o acesso dele.
 *
 * Duas coisas ao mesmo tempo de propósito: um supervisor sem usuário no
 * Supabase não recebe magic link, e um usuário sem linha em `perfis` entra e
 * não vê nada. Separar isso em dois passos garante que um deles seja esquecido.
 */
export async function cadastrarSupervisor(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaSupervisor.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { nome, email } = analise.data;
  const supabase = await criarClienteServidor();

  const { data: supervisor, error: erroSupervisor } = await supabase
    .from("supervisores")
    .upsert({ nome, email, ativo: true }, { onConflict: "email" })
    .select("id")
    .single();

  if (erroSupervisor || !supervisor) {
    return { ok: false, erro: erroSupervisor?.message ?? "Falha ao salvar o supervisor." };
  }

  // Criar o usuário exige service_role — a API de admin do Supabase não é
  // acessível com a chave anon.
  const admin = criarClienteAdmin();

  const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let usuarioId = usuarios?.users.find((u) => u.email?.toLowerCase() === email)?.id;

  if (!usuarioId) {
    const { data: novo, error: erroUsuario } = await admin.auth.admin.createUser({
      email,
      email_confirm: true, // entra por magic link; não há e-mail de confirmação a enviar
    });
    if (erroUsuario || !novo.user) {
      return {
        ok: false,
        erro: `Supervisor salvo, mas o acesso não foi criado: ${erroUsuario?.message ?? "erro desconhecido"}`,
      };
    }
    usuarioId = novo.user.id;
  }

  const { error: erroPerfil } = await admin.from("perfis").upsert(
    {
      id: usuarioId,
      email,
      nome,
      papel: "supervisor",
      supervisor_id: supervisor.id,
      ativo: true,
    },
    { onConflict: "id" }
  );

  if (erroPerfil) {
    return { ok: false, erro: `Supervisor salvo, mas o perfil falhou: ${erroPerfil.message}` };
  }

  revalidatePath("/qsms/supervisores");
  revalidatePath("/qsms");

  return { ok: true, mensagem: `${nome} cadastrado. Já pode entrar pelo link enviado ao e-mail.` };
}

// ---------------------------------------------------------------------------

const esquemaVinculo = z.object({
  colaborador_id: z.string().uuid(),
  supervisor_id: z.string().uuid().or(z.literal("")),
});

/** Vincula um colaborador a um supervisor. Resolve a P1, um a um. */
export async function vincularColaborador(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaVinculo.safeParse({
    colaborador_id: formData.get("colaborador_id"),
    supervisor_id: formData.get("supervisor_id") ?? "",
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("colaboradores")
    .update({ supervisor_id: analise.data.supervisor_id || null })
    .eq("id", analise.data.colaborador_id);

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/qsms/supervisores");
  revalidatePath("/qsms");
  return { ok: true, mensagem: "Vinculado." };
}

// ---------------------------------------------------------------------------

/** Vincula em massa por cargo, polo ou busca de nome. 261 um a um é inviável. */
const esquemaMassa = z.object({
  supervisor_id: z.string().uuid("Escolha o supervisor."),
  ids: z.string().min(1, "Selecione ao menos um colaborador."),
});

export async function vincularEmMassa(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirQsms();

  const analise = esquemaMassa.safeParse({
    supervisor_id: formData.get("supervisor_id"),
    ids: (formData.getAll("ids") as string[]).join(","),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const ids = analise.data.ids.split(",").filter(Boolean);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("colaboradores")
    .update({ supervisor_id: analise.data.supervisor_id })
    .in("id", ids);

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/qsms/supervisores");
  revalidatePath("/qsms");
  return { ok: true, mensagem: `${ids.length} colaborador(es) vinculado(s).` };
}
