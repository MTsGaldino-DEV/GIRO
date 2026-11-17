import type { Metadata } from "next";
import { exigirOperador } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio } from "@/components/aviso";
import { formatarData, TIPO_AUSENCIA_ROTULO } from "@/lib/dominio";
import { FormularioAusencia } from "./formulario";
import { BotaoRemover } from "./botao-remover";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Info } from "@/components/info";

export const metadata: Metadata = { title: "Ausências" };
export const dynamic = "force-dynamic";

interface AusenciaComNome {
  id: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  colaboradores: { nome: string; matricula: number } | null;
}

export default async function PaginaAusencias() {
  await exigirOperador();
  const supabase = await criarClienteServidor();

  const [{ data: ausenciasBrutas }, { data: colaboradores }] = await Promise.all([
    supabase
      .from("ausencias")
      .select("id, tipo, data_inicio, data_fim, colaboradores(nome, matricula)")
      .order("data_inicio", { ascending: false })
      .limit(200),
    supabase
      .from("colaboradores")
      .select("id, nome, matricula")
      .eq("ativo", true)
      .order("nome"),
  ]);

  const ausencias = (ausenciasBrutas ?? []) as unknown as AusenciaComNome[];

  return (
    <div className="max-w-[1280px] mx-auto">
      <CabecalhoPagina
        titulo="Ausências"
        descricao={
          <span className="inline-flex items-center gap-2">
            Férias, atestados e afastamentos.
            <Info>Usados para calcular a janela útil e para impedir agendamento em dia que o colaborador não estará disponível.</Info>
          </span>
        }
      />

      <div className="mb-5">
        <Aviso titulo="Pendência P7 do plano — origem das ausências">
          O preenchimento é manual: a coluna de férias do arquivo de origem veio
          vazia e não existe integração com a folha. Enquanto a origem oficial
          não for definida, uma ausência não registrada aqui é invisível para o
          sistema.
        </Aviso>
      </div>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] items-start">
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Registrar ausência</h2>
          <FormularioAusencia colaboradores={colaboradores ?? []} />
        </div>

        <div className="card min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2 className="text-[1.0625rem] m-0">Registradas</h2>
            <span className="text-caption text-ink-faint tabular">{ausencias.length}</span>
          </div>

          {ausencias.length === 0 ? (
            <Vazio>Nenhuma ausência registrada.</Vazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela tabela--compacta">
                <caption className="sr-only">Ausências registradas</caption>
                <thead>
                  <tr>
                    <th scope="col">Colaborador</th>
                    <th scope="col" className="hidden sm:table-cell">Tipo</th>
                    <th scope="col" className="hidden sm:table-cell">Início</th>
                    <th scope="col" className="hidden sm:table-cell">Retorno</th>
                    <th scope="col"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {ausencias.map((a) => {
                    const tipo = TIPO_AUSENCIA_ROTULO[a.tipo] ?? a.tipo;
                    const retorno = a.data_fim ? formatarData(a.data_fim) : "sem previsão";
                    return (
                      <tr key={a.id}>
                        <td className="min-w-0">
                          <span className="block">{a.colaboradores?.nome ?? "—"}</span>
                          <span className="block text-caption text-ink-faint tabular">
                            {a.colaboradores?.matricula}
                          </span>
                          {/* No celular as colunas somem; o resumo vem aqui. */}
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 sm:hidden text-caption text-ink-muted tabular">
                            <span className="etiqueta etiqueta--neutra">{tipo}</span>
                            {formatarData(a.data_inicio)} → {retorno}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span className="etiqueta etiqueta--neutra">{tipo}</span>
                        </td>
                        <td className="hidden sm:table-cell tabular whitespace-nowrap">{formatarData(a.data_inicio)}</td>
                        <td className="hidden sm:table-cell tabular whitespace-nowrap">
                          {a.data_fim ? (
                            formatarData(a.data_fim)
                          ) : (
                            <span className="text-ink-faint text-label">sem previsão</span>
                          )}
                        </td>
                        <td className="text-right">
                          <BotaoRemover id={a.id} nome={a.colaboradores?.nome ?? "colaborador"} />
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
