/**
 * Os campos do cadastro que se editam um a um, com o lápis.
 *
 * Mora fora de `acoes.ts` porque os dois lados precisam da mesma lista: o
 * componente, para saber o rótulo e o tipo de entrada; a Server Action, para
 * decidir como a alteração aparece na trilha. Todo operador (admin, QSMS e
 * supervisor) edita todos os campos; quem barra é `exigirOperador()` na ação.
 *
 * Só metadado de apresentação — as validações ficam em `acoes.ts`, para que
 * o zod não entre no pacote do navegador junto.
 */

export type TipoCampo = "texto" | "numero" | "data" | "select" | "booleano";

export type CampoColaborador =
  | "nome"
  | "matricula"
  | "cpf"
  | "uen"
  | "data_admissao"
  | "data_nascimento"
  | "cargo"
  | "local"
  | "situacao"
  | "supervisor_id"
  | "exige_avp";

export interface DefinicaoCampo {
  rotulo: string;
  /** Como aparece na trilha: "alterou cargo: …". Minúsculo, sem artigo. */
  auditoria: string;
  tipo: TipoCampo;
  /** Aviso curto abaixo do campo enquanto ele está aberto para edição. */
  ajuda?: string;
}

export const CAMPOS_COLABORADOR: Record<CampoColaborador, DefinicaoCampo> = {
  nome: { rotulo: "Nome", auditoria: "nome", tipo: "texto" },
  matricula: {
    rotulo: "Matrícula",
    auditoria: "matrícula",
    tipo: "numero",
    ajuda: "Identifica a pessoa em toda a base. Trocar reaponta ASOs, itens e histórico.",
  },
  cpf: { rotulo: "CPF", auditoria: "CPF", tipo: "texto", ajuda: "Somente números." },
  uen: { rotulo: "UEN", auditoria: "UEN", tipo: "texto" },
  data_admissao: { rotulo: "Admissão", auditoria: "admissão", tipo: "data" },
  data_nascimento: { rotulo: "Nascimento", auditoria: "nascimento", tipo: "data" },
  cargo: { rotulo: "Cargo", auditoria: "cargo", tipo: "texto" },
  local: { rotulo: "Local", auditoria: "local", tipo: "texto" },
  situacao: {
    rotulo: "Situação",
    auditoria: "situação",
    tipo: "select",
    ajuda: "Qualquer situação diferente de “Trabalhando” bloqueia agendamento.",
  },
  supervisor_id: {
    rotulo: "Supervisor",
    auditoria: "supervisor",
    tipo: "select",
    ajuda: "Sem supervisor, o colaborador não entra em nenhum e-mail semanal.",
  },
  exige_avp: {
    rotulo: "Avaliação psicológica",
    auditoria: "exige AVP",
    tipo: "booleano",
    ajuda: "Marcado, entra no controle da AVP (a cada 24 meses). Desmarcar cancela a pendência aberta.",
  },
};

/** Ordem de leitura de cada bloco da aba Cadastro. */
export const CAMPOS_FOLHA: CampoColaborador[] = [
  "nome",
  "matricula",
  "cpf",
  "data_admissao",
  "data_nascimento",
  "uen",
];

export const CAMPOS_LOTACAO: CampoColaborador[] = [
  "cargo",
  "local",
  "situacao",
  "supervisor_id",
  "exige_avp",
];
