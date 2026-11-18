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

/** Resumo do anel "Em dia" do cartão do pé (calculado no servidor, ver `lib/consulta-em-dia.ts`). */
export interface ResumoEmDia {
  emDia: number;
  total: number;
  /** Percentual inteiro (0–100) de `percentual()` das regras do Dashboard. */
  percentual: number;
  /** true quando o recorte é a equipe do supervisor, não a UEN. */
  equipe: boolean;
}

/** Textos do anel: rótulo acessível/dica ("87% em dia: 219 de 252 colaboradores"), linha de detalhe e o %. */
export function descreverEmDia(resumo: ResumoEmDia): { rotulo: string; detalhe: string; percentual: string } {
  const detalhe = `${resumo.emDia} de ${resumo.total} colaboradores`;
  const recorte = resumo.equipe ? " da sua equipe" : "";
  return {
    rotulo: `${resumo.percentual}% em dia: ${detalhe}${recorte}`,
    detalhe,
    percentual: `${resumo.percentual}%`,
  };
}
