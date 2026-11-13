"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import {
  POR_PAGINA_COLABORADORES,
  SEM_SUPERVISOR,
  consultarColaboradores,
  filtrosParaBusca,
  limparBusca,
  type DadosColaboradores,
  type EquipeColaboradores,
  type FiltrosColaboradores,
  type PessoaLista,
  type SituacaoQuadro,
} from "@/lib/regras-colaboradores";
import { BUCKET_FOTOS } from "@/lib/storage";
import { ORDEM_STATUS, STATUS_ROTULO } from "@/lib/dominio";
import { alternarAtivo } from "@/app/(app)/qsms/colaborador/[id]/cadastro/acoes";
import { SeloStatus } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { IconeBusca } from "@/components/icones";

/** O que a lista precisa saber de quem olha, já resolvido no servidor. */
export interface EscopoColaboradores {
  equipePadrao: EquipeColaboradores;
  /** `supervisor_id` do perfil logado; null = sem equipe vinculada. */
  supervisorId: string | null;
  /** Falso para quem não tem vínculo: "Minha equipe" nem aparece. */
  podeEscolherMinha: boolean;
}

type Aviso = { tipo: "ok"; mensagem: string } | { tipo: "erro"; mensagem: string };

/** Janela de cinco páginas ao redor da atual, como no Radar. */
function janelaDePaginas(atual: number, ultima: number): number[] {
  const inicio = Math.max(1, Math.min(atual - 2, ultima - 4));
  const fim = Math.min(ultima, inicio + 4);
  const paginas = [];
  for (let p = inicio; p <= fim; p++) paginas.push(p);
  return paginas;
}

/**
 * A lista de Colaboradores: todos da UEN, ativos ou desligados.
 *
 * A página lê as ~250 pessoas uma vez (`dados`) e este componente filtra e
 * pagina em memória: trocar filtro ou página é instantâneo e não volta ao
 * servidor. `router.refresh()` traz `dados` novos depois de uma reativação.
 * O que cada papel pode ver continua sendo da RLS, na leitura.
 *
 * O endereço acompanha os filtros (`replaceState`, sem navegação do Next) para
 * o link continuar compartilhável.
 *
 * Cores do semáforo só no `SeloStatus`. Reativar é ação: petróleo e grafite.
 */
