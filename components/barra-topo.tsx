"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ItemNav {
  href: string;
  rotulo: string;
  Icone: (props: { className?: string }) => React.ReactElement;
}

type EntradaNav =
  | { tipo: "link"; item: ItemNav }
  | { tipo: "grupo"; rotulo: string; Icone: ItemNav["Icone"]; itens: ItemNav[] };

const ITEM_DASHBOARD: ItemNav = { href: "/qsms/dashboard", rotulo: "Dashboard", Icone: IconeDashboard };
const ITEM_PAINEL: ItemNav = { href: "/qsms", rotulo: "Painel", Icone: IconePainel };
const ITEM_PAINEL_SUPERVISOR: ItemNav = { href: "/supervisor", rotulo: "Painel", Icone: IconePainel };
const ITEM_BASE: ItemNav = { href: "/qsms/base", rotulo: "Base", Icone: IconeBase };
const ITEM_SUPERVISORES: ItemNav = { href: "/qsms/supervisores", rotulo: "Supervisores", Icone: IconeSupervisores };
const ITEM_AUSENCIAS: ItemNav = { href: "/qsms/ausencias", rotulo: "Ausências", Icone: IconeAusencias };
const ITEM_USUARIOS: ItemNav = { href: "/admin/usuarios", rotulo: "Gestão de usuários", Icone: IconeUsuarios };
const ITEM_DESLIGADOS: ItemNav = { href: "/admin/desligados", rotulo: "Desligados", Icone: IconeBase };

/**
 * Aba Supervisão, visível só para admin (plano da Fase 1, seção 10).
 *
 * Na Fase 1 é scaffolding: o admin não tem equipe vinculada, então a tela abre
 * vazia. O QSMS não vê a aba — abas são renderizadas pelo papel, e uma aba que
 * nunca terá conteúdo para quem a vê só ensina a ignorá-la.
 */
const ITEM_SUPERVISAO: ItemNav = { href: "/supervisor", rotulo: "Supervisão", Icone: IconeSupervisores };

/**
 * Navegação por natureza da tarefa.
 *
 * O que se abre todo dia (Dashboard, Painel) fica à vista, um clique só.
 * Cadastros e Administração viram menus suspensos: mexe-se neles quando algo
 * mudou no mundo ou no acesso, e sete itens soltos numa barra horizontal
 * obrigariam a ler todos para achar um.
 */
function entradasDoPapel(papel: Perfil["papel"]): EntradaNav[] {
  if (papel === "supervisor") return [{ tipo: "link", item: ITEM_PAINEL_SUPERVISOR }];

  const entradas: EntradaNav[] = [
    { tipo: "link", item: ITEM_DASHBOARD },
    { tipo: "link", item: ITEM_PAINEL },
    { tipo: "grupo", rotulo: "Cadastros", Icone: IconeBase, itens: [ITEM_BASE, ITEM_SUPERVISORES, ITEM_AUSENCIAS] },
  ];

  if (papel === "admin") {
    entradas.push({
      tipo: "grupo",
      rotulo: "Administração",
      Icone: IconeUsuarios,
      itens: [ITEM_SUPERVISAO, ITEM_USUARIOS, ITEM_DESLIGADOS],
    });
  }

  return entradas;
}

/**
 * "/qsms" é prefixo de todas as outras rotas do QSMS, então não pode usar
 * startsWith. Mas a página do colaborador e a do item são aprofundamentos do
 * painel — sem isto, nenhum item fica marcado e a navegação deixa de dizer
 * onde a pessoa está.
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

interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

function medir(el: HTMLElement): Retangulo {
  return { x: el.offsetLeft, y: el.offsetTop, largura: el.offsetWidth, altura: el.offsetHeight };
}

function estiloRetangulo(r: Retangulo | null): React.CSSProperties | undefined {
  if (!r) return undefined;
  return { transform: `translate(${r.x}px, ${r.y}px)`, width: r.largura, height: r.altura };
}

/**
 * Pílula que desliza até o item ativo e sombra que segue o mouse.
 *
 * Mede os itens depois de pintar e posiciona dois elementos absolutos atrás
 * deles. Até a primeira medição, o CSS mantém o fundo do próprio item ativo
 * (ver `data-pilula` em globals.css), então a primeira pintura nunca sai sem
 * destaque. ResizeObserver cobre a troca para o modo só de ícones.
 */
function usePilulaDeslizante(pathname: string) {
  const navRef = useRef<HTMLElement>(null);
  const [pilula, setPilula] = useState<Retangulo | null>(null);
  const [sombra, setSombra] = useState<Retangulo | null>(null);
  const [sombraVisivel, setSombraVisivel] = useState(false);
  const [pronta, setPronta] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    function posicionar() {
      const ativo = nav!.querySelector<HTMLElement>('[data-ativo="true"]');
      setPilula(ativo ? medir(ativo) : null);
    }

    posicionar();
    // A pílula aparece só no quadro seguinte, já no lugar: sem isso ela
    // deslizaria do canto da barra até o item na primeira pintura.
    const quadro = requestAnimationFrame(() => setPronta(true));
    const observador = new ResizeObserver(posicionar);
    observador.observe(nav);
    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
    };
  }, [pathname]);

  return {
    navRef,
    pronta,
    pilula,
    sombra,
    sombraVisivel,
    aoEntrarNoItem: (evento: React.MouseEvent<HTMLElement>) => {
      setSombra(medir(evento.currentTarget));
      setSombraVisivel(true);
    },
    aoSairDaNav: () => setSombraVisivel(false),
  };
}

