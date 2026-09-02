"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { exigirAdmin } from "@/lib/perfil";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquemaUsuario = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome completo."),
    email: z.string().trim().toLowerCase().email("E-mail inválido."),
    senha: z.string().min(8, "A senha temporária precisa ter ao menos 8 caracteres."),
    papel: z.enum(["qsms", "supervisor", "admin"]),
    supervisor_id: z.string().uuid().or(z.literal("")),
  })
  .refine((v) => v.papel !== "supervisor" || v.supervisor_id !== "", {
    message: "Escolha o supervisor vinculado a este acesso.",
    path: ["supervisor_id"],
  });

/**
 * Cria usuário com senha temporária.
 *
 * Não há autocadastro: só um admin cria acesso, sempre com senha definida
 * aqui — quem recebe troca depois em "Trocar senha".
 */
export async function criarUsuario(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirAdmin();

  const analise = esquemaUsuario.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
    papel: formData.get("papel"),
    supervisor_id: formData.get("supervisor_id") ?? "",
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { nome, email, senha, papel, supervisor_id } = analise.data;
  const admin = criarClienteAdmin();

  const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (erroLista) return { ok: false, erro: erroLista.message };

  let usuarioId = lista.users.find((u) => u.email?.toLowerCase() === email)?.id;

  if (!usuarioId) {
    const { data: novo, error: erroNovo } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (erroNovo || !novo.user) {
      return { ok: false, erro: erroNovo?.message ?? "Falha ao criar o usuário." };
    }
    usuarioId = novo.user.id;
  } else {
    // E-mail já existe no Supabase Auth (ex.: reaproveitar acesso desativado): atualiza a senha.
    await admin.auth.admin.updateUserById(usuarioId, { password: senha });
  }

  const { error: erroPerfil } = await admin.from("perfis").upsert(
    {
      id: usuarioId,
      email,
      nome,
      papel,
      supervisor_id: papel === "supervisor" ? supervisor_id : null,
      ativo: true,
    },
    { onConflict: "id" }
  );

  if (erroPerfil) {
    return { ok: false, erro: `Usuário criado, mas o perfil falhou: ${erroPerfil.message}` };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true, mensagem: `${nome} cadastrado com senha temporária.` };
}

// ---------------------------------------------------------------------------

const esquemaAtivo = z.object({
  id: z.string().uuid(),
  ativo: z.enum(["true", "false"]),
});

export async function alternarAtivoUsuario(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirAdmin();

  const analise = esquemaAtivo.safeParse({
    id: formData.get("id"),
    ativo: formData.get("ativo"),
  });
  if (!analise.success) return { ok: false, erro: "Dados inválidos." };

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("perfis")
    .update({ ativo: analise.data.ativo === "true" })
    .eq("id", analise.data.id);

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/admin/usuarios");
  return { ok: true, mensagem: "Atualizado." };
}
