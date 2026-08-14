"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { vincularEmMassa, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";
import type { Supervisor } from "@/lib/tipos";

interface ColaboradorSimples {
  id: string;
  matricula: number;
  nome: string;
  cargo: string | null;
  polo: string | null;
  supervisor_id: string | null;
}

function Botao({ quantidade }: { quantidade: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending || quantidade === 0}>
      {pending ? "Vinculando…" : `Vincular ${quantidade || ""}`.trim()}
    </button>
  );
}

/**
 * Seleção múltipla + um supervisor.
 *
 * São 261 colaboradores para distribuir entre 7 equipes. Um a um seriam 261
 * interações; por filtro de cargo ou polo, são algumas dezenas.
 */
export function VinculoEmMassa({
  colaboradores,
  supervisores,
}: {
  colaboradores: ColaboradorSimples[];
  supervisores: Supervisor[];
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(vincularEmMassa, null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const todosMarcados = colaboradores.length > 0 && selecionados.size === colaboradores.length;

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(colaboradores.map((c) => c.id)));
  }

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const porId = new Map(supervisores.map((s) => [s.id, s.nome]));

  return (
    <form action={acao}>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="min-w-[200px]">
          <label className="label" htmlFor="supervisor-destino">Vincular a</label>
          <select id="supervisor-destino" name="supervisor_id" className="field" required>
            <option value="">Escolha o supervisor</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>
        <Botao quantidade={selecionados.size} />
        {estado?.ok && (
          <span role="status" className="text-label text-ink-muted">{estado.mensagem}</span>
        )}
      </div>

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}

      {[...selecionados].map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-line rounded-[var(--radius)]">
        <table className="tabela">
          <caption className="sr-only">Colaboradores para vincular a um supervisor</caption>
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th scope="col" className="w-10">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  aria-label="Selecionar todos"
                />
              </th>
              <th scope="col">Matrícula</th>
              <th scope="col">Colaborador</th>
              <th scope="col">Cargo</th>
              <th scope="col">Supervisor atual</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => (
              <tr key={c.id}>
                <td>
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selecionados.has(c.id)}
                    onChange={() => alternar(c.id)}
                    aria-label={`Selecionar ${c.nome}`}
                  />
                </td>
                <td className="tabular text-ink-muted">{c.matricula}</td>
                <td>{c.nome}</td>
                <td className="text-label text-ink-muted">{c.cargo ?? "—"}</td>
                <td className="text-label">
                  {c.supervisor_id ? (
                    porId.get(c.supervisor_id) ?? "—"
                  ) : (
                    <span className="text-ink-faint">Sem supervisor</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
