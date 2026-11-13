"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { corrigirDataExame, type Acao } from "@/app/(app)/qsms/colaborador/[id]/aso/acoes";
import { MensagemErro } from "@/components/aviso";
import { IconeConfere, IconeFechar, IconeLapis } from "@/components/icones";
import { formatarData, hojeIso } from "@/lib/dominio";

function BotaoConfirmar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--primary btn--icone"
      disabled={pending}
      aria-busy={pending}
      aria-label="Salvar data"
      title="Salvar"
    >
      <IconeConfere />
    </button>
  );
}

/**
 * Uma data de exame na tabela "Exames realizados", com lápis para qualquer operador.
 *
 * Mesmo gesto do `CampoEditavel` do cadastro: o lápis troca o valor por uma
 * entrada, Enter ou ✓ grava, Esc ou ✕ desiste. Fica num componente à parte
 * porque escreve em `eventos_requisito`, não em `colaboradores`, e a correção
 * de um exame reposiciona o ciclo aberto — outra Server Action, outra regra.
 *
 * Quem barra é `exigirOperador()` na ação.
 */
export function DataExameEditavel({
  eventoId,
  campo,
  valor,
  origem = "Perfil do Colaborador",
  aoSalvar,
}: {
  eventoId: string;
  campo: "data_documento" | "data_realizado";
  valor: string | null;
  origem?: string;
  aoSalvar?: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [estado, acao] = useActionState<Acao | null, FormData>(corrigirDataExame, null);

  // Ver CampoEditavel: sem guardar o último resultado tratado, o efeito fecharia
  // a edição a cada render do pai.
  const ultimoTratado = useRef<Acao | null>(null);

  useEffect(() => {
    if (!estado || estado === ultimoTratado.current) return;
    ultimoTratado.current = estado;
    if (estado.ok) {
      setEditando(false);
      aoSalvar?.();
    }
  }, [estado, aoSalvar]);

  const rotulo = campo === "data_documento" ? "data do documento" : "data de realização";

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={valor ? "" : "text-ink-faint"}>{formatarData(valor)}</span>
        <button
          type="button"
          className="btn btn--fantasma btn--icone"
          onClick={() => setEditando(true)}
          aria-label={`Corrigir ${rotulo}`}
          title={`Corrigir ${rotulo}`}
        >
          <IconeLapis />
        </button>
      </span>
    );
  }

  return (
    <form
      action={acao}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditando(false);
      }}
    >
      <input type="hidden" name="evento_id" value={eventoId} />
      <input type="hidden" name="campo" value={campo} />
      <input type="hidden" name="origem" value={origem} />
      <div className="flex items-center gap-1.5">
        <input
          name="valor"
          type="date"
          className="field"
          defaultValue={valor ?? ""}
          max={hojeIso()}
          autoFocus
          aria-label={rotulo}
        />
        <BotaoConfirmar />
        <button
          type="button"
          className="btn btn--fantasma btn--icone"
          onClick={() => setEditando(false)}
          aria-label="Cancelar correção"
          title="Cancelar"
        >
          <IconeFechar />
        </button>
      </div>
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
