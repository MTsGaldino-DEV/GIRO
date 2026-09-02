import type { Metadata } from "next";
import { exigirAdmin } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Vazio } from "@/components/aviso";
import { FormularioUsuario } from "./formulario-usuario";
import { BotaoAtivo } from "./botao-ativo";
import type { Perfil, Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Gestão de usuários" };
export const dynamic = "force-dynamic";

const PAPEL_ROTULO: Record<string, string> = { qsms: "QSMS", supervisor: "Supervisor", admin: "Admin" };

export default async function PaginaUsuarios() {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const [{ data: usuarios }, { data: supervisores }] = await Promise.all([
    supabase.from("perfis").select("id, email, nome, papel, supervisor_id, ativo").order("nome"),
    supabase.from("supervisores").select("id, nome, email, ativo").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="max-w-[900px]">
      <h1>Gestão de usuários</h1>
      <p className="text-ink-muted text-label mt-1 mb-5 max-w-[70ch]">
        Não há autocadastro. Todo acesso — QSMS, Supervisor ou Admin — é criado
        aqui, com senha temporária. Quem entra troca a senha em
        &ldquo;Trocar senha&rdquo;.
      </p>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr] items-start">
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Novo acesso</h2>
          <FormularioUsuario supervisores={(supervisores ?? []) as Supervisor[]} />
        </div>

        <div className="overflow-x-auto">
          <table className="tabela">
            <caption className="sr-only">Usuários cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Papel</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {((usuarios ?? []) as Perfil[]).map((u) => (
                <tr key={u.id}>
                  <td>{u.nome ?? "—"}</td>
                  <td className="text-label">{u.email}</td>
                  <td className="text-label">{PAPEL_ROTULO[u.papel] ?? u.papel}</td>
                  <td className="text-label">{u.ativo ? "Ativo" : "Desativado"}</td>
                  <td><BotaoAtivo id={u.id} ativo={u.ativo} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {(usuarios ?? []).length === 0 && <Vazio>Nenhum usuário cadastrado.</Vazio>}
        </div>
      </div>
    </div>
  );
}
