"use client";

import { CampoEditavel, type Opcao } from "./campo-editavel";
import { SITUACAO_ROTULO } from "@/lib/dominio";
import {
  CAMPOS_COLABORADOR,
  CAMPOS_FOLHA,
  CAMPOS_LOTACAO,
  type CampoColaborador,
} from "@/lib/campos-colaborador";
import type { ColaboradorCompleto } from "@/lib/colaborador";
import type { Papel, Situacao, Supervisor } from "@/lib/tipos";

const SITUACOES: Situacao[] = [
  "trabalhando",
  "ferias",
  "auxilio_doenca",
  "atestado",
  "afastamento",
  "outro",
];

/**
 * Os dois blocos editáveis da aba Cadastro.
 *
 * Existe para o painel flutuante e a página cheia mostrarem exatamente a mesma
 * ficha. Eram dois formulários com botão "Salvar" no fim; agora cada campo tem
 * o próprio lápis e grava sozinho.
 *
 * A separação em dois blocos não é decoração: são permissões diferentes. A
 * identidade vem da folha e só o admin corrige — trocar matrícula reaponta
 * ASOs, itens e histórico de uma pessoa para outra. A lotação o QSMS mexe todo
 * dia.
 */
export function FichaCadastro({
  colaborador,
  supervisores,
  papel,
  origem = "Cadastro do colaborador",
  aoSalvar,
}: {
  colaborador: ColaboradorCompleto;
  supervisores: Supervisor[];
  papel: Papel;
  origem?: string;
  /** O painel não é uma rota: lá quem recarrega os dados é o componente pai. */
  aoSalvar?: () => void;
}) {
  const ehAdmin = papel === "admin";

  const opcoes: Partial<Record<CampoColaborador, Opcao[]>> = {
    situacao: SITUACOES.map((s) => ({ valor: s, rotulo: SITUACAO_ROTULO[s] })),
    supervisor_id: [
      { valor: "", rotulo: "Sem supervisor" },
      ...supervisores.map((s) => ({ valor: s.id, rotulo: s.nome })),
    ],
  };

  function campo(nome: CampoColaborador) {
    return (
      <CampoEditavel
        key={nome}
        colaboradorId={colaborador.id}
        campo={nome}
        valor={(colaborador as unknown as Record<string, string | number | null>)[nome] ?? null}
        opcoes={opcoes[nome]}
        editavel={CAMPOS_COLABORADOR[nome].papel === "admin" ? ehAdmin : true}
        origem={origem}
        aoSalvar={aoSalvar}
      />
    );
  }

  return (
    <>
      <div className="card">
        <h3 className="mb-1">Dados da folha</h3>
        <p className="text-ink-muted text-label mb-4">
          {ehAdmin
            ? "Identificação do colaborador. Toda alteração fica no histórico, com o valor anterior."
            : "Vêm da importação e só o admin edita."}
        </p>
        <div className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3">
          {CAMPOS_FOLHA.map(campo)}
        </div>
      </div>

      <div className="card">
        <h3 className="mb-1">Lotação e vínculo</h3>
        <p className="text-ink-muted text-label mb-4">
          O que a operação do QSMS conhece melhor que a folha.
        </p>
        <div className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3">
          {CAMPOS_LOTACAO.map(campo)}
        </div>
      </div>
    </>
  );
}
