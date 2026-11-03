"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Estado = "parado" | "carregando" | "concluindo";

/**
 * Barra fina no topo da tela durante a troca de página.
 *
 * O App Router não emite evento de "navegação começou", então a barra parte do
 * clique num link interno e termina quando o endereço muda. O esqueleto de
 * loading.tsx continua sendo o retorno principal; a barra só diz "estou indo"
 * no instante do clique, antes de o esqueleto pintar.
 *
 * Teto de 10 s: se a navegação for cancelada (clique no mesmo destino, erro),
 * a barra não fica presa na tela.
 */
export function BarraNavegacao() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [estado, setEstado] = useState<Estado>("parado");
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      if (evento.defaultPrevented || evento.button !== 0) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;

      const link = (evento.target as Element | null)?.closest("a");
      if (!link || !link.href || link.target === "_blank" || link.hasAttribute("download")) return;

      const destino = new URL(link.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;

      setEstado("carregando");
      if (limite.current) clearTimeout(limite.current);
      limite.current = setTimeout(() => setEstado("concluindo"), 10_000);
    }

    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  // Endereço mudou: a página nova chegou.
  useEffect(() => {
    setEstado((atual) => (atual === "carregando" ? "concluindo" : atual));
  }, [pathname, searchParams]);

  useEffect(() => {
    if (estado !== "concluindo") return;
    if (limite.current) clearTimeout(limite.current);
    const fim = setTimeout(() => setEstado("parado"), 400);
    return () => clearTimeout(fim);
  }, [estado]);

  return <div className="barra-navegacao" data-estado={estado} aria-hidden />;
}
