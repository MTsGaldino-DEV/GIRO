import type { Etapa } from "./tipos";

/**
 * Botões da linha do Radar por etapa (spec 2026-11-13-telas-e-fluxo, seção 7).
 *
 * Um botão principal, o passo que move o item, e um menu com o resto. Quem
 * pode fazer cada coisa continua decidido no Postgres; aqui só se escolhe o que
 * mostrar. Importado também por `scripts/teste-acoes-etapa.mjs` via
 * `node --experimental-strip-types`: por isso só `import type` e caminho
 * relativo.
 */

export type IdAcao =
  // principais
  | "solicitar_data"
  | "informar_data"
  | "agendar"
  | "enviar_clinica"
  | "registrar_resultado"
  | "concluir_documento"
  | "encerrar_inapto"
  // secundárias
  | "devolver"
  | "informar_dados"
  | "registrar_falta"
  | "perfil"
  | "historico"
  | "cancelar";

/** `id` é uma das `IdAcao`; continua sendo string para quem só exibe. */
export type AcaoLinha = { id: IdAcao; rotulo: string };

const ROTULO: Record<IdAcao, string> = {
  solicitar_data: "Pedir data ao supervisor",
  informar_data: "Informar data",
  agendar: "Agendar",
  enviar_clinica: "Enviar à clínica",
  registrar_resultado: "Registrar resultado",
  concluir_documento: "Anexar ASO e concluir",
  encerrar_inapto: "Registrar tratativa",
  devolver: "Devolver ao supervisor",
  informar_dados: "Informar dados ao supervisor",
  registrar_falta: "Registrar falta",
  perfil: "Abrir perfil",
  historico: "Ver histórico",
  cancelar: "Cancelar item",
};

const PRINCIPAL: Record<Etapa, IdAcao | null> = {
  previsto: "solicitar_data",
  data_solicitada: "informar_data",
  data_proposta: "agendar",
  agendado: "enviar_clinica",
  enviado_clinica: "registrar_resultado",
  // Itens antigos: a etapa saiu do fluxo normal em 13/11 (spec 8 e 12b, item 4).
  aguardando_documento: "concluir_documento",
  inapto_em_tratativa: "encerrar_inapto",
  concluido: null,
  cancelado: null,
};

/** Só para consulta: vale em qualquer etapa. */
const CONSULTA: IdAcao[] = ["perfil", "historico"];

/**
 * Próprias da etapa, depois consulta, e cancelar por último (o menu separa).
 * Cancelar só onde `fn_transicao_valida` aceita o cancelamento administrativo:
 * o inapto sai por `fn_encerrar_inapto`, que já é o botão principal dele.
 */
const SECUNDARIAS: Record<Etapa, IdAcao[]> = {
  previsto: [...CONSULTA, "cancelar"],
  data_solicitada: [...CONSULTA, "cancelar"],
  data_proposta: ["devolver", ...CONSULTA, "cancelar"],
  agendado: ["informar_dados", "registrar_falta", ...CONSULTA, "cancelar"],
  enviado_clinica: [...CONSULTA, "cancelar"],
  aguardando_documento: [...CONSULTA, "cancelar"],
  inapto_em_tratativa: [...CONSULTA],
  concluido: [...CONSULTA],
  cancelado: [...CONSULTA],
};

/**
 * Faixa "Para você agir" no topo do Radar: as filas em que cada papel é o
 * dono do próximo passo. O supervisor é decidido na spec (seção 7, 13/11); a
 * do QSMS é palpite da spec, a confirmar com Matheus. `aguardando_documento`
 * fica fora: a etapa saiu do fluxo normal em 13/11.
 */
export type PapelFaixa = "supervisor" | "qsms";
export type EntradaFaixa = { etapa: Etapa; rotulo: string };

export const FAIXA_PARA_AGIR: Record<PapelFaixa, readonly EntradaFaixa[]> = {
  supervisor: [
    { etapa: "data_solicitada", rotulo: "Informar data" },
    { etapa: "enviado_clinica", rotulo: "Registrar resultado" },
  ],
  qsms: [
    { etapa: "previsto", rotulo: "Pedir data" },
    { etapa: "data_proposta", rotulo: "Agendar" },
    { etapa: "inapto_em_tratativa", rotulo: "Tratativa" },
    { etapa: "agendado", rotulo: "Enviar à clínica" },
  ],
};

/** Admin opera como QSMS. Papel desconhecido: faixa vazia. */
export function entradasDaFaixa(papel: string): EntradaFaixa[] {
  const chave: PapelFaixa | null =
    papel === "supervisor" ? "supervisor" : papel === "qsms" || papel === "admin" ? "qsms" : null;
  return chave ? FAIXA_PARA_AGIR[chave].map((e) => ({ ...e })) : [];
}

function acao(id: IdAcao): AcaoLinha {
  return { id, rotulo: ROTULO[id] };
}

export function acoesDaEtapa(etapa: Etapa): {
  principal: AcaoLinha | null;
  secundarias: AcaoLinha[];
} {
  // Etapa que o banco ganhe antes desta tabela: sem botão, mas a linha abre.
  const principal = PRINCIPAL[etapa] ?? null;
  const secundarias = SECUNDARIAS[etapa] ?? CONSULTA;
  return {
    principal: principal ? acao(principal) : null,
    secundarias: secundarias.map(acao),
  };
}
