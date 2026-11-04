import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CascaLogin } from "@/components/casca-login";
import { FormularioRedefinir } from "./formulario";

export const metadata: Metadata = { title: "Nova senha" };

export default async function PaginaRedefinir() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sem sessão de recuperação (link expirado, já usado, ou acesso direto):
  // não há como definir senha nova.
  if (!user) redirect("/login/recuperar?erro=link_invalido");

  return (
    <CascaLogin>
      <p className="login-chamada">Acesso · GIRO</p>
      <h1 className="text-[1.75rem] mb-1">Definir nova senha</h1>
      <p className="text-ink-muted text-label mb-6">Mínimo de 8 caracteres.</p>

      <FormularioRedefinir />
    </CascaLogin>
  );
}
