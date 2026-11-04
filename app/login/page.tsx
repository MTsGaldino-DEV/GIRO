import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterPerfil, rotaInicial } from "@/lib/perfil";
import { CascaLogin } from "@/components/casca-login";
import { Info } from "@/components/info";
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
    <CascaLogin>
      <p className="login-chamada">Acesso · GIRO</p>
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-[1.75rem]">Entrar</h1>
        <Info lado="cima">
          O acesso é liberado pelo QSMS. Se você ainda não tem senha, confirme
          com a equipe de QSMS se o seu e-mail está cadastrado.
        </Info>
      </div>

      <FormularioLogin proximo={proximo} erroInicial={erro} sucessoInicial={sucesso} />
    </CascaLogin>
  );
}
