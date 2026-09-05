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

interface GrupoNav {
  rotulo: string;
  itens: ItemNav[];
}

const ITEM_DASHBOARD: ItemNav = { href: "/qsms/dashboard", rotulo: "Dashboard", Icone: IconeDashboard };
const ITEM_PAINEL: ItemNav = { href: "/qsms", rotulo: "Painel", Icone: IconePainel };
const ITEM_BASE: ItemNav = { href: "/qsms/base", rotulo: "Base", Icone: IconeBase };
const ITEM_SUPERVISORES: ItemNav = { href: "/qsms/supervisores", rotulo: "Supervisores", Icone: IconeSupervisores };
const ITEM_AUSENCIAS: ItemNav = { href: "/qsms/ausencias", rotulo: "Ausências", Icone: IconeAusencias };
const ITEM_USUARIOS: ItemNav = { href: "/admin/usuarios", rotulo: "Gestão de usuários", Icone: IconeUsuarios };

/**
 * Aba Supervisão, visível só para admin (plano da Fase 1, seção 10).
 *
 * Na Fase 1 é scaffolding: o admin não tem equipe vinculada, então a tela abre
 * vazia. O QSMS não vê a aba — abas são renderizadas pelo papel, e uma aba que
 * nunca terá conteúdo para quem a vê só ensina a ignorá-la.
 */
const ITEM_SUPERVISAO: ItemNav = { href: "/supervisor", rotulo: "Supervisão", Icone: IconeSupervisores };

/**
 * Navegação agrupada por natureza da tarefa.
 *
 * "Operação" é o que se abre todo dia para decidir o que fazer agora;
 * "Cadastros" é o que se mexe quando algo mudou no mundo (entrou gente, trocou
 * supervisor, alguém saiu de férias); "Administração" é acesso ao sistema.
 * Sete itens numa lista chapada obrigam a ler todos para achar um — em três
 * blocos de dois ou três, o olho vai direto ao bloco certo.
 */
function gruposDoPapel(papel: Perfil["papel"]): GrupoNav[] {
  if (papel === "supervisor") {
    return [{ rotulo: "Operação", itens: [ITEM_PAINEL] }];
  }

  const grupos: GrupoNav[] = [
    { rotulo: "Operação", itens: [ITEM_DASHBOARD, ITEM_PAINEL] },
    { rotulo: "Cadastros", itens: [ITEM_BASE, ITEM_SUPERVISORES, ITEM_AUSENCIAS] },
  ];

  if (papel === "admin") {
    grupos.push({ rotulo: "Administração", itens: [ITEM_SUPERVISAO, ITEM_USUARIOS] });
  }

  return grupos;
}

/**
 * "/qsms" é prefixo de todas as outras rotas do QSMS, então não pode usar
 * startsWith. Mas a página do colaborador e a do item são aprofundamentos do
 * painel — sem isto, nenhum item fica marcado e a sidebar deixa de dizer onde a
 * pessoa está.
 */
function estaAtivo(href: string, pathname: string): boolean {
  if (href === "/qsms") {
    return (
      pathname === "/qsms" ||
      pathname.startsWith("/qsms/colaborador") ||
      pathname.startsWith("/qsms/item")
    );
  }
  return pathname.startsWith(href);
}

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
  const grupos = gruposDoPapel(perfil.papel);

  // Com um grupo só, o rótulo classifica nada: seria um cabeçalho para uma
  // lista de um item. O supervisor cai nesse caso.
  const mostrarRotulos = grupos.length > 1;

  const inicial = (perfil.nome ?? perfil.email).trim().charAt(0).toUpperCase();
  const rotuloPapel =
    perfil.papel === "admin" ? "Administrador" : perfil.papel === "qsms" ? "QSMS" : "Supervisão";

  return (
    <aside className="sidebar sticky top-0 h-dvh shrink-0 w-16 md:w-[252px] flex flex-col">
      <Link href={ehSupervisor ? "/supervisor" : "/qsms"} className="sidebar__logo no-underline">
        <img src="/simbolo-giro.svg" alt="" width={28} height={28} className="shrink-0" />
        <span className="hidden md:inline">
          GIRO<span className="sidebar__logo-dot">.</span>
        </span>
      </Link>

      <nav aria-label="Seções" className="flex-1 px-2 md:px-3 py-2 overflow-y-auto">
        {grupos.map((grupo) => (
          <div key={grupo.rotulo} className="sidebar__grupo">
            {mostrarRotulos && (
              <>
                <div className="sidebar__grupo-rotulo">{grupo.rotulo}</div>
                {/* No trilho de ícones o rótulo não cabe; um traço fino no lugar
                    preserva a separação entre os blocos sem texto nenhum. */}
                <div className="sidebar__grupo-traco" aria-hidden />
              </>
            )}
            <div className="flex flex-col gap-1">
              {grupo.itens.map((item) => {
                const ativo = estaAtivo(item.href, pathname);
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
            </div>
          </div>
        ))}
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
