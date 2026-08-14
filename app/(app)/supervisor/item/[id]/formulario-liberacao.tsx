"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { informarDataLiberacao, type Acao } from "../../acoes";
import { MensagemErro } from "@/components/aviso";
import { hojeIso } from "@/lib/dominio";
import type { ItemAberto } from "@/lib/tipos";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full sm:w-auto" disabled={pending}>
      {pending ? "Enviando…" : "Enviar data"}
    </button>
  );
}

export function FormularioLiberacao({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(informarDataLiberacao, null);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label">
        {estado.mensagem}
      </p>
    );
  }

  // Limite superior é o vencimento: propor data depois disso é agendar para
  // depois do ASO já ter vencido.
  const limite = item.data_vencimento ?? undefined;

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />

      <div>
        <label className="label" htmlFor="data">Data de liberação</label>
        <input
          id="data"
          name="data"
          type="date"
          className="field"
          required
          min={hojeIso()}
          max={limite}
        />
      </div>

      <div>
        <label className="label" htmlFor="observacao">
          Observação <span className="text-ink-faint">(opcional)</span>
        </label>
        <input
          id="observacao"
          name="observacao"
          className="field"
          placeholder="Ex.: só de manhã, à tarde tem serviço em Mantena"
        />
      </div>

      <div>
        <Botao />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}
