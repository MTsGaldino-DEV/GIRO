import Link from "next/link";
import type { Perfil } from "@/lib/tipos";

const ABAS_QSMS = [
  { href: "/qsms", rotulo: "Painel" },
  { href: "/qsms/base", rotulo: "Base" },
  { href: "/qsms/supervisores", rotulo: "Supervisores" },
  { href: "/qsms/ausencias", rotulo: "Ausências" },
];

/**
 * Cabeçalho.
 *
 * O supervisor não recebe abas de propósito: o painel dele é uma lista e um
 * botão por linha, aberto pelo link do e-mail, muitas vezes numa mão só. Menu
 * é superfície para errar o toque.
 */
export function Cabecalho({ perfil }: { perfil: Perfil }) {
  const ehQsms = perfil.papel === "qsms";

  return (
    <header className="bg-surface border-b border-line">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-3">
          <Link href={ehQsms ? "/qsms" : "/supervisor"} className="flex items-center gap-2.5 no-underline">
            <img src="/simbolo-giro.svg" alt="" width={30} height={30} className="shrink-0" />
            <span className="sr-only">GIRO</span>
            <span
              aria-hidden
              className="text-ink font-medium tracking-[0.14em] text-[0.9375rem]"
            >
              GIRO
            </span>
          </Link>

          <div className="flex items-center gap-3 min-w-0">
            <span className="text-caption text-ink-faint truncate hidden sm:inline">
              {perfil.nome ?? perfil.email}
              <span className="mx-1.5" aria-hidden>·</span>
              {ehQsms ? "QSMS" : "Supervisão"}
            </span>
            <form action="/auth/sair" method="post">
              <button
                type="submit"
                className="text-caption text-ink-muted underline underline-offset-2 bg-transparent border-0 cursor-pointer p-2 -m-2"
              >
                Sair
              </button>
            </form>
          </div>
        </div>

        {ehQsms && (
          <nav aria-label="Seções" className="flex gap-1 -mb-px overflow-x-auto">
            {ABAS_QSMS.map((aba) => (
              <Link
                key={aba.href}
                href={aba.href}
                className="px-3 py-2.5 text-label text-ink-muted no-underline whitespace-nowrap border-b-2 border-transparent hover:text-ink hover:border-line-strong"
              >
                {aba.rotulo}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
