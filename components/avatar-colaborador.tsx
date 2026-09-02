/**
 * Miniatura do colaborador: foto quando existe, inicial quando não.
 *
 * A inicial não é degradação — é o estado normal por muito tempo. São 261
 * pessoas e ninguém tira 261 retratos num dia, então o fallback precisa ser
 * apresentável, não um ícone de "imagem quebrada".
 */
export function AvatarColaborador({
  nome,
  fotoUrl,
  tamanho = 34,
}: {
  nome: string;
  fotoUrl?: string | null;
  tamanho?: number;
}) {
  const inicial = nome.trim().charAt(0).toUpperCase() || "?";
  const estilo = { width: tamanho, height: tamanho };

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt=""
        style={estilo}
        className="avatar-colaborador shrink-0 object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...estilo, fontSize: Math.round(tamanho * 0.4) }}
      className="avatar-colaborador avatar-colaborador--inicial shrink-0"
    >
      {inicial}
    </span>
  );
}
