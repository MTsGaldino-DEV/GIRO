import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterPerfil, rotaInicial } from "@/lib/perfil";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>;
}) {
  const perfil = await obterPerfil();
  if (perfil) redirect(rotaInicial(perfil));

  const { proximo, erro } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-[400px]">
        <img
          src="/logo-giro.svg"
          alt="GIRO — Gestão integrada de requisitos ocupacionais"
          width={280}
          height={80}
          className="mb-8 h-auto w-[240px]"
        />

        <div className="card">
          <h1 className="text-[1.375rem] mb-1">Entrar</h1>
          <p className="text-ink-muted text-label mb-5">
            Informe seu e-mail. Você recebe um link que já abre o painel — não
            existe senha.
          </p>

          <FormularioLogin proximo={proximo} erroInicial={erro} />
        </div>

        <p className="text-ink-faint text-caption mt-4 leading-relaxed">
          O acesso é liberado pelo QSMS. Se o link não chegar, confirme com a
          equipe de QSMS se o seu e-mail está cadastrado.
        </p>
      </div>
    </main>
  );
}
