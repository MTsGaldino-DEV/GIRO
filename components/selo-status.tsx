import { STATUS_CLASSE, STATUS_LEITURA, rotuloStatus } from "@/lib/dominio";
import type { StatusConformidade } from "@/lib/tipos";

/**
 * O semáforo. Única superfície do sistema autorizada a usar verde, âmbar,
 * coral e vermelho — ver a regra no topo de app/globals.css.
 */
export function SeloStatus({
  status,
  dias,
  titulo,
}: {
  status: StatusConformidade;
  dias: number | null;
  titulo?: boolean;
}) {
  return (
    <span className={STATUS_CLASSE[status]} title={titulo ? STATUS_LEITURA[status] : undefined}>
      {rotuloStatus(status, dias)}
    </span>
  );
}
