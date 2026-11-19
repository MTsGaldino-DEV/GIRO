import { Info } from "@/components/info";
import { GraficoConclusoes, type PontoMes } from "@/components/grafico-conclusoes";
import { hrefDashboard, type EscopoDashboard } from "@/lib/regras-dashboard";
import { CartaoKpi } from "./cartao-kpi";
import { Indisponivel } from "./indisponivel";

/**
 * % em dia, dias parados em média e a curva de conclusões. "Tempo médio por
 * etapa" é medido como dias parados na etapa atual dos itens abertos: é o que
 * as views guardam sem SQL novo (o histórico de cada passagem não tem RPC).
 */
export function OutrasMetricas({
  emDia,
  semPessoas,
  mediaDias,
  semItensAbertos,
  antecedencia,
  antecedenciaFalhou,
  curva,
  escopo,
  ativo,
}: {
  /** Porcentagem de pessoas em dia; null sem base. */
  emDia: number | null;
  /** Carregou e o escopo não tem ninguém: o "—" é ausência real, não falha. */
  semPessoas: boolean;
  /** null quando os itens não carregaram, ou quando não há item aberto. */
  mediaDias: number | null;
  /** Carregou e não há item aberto: o "—" é ausência real, não falha. */
  semItensAbertos: boolean;
  /** Dias antes do vencimento anterior, em média (negativo = depois); null sem base. */
  antecedencia: number | null;
  /** A consulta falhou: o "—" é falha, não ausência de regularização. */
  antecedenciaFalhou: boolean;
  /** null quando a consulta falhou: nada de barras zeradas no lugar. */
  curva: PontoMes[] | null;
  escopo: EscopoDashboard;
  ativo: string | null;
}) {
  return (
    <section className="card" aria-labelledby="titulo-metricas">
      <h2 id="titulo-metricas" className="text-[1.0625rem] mb-3">
        Outras métricas
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <CartaoKpi
          href={hrefDashboard(escopo, "em_dia")}
          valor={emDia}
          sufixo="%"
          rotulo="Pessoas em dia hoje"
          nota={semPessoas ? "Ninguém neste escopo" : undefined}
          textoNulo={semPessoas ? "ninguém neste escopo" : undefined}
          ativo={ativo === "em_dia"}
        />
        <CartaoKpi
          href={hrefDashboard(escopo, "abertos")}
          valor={mediaDias}
          sufixo={mediaDias === 1 ? " dia" : " dias"}
          rotulo="Parados em média na etapa atual"
          nota={semItensAbertos ? "Sem itens abertos" : undefined}
          textoNulo={semItensAbertos ? "sem itens abertos" : undefined}
          ativo={ativo === "abertos"}
        />
        <CartaoKpi
          valor={antecedencia === null ? null : Math.abs(antecedencia)}
          sufixo={antecedencia !== null && Math.abs(antecedencia) === 1 ? " dia" : " dias"}
          rotulo={
            antecedencia !== null && antecedencia < 0
              ? "Regularizados depois do vencimento, em média"
              : "Antecedência média na regularização"
          }
          nota={!antecedenciaFalhou && antecedencia === null ? "Sem renovação nos últimos 6 meses" : undefined}
          textoNulo={antecedenciaFalhou ? undefined : "sem renovação nos últimos seis meses"}
          titulo="Nos últimos seis meses: vencimento do ASO/AVP anterior menos a data do novo documento. Primeiro exame e datas estimadas da carga inicial ficam de fora."
        />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-label font-medium">Concluídos por mês</h3>
        <Info>ASO e AVP com resultado apto, pela data do documento, nos últimos seis meses.</Info>
      </div>
      {curva ? <GraficoConclusoes dados={curva} largura={420} /> : <Indisponivel />}
    </section>
  );
}
