import { Fragment } from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface DegrauTrilha {
  rotulo: string;
  /** Sem href, o degrau não é navegável: ou é a página atual, ou é o nome de um
   *  grupo da sidebar, que classifica telas mas não é uma tela. */
  href?: string;
}

/**
 * Trilha de navegação da tela.
 *
 * Usada solta pelas telas de detalhe que montam o próprio cabeçalho — a do
 * colaborador tem foto ao lado do nome, a do item tem selo de etapa — e por
 * dentro de `CabecalhoPagina` no resto. Substitui o link "← Voltar ao painel"
 * que essas páginas tinham: a trilha diz a mesma coisa e uma a mais, de onde se
 * veio E onde se está.
 *
 * O separador é `<li>` irmão do degrau, nunca aninhado dentro dele: <li> dentro
 * de <li> é HTML inválido e alguns leitores de tela recontam a lista.
 */
export function Trilha({ degraus, className }: { degraus: DegrauTrilha[]; className?: string }) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {degraus.map((degrau, i) => (
          <Fragment key={`${degrau.rotulo}-${i}`}>
            <BreadcrumbItem>
              {degrau.href ? (
                <BreadcrumbLink asChild>
                  <Link href={degrau.href}>{degrau.rotulo}</Link>
                </BreadcrumbLink>
              ) : i === degraus.length - 1 ? (
                // `aria-current="page"` só no último. Marcar um degrau
                // intermediário faria o leitor anunciar dois "atual" na trilha.
                <BreadcrumbPage className="truncate max-w-[40ch]">{degrau.rotulo}</BreadcrumbPage>
              ) : (
                <span>{degrau.rotulo}</span>
              )}
            </BreadcrumbItem>
            {i < degraus.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
