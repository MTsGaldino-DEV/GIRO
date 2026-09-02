import type { Metadata } from "next";
import Link from "next/link";
import { MarcaVertical } from "@/components/marca-vertical";
import { FormularioRecuperar } from "./formulario";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function PaginaRecuperar() {
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-[400px]">
        <MarcaVertical />

        <div className="card">
          <h1 className="text-[1.375rem] mb-1">Esqueci minha senha</h1>
          <p className="text-ink-muted text-label mb-5">
            Informe seu e-mail. Se houver acesso liberado para ele, enviamos um
            link para definir uma senha nova.
          </p>

          <FormularioRecuperar />
        </div>

        <p className="text-label text-center mt-4">
          <Link href="/login">Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
