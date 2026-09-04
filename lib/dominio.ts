import type { Etapa, Desfecho, StatusConformidade, Dono, Situacao } from "./tipos";

/**
 * Rótulos e formatação. Toda a nomenclatura visível ao usuário mora aqui,
 * para que "aguardando_documento" nunca vaze para a tela.
 */

export const STATUS_ROTULO: Record<StatusConformidade, string> = {
  ok: "Regular",
  programar: "Programar",
  atencao: "Atenção",
  critico: "Crítico",
  vencido: "Vencido",
  sem_registro: "Sem registro",
};

/** Classe do semáforo em globals.css. Cor é linguagem reservada: ver a regra no topo do CSS. */
export const STATUS_CLASSE: Record<StatusConformidade, string> = {
  ok: "status status--regular",
  programar: "status status--programar",
  atencao: "status status--atencao",
  critico: "status status--critico",
  vencido: "status status--vencido",
  sem_registro: "status status--sem-registro",
};

export const STATUS_LEITURA: Record<StatusConformidade, string> = {
  ok: "Vence em mais de 60 dias.",
  programar: "Entre 60 e 31 dias. É hora de programar a liberação.",
  atencao: "Entre 30 e 15 dias. A programação está atrasada.",
  critico: "Menos de 15 dias. Risco real de parar equipe.",
  vencido: "ASO vencido. O colaborador não pode trabalhar.",
  sem_registro: "Nenhuma data de referência. Tratar com a mesma gravidade de vencido.",
};

export const ETAPA_ROTULO: Record<Etapa, string> = {
  previsto: "Pendente",
  data_solicitada: "Data solicitada",
  data_proposta: "Data proposta",
  agendado: "Agendado",
  enviado_clinica: "Enviado à clínica",
  aguardando_documento: "Aguardando documento",
  concluido: "Finalizado",
  inapto_em_tratativa: "Inapto — em tratativa",
  cancelado: "Cancelado",
};

/** O que se espera de quem está com o item na mão. */
export const ETAPA_ACAO: Record<Etapa, string> = {
  previsto: "Solicitar ao supervisor a data em que o colaborador pode ser liberado",
  data_solicitada: "Aguardar a data que o supervisor vai propor",
  data_proposta: "Checar a clínica e agendar, ou devolver ao supervisor",
  agendado: "Informar clínica, horário e orientações ao supervisor",
  enviado_clinica: "Registrar o desfecho do exame",
  aguardando_documento: "Obter o ASO da clínica, lançar no GESET e registrar a data de realização",
  concluido: "Nada — ciclo encerrado",
  inapto_em_tratativa: "Resolver a tratativa clínica. O colaborador segue bloqueado",
  cancelado: "Nada — item cancelado",
};

/**
 * Os cinco desfechos (plano, seção 6.3).
 *
 * Quatro deles NÃO fecham o ciclo. Ir à clínica não é conformidade; só o
 * documento com resultado apto reinicia o relógio de 12 meses.
 */
export const DESFECHO_ROTULO: Record<Desfecho, string> = {
  fez_apto: "Fez e apto",
  fez_inapto: "Fez e inapto",
  faltou: "Faltou",
  incompleto: "Foi mas não fez tudo",
  retorno_necessario: "Fez, deu alteração e precisa de retorno",
};

export const DESFECHO_CONSEQUENCIA: Record<Desfecho, string> = {
  fez_apto: "Segue para o documento. É o único desfecho que fecha o ciclo.",
  fez_inapto: "Trava o processo. O colaborador permanece bloqueado até resolução explícita.",
  faltou: "Reabre com o supervisor para propor nova data.",
  incompleto: "Reabre com o supervisor para propor nova data.",
  retorno_necessario: "Reabre com o supervisor para propor a data do retorno.",
};

export const DONO_ROTULO: Record<Dono, string> = {
  supervisor: "Supervisão",
  qsms: "QSMS",
  ninguem: "—",
};

