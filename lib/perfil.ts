import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "./supabase/server";
import type { Perfil } from "./tipos";

/**
 * Perfil do usuário logado, ou null.
 *
 * Estar autenticado no Supabase não basta: o acesso depende de uma linha ativa
 * em `perfis`. Quem autentica sem perfil cadastrado não vê nada —
 * é o que impede que qualquer e-mail que conheça a URL entre no painel.
 *
 * Embrulhado em `cache()` porque o layout e a página chamam os dois — o layout
 * por `exigirPerfil`, a página por `exigirQsms` — e sem dedupe cada navegação
 * pagava `getUser()` + consulta a `perfis` duas vezes, em série. São ~170 ms
 * por clique que não compravam nada: dentro de um mesmo request a resposta é
 * necessariamente idêntica. O `cache` é por request, então continua revalidando
 * a sessão a cada navegação — não é sessão guardada entre requests.
 */
export const obterPerfil = cache(async function obterPerfil(): Promise<Perfil | null> {
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
});

/** Exige sessão com perfil ativo. Redireciona para o login se não houver. */
export async function exigirPerfil(): Promise<Perfil> {
  const perfil = await obterPerfil();
  if (!perfil) redirect("/login");
  return perfil;
}

/**
 * Exige a aba QSMS. Supervisor cai no painel dele em vez de ver um 403.
 *
 * Admin passa: o plano da Fase 1 (seção 4) dá a ele as duas abas, e
 * `fn_e_qsms()` no banco já trata os dois papéis igual. Barrar aqui deixava o
 * admin sem nenhuma tela — era redirecionado para /supervisor, que por sua vez
 * o mandava de volta.
 */
export async function exigirQsms(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (perfil.papel === "supervisor") redirect("/supervisor");
  return perfil;
}

/**
 * Exige a aba Supervisão.
 *
 * Admin entra — e enxerga uma tela vazia, porque não tem `supervisor_id` e a
 * RLS filtra por equipe. É exatamente o scaffolding que o plano pede (seção
 * 10): a aba existe, é visível só para admin, e não tem dado nenhum na Fase 1.
 */
export async function exigirSupervisor(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (perfil.papel === "qsms") redirect("/qsms");
  return perfil;
}

/** Exige perfil admin. Só admin gerencia usuários. */
export async function exigirAdmin(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (perfil.papel !== "admin") redirect(rotaInicial(perfil));
  return perfil;
}

export function rotaInicial(perfil: Perfil): string {
  return perfil.papel === "supervisor" ? "/supervisor" : "/qsms";
}
