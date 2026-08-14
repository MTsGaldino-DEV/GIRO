import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
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
    <div className="min-h-dvh flex flex-col">
      {resumo && (
        <BannerBase
          semRegistro={Number(resumo.sem_registro)}
          total={Number(resumo.total)}
          mostrarLink={perfil.papel === "qsms"}
        />
      )}
      <Cabecalho perfil={perfil} />
      <main className="flex-1 mx-auto w-full max-w-[1280px] px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
