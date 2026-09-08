import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarColaborador, assinarFoto } from "@/lib/colaborador";
import { FichaCadastro } from "./ficha-cadastro";
import { BotaoDesligar } from "./botao-desligar";
import { EnvioFoto } from "./envio-foto";
import type { Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Cadastro" };
export const dynamic = "force-dynamic";

export default async function AbaCadastro({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await exigirQsms();
  const { id } = await params;

  const colaborador = await carregarColaborador(id);
  const supabase = await criarClienteServidor();

  const [{ data: supervisoresBrutos }, fotoUrl] = await Promise.all([
    supabase.from("supervisores").select("id, nome, email, ativo").eq("ativo", true).order("nome"),
    assinarFoto(colaborador.foto_url),
  ]);

  return (
    <div className="grid gap-5 max-w-[900px]">
      <FichaCadastro
        colaborador={colaborador}
        supervisores={(supervisoresBrutos ?? []) as Supervisor[]}
        papel={perfil.papel}
      />

      <div className="card">
        <h3 className="mb-1">Foto</h3>
        <p className="text-ink-muted text-label mb-3">
          Reduzida para 256px no navegador antes do envio.
        </p>
        <EnvioFoto colaboradorId={id} nome={colaborador.nome} fotoUrl={fotoUrl} />
      </div>

      {perfil.papel === "admin" && (
        <div className="card">
          <h3 className="mb-1">Quadro</h3>
          <p className="text-ink-muted text-label mb-4">
            {colaborador.ativo
              ? "Colaborador ativo: entra no semáforo e gera pendência de ASO."
              : "Colaborador desligado."}
          </p>
          <BotaoDesligar colaborador={colaborador} />
        </div>
      )}
    </div>
  );
}
