import { Suspense } from "react";
import { cookies } from "next/headers";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTratamento } from "@/lib/consulta-tratamento";
import { COOKIE_SIDEBAR, estaRecolhida } from "@/lib/sidebar";
import { Sidebar } from "@/components/sidebar";
import { ProvedorPerfilColaborador } from "@/components/perfil/contexto";
import { PainelPerfilColaborador } from "@/components/perfil/painel-perfil";
import { BarraNavegacao } from "@/components/barra-navegacao";

/** O contador do menu é enfeite útil, não pode derrubar o app: se a consulta falhar, some. */
async function contarTratamento(): Promise<number | undefined> {
  try {
    const supabase = await criarClienteServidor();
    return (await carregarTratamento(supabase)).length;
  } catch {
    return undefined;
  }
}

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();

  const [armazenamento, pendenciasTratamento] = await Promise.all([
    cookies(),
    perfil.papel === "admin" ? contarTratamento() : undefined,
  ]);
  const recolhida = estaRecolhida(armazenamento.get(COOKIE_SIDEBAR)?.value);

  return (
    <ProvedorPerfilColaborador papel={perfil.papel}>
      {/* useSearchParams exige limite de Suspense para não derrubar a página
          inteira para renderização no cliente. */}
      <Suspense fallback={null}>
        <BarraNavegacao />
      </Suspense>
      <div className="app-grade">
        <Sidebar perfil={perfil} recolhidaInicial={recolhida} pendenciasTratamento={pendenciasTratamento} />
        <div className="app-conteudo">
          <main className="conteudo-pagina flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 py-6">{children}</main>
        </div>
      </div>

      <PainelPerfilColaborador />
    </ProvedorPerfilColaborador>
  );
}
