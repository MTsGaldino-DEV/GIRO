import Link from "next/link";
import { Info } from "@/components/info";
import { Vazio } from "@/components/aviso";
import { ETAPA_ROTULO } from "@/lib/dominio";
import { hrefDashboard, type EscopoDashboard, type LinhaEtapa } from "@/lib/regras-dashboard";
import type { Etapa } from "@/lib/tipos";

/**
 * Itens abertos por etapa, com a média de dias parados em cada uma. Barras em
 * petróleo: medem volume, não risco.
 */
export function PorEtapa({
  etapas,
  medias,
  escopo,
  ativo,
}: {
  etapas: LinhaEtapa[];
  medias: Partial<Record<Etapa, number>>;
  escopo: EscopoDashboard;
  ativo: string | null;
}) {
  const maximo = Math.max(1, ...etapas.map((e) => e.quantidade));
  const total = etapas.reduce((s, e) => s + e.quantidade, 0);

  return (
    <section className="card" aria-labelledby="titulo-etapa">
      <div className="flex items-center gap-2 mb-3">
        <h2 id="titulo-etapa" className="text-[1.0625rem]">
          {`${total} ${total === 1 ? "item aberto" : "itens abertos"}, por etapa`}
        </h2>
        <Info>À direita, quantos dias os itens estão parados na etapa atual, em média.</Info>
      </div>

      {etapas.length === 0 ? (
        <Vazio>Nenhum item em aberto.</Vazio>
      ) : (
        <div className="grid gap-0.5">
          {etapas.map((e, i) => {
            const chave = `etapa-${e.etapa}`;
            const media = medias[e.etapa];
            return (
              <Link
                key={e.etapa}
                href={hrefDashboard(escopo, chave)}
                className="barra-etapa"
                aria-current={ativo === chave ? "true" : undefined}
              >
                <span className="truncate">{ETAPA_ROTULO[e.etapa]}</span>
                <span className="barra-etapa__trilho" aria-hidden>
                  <span
                    className="barra-etapa__valor barra-proporcao__valor"
                    style={{ width: `${(e.quantidade / maximo) * 100}%`, "--i": i } as React.CSSProperties}
                  />
                </span>
                <span className="tabular text-right font-medium">{e.quantidade}</span>
                <span className="barra-etapa__media tabular">
                  {media === undefined ? "" : `média ${media}d`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
