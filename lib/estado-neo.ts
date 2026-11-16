/**
 * Estado da sincronização com a NEO, lido das linhas de `neo_sincronizacoes`.
 *
 * Lógica pura (sem banco), testada em scripts/teste-estado-neo.mjs. A tela busca
 * as últimas tentativas, da mais recente para a mais antiga, e este arquivo
 * decide o que mostrar: a data da última sincronização que deu certo, se a
 * tentativa mais recente falhou e quais nomes de supervisor ainda não têm vínculo.
 */

export type TentativaNeo = {
  iniciado_em: string;
  origem: string;
  erro: string | null;
  resumo: unknown;
};

export type NomeSemVinculo = { texto: string; quantidade: number };

export type EstadoSincronizacao = {
  /** Quando a última sincronização bem-sucedida começou (ISO), ou null se nunca houve. */
  ultimaSucessoEm: string | null;
  /** A tentativa mais recente falhou (mostrar o aviso discreto). */
  ultimaFalhou: boolean;
  /** Textos de supervisor da NEO sem vínculo, segundo a última sincronização bem-sucedida. */
  semVinculo: NomeSemVinculo[];
};

function nomesSemVinculo(resumo: unknown): NomeSemVinculo[] {
  if (typeof resumo !== "object" || resumo === null) return [];
  const lista = (resumo as { supervisores_sem_vinculo?: unknown }).supervisores_sem_vinculo;
  if (!Array.isArray(lista)) return [];
  const saida: NomeSemVinculo[] = [];
  for (const x of lista) {
    if (typeof x !== "object" || x === null) continue;
    const { texto, quantidade } = x as { texto?: unknown; quantidade?: unknown };
    if (typeof texto === "string" && typeof quantidade === "number") saida.push({ texto, quantidade });
  }
  return saida;
}

/** `tentativas` vem da mais recente para a mais antiga. */
export function estadoDaSincronizacao(tentativas: TentativaNeo[]): EstadoSincronizacao {
  const ultimaOk = tentativas.find((t) => t.erro === null) ?? null;
  return {
    ultimaSucessoEm: ultimaOk?.iniciado_em ?? null,
    ultimaFalhou: tentativas.length > 0 && tentativas[0].erro !== null,
    semVinculo: ultimaOk ? nomesSemVinculo(ultimaOk.resumo) : [],
  };
}
