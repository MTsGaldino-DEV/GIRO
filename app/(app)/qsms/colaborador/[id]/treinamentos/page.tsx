import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso } from "@/components/aviso";

export const metadata: Metadata = { title: "Treinamentos" };
export const dynamic = "force-dynamic";

/**
 * Aba deliberadamente vazia.
 *
 * O schema nasceu genérico via `tipos_requisito` justamente para acomodar
 * NR-10, NR-33, NR-35 e brigada. O catálogo tem uma linha só porque as
 * periodicidades de cada NR nunca foram levantadas — é a pendência P4 do plano.
 *
 * A aba existir vazia é o que mantém a lacuna visível. Preencher com
 * periodicidades inventadas seria pior: viraria dado que ninguém conferiu e que
 * o sistema passaria a cobrar como se fosse verdade.
 */
export default async function AbaTreinamentos() {
  await exigirQsms();

  const supabase = await criarClienteServidor();
  const { data: tipos } = await supabase
    .from("tipos_requisito")
    .select("id, nome, periodicidade_meses, ativo")
    .eq("ativo", true)
    .neq("nome", "ASO Periódico")
    .order("nome");

  const outros = tipos ?? [];

  return (
    <div className="grid gap-5 max-w-[760px]">
      {outros.length === 0 ? (
        <Aviso titulo="Nenhum requisito além do ASO">
          O modelo de dados já aceita outros requisitos — NR-10, NR-33, NR-35,
          brigada — e adicionar cada um é um <code>INSERT</code> em{" "}
          <code>tipos_requisito</code>, não uma migração de schema. O que falta
          não é código: são as periodicidades, que ainda não foram levantadas
          (pendência P4 do plano). Definidas elas, os treinamentos aparecem aqui
          e passam a ter semáforo, prazo e ciclo como o ASO.
        </Aviso>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela">
            <caption className="sr-only">Requisitos cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">Requisito</th>
                <th scope="col">Periodicidade</th>
              </tr>
            </thead>
            <tbody>
              {outros.map((t) => (
                <tr key={t.id}>
                  <td>{t.nome}</td>
                  <td className="tabular">{t.periodicidade_meses} meses</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
