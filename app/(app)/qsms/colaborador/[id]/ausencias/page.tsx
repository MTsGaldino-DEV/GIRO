import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio } from "@/components/aviso";
import { formatarData, TIPO_AUSENCIA_ROTULO } from "@/lib/dominio";
import { BotaoRemover } from "../../../ausencias/botao-remover";
import { FormularioAusenciaColaborador } from "./formulario";

export const metadata: Metadata = { title: "Ausências" };
export const dynamic = "force-dynamic";

interface AusenciaLinha {
  id: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
}

export default async function AbaAusencias({ params }: { params: Promise<{ id: string }> }) {
  await exigirQsms();
  const { id } = await params;

  const supabase = await criarClienteServidor();
  const [{ data: ausenciasBrutas }, { data: colaborador }] = await Promise.all([
    supabase
      .from("ausencias")
      .select("id, tipo, data_inicio, data_fim")
      .eq("colaborador_id", id)
      .order("data_inicio", { ascending: false }),
    supabase.from("colaboradores").select("nome").eq("id", id).maybeSingle(),
  ]);

  const ausencias = (ausenciasBrutas ?? []) as AusenciaLinha[];

  return (
    <div className="grid gap-5 max-w-[900px]">
      <Aviso titulo="Pendência P7 do plano — origem das ausências">
        O preenchimento é manual: não existe integração com a folha. Uma ausência
        não registrada aqui é invisível para o cálculo de janela útil e não
        bloqueia agendamento.
      </Aviso>

      <div className="card">
        <h2 className="text-[1.0625rem] mb-3">Registrar</h2>
        <FormularioAusenciaColaborador colaboradorId={id} />
      </div>

      {ausencias.length === 0 ? (
        <Vazio>Nenhuma ausência registrada.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela">
            <caption className="sr-only">Ausências do colaborador</caption>
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Início</th>
                <th scope="col">Retorno</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {ausencias.map((a) => (
                <tr key={a.id}>
                  <td className="text-label">{TIPO_AUSENCIA_ROTULO[a.tipo] ?? a.tipo}</td>
                  <td className="tabular">{formatarData(a.data_inicio)}</td>
                  <td className="tabular">
                    {a.data_fim ? (
                      formatarData(a.data_fim)
                    ) : (
                      <span className="text-ink-faint text-label">sem previsão</span>
                    )}
                  </td>
                  <td>
                    <BotaoRemover id={a.id} nome={colaborador?.nome ?? "colaborador"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
