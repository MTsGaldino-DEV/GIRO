import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Destino do link de "esqueci minha senha".
 *
 * Troca o código pela sessão de recuperação aqui (Route Handler, não Server
 * Component) porque só um Route Handler ou Server Action consegue gravar o
 * cookie de sessão. A tela de definir a senha nova fica em /login/redefinir,
 * já com essa sessão pronta.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login/recuperar?erro=link_invalido`);
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login/recuperar?erro=link_invalido`);
  }

  return NextResponse.redirect(`${origin}/login/redefinir`);
}
