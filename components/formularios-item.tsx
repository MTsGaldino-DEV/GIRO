"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  solicitarData,
  registrarDataSupervisor,
  informarDados,
  enviarAClinica,
  encerrarInapto,
  cancelarItem,
  type Acao,
} from "@/app/(app)/qsms/acoes";
import { MensagemErro } from "@/components/aviso";
import { hojeIso } from "@/lib/dominio";
import type { ItemAberto } from "@/lib/tipos";

/**
 * Formulários das etapas introduzidas na Fase 1.
 *
 * Um arquivo só porque são todos a mesma coisa — um POST curto que move o
 * processo um passo — e sete arquivos de vinte linhas custam mais para achar
 * do que para ler.
 *
 * Os mesmos formulários servem à ficha do item e às janelas do Radar
 * (components/radar/botao-acao-linha.tsx). Na janela, `aoConcluir` recebe a
 * mensagem de sucesso para fechá-la e recarregar a lista; `embutido` tira o
 * `<details>` de quem só faz sentido recolhido na ficha.
 */

export type AoConcluir = (mensagem: string) => void;

/**
 * Avisa quem abriu o formulário quando a ação deu certo. Uma vez por
 * resposta: se `aoConcluir` mudar de identidade depois, o mesmo sucesso não
 * é anunciado (nem a lista recarregada) de novo.
 */
export function useAvisarConclusao(estado: Acao | null, aoConcluir?: AoConcluir) {
  const avisado = useRef<Acao | null>(null);
  useEffect(() => {
    if (!estado?.ok || avisado.current === estado) return;
    avisado.current = estado;
    aoConcluir?.(estado.mensagem);
  }, [estado, aoConcluir]);
}

export function Botao({ rotulo, ocupado, variante = "primary" }: {
  rotulo: string;
  ocupado: string;
  variante?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variante}`} disabled={pending} aria-busy={pending}>
      {pending ? ocupado : rotulo}
    </button>
  );
}

/** Sucesso vira texto: o item já mudou de etapa e o formulário não serve mais. */
export function Concluido({ mensagem }: { mensagem: string }) {
  return (
    <p role="status" className="text-label m-0">
      {mensagem}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Passo 2 · solicitar a data ao supervisor
// ---------------------------------------------------------------------------

export function FormularioSolicitarData({ item, aoConcluir }: { item: ItemAberto; aoConcluir?: AoConcluir }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(solicitarData, null);
  useAvisarConclusao(estado, aoConcluir);
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

export function FormularioDataSupervisor({ item, aoConcluir }: { item: ItemAberto; aoConcluir?: AoConcluir }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(registrarDataSupervisor, null);
  useAvisarConclusao(estado, aoConcluir);
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

export function FormularioInformarDados({ item, aoConcluir }: { item: ItemAberto; aoConcluir?: AoConcluir }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(informarDados, null);
  useAvisarConclusao(estado, aoConcluir);
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

export function FormularioEnviarClinica({ item, aoConcluir }: { item: ItemAberto; aoConcluir?: AoConcluir }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(enviarAClinica, null);
  useAvisarConclusao(estado, aoConcluir);
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

// Passo 7 · o desfecho e o ASO num passo só: components/radar/formulario-resultado.tsx.

// ---------------------------------------------------------------------------
// 6.4 · encerrar a tratativa de inapto
// ---------------------------------------------------------------------------

export function FormularioEncerrarInapto({
  item,
  aoConcluir,
  embutido = false,
}: {
  item: ItemAberto;
  aoConcluir?: AoConcluir;
  embutido?: boolean;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(encerrarInapto, null);
  useAvisarConclusao(estado, aoConcluir);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  const formulario = (
    <form action={acao} className={`grid gap-3 ${embutido ? "" : "mt-4"}`}>
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
        <Botao
          rotulo="Encerrar tratativa"
          ocupado="Encerrando…"
          variante={embutido ? "primary" : "secondary"}
        />
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );

  if (embutido) return formulario;

  return (
    <details className="card">
      <summary className="cursor-pointer text-label">Encerrar a tratativa</summary>
      {formulario}
    </details>
  );
}

// ---------------------------------------------------------------------------
// Cancelamento administrativo
// ---------------------------------------------------------------------------

export function FormularioCancelar({
  itemId,
  aoConcluir,
  embutido = false,
}: {
  itemId: string;
  aoConcluir?: AoConcluir;
  embutido?: boolean;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(cancelarItem, null);
  useAvisarConclusao(estado, aoConcluir);
  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  const formulario = (
    <form action={acao} className={`grid gap-3 ${embutido ? "" : "mt-4"}`}>
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
  );

  if (embutido) return formulario;

  return (
    <details className="card">
      <summary className="cursor-pointer text-label">Cancelar este item</summary>
      {formulario}
    </details>
  );
}
