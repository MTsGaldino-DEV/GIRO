"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@/lib/tipos";
import {
  IconeDashboard,
  IconeRadar,
  IconeColaboradores,
  IconeBase,
  IconeSupervisores,
  IconeAusencias,
  IconeUsuarios,
  IconeChave,
  IconeSair,
  IconeChevron,
  IconeMenu,
  IconeFechar,
} from "@/components/icones";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ItemNav {
  href: string;
  rotulo: string;
  Icone: (props: { className?: string }) => React.ReactElement;
  /** Telas que não têm item próprio no menu e acendem este (ficha do item, perfil). */
  filhas?: string[];
}

type EntradaNav =
  | { tipo: "link"; item: ItemNav }
  | { tipo: "grupo"; id: string; rotulo: string; Icone: ItemNav["Icone"]; itens: ItemNav[] };

const ITEM_DASHBOARD: ItemNav = {
  href: "/dashboard",
  rotulo: "Dashboard",
  Icone: IconeDashboard,
};
const ITEM_RADAR: ItemNav = {
  href: "/radar",
  rotulo: "Radar",
  Icone: IconeRadar,
  filhas: ["/qsms/item", "/supervisor/item"],
};
const ITEM_COLABORADORES: ItemNav = {
  href: "/colaboradores",
  rotulo: "Colaboradores",
  Icone: IconeColaboradores,
  filhas: ["/qsms/colaborador"],
};
const ITEM_BASE: ItemNav = { href: "/qsms/base", rotulo: "Base", Icone: IconeBase };
const ITEM_SUPERVISORES: ItemNav = { href: "/qsms/supervisores", rotulo: "Supervisores", Icone: IconeSupervisores };
const ITEM_AUSENCIAS: ItemNav = { href: "/qsms/ausencias", rotulo: "Ausências", Icone: IconeAusencias };
const ITEM_USUARIOS: ItemNav = { href: "/admin/usuarios", rotulo: "Gestão de usuários", Icone: IconeUsuarios };

/**
 * Menu por papel (spec de 13/11, seção 5).
 *
 * O que se abre todo dia (Dashboard, Radar, Colaboradores) fica à vista.
 * Cadastros e Administração viram grupos recolhíveis: mexe-se neles quando algo
 * mudou no mundo ou no acesso. O supervisor só enxerga as três telas de
 * operação; o QSMS acrescenta Cadastros; só o admin vê Administração.
 */
function entradasDoPapel(papel: Perfil["papel"]): EntradaNav[] {
  const entradas: EntradaNav[] = [
    { tipo: "link", item: ITEM_DASHBOARD },
    { tipo: "link", item: ITEM_RADAR },
    { tipo: "link", item: ITEM_COLABORADORES },
  ];

  if (papel === "supervisor") return entradas;

  entradas.push({
    tipo: "grupo",
    id: "cadastros",
    rotulo: "Cadastros",
    Icone: IconeBase,
    itens: [ITEM_BASE, ITEM_SUPERVISORES, ITEM_AUSENCIAS],
  });

  if (papel === "admin") {
    entradas.push({
      tipo: "grupo",
      id: "administracao",
      rotulo: "Administração",
      Icone: IconeUsuarios,
      itens: [ITEM_USUARIOS],
    });
  }

  return entradas;
}

