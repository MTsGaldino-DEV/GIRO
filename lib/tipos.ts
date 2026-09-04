/** Contratos compartilhados. Espelham as views e tabelas do Postgres. */

export type Papel = "qsms" | "supervisor" | "admin";

/**
 * Estados do processo (plano da Fase 1, seção 6.2).
 *
 * `previsto` e `concluido` são os nomes que o plano chama de "pendente" e
 * "finalizado". Mantidos porque já são o vocabulário das telas e do banco.
 */
export type Etapa =
  | "previsto"
  | "data_solicitada"
  | "data_proposta"
  | "agendado"
  | "enviado_clinica"
  | "aguardando_documento"
  | "concluido"
  | "inapto_em_tratativa"
  | "cancelado";

/** Os cinco desfechos possíveis do exame (plano, seção 6.3). */
export type Desfecho =
  | "fez_apto"
  | "fez_inapto"
  | "faltou"
  | "incompleto"
  | "retorno_necessario";

export type StatusConformidade =
  | "ok"
  | "programar"
  | "atencao"
  | "critico"
  | "vencido"
  | "sem_registro";

export type Resultado = "apto" | "inapto" | "apto_com_restricao";

export type Dono = "supervisor" | "qsms" | "ninguem";

export type Situacao =
  | "trabalhando"
  | "ferias"
  | "auxilio_doenca"
  | "atestado"
  | "afastamento"
  | "outro";

export interface Perfil {
  id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  supervisor_id: string | null;
  ativo: boolean;
}

export interface LinhaStatus {
  colaborador_id: string;
  matricula: number;
  nome: string;
  cargo: string | null;
  polo: string | null;
  local: string | null;
  situacao: Situacao;
  supervisor_id: string | null;
  supervisor_nome: string | null;
  supervisor_email: string | null;
  tipo_requisito_id: string;
  requisito: string;
  exige_jejum: boolean;
  ultimo_documento: string | null;
  ultimo_documento_estimado: boolean | null;
  data_vencimento: string | null;
  dias_restantes: number | null;
  status: StatusConformidade;
  peso_status: number;
  bloqueado_para_agendamento: boolean;
}

export interface Clinica {
  id: string;
  nome: string;
  cidade: string | null;
  contato: string | null;
  endereco: string | null;
  ativo: boolean;
}

export interface ItemAberto extends LinhaStatus {
  item_id: string;
  etapa: Etapa;
  vencimento_item: string;
  data_liberacao_proposta: string | null;
  clinica: string | null;
  endereco: string | null;
  medico: string | null;
  data_agendada: string | null;
  hora_agendada: string | null;
  compareceu: boolean | null;
  avaliacao_psicossocial: boolean;
  comunicado_cemig_em: string | null;
  sla_vence_em: string | null;
  etapa_desde: string;
  item_criado_em: string;
  dono: Dono;
  dias_parados: number;
  sla_estourado: boolean;
  proxima_ausencia_inicio: string | null;
  proxima_ausencia_fim: string | null;
  proxima_ausencia_tipo: string | null;
  dias_janela_util: number | null;
  conflito_bloqueante: boolean;
  clinica_id: string | null;
  desfecho: Desfecho | null;
  dados_informados_em: string | null;
  data_limite_marcar: string;
  limite_marcacao_estourado: boolean;
}

export interface ResumoStatus {
  total: number;
  sem_registro: number;
  vencido: number;
  critico: number;
  atencao: number;
  programar: number;
  ok: number;
  sla_estourado: number;
}

export interface Supervisor {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface LinhaHistorico {
  id: string;
  etapa_de: Etapa | null;
  etapa_para: Etapa;
  autor: string | null;
  /** Supervisor por quem o QSMS falou. Na Fase 1 o supervisor não tem login. */
  em_nome_de: string | null;
  observacao: string | null;
  criado_em: string;
}
