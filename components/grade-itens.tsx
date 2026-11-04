"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import {
  buscarPaginaItens,
  filtrosParaBusca,
  COLUNAS_ORDENAVEIS,
  ehChaveOrdenacao,
  SEM_SUPERVISOR,
  POR_PAGINA,
  type ChaveOrdenacao,
  type FiltrosPainel,
  type PaginaItens,
} from "@/lib/consulta-itens";
import { BUCKET_FOTOS } from "@/lib/storage";
import {
  ETAPA_ROTULO,
  STATUS_ROTULO,
  ORDEM_STATUS,
  formatarData,
  avisoJanelaUtil,
} from "@/lib/dominio";
import { SeloStatus, CartaoContagem } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { Info } from "@/components/info";
import { usePerfilColaborador } from "@/components/perfil/contexto";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { IconeReticencias } from "@/components/icones";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Etapa, ItemAberto, ResumoStatus, StatusConformidade, Supervisor } from "@/lib/tipos";

/**
 * A grade de cartões do painel, com filtro, ordenação e paginação no navegador.
 *
 * Era tabela até 03/11/2026. Virou grade de cartões no redesign do QSMS
 * (pedido de Matheus, referência "Employees"): cada pessoa com foto, selo e
 * onde o ciclo está, sem rolar oito colunas para o lado.
 *
 * Motivo, medido: cada troca de página ou filtro era uma navegação completa —
 * o servidor refazia sessão, layout e página inteira para trocar 25 linhas.
 * Aqui é uma consulta só, direto ao Postgres.
 *
 * Isto é seguro neste projeto porque `vw_itens_abertos` é `security_invoker` e
 * a RLS filtra por equipe no banco (ver scripts/teste-rls.mjs). O supervisor
 * que abrir o DevTools e refizer a consulta à mão recebe exatamente as mesmas
 * linhas: não há filtro de papel neste arquivo para ele burlar.
 *
 * A primeira página vem pronta do servidor (`inicial`), então o HTML nunca
 * chega vazio e quem entra por link compartilhado vê conteúdo de imediato.
 */
