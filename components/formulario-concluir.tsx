"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { concluirItem, type Acao } from "@/app/(app)/qsms/acoes";
import { MensagemErro, Aviso } from "@/components/aviso";
import { hojeIso } from "@/lib/dominio";
import type { ItemAberto } from "@/lib/tipos";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Registrando…" : "Registrar e concluir"}
    </button>
  );
}

export function FormularioConcluir({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(concluirItem, null);
  const [resultado, setResultado] = useState("apto");

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
          <label className="label" htmlFor="data_documento">
            Data do documento
          </label>
          <input
            id="data_documento"
            name="data_documento"
            type="date"
            className="field"
            required
            max={hojeIso()}
            aria-describedby="ajuda-data-documento"
          />
          <p id="ajuda-data-documento" className="text-caption text-ink-faint mt-1">
            Data de emissão do ASO. Serve de recuo se a de realização faltar.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="data_realizado">
            Data de realização do exame
          </label>
          <input
            id="data_realizado"
            name="data_realizado"
            type="date"
            className="field"
            required
            max={hojeIso()}
            defaultValue={item.data_agendada ?? ""}
            aria-describedby="ajuda-data-realizado"
          />
          <p id="ajuda-data-realizado" className="text-caption text-ink-faint mt-1">
            É esta data, lida dentro do PDF, que reinicia o ciclo de 12 meses.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="resultado">Resultado</label>
          <select
            id="resultado"
            name="resultado"
            className="field"
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
          >
            <option value="apto">Apto</option>
            <option value="apto_com_restricao">Apto com restrição</option>
            <option value="inapto">Inapto</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="medico-conclusao">Médico</label>
          <input
            id="medico-conclusao"
            name="medico"
            className="field"
            defaultValue={item.medico ?? ""}
          />
        </div>
      </div>

      {resultado === "inapto" && (
        <Aviso tom="forte" titulo="Inapto trava o processo">
          O item não é encerrado: entra em tratativa de inapto e fica lá até
          alguém resolver o caso explicitamente. A validade não é atualizada,
          nenhum ciclo novo é aberto, e o colaborador segue aparecendo como
          vencido ou sem registro.
        </Aviso>
      )}

      <div>
        <label className="label" htmlFor="documento">Documento do ASO</label>
        <input
          id="documento"
          name="documento"
          type="file"
          className="field"
          accept="application/pdf,image/jpeg,image/png"
          aria-describedby="ajuda-documento"
        />
        <p id="ajuda-documento" className="text-caption text-ink-faint mt-1">
          PDF, JPG ou PNG, até 8 MB. Fica em armazenamento privado — o acesso é
          por link temporário.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="observacoes">Observações</label>
        <textarea id="observacoes" name="observacoes" className="field" rows={2} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}
