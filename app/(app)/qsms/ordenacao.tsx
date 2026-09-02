import Link from "next/link";

/** Colunas que aceitam ordenação, e como cada uma vira ORDER BY na consulta. */
export const COLUNAS_ORDENAVEIS = {
  nome: { coluna: "nome", ascPadrao: true },
  vencimento: { coluna: "data_vencimento", ascPadrao: true },
  status: { coluna: "peso_status", ascPadrao: true },
  parados: { coluna: "dias_parados", ascPadrao: false },
} as const;

export type ChaveOrdenacao = keyof typeof COLUNAS_ORDENAVEIS;

export function ehChaveOrdenacao(v: string | undefined): v is ChaveOrdenacao {
  return !!v && v in COLUNAS_ORDENAVEIS;
}

/**
 * Cabeçalho clicável.
 *
 * Alterna a direção quando já é a coluna ativa; ao trocar de coluna, começa na
 * direção que faz sentido para ela — vencimento sobe (o mais próximo primeiro),
 * dias parados desce (o mais travado primeiro).
 */
export function ColunaOrdenavel({
  chave,
  rotulo,
  ordem,
  direcao,
  parametros,
  base,
}: {
  chave: ChaveOrdenacao;
  rotulo: string;
  ordem: ChaveOrdenacao | null;
  direcao: "asc" | "desc";
  parametros: Record<string, string | undefined>;
  base: string;
}) {
  const ativa = ordem === chave;
  const proximaDirecao = ativa
    ? direcao === "asc"
      ? "desc"
      : "asc"
    : COLUNAS_ORDENAVEIS[chave].ascPadrao
      ? "asc"
      : "desc";

  const busca = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) {
    if (v && k !== "ordem" && k !== "dir" && k !== "pagina") busca.set(k, v);
  }
  busca.set("ordem", chave);
  busca.set("dir", proximaDirecao);

  return (
    <th
      scope="col"
      aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link href={`${base}?${busca.toString()}`}>
        {rotulo}
        {ativa && (
          <span data-seta aria-hidden>
            {direcao === "asc" ? "↑" : "↓"}
          </span>
        )}
      </Link>
    </th>
  );
}
