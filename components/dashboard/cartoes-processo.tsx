import { hrefDashboard, type EscopoDashboard } from "@/lib/regras-dashboard";
import { CartaoKpi } from "./cartao-kpi";

export interface NumerosProcesso {
  noRadar: number | null;
  agendados: number | null;
  parados: number | null;
  concluidosMes: number | null;
  /** Total de `vw_pendencias_geset`; null quando a consulta falhou. */
  geset: number | null;
}

/**
 * Cartões de processo: brancos, grafite. Medem o andamento do fluxo, não a
 * conformidade de ninguém, então não usam cor do semáforo.
 */
export function CartoesProcesso({
  numeros,
  escopo,
  ativo,
}: {
  numeros: NumerosProcesso;
  escopo: EscopoDashboard;
  ativo: string | null;
}) {
  return (
    <section aria-labelledby="titulo-processo">
      <h2 id="titulo-processo" className="dash-rotulo">
        Processo
      </h2>
      <div className="kpis kpis--5">
        <CartaoKpi
          href={hrefDashboard(escopo, "radar")}
          valor={numeros.noRadar}
          rotulo="No radar"
          nota="Vencidos, sem registro e até 90 dias"
          ativo={ativo === "radar"}
        />
        <CartaoKpi
          href={hrefDashboard(escopo, "agendados")}
          valor={numeros.agendados}
          rotulo="Agendados"
          ativo={ativo === "agendados"}
        />
        <CartaoKpi
          href={hrefDashboard(escopo, "parados")}
          valor={numeros.parados}
          rotulo="Parados além do prazo"
          nota="Prazo da etapa estourado"
          ativo={ativo === "parados"}
        />
        <CartaoKpi
          href={hrefDashboard(escopo, "concluidos")}
          valor={numeros.concluidosMes}
          rotulo="Concluídos no mês"
          ativo={ativo === "concluidos"}
        />
        <CartaoKpi
          href="/radar?fila=geset"
          valor={numeros.geset}
          rotulo="Falta lançar no GESET"
          nota={escopo === "minha" ? "Sempre da UEN inteira" : "Abre a fila no Radar"}
        />
      </div>
    </section>
  );
}
