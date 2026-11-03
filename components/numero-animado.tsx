/**
 * Número que conta de zero até o valor ao aparecer.
 *
 * A contagem é toda em CSS (`.numero-animado` em app/globals.css, com
 * @property): o servidor já manda o valor final, então não há o piscar de
 * "número certo → zero → contagem" que uma versão em JavaScript teria antes da
 * hidratação. O desenho é um contador CSS, que leitor de tela não lê de forma
 * confiável — por isso o valor real vai em sr-only e o desenho fica aria-hidden.
 */
export function NumeroAnimado({ valor, className = "" }: { valor: number; className?: string }) {
  const inteiro = Math.round(valor);
  return (
    <>
      <span
        className={`numero-animado ${className}`}
        style={{ "--valor": inteiro } as React.CSSProperties}
        aria-hidden
      />
      <span className="sr-only">{inteiro}</span>
    </>
  );
}
