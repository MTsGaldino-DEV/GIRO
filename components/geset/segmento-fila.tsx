import Link from "next/link";
import { Info } from "@/components/info";

const EXPLICACAO = "O ASO ou AVP já foi concluído no GIRO. Falta lançá-lo no GESET.";

/**
 * Chave do Radar: "Fila de ações" (a lista de sempre) ou "Falta lançar no
 * GESET (N)". A visão fica na URL (`?fila=geset`), então é link, não estado:
 * dá para colar o endereço no chat e abrir já na fila certa.
 *
 * Server Component. `pendentes` é o total da view, não o da página; `null`
 * (consulta falhou) aparece como "—" para nunca dizer "0" por engano.
 *
 * Petróleo e grafite: é navegação, não semáforo.
 */
export function SegmentoFila({
  ativa,
  pendentes,
}: {
  ativa: "acoes" | "geset";
  pendentes: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <nav aria-label="Fila do Radar" className="segmento">
        <Link
          href="/radar"
          className="segmento__item"
          aria-current={ativa === "acoes" ? "page" : undefined}
        >
          Fila de ações
        </Link>
        <Link
          href="/radar?fila=geset"
          className="segmento__item"
          aria-current={ativa === "geset" ? "page" : undefined}
        >
          Falta lançar no GESET
          <span className="segmento__numero tabular">
            <span aria-hidden>{pendentes ?? "—"}</span>
            <span className="sr-only">
              {pendentes === null ? "(total indisponível)" : `(${pendentes})`}
            </span>
          </span>
        </Link>
      </nav>
      {ativa === "geset" && <Info>{EXPLICACAO}</Info>}
    </div>
  );
}