export function GradeItens({
  inicial,
  filtrosIniciais,
  fotosIniciais,
  supervisores,
  polos,
  resumo,
}: {
  inicial: PaginaItens;
  filtrosIniciais: FiltrosPainel;
  fotosIniciais: Record<string, string>;
  supervisores: Supervisor[];
  polos: string[];
  resumo: ResumoStatus | null;
}) {
  const [filtros, setFiltros] = useState<FiltrosPainel>(filtrosIniciais);
  const [pagina, setPagina] = useState<PaginaItens>(inicial);
  const [fotos, setFotos] = useState<Record<string, string>>(fotosIniciais);
  const [carregando, startTransition] = useTransition();

  // A primeira renderização já tem os dados do servidor; buscar de novo seria
  // uma consulta desperdiçada em toda visita.
  const primeiraRenderizacao = useRef(true);
  // Descarta resposta de uma consulta antiga que chegou depois de uma nova:
  // sem isto, clicar rápido em dois filtros pode pintar o resultado do primeiro.
  const requisicao = useRef(0);

  const buscar = useCallback(async (novos: FiltrosPainel) => {
    const meu = ++requisicao.current;
    const supabase = criarClienteNavegador();

    const resultado = await buscarPaginaItens(supabase, novos);
    if (meu !== requisicao.current) return;

    setPagina(resultado);

    const caminhos = [...new Set(resultado.itens.map((i) => i.foto_url).filter((c): c is string => !!c))];
    if (caminhos.length === 0) {
      setFotos({});
      return;
    }

    const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(caminhos, 3600);
    if (meu !== requisicao.current) return;

    const mapa: Record<string, string> = {};
    for (const f of data ?? []) if (f.signedUrl && f.path) mapa[f.path] = f.signedUrl;
    setFotos(mapa);
  }, []);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }

    // `history.replaceState` e não `router.replace`: o endereço precisa
    // continuar compartilhável, mas disparar navegação do Next aqui traria de
    // volta exatamente o round-trip que este componente existe para evitar.
    const busca = filtrosParaBusca(filtros);
    window.history.replaceState(null, "", busca ? `/qsms?${busca}` : "/qsms");

    startTransition(() => {
      void buscar(filtros);
    });
  }, [filtros, buscar]);

  const paginaAtual = Math.max(1, Number(filtros.pagina) || 1);
  const ultimaPagina = Math.max(1, Math.ceil(pagina.total / POR_PAGINA));
  const ordem = ehChaveOrdenacao(filtros.ordem) ? filtros.ordem : null;

  // Sem cabeçalho de coluna para clicar, a ordenação virou um seletor. Cada
  // critério vai na direção que responde a pergunta dele (nome A→Z, quem vence
  // primeiro, quem está parado há mais tempo); inverter não pagava o controle.
  function ordenarPor(chave: ChaveOrdenacao | "") {
    if (!chave) {
      setFiltros((f) => ({ ...f, ordem: undefined, dir: undefined, pagina: undefined }));
      return;
    }
    const dir = COLUNAS_ORDENAVEIS[chave].ascPadrao ? "asc" : "desc";
    setFiltros((f) => ({ ...f, ordem: chave, dir, pagina: undefined }));
  }

  function irPara(p: number) {
    setFiltros((f) => ({ ...f, pagina: p > 1 ? String(p) : undefined }));
  }

  return (
    <>
      {resumo && (
        <>
          <h2 className="sr-only">Contagem por status</h2>
          <div className="grid gap-3 mb-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {ORDEM_STATUS.map((s) => (
              <button
                key={s}
                type="button"
                className="cartao-contagem-botao"
                aria-pressed={filtros.status === s}
                onClick={() =>
                  setFiltros((f) => ({
                    // Clicar no status já ativo desliga o filtro: o cartão é um
                    // interruptor, não um caminho só de ida.
                    ...f,
                    status: f.status === s ? undefined : s,
                    pagina: undefined,
                  }))
                }
              >
                <CartaoContagem
                  status={s}
                  quantidade={Number(resumo[s as keyof ResumoStatus] ?? 0)}
                  ativo={filtros.status === s}
                />
              </button>
            ))}
          </div>
        </>
      )}

      <Filtros
        filtros={filtros}
        ordem={ordem}
        aoOrdenar={ordenarPor}
        supervisores={supervisores}
        polos={polos}
        aoMudar={(campo, valor) =>
          setFiltros((f) => ({ ...f, [campo]: valor || undefined, pagina: undefined }))
        }
        aoLimpar={() => setFiltros({})}
      />

      {pagina.erro && (
        <p role="alert" className="text-label mb-4">
          Não foi possível carregar os itens: {pagina.erro}
        </p>
      )}

      <div aria-busy={carregando} data-carregando={carregando}>
        <h2 className="sr-only">Itens de pendência em aberto</h2>
        <ul className="grade-itens">
          {pagina.itens.map((item, indice) => (
            <li key={item.item_id} style={{ "--i": indice } as React.CSSProperties}>
              <CartaoItem item={item} fotoUrl={fotos[item.foto_url ?? ""]} />
            </li>
          ))}
        </ul>

        {pagina.itens.length === 0 && !carregando && (
          <Vazio>
            {Object.values(filtros).some(Boolean)
              ? "Nenhum item nesse filtro."
              : "Nenhum item em aberto. Use “Gerar itens” para criar as pendências dos próximos 90 dias."}
          </Vazio>
        )}
      </div>

      {pagina.total > 0 && (
        <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-label text-ink-muted m-0 tabular">
            Mostrando {(paginaAtual - 1) * POR_PAGINA + 1}–
            {Math.min(paginaAtual * POR_PAGINA, pagina.total)} de {pagina.total}
          </p>

          {ultimaPagina > 1 && (
            <ul className="flex items-center gap-1 list-none m-0 p-0">
              <li>
                <button
                  type="button"
                  className="paginacao__item"
                  onClick={() => irPara(paginaAtual - 1)}
                  disabled={paginaAtual === 1}
                >
                  <span aria-hidden>‹</span>
                  <span className="sr-only">Página anterior</span>
                </button>
              </li>

              {janelaDePaginas(paginaAtual, ultimaPagina).map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="paginacao__item"
                    aria-current={p === paginaAtual ? "page" : undefined}
                    onClick={() => irPara(p)}
                  >
                    {p}
                  </button>
                </li>
              ))}

              <li>
                <button
                  type="button"
                  className="paginacao__item"
                  onClick={() => irPara(paginaAtual + 1)}
                  disabled={paginaAtual === ultimaPagina}
                >
                  <span aria-hidden>›</span>
                  <span className="sr-only">Próxima página</span>
                </button>
              </li>
            </ul>
          )}
        </nav>
      )}
    </>
  );
}

