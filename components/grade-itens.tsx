"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import {
  buscarPaginaItens,
  contarItensPorEtapa,
  filtrosParaBusca,
  COLUNAS_ORDENAVEIS,
  ehChaveOrdenacao,
  SEM_SUPERVISOR,
  POR_PAGINA,
  type ChaveOrdenacao,
  type Equipe,
  type FiltrosPainel,
  type PaginaItens,
} from "@/lib/consulta-itens";
import { ETAPAS_ABERTAS } from "@/lib/regras-dashboard";
import { BUCKET_FOTOS } from "@/lib/storage";
import {
  ETAPA_ROTULO,
  DONO_ROTULO,
  STATUS_ROTULO,
  ORDEM_STATUS,
  formatarData,
  avisoJanelaUtil,
} from "@/lib/dominio";
import { SeloStatus } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { Info } from "@/components/info";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { IconeBusca } from "@/components/icones";
import { AcoesLinha } from "@/components/radar/botao-acao-linha";
import { CartoesEtapa } from "@/components/radar/cartoes-etapa";
import { FiltroSuspenso } from "@/components/filtro-suspenso";
import type { AoConcluir } from "@/components/formularios-item";
import type { Etapa, ItemAberto, Papel, StatusConformidade, Supervisor } from "@/lib/tipos";

/** O que `GradeItens` precisa saber de quem está olhando, já resolvido no servidor. */
export interface EscopoRadar {
  /** Papel de quem olha: decide quais filas a faixa "Para você agir" mostra. */
  papel: Papel;
  equipePadrao: Equipe;
  /** `supervisor_id` do perfil logado; null = sem equipe vinculada. */
  supervisorId: string | null;
  /** Falso para QSMS/admin sem vínculo: a opção "Minha equipe" nem aparece. */
  podeEscolherMinha: boolean;
}

