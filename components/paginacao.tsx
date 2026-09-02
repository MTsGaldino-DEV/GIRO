import Link from "next/link";

/**
 * Paginação de lista.
 *
 * Recebe os filtros vigentes para preservá-los na URL: um link filtrado e
 * paginado colado no chat precisa abrir exatamente a mesma tela.
 */
export function Paginacao({
  pagina,
  porPagina,
  total,
  base,
  parametros,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  base: string;
  parametros: Record<string, string | undefined>;
}) {
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;

  const primeiro = (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);

  function href(p: number) {
    const busca = new URLSearchParams();
    for (const [chave, valor] of Object.entries(parametros)) {
      if (valor) busca.set(chave, valor);
    }
    if (p > 1) busca.set("pagina", String(p));
    const query = busca.toString();
    return query ? `${base}?${query}` : base;
  }

  // Janela de cinco páginas ao redor da atual: com 261 colaboradores seriam
  // onze links, e onze números não ajudam ninguém a se localizar.
  const inicio = Math.max(1, Math.min(pagina - 2, ultimaPagina - 4));
  const fim = Math.min(ultimaPagina, inicio + 4);
  const paginas = [];
  for (let p = inicio; p <= fim; p++) paginas.push(p);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 mt-4"
    >
      <p className="text-label text-ink-muted m-0 tabular">
        Mostrando {primeiro}–{ultimo} de {total}
      </p>

      {ultimaPagina > 1 && (
        <ul className="flex items-center gap-1 list-none m-0 p-0">
          <li>
            <Link
              href={href(pagina - 1)}
              className="paginacao__item"
              aria-disabled={pagina === 1}
              tabIndex={pagina === 1 ? -1 : undefined}
            >
              <span aria-hidden>‹</span>
              <span className="sr-only">Página anterior</span>
            </Link>
          </li>

          {paginas.map((p) => (
            <li key={p}>
              <Link
                href={href(p)}
                className="paginacao__item"
                aria-current={p === pagina ? "page" : undefined}
              >
                {p}
              </Link>
            </li>
          ))}

          <li>
            <Link
              href={href(pagina + 1)}
              className="paginacao__item"
              aria-disabled={pagina === ultimaPagina}
              tabIndex={pagina === ultimaPagina ? -1 : undefined}
            >
              <span aria-hidden>›</span>
              <span className="sr-only">Próxima página</span>
            </Link>
          </li>
        </ul>
      )}
    </nav>
  );
}
