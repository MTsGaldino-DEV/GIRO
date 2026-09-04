"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { agendarItem, type Acao } from "@/app/(app)/qsms/acoes";
import { MensagemErro } from "@/components/aviso";
import { hojeIso } from "@/lib/dominio";
import type { Clinica, ItemAberto } from "@/lib/tipos";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Salvando…" : "Confirmar agendamento"}
    </button>
  );
}

export function FormularioAgendar({
  item,
  clinicas = [],
}: {
  item: ItemAberto;
  clinicas?: Clinica[];
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(agendarItem, null);

  if (estado?.ok) {
    return (
      <p role="status" className="text-label">
        {estado.mensagem}
      </p>
    );
  }

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="clinica_id">Clínica</label>
          {/* P9 em aberto: quais clínicas atendem cada polo ainda não foi
              levantado. Por isso a lista do cadastro convive com o campo livre
              abaixo — uma lista suspensa sozinha já nasceria incompleta. */}
          <select
            id="clinica_id"
            name="clinica_id"
            className="field"
            defaultValue={item.clinica_id ?? ""}
          >
            <option value="">Outra (digitar abaixo)</option>
            {clinicas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.cidade ? ` — ${c.cidade}` : ""}
              </option>
            ))}
          </select>
          <input
            id="clinica"
            name="clinica"
            className="field mt-2"
            defaultValue={item.clinica ?? ""}
            placeholder="Nome da clínica, se não estiver na lista"
          />
        </div>

        <div>
          <label className="label" htmlFor="medico">Médico</label>
          <input id="medico" name="medico" className="field" defaultValue={item.medico ?? ""} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="endereco">Endereço</label>
        <input
          id="endereco"
          name="endereco"
          className="field"
          defaultValue={item.endereco ?? ""}
          placeholder="Rua, número, bairro — vai no e-mail do supervisor"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="data_agendada">Data do exame</label>
          <input
            id="data_agendada"
            name="data_agendada"
            type="date"
            className="field"
            required
            min={hojeIso()}
            defaultValue={item.data_liberacao_proposta ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="hora_agendada">Hora</label>
          <input id="hora_agendada" name="hora_agendada" type="time" className="field" required />
        </div>
      </div>

      <label className="flex items-center gap-2 text-label">
        <input
          type="checkbox"
          name="psicossocial"
          className="size-4"
          defaultChecked={item.avaliacao_psicossocial}
        />
        Inclui avaliação psicossocial
      </label>

      <div>
        <label className="label" htmlFor="observacao">Observação</label>
        <input
          id="observacao"
          name="observacao"
          className="field"
          placeholder="Opcional — fica no histórico"
        />
      </div>

      <div className="flex items-center gap-3">
        <Botao />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}
