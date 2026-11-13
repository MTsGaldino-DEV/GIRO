"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { devolverAoSupervisor, type Acao } from "@/app/(app)/qsms/acoes";
import { MensagemErro } from "@/components/aviso";
import { useAvisarConclusao, type AoConcluir } from "@/components/formularios-item";

function Botao({ variante }: { variante: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variante}`} disabled={pending} aria-busy={pending}>
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
 *
 * `embutido`: sem o `<details>`, para a janela aberta pelo menu da linha do
 * Radar, onde a escolha de devolver já foi feita.
 */
export function FormularioDevolver({
  itemId,
  aoConcluir,
  embutido = false,
}: {
  itemId: string;
  aoConcluir?: AoConcluir;
  embutido?: boolean;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(devolverAoSupervisor, null);
  useAvisarConclusao(estado, aoConcluir);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label">
        {estado.mensagem}
      </p>
    );
  }

  const formulario = (
    <form action={acao} className={`grid gap-3 ${embutido ? "" : "mt-4"}`}>
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
        <Botao variante={embutido ? "primary" : "secondary"} />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );

  if (embutido) return formulario;

  return (
    <details className="card">
      <summary className="cursor-pointer text-label">
        A data proposta não serve para a clínica
      </summary>
      {formulario}
    </details>
  );
}
