"use client";

import { useCallback, useEffect, useId, useState } from "react";
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
  IconeExpandir,
} from "@/components/icones";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COOKIE_SIDEBAR, iniciais } from "@/lib/sidebar";

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

interface SecaoNav {
  id: string;
  rotulo: string;
  entradas: EntradaNav[];
}

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
const ITEM_SUPERVISORES: ItemNav = { href: "/qsms/supervisores", rotulo: "Supervisores", Icone: IconeSupervisores };
const ITEM_AUSENCIAS: ItemNav = { href: "/qsms/ausencias", rotulo: "Ausências", Icone: IconeAusencias };
const ITEM_USUARIOS: ItemNav = { href: "/admin/usuarios", rotulo: "Gestão de usuários", Icone: IconeUsuarios };
const ITEM_TRATAMENTO: ItemNav = { href: "/admin/tratamento", rotulo: "Tratamento", Icone: IconeChave };

/**
 * Menu por papel (spec de 13/11, seção 5).
 *
 * O que se abre todo dia (Dashboard, Radar, Colaboradores) fica à vista, na
 * seção Operação. Cadastros e Administração são grupos na seção Gestão:
 * mexe-se neles quando algo mudou no mundo ou no acesso. O supervisor só
 * enxerga Operação; o QSMS acrescenta Cadastros; só o admin vê Administração.
 */
