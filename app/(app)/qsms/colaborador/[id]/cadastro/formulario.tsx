"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { salvarCadastro, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";
import { SITUACAO_ROTULO } from "@/lib/dominio";
import type { Situacao, Supervisor } from "@/lib/tipos";

const SITUACOES: Situacao[] = [
  "trabalhando",
  "ferias",
  "auxilio_doenca",
  "atestado",
  "afastamento",
  "outro",
];

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Salvando…" : "Salvar alterações"}
    </button>
  );
}

export function FormularioCadastro({
  colaborador,
  supervisores,
}: {
  colaborador: {
    id: string;
    cargo: string | null;
    polo: string | null;
    local: string | null;
    situacao: string;
    supervisor_id: string | null;
  };
  supervisores: Supervisor[];
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(salvarCadastro, null);

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="id" value={colaborador.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cargo">Cargo</label>
          <input id="cargo" name="cargo" className="field" defaultValue={colaborador.cargo ?? ""} />
        </div>

        <div>
          <label className="label" htmlFor="polo">Polo</label>
          <input id="polo" name="polo" className="field" defaultValue={colaborador.polo ?? ""} />
        </div>

        <div>
          <label className="label" htmlFor="local">Local</label>
          <input id="local" name="local" className="field" defaultValue={colaborador.local ?? ""} />
        </div>

        <div>
          <label className="label" htmlFor="situacao">Situação</label>
          <select
            id="situacao"
            name="situacao"
            className="field"
            defaultValue={colaborador.situacao}
          >
            {SITUACOES.map((s) => (
              <option key={s} value={s}>{SITUACAO_ROTULO[s]}</option>
            ))}
          </select>
          <p className="text-caption text-ink-faint mt-1 mb-0">
            Qualquer situação diferente de &ldquo;Trabalhando&rdquo; bloqueia agendamento.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="supervisor">Supervisor</label>
          <select
            id="supervisor"
            name="supervisor_id"
            className="field"
            defaultValue={colaborador.supervisor_id ?? ""}
          >
            <option value="">Sem supervisor</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <p className="text-caption text-ink-faint mt-1 mb-0">
            Sem supervisor, o colaborador não entra em nenhum e-mail semanal —
            ninguém é cobrado por ele.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao />
        {estado?.ok && (
          <span role="status" className="text-label text-ink-muted">{estado.mensagem}</span>
        )}
      </div>

      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
