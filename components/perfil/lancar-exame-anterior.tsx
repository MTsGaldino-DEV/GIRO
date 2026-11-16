"use client";

import { startTransition, useActionState, useEffect, useId, useRef } from "react";
import { registrarAsoRetroativo, type Acao } from "@/app/(app)/qsms/colaborador/[id]/aso/acoes";
import { MensagemErro } from "@/components/aviso";
import { Info } from "@/components/info";
import { hojeIso } from "@/lib/dominio";

export interface RequisitoLancavel {
  id: string;
  nome: string;
}

// Os mesmos limites de `enviarDocumentoAso` (lib/storage.ts) e do bucket asos.
const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

/**
 * Lançamento de um exame anterior (ASO ou AVP) no perfil do colaborador.
 *
 * Substitui a antiga tela "Conferência da base": o mesmo evento retroativo,
 * agora já ligado à pessoa do perfil, sem escolher colaborador. A regra (data
 * do documento, vencimento, item aberto) continua em fn_registrar_aso_retroativo.
 *
 * O ASO é obrigatório (decisão de 16/11; o banco também recusa sem ele, 0021):
 * um exame apto sem documento tiraria a pessoa de "sem registro" sem prova.
 *
 * Envio pelo `onSubmit`, não pelo `action` do form, como em Registrar
 * resultado: o `action` limpa o formulário ao terminar, e um erro do servidor
 * faria a pessoa escolher o arquivo de novo. Só o sucesso limpa.
 */
export function LancarExameAnterior({
  colaboradorId,
  requisitos,
  aoRegistrar,
}: {
  colaboradorId: string;
  requisitos: RequisitoLancavel[];
  /** Recarrega o que depende do exame: histórico e cabeçalho do painel. */
  aoRegistrar?: () => void;
}) {
  const id = useId();
  const [estado, acao, pendente] = useActionState<Acao | null, FormData>(registrarAsoRetroativo, null);
  const formulario = useRef<HTMLFormElement>(null);
  const ultimoTratado = useRef<Acao | null>(null);

  useEffect(() => {
    if (!estado || estado === ultimoTratado.current) return;
    ultimoTratado.current = estado;
    if (estado.ok) {
      formulario.current?.reset();
      aoRegistrar?.();
    }
  }, [estado, aoRegistrar]);

  if (requisitos.length === 0) return null;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => acao(dados));
  }

  function conferirArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const campo = evento.currentTarget;
    const arquivo = campo.files?.[0];
    let problema = "";
    if (arquivo && !TIPOS_ACEITOS.includes(arquivo.type)) {
      problema = "Formato não aceito. Envie PDF, JPG ou PNG.";
    } else if (arquivo && arquivo.size > TAMANHO_MAXIMO) {
      problema = "O arquivo passa de 8 MB. Reduza a resolução da digitalização.";
    }
    campo.setCustomValidity(problema);
    if (problema) campo.reportValidity();
  }

  return (
    <div className="card">
      <h3 className="mb-1 inline-flex items-center gap-2">
        Lançar exame anterior
        <Info>
          Use para um exame que já existe em papel ou no sistema da clínica. Anexe o
          ASO: sem o documento, o exame não é lançado. Ele vira um evento retroativo
          com resultado apto, recalcula o vencimento e tira a pessoa de “sem registro”.
        </Info>
      </h3>

      <form ref={formulario} onSubmit={enviar} className="flex flex-wrap items-end gap-3 mt-3" aria-busy={pendente}>
        <input type="hidden" name="colaborador_id" value={colaboradorId} />

        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor={`${id}-requisito`}>Requisito</label>
          <select
            id={`${id}-requisito`}
            name="tipo_requisito_id"
            className="field"
            defaultValue={requisitos[0].id}
            required
          >
            {requisitos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor={`${id}-data`}>Data do documento</label>
          <input
            id={`${id}-data`}
            name="data_documento"
            type="date"
            className="field w-[11rem]"
            min="2000-01-01"
            max={hojeIso()}
            required
          />
        </div>

        <label className="flex items-center gap-2 text-label h-[42px]">
          <input type="checkbox" name="estimado" className="size-4" />
          Data estimada
        </label>

        <div className="min-w-[14rem] flex-[2]">
          <label className="label" htmlFor={`${id}-documento`}>Arquivo do ASO</label>
          <input
            id={`${id}-documento`}
            name="documento"
            type="file"
            className="field"
            required
            accept="application/pdf,image/jpeg,image/png"
            aria-describedby={`${id}-ajuda-documento`}
            onChange={conferirArquivo}
          />
          <p id={`${id}-ajuda-documento`} className="text-caption text-ink-faint mt-1 mb-0">
            Obrigatório. PDF, JPG ou PNG, até 8 MB.
          </p>
        </div>

        <div className="min-w-[14rem] flex-[2]">
          <label className="label" htmlFor={`${id}-obs`}>Observação (opcional)</label>
          <input
            id={`${id}-obs`}
            name="observacoes"
            type="text"
            className="field"
            maxLength={500}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn--primary" disabled={pendente} aria-busy={pendente}>
          {pendente ? "Salvando…" : "Lançar"}
        </button>
      </form>

      <div role="status" aria-live="polite">
        {estado?.ok && (
          <p className="text-label mt-3 mb-0">
            {estado.mensagem} O vencimento foi recalculado a partir desta data.
          </p>
        )}
      </div>
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </div>
  );
}
