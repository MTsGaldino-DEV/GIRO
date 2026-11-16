"use client";

import { useState, useTransition } from "react";
import { atualizarAgoraNeo } from "@/app/(app)/colaboradores/acoes-neo";
import { formatarDataHora } from "@/lib/dominio";

/**
 * "Atualizar agora" + quando foi a última sincronização com a NEO.
 *
 * O cadastro vem da NEO e é sincronizado todo dia às 08:30; o botão serve para
 * quem acabou de mudar algo lá. Se a última tentativa falhou, o aviso é discreto
 * (sem cor: o vermelho é do semáforo) e a data continua sendo a da última que deu certo.
 */
export function BotaoAtualizarNeo({
  ultimaSucessoEm,
  ultimaFalhou,
}: {
  ultimaSucessoEm: string | null;
  ultimaFalhou: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  function atualizar() {
    setResultado(null);
    iniciar(async () => {
      const r = await atualizarAgoraNeo();
      setResultado(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        type="button"
        className="btn btn--secondary"
        onClick={atualizar}
        disabled={pendente}
        aria-busy={pendente}
      >
        {pendente ? "Atualizando…" : "Atualizar agora"}
      </button>
      <span className="text-caption text-ink-muted tabular">
        {ultimaSucessoEm
          ? `Última sincronização com a NEO: ${formatarDataHora(ultimaSucessoEm)}`
          : "Ainda não sincronizado com a NEO"}
      </span>
      {ultimaFalhou && !resultado && (
        <span className="text-caption text-ink-muted">A última tentativa falhou.</span>
      )}
      {resultado && (
        <span role={resultado.ok ? "status" : "alert"} className="text-caption max-w-[32ch]">
          {resultado.texto}
        </span>
      )}
    </div>
  );
}
