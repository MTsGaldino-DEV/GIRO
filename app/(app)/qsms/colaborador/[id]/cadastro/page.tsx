import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarColaborador, assinarFoto } from "@/lib/colaborador";
import { formatarData } from "@/lib/dominio";
import { FormularioCadastro } from "./formulario";
import { EnvioFoto } from "./envio-foto";
import type { Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Cadastro" };
export const dynamic = "force-dynamic";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">{rotulo}</dt>
      <dd className="m-0 mt-0.5 tabular">{children}</dd>
    </div>
  );
}

export default async function AbaCadastro({ params }: { params: Promise<{ id: string }> }) {
  await exigirQsms();
  const { id } = await params;

  const colaborador = await carregarColaborador(id);
  const supabase = await criarClienteServidor();

  const [{ data: supervisoresBrutos }, fotoUrl] = await Promise.all([
    supabase.from("supervisores").select("id, nome, email, ativo").eq("ativo", true).order("nome"),
    assinarFoto(colaborador.foto_url),
  ]);

  return (
    <div className="grid gap-5 max-w-[900px]">
      <div className="card">
        <h2 className="text-[1.0625rem] mb-4">Foto</h2>
        <EnvioFoto colaboradorId={id} nome={colaborador.nome} fotoUrl={fotoUrl} />
      </div>

      <div className="card">
        <h2 className="text-[1.0625rem] mb-1">Dados da folha</h2>
        <p className="text-ink-muted text-label mb-4">
          Vêm do RH e não são editáveis aqui: corrigir nesta tela criaria
          divergência silenciosa com a folha na próxima reimportação.
        </p>
        <dl className="grid gap-x-6 gap-y-4 grid-cols-2 sm:grid-cols-3 m-0">
          <Campo rotulo="Matrícula">{colaborador.matricula}</Campo>
          <Campo rotulo="Nome">{colaborador.nome}</Campo>
          <Campo rotulo="CPF">{colaborador.cpf ?? "—"}</Campo>
          <Campo rotulo="Admissão">{formatarData(colaborador.data_admissao)}</Campo>
          <Campo rotulo="Nascimento">{formatarData(colaborador.data_nascimento)}</Campo>
          <Campo rotulo="UEN">{colaborador.uen ?? "—"}</Campo>
        </dl>
      </div>

      <div className="card">
        <h2 className="text-[1.0625rem] mb-1">Lotação e vínculo</h2>
        <p className="text-ink-muted text-label mb-4">
          O que a operação do QSMS conhece melhor que a folha.
        </p>
        <FormularioCadastro
          colaborador={colaborador}
          supervisores={(supervisoresBrutos ?? []) as Supervisor[]}
        />
      </div>
    </div>
  );
}
