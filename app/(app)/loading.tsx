/**
 * Esqueleto de carregamento de todas as telas da área logada.
 *
 * Existe por um motivo medido, não estético: sem um limite de Suspense, o App
 * Router segura a tela antiga congelada até a resposta do servidor chegar
 * inteira — 285 a 340 ms no ambiente local, e várias vezes isso quando a
 * função e o banco estão em continentes diferentes. Nesse intervalo o clique
 * na aba não produzia retorno visual nenhum, e a leitura do usuário era de
 * travamento, não de carregamento.
 *
 * Com este arquivo, o clique pinta o esqueleto imediatamente e o Next passa a
 * ter uma casca estática para pré-buscar no hover do link.
 *
 * Deliberadamente genérico: um esqueleto por rota renderiza melhor, mas
 * duplicaria a manutenção em 21 páginas para ganhar pouco. Este acerta o
 * formato comum a quase todas — título, faixa de cartões, bloco de conteúdo.
 */

function Barra({ className = "" }: { className?: string }) {
  return <div className={`esqueleto ${className}`} />;
}

export default function Carregando() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <div className="mb-5">
        <Barra className="h-8 w-52" />
        <Barra className="h-4 w-80 mt-2" />
      </div>

      <div className="grid gap-3 mb-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Barra key={i} className="h-[86px]" />
        ))}
      </div>

      <div className="grid gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Barra key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
