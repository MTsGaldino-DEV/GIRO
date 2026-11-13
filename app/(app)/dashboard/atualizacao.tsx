"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_MS = 60_000;

/**
 * Mantém o dashboard fresco sem websocket.
 *
 * A página é `force-dynamic`, então cada visita já consulta o banco. Isto cobre
 * a aba deixada aberta: `router.refresh()` refaz o render no servidor e troca o
 * conteúdo sem perder rolagem nem foco.
 *
 * Supabase Realtime resolveria com streaming, mas paga uma conexão aberta por
 * aba e lógica de reconexão para ganhar segundos numa tela cujos números mudam
 * poucas vezes por dia.
 *
 * Não atualiza com a aba em segundo plano: renderizar o que ninguém está
 * olhando é consulta ao banco jogada fora.
 */
export function AtualizacaoAutomatica() {
  const router = useRouter();
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  useEffect(() => {
    setAtualizadoEm(new Date());

    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAtualizadoEm(new Date());
    }, INTERVALO_MS);

    return () => clearInterval(id);
  }, [router]);

  return (
    <p className="text-caption text-ink-faint m-0 tabular" aria-live="polite">
      {atualizadoEm
        ? `Atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })} · a cada minuto`
        : "Atualizando a cada minuto"}
    </p>
  );
}