export function ListaColaboradores({
  dados,
  filtrosIniciais,
  fotosIniciais,
  supervisores,
  requisitos,
  escopo,
}: {
  dados: DadosColaboradores;
  filtrosIniciais: FiltrosColaboradores;
  fotosIniciais: Record<string, string>;
  supervisores: { id: string; nome: string }[];
  requisitos: string[];
  escopo: EscopoColaboradores;
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState<FiltrosColaboradores>(filtrosIniciais);
  const [fotos, setFotos] = useState<Record<string, string>>(fotosIniciais);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const resultado = useMemo(
    () => consultarColaboradores(dados, filtros, escopo.supervisorId),
    [dados, filtros, escopo.supervisorId]
  );
  const { linhas, total, pagina, totalPaginas } = resultado;

  // Navegação por link (banner, menu, link antigo) para outro filtro da mesma
  // página: o Next mantém este componente montado e só troca `filtrosIniciais`,
  // então o estado precisaria ser ressincronizado. Só age quando o prop mudou em
  // relação ao prop anterior E difere dos filtros atuais do cliente. Depois de
  // um `router.refresh()` os dois concordam (o endereço já leva os filtros do
  // cliente), e aí nada acontece: o aviso, o foco e a busca digitada ficam.
  const propAnterior = useRef(filtrosParaBusca(filtrosIniciais, escopo.equipePadrao));
  useEffect(() => {
    const novo = filtrosParaBusca(filtrosIniciais, escopo.equipePadrao);
    if (novo === propAnterior.current) return;
    propAnterior.current = novo;
    setFiltros((atuais) =>
      filtrosParaBusca(atuais, escopo.equipePadrao) === novo ? atuais : filtrosIniciais
    );
  }, [filtrosIniciais, escopo.equipePadrao]);

  // Endereço compartilhável. Pula a primeira renderização: o servidor já
  // abriu a página nesse endereço.
  const primeiraRenderizacao = useRef(true);
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const busca = filtrosParaBusca({ ...filtros, pagina }, escopo.equipePadrao);
    window.history.replaceState(null, "", busca ? `/colaboradores?${busca}` : "/colaboradores");
  }, [filtros, pagina, escopo.equipePadrao]);

  // Fotos: o servidor assina as da primeira página; as das outras páginas são
  // assinadas aqui, em lote e só as que faltam (RLS do bucket decide o acesso).
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  const caminhosVisiveis = linhas.map((l) => l.foto_url ?? "").join("|");
  useEffect(() => {
    const faltam = [
      ...new Set(
        linhas.map((l) => l.foto_url).filter((c): c is string => !!c && !(c in fotosRef.current))
      ),
    ];
    if (faltam.length === 0) return;
    let ativo = true;
    void (async () => {
      const { data } = await criarClienteNavegador().storage.from(BUCKET_FOTOS).createSignedUrls(faltam, 3600);
      if (!ativo) return;
      const novas: Record<string, string> = {};
      for (const f of data ?? []) if (f.signedUrl && f.path) novas[f.path] = f.signedUrl;
      setFotos((atuais) => ({ ...atuais, ...novas }));
    })();
    return () => {
      ativo = false;
    };
    // `caminhosVisiveis` resume `linhas`: só refaz quando as fotos da página mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminhosVisiveis]);

  const mudar = useCallback(<K extends keyof FiltrosColaboradores>(campo: K, valor: FiltrosColaboradores[K]) => {
    setFiltros((f) => ({ ...f, [campo]: valor, pagina: 1 }));
  }, []);

  function mudarSituacao(situacao: SituacaoQuadro) {
    // Desligados não têm status nem requisito: os dois filtros saem junto.
    setFiltros((f) => ({ ...f, situacao, status: undefined, requisito: undefined, pagina: 1 }));
    setAviso(null);
  }

  const irPara = (p: number) => setFiltros((f) => ({ ...f, pagina: p }));

  // Reativar tira a linha da lista (e com ela o botão que tinha o foco): o
  // navegador joga o foco no <body>. Se isso acontecer, ele vai para o aviso.
  const avisoRef = useRef<HTMLDivElement>(null);
  const focarAvisoSePerdido = useRef(false);
  useEffect(() => {
    if (!focarAvisoSePerdido.current) return;
    focarAvisoSePerdido.current = false;
    const ativo = document.activeElement;
    if (!ativo || ativo === document.body) avisoRef.current?.focus();
  }, [dados]);

  async function reativar(pessoa: PessoaLista) {
    const formulario = new FormData();
    formulario.set("id", pessoa.colaborador_id);
    formulario.set("ativo", "true");
    formulario.set("origem", "Lista de Colaboradores");

    const r = await alternarAtivo(null, formulario);
    if (!r.ok) {
      setAviso({ tipo: "erro", mensagem: r.erro });
      return;
    }
    focarAvisoSePerdido.current = true;
    setAviso({ tipo: "ok", mensagem: `${pessoa.nome}: ${r.mensagem}` });
    router.refresh();
  }

  const temFiltro = !!(filtros.busca || filtros.status || filtros.requisito || filtros.supervisor);
  const desligados = filtros.situacao === "desligados";

  return (
    <>
      <Filtros
        filtros={filtros}
        escopo={escopo}
        supervisores={supervisores}
        requisitos={requisitos}
        aoMudar={mudar}
        aoMudarSituacao={mudarSituacao}
        aoLimpar={() =>
          setFiltros((f) => ({ ...f, busca: "", status: undefined, requisito: undefined, supervisor: undefined, pagina: 1 }))
        }
        temFiltro={temFiltro}
      />

      {/* Sempre no DOM, para o leitor de tela anunciar o que entra nele. */}
      <div ref={avisoRef} tabIndex={-1} role="status" className="outline-none">
        {aviso?.tipo === "ok" && (
          <div className="card mb-4 flex items-center justify-between gap-3 text-label">
            <span>{aviso.mensagem}</span>
            <button type="button" className="btn btn--secondary btn--sm shrink-0" onClick={() => setAviso(null)}>
              Fechar
            </button>
          </div>
        )}
      </div>
      {aviso?.tipo === "erro" && (
        <div role="alert" className="card mb-4 flex items-center justify-between gap-3 text-label">
          <span>{aviso.mensagem}</span>
          <button type="button" className="btn btn--secondary btn--sm shrink-0" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      )}

      {resultado.erro && (
        <p role="alert" className="text-label mb-4">
          {resultado.erro}
        </p>
      )}

      <div>
        <h2 className="sr-only">{desligados ? "Colaboradores desligados" : "Colaboradores ativos"}</h2>
        {linhas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabela">
              <caption className="sr-only">
                {desligados ? "Colaboradores desligados" : "Colaboradores ativos, do pior status ao melhor"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Colaborador</th>
                  <th scope="col">Matrícula</th>
                  <th scope="col">Cargo</th>
                  <th scope="col">Supervisor</th>
                  <th scope="col">{desligados ? "Situação" : "Status"}</th>
                  {desligados && (
                    <th scope="col" className="text-right">
                      Ação
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {linhas.map((pessoa) => (
                  <LinhaColaborador
                    key={pessoa.colaborador_id}
                    pessoa={pessoa}
                    fotoUrl={fotos[pessoa.foto_url ?? ""]}
                    aoReativar={() => reativar(pessoa)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {linhas.length === 0 && !resultado.erro && (
          <Vazio>{mensagemVazio({ desligados, temFiltro, equipe: filtros.equipe })}</Vazio>
        )}
      </div>

      {total > 0 && (
        <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-label text-ink-muted m-0 tabular">
            Mostrando {(pagina - 1) * POR_PAGINA_COLABORADORES + 1}–
            {Math.min(pagina * POR_PAGINA_COLABORADORES, total)} de {total}
          </p>

          {totalPaginas > 1 && (
            <ul className="flex items-center gap-1 list-none m-0 p-0">
              <li>
                <button
                  type="button"
                  className="paginacao__item"
                  onClick={() => irPara(pagina - 1)}
                  disabled={pagina === 1}
                >
                  <span aria-hidden>‹</span>
                  <span className="sr-only">Página anterior</span>
                </button>
              </li>
              {janelaDePaginas(pagina, totalPaginas).map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="paginacao__item"
                    aria-current={p === pagina ? "page" : undefined}
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
                  onClick={() => irPara(pagina + 1)}
                  disabled={pagina === totalPaginas}
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

function mensagemVazio({
  desligados,
  temFiltro,
  equipe,
}: {
  desligados: boolean;
  temFiltro: boolean;
  equipe: EquipeColaboradores;
}): string {
  if (temFiltro) return desligados ? "Nenhum desligado nesse filtro." : "Nenhum colaborador nesse filtro.";
  if (equipe === "minha") {
    return desligados
      ? "Nenhum desligado na sua equipe. Escolha “Todos” para ver a UEN."
      : "Nenhum colaborador está vinculado à sua equipe. Escolha “Todos” para ver a UEN.";
  }
  return desligados ? "Nenhum colaborador desligado." : "Nenhum colaborador ativo.";
}

/**
 * Uma linha da lista. O nome abre o perfil por cima da lista; o desligado abre
 * direto na aba Cadastro, onde também há "Reativar".
 */
function LinhaColaborador({
  pessoa,
  fotoUrl,
  aoReativar,
}: {
  pessoa: PessoaLista;
  fotoUrl?: string;
  aoReativar: () => Promise<void>;
}) {
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <AvatarColaborador nome={pessoa.nome} fotoUrl={fotoUrl} />
          <BotaoNomeColaborador
            colaboradorId={pessoa.colaborador_id}
            nome={pessoa.nome}
            aba={pessoa.ativo ? undefined : "cadastro"}
          />
        </div>
      </td>
      <td className="tabular">{pessoa.matricula}</td>
      <td className="text-label">{pessoa.cargo ?? <span className="text-ink-faint">—</span>}</td>
      <td className="text-label">
        {pessoa.supervisor_nome ?? <span className="text-ink-faint">Sem supervisor</span>}
      </td>
      <td>
        {!pessoa.ativo ? (
          <span className="etiqueta etiqueta--neutra">Desligado</span>
        ) : pessoa.status ? (
          <>
            <SeloStatus status={pessoa.status} dias={pessoa.dias} titulo />
            {pessoa.requisito && (
              <span className="block mt-0.5 text-caption text-ink-faint">{pessoa.requisito}</span>
            )}
          </>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </td>
      {!pessoa.ativo && (
        <td>
          {/* `action` com função: o React roda numa transição e `useFormStatus`
              enxerga o envio até a Server Action responder. */}
          <form action={aoReativar} className="flex justify-end">
            <BotaoReativar nome={pessoa.nome} />
          </form>
        </td>
      )}
    </tr>
  );
}

function BotaoReativar({ nome }: { nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--secondary btn--sm" disabled={pending} aria-busy={pending}>
      {pending ? "Reativando…" : "Reativar"}
      <span className="sr-only"> {nome}</span>
    </button>
  );
}

/**
 * Busca e filtros, aplicados ao mudar.
 *
 * A busca espera 300 ms depois da última tecla (como no Radar): sem isso, a
 * URL seria reescrita a cada letra. Os seletores aplicam na hora.
 */
function Filtros({
  filtros,
  escopo,
  supervisores,
  requisitos,
  aoMudar,
  aoMudarSituacao,
  aoLimpar,
  temFiltro,
}: {
  filtros: FiltrosColaboradores;
  escopo: EscopoColaboradores;
  supervisores: { id: string; nome: string }[];
  requisitos: string[];
  aoMudar: <K extends keyof FiltrosColaboradores>(campo: K, valor: FiltrosColaboradores[K]) => void;
  aoMudarSituacao: (situacao: SituacaoQuadro) => void;
  aoLimpar: () => void;
  temFiltro: boolean;
}) {
  const [texto, setTexto] = useState(filtros.busca);
  const desligados = filtros.situacao === "desligados";

  // "Limpar" zera a busca por fora; o campo precisa acompanhar.
  useEffect(() => {
    setTexto(filtros.busca);
  }, [filtros.busca]);

  useEffect(() => {
    const limpo = limparBusca(texto);
    if (limpo === filtros.busca) return;
    const espera = setTimeout(() => aoMudar("busca", limpo), 300);
    return () => clearTimeout(espera);
  }, [texto, filtros.busca, aoMudar]);

  return (
    <div className="card mb-4 grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-labelledby="c-situacao-rotulo">
          <span id="c-situacao-rotulo" className="label">Situação</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              className={`btn ${!desligados ? "btn--primary" : "btn--secondary"}`}
              aria-pressed={!desligados}
              onClick={() => aoMudarSituacao("ativos")}
            >
              Ativos
            </button>
            <button
              type="button"
              className={`btn ${desligados ? "btn--primary" : "btn--secondary"}`}
              aria-pressed={desligados}
              onClick={() => aoMudarSituacao("desligados")}
            >
              Desligados
            </button>
          </div>
        </div>

        {escopo.podeEscolherMinha && (
          <div role="group" aria-labelledby="c-equipe-rotulo">
            <span id="c-equipe-rotulo" className="label">Equipe</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className={`btn ${filtros.equipe === "minha" ? "btn--primary" : "btn--secondary"}`}
                aria-pressed={filtros.equipe === "minha"}
                onClick={() => aoMudar("equipe", "minha")}
              >
                Minha equipe
              </button>
              <button
                type="button"
                className={`btn ${filtros.equipe === "todas" ? "btn--primary" : "btn--secondary"}`}
                aria-pressed={filtros.equipe === "todas"}
                onClick={() => aoMudar("equipe", "todas")}
              >
                Todos
              </button>
            </div>
          </div>
        )}

        <div className="grow basis-[280px]">
          <label className="label" htmlFor="c-busca">Buscar colaborador</label>
          <div className="relative">
            <IconeBusca className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              id="c-busca"
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

        {!desligados && (
          <>
            <div>
              <label className="label" htmlFor="c-requisito">Requisito</label>
              <select
                id="c-requisito"
                className="field"
                value={filtros.requisito ?? ""}
                onChange={(e) => aoMudar("requisito", e.target.value || undefined)}
              >
                <option value="">Todos</option>
                {requisitos.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="c-status">Status</label>
              <select
                id="c-status"
                className="field"
                value={filtros.status ?? ""}
                onChange={(e) =>
                  aoMudar("status", (e.target.value || undefined) as FiltrosColaboradores["status"])
                }
              >
                <option value="">Todos</option>
                {ORDEM_STATUS.map((s) => (
                  <option key={s} value={s}>{STATUS_ROTULO[s]}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="label" htmlFor="c-supervisor">Supervisor</label>
          <select
            id="c-supervisor"
            className="field"
            value={filtros.supervisor ?? ""}
            onChange={(e) => aoMudar("supervisor", e.target.value || undefined)}
          >
            <option value="">Todos</option>
            <option value={SEM_SUPERVISOR}>Sem supervisor</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        {temFiltro && (
          <button type="button" className="btn btn--secondary" onClick={aoLimpar}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
