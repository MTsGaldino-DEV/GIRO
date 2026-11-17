import type { Metadata } from "next";
import { exigirAdmin } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Vazio } from "@/components/aviso";
import { FormularioUsuario } from "./formulario-usuario";
import { BotaoAtivo } from "./botao-ativo";
import { excluirUsuario } from "./acoes";
import { BotaoExcluir } from "@/components/botao-excluir";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Info } from "@/components/info";
import type { Perfil, Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Gestão de usuários" };
export const dynamic = "force-dynamic";

const PAPEL_ROTULO: Record<string, string> = { qsms: "QSMS", supervisor: "Supervisor", admin: "Admin" };

export default async function PaginaUsuarios() {
  const eu = await exigirAdmin();
  const supabase = await criarClienteServidor();

  const [{ data: usuarios }, { data: supervisores }] = await Promise.all([
    supabase.from("perfis").select("id, email, nome, papel, supervisor_id, ativo").order("nome"),
    supabase.from("supervisores").select("id, nome, email, ativo").eq("ativo", true).order("nome"),
  ]);

  const lista = (usuarios ?? []) as Perfil[];
  const nomeSupervisor = new Map(((supervisores ?? []) as Supervisor[]).map((s) => [s.id, s.nome]));
  const ativos = lista.filter((u) => u.ativo).length;

  return (
    <div className="max-w-[1280px] mx-auto">
      <CabecalhoPagina
        titulo="Gestão de usuários"
        descricao={
          <span className="inline-flex items-center gap-2">
            Todo acesso é criado aqui, com senha temporária.
            <Info>Não há autocadastro, para nenhum papel. Quem entra troca a senha no menu da própria conta, no canto da barra.</Info>
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] items-start">
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Novo acesso</h2>
          <FormularioUsuario supervisores={(supervisores ?? []) as Supervisor[]} />
        </div>

        <div className="card min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2 className="text-[1.0625rem] m-0">Acessos</h2>
            <span className="text-caption text-ink-faint tabular">
              {ativos} ativo{ativos === 1 ? "" : "s"} de {lista.length}
            </span>
          </div>

          {lista.length === 0 ? (
            <Vazio>Nenhum usuário cadastrado.</Vazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela tabela--compacta">
                <caption className="sr-only">Usuários cadastrados</caption>
                <thead>
                  <tr>
                    <th scope="col">Usuário</th>
                    <th scope="col" className="hidden sm:table-cell">Papel</th>
                    <th scope="col" className="hidden sm:table-cell">Situação</th>
                    <th scope="col"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((u) => {
                    const papel = PAPEL_ROTULO[u.papel] ?? u.papel;
                    const equipe = u.papel === "supervisor" && u.supervisor_id ? nomeSupervisor.get(u.supervisor_id) : null;
                    return (
                      <tr key={u.id} className={u.ativo ? undefined : "opacity-60"}>
                        <td className="min-w-0">
                          <span className="block font-medium">{u.nome ?? "—"}</span>
                          <span className="block text-caption text-ink-faint [overflow-wrap:anywhere]">{u.email}</span>
                          {equipe && (
                            <span className="block text-caption text-ink-muted">Equipe de {equipe}</span>
                          )}
                          {/* No celular, papel e situação vêm aqui. */}
                          <span className="flex flex-wrap gap-1.5 mt-1.5 sm:hidden">
                            <span className={`etiqueta ${u.papel === "admin" ? "etiqueta--solida" : "etiqueta--marca"}`}>{papel}</span>
                            <span className={`etiqueta ${u.ativo ? "etiqueta--contorno" : "etiqueta--neutra"}`}>
                              {u.ativo ? "Ativo" : "Desativado"}
                            </span>
                          </span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span className={`etiqueta ${u.papel === "admin" ? "etiqueta--solida" : "etiqueta--marca"}`}>{papel}</span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span className={`etiqueta ${u.ativo ? "etiqueta--contorno" : "etiqueta--neutra"}`}>
                            {u.ativo ? "Ativo" : "Desativado"}
                          </span>
                        </td>
                        <td className="text-right">
                          {u.id === eu.id ? (
                            <span className="text-caption text-ink-faint">Você</span>
                          ) : (
                            <div className="inline-flex flex-wrap justify-end items-start gap-2">
                              <BotaoAtivo id={u.id} ativo={u.ativo} />
                              <BotaoExcluir
                                acao={excluirUsuario}
                                id={u.id}
                                nome={u.nome ?? u.email}
                                confirmacao={`Excluir o acesso de ${u.nome ?? u.email}? A pessoa não consegue mais entrar. Isso não pode ser desfeito.`}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
