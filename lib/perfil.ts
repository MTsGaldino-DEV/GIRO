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
 * por `exigirPerfil`, a página por `exigirOperador` — e sem dedupe cada navegação
 * pagava `getUser()` + consulta a `perfis` duas vezes, em série. São ~170 ms
 * por clique que não compravam nada: dentro de um mesmo request a resposta é
 * necessariamente idêntica. O `cache` é por request, então continua revalidando
 * a sessão a cada navegação — não é sessão guardada entre requests.
 */
export const obterPerfil = cache(async function obterPerfil(): Promise<Perfil | null> {
  const supabase = await criarClienteServidor();

  // Assinatura do token conferida localmente (chave ES256 em cache), sem ida
  // ao servidor de autenticação — era a segunda das duas por clique, depois da
  // do middleware. O que barra acesso revogado continua sendo a consulta
  // abaixo: perfil desativado sai na hora, não quando o token vencer.
  const { data: sessao } = await supabase.auth.getClaims();
  const usuarioId = sessao?.claims.sub;
  if (!usuarioId) return null;

  const { data } = await supabase
    .from("perfis")
    .select("id, email, nome, papel, supervisor_id, ativo")
    .eq("id", usuarioId)
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
 * Exige qualquer perfil ativo (admin, qsms ou supervisor). Sem redirecionamento
 * por papel: os três operam a UEN inteira (spec 4, 10/11). O que continua só do
 * admin é a gestão de usuários, que usa `exigirAdmin`.
 */
export async function exigirOperador(): Promise<Perfil> {
  return exigirPerfil();
}

/**
 * Confere o perfil e busca os dados da página ao mesmo tempo.
 *
 * Em série, cada aba do colaborador pagava a consulta a `perfis` antes de
 * começar a própria: uma ida ao banco a mais por clique. A busca antecipada
 * não expõe nada — ela roda com a sessão do usuário, sob RLS, e o resultado
 * só é usado depois que o perfil passou. Se o perfil não passar, o
 * redirecionamento para o login vence (não um 404 da consulta) e a falha da
 * busca é descartada.
 */
export async function comOperador<T>(carregar: () => Promise<T>): Promise<[Perfil, T]> {
  const perfil = exigirOperador();
  const dados = carregar();
  dados.catch(() => {});
  return [await perfil, await dados];
}

/** Exige perfil admin. Só admin gerencia usuários (/admin/usuarios). */
export async function exigirAdmin(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (perfil.papel !== "admin") redirect(rotaInicial(perfil));
  return perfil;
}

export function rotaInicial(perfil: Pick<Perfil, "papel">): string {
  // Supervisor cai direto no Radar (a fila dele); QSMS e admin entram no
  // Dashboard: primeiro o que pede ação, depois a fila inteira no Radar.
  return perfil.papel === "supervisor" ? "/radar" : "/dashboard";
}
