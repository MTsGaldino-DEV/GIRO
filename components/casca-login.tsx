/**
 * Casca das telas de acesso (entrar, esqueci a senha, nova senha).
 *
 * Mesma estrutura do login da central-neo — painel escuro animado à esquerda,
 * formulário à direita sobre textura de pontos —, com animação voltada para
 * saúde: papel de eletrocardiograma, uma varredura desenhando o traço e
 * apagando o antigo, e a cada batida uma onda saindo do símbolo do GIRO.
 * Escolhida por Matheus entre quatro variações em 03/11/2026 ("opção 3").
 *
 * SVG e CSS puros, sem JavaScript: a tela de login é a primeira a carregar e
 * não deve esperar bundle nenhum para ganhar vida. Com "reduzir movimento"
 * ligado, a regra global zera as durações e o traço aparece parado, inteiro.
 */
export function CascaLogin({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="login-painel" aria-hidden>
        <FundoEletro />
        <div className="login-painel__veu" />
        <img src="/logo-giro-negativo.svg" alt="" width={210} height={60} className="login-painel__logo" />
        <div className="login-painel__texto">
          <p className="login-painel__chamada">Requisitos ocupacionais · UEN 211</p>
          <p className="login-painel__titulo">
            Cada ASO com dono,
            <br />
            prazo e caminho até o fim.
          </p>
        </div>
      </aside>

      <div className="login-lado">
        <div className="login-lado__conteudo">
          {/* No celular o painel escuro some; o logo vem para cá. */}
          <img src="/logo-giro.svg" alt="GIRO" width={168} height={48} className="lg:hidden mb-8" />
          {children}
        </div>
      </div>
    </main>
  );
}

/** Traço de uma batida: linha de base, onda P, QRS e onda T. */
const BATIDA = "l6 -6 l6 10 l8 -48 l8 64 l6 -24 l6 4";

function FundoEletro() {
  return (
    // Dois SVGs: a grade preenche o painel inteiro em qualquer proporção, e o
    // traço com o símbolo cabe inteiro ("meet"). Num SVG só, com "slice", o
    // painel alto de um monitor ampliava o desenho e cortava o símbolo.
    <svg className="login-painel__fundo">
      <defs>
        <pattern id="eletro-mm" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0 H0 V10" fill="none" stroke="rgba(79,179,166,.07)" strokeWidth="1" />
        </pattern>
        <pattern id="eletro-mm5" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0 H0 V50" fill="none" stroke="rgba(79,179,166,.16)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="url(#eletro-mm)" />
      <rect width="100%" height="100%" fill="url(#eletro-mm5)" />

      <svg
        viewBox="-10 0 450 360"
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        overflow="visible"
      >
        <path
          className="eletro__traco"
          pathLength={100}
          d={`M0 175 h30 ${BATIDA} h40 ${BATIDA} h40 ${BATIDA} h30`}
        />

        <circle className="eletro__onda" cx="320" cy="175" r="60" />
        <circle className="eletro__onda eletro__onda--segunda" cx="320" cy="175" r="60" />
        <circle cx="320" cy="175" r="52" fill="#132523" />

        {/* Símbolo oficial do GIRO (public/simbolo-giro.svg), em negativo. */}
        <g transform="translate(266 121) scale(.9)">
          <g stroke="#4FB3A6" strokeWidth="5" strokeLinecap="round">
            <line x1="60" y1="34" x2="60" y2="14" />
            <line x1="73" y1="37.5" x2="79" y2="27.1" />
            <line x1="82.5" y1="47" x2="92.9" y2="41" />
            <line x1="86" y1="60" x2="98" y2="60" />
            <line x1="82.5" y1="73" x2="92.9" y2="79" />
            <line x1="73" y1="82.5" x2="79" y2="92.9" />
            <line x1="60" y1="86" x2="60" y2="98" />
            <line x1="47" y1="82.5" x2="41" y2="92.9" />
            <line x1="37.5" y1="73" x2="27.1" y2="79" />
            <line x1="34" y1="60" x2="22" y2="60" />
            <line x1="37.5" y1="47" x2="27.1" y2="41" />
            <line x1="47" y1="37.5" x2="41" y2="27.1" />
          </g>
          <path d="M77.8 11.1 A52 52 0 1 1 42.2 11.1" fill="none" stroke="#F2F1EC" strokeWidth="4" strokeLinecap="round" />
          <polygon points="45.5,9.8 39.5,16.7 36.5,8.3" fill="#F2F1EC" />
        </g>
      </svg>
    </svg>
  );
}
