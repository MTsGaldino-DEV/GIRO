"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registrarAusencia, type Acao } from "../../../ausencias/acoes";
import { MensagemErro } from "@/components/aviso";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Registrando…" : "Registrar ausência"}
    </button>
  );
}

/**
 * Mesma ação da tela geral de ausências, com o colaborador já fixado.
 *
 * Aqui não há seletor de pessoa: quem chega por esta página já sabe de quem
 * está falando, e um combo de 261 nomes só oferece a chance de errar a linha.
 */
export function FormularioAusenciaColaborador({ colaboradorId }: { colaboradorId: string }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarAusencia, null);

  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="colaborador_id" value={colaboradorId} />

      <div>
        <label className="label" htmlFor="tipo-ausencia">Tipo</label>
        <select id="tipo-ausencia" name="tipo" className="field" defaultValue="ferias">
          <option value="ferias">Férias</option>
          <option value="atestado">Atestado</option>
          <option value="afastamento">Afastamento</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="inicio-ausencia">Início</label>
        <input id="inicio-ausencia" name="data_inicio" type="date" className="field w-[11rem]" required />
      </div>

      <div>
        <label className="label" htmlFor="fim-ausencia">Retorno</label>
        <input id="fim-ausencia" name="data_fim" type="date" className="field w-[11rem]" />
        <p className="text-caption text-ink-faint mt-1 mb-0">Em branco = sem previsão</p>
      </div>

      <Botao />

      {estado?.ok && (
        <p role="status" className="text-label text-ink-muted w-full m-0">{estado.mensagem}</p>
      )}
      {estado && !estado.ok && (
        <div className="w-full"><MensagemErro>{estado.erro}</MensagemErro></div>
      )}
    </form>
  );
}
