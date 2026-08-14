import Link from "next/link";

/**
 * Faixa fixa no topo de todas as telas enquanto houver colaborador sem data de
 * referência (plano, seção 8).
 *
 * Ela some sozinha quando a Fase 0 zerar. É deliberado que incomode: 177 de 261
 * sem data é um buraco que só se fecha se alguém for lembrado dele todo dia.
 */
export function BannerBase({
  semRegistro,
  total,
  mostrarLink = true,
}: {
  semRegistro: number;
  total: number;
  mostrarLink?: boolean;
}) {
  if (semRegistro <= 0) return null;

  return (
    <div className="banner-base" role="status">
      <span>
        <strong className="font-medium tabular">{semRegistro}</strong> de{" "}
        <span className="tabular">{total}</span> colaboradores sem data de
        referência. Sem isso não dá para distinguir quem está regular de quem
        nunca fez o exame.
      </span>
      {mostrarLink && (
        <Link
          href="/qsms/base"
          className="shrink-0 underline underline-offset-2"
          style={{ color: "inherit" }}
        >
          Conferir a base
        </Link>
      )}
    </div>
  );
}
