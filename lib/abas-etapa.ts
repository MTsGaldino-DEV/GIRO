import { entradasDaFaixa } from "./acoes-etapa.ts";
import { ETAPA_ROTULO } from "./dominio.ts";
import { ETAPAS_ABERTAS } from "./regras-dashboard.ts";

/**
 * Abas de etapa do Radar: "Todos" e uma por etapa aberta, na ordem do ciclo.
 * `suaVez` marca as etapas em que o próximo passo é do papel de quem olha
 * (mesma tabela da faixa "Para você agir"). Lógica pura, sem React: testada por
 * `scripts/teste-abas-etapa.mjs` via `node --experimental-strip-types`.
 */
export type AbaEtapa = {
  etapa: string | undefined;
  rotulo: string;
  quantidade: number;
  suaVez: boolean;
};

export function montarAbas(papel: string, contagens: Record<string, number>): AbaEtapa[] {
  const minhas = new Set(entradasDaFaixa(papel).map((e) => e.etapa as string));
  const porEtapa = ETAPAS_ABERTAS.map((etapa): AbaEtapa => ({
    etapa,
    rotulo: ETAPA_ROTULO[etapa],
    quantidade: contagens[etapa] ?? 0,
    suaVez: minhas.has(etapa),
  }));
  const total = porEtapa.reduce((soma, a) => soma + a.quantidade, 0);
  return [{ etapa: undefined, rotulo: "Todos", quantidade: total, suaVez: false }, ...porEtapa];
}
