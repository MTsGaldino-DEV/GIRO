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

/** Contagem por status nos cards do painel. */
export function CartaoContagem({
  status,
  quantidade,
  ativo,
}: {
  status: StatusConformidade;
  quantidade: number;
  ativo?: boolean;
}) {
  return (
    <div
      className="card px-4 py-3"
      style={ativo ? { borderColor: "var(--color-brand)", boxShadow: "inset 0 0 0 1px var(--color-brand)" } : undefined}
    >
      <div className="text-[1.75rem] leading-tight font-medium tabular">{quantidade}</div>
      <div className="mt-1">
        <SeloStatus status={status} dias={null} />
      </div>
    </div>
  );
}
