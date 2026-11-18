"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registrarComparecimento, type Acao } from "@/app/(app)/supervisor/acoes";
import { MensagemErro } from "@/components/aviso";
import { useAvisarConclusao, type AoConcluir } from "@/components/formularios-item";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Registrando…" : "Confirmar falta"}
    </button>
  );
}

/**
 * Registrar falta: o "Registrar falta" do menu da linha do Radar e da ficha do
 * item (etapa Agendado).
 *
 * Só a falta. O antigo "Compareceu" levava o item para `aguardando_documento`
 * sem documento; desde 0021 o banco o recusa (fn_registrar_comparecimento só
 * aceita a falta). Quem foi ao exame segue por
 * "Registrar resultado", com o ASO anexado.
 */
export function FormularioComparecimento({
  itemId,
  aoConcluir,
}: {
  itemId: string;
  aoConcluir?: AoConcluir;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarComparecimento, null);
  useAvisarConclusao(estado, aoConcluir);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label">
        {estado.mensagem}
      </p>
    );
  }

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={itemId} />

      <p className="text-label m-0">
        O item volta à supervisão para informar uma nova data de liberação.
      </p>

      <div>
        <label className="label" htmlFor="observacao-presenca">
          Observação <span className="text-ink-faint">(o que houve?)</span>
        </label>
        <input
          id="observacao-presenca"
          name="observacao"
          className="field"
          placeholder="Ex.: chamado de emergência em Aimorés"
        />
      </div>

      <Botao />

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
