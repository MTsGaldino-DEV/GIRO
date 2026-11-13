"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { registrarAsoRetroativo, type Acao } from "@/app/(app)/qsms/colaborador/[id]/aso/acoes";
import { MensagemErro } from "@/components/aviso";
import { Info } from "@/components/info";
import { hojeIso } from "@/lib/dominio";

export interface RequisitoLancavel {
  id: string;
  nome: string;
}

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending}>
      {pending ? "Salvando…" : "Lançar"}
    </button>
  );
}

/**
 * Lançamento de um exame anterior (ASO ou AVP) no perfil do colaborador.
 *
 * Substitui a antiga tela "Conferência da base": o mesmo evento retroativo,
 * agora já ligado à pessoa do perfil, sem escolher colaborador. A regra (data
 * do documento, vencimento, item aberto) continua em fn_registrar_aso_retroativo.
 */
export function LancarExameAnterior({
  colaboradorId,
  requisitos,
  aoRegistrar,
}: {
  colaboradorId: string;
  requisitos: RequisitoLancavel[];
  /** Recarrega o que depende do exame: histórico e cabeçalho do painel. */
  aoRegistrar?: () => void;
}) {
  const id = useId();
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarAsoRetroativo, null);
  const formulario = useRef<HTMLFormElement>(null);
  const ultimoTratado = useRef<Acao | null>(null);

  useEffect(() => {
    if (!estado || estado === ultimoTratado.current) return;
    ultimoTratado.current = estado;
    if (estado.ok) {
      formulario.current?.reset();
      aoRegistrar?.();
    }
  }, [estado, aoRegistrar]);

  if (requisitos.length === 0) return null;

  return (
    <div className="card">
      <h3 className="mb-1 inline-flex items-center gap-2">
        Lançar exame anterior
        <Info>
          Use para um exame que já existe em papel ou no sistema da clínica. Ele vira
          um evento retroativo com resultado apto, recalcula o vencimento e tira a
          pessoa de “sem registro”.
        </Info>
      </h3>

      <form ref={formulario} action={acao} className="flex flex-wrap items-end gap-3 mt-3">
        <input type="hidden" name="colaborador_id" value={colaboradorId} />

        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor={`${id}-requisito`}>Requisito</label>
          <select
            id={`${id}-requisito`}
            name="tipo_requisito_id"
            className="field"
            defaultValue={requisitos[0].id}
            required
          >
            {requisitos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor={`${id}-data`}>Data do documento</label>
          <input
            id={`${id}-data`}
            name="data_documento"
            type="date"
            className="field w-[11rem]"
            min="2000-01-01"
            max={hojeIso()}
            required
          />
        </div>

        <label className="flex items-center gap-2 text-label h-[42px]">
          <input type="checkbox" name="estimado" className="size-4" />
          Data estimada
        </label>

        <div className="min-w-[14rem] flex-[2]">
          <label className="label" htmlFor={`${id}-obs`}>Observação (opcional)</label>
          <input
            id={`${id}-obs`}
            name="observacoes"
            type="text"
            className="field"
            maxLength={500}
            autoComplete="off"
          />
        </div>

        <Botao />
      </form>

      <div role="status" aria-live="polite">
        {estado?.ok && (
          <p className="text-label mt-3 mb-0">
            {estado.mensagem} O vencimento foi recalculado a partir desta data.
          </p>
        )}
      </div>
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </div>
  );
}
