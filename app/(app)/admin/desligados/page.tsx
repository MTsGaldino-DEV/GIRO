import type { Metadata } from "next";
import { exigirAdmin } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData } from "@/lib/dominio";
import { Vazio } from "@/components/aviso";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";

export const metadata: Metadata = { title: "Colaboradores desligados" };
export const dynamic = "force-dynamic";

/**
 * Onde os desligados continuam alcançáveis.
 *
 * `vw_status_colaborador` filtra por `ativo = true` — é o que faz o desligado
 * sair do semáforo e parar de gerar pendência. O efeito colateral é que o
 * Painel e a Conferência da base deixam de enxergá-lo, e sem esta tela o
 * desligamento seria porta de mão única: reativar dependeria de alguém ter
 * guardado o link direto do perfil.
 *
 * Só admin, porque desligar e reativar também são só do admin.
 */
export default async function PaginaDesligados() {
  await exigirAdmin();

  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("colaboradores")
    .select("id, nome, matricula, cargo, polo, data_admissao")
    .eq("ativo", false)
    .order("nome");

  const linhas = data ?? [];

  return (
    <div>
      <CabecalhoPagina
        trilha={[{ rotulo: "Administração" }, { rotulo: "Desligados" }]}
        titulo="Colaboradores desligados"
        descricao={
          <span className="block max-w-[70ch]">
            Fora do semáforo e sem pendência de ASO. O histórico, os exames e os
            documentos continuam na base — abra o perfil e use
            &ldquo;Reativar&rdquo; na aba Cadastro para trazer de volta.
          </span>
        }
      />

      <div className="card">
        {linhas.length === 0 ? (
          <Vazio>Nenhum colaborador desligado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <caption className="sr-only">Colaboradores desligados</caption>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Matrícula</th>
                  <th scope="col">Cargo</th>
                  <th scope="col">Polo</th>
                  <th scope="col">Admissão</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <BotaoNomeColaborador
                        colaboradorId={c.id}
                        nome={c.nome}
                        aba="cadastro"
                      />
                    </td>
                    <td className="tabular">{c.matricula}</td>
                    <td className="text-label">{c.cargo ?? "—"}</td>
                    <td className="text-label">{c.polo ?? "—"}</td>
                    <td className="tabular">{formatarData(c.data_admissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
