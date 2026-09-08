"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { alternarAtivo, type Acao } from "./acoes";
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
