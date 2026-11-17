import { Suspense } from "react";
import { exigirPerfil } from "@/lib/perfil";
import { Sidebar } from "@/components/sidebar";
import { ProvedorPerfilColaborador } from "@/components/perfil/contexto";
import { PainelPerfilColaborador } from "@/components/perfil/painel-perfil";
import { BarraNavegacao } from "@/components/barra-navegacao";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();

  return (
    <ProvedorPerfilColaborador papel={perfil.papel}>
      {/* useSearchParams exige limite de Suspense para não derrubar a página
          inteira para renderização no cliente. */}
      <Suspense fallback={null}>
        <BarraNavegacao />
      </Suspense>
      <div className="app-grade">
        <Sidebar perfil={perfil} />
        <div className="app-conteudo">
          <main className="conteudo-pagina flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 py-6">{children}</main>
        </div>
      </div>

      <PainelPerfilColaborador />
    </ProvedorPerfilColaborador>
  );
}
