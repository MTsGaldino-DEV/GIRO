/** Cookie com o estado da sidebar no desktop ("recolhida" | "aberta"). Lido pelo layout no servidor. */
export const COOKIE_SIDEBAR = "giro-sidebar";

/** A sidebar nasce recolhida: só "aberta" a abre; ausente ou desconhecido, recolhida. */
export function estaRecolhida(valorCookie: string | undefined): boolean {
  return valorCookie !== "aberta";
}

/** "Maria da Silva" → "MS"; um nome só → primeira letra; vazio → "?". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (partes[0].charAt(0) + ultima).toUpperCase();
}