/** Janela de cinco páginas ao redor da atual. Onze números não localizam ninguém. */
function janelaDePaginas(atual: number, ultima: number): number[] {
  const inicio = Math.max(1, Math.min(atual - 2, ultima - 4));
  const fim = Math.min(ultima, inicio + 4);
  const paginas = [];
  for (let p = inicio; p <= fim; p++) paginas.push(p);
  return paginas;
}

/**
 * Dias até o vencimento, no canto do cartão.
 *
 * É o número que se lê primeiro ao varrer a grade (pedido de Matheus), então
 * vai grande e sem cor: o semáforo continua só no selo, e o rótulo embaixo diz
 * de que lado do prazo a pessoa está.
 */
function DiasParaVencer({ item }: { item: ItemAberto }) {
  const dias = item.dias_restantes;
  const [numero, rotulo] =
    dias === null
      ? ["—", "sem data"]
      : dias < 0
        ? [String(Math.abs(dias)), Math.abs(dias) === 1 ? "dia vencido" : "dias vencido"]
        : dias === 0
          ? ["0", "vence hoje"]
          : [String(dias), dias === 1 ? "dia" : "dias"];

  return (
    <span
      className="cartao-item__dias"
      title={item.data_vencimento ? `Vencimento: ${formatarData(item.data_vencimento)}` : "Sem data de referência"}
    >
      <span className="cartao-item__dias-numero tabular">{numero}</span>
      <span className="cartao-item__dias-rotulo">{rotulo}</span>
    </span>
  );
}

/**
 * Cartão de um item no formato da referência "Employees": foto no centro, nome,
 * cargo e selo, e embaixo só o que se precisa ver de relance — supervisor e
 * etapa. O resto (com quem está, há quanto tempo parado, histórico) fica no
 * perfil e na tela do item.
 */
function CartaoItem({ item, fotoUrl }: { item: ItemAberto; fotoUrl?: string }) {
  const janela = avisoJanelaUtil(item);
  return (
    <article className="card card--interativo cartao-item">
      <div className="cartao-item__canto cartao-item__canto--esquerda">
        <DiasParaVencer item={item} />
        {janela && <Info>{janela}</Info>}
      </div>
      <div className="cartao-item__canto cartao-item__canto--direita">
        <MenuLinha item={item} />
      </div>

      <AvatarColaborador nome={item.nome} fotoUrl={fotoUrl} tamanho={76} />

      {/* O nome abre o perfil por cima da lista; o botão "Abrir" leva ao ciclo. */}
      <BotaoNomeColaborador
        colaboradorId={item.colaborador_id}
        nome={item.nome}
        className="cartao-item__nome"
      />
      <span className="cartao-item__cargo">{item.cargo ?? "Sem cargo"}</span>
      <SeloStatus status={item.status as StatusConformidade} dias={null} titulo />

      <dl className="cartao-item__dados">
        <div>
          <dt>Supervisor</dt>
          <dd>{item.supervisor_nome ?? "Sem supervisor"}</dd>
        </div>
        <div>
          <dt>Etapa</dt>
          <dd>{ETAPA_ROTULO[item.etapa]}</dd>
        </div>
      </dl>

      <Link href={`/qsms/item/${item.item_id}`} className="btn btn--secondary btn--sm w-full cartao-item__abrir">
        Abrir
      </Link>
    </article>
  );
}

/**
 * Menu "⋮" do cartão — o que sobra depois que "Abrir" (a ação de todo dia,
 * trabalhar o ciclo) ficou como botão visível.
 *
 * Só duas entradas de propósito. O painel já tem aba de Histórico e o menu
 * levava direto a ela, mas um atalho que só pula um clique dentro de uma tela
 * que vai abrir de qualquer jeito não paga o item a mais para ler. E "abrir em
 * tela cheia" oferecia uma segunda maneira de ver a mesma pessoa, com aparência
 * diferente — quem clicava por engano perdia a posição na fila, que é
 * justamente o que o painel existe para evitar.
 */
