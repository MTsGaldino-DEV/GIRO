import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova o token do Supabase a cada navegação.
 *
 * Sem isso a sessão do supervisor expira em uma hora e ele volta a receber
 * pedido de login no meio do expediente, no celular, em campo. A autorização
 * em si fica nas páginas e na RLS; aqui só se cuida do cookie.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getClaims e não getUser: o projeto assina os tokens com chave assimétrica
  // (ES256), então a assinatura é conferida aqui com a chave pública em cache,
  // sem ida ao servidor de autenticação a cada clique. Token vencido continua
  // sendo renovado — getClaims passa pela sessão, que faz o refresh e grava o
  // cookie novo em setAll.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto estáticos e as rotas de cron — que se autenticam por
     * CRON_SECRET, não por cookie de sessão.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
