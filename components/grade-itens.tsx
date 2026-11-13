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
import { IconeBusca, IconeReticencias } from "@/components/icones";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Etapa, ItemAberto, ResumoStatus, StatusConformidade, Supervisor } from "@/lib/tipos";

/**
 * A lista do painel, com filtro, ordenação e paginação no navegador.
 *
 * Foi grade de cartões entre 03 e 04/11/2026 e voltou a ser tabela a pedido de
 * Matheus (ver `LinhaItem`).
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
  requisitos,
  resumo,
}: {
  inicial: PaginaItens;
  filtrosIniciais: FiltrosPainel;
  fotosIniciais: Record<string, string>;
  supervisores: Supervisor[];
  polos: string[];
  requisitos: string[];
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
    window.history.replaceState(null, "", busca ? `/radar?${busca}` : "/radar");

    startTransition(() => {
      void buscar(filtros);
    });
  }, [filtros, buscar]);

  const paginaAtual = Math.max(1, Number(filtros.pagina) || 1);
  const ultimaPagina = Math.max(1, Math.ceil(pagina.total / POR_PAGINA));
  const ordem = ehChaveOrdenacao(filtros.ordem) ? filtros.ordem : null;
  const direcao = filtros.dir === "desc" ? "desc" : "asc";

  // Primeiro clique: a direção que responde a pergunta da coluna (nome A→Z,
  // quem vence primeiro, pior status, parado há mais tempo). Segundo: inverte.
  // Terceiro: volta à ordem de prioridade padrão.
  function ordenarPor(chave: ChaveOrdenacao) {
    const padrao = COLUNAS_ORDENAVEIS[chave].ascPadrao ? "asc" : "desc";
    setFiltros((f) => {
      if (f.ordem !== chave) return { ...f, ordem: chave, dir: padrao, pagina: undefined };
      if (f.dir === padrao) return { ...f, dir: padrao === "asc" ? "desc" : "asc", pagina: undefined };
      return { ...f, ordem: undefined, dir: undefined, pagina: undefined };
    });
  }

  const cabecalho = (chave: ChaveOrdenacao, rotulo: string) => (
    <CabecalhoOrdenavel
      rotulo={rotulo}
      ativo={ordem === chave}
      direcao={direcao}
      aoClicar={() => ordenarPor(chave)}
    />
  );

  function irPara(p: number) {
    setFiltros((f) => ({ ...f, pagina: p > 1 ? String(p) : undefined }));
  }

  // Estável entre renders: a busca dos Filtros espera 300 ms e reinicia a
  // espera quando esta função muda.
  const mudarFiltro = useCallback((campo: keyof FiltrosPainel, valor: string) => {
    setFiltros((f) => ({ ...f, [campo]: valor || undefined, pagina: undefined }));
  }, []);

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
        requisitos={requisitos}
        aoMudar={mudarFiltro}
        aoLimpar={() => setFiltros({})}
      />

      {pagina.erro && (
        <p role="alert" className="text-label mb-4">
          Não foi possível carregar os itens: {pagina.erro}
        </p>
      )}

      <div aria-busy={carregando} data-carregando={carregando}>
        <h2 className="sr-only">Itens de pendência em aberto</h2>
        {pagina.itens.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabela">
              <caption className="sr-only">Itens de pendência em aberto</caption>
              <thead>
                <tr>
                  {cabecalho("nome", "Colaborador")}
                  <th scope="col">Requisito</th>
                  <th scope="col">Supervisor</th>
                  {cabecalho("vencimento", "Vencimento")}
                  {cabecalho("status", "Status")}
                  <th scope="col">Etapa</th>
                  {cabecalho("parados", "Parado há")}
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {pagina.itens.map((item) => (
                  <LinhaItem key={item.item_id} item={item} fotoUrl={fotos[item.foto_url ?? ""]} />
                ))}
              </tbody>
            </table>
          </div>
        )}

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
 * Uma linha da lista.
 *
 * Voltou a ser tabela em 04/11/2026, a pedido de Matheus: a grade de cartões
 * (03/11) mostrava seis pessoas por tela, e o trabalho do QSMS é varrer a fila.
 * Dos cartões ficaram o que funcionou — foto, nome que abre o perfil, aviso de
 * janela útil e o menu "⋮". A coluna Requisito é nova: a fila agora mistura
 * ASO e AVP, e o mesmo nome pode aparecer duas vezes.
 */
