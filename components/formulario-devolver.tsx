"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { devolverAoSupervisor, type Acao } from "@/app/(app)/qsms/acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--secondary" disabled={pending}>
      {pending ? "Devolvendo…" : "Devolver ao supervisor"}
    </button>
  );
}

/**
 * Saída para quando a data proposta não serve à clínica.
 *
 * Sem isso o item fica parado em "data proposta" queimando SLA do QSMS, que não
 * tem como resolver sozinho — e o supervisor nunca fica sabendo que precisa
 * propor outra data.
 */
export function FormularioDevolver({ itemId }: { itemId: string }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(devolverAoSupervisor, null);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label">
        {estado.mensagem}
      </p>
    );
  }

  return (
    <details className="card">
      <summary className="cursor-pointer text-label">
        A data proposta não serve para a clínica
      </summary>

      <form action={acao} className="grid gap-3 mt-4">
        <input type="hidden" name="item_id" value={itemId} />
        <div>
          <label className="label" htmlFor="motivo">Motivo</label>
          <input
            id="motivo"
            name="motivo"
            className="field"
            required
            minLength={3}
            placeholder="Ex.: clínica sem vaga nessa semana"
          />
        </div>
        <div className="flex items-center gap-3">
          <Botao />
          {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
        </div>
      </form>
    </details>
  );
}
