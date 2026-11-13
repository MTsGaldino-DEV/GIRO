import { Info } from "@/components/info";
import { GraficoConclusoes, type PontoMes } from "@/components/grafico-conclusoes";
import { hrefDashboard, type EscopoDashboard } from "@/lib/regras-dashboard";
import { CartaoKpi } from "./cartao-kpi";

/**
 * % em dia, dias parados em média e a curva de conclusões. "Tempo médio por
 * etapa" é medido como dias parados na etapa atual dos itens abertos: é o que
 * as views guardam sem SQL novo (o histórico de cada passagem não tem RPC).
 */
export function OutrasMetricas({
  emDia,
  mediaDias,
  curva,
  escopo,
  ativo,
}: {
  /** Porcentagem de pessoas em dia; null sem base. */
  emDia: number | null;
  mediaDias: number | null;
  curva: PontoMes[];
  escopo: EscopoDashboard;
  ativo: string | null;
}) {
  return (
    <section className="card" aria-labelledby="titulo-metricas">
      <h2 id="titulo-metricas" className="text-[1.0625rem] mb-3">
        Outras métricas
      </h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <CartaoKpi
          href={hrefDashboard(escopo, "ok")}
          valor={emDia}
          sufixo="%"
          rotulo="Pessoas em dia hoje"
          ativo={ativo === "ok"}
        />
        <CartaoKpi
          href={hrefDashboard(escopo, "abertos")}
          valor={mediaDias}
          sufixo={mediaDias === 1 ? " dia" : " dias"}
          rotulo="Parados em média na etapa atual"
          ativo={ativo === "abertos"}
        />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-label font-medium">Concluídos por mês</h3>
        <Info>ASO e AVP com resultado apto, pela data do documento, nos últimos seis meses.</Info>
      </div>
      <GraficoConclusoes dados={curva} largura={420} />
    </section>
  );
}
