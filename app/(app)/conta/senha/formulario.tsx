"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { trocarSenha, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Salvando…" : "Salvar nova senha"}
    </button>
  );
}

export function FormularioTrocarSenha() {
  const [estado, acao] = useActionState<Acao | null, FormData>(trocarSenha, null);

  return (
    <form action={acao} className="grid gap-3 max-w-[360px]" noValidate>
      <div>
        <label className="label" htmlFor="senha">Nova senha</label>
        <input
          id="senha"
          name="senha"
          className="field"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>

      <Botao />

      {estado?.ok && <p role="status" className="text-label text-ink-muted m-0">{estado.mensagem}</p>}
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
