import { exigirPerfil } from "@/lib/perfil";
import { obterResumoStatus } from "@/lib/colaborador";
import { Sidebar } from "@/components/sidebar";
import { BannerBase } from "@/components/banner-base";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  // A view respeita RLS: o supervisor vê o buraco da equipe dele, o QSMS vê o
  // dos 261. Cada um é cobrado pelo que consegue resolver.
  //
  // Em paralelo com o perfil de propósito: o resumo não depende dele — quem
  // filtra por equipe é a RLS, a partir da mesma sessão. Se `exigirPerfil`
  // redirecionar, o redirect propaga normalmente pelo Promise.all.
  const [perfil, resumo] = await Promise.all([exigirPerfil(), obterResumoStatus()]);

  return (
    <div className="min-h-dvh flex">
      <Sidebar perfil={perfil} />
      <div className="flex-1 flex flex-col min-w-0">
        {resumo && (
          <BannerBase
            semRegistro={Number(resumo.sem_registro)}
            total={Number(resumo.total)}
            mostrarLink={perfil.papel !== "supervisor"}
          />
        )}
        {/* O teto existe para não esticar linha de texto até ficar ilegível,
            mas 1280px sem mx-auto encostava tudo na sidebar e deixava o resto
            de um monitor de 1920 como espaço morto à direita. As telas que
            precisam de coluna estreita (item, detalhe do colaborador) já põem
            o próprio max-w; o dashboard e o painel usam a largura toda. */}
        <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
