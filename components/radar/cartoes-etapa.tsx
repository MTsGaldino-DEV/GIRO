"use client";

import { entradasDaFaixa } from "@/lib/acoes-etapa";
import { ETAPA_ROTULO } from "@/lib/dominio";
import { ETAPAS_ABERTAS } from "@/lib/regras-dashboard";
import { Info } from "@/components/info";

const EXPLICACAO =
  "Quantos itens estão em cada etapa do ciclo, no escopo da equipe escolhida abaixo. Clique num cartão para ver só aquela etapa; clique de novo para voltar à lista inteira. “Sua vez” marca as etapas em que o próximo passo é seu.";

/**
 * Etapas do ciclo em cartões, no topo do Radar — mesmo desenho dos cartões de
 * Processo do Dashboard. Substitui o seletor "Etapa" e a antiga faixa "Para você
 * agir": cada cartão liga e desliga o filtro `?etapa=`. As etapas em que o
 * próximo passo é de quem olha ganham a nota "Sua vez · <ação>".
 *
 * Petróleo e grafite, nunca as cores do semáforo: etapa é processo, não situação.
 * Contagem zero fica apagada, não some, para a fileira não mudar de forma.
 */
export function CartoesEtapa({
  papel,
  contagens,
  etapaAtiva,
  aoEscolher,
}: {
  papel: string;
  contagens: Record<string, number>;
  etapaAtiva: string | undefined;
  aoEscolher: (etapa: string | undefined) => void;
}) {
  const suaVez = new Map(entradasDaFaixa(papel).map((e) => [e.etapa as string, e.rotulo]));

  return (
    <section aria-labelledby="titulo-etapas" className="mb-4">
      <h2 id="titulo-etapas" className="dash-rotulo inline-flex items-center gap-1.5">
        Etapas
        <Info>{EXPLICACAO}</Info>
      </h2>
      <div className="kpis kpis--etapas">
        {ETAPAS_ABERTAS.map((etapa) => {
          const quantidade = contagens[etapa] ?? 0;
          const ativa = etapaAtiva === etapa;
          const acao = suaVez.get(etapa);
          return (
            <button
              key={etapa}
              type="button"
              className="kpi kpi--botao"
              aria-pressed={ativa}
              data-vazio={quantidade === 0 && !ativa ? "true" : undefined}
              data-sua-vez={acao ? "true" : undefined}
              onClick={() => aoEscolher(ativa ? undefined : etapa)}
            >
              <span className="kpi__numero">{quantidade}</span>
              <span className="kpi__rotulo">{ETAPA_ROTULO[etapa]}</span>
              {acao && <span className="kpi__nota kpi__nota--sua-vez">Sua vez · {acao}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
