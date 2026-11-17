"use client";

import { montarAbas } from "@/lib/abas-etapa";

/**
 * Abas de etapa do Radar: "Todos" e uma aba por etapa aberta, cada uma com a
 * contagem. Cada aba liga e desliga o filtro `?etapa=`; clicar na ativa volta
 * para "Todos". São filtros (aria-pressed), não abas ARIA: a lista abaixo é a
 * mesma, só muda o recorte. As etapas em que o próximo passo é de quem olha
 * ganham um pontinho e a contagem em petróleo suave.
 *
 * Petróleo e grafite, nunca as cores do semáforo: etapa é processo, não situação.
 */
export function AbasEtapa({
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
  const abas = montarAbas(papel, contagens);
  const temSuaVez = abas.some((a) => a.suaVez);

  return (
    <div className="abas-etapa-bloco">
      <div className="abas-etapa" role="group" aria-label="Etapas">
        {abas.map((aba) => {
          const ativa = aba.etapa === etapaAtiva;
          return (
            <button
              key={aba.etapa ?? "todos"}
              type="button"
              className="abas-etapa__aba"
              aria-pressed={ativa}
              data-sua-vez={aba.suaVez ? "true" : undefined}
              onClick={() => aoEscolher(ativa && aba.etapa !== undefined ? undefined : aba.etapa)}
            >
              {aba.suaVez && <span className="abas-etapa__vez" aria-hidden="true" />}
              {aba.rotulo}
              <span className="abas-etapa__contagem">{aba.quantidade}</span>
              {aba.suaVez && <span className="sr-only"> — sua vez de agir</span>}
            </button>
          );
        })}
      </div>
      {temSuaVez && (
        <span className="abas-etapa__legenda">
          <span className="abas-etapa__vez" aria-hidden="true" />
          Sua vez de agir
        </span>
      )}
    </div>
  );
}
