/**
 * Avisos em texto.
 *
 * Sem cor: verde, âmbar e vermelho pertencem ao semáforo. Um aviso colorido
 * roubaria o único canal que a tela tem para dizer "este não pode trabalhar
 * amanhã". A hierarquia aqui é feita com peso de borda e fundo neutro.
 */
export function Aviso({
  tom = "neutro",
  titulo,
  children,
}: {
  tom?: "neutro" | "forte";
  titulo?: string;
  children: React.ReactNode;
}) {
  const forte = tom === "forte";

  return (
    <div
      role="note"
      className="rounded-[var(--radius)] px-3.5 py-3 text-label"
      style={{
        background: forte ? "var(--color-ink)" : "var(--color-brand-wash)",
        color: forte ? "var(--color-mist)" : "var(--color-ink)",
        border: forte ? "none" : "1px solid var(--color-line)",
      }}
    >
      {titulo && <strong className="font-medium block mb-0.5">{titulo}</strong>}
      {children}
    </div>
  );
}

export function MensagemErro({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-label mt-2 text-ink font-medium">
      {children}
    </p>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-faint text-label py-8 text-center">{children}</p>;
}