function MenuLinha({ item }: { item: ItemAberto }) {
  const { abrir: abrirPerfil } = usePerfilColaborador();
  // Some sozinho depois de 1,5s — não depende do menu continuar aberto, então
  // o clique fecha o menu normalmente, como qualquer outro item.
  const [copiado, setCopiado] = useState(false);

  function copiarLink() {
    navigator.clipboard.writeText(`${window.location.origin}/qsms/item/${item.item_id}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="btn btn--secondary btn--icone"
          aria-label={`Mais ações — ${item.nome}`}
          title={copiado ? "Link copiado!" : undefined}
        >
          <IconeReticencias />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => abrirPerfil(item.colaborador_id)}>
          Ver colaborador
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={copiarLink}>Copiar link do item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Filtros que aplicam ao mudar, sem botão de confirmar.
 *
 * Antes era um `<form method="get">`: cada filtro recarregava a página inteira.
 * Agora cada mudança dispara uma consulta, e o resultado chega antes de a
 * pessoa alcançar onde ficava o botão — então o botão deixou de ter função.
 */
function Filtros({
  filtros,
  ordem,
  aoOrdenar,
  supervisores,
  polos,
  aoMudar,
  aoLimpar,
}: {
  filtros: FiltrosPainel;
  ordem: ChaveOrdenacao | null;
  aoOrdenar: (chave: ChaveOrdenacao | "") => void;
  supervisores: Supervisor[];
  polos: string[];
  aoMudar: (campo: keyof FiltrosPainel, valor: string) => void;
  aoLimpar: () => void;
}) {
  const temFiltro = Object.values(filtros).some(Boolean);

  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="f-status">Status</label>
        <select
          id="f-status"
          className="field"
          value={filtros.status ?? ""}
          onChange={(e) => aoMudar("status", e.target.value)}
        >
          <option value="">Todos</option>
          {ORDEM_STATUS.map((s) => (
            <option key={s} value={s}>{STATUS_ROTULO[s]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="f-etapa">Etapa</label>
        <select
          id="f-etapa"
          className="field"
          value={filtros.etapa ?? ""}
          onChange={(e) => aoMudar("etapa", e.target.value)}
        >
          <option value="">Todas</option>
          {(Object.keys(ETAPA_ROTULO) as Etapa[])
            .filter((e) => e !== "concluido")
            .map((e) => (
              <option key={e} value={e}>{ETAPA_ROTULO[e]}</option>
            ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="f-supervisor">Supervisor</label>
        <select
          id="f-supervisor"
          className="field"
          value={filtros.supervisor ?? ""}
          onChange={(e) => aoMudar("supervisor", e.target.value)}
        >
          <option value="">Todos</option>
          <option value={SEM_SUPERVISOR}>Sem supervisor</option>
          {supervisores.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
      </div>

      {polos.length > 1 && (
        <div>
          <label className="label" htmlFor="f-polo">Polo</label>
          <select
            id="f-polo"
            className="field"
            value={filtros.polo ?? ""}
            onChange={(e) => aoMudar("polo", e.target.value)}
          >
            <option value="">Todos</option>
            {polos.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="f-ordem">Ordenar por</label>
        <select
          id="f-ordem"
          className="field"
          value={ordem ?? ""}
          onChange={(e) => aoOrdenar(e.target.value as ChaveOrdenacao | "")}
        >
          <option value="">Prioridade</option>
          <option value="vencimento">Vence primeiro</option>
          <option value="parados">Parado há mais tempo</option>
          <option value="nome">Nome</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-label h-[42px]">
        <input
          type="checkbox"
          className="size-4"
          checked={filtros.parados === "1"}
          onChange={(e) => aoMudar("parados", e.target.checked ? "1" : "")}
        />
        Só SLA estourado
      </label>

      {temFiltro && (
        <button type="button" className="btn btn--secondary" onClick={aoLimpar}>
          Limpar
        </button>
      )}
    </div>
  );
}
