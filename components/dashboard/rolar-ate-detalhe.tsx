"use client";

import { useEffect } from "react";

/**
 * Garante que a lista do número clicado apareça na tela. Na navegação interna
 * o Next já rola até `#detalhe`; num link aberto direto (colado no chat) a
 * rolagem do navegador às vezes acontece antes de a lista chegar no HTML em
 * streaming. Sem animação: rolagem instantânea respeita quem pede menos
 * movimento.
 */
export function RolarAteDetalhe({ chave }: { chave: string }) {
  useEffect(() => {
    if (window.location.hash !== "#detalhe") return;
    document.getElementById("detalhe")?.scrollIntoView({ block: "start" });
  }, [chave]);
  return null;
}
