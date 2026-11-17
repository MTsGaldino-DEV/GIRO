"use client";

import { useState, useTransition } from "react";
import { vincularNomeSupervisor } from "@/app/(app)/colaboradores/acoes-neo";
import { MensagemErro } from "@/components/aviso";
import type { NomeSemVinculo } from "@/lib/estado-neo";
import type { Supervisor } from "@/lib/tipos";

/**
 * Nomes de supervisor que a NEO escreve e o GIRO ainda não reconhece.
 *
 * Aparecem da última sincronização: quem digitou "Joao S." na NEO não casa com
 * "João da Silva" daqui. O QSMS escolhe o supervisor certo uma vez e o vínculo vale
 * para sempre (inclusive para quem escrever igual depois).
 */
export function NomesNeoSemVinculo({
  nomes,
  supervisores,
}: {
  nomes: NomeSemVinculo[];
  supervisores: Supervisor[];
}) {
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const [emAcao, setEmAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function vincular(texto: string) {
    const supervisorId = escolhas[texto];
    if (!supervisorId) {
      setAviso({ ok: false, texto: "Escolha o supervisor antes de vincular." });
      return;
    }
    setAviso(null);
    setEmAcao(texto);
    iniciar(async () => {
      const r = await vincularNomeSupervisor(texto, supervisorId);
      setAviso({ ok: r.ok, texto: r.ok ? r.mensagem : r.erro });
      setEmAcao(null);
    });
  }

  if (nomes.length === 0) return null;

  return (
    <div className="card">
      <h2 className="text-[1.0625rem] mb-1">Nomes da NEO sem supervisor</h2>
      <p className="text-ink-muted text-label mb-4">
        Estes supervisores aparecem na NEO com uma grafia que o GIRO não reconhece. Escolha quem
        é cada um; o vínculo fica guardado para as próximas atualizações.
      </p>
      <ul className="list-none p-0 m-0 grid gap-3">
        {nomes.map((n, i) => (
          <li
            key={n.texto}
            className="grid gap-2 sm:gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)_auto] sm:items-center pb-3 border-b border-line last:border-0 last:pb-0"
          >
            <span className="min-w-0">
              <span className="block font-medium break-words">{n.texto}</span>
              <span className="block text-caption text-ink-faint tabular">
                {n.quantidade} {n.quantidade === 1 ? "pessoa" : "pessoas"}
              </span>
            </span>
            <label className="sr-only" htmlFor={`sup-${i}`}>
              Supervisor para {n.texto}
            </label>
            <select
              id={`sup-${i}`}
              className="field"
              value={escolhas[n.texto] ?? ""}
              onChange={(e) => setEscolhas((a) => ({ ...a, [n.texto]: e.target.value }))}
            >
              <option value="">Escolha o supervisor</option>
              {supervisores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--secondary w-full sm:w-auto"
              onClick={() => vincular(n.texto)}
              disabled={pendente}
              aria-busy={pendente && emAcao === n.texto}
            >
              {pendente && emAcao === n.texto ? "Vinculando…" : "Vincular"}
            </button>
          </li>
        ))}
      </ul>
      {aviso && (aviso.ok ? (
        <p role="status" className="text-label mt-3 mb-0">{aviso.texto}</p>
      ) : (
        <MensagemErro>{aviso.texto}</MensagemErro>
      ))}
    </div>
  );
}
