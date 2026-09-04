"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { gerarItens, type ResultadoGeracao } from "./acoes";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Gerando…" : "Gerar itens"}
    </button>
  );
}

/**
 * Ação em massa do plano, seção 8: cria as pendências dos vencimentos dos
 * próximos 90 dias. O mesmo que o cron diário faz — aqui é o botão para quando
 * o QSMS não quer esperar até amanhã.
 */
export function BotaoGerarItens() {
  const [estado, acao] = useActionState<ResultadoGeracao | null, FormData>(gerarItens, null);

  return (
    <form action={acao} className="flex items-center gap-3">
      <Botao />
      {estado && (
        <span role="status" className="text-label text-ink-muted max-w-[34ch]">
          {estado.ok
            ? estado.criados === 0
              ? "Nada novo — todos os vencimentos dos próximos 90 dias já têm item aberto."
              : `${estado.criados} item(ns) criado(s): ${estado.a_vencer} a vencer, ${estado.sem_registro} sem registro.`
            : estado.erro}
        </span>
      )}
    </form>
  );
}
