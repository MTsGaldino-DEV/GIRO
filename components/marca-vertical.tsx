/**
 * Bloco de marca empilhado: símbolo, "GIRO" e a assinatura, centralizados.
 *
 * Composto em HTML em vez de um SVG novo. O texto herda a fonte da aplicação
 * em vez de virar traçado, acompanha os tokens de tipografia e é lido como
 * texto por leitor de tela. Um quarto arquivo de marca seria mais um a manter
 * em sincronia com os outros três.
 */
export function MarcaVertical() {
  return (
    <div className="grid justify-items-center text-center mb-8">
      <img src="/simbolo-giro.svg" alt="" width={72} height={72} className="mb-3" />
      {/* div, não h1: o h1 da página é a ação ("Entrar"), e dois h1 na mesma
          tela deixam a navegação por cabeçalho ambígua. */}
      <div className="text-[1.75rem] leading-none tracking-[0.16em] text-brand font-medium">
        GIRO
      </div>
      <p className="text-caption text-ink-faint mt-2.5 mb-0 text-balance">
        Gestão integrada de requisitos ocupacionais
      </p>
    </div>
  );
}
