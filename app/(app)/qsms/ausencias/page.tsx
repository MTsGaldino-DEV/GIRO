import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio } from "@/components/aviso";
import { formatarData, TIPO_AUSENCIA_ROTULO } from "@/lib/dominio";
import { FormularioAusencia } from "./formulario";
import { BotaoRemover } from "./botao-remover";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";

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
  await exigirQsms();
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
    <div className="max-w-[900px]">
      <CabecalhoPagina
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Ausências" }]}
        titulo="Ausências"
        descricao={
          <span className="block max-w-[70ch]">
            Férias, atestados e afastamentos. O sistema usa isso para calcular a
            janela útil e para impedir agendamento em dia que o colaborador não
            estará disponível.
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

      <div className="grid gap-5 lg:grid-cols-[320px_1fr] items-start">
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Registrar</h2>
          <FormularioAusencia colaboradores={colaboradores ?? []} />
        </div>

        <div className="overflow-x-auto">
          <table className="tabela">
            <caption className="sr-only">Ausências registradas</caption>
            <thead>
              <tr>
                <th scope="col">Colaborador</th>
                <th scope="col">Tipo</th>
                <th scope="col">Início</th>
                <th scope="col">Retorno</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {ausencias.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.colaboradores?.nome ?? "—"}
                    <span className="block text-caption text-ink-faint tabular">
                      {a.colaboradores?.matricula}
                    </span>
                  </td>
                  <td className="text-label">
                    {TIPO_AUSENCIA_ROTULO[a.tipo] ?? a.tipo}
                  </td>
                  <td className="tabular">{formatarData(a.data_inicio)}</td>
                  <td className="tabular">
                    {a.data_fim ? (
                      formatarData(a.data_fim)
                    ) : (
                      <span className="text-ink-faint text-label">sem previsão</span>
                    )}
                  </td>
                  <td>
                    <BotaoRemover id={a.id} nome={a.colaboradores?.nome ?? "colaborador"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {ausencias.length === 0 && <Vazio>Nenhuma ausência registrada.</Vazio>}
        </div>
      </div>
    </div>
  );
}
