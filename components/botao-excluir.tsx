"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

type Acao = { ok: true; mensagem: string } | { ok: false; erro: string };

function Botao({ rotulo, nome }: { rotulo: string; nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--secondary btn--sm whitespace-nowrap" disabled={pending} aria-busy={pending}>
      {pending ? "Excluindo…" : rotulo}
      <span className="sr-only"> {nome}</span>
    </button>
  );
}

/**
 * Excluir com confirmação do navegador. A Server Action recebe `id` no FormData e
 * devolve `Acao`; o erro (ex.: "tem histórico, use Desativar") aparece embaixo.
 */
export function BotaoExcluir({
  acao,
  id,
  nome,
  confirmacao,
  rotulo = "Excluir",
  aoConcluir,
}: {
  acao: (anterior: Acao | null, formData: FormData) => Promise<Acao>;
  id: string;
  nome: string;
  confirmacao: string;
  rotulo?: string;
  /** Chamado uma vez quando a ação devolve ok (ex.: fechar a janela do perfil). */
  aoConcluir?: () => void;
}) {
  const [estado, executar] = useActionState<Acao | null, FormData>(acao, null);

  useEffect(() => {
    if (estado?.ok) aoConcluir?.();
  }, [estado, aoConcluir]);

  return (
    <form
      action={executar}
      onSubmit={(e) => {
        if (!window.confirm(confirmacao)) e.preventDefault();
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <Botao rotulo={rotulo} nome={nome} />
      {estado && !estado.ok && (
        <span role="alert" className="text-caption text-ink-muted max-w-[34ch] text-right whitespace-normal">
          {estado.erro}
        </span>
      )}
    </form>
  );
}
