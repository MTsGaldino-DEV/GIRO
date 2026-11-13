import Link from "next/link";
import { hrefDashboard, type EscopoDashboard } from "@/lib/regras-dashboard";

/**
 * "UEN / Minha equipe". Só aparece para quem tem supervisor vinculado. É link
 * (o escopo mora na URL), em petróleo: navegação, não semáforo.
 */
export function SegmentoEquipe({ escopo }: { escopo: EscopoDashboard }) {
  return (
    <nav aria-label="Escopo dos números" className="segmento">
      <Link href={hrefDashboard("todas")} className="segmento__item" aria-current={escopo === "todas" ? "page" : undefined}>
        UEN
      </Link>
      <Link href={hrefDashboard("minha")} className="segmento__item" aria-current={escopo === "minha" ? "page" : undefined}>
        Minha equipe
      </Link>
    </nav>
  );
}
