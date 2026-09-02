"use server";

import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirPerfil } from "@/lib/perfil";

export type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

const esquema = z.object({
  senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

/** Troca a própria senha, já autenticado — sem passar pelo fluxo de recuperação. */
export async function trocarSenha(_anterior: Acao | null, formData: FormData): Promise<Acao> {
  await exigirPerfil();

  const analise = esquema.safeParse({ senha: formData.get("senha") });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Senha inválida." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: analise.data.senha });
  if (error) return { ok: false, erro: "Não foi possível trocar a senha." };

  return { ok: true, mensagem: "Senha atualizada." };
}
