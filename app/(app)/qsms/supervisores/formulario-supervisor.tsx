"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cadastrarSupervisor, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending}>
      {pending ? "Cadastrando…" : "Cadastrar e liberar acesso"}
    </button>
  );
}

export function FormularioSupervisor() {
  const [estado, acao] = useActionState<Acao | null, FormData>(cadastrarSupervisor, null);

  return (
    <form action={acao} className="grid gap-3">
      <div>
        <label className="label" htmlFor="nome-supervisor">Nome</label>
        <input id="nome-supervisor" name="nome" className="field" required minLength={3} />
      </div>

      <div>
        <label className="label" htmlFor="email-supervisor">E-mail</label>
        <input
          id="email-supervisor"
          name="email"
          type="email"
          className="field"
          required
          autoCapitalize="off"
          placeholder="nome@engelmig.com.br"
        />
      </div>

      <Botao />

      {estado?.ok && (
        <p role="status" className="text-label text-ink-muted m-0">{estado.mensagem}</p>
      )}
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
