"use client";

import { entradasDaFaixa } from "@/lib/acoes-etapa";
import { Info } from "@/components/info";

const EXPLICACAO =
  "Filas em que o próximo passo é seu, com o total no escopo da equipe escolhida abaixo. Clique para ver só esses itens; clique de novo para voltar à lista inteira. A contagem segue a mesma regra do Radar: vencidos, sem registro e quem vence em até 90 dias.";

/**
 * Faixa "Para você agir", no topo do Radar.
 *
 * Cada entrada é um interruptor do filtro de etapa da lista (`?etapa=`), feito
 * pelo mesmo estado que o seletor "Etapa" já usa. Petróleo e grafite, nunca as
 * cores do semáforo: é ação, não situação. Contagem zero fica apagada, não some,
 * para a faixa não mudar de forma de um dia para o outro.
 */
export function FaixaParaVoce({
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
  const entradas = entradasDaFaixa(papel);
  if (entradas.length === 0) return null;

  const tudoZero = entradas.every((e) => (contagens[e.etapa] ?? 0) === 0);

  return (
    <section aria-labelledby="faixa-agir-titulo" className="card faixa-agir mb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="faixa-agir-titulo" className="faixa-agir__titulo">
          Para você agir
          <Info>{EXPLICACAO}</Info>
        </h2>

        <div className="flex flex-wrap gap-2">
          {entradas.map(({ etapa, rotulo }) => {
            const quantidade = contagens[etapa] ?? 0;
            const ativa = etapaAtiva === etapa;
            return (
              <button
                key={etapa}
                type="button"
                className="faixa-agir__item"
                aria-pressed={ativa}
                data-vazio={quantidade === 0 && !ativa ? "true" : undefined}
                onClick={() => aoEscolher(ativa ? undefined : etapa)}
              >
                <span>{rotulo}</span>
                <span className="faixa-agir__numero tabular">{quantidade}</span>
              </button>
            );
          })}
        </div>

        {tudoZero && <p className="m-0 text-label text-ink-muted">Nada para você agora.</p>}
      </div>
    </section>
  );
}