function secoesDoPapel(papel: Perfil["papel"]): SecaoNav[] {
  const operacao: SecaoNav = {
    id: "operacao",
    rotulo: "Operação",
    entradas: [
      { tipo: "link", item: ITEM_DASHBOARD },
      { tipo: "link", item: ITEM_RADAR },
      { tipo: "link", item: ITEM_COLABORADORES },
    ],
  };

  if (papel === "supervisor") return [operacao];

  const gestao: SecaoNav = {
    id: "gestao",
    rotulo: "Gestão",
    entradas: [
      {
        tipo: "grupo",
        id: "cadastros",
        rotulo: "Cadastros",
        Icone: IconeBase,
        itens: [ITEM_SUPERVISORES, ITEM_AUSENCIAS],
      },
    ],
  };

  if (papel === "admin") {
    gestao.entradas.push({
      tipo: "grupo",
      id: "administracao",
      rotulo: "Administração",
      Icone: IconeUsuarios,
      itens: [ITEM_USUARIOS, ITEM_TRATAMENTO],
    });
  }

  return [operacao, gestao];
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

/** Pendências por rota (hoje só o Tratamento); ausente ou 0 não mostra contador. */
type Contadores = Record<string, number | undefined>;

function textoPendencias(quantidade: number): string {
  return `${quantidade} aguardando tratativa`;
}

function Contador({ quantidade }: { quantidade: number }) {
  return (
    <span className="sidebar__badge" aria-hidden>
      {quantidade}
    </span>
  );
}

function Marca({ perfil, aoNavegar }: { perfil: Perfil; aoNavegar?: () => void }) {
  return (
    <Link
      href={perfil.papel === "supervisor" ? "/radar" : "/dashboard"}
      className="sidebar__logo no-underline"
      aria-label="GIRO, página inicial"
      onClick={aoNavegar}
    >
      <img src="/simbolo-giro.svg" alt="" width={28} height={28} className="shrink-0" />
      <span className="sidebar__logo-texto" aria-hidden>
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
  pendencias = 0,
}: {
  item: ItemNav;
  pathname: string;
  aoNavegar?: () => void;
  subitem?: boolean;
  pendencias?: number;
}) {
  const ativo = estaAtivo(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      aria-label={pendencias > 0 ? `${item.rotulo}, ${textoPendencias(pendencias)}` : undefined}
      data-ativo={ativo ? "true" : undefined}
      data-subitem={subitem ? "true" : undefined}
      data-dica={item.rotulo}
      className="sidebar__item no-underline"
      onClick={aoNavegar}
    >
      <item.Icone className="sidebar__icone" />
      <span className="sidebar__rotulo">{item.rotulo}</span>
      {pendencias > 0 && <Contador quantidade={pendencias} />}
    </Link>
  );
}

function Grupo({
  entrada,
  pathname,
  aoNavegar,
  recolhida,
  contadores,
}: {
  entrada: Extract<EntradaNav, { tipo: "grupo" }>;
  pathname: string;
  aoNavegar?: () => void;
  recolhida: boolean;
  contadores: Contadores;
}) {
  const idLista = useId();
  const contemAtivo = entrada.itens.some((item) => estaAtivo(item, pathname));
  const pendenciasDoGrupo = entrada.itens.reduce((soma, item) => soma + (contadores[item.href] ?? 0), 0);
  const [aberto, setAberto] = useState(contemAtivo);

  // Navegar para um item do grupo (por link de fora do menu, por exemplo) abre
  // o grupo: o item ativo nunca fica escondido.
  useEffect(() => {
    if (contemAtivo) setAberto(true);
  }, [contemAtivo]);

  // Recolhida não há largura para a lista: o grupo abre num menu ao lado.
  if (recolhida) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="sidebar__item sidebar__item--grupo"
            data-ativo={contemAtivo ? "true" : undefined}
            data-dica={
              pendenciasDoGrupo > 0 ? `${entrada.rotulo} · ${textoPendencias(pendenciasDoGrupo)}` : entrada.rotulo
            }
            aria-label={pendenciasDoGrupo > 0 ? `${entrada.rotulo}, ${textoPendencias(pendenciasDoGrupo)}` : undefined}
          >
            <entrada.Icone className="sidebar__icone" />
            <span className="sidebar__rotulo">{entrada.rotulo}</span>
            {pendenciasDoGrupo > 0 && <span className="sidebar__ponto" aria-hidden />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={14}>
          <DropdownMenuLabel>{entrada.rotulo}</DropdownMenuLabel>
          {entrada.itens.map((item) => {
            const ativo = estaAtivo(item, pathname);
            const pendencias = contadores[item.href] ?? 0;
            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  aria-label={pendencias > 0 ? `${item.rotulo}, ${textoPendencias(pendencias)}` : undefined}
                  data-ativo={ativo ? "true" : undefined}
                  className="no-underline"
                >
                  <item.Icone className="size-4 shrink-0" />
                  {item.rotulo}
                  {pendencias > 0 && <Contador quantidade={pendencias} />}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="sidebar__grupo">
      <button
        type="button"
        className="sidebar__item sidebar__item--grupo"
        data-ativo={contemAtivo && !aberto ? "true" : undefined}
        data-contem-ativo={contemAtivo ? "true" : undefined}
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-label={
          pendenciasDoGrupo > 0 && !aberto ? `${entrada.rotulo}, ${textoPendencias(pendenciasDoGrupo)}` : undefined
        }
        onClick={() => setAberto((atual) => !atual)}
      >
        <entrada.Icone className="sidebar__icone" />
        <span className="sidebar__rotulo">{entrada.rotulo}</span>
        {/* Grupo fechado esconderia o contador do item: o número sobe para o grupo. */}
        {pendenciasDoGrupo > 0 && !aberto && <Contador quantidade={pendenciasDoGrupo} />}
        <IconeChevron className="sidebar__seta shrink-0" />
      </button>
      <div id={idLista} className="sidebar__sub" data-aberto={aberto ? "true" : "false"}>
        <div className="sidebar__sub-interno">
          <div className="sidebar__sub-lista">
            {entrada.itens.map((item) => (
              <LinkItem
                key={item.href}
                item={item}
                pathname={pathname}
                aoNavegar={aoNavegar}
                subitem
                pendencias={contadores[item.href]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Conta do usuário: o cartão inteiro abre o menu com Trocar senha e Sair.
 * Recolhida, sobra só o avatar e o menu abre ao lado.
 */
function CartaoUsuario({
  perfil,
  aoNavegar,
  recolhida,
}: {
  perfil: Perfil;
  aoNavegar?: () => void;
  recolhida: boolean;
}) {
  const nome = perfil.nome ?? perfil.email;
  const papel = rotuloDoPapel(perfil.papel);

  return (
    <div className="sidebar__rodape">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="sidebar__usuario" data-dica={nome} aria-label={`Conta de ${nome}`}>
            <span className="sidebar__avatar" aria-hidden>
              {iniciais(nome)}
            </span>
            <span className="sidebar__identidade" aria-hidden>
              <span className="sidebar__nome">{nome}</span>
              <span className="sidebar__papel">{papel}</span>
            </span>
            <IconeChevron className="sidebar__usuario-seta" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={recolhida ? "right" : "top"}
          align={recolhida ? "end" : "start"}
          sideOffset={recolhida ? 14 : 8}
          className="min-w-[14rem]"
        >
          <DropdownMenuLabel>
            <span className="block truncate text-ink">{nome}</span>
            <span className="block font-normal text-ink-faint">{papel}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/conta/senha" className="no-underline" onClick={aoNavegar}>
              <IconeChave className="size-4 shrink-0" />
              Trocar senha
            </Link>
          </DropdownMenuItem>
          <form action="/auth/sair" method="post">
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                <IconeSair className="size-4 shrink-0" />
                Sair
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Conteúdo comum à coluna fixa (desktop) e à gaveta (celular). */
function CorpoSidebar({
  perfil,
  aoNavegar,
  cabecalhoExtra,
  recolhida = false,
  contadores,
}: {
  perfil: Perfil;
  aoNavegar?: () => void;
  /** Botão à direita da marca: recolher (desktop) ou fechar (gaveta). */
  cabecalhoExtra?: React.ReactNode;
  recolhida?: boolean;
  contadores: Contadores;
}) {
  const pathname = usePathname();
  const secoes = secoesDoPapel(perfil.papel);
  const idBase = useId();

  return (
    <>
      <div className="sidebar__cabeca">
        <Marca perfil={perfil} aoNavegar={aoNavegar} />
        {cabecalhoExtra}
      </div>

      <nav aria-label="Seções" className="sidebar__nav">
        {secoes.map((secao) => {
          const idRotulo = `${idBase}-${secao.id}`;
          return (
            <div key={secao.id} role="group" aria-labelledby={idRotulo} className="sidebar__bloco">
              <p id={idRotulo} className="sidebar__secao">
                <span>{secao.rotulo}</span>
              </p>
              {secao.entradas.map((entrada) =>
                entrada.tipo === "link" ? (
                  <LinkItem key={entrada.item.href} item={entrada.item} pathname={pathname} aoNavegar={aoNavegar} />
                ) : (
                  <Grupo
                    key={entrada.id}
                    entrada={entrada}
                    pathname={pathname}
                    aoNavegar={aoNavegar}
                    recolhida={recolhida}
                    contadores={contadores}
                  />
                )
              )}
            </div>
          );
        })}
      </nav>

      <CartaoUsuario perfil={perfil} aoNavegar={aoNavegar} recolhida={recolhida} />
    </>
  );
}

/** Ctrl+B (⌘+B no Mac), fora de campos de texto. */
function ehAtalhoAlternar(evento: KeyboardEvent): boolean {
  if (!(evento.ctrlKey || evento.metaKey) || evento.shiftKey || evento.altKey) return false;
  if (evento.key.toLowerCase() !== "b") return false;
  const alvo = evento.target as HTMLElement | null;
  return !alvo?.closest("input, textarea, select, [contenteditable='true']");
}

/**
 * Navegação lateral com a identidade do GIRO (#132523, petróleo).
 *
 * No desktop nasce recolhida — um trilho só de ícones — e cresce pelo botão no
 * topo ou por Ctrl+B. A escolha fica num cookie que o layout lê no servidor,
 * então a página já chega no estado certo, sem piscar. Recolhida, o nome de
 * cada item aparece numa dica ao passar o mouse ou focar pelo teclado, e os
 * grupos abrem num menu ao lado.
 *
 * Abaixo de 1024px vira barra compacta no topo e a coluna abre como gaveta
 * (Radix Dialog: foco preso, Escape fecha, rolagem do fundo travada); a gaveta
 * é sempre a versão aberta.
 */
export function Sidebar({
  perfil,
  recolhidaInicial = true,
  pendenciasTratamento,
}: {
  perfil: Perfil;
  recolhidaInicial?: boolean;
  /** Tarefas aguardando tratativa (só o admin recebe): vira contador no item Tratamento. */
  pendenciasTratamento?: number;
}) {
  const pathname = usePathname();
  const contadores: Contadores = { [ITEM_TRATAMENTO.href]: pendenciasTratamento };
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [recolhida, setRecolhida] = useState(recolhidaInicial);
  const [dica, setDica] = useState<{ texto: string; topo: number } | null>(null);

  // Trocar de rota (inclusive por botão voltar) fecha a gaveta.
  useEffect(() => {
    setGavetaAberta(false);
  }, [pathname]);

  useEffect(() => {
    document.cookie = `${COOKIE_SIDEBAR}=${recolhida ? "recolhida" : "aberta"}; path=/; max-age=31536000; samesite=lax`;
  }, [recolhida]);

  const alternar = useCallback(() => {
    setDica(null);
    setRecolhida((atual) => !atual);
  }, []);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      // Escape dispensa a dica (WCAG 1.4.13) sem interferir nos menus do Radix.
      if (evento.key === "Escape") {
        setDica(null);
        return;
      }
      if (!ehAtalhoAlternar(evento)) return;
      // Abaixo de 1024px a coluna é gaveta: não há trilho para recolher.
      if (window.matchMedia("(max-width: 1023.98px)").matches) return;
      evento.preventDefault();
      alternar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alternar]);

  // Uma dica só, em posição fixa fora da coluna: dentro dela seria cortada
  // pela rolagem da navegação.
  function mostrarDica(evento: React.SyntheticEvent) {
    if (!recolhida) return;
    const alvo = (evento.target as HTMLElement).closest<HTMLElement>("[data-dica]");
    if (!alvo || alvo.dataset.state === "open") {
      setDica(null);
      return;
    }
    const caixa = alvo.getBoundingClientRect();
    setDica({ texto: alvo.dataset.dica ?? "", topo: caixa.top + caixa.height / 2 });
  }
  const esconderDica = () => setDica(null);

  const rotuloAlternar = recolhida ? "Expandir menu" : "Recolher menu";

  return (
    <>
      <aside
        className="sidebar"
        aria-label="Menu principal"
        data-recolhida={recolhida ? "true" : undefined}
        onPointerOver={mostrarDica}
        onPointerLeave={esconderDica}
        onFocus={mostrarDica}
        onBlur={esconderDica}
        onClick={esconderDica}
      >
        <CorpoSidebar
          perfil={perfil}
          recolhida={recolhida}
          contadores={contadores}
          cabecalhoExtra={
            <button
              type="button"
              className="sidebar__alternar"
              aria-label={rotuloAlternar}
              aria-expanded={!recolhida}
              aria-keyshortcuts="Control+B"
              data-dica={`${rotuloAlternar} · Ctrl+B`}
              onClick={alternar}
            >
              <IconeExpandir />
            </button>
          }
        />
      </aside>

      {recolhida && dica && (
        <div className="sidebar__dica" style={{ top: dica.topo }} aria-hidden>
          {dica.texto}
        </div>
      )}

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
              contadores={contadores}
              aoNavegar={() => setGavetaAberta(false)}
              cabecalhoExtra={
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
