import { redirect } from "next/navigation";
import { criarClienteServidor } from "./supabase/server";
import type { Perfil } from "./tipos";

/**
 * Perfil do usuário logado, ou null.
 *
 * Estar autenticado no Supabase não basta: o acesso depende de uma linha ativa
 * em `perfis`. Quem entra por magic link sem perfil cadastrado não vê nada —
 * é o que impede que qualquer e-mail que conheça a URL entre no painel.
 */
export async function obterPerfil(): Promise<Perfil | null> {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("perfis")
    .select("id, email, nome, papel, supervisor_id, ativo")
    .eq("id", user.id)
    .eq("ativo", true)
    .maybeSingle();

  return (data as Perfil) ?? null;
}

/** Exige sessão com perfil ativo. Redireciona para o login se não houver. */
export async function exigirPerfil(): Promise<Perfil> {
  const perfil = await obterPerfil();
  if (!perfil) redirect("/login");
  return perfil;
}

/** Exige perfil QSMS. Supervisor cai no painel dele em vez de ver um 403. */
export async function exigirQsms(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (perfil.papel !== "qsms") redirect("/supervisor");
  return perfil;
}

export async function exigirSupervisor(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (perfil.papel !== "supervisor") redirect("/qsms");
  return perfil;
}

export function rotaInicial(perfil: Perfil): string {
  return perfil.papel === "qsms" ? "/qsms" : "/supervisor";
}
