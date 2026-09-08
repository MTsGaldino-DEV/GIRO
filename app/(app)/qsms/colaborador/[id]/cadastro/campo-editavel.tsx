"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarCampo, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";
import { IconeConfere, IconeFechar, IconeLapis } from "@/components/icones";
import { formatarData } from "@/lib/dominio";
import { CAMPOS_COLABORADOR, type CampoColaborador } from "@/lib/campos-colaborador";

export interface Opcao {
  valor: string;
  rotulo: string;
}

function BotaoConfirmar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--primary btn--icone"
      disabled={pending}
      aria-label={`Salvar ${rotulo}`}
      title="Salvar"
    >
      <IconeConfere />
    </button>
  );
}

/**
 * Um campo do cadastro, com lápis.
 *
 * Em repouso é só rótulo e valor. O lápis abre uma entrada no lugar do valor;
 * Enter ou ✓ grava aquele campo sozinho, Esc ou ✕ desiste. Não há botão de
 * salvar no fim de um formulário porque não há formulário: cada campo é uma
 * alteração independente, e é assim que ela chega à trilha.
 *
 * `editavel` só decide se o lápis aparece. Quem barra de verdade é a Server
 * Action, que confere o papel contra a lista fechada de campos — abrir o
 * DevTools e submeter à mão dá no mesmo "não autorizado".
 */
export function CampoEditavel({
  colaboradorId,
  campo,
  valor,
  opcoes,
  editavel,
  origem = "Cadastro do colaborador",
  aoSalvar,
}: {
  colaboradorId: string;
  campo: CampoColaborador;
  valor: string | number | null;
  /** Obrigatório quando o campo é do tipo select. */
  opcoes?: Opcao[];
  editavel: boolean;
  origem?: string;
  aoSalvar?: () => void;
}) {
  const definicao = CAMPOS_COLABORADOR[campo];
  const [editando, setEditando] = useState(false);
  const [estado, acao] = useActionState<Acao | null, FormData>(salvarCampo, null);

  // `useActionState` guarda o último resultado depois que a edição fecha. Sem
  // comparar a identidade do objeto, o efeito reexecutaria a cada render do pai
  // e fecharia o campo no instante em que ele fosse reaberto.
  const ultimoTratado = useRef<Acao | null>(null);

  useEffect(() => {
    if (!estado || estado === ultimoTratado.current) return;
    ultimoTratado.current = estado;
    if (estado.ok) {
      setEditando(false);
      aoSalvar?.();
    }
  }, [estado, aoSalvar]);

  const bruto = valor === null || valor === undefined ? "" : String(valor);
  const exibicao =
    definicao.tipo === "data"
      ? formatarData(bruto || null)
      : definicao.tipo === "select"
        ? (opcoes?.find((o) => o.valor === bruto)?.rotulo ?? "—")
        : bruto || "—";

  return (
    <div>
      <div className="text-caption text-ink-faint uppercase tracking-[0.04em]">
        {definicao.rotulo}
      </div>

      {editando ? (
        <form
          action={acao}
          className="mt-1"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditando(false);
          }}
        >
          <input type="hidden" name="colaborador_id" value={colaboradorId} />
          <input type="hidden" name="campo" value={campo} />
          <input type="hidden" name="origem" value={origem} />

          <div className="flex items-center gap-1.5">
            {definicao.tipo === "select" ? (
              <select name="valor" className="field" defaultValue={bruto} autoFocus>
                {opcoes?.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="valor"
                className="field"
                defaultValue={bruto}
                autoFocus
                type={
                  definicao.tipo === "data"
                    ? "date"
                    : definicao.tipo === "numero"
                      ? "number"
                      : "text"
                }
                inputMode={campo === "cpf" ? "numeric" : undefined}
                aria-label={definicao.rotulo}
              />
            )}
            <BotaoConfirmar rotulo={definicao.rotulo} />
            <button
              type="button"
              className="btn btn--fantasma btn--icone"
              onClick={() => setEditando(false)}
              aria-label={`Cancelar edição de ${definicao.rotulo}`}
              title="Cancelar"
            >
              <IconeFechar />
            </button>
          </div>

          {definicao.ajuda && (
            <p className="text-caption text-ink-faint mt-1 mb-0 max-w-[46ch]">{definicao.ajuda}</p>
          )}
          {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
        </form>
      ) : (
        <div className="flex items-center gap-1 min-h-[34px]">
          <span className={`text-label break-words ${bruto ? "" : "text-ink-faint"}`}>
            {exibicao}
          </span>
          {editavel && (
            <button
              type="button"
              className="btn btn--fantasma btn--icone"
              onClick={() => setEditando(true)}
              aria-label={`Editar ${definicao.rotulo}`}
              title={`Editar ${definicao.rotulo}`}
            >
              <IconeLapis />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