function LinhaItem({ item, fotoUrl }: { item: ItemAberto; fotoUrl?: string }) {
  const janela = avisoJanelaUtil(item);
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <AvatarColaborador nome={item.nome} fotoUrl={fotoUrl} />
          <div className="min-w-0">
            {/* O nome abre o perfil por cima da lista; o botão "Abrir" leva ao ciclo. */}
            <BotaoNomeColaborador colaboradorId={item.colaborador_id} nome={item.nome} />
            <span className="block text-caption text-ink-faint tabular">
              {item.matricula}
              {item.cargo ? ` · ${item.cargo}` : ""}
            </span>
          </div>
          {janela && <Info>{janela}</Info>}
        </div>
      </td>
      <td className="text-label">{item.requisito}</td>
      <td className="text-label">
        {item.supervisor_nome ?? <span className="text-ink-faint">Sem supervisor</span>}
      </td>
      <td className="tabular">{formatarData(item.data_vencimento)}</td>
      <td>
        <SeloStatus status={item.status as StatusConformidade} dias={item.dias_restantes} titulo />
      </td>
      <td className="text-label">{ETAPA_ROTULO[item.etapa]}</td>
      <td>
        <span className="dias-parados" data-estourado={item.sla_estourado}>
          {item.dias_parados} {item.dias_parados === 1 ? "dia" : "dias"}
        </span>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1.5">
          <Link href={`/qsms/item/${item.item_id}`} className="btn btn--secondary btn--sm">
            Abrir
          </Link>
          <MenuLinha item={item} />
        </div>
      </td>
    </tr>
  );
}

/**
 * Menu "⋮" da linha — o que sobra depois que "Abrir" (a ação de todo dia,
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
 * Cabeçalho de coluna que ordena.
 *
 * `aria-sort` fica no `<th>`, que é onde o leitor de tela procura; a seta é só
 * para quem vê. Coluna inativa mostra uma seta dupla apagada, para dizer que
 * dá para clicar sem precisar passar o mouse em cada uma.
 */
function CabecalhoOrdenavel({
  rotulo,
  ativo,
  direcao,
  aoClicar,
}: {
  rotulo: string;
  ativo: boolean;
  direcao: "asc" | "desc";
  aoClicar: () => void;
}) {
  return (
    <th scope="col" aria-sort={ativo ? (direcao === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="cabecalho-ordenavel" onClick={aoClicar}>
        {rotulo}
        {ativo ? (
          <span data-seta aria-hidden>{direcao === "asc" ? "↑" : "↓"}</span>
        ) : (
          <span aria-hidden className="opacity-40">↕</span>
        )}
      </button>
    </th>
  );
}

const EXPLICACAO_SLA =
  "Cada etapa do ciclo tem um prazo (ex.: 7 dias para o supervisor informar a data, 3 dias para confirmar com a clínica, 5 dias para chegar o documento). Marque para ver só os itens parados na etapa além desse prazo.";

/**
 * Busca e filtros, aplicados ao mudar.
 *
 * A busca espera 300 ms depois da última tecla: sem isso, digitar "MARCOS"
 * dispararia seis consultas e a lista piscaria a cada letra. Os seletores
 * aplicam na hora — é um clique, não uma sequência.
 */
function Filtros({
  filtros,
  supervisores,
  polos,
  requisitos,
  aoMudar,
  aoLimpar,
}: {
  filtros: FiltrosPainel;
  supervisores: Supervisor[];
  polos: string[];
  requisitos: string[];
  aoMudar: (campo: keyof FiltrosPainel, valor: string) => void;
  aoLimpar: () => void;
}) {
  const [texto, setTexto] = useState(filtros.busca ?? "");
  const temFiltro = Object.entries(filtros).some(([k, v]) => v && k !== "ordem" && k !== "dir" && k !== "pagina");

  // "Limpar" zera os filtros por fora; o campo precisa acompanhar.
  useEffect(() => {
    setTexto(filtros.busca ?? "");
  }, [filtros.busca]);

  useEffect(() => {
    if (texto === (filtros.busca ?? "")) return;
    const espera = setTimeout(() => aoMudar("busca", texto.trim()), 300);
    return () => clearTimeout(espera);
  }, [texto, filtros.busca, aoMudar]);

  return (
    <div className="card mb-4 grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grow basis-[280px]">
          <label className="label" htmlFor="f-busca">Buscar colaborador</label>
          <div className="relative">
            <IconeBusca className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              id="f-busca"
              type="search"
              className="field w-full"
              // Inline: o `padding` de `.field` vence a utilitária `pl-10`.
              style={{ paddingLeft: "2.5rem" }}
              placeholder="Nome ou matrícula"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="f-requisito">Requisito</label>
          <select
            id="f-requisito"
            className="field"
            value={filtros.requisito ?? ""}
            onChange={(e) => aoMudar("requisito", e.target.value)}
          >
            <option value="">Todos</option>
            {requisitos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-label">
          <input
            type="checkbox"
            className="size-4"
            checked={filtros.parados === "1"}
            onChange={(e) => aoMudar("parados", e.target.checked ? "1" : "")}
          />
          Só parados além do prazo da etapa
          <Info>{EXPLICACAO_SLA}</Info>
        </label>

        {temFiltro && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={aoLimpar}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
