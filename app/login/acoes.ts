"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z.string().min(1, "Informe a senha."),
  proximo: z.string().optional(),
});

/**
 * Login por e-mail e senha.
 *
 * Mensagem de erro genérica de propósito: dizer "e-mail não cadastrado" versus
 * "senha errada" permite a quem tenta invadir descobrir quais e-mails existem
 * na base. As duas falhas devolvem o mesmo texto.
 */
export async function entrar(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  const analise = esquemaLogin.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
    proximo: formData.get("proximo") ?? undefined,
  });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { email, senha, proximo } = analise.data;
  const supabase = await criarClienteServidor();

  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroLogin) {
    return { ok: false, erro: "E-mail ou senha inválidos." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("perfis")
    .select("papel, ativo")
    .eq("id", user?.id ?? "")
    .eq("ativo", true)
    .maybeSingle();

  if (!perfil) {
    // Autenticou no Supabase mas não tem perfil ativo: encerrar a sessão em
    // vez de deixar um usuário logado que não enxerga nada.
    await supabase.auth.signOut();
    return { ok: false, erro: "Este e-mail não tem acesso liberado. Fale com o QSMS." };
  }

  // `proximo` vem do link do e-mail semanal, portanto do usuário. Aceitar só
  // caminho relativo evita virar redirect aberto para fora do domínio.
  const seguro = proximo && proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : null;
  redirect(seguro ?? (perfil.papel === "supervisor" ? "/supervisor" : "/qsms"));
}

// ---------------------------------------------------------------------------

const esquemaRecuperar = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
});

/**
 * Solicita o e-mail de redefinição.
 *
 * Sempre devolve a mesma mensagem de sucesso, exista ou não o e-mail na base
 * — o contrário confirmaria contas cadastradas para quem só tem o formulário.
 */
export async function solicitarRecuperacao(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  const analise = esquemaRecuperar.safeParse({ email: formData.get("email") });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await criarClienteServidor();
  await supabase.auth.resetPasswordForEmail(analise.data.email, {
    redirectTo: `${siteUrl}/auth/redefinir-senha`,
  });

  return {
    ok: true,
    mensagem: "Se este e-mail tiver acesso liberado, enviamos um link de redefinição.",
  };
}

// ---------------------------------------------------------------------------

const esquemaNovaSenha = z.object({
  senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

/** Define a nova senha usando a sessão de recuperação aberta pelo link do e-mail. */
export async function redefinirSenha(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  const analise = esquemaNovaSenha.safeParse({ senha: formData.get("senha") });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Senha inválida." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: analise.data.senha });
  if (error) return { ok: false, erro: "Não foi possível redefinir a senha. Peça um novo link." };

  await supabase.auth.signOut();
  redirect("/login?sucesso=senha_redefinida");
}
