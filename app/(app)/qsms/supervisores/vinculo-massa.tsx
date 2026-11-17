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
  supervisor_id: string | null;
}

function Botao({ quantidade }: { quantidade: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full sm:w-auto" disabled={pending || quantidade === 0} aria-busy={pending}>
      {pending ? "Vinculando…" : `Vincular ${quantidade || ""}`.trim()}
    </button>
  );
}

/**
 * Seleção múltipla + um supervisor.
 *
 * São 261 colaboradores para distribuir entre 7 equipes. Um a um seriam 261
 * interações; por filtro de cargo, são algumas dezenas.
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
      {/* Barra de ação: no celular empilha (select e botão na largura toda). */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_auto_minmax(0,1fr)] sm:items-end mb-3">
        <div className="min-w-0">
          <label className="label" htmlFor="supervisor-destino">Vincular a</label>
          <select id="supervisor-destino" name="supervisor_id" className="field" required>
            <option value="">Escolha o supervisor</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>
        <Botao quantidade={selecionados.size} />
        <p className="text-label text-ink-muted m-0 tabular sm:text-right sm:self-center">
          {selecionados.size > 0
            ? `${selecionados.size} de ${colaboradores.length} selecionado${selecionados.size > 1 ? "s" : ""}`
            : `${colaboradores.length} colaborador${colaboradores.length > 1 ? "es" : ""} no filtro`}
        </p>
      </div>

      {estado?.ok && (
        <p role="status" className="text-label text-ink-muted mb-3">{estado.mensagem}</p>
      )}
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}

      {[...selecionados].map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div className="overflow-auto max-h-[min(560px,65vh)] rounded-[var(--radius)] border border-line px-2">
        <table className="tabela tabela--compacta">
          <caption className="sr-only">Colaboradores para vincular a um supervisor</caption>
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th scope="col" className="col-selecao">
                <input
                  type="checkbox"
                  className="size-5 align-middle"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  aria-label="Selecionar todos"
                />
              </th>
              <th scope="col">Colaborador</th>
              <th scope="col" className="hidden sm:table-cell">Matrícula</th>
              <th scope="col" className="hidden md:table-cell">Cargo</th>
              <th scope="col" className="hidden sm:table-cell">Supervisor atual</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => {
              const marcado = selecionados.has(c.id);
              const supervisorAtual = c.supervisor_id ? porId.get(c.supervisor_id) ?? "—" : null;
              return (
                <tr key={c.id}>
                  <td className="col-selecao">
                    <input
                      id={`sel-${c.id}`}
                      type="checkbox"
                      className="size-5 align-middle"
                      checked={marcado}
                      onChange={() => alternar(c.id)}
                    />
                  </td>
                  <td>
                    {/* O nome também marca a linha: alvo de toque maior no celular. */}
                    <label htmlFor={`sel-${c.id}`} className="block cursor-pointer min-w-0">
                      <span className="block">{c.nome}</span>
                      <span className="block md:hidden text-caption text-ink-faint">
                        <span className="sm:hidden tabular">{c.matricula}</span>
                        {c.cargo && <span className="sm:hidden"> · </span>}
                        {c.cargo}
                        <span className="sm:hidden">
                          {" · "}
                          {supervisorAtual ?? "Sem supervisor"}
                        </span>
                      </span>
                    </label>
                  </td>
                  <td className="hidden sm:table-cell tabular text-ink-muted">{c.matricula}</td>
                  <td className="hidden md:table-cell text-label text-ink-muted">{c.cargo ?? "—"}</td>
                  <td className="hidden sm:table-cell text-label">
                    {supervisorAtual ?? <span className="text-ink-faint">Sem supervisor</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