/**
 * Navegação no topo, sobre a faixa escura em que o cabeçalho de cada tela
 * assenta (redesign do QSMS, 03/11/2026). Substitui a sidebar: a largura que
 * ela ocupava volta para o painel em cartões.
 *
 * Em tela estreita os rótulos somem e ficam só os ícones — o supervisor abre o
 * painel no celular, e um menu que precisa de um toque extra para abrir é
 * atrito que o design original já rejeitava.
 */
export function BarraTopo({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  const entradas = entradasDoPapel(perfil.papel);
  const deslizante = usePilulaDeslizante(pathname);

  return (
    <header className="topo">
      <div className="topo__interno">
        <Link
          href={perfil.papel === "supervisor" ? "/supervisor" : "/qsms/dashboard"}
          className="topo__logo no-underline"
        >
          <img src="/simbolo-giro.svg" alt="" width={28} height={28} className="shrink-0" />
          <span className="hidden sm:inline">
            GIRO<span className="topo__logo-dot">.</span>
          </span>
        </Link>

        <nav
          ref={deslizante.navRef}
          aria-label="Seções"
          className="topo__nav"
          data-pilula={deslizante.pronta ? "pronta" : undefined}
          onMouseLeave={deslizante.aoSairDaNav}
        >
          <span
            className="topo__sombra"
            aria-hidden
            data-visivel={deslizante.sombraVisivel && deslizante.sombra ? "true" : undefined}
            style={estiloRetangulo(deslizante.sombra)}
          />
          <span
            className="topo__pilula"
            aria-hidden
            data-visivel={deslizante.pilula ? "true" : undefined}
            style={estiloRetangulo(deslizante.pilula)}
          />

          {entradas.map((entrada) =>
            entrada.tipo === "link" ? (
              <Link
                key={entrada.item.href}
                href={entrada.item.href}
                aria-current={estaAtivo(entrada.item.href, pathname) ? "page" : undefined}
                data-ativo={estaAtivo(entrada.item.href, pathname) ? "true" : undefined}
                className="topo__item"
                onMouseEnter={deslizante.aoEntrarNoItem}
              >
                <entrada.item.Icone className="shrink-0" />
                <span className="topo__rotulo">{entrada.item.rotulo}</span>
              </Link>
            ) : (
              <GrupoNav
                key={entrada.rotulo}
                entrada={entrada}
                pathname={pathname}
                aoEntrar={deslizante.aoEntrarNoItem}
              />
            )
          )}
        </nav>

        <MenuUsuario perfil={perfil} />
      </div>
    </header>
  );
}

function GrupoNav({
  entrada,
  pathname,
  aoEntrar,
}: {
  entrada: Extract<EntradaNav, { tipo: "grupo" }>;
  pathname: string;
  aoEntrar: (evento: React.MouseEvent<HTMLElement>) => void;
}) {
  // O grupo acende quando a tela atual é um dos seus itens: a pílula precisa
  // de um lugar para pousar mesmo quando o item em si está escondido no menu.
  const ativo = entrada.itens.some((item) => estaAtivo(item.href, pathname));

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="topo__item"
          data-ativo={ativo ? "true" : undefined}
          onMouseEnter={aoEntrar}
        >
          <entrada.Icone className="shrink-0" />
          <span className="topo__rotulo">{entrada.rotulo}</span>
          <IconeChevron className="topo__seta shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {entrada.itens.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              aria-current={estaAtivo(item.href, pathname) ? "page" : undefined}
              className="no-underline"
            >
              <item.Icone />
              {item.rotulo}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuUsuario({ perfil }: { perfil: Perfil }) {
  // O formulário de sair fica fora do menu: o Radix desmonta o conteúdo ao
  // fechar, e o envio precisa sobreviver ao clique que fecha o menu.
  const formSair = useRef<HTMLFormElement>(null);

  const nome = perfil.nome ?? perfil.email;
  const inicial = nome.trim().charAt(0).toUpperCase();
  const rotuloPapel =
    perfil.papel === "admin" ? "Administrador" : perfil.papel === "qsms" ? "QSMS" : "Supervisão";

  return (
    <>
      <form ref={formSair} action="/auth/sair" method="post" hidden />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="topo__usuario" aria-label={`Conta de ${nome}`}>
            <span className="topo__avatar" aria-hidden>{inicial}</span>
            <span className="topo__identidade">
              <span className="topo__nome">{nome}</span>
              <span className="topo__papel">{rotuloPapel}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <span className="block font-medium truncate">{nome}</span>
            <span className="block text-caption text-ink-faint">{rotuloPapel}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/conta/senha" className="no-underline">
              <IconeChave />
              Trocar senha
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => formSair.current?.requestSubmit()}>
            <IconeSair />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
