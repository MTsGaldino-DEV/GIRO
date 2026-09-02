"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@/lib/tipos";
import {
  IconeDashboard,
  IconePainel,
  IconeBase,
  IconeSupervisores,
  IconeAusencias,
  IconeUsuarios,
  IconeChave,
  IconeSair,
  IconeChevron,
} from "@/components/icones";

interface ItemNav {
  href: string;
  rotulo: string;
  Icone: (props: { className?: string }) => React.ReactElement;
}

const ITENS_QSMS: ItemNav[] = [
  { href: "/qsms/dashboard", rotulo: "Dashboard", Icone: IconeDashboard },
  { href: "/qsms", rotulo: "Painel", Icone: IconePainel },
  { href: "/qsms/base", rotulo: "Base", Icone: IconeBase },
  { href: "/qsms/supervisores", rotulo: "Supervisores", Icone: IconeSupervisores },
  { href: "/qsms/ausencias", rotulo: "Ausências", Icone: IconeAusencias },
];

const ITENS_SUPERVISOR: ItemNav[] = [{ href: "/supervisor", rotulo: "Painel", Icone: IconePainel }];

const ITEM_ADMIN: ItemNav = { href: "/admin/usuarios", rotulo: "Gestão de usuários", Icone: IconeUsuarios };

/**
 * Sidebar fixa à esquerda.
 *
 * Substitui o cabeçalho de abas por um padrão de navegação lateral (ajuste ao
 * MVP, seção 3). Em telas estreitas vira um trilho de ícones — não um drawer —
 * porque o supervisor abre o painel no celular, muitas vezes numa mão só, e um
 * menu que precisa de um toque extra para abrir é atrito que o design original
 * já rejeitava.
 */
export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  const ehSupervisor = perfil.papel === "supervisor";
  const itens = ehSupervisor ? ITENS_SUPERVISOR : ITENS_QSMS;
  const itensComAdmin = perfil.papel === "admin" ? [...itens, ITEM_ADMIN] : itens;

  const inicial = (perfil.nome ?? perfil.email).trim().charAt(0).toUpperCase();
  const rotuloPapel = perfil.papel === "admin" ? "Administrador" : perfil.papel === "qsms" ? "QSMS" : "Supervisão";

  return (
    <aside className="sidebar sticky top-0 h-dvh shrink-0 w-16 md:w-[252px] flex flex-col">
      <Link href={ehSupervisor ? "/supervisor" : "/qsms"} className="sidebar__logo no-underline">
        <img src="/simbolo-giro.svg" alt="" width={28} height={28} className="shrink-0" />
        <span className="hidden md:inline">
          GIRO<span className="sidebar__logo-dot">.</span>
        </span>
      </Link>

      <nav aria-label="Seções" className="flex-1 px-2 md:px-3 py-2 flex flex-col gap-1.5 overflow-y-auto">
        {itensComAdmin.map((item) => {
          // "/qsms" é prefixo de todas as outras rotas do QSMS, então não pode
          // usar startsWith. Mas a página do colaborador e a do item são
          // aprofundamentos do painel — sem isto, nenhum item fica marcado
          // e a sidebar deixa de dizer onde a pessoa está.
          const ativo =
            item.href === "/qsms"
              ? pathname === "/qsms" ||
                pathname.startsWith("/qsms/colaborador") ||
                pathname.startsWith("/qsms/item")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={`sidebar__item ${ativo ? "sidebar__item--ativo" : ""}`}
            >
              <item.Icone className="shrink-0" />
              <span className="hidden md:inline truncate">{item.rotulo}</span>
              {ativo && <IconeChevron className="hidden md:inline ml-auto shrink-0" />}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__usuario">
        <div className="sidebar__identidade">
          <span className="sidebar__avatar" aria-hidden>{inicial}</span>
          <div className="min-w-0">
            <div className="text-label font-medium truncate" style={{ color: "var(--color-sidebar-text-active)" }}>
              {perfil.nome ?? perfil.email}
            </div>
            <div className="text-caption truncate" style={{ color: "var(--color-sidebar-text)" }}>
              {rotuloPapel}
            </div>
          </div>
        </div>

        <div className="sidebar__acoes">
          <Link href="/conta/senha" className="sidebar__botao-icone" title="Trocar senha">
            <IconeChave />
            <span className="sr-only">Trocar senha</span>
          </Link>
          <form action="/auth/sair" method="post">
            <button type="submit" className="sidebar__botao-icone" title="Sair">
              <IconeSair />
              <span className="sr-only">Sair</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
