"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registrarAsoRetroativo, type Resultado } from "../../../base/acoes";
import { MensagemErro } from "@/components/aviso";
import { hojeIso } from "@/lib/dominio";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Salvando…" : "Registrar"}
    </button>
  );
}

/**
 * Mesma ação da conferência da base, em formato de bloco.
 *
 * A regra continua em fn_registrar_aso_retroativo; aqui muda só o formato: na
 * base é uma linha por colaborador para digitar 177 em sequência, aqui é um
 * caso só e cabe respirar.
 */
export function FormularioRetroativo({
  colaboradorId,
  tipoRequisitoId,
}: {
  colaboradorId: string;
  tipoRequisitoId: string;
}) {
  const [estado, acao] = useActionState<Resultado | null, FormData>(registrarAsoRetroativo, null);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label m-0">
        {estado.mensagem} O vencimento foi recalculado a partir desta data.
      </p>
    );
  }

  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="colaborador_id" value={colaboradorId} />
      <input type="hidden" name="tipo_requisito_id" value={tipoRequisitoId} />

      <div>
        <label className="label" htmlFor="data-retroativa">Data do documento</label>
        <input
          id="data-retroativa"
          name="data_documento"
          type="date"
          className="field w-[11rem]"
          max={hojeIso()}
          required
        />
      </div>

      <label className="flex items-center gap-2 text-label h-[42px]">
        <input type="checkbox" name="estimado" className="size-4" />
        Data estimada
      </label>

      <Botao />

      {estado && !estado.ok && (
        <div className="w-full">
          <MensagemErro>{estado.erro}</MensagemErro>
        </div>
      )}
    </form>
  );
}
