import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { MarcaVertical } from "@/components/marca-vertical";
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
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-[400px]">
        <MarcaVertical />

        <div className="card">
          <h1 className="text-[1.375rem] mb-1">Definir nova senha</h1>
          <p className="text-ink-muted text-label mb-5">Mínimo de 8 caracteres.</p>

          <FormularioRedefinir />
        </div>
      </div>
    </main>
  );
}
