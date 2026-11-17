"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { exigirOperador } from "@/lib/perfil";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquemaSupervisor = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
});

/**
 * Cadastra o supervisor na equipe.
 *
 * Só o registro em `supervisores` — não cria login. O acesso ao painel (com
 * senha) é liberado à parte em "Gestão de usuários", só visível para admin,
 * escolhendo este supervisor no vínculo.
 */
export async function cadastrarSupervisor(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirOperador();

  const analise = esquemaSupervisor.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { nome, email } = analise.data;
  const supabase = await criarClienteServidor();

  const { error: erroSupervisor } = await supabase
    .from("supervisores")
    .upsert({ nome, email, ativo: true }, { onConflict: "email" });

  if (erroSupervisor) {
    return { ok: false, erro: erroSupervisor.message };
  }

  revalidatePath("/qsms/supervisores");
  revalidatePath("/radar");

  return {
    ok: true,
    mensagem: `${nome} cadastrado. Libere o login em Gestão de usuários, se ele precisar entrar no painel.`,
  };
}

// ---------------------------------------------------------------------------

/**
 * Exclui um supervisor (só QSMS e admin).
 *
 * A equipe dele volta para "Sem supervisor"; os apelidos da NEO e os registros de
 * e-mail enviados saem em cascata. Se houver login de supervisor ligado a ele, a
 * exclusão é recusada: o acesso sai primeiro em Gestão de usuários (o perfil de
 * supervisor exige vínculo).
 */
export async function excluirSupervisor(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  const perfil = await exigirOperador();
  if (perfil.papel !== "qsms" && perfil.papel !== "admin") {
    return { ok: false, erro: "Apenas QSMS ou administrador pode excluir supervisores." };
  }

  const analise = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!analise.success) return { ok: false, erro: "Dados inválidos." };
  const { id } = analise.data;

  const admin = criarClienteAdmin();
  const { data: logins, error: erroLogins } = await admin.from("perfis").select("nome").eq("supervisor_id", id);
  if (erroLogins) return { ok: false, erro: "Não foi possível excluir agora." };
  if ((logins ?? []).length > 0) {
    const nomes = logins!.map((l) => l.nome ?? "sem nome").join(", ");
    return {
      ok: false,
      erro: `Há acesso de login ligado a este supervisor (${nomes}). Exclua esse acesso em Gestão de usuários e tente de novo.`,
    };
  }

  const { error: erroEquipe } = await admin.from("colaboradores").update({ supervisor_id: null }).eq("supervisor_id", id);
  if (erroEquipe) return { ok: false, erro: "Não foi possível liberar a equipe deste supervisor." };

  const { error } = await admin.from("supervisores").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir o supervisor." };

  revalidatePath("/qsms/supervisores");
  revalidatePath("/radar");
  revalidatePath("/admin/usuarios");
  return { ok: true, mensagem: "Supervisor excluído; a equipe dele ficou sem supervisor." };
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
  await exigirOperador();

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
  revalidatePath("/radar");
  revalidatePath("/admin/tratamento");
  return { ok: true, mensagem: "Vinculado." };
}

// ---------------------------------------------------------------------------

/** Vincula em massa por cargo ou busca de nome. 261 um a um é inviável. */
const esquemaMassa = z.object({
  supervisor_id: z.string().uuid("Escolha o supervisor."),
  ids: z.string().min(1, "Selecione ao menos um colaborador."),
});

export async function vincularEmMassa(
  _anterior: Acao | null,
  formData: FormData
): Promise<Acao> {
  await exigirOperador();

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
  revalidatePath("/radar");
  return { ok: true, mensagem: `${ids.length} colaborador(es) vinculado(s).` };
}
