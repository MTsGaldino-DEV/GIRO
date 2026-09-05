import { Trilha, type DegrauTrilha } from "@/components/trilha";

export type { DegrauTrilha };

/**
 * Cabeçalho padrão de página: trilha, título, subtítulo e as ações da tela.
 *
 * A trilha vem por prop em vez de ser deduzida do pathname porque metade dos
 * níveis do GIRO não está na URL: `/qsms/colaborador/3f2a…/aso` viraria
 * "qsms › colaborador › 3f2a…", que não é navegação, é o caminho do arquivo. O
 * nome do colaborador só a página que já o carregou conhece.
 *
 * É Server Component: nenhum estado, nenhum evento. Colocar "use client" aqui
 * arrastaria todas as páginas que o usam para o bundle do navegador.
 */
export function CabecalhoPagina({
  trilha,
  titulo,
  descricao,
  children,
}: {
  trilha?: DegrauTrilha[];
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Ações da tela — botões, atalhos. Alinhadas à direita do título. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5">
      {trilha && trilha.length > 0 && <Trilha degraus={trilha} className="mb-2" />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1>{titulo}</h1>
          {descricao && <p className="text-ink-muted text-label mt-1 mb-0">{descricao}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
