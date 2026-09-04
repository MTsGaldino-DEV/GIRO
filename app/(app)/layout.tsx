import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { BannerBase } from "@/components/banner-base";
import type { ResumoStatus } from "@/lib/tipos";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();

  // A view respeita RLS: o supervisor vê o buraco da equipe dele, o QSMS vê o
  // dos 261. Cada um é cobrado pelo que consegue resolver.
  const { data } = await supabase.rpc("fn_resumo_status");
  const resumo = (data?.[0] ?? null) as ResumoStatus | null;

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
