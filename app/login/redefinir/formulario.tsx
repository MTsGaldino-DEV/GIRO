"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { redefinirSenha, type Acao } from "../acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full mt-4" disabled={pending}>
      {pending ? "Salvando…" : "Salvar nova senha"}
    </button>
  );
}

export function FormularioRedefinir() {
  const [estado, acao] = useActionState<Acao | null, FormData>(redefinirSenha, null);

  return (
    <form action={acao} noValidate>
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

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}

      <Botao />
    </form>
  );
}
