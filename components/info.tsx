/**
 * Explicação recolhida num "ⓘ" (redesign de 03/11/2026: no máximo uma frase
 * sob cada título; o porquê fica aqui, à mão de quem quiser ler).
 *
 * Dica em CSS puro, sem JavaScript: abre no hover e no foco do teclado, e o
 * texto vai também no `aria-label`, então o leitor de tela lê sem abrir nada.
 * Server Component de propósito — é usado dentro de cabeçalhos de página.
 */
export function Info({ children, lado = "baixo" }: { children: string; lado?: "baixo" | "cima" }) {
  return (
    <span className="info" tabIndex={0} role="note" aria-label={children} data-lado={lado}>
      <span aria-hidden>i</span>
      <span className="info__dica" aria-hidden>{children}</span>
    </span>
  );
}
