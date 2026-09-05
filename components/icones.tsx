/** Ícones de traço, 20×20, herdam a cor do texto. Sem dependência nova — SVG inline resolve o que a sidebar precisa. */

type Props = { className?: string };

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconePainel({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconeDashboard({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 19V11M9.33 19V6M14.67 19v-6M20 19V8" />
    </svg>
  );
}

export function IconeBase({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

export function IconeSupervisores({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16.5 5.5a3 3 0 0 1 0 6" />
      <path d="M15.5 14a5.5 5.5 0 0 1 5 5.5" />
    </svg>
  );
}

export function IconeAusencias({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
      <path d="m8.5 14.5 3 3 4-5" />
    </svg>
  );
}

export function IconeUsuarios({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 8v4M19 10h-4" />
      <path d="M15.5 14a5.5 5.5 0 0 1 5 5.5" />
    </svg>
  );
}

export function IconeChave({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.5 12.5 8-8M16 5l2 2M13.5 8.5l2 2" />
    </svg>
  );
}

export function IconeSair({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H9" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </svg>
  );
}

export function IconeChevron({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

/** Três pontos verticais — abre o menu de ações de uma linha da tabela. */
export function IconeReticencias({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Marca de seleção — itens de menu do tipo checkbox. */
export function IconeConfere({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/** Ponto cheio — itens de menu do tipo radio. */
export function IconePonto({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** X — fecha o painel do perfil. */
export function IconeFechar({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Folha com dobra — a aba Documentos. */
export function IconeDocumento({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5L14 3Z" />
      <path d="M14 3v4.5h4.5" />
    </svg>
  );
}
