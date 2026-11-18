import type { Metadata } from "next";
import { comOperador } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarColaborador, assinarFoto } from "@/lib/colaborador";
import { FichaCadastro } from "./ficha-cadastro";
import { BotaoDesligar } from "./botao-desligar";
import { EnvioFoto } from "./envio-foto";
import { excluirColaborador } from "./acoes";
import { BotaoExcluir } from "@/components/botao-excluir";
import type { Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Cadastro" };
export const dynamic = "force-dynamic";

export default async function AbaCadastro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  // A foto depende do caminho que vem no colaborador; o resto sai junto com o
  // perfil. Eram três rodadas em série, agora são duas.
  const [perfil, [colaborador, { data: supervisoresBrutos }]] = await comOperador(() =>
    Promise.all([
      carregarColaborador(id),
      supabase.from("supervisores").select("id, nome, email, ativo").eq("ativo", true).order("nome"),
    ])
  );
  const fotoUrl = await assinarFoto(colaborador.foto_url);

  return (
    <div className="grid gap-5 max-w-[900px]">
      <FichaCadastro
        colaborador={colaborador}
        supervisores={(supervisoresBrutos ?? []) as Supervisor[]}
      />

      <div className="card">
        <h3 className="mb-1">Foto</h3>
        <p className="text-ink-muted text-label mb-3">
          Reduzida para 256px no navegador antes do envio.
        </p>
        <EnvioFoto colaboradorId={id} nome={colaborador.nome} fotoUrl={fotoUrl} />
      </div>

      <div className="card">
        <h3 className="mb-1">Quadro</h3>
        <p className="text-ink-muted text-label mb-4">
          {colaborador.ativo
            ? "Colaborador ativo: entra no semáforo e gera pendência de ASO."
            : "Colaborador desligado."}
        </p>
        <BotaoDesligar colaborador={colaborador} />
      </div>

      {perfil.papel === "admin" && (
        <div className="card">
          <h3 className="mb-1">Excluir colaborador</h3>
          <p className="text-ink-muted text-label mb-4">
            Apaga de vez o colaborador e tudo ligado a ele no GIRO: ASOs, itens, documentos,
            ausências, histórico e foto. Não dá para desfazer. A NEO não é alterada. Para quem saiu
            da empresa, use Desligar.
          </p>
          <BotaoExcluir
            acao={excluirColaborador}
            id={colaborador.id}
            nome={colaborador.nome}
            rotulo="Excluir colaborador"
            confirmacao={`Excluir ${colaborador.nome} de vez? ASOs, documentos e histórico serão apagados e não dá para desfazer.`}
          />
        </div>
      )}
    </div>
  );
}
