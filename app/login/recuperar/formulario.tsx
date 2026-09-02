"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { solicitarRecuperacao, type Acao } from "../acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full mt-4" disabled={pending}>
      {pending ? "Enviando…" : "Enviar link"}
    </button>
  );
}

export function FormularioRecuperar() {
  const [estado, acao] = useActionState<Acao | null, FormData>(solicitarRecuperacao, null);

  if (estado?.ok) {
    return (
      <p role="status" aria-live="polite" className="text-label text-ink-muted m-0">
        {estado.mensagem}
      </p>
    );
  }

  return (
    <form action={acao} noValidate>
      <label className="label" htmlFor="email">E-mail</label>
      <input
        id="email"
        name="email"
        className="field"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        required
        placeholder="nome@engelmig.com.br"
      />

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}

      <Botao />
    </form>
  );
}
