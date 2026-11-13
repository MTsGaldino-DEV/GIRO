import { Suspense } from "react";
import { exigirPerfil } from "@/lib/perfil";
import { obterResumoStatus } from "@/lib/colaborador";
import { Sidebar } from "@/components/sidebar";
import { BannerBase } from "@/components/banner-base";
import { ProvedorPerfilColaborador } from "@/components/perfil/contexto";
import { PainelPerfilColaborador } from "@/components/perfil/painel-perfil";
import { BarraNavegacao } from "@/components/barra-navegacao";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  // A view respeita RLS: o supervisor vê o buraco da equipe dele, o QSMS vê o
  // dos 261. Cada um é cobrado pelo que consegue resolver.
  //
  // Em paralelo com o perfil de propósito: o resumo não depende dele — quem
  // filtra por equipe é a RLS, a partir da mesma sessão. Se `exigirPerfil`
  // redirecionar, o redirect propaga normalmente pelo Promise.all.
  const [perfil, resumo] = await Promise.all([exigirPerfil(), obterResumoStatus()]);

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
          {resumo && (
            <BannerBase
              semRegistro={Number(resumo.sem_registro)}
              total={Number(resumo.total)}
              mostrarLink={perfil.papel !== "supervisor"}
            />
          )}
          {/* A faixa escura abre a coluna de conteúdo; o cabeçalho de cada
              tela assenta nela e os cartões sobem por cima da borda. */}
          <div className="faixa-app flex-1 flex flex-col min-w-0">
            <main className="conteudo-pagina flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 py-6">{children}</main>
          </div>
        </div>
      </div>

      <PainelPerfilColaborador />
    </ProvedorPerfilColaborador>
  );
}
