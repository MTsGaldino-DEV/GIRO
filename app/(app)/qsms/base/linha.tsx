"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registrarAsoRetroativo, type Resultado } from "./acoes";
import { hojeIso } from "@/lib/dominio";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

/**
 * Uma linha da conferência da base.
 *
 * Formulário inline em vez de modal: são 177 registros para digitar em
 * sequência, e cada modal aberto e fechado é um clique a mais multiplicado
 * por 177.
 */
export function LinhaBase({
  colaboradorId,
  tipoRequisitoId,
  nome,
}: {
  colaboradorId: string;
  tipoRequisitoId: string;
  nome: string;
}) {
  const [estado, acao] = useActionState<Resultado | null, FormData>(
    registrarAsoRetroativo,
    null
  );

  if (estado?.ok) {
    return (
      <span className="text-label text-ink-muted" role="status">
        {estado.mensagem}
      </span>
    );
  }

  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="colaborador_id" value={colaboradorId} />
      <input type="hidden" name="tipo_requisito_id" value={tipoRequisitoId} />

      <label className="sr-only" htmlFor={`data-${colaboradorId}`}>
        Data do último ASO de {nome}
      </label>
      <input
        id={`data-${colaboradorId}`}
        name="data_documento"
        type="date"
        className="field w-[9.5rem]"
        max={hojeIso()}
        required
      />

      <label className="flex items-center gap-1.5 text-caption text-ink-muted whitespace-nowrap">
        <input type="checkbox" name="estimado" className="size-4" />
        estimada
      </label>

      <Botao />

      {estado && !estado.ok && (
        <span role="alert" className="text-caption w-full">
          {estado.erro}
        </span>
      )}
    </form>
  );
}
