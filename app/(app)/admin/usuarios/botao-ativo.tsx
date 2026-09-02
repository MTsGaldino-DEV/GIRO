"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { alternarAtivoUsuario, type Acao } from "./acoes";

function Botao({ ativo }: { ativo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="text-label text-ink-muted underline underline-offset-2 bg-transparent border-0 cursor-pointer p-2 -m-2"
      disabled={pending}
    >
      {pending ? "Salvando…" : ativo ? "Desativar" : "Reativar"}
    </button>
  );
}

export function BotaoAtivo({ id, ativo }: { id: string; ativo: boolean }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(alternarAtivoUsuario, null);

  return (
    <form action={acao}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ativo" value={(!ativo).toString()} />
      <Botao ativo={ativo} />
      {estado && !estado.ok && <span role="alert" className="text-caption block">{estado.erro}</span>}
    </form>
  );
}