/** Casa por segmento: "/qsms/colaborador" não acende para "/qsms/colaboradores-x". */
function casa(rota: string, pathname: string): boolean {
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

function estaAtivo(item: ItemNav, pathname: string): boolean {
  return [item.href, ...(item.filhas ?? [])].some((rota) => casa(rota, pathname));
}

function rotuloDoPapel(papel: Perfil["papel"]): string {
  return papel === "admin" ? "Administrador" : papel === "qsms" ? "QSMS" : "Supervisão";
}

function Marca({ perfil, aoNavegar }: { perfil: Perfil; aoNavegar?: () => void }) {
  return (
    <Link
      href={perfil.papel === "supervisor" ? "/radar" : "/dashboard"}
      className="sidebar__logo no-underline"
      onClick={aoNavegar}
    >
      <img src="/simbolo-giro.svg" alt="" width={28} height={28} className="shrink-0" />
      <span>
        GIRO<span className="sidebar__logo-ponto">.</span>
      </span>
    </Link>
  );
}

function LinkItem({
  item,
  pathname,
  aoNavegar,
  subitem = false,
}: {
  item: ItemNav;
  pathname: string;
  aoNavegar?: () => void;
  subitem?: boolean;
}) {
  const ativo = estaAtivo(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      data-ativo={ativo ? "true" : undefined}
      data-subitem={subitem ? "true" : undefined}
      className="sidebar__item no-underline"
      onClick={aoNavegar}
    >
      <item.Icone className="shrink-0" />
      <span className="sidebar__rotulo">{item.rotulo}</span>
    </Link>
  );
}

function Grupo({
  entrada,
  pathname,
  aoNavegar,
}: {
  entrada: Extract<EntradaNav, { tipo: "grupo" }>;
  pathname: string;
  aoNavegar?: () => void;
}) {
  const idLista = useId();
  const contemAtivo = entrada.itens.some((item) => estaAtivo(item, pathname));
  const [aberto, setAberto] = useState(contemAtivo);

  // Navegar para um item do grupo (por link de fora do menu, por exemplo) abre
  // o grupo: o item ativo nunca fica escondido.
  useEffect(() => {
    if (contemAtivo) setAberto(true);
  }, [contemAtivo]);

  return (
    <div className="sidebar__grupo">
      <button
        type="button"
        className="sidebar__item sidebar__item--grupo"
        data-ativo={contemAtivo && !aberto ? "true" : undefined}
        data-contem-ativo={contemAtivo ? "true" : undefined}
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => setAberto((atual) => !atual)}
      >
        <entrada.Icone className="shrink-0" />
        <span className="sidebar__rotulo">{entrada.rotulo}</span>
        <IconeChevron className="sidebar__seta shrink-0" />
      </button>
      <div id={idLista} className="sidebar__sub" data-aberto={aberto ? "true" : "false"}>
        <div className="sidebar__sub-interno">
          <div className="sidebar__sub-lista">
            {entrada.itens.map((item) => (
              <LinkItem key={item.href} item={item} pathname={pathname} aoNavegar={aoNavegar} subitem />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CartaoUsuario({ perfil, aoNavegar }: { perfil: Perfil; aoNavegar?: () => void }) {
  const nome = perfil.nome ?? perfil.email;
  const inicial = nome.trim().charAt(0).toUpperCase();

  return (
    <div className="sidebar__usuario">
      <div className="sidebar__usuario-id">
        <span className="sidebar__avatar" aria-hidden>
          {inicial}
        </span>
        <span className="sidebar__identidade">
          <span className="sidebar__nome" title={nome}>
            {nome}
          </span>
          <span className="sidebar__papel">{rotuloDoPapel(perfil.papel)}</span>
        </span>
      </div>
      <div className="sidebar__usuario-acoes">
        <Link href="/conta/senha" className="sidebar__acao no-underline" onClick={aoNavegar}>
          <IconeChave />
          Senha
        </Link>
        <form action="/auth/sair" method="post" className="contents">
          <button type="submit" className="sidebar__acao">
            <IconeSair />
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

/** Conteúdo comum à coluna fixa (desktop) e à gaveta (celular). */
function CorpoSidebar({
  perfil,
  aoNavegar,
  fechar,
}: {
  perfil: Perfil;
  aoNavegar?: () => void;
  fechar?: React.ReactNode;
}) {
  const pathname = usePathname();
  const entradas = entradasDoPapel(perfil.papel);

  return (
    <>
      <div className="sidebar__cabeca">
        <Marca perfil={perfil} aoNavegar={aoNavegar} />
        {fechar}
      </div>

      <nav aria-label="Seções" className="sidebar__nav">
        {entradas.map((entrada) =>
          entrada.tipo === "link" ? (
            <LinkItem key={entrada.item.href} item={entrada.item} pathname={pathname} aoNavegar={aoNavegar} />
          ) : (
            <Grupo key={entrada.id} entrada={entrada} pathname={pathname} aoNavegar={aoNavegar} />
          )
        )}
      </nav>

      <CartaoUsuario perfil={perfil} aoNavegar={aoNavegar} />
    </>
  );
}

/**
 * Navegação lateral no estilo da NEO, com a identidade do GIRO (#132523,
 * petróleo). Abaixo de 1024px vira barra compacta no topo e a coluna abre como
 * gaveta (Radix Dialog: foco preso, Escape fecha, rolagem do fundo travada).
 */
export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  const [gavetaAberta, setGavetaAberta] = useState(false);

  // Trocar de rota (inclusive por botão voltar) fecha a gaveta.
  useEffect(() => {
    setGavetaAberta(false);
  }, [pathname]);

  return (
    <>
      <aside className="sidebar" aria-label="Menu principal">
        <CorpoSidebar perfil={perfil} />
      </aside>

      <header className="sidebar-topo">
        <Dialog open={gavetaAberta} onOpenChange={setGavetaAberta}>
          <DialogTrigger asChild>
            <button type="button" className="sidebar-topo__menu" aria-label="Abrir menu">
              <IconeMenu />
            </button>
          </DialogTrigger>
          <Marca perfil={perfil} />
          <DialogContent lado="direita" className="sidebar-gaveta">
            <DialogTitle className="sr-only">Menu principal</DialogTitle>
            <DialogDescription className="sr-only">Navegação entre as seções do GIRO</DialogDescription>
            <CorpoSidebar
              perfil={perfil}
              aoNavegar={() => setGavetaAberta(false)}
              fechar={
                <button
                  type="button"
                  className="sidebar-topo__menu"
                  aria-label="Fechar menu"
                  onClick={() => setGavetaAberta(false)}
                >
                  <IconeFechar />
                </button>
              }
            />
          </DialogContent>
        </Dialog>
      </header>
    </>
  );
}
