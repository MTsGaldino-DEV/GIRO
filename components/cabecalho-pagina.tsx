/**
 * Cabeçalho padrão de página: título, descrição e as ações da tela.
 *
 * Sem trilha: a navegação lateral já diz onde o usuário está. As telas de
 * detalhe (colaborador, item) mantêm o `Trilha` como "voltar", fora daqui.
 *
 * Assenta direto no fundo claro da aplicação; `.cabecalho-pagina` em
 * globals.css só fixa o tamanho e o peso do título.
 *
 * É Server Component: nenhum estado, nenhum evento. Colocar "use client" aqui
 * arrastaria todas as páginas que o usam para o bundle do navegador.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  children,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Ações da tela — botões, atalhos. Alinhadas ao fim, à direita do título. */
  children?: React.ReactNode;
}) {
  return (
    <header className="cabecalho-pagina mb-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1>{titulo}</h1>
          {descricao && <p className="text-ink-muted text-label mt-1 mb-0">{descricao}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
