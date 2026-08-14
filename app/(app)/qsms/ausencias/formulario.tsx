"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registrarAusencia, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending}>
      {pending ? "Salvando…" : "Registrar ausência"}
    </button>
  );
}

export function FormularioAusencia({
  colaboradores,
}: {
  colaboradores: { id: string; nome: string; matricula: number }[];
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarAusencia, null);

  return (
    <form action={acao} className="grid gap-3">
      <div>
        <label className="label" htmlFor="colaborador">Colaborador</label>
        <select id="colaborador" name="colaborador_id" className="field" required>
          <option value="">Escolha</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} · {c.matricula}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="tipo">Tipo</label>
        <select id="tipo" name="tipo" className="field" defaultValue="ferias">
          <option value="ferias">Férias</option>
          <option value="atestado">Atestado</option>
          <option value="afastamento">Afastamento</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="data_inicio">Início</label>
        <input id="data_inicio" name="data_inicio" type="date" className="field" required />
      </div>

      <div>
        <label className="label" htmlFor="data_fim">
          Retorno <span className="text-ink-faint">(em branco = sem previsão)</span>
        </label>
        <input id="data_fim" name="data_fim" type="date" className="field" />
      </div>

      <Botao />

      {estado?.ok && (
        <p role="status" className="text-label text-ink-muted m-0">{estado.mensagem}</p>
      )}
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