export const SITUACAO_ROTULO: Record<Situacao, string> = {
  trabalhando: "Trabalhando",
  ferias: "Férias",
  auxilio_doenca: "Auxílio doença",
  atestado: "Atestado",
  afastamento: "Afastamento",
  outro: "Outra situação",
};

export const TIPO_AUSENCIA_ROTULO: Record<string, string> = {
  ferias: "férias",
  atestado: "atestado",
  afastamento: "afastamento",
};

export const RESULTADO_ROTULO: Record<string, string> = {
  apto: "Apto",
  apto_com_restricao: "Apto com restrição",
  inapto: "Inapto",
};

/** Ordem de gravidade. Guia o padrão de ordenação dos dois painéis. */
export const ORDEM_STATUS: StatusConformidade[] = [
  "sem_registro",
  "vencido",
  "critico",
  "atencao",
  "programar",
  "ok",
];

// ---------------------------------------------------------------------------
// Datas
//
// Todas as datas vêm do Postgres como 'YYYY-MM-DD'. Passar isso por
// `new Date()` interpreta como UTC e, no fuso do Brasil, exibe o dia anterior.
// Por isso a formatação é feita sobre a string.
// ---------------------------------------------------------------------------

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "—";
  return `${dia}/${mes}/${ano}`;
}

export function formatarHora(hora: string | null | undefined): string {
  if (!hora) return "—";
  return hora.slice(0, 5);
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data de hoje no fuso de Governador Valadares, em ISO. Espelha public.hoje(). */
export function hojeIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function diasParaTexto(dias: number | null): string {
  if (dias === null || dias === undefined) return "sem data";
  if (dias < 0) return `venceu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`;
  if (dias === 0) return "vence hoje";
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * Texto curto do semáforo: "Crítico · 12d".
 *
 * Sem dias — os cards de contagem do painel, que rotulam um grupo e não um
 * colaborador — o selo é só o rótulo. "Crítico · —d" sugere um prazo que não
 * existe naquele contexto.
 */
export function rotuloStatus(status: StatusConformidade, dias: number | null): string {
  if (dias === null || status === "sem_registro") return STATUS_ROTULO[status];
  if (status === "vencido") return `${STATUS_ROTULO.vencido} · ${Math.abs(dias)}d`;
  return `${STATUS_ROTULO[status]} · ${dias}d`;
}

/**
 * Aviso de janela útil (plano, seção 7).
 *
 * "Vence em 40 dias" é uma meia-verdade se o colaborador entra de férias em 25.
 * O supervisor precisa ver o prazo real, não o do calendário.
 */
export function avisoJanelaUtil(item: {
  dias_restantes: number | null;
  dias_janela_util: number | null;
  proxima_ausencia_inicio: string | null;
  proxima_ausencia_fim: string | null;
  proxima_ausencia_tipo: string | null;
  conflito_bloqueante: boolean;
}): string | null {
  if (!item.proxima_ausencia_inicio) return null;

  const tipo = TIPO_AUSENCIA_ROTULO[item.proxima_ausencia_tipo ?? ""] ?? "ausência";

  if (item.conflito_bloqueante) {
    const retorno = item.proxima_ausencia_fim
      ? `retorna em ${formatarData(item.proxima_ausencia_fim)}`
      : "sem data de retorno";
    return `Conflito: em ${tipo} (${retorno}) durante todo o prazo restante. Não há janela para o exame — escalar para o QSMS.`;
  }

  const { dias_restantes: total, dias_janela_util: util } = item;
  if (total === null || util === null || util >= total) return null;

  return `Vence em ${total} ${total === 1 ? "dia" : "dias"}, mas entra em ${tipo} em ${formatarData(
    item.proxima_ausencia_inicio
  )} — janela útil de ${Math.max(0, util)} ${util === 1 ? "dia" : "dias"}.`;
}
