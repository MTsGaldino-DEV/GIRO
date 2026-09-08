/**
 * Os campos do cadastro que se editam um a um, com o lápis.
 *
 * Mora fora de `acoes.ts` porque os dois lados precisam da mesma lista: o
 * componente, para saber o rótulo e o tipo de entrada; a Server Action, para
 * decidir quem pode escrever e como a alteração aparece na trilha.
 *
 * Só metadado de apresentação — as validações ficam em `acoes.ts`, para que
 * o zod não entre no pacote do navegador junto.
 */

export type TipoCampo = "texto" | "numero" | "data" | "select";

export type CampoColaborador =
  | "nome"
  | "matricula"
  | "cpf"
  | "uen"
  | "data_admissao"
  | "data_nascimento"
  | "cargo"
  | "polo"
  | "local"
  | "situacao"
  | "supervisor_id";

export interface DefinicaoCampo {
  rotulo: string;
  /** Como aparece na trilha: "alterou cargo: …". Minúsculo, sem artigo. */
  auditoria: string;
  tipo: TipoCampo;
  /**
   * Quem pode escrever. Na tela decide se o lápis aparece; quem barra de
   * verdade é `exigirAdmin()` / `exigirQsms()` dentro da Server Action.
   */
  papel: "admin" | "qsms";
  /** Aviso curto abaixo do campo enquanto ele está aberto para edição. */
  ajuda?: string;
}

export const CAMPOS_COLABORADOR: Record<CampoColaborador, DefinicaoCampo> = {
  nome: { rotulo: "Nome", auditoria: "nome", tipo: "texto", papel: "admin" },
  matricula: {
    rotulo: "Matrícula",
    auditoria: "matrícula",
    tipo: "numero",
    papel: "admin",
    ajuda: "Identifica a pessoa em toda a base. Trocar reaponta ASOs, itens e histórico.",
  },
  cpf: { rotulo: "CPF", auditoria: "CPF", tipo: "texto", papel: "admin", ajuda: "Somente números." },
  uen: { rotulo: "UEN", auditoria: "UEN", tipo: "texto", papel: "admin" },
  data_admissao: { rotulo: "Admissão", auditoria: "admissão", tipo: "data", papel: "admin" },
  data_nascimento: { rotulo: "Nascimento", auditoria: "nascimento", tipo: "data", papel: "admin" },
  cargo: { rotulo: "Cargo", auditoria: "cargo", tipo: "texto", papel: "qsms" },
  polo: { rotulo: "Polo", auditoria: "polo", tipo: "texto", papel: "qsms" },
  local: { rotulo: "Local", auditoria: "local", tipo: "texto", papel: "qsms" },
  situacao: {
    rotulo: "Situação",
    auditoria: "situação",
    tipo: "select",
    papel: "qsms",
    ajuda: "Qualquer situação diferente de “Trabalhando” bloqueia agendamento.",
  },
  supervisor_id: {
    rotulo: "Supervisor",
    auditoria: "supervisor",
    tipo: "select",
    papel: "qsms",
    ajuda: "Sem supervisor, o colaborador não entra em nenhum e-mail semanal.",
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
  "polo",
  "local",
  "situacao",
  "supervisor_id",
];
