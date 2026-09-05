"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { alternarAtivo, salvarDadosDaFolha, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";

function Botao({ rotulo, ocupado, classe = "btn btn--primary" }: {
  rotulo: string;
  ocupado: string;
  classe?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending}>
      {pending ? ocupado : rotulo}
    </button>
  );
}

interface DadosFolha {
  id: string;
  nome: string;
  matricula: number;
  cpf: string | null;
  uen: string | null;
  data_admissao: string | null;
  data_nascimento: string | null;
  ativo: boolean;
}

/**
 * Edição dos dados que vêm da folha. Só admin vê este formulário.
 *
 * Nome, matrícula e CPF ficaram anos como leitura porque corrigi-los aqui
 * criaria divergência com o RH na próxima reimportação. A reimportação ainda
 * não existe, e enquanto não existir o cadastro só se conserta por aqui — o
 * que trocou o problema de lugar: um nome errado ficava errado para sempre.
 * Quando o importador chegar, a decisão de quem vence em caso de divergência
 * precisa ser tomada; até lá, a trilha registra cada correção e por quem.
 */
export function FormularioFolha({
  colaborador,
  origem = "Cadastro do colaborador",
  aoSalvar,
}: {
  colaborador: DadosFolha;
  origem?: string;
  /** Painel flutuante não tem rota: `revalidatePath` não recarrega nada lá. */
  aoSalvar?: () => void;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(salvarDadosDaFolha, null);

  useEffect(() => {
    if (estado?.ok) aoSalvar?.();
  }, [estado, aoSalvar]);

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="id" value={colaborador.id} />
      <input type="hidden" name="origem" value={origem} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="folha-nome">Nome</label>
          <input
            id="folha-nome"
            name="nome"
            required
            maxLength={160}
            className="field"
            defaultValue={colaborador.nome}
          />
        </div>

        <div>
          <label className="label" htmlFor="folha-matricula">Matrícula</label>
          <input
            id="folha-matricula"
            name="matricula"
            type="number"
            required
            min={1}
            className="field"
            defaultValue={colaborador.matricula}
          />
          <p className="text-caption text-ink-faint mt-1 mb-0">
            Identifica a pessoa em toda a base. Trocar reaponta ASOs, itens e
            histórico.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="folha-cpf">CPF</label>
          <input
            id="folha-cpf"
            name="cpf"
            inputMode="numeric"
            maxLength={14}
            className="field"
            placeholder="Somente números"
            defaultValue={colaborador.cpf ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor="folha-admissao">Admissão</label>
          <input
            id="folha-admissao"
            name="data_admissao"
            type="date"
            className="field"
            defaultValue={colaborador.data_admissao ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor="folha-nascimento">Nascimento</label>
          <input
            id="folha-nascimento"
            name="data_nascimento"
            type="date"
            className="field"
            defaultValue={colaborador.data_nascimento ?? ""}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="folha-uen">UEN</label>
          <input
            id="folha-uen"
            name="uen"
            maxLength={120}
            className="field"
            defaultValue={colaborador.uen ?? ""}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao rotulo="Salvar dados da folha" ocupado="Salvando…" />
        {estado?.ok && (
          <span role="status" className="text-label text-ink-muted">{estado.mensagem}</span>
        )}
      </div>

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}

/**
 * Desligar e reativar.
 *
 * Fora do formulário de propósito: salvar um nome corrigido e tirar alguém do
 * quadro não são a mesma decisão, e um botão só faria uma virar efeito colateral
 * da outra. Desligar pede confirmação porque some com a pessoa do semáforo e
 * das cobranças — reversível, mas não silencioso.
 */
export function BotaoDesligar({
  colaborador,
  origem = "Cadastro do colaborador",
  aoSalvar,
}: {
  colaborador: { id: string; ativo: boolean };
  origem?: string;
  aoSalvar?: () => void;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(alternarAtivo, null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (estado?.ok) {
      setConfirmando(false);
      aoSalvar?.();
    }
  }, [estado, aoSalvar]);

  if (colaborador.ativo && !confirmando) {
    return (
      <div className="grid gap-2">
        <button
          type="button"
          className="btn btn--secondary btn--sm justify-self-start"
          onClick={() => setConfirmando(true)}
        >
          Desligar colaborador
        </button>
        {estado?.ok && (
          <span role="status" className="text-label text-ink-muted">{estado.mensagem}</span>
        )}
      </div>
    );
  }

  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="id" value={colaborador.id} />
      <input type="hidden" name="ativo" value={(!colaborador.ativo).toString()} />
      <input type="hidden" name="origem" value={origem} />

      {colaborador.ativo ? (
        <p className="text-label m-0">
          Desligado, o colaborador sai do semáforo e para de gerar pendência de
          ASO. O histórico, os exames e os documentos continuam na base, e
          reativar devolve tudo.
        </p>
      ) : (
        <p className="text-label m-0">
          Este colaborador está desligado: não aparece no semáforo nem gera
          pendência.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Botao
          rotulo={colaborador.ativo ? "Confirmar desligamento" : "Reativar colaborador"}
          ocupado="Salvando…"
          classe="btn btn--secondary btn--sm"
        />
        {colaborador.ativo && (
          <button
            type="button"
            className="btn btn--fantasma btn--sm"
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </button>
        )}
      </div>

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
