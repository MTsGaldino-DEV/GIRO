"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { registrarComparecimento, type Acao } from "../../acoes";
import { MensagemErro } from "@/components/aviso";

function Botao({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending}>
      {pending ? "Registrando…" : rotulo}
    </button>
  );
}

/**
 * Compareceu / faltou.
 *
 * Dois botões neutros, não um verde e um vermelho: essas cores pertencem ao
 * semáforo de conformidade. Aqui a distinção é feita pelo texto e pela ordem.
 */
export function FormularioComparecimento({ itemId }: { itemId: string }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarComparecimento, null);
  const [escolha, setEscolha] = useState<"sim" | "nao" | null>(null);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label">
        {estado.mensagem}
      </p>
    );
  }

  if (escolha === null) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn btn--primary" onClick={() => setEscolha("sim")}>
          Compareceu
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setEscolha("nao")}>
          Faltou
        </button>
      </div>
    );
  }

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="compareceu" value={escolha} />

      <p className="text-label m-0">
        {escolha === "sim"
          ? "Confirmando que o colaborador fez o exame. O QSMS passa a cobrar o documento da clínica."
          : "Registrando falta. O item volta para você informar uma nova data de liberação."}
      </p>

      <div>
        <label className="label" htmlFor="observacao-presenca">
          Observação {escolha === "nao" && <span className="text-ink-faint">(o que houve?)</span>}
        </label>
        <input
          id="observacao-presenca"
          name="observacao"
          className="field"
          placeholder={escolha === "nao" ? "Ex.: chamado de emergência em Aimorés" : "Opcional"}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Botao rotulo={escolha === "sim" ? "Confirmar presença" : "Confirmar falta"} />
        <button type="button" className="btn btn--secondary" onClick={() => setEscolha(null)}>
          Voltar
        </button>
      </div>

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
