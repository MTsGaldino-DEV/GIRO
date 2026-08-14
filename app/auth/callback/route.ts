import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Destino do magic link.
 *
 * O parâmetro `proximo` permite que o e-mail semanal aponte direto para o item:
 * o supervisor toca no link da linha "Fulano — vence em 12 dias" e cai na tela
 * daquele item já autenticado. É o que sustenta o critério de aceite dos
 * 30 segundos.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const proximo = searchParams.get("proximo");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
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
    // Autenticou no Supabase mas não tem perfil: encerrar a sessão em vez de
    // deixar um usuário logado que não enxerga nada.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?erro=sem_perfil`);
  }

  // `proximo` vem da query string, portanto do usuário. Aceitar só caminho
  // relativo evita virar redirect aberto para fora do domínio.
  const seguro = proximo && proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : null;
  const destino = seguro ?? (perfil.papel === "qsms" ? "/qsms" : "/supervisor");

  return NextResponse.redirect(`${origin}${destino}`);
}
