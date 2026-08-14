import type { NextRequest } from "next/server";

/**
 * Autoriza uma rota de cron.
 *
 * A Vercel envia `Authorization: Bearer $CRON_SECRET`. Sem essa checagem
 * qualquer um dispararia o e-mail semanal para os sete supervisores — quantas
 * vezes quisesse.
 */
export function cronAutorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;

  // Sem segredo configurado, a rota fica fechada em produção. Em
  // desenvolvimento fica aberta para dar para testar sem cerimônia.
  if (!segredo) return process.env.NODE_ENV !== "production";

  const cabecalho = request.headers.get("authorization");
  return cabecalho === `Bearer ${segredo}`;
}

/** Semana ISO no formato usado na deduplicação: `2026-W34`. */
export function referenciaSemanal(data = new Date()): string {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  // ISO-8601: a semana pertence ao ano da sua quinta-feira.
  const diaDaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaDaSemana);

  const inicioDoAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioDoAno.getTime()) / 86400000 + 1) / 7);

  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}
