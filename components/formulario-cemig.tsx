"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registrarComunicacaoCemig, type Acao } from "@/app/(app)/qsms/acoes";
import { MensagemErro } from "@/components/aviso";
import { formatarData, hojeIso } from "@/lib/dominio";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--secondary" disabled={pending}>
      {pending ? "Salvando…" : "Registrar"}
    </button>
  );
}

/**
 * Comunicação à CEMIG. Campo opcional que não bloqueia o fluxo (plano, regra 4).
 * P11 em aberto: prazo, formato e se existe protocolo que valha guardar.
 */
export function FormularioCemig({ itemId, atual }: { itemId: string; atual: string | null }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarComunicacaoCemig, null);

  return (
    <div className="card">
      <h2 className="text-[1.0625rem] mb-1">Comunicação à CEMIG</h2>
      <p className="text-ink-muted text-label mb-4">
        {atual
          ? `Comunicado em ${formatarData(atual)}.`
          : "Ainda não comunicado. Não bloqueia o fluxo."}
      </p>

      <form action={acao} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="item_id" value={itemId} />
        <div>
          <label className="label" htmlFor="data-cemig">Data da comunicação</label>
          <input
            id="data-cemig"
            name="data"
            type="date"
            className="field w-[10rem]"
            required
            max={hojeIso()}
            defaultValue={atual ?? hojeIso()}
          />
        </div>
        <Botao />
        {estado?.ok && (
          <span role="status" className="text-label text-ink-muted">
            {estado.mensagem}
          </span>
        )}
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </form>
    </div>
  );
}
