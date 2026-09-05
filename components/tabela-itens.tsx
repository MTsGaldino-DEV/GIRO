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
  DONO_ROTULO,
  STATUS_ROTULO,
  ORDEM_STATUS,
  formatarData,
  avisoJanelaUtil,
} from "@/lib/dominio";
import { SeloStatus, CartaoContagem } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import type { Etapa, ItemAberto, ResumoStatus, StatusConformidade, Supervisor } from "@/lib/tipos";

/**
 * A tabela do painel, com filtro, ordenação e paginação no navegador.
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
export function TabelaItens({
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
  const direcao = filtros.dir === "desc" ? "desc" : "asc";

  function ordenarPor(chave: ChaveOrdenacao) {
    const ativa = ordem === chave;
    const proxima = ativa
      ? direcao === "asc" ? "desc" : "asc"
      : COLUNAS_ORDENAVEIS[chave].ascPadrao ? "asc" : "desc";
    setFiltros((f) => ({ ...f, ordem: chave, dir: proxima, pagina: undefined }));
  }

  function irPara(p: number) {
    setFiltros((f) => ({ ...f, pagina: p > 1 ? String(p) : undefined }));
  }

  const Cabecalho = ({ chave, rotulo }: { chave: ChaveOrdenacao; rotulo: string }) => {
    const ativa = ordem === chave;
    return (
      <th scope="col" aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => ordenarPor(chave)} className="cabecalho-ordenavel">
          {rotulo}
          {ativa && <span data-seta aria-hidden>{direcao === "asc" ? "↑" : "↓"}</span>}
        </button>
      </th>
    );
  };

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

      <div className="overflow-x-auto" aria-busy={carregando} data-carregando={carregando}>
        <table className="tabela">
          <caption className="sr-only">Itens de pendência em aberto</caption>
          <thead>
            <tr>
              <Cabecalho chave="nome" rotulo="Colaborador" />
              <th scope="col">Supervisor</th>
              <Cabecalho chave="vencimento" rotulo="Vencimento" />
              <Cabecalho chave="status" rotulo="Status" />
              <th scope="col">Etapa</th>
              <th scope="col">Com quem</th>
              <Cabecalho chave="parados" rotulo="Dias parados" />
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {pagina.itens.map((item) => (
              <Linha key={item.item_id} item={item} fotoUrl={fotos[item.foto_url ?? ""]} />
            ))}
          </tbody>
        </table>

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

function Linha({ item, fotoUrl }: { item: ItemAberto; fotoUrl?: string }) {
  const janela = avisoJanelaUtil(item);
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <AvatarColaborador nome={item.nome} fotoUrl={fotoUrl} />
          <div className="min-w-0">
            {/* O nome leva à pessoa; o botão "Abrir" leva ao ciclo. */}
            <Link href={`/qsms/colaborador/${item.colaborador_id}`} className="font-medium no-underline">
              {item.nome}
            </Link>
            <span className="block text-caption text-ink-faint tabular">
              {item.matricula}
              {item.cargo ? ` · ${item.cargo}` : ""}
            </span>
            {janela && (
              <span className="block text-caption text-ink-muted mt-1 max-w-[42ch]">{janela}</span>
            )}
          </div>
        </div>
      </td>
      <td className="text-label">
        {item.supervisor_nome ?? <span className="text-ink-faint">Sem supervisor</span>}
      </td>
      <td className="tabular">{formatarData(item.data_vencimento)}</td>
      <td>
        <SeloStatus status={item.status as StatusConformidade} dias={item.dias_restantes} titulo />
      </td>
      <td className="text-label">{ETAPA_ROTULO[item.etapa]}</td>
      <td className="text-label">{DONO_ROTULO[item.dono]}</td>
      <td>
        <span className="dias-parados" data-estourado={item.sla_estourado}>
          {item.dias_parados}d
        </span>
      </td>
      <td>
        <Link href={`/qsms/item/${item.item_id}`} className="btn btn--secondary">
          Abrir
        </Link>
      </td>
    </tr>
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
  supervisores,
  polos,
  aoMudar,
  aoLimpar,
}: {
  filtros: FiltrosPainel;
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
