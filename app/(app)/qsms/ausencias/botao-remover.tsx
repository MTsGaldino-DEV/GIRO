"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removerAusencia, type Acao } from "./acoes";

function Botao({ nome }: { nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="text-label text-ink-muted underline underline-offset-2 bg-transparent border-0 cursor-pointer p-2 -m-2"
      disabled={pending}
    >
      {pending ? "Removendo…" : "Remover"}
      <span className="sr-only"> a ausência de {nome}</span>
    </button>
  );
}

export function BotaoRemover({ id, nome }: { id: string; nome: string }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(removerAusencia, null);

  if (estado?.ok) {
    return <span className="text-caption text-ink-faint">removida</span>;
  }

  return (
    <form action={acao}>
      <input type="hidden" name="id" value={id} />
      <Botao nome={nome} />
      {estado && !estado.ok && (
        <span role="alert" className="text-caption block">{estado.erro}</span>
      )}
    </form>
  );
}
