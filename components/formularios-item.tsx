"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  solicitarData,
  registrarDataSupervisor,
  informarDados,
  enviarAClinica,
  registrarDesfecho,
  encerrarInapto,
  cancelarItem,
  type Acao,
} from "@/app/(app)/qsms/acoes";
import { MensagemErro, Aviso } from "@/components/aviso";
import { DESFECHO_ROTULO, DESFECHO_CONSEQUENCIA, hojeIso } from "@/lib/dominio";
import type { Desfecho, ItemAberto } from "@/lib/tipos";

/**
 * Formulários das etapas introduzidas na Fase 1.
 *
 * Um arquivo só porque são todos a mesma coisa — um POST curto que move o
 * processo um passo — e sete arquivos de vinte linhas custam mais para achar
 * do que para ler.
 */

function Botao({ rotulo, ocupado, variante = "primary" }: {
  rotulo: string;
  ocupado: string;
  variante?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variante}`} disabled={pending}>
      {pending ? ocupado : rotulo}
    </button>
  );
}

/** Sucesso vira texto: o item já mudou de etapa e o formulário não serve mais. */
function Concluido({ mensagem }: { mensagem: string }) {
  return (
    <p role="status" className="text-label m-0">
      {mensagem}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Passo 2 · solicitar a data ao supervisor
// ---------------------------------------------------------------------------

export function FormularioSolicitarData({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(solicitarData, null);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="canal">Como foi solicitado</label>
          <select id="canal" name="canal" className="field" defaultValue="e-mail">
            <option value="e-mail">E-mail</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="telefone">Telefone</option>
            <option value="pessoalmente">Pessoalmente</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="observacao-solicitar">Observação</label>
          <input
            id="observacao-solicitar"
            name="observacao"
            className="field"
            placeholder="Opcional — fica no histórico"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao rotulo="Registrar solicitação" ocupado="Registrando…" />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Passo 3 · registrar a data proposta pelo supervisor
// ---------------------------------------------------------------------------

export function FormularioDataSupervisor({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarDataSupervisor, null);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="data-liberacao">Data de liberação</label>
          <input
            id="data-liberacao"
            name="data"
            type="date"
            className="field"
            required
            min={hojeIso()}
          />
        </div>
        <div>
          <label className="label" htmlFor="em-nome-de">Proposta por</label>
          <input
            id="em-nome-de"
            name="em_nome_de"
            className="field"
            required
            minLength={2}
            defaultValue={item.supervisor_nome ?? ""}
            aria-describedby="ajuda-em-nome-de"
          />
          <p id="ajuda-em-nome-de" className="text-caption text-ink-faint mt-1">
            Quem decidiu a data. Você fica registrado como quem lançou.
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="observacao-data">Observação</label>
        <input
          id="observacao-data"
          name="observacao"
          className="field"
          placeholder="Opcional — fica no histórico"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao rotulo="Registrar data" ocupado="Registrando…" />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Passo 5 · informar clínica, horário e orientações ao supervisor
// ---------------------------------------------------------------------------

export function FormularioInformarDados({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(informarDados, null);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />
      <input type="hidden" name="em_nome_de" value={item.supervisor_nome ?? ""} />

      <div>
        <label className="label" htmlFor="observacao-informar">Observação</label>
        <input
          id="observacao-informar"
          name="observacao"
          className="field"
          placeholder={
            item.exige_jejum
              ? "Ex.: orientado jejum de 8 horas"
              : "Opcional — fica no histórico"
          }
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao rotulo="Marcar como informado" ocupado="Registrando…" />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Passo 6 · colaborador enviado à clínica
// ---------------------------------------------------------------------------

export function FormularioEnviarClinica({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(enviarAClinica, null);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />
      <div>
        <label className="label" htmlFor="observacao-envio">Observação</label>
        <input
          id="observacao-envio"
          name="observacao"
          className="field"
          placeholder="Opcional — fica no histórico"
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Botao rotulo="Colaborador foi enviado" ocupado="Registrando…" />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Passo 7 · desfecho
//
// Os cinco desfechos aparecem como rádio, com a consequência escrita ao lado.
// Uma lista suspensa esconderia justamente o que precisa ser lido antes de
// escolher: quatro dos cinco NÃO encerram o ciclo.
// ---------------------------------------------------------------------------

const DESFECHOS: Desfecho[] = [
  "fez_apto",
  "fez_inapto",
  "faltou",
  "incompleto",
  "retorno_necessario",
];

export function FormularioDesfecho({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarDesfecho, null);
  const [escolhido, setEscolhido] = useState<Desfecho>("fez_apto");

  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="item_id" value={item.item_id} />

      <fieldset className="border-0 p-0 m-0 grid gap-2">
        <legend className="label mb-1">O que aconteceu na clínica</legend>
        {DESFECHOS.map((d) => (
          <label key={d} className="flex items-start gap-2.5 text-label">
            <input
              type="radio"
              name="desfecho"
              value={d}
              className="size-4 mt-0.5 shrink-0"
              checked={escolhido === d}
              onChange={() => setEscolhido(d)}
            />
            <span>
              <span className="font-medium">{DESFECHO_ROTULO[d]}</span>
              <span className="block text-caption text-ink-faint">
                {DESFECHO_CONSEQUENCIA[d]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {escolhido === "fez_inapto" && (
        <Aviso tom="forte" titulo="Inapto trava o processo">
          O item entra em tratativa e não sai por fluxo normal. Não atualiza a
          validade, não abre ciclo novo, e o colaborador continua bloqueado no
          painel até alguém resolver o caso explicitamente.
        </Aviso>
      )}

      <div>
        <label className="label" htmlFor="observacao-desfecho">Observação</label>
        <input
          id="observacao-desfecho"
          name="observacao"
          className="field"
          placeholder="Opcional — fica no histórico"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Botao rotulo="Registrar desfecho" ocupado="Registrando…" />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 6.4 · encerrar a tratativa de inapto
// ---------------------------------------------------------------------------

export function FormularioEncerrarInapto({ item }: { item: ItemAberto }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(encerrarInapto, null);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <details className="card">
      <summary className="cursor-pointer text-label">Encerrar a tratativa</summary>
      <form action={acao} className="grid gap-3 mt-4">
        <input type="hidden" name="item_id" value={item.item_id} />
        <p className="text-label text-ink-muted m-0 max-w-[62ch]">
          O procedimento formal de resolução ainda não foi definido com o QSMS.
          Encerrar aqui só fecha este item e registra o motivo — não torna o
          colaborador apto nem o dispensa. Se houve novo exame, gere um item
          novo; se foi dispensa, inative o colaborador no cadastro.
        </p>
        <div>
          <label className="label" htmlFor="resolucao">Como o caso foi resolvido</label>
          <textarea id="resolucao" name="resolucao" className="field" rows={2} required minLength={5} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Botao rotulo="Encerrar tratativa" ocupado="Encerrando…" variante="secondary" />
          {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
        </div>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Cancelamento administrativo
// ---------------------------------------------------------------------------

export function FormularioCancelar({ itemId }: { itemId: string }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(cancelarItem, null);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  return (
    <details className="card">
      <summary className="cursor-pointer text-label">Cancelar este item</summary>
      <form action={acao} className="grid gap-3 mt-4">
        <input type="hidden" name="item_id" value={itemId} />
        <div>
          <label className="label" htmlFor="motivo-cancelamento">Motivo</label>
          <input
            id="motivo-cancelamento"
            name="motivo"
            className="field"
            required
            minLength={5}
            placeholder="Ex.: colaborador desligado"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Botao rotulo="Cancelar item" ocupado="Cancelando…" variante="secondary" />
          {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
        </div>
      </form>
    </details>
  );
}
