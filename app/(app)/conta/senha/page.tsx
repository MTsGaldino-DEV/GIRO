import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/perfil";
import { FormularioTrocarSenha } from "./formulario";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function PaginaTrocarSenha() {
  await exigirPerfil();

  return (
    <div className="card max-w-[420px]">
      <h1 className="mb-1">Trocar senha</h1>
      <p className="text-ink-muted text-label mb-5">Mínimo de 8 caracteres.</p>
      <FormularioTrocarSenha />
    </div>
  );
}
