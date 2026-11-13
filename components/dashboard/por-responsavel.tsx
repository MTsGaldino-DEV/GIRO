import Link from "next/link";
import { Info } from "@/components/info";
import { Vazio } from "@/components/aviso";
import { hrefDashboard, RESPONSAVEL_QSMS, type EscopoDashboard, type LinhaResponsavel } from "@/lib/regras-dashboard";

/**
 * Com quem está a bola: barra Supervisão × QSMS (pelo `dono` da etapa) e uma
 * linha por responsável. As linhas somam o total de itens abertos.
 */
export function PorResponsavel({
  donos,
  linhas,
  escopo,
  ativo,
}: {
  donos: { supervisor: number; qsms: number };
  linhas: LinhaResponsavel[];
  escopo: EscopoDashboard;
  ativo: string | null;
}) {
  const total = donos.supervisor + donos.qsms;
  const lados = [
    { dono: "supervisor" as const, rotulo: "Supervisão", valor: donos.supervisor },
    { dono: "qsms" as const, rotulo: "QSMS", valor: donos.qsms },
  ];

  return (
    <section className="card" aria-labelledby="titulo-responsavel">
      <div className="flex items-center gap-2 mb-3">
        <h2 id="titulo-responsavel" className="text-[1.0625rem]">
          Pendências por responsável
        </h2>
        <Info>Com quem está cada item aberto agora: o supervisor da equipe ou o QSMS.</Info>
      </div>

      {total === 0 ? (
        <Vazio>Nenhum item em aberto.</Vazio>
      ) : (
        <>
          <div className="divisao-dono">
            {lados.map((l) => {
              const chave = `dono-${l.dono}`;
              return (
                <Link
                  key={l.dono}
                  href={hrefDashboard(escopo, chave)}
                  className={`divisao-dono__lado divisao-dono__lado--${l.dono}`}
                  style={{ flexGrow: l.valor }}
                  aria-current={ativo === chave ? "true" : undefined}
                >
                  <span className="tabular">{`${l.rotulo} · ${l.valor} (${Math.round((l.valor / total) * 100)}%)`}</span>
                </Link>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="tabela-dash">
              <caption className="sr-only">Itens abertos por responsável</caption>
              <thead>
                <tr>
                  <th scope="col">Responsável</th>
                  <th scope="col">Em mãos</th>
                  <th scope="col">Vencidos</th>
                  <th scope="col">Parados além do prazo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const chave = `resp-${l.id}`;
                  const qsms = l.id === RESPONSAVEL_QSMS;
                  return (
                    <tr key={l.id} aria-current={ativo === chave ? "true" : undefined}>
                      <td>
                        <Link href={hrefDashboard(escopo, chave)}>{l.nome}</Link>
                      </td>
                      <td className={qsms ? "font-medium" : undefined}>{l.emMaos}</td>
                      <td>{l.vencidos}</td>
                      <td>{l.parados}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
