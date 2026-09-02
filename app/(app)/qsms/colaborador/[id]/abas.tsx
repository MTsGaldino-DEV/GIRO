"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { slug: "visao-geral", rotulo: "Visão geral" },
  { slug: "aso", rotulo: "ASO" },
  { slug: "treinamentos", rotulo: "Treinamentos" },
  { slug: "ausencias", rotulo: "Ausências" },
  { slug: "cadastro", rotulo: "Cadastro" },
  { slug: "historico", rotulo: "Histórico" },
];

export function AbasColaborador({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções do colaborador" className="abas">
      {ABAS.map((aba) => {
        const href = `/qsms/colaborador/${id}/${aba.slug}`;
        const ativa = pathname === href;
        return (
          <Link
            key={aba.slug}
            href={href}
            aria-current={ativa ? "page" : undefined}
            className="abas__item"
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
