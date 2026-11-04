import type { Metadata } from "next";
import Link from "next/link";
import { CascaLogin } from "@/components/casca-login";
import { FormularioRecuperar } from "./formulario";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function PaginaRecuperar() {
  return (
    <CascaLogin>
      <p className="login-chamada">Acesso · GIRO</p>
      <h1 className="text-[1.75rem] mb-1">Esqueci minha senha</h1>
      <p className="text-ink-muted text-label mb-6">
        Enviamos um link para o seu e-mail, se ele tiver acesso liberado.
      </p>

      <FormularioRecuperar />

      <p className="text-label text-center mt-4">
        <Link href="/login">Voltar para o login</Link>
      </p>
    </CascaLogin>
  );
}
