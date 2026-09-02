import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterPerfil, rotaInicial } from "@/lib/perfil";
import { MarcaVertical } from "@/components/marca-vertical";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await obterPerfil();
  if (perfil) redirect(rotaInicial(perfil));

  const { proximo, erro, sucesso } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-[400px]">
        <MarcaVertical />

        <div className="card">
          <h1 className="text-[1.375rem] mb-1">Entrar</h1>
          <p className="text-ink-muted text-label mb-5">
            Informe seu e-mail e sua senha para abrir o painel.
          </p>

          <FormularioLogin proximo={proximo} erroInicial={erro} sucessoInicial={sucesso} />
        </div>

        <p className="text-ink-faint text-caption mt-4 leading-relaxed">
          O acesso é liberado pelo QSMS. Se você ainda não tem senha, confirme
          com a equipe de QSMS se o seu e-mail está cadastrado.
        </p>
      </div>
    </main>
  );
}