/**
 * A lista do Radar, com filtro, ordenação e paginação no navegador.
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
  contagensIniciais,
  escopo,
}: {
  inicial: PaginaItens;
  filtrosIniciais: FiltrosPainel;
  fotosIniciais: Record<string, string>;
  supervisores: Supervisor[];
  polos: string[];
  requisitos: string[];
  /** Contagens da faixa "Para você agir" por etapa, calculadas no servidor. */
  contagensIniciais: Record<string, number>;
  escopo: EscopoRadar;
}) {
  const [filtros, setFiltros] = useState<FiltrosPainel>(filtrosIniciais);
  const [pagina, setPagina] = useState<PaginaItens>(inicial);
  const [fotos, setFotos] = useState<Record<string, string>>(fotosIniciais);
  const [contagens, setContagens] = useState<Record<string, number>>(contagensIniciais);
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

    const resultado = await buscarPaginaItens(supabase, novos, escopo.supervisorId);
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
  }, [escopo.supervisorId]);

  // Contagens da faixa: mesma regra e mesmo escopo da lista (ver
  // `contarItensPorEtapa`). Roda quando o escopo muda e depois de cada ação.
  const requisicaoContagem = useRef(0);
  const atualizarContagens = useCallback(
    async (equipe: Equipe) => {
      const meu = ++requisicaoContagem.current;
      const novas = await contarItensPorEtapa(
        criarClienteNavegador(),
        ETAPAS_ABERTAS,
        equipe,
        escopo.supervisorId
      );
      if (meu === requisicaoContagem.current) setContagens(novas);
    },
    [escopo.supervisorId]
  );

  const equipeAtual = filtros.equipe ?? escopo.equipePadrao;
  const primeiraContagem = useRef(true);
  useEffect(() => {
    if (primeiraContagem.current) {
      primeiraContagem.current = false;
      return;
    }
    void atualizarContagens(equipeAtual);
  }, [equipeAtual, atualizarContagens]);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }

    // `history.replaceState` e não `router.replace`: o endereço precisa
    // continuar compartilhável, mas disparar navegação do Next aqui traria de
    // volta exatamente o round-trip que este componente existe para evitar.
    const busca = filtrosParaBusca(filtros, escopo.equipePadrao);
    window.history.replaceState(null, "", busca ? `/radar?${busca}` : "/radar");

    startTransition(() => {
      void buscar(filtros);
    });
  }, [filtros, buscar, escopo.equipePadrao]);

  const paginaAtual = Math.max(1, Number(filtros.pagina) || 1);
  const ultimaPagina = Math.max(1, Math.ceil(pagina.total / POR_PAGINA));
  const ordem = ehChaveOrdenacao(filtros.ordem) ? filtros.ordem : null;
  const direcao = filtros.dir === "desc" ? "desc" : "asc";

  // Primeiro clique: a direção que responde a pergunta da coluna (nome A→Z,
  // quem vence primeiro, pior status). Segundo: inverte.
  // Terceiro: volta à ordem de prioridade padrão.
  function ordenarPor(chave: ChaveOrdenacao) {
    const padrao = COLUNAS_ORDENAVEIS[chave].ascPadrao ? "asc" : "desc";
    setFiltros((f) => {
      if (f.ordem !== chave) return { ...f, ordem: chave, dir: padrao, pagina: undefined };
      if (f.dir === padrao) return { ...f, dir: padrao === "asc" ? "desc" : "asc", pagina: undefined };
      return { ...f, ordem: undefined, dir: undefined, pagina: undefined };
    });
  }

  const equipe = filtros.equipe ?? escopo.equipePadrao;
  const semEquipe = equipe === "minha" && !escopo.supervisorId;
  // Escopo, ordem e página não contam como "filtro": a lista sem eles continua
  // sendo o Radar padrão.
  const temFiltro = Object.entries(filtros).some(
    ([k, v]) => v && k !== "equipe" && k !== "ordem" && k !== "dir" && k !== "pagina"
  );

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

  // Depois de uma ação da linha: a mensagem do servidor fica acima da lista,
  // a página atual é consultada de novo (o item mudou de etapa ou saiu) e o
  // `router.refresh()` atualiza o que vem do servidor — contagens do topo e a
  // faixa da base; as contagens da faixa "Para você agir" são refeitas junto.
  // Os filtros vão por ref para o callback ser estável: ele
  // desce até os formulários, que avisam a conclusão num efeito.
  const router = useRouter();
  const [avisoAcao, setAvisoAcao] = useState<string | null>(null);
  const filtrosAtuais = useRef(filtros);
  useEffect(() => {
    filtrosAtuais.current = filtros;
  }, [filtros]);

  // Concluir ou cancelar tira a linha da lista, e com ela o botão que tinha o
  // foco: o navegador o joga no <body> e quem usa teclado volta ao topo da
  // página. Depois da nova consulta, se o foco se perdeu assim, ele vai para o
  // aviso com a mensagem. Se a linha continua (mudou só de etapa), fica onde
  // está.
  const avisoRef = useRef<HTMLDivElement>(null);
  const focarAvisoSePerdido = useRef(false);
  useEffect(() => {
    if (!focarAvisoSePerdido.current) return;
    focarAvisoSePerdido.current = false;
    const ativo = document.activeElement;
    if (!ativo || ativo === document.body) avisoRef.current?.focus();
  }, [pagina]);

  const aoConcluirAcao: AoConcluir = useCallback(
    (mensagem) => {
      focarAvisoSePerdido.current = true;
      setAvisoAcao(mensagem);
      router.refresh();
      startTransition(() => {
        void buscar(filtrosAtuais.current);
        void atualizarContagens(filtrosAtuais.current.equipe ?? escopo.equipePadrao);
      });
    },
    [buscar, atualizarContagens, router, escopo.equipePadrao]
  );

  return (
    <>
      <CartoesEtapa
        papel={escopo.papel}
        contagens={contagens}
        etapaAtiva={filtros.etapa}
        // O filtro vai para o estado, a URL acompanha e a lista é consultada de
        // novo, sem recarregar a página.
        aoEscolher={(etapa) => mudarFiltro("etapa", etapa ?? "")}
      />

      <Filtros
        filtros={filtros}
        escopo={escopo}
        supervisores={supervisores}
        polos={polos}
        requisitos={requisitos}
        aoMudar={mudarFiltro}
        aoLimpar={() => setFiltros({ equipe: filtros.equipe })}
      />

      {avisoAcao && (
        <div
          ref={avisoRef}
          tabIndex={-1}
          role="status"
          className="card mb-4 flex items-center justify-between gap-3 text-label"
        >
          <span>{avisoAcao}</span>
          <button
            type="button"
            className="btn btn--secondary btn--sm shrink-0"
            onClick={() => setAvisoAcao(null)}
          >
            Fechar
          </button>
        </div>
      )}

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
                  <th scope="col" className="text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pagina.itens.map((item) => (
                  <LinhaItem
                    key={item.item_id}
                    item={item}
                    fotoUrl={fotos[item.foto_url ?? ""]}
                    aoConcluirAcao={aoConcluirAcao}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagina.itens.length === 0 && !carregando && (
          <Vazio>
            {semEquipe
              ? "Você ainda não tem equipe vinculada. Escolha “Todos” para ver a UEN."
              : temFiltro
                ? "Nenhum item nesse filtro."
                : equipe === "minha"
                  ? "Nenhum item da sua equipe no Radar."
                  : "Nenhum item no Radar. Use “Gerar itens” para criar as pendências dos próximos 90 dias."}
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
 *
 * Desde 13/11 a última coluna traz o botão do próximo passo da etapa e o menu
 * com o resto (components/radar/botao-acao-linha.tsx). O responsável pela
 * etapa vai sob o nome dela, em grafite: é informação, não semáforo.
 */
function LinhaItem({
  item,
  fotoUrl,
  aoConcluirAcao,
}: {
  item: ItemAberto;
  fotoUrl?: string;
  aoConcluirAcao: AoConcluir;
}) {
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
      <td className="text-label">
        {ETAPA_ROTULO[item.etapa]}
        {item.dono !== "ninguem" && (
          <span className="block mt-0.5">
            <span className="etiqueta etiqueta--neutra" title="Quem faz o próximo passo">
              <span className="sr-only">Responsável: </span>
              {DONO_ROTULO[item.dono]}
            </span>
          </span>
        )}
      </td>
      <td>
        <AcoesLinha item={item} aoConcluir={aoConcluirAcao} />
      </td>
    </tr>
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
  escopo,
  supervisores,
  polos,
  requisitos,
  aoMudar,
  aoLimpar,
}: {
  filtros: FiltrosPainel;
  escopo: EscopoRadar;
  supervisores: Supervisor[];
  polos: string[];
  requisitos: string[];
  aoMudar: (campo: keyof FiltrosPainel, valor: string) => void;
  aoLimpar: () => void;
}) {
  const [texto, setTexto] = useState(filtros.busca ?? "");
  const temFiltro = Object.entries(filtros).some(
    ([k, v]) => v && k !== "equipe" && k !== "ordem" && k !== "dir" && k !== "pagina"
  );
  const equipe = filtros.equipe ?? escopo.equipePadrao;

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
        <div role="group" aria-labelledby="f-equipe-rotulo">
          <span id="f-equipe-rotulo" className="sr-only">Equipe</span>
          <div className="flex gap-1.5">
            {escopo.podeEscolherMinha && (
              <button
                type="button"
                className={`btn ${equipe === "minha" ? "btn--primary" : "btn--secondary"}`}
                aria-pressed={equipe === "minha"}
                onClick={() => aoMudar("equipe", "minha")}
              >
                Minha equipe
              </button>
            )}
            <button
              type="button"
              className={`btn ${equipe === "todas" ? "btn--primary" : "btn--secondary"}`}
              aria-pressed={equipe === "todas"}
              onClick={() => aoMudar("equipe", "todas")}
            >
              Todos
            </button>
          </div>
        </div>

        <div className="grow basis-[280px]">
          <label className="sr-only" htmlFor="f-busca">Buscar colaborador</label>
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

      </div>

      {/* Pílulas no lugar dos <select>: o valor aparece no próprio botão e o
          filtro aplicado fica petróleo. A etapa saiu daqui: está nos cartões. */}
      <div className="flex flex-wrap items-center gap-2">
        <FiltroSuspenso
          rotulo="Requisito"
          valor={filtros.requisito ?? ""}
          opcoes={requisitos.map((r) => ({ valor: r, rotulo: r }))}
          aoMudar={(v) => aoMudar("requisito", v)}
        />
        <FiltroSuspenso
          rotulo="Status"
          valor={filtros.status ?? ""}
          opcoes={ORDEM_STATUS.map((s) => ({ valor: s, rotulo: STATUS_ROTULO[s] }))}
          aoMudar={(v) => aoMudar("status", v)}
        />
        <FiltroSuspenso
          rotulo="Supervisor"
          valor={filtros.supervisor ?? ""}
          opcoes={[
            { valor: SEM_SUPERVISOR, rotulo: "Sem supervisor" },
            ...supervisores.map((s) => ({ valor: s.id, rotulo: s.nome })),
          ]}
          aoMudar={(v) => aoMudar("supervisor", v)}
        />
        {polos.length > 1 && (
          <FiltroSuspenso
            rotulo="Polo"
            valor={filtros.polo ?? ""}
            opcoes={polos.map((p) => ({ valor: p, rotulo: p }))}
            aoMudar={(v) => aoMudar("polo", v)}
          />
        )}
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            className="filtro-suspenso"
            aria-pressed={filtros.parados === "1"}
            onClick={() => aoMudar("parados", filtros.parados === "1" ? "" : "1")}
          >
            Só parados além do prazo
          </button>
          <Info>{EXPLICACAO_SLA}</Info>
        </span>

        {temFiltro && (
          <button type="button" className="btn btn--fantasma btn--sm ml-auto" onClick={aoLimpar}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
