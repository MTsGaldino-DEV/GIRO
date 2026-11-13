"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import {
  POR_PAGINA_GESET,
  buscarPendenciasGeset,
  filtrosGesetParaBusca,
  totalDePaginas,
  type FiltrosGeset,
  type PaginaGeset,
} from "@/lib/consulta-geset";
import { BUCKET_FOTOS } from "@/lib/storage";
import { formatarData } from "@/lib/dominio";
import { marcarGeset } from "@/app/(app)/qsms/geset-acoes";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { Vazio } from "@/components/aviso";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { IconeBusca } from "@/components/icones";
import type { PendenciaGeset } from "@/lib/tipos";

/** Janela de cinco páginas ao redor da atual, como no Radar. */
function janelaDePaginas(atual: number, ultima: number): number[] {
  const inicio = Math.max(1, Math.min(atual - 2, ultima - 4));
  const fim = Math.min(ultima, inicio + 4);
  const paginas = [];
  for (let p = inicio; p <= fim; p++) paginas.push(p);
  return paginas;
}

type Aviso =
  | { tipo: "ok"; mensagem: string; desfazer?: { eventoId: string; nome: string } }
  | { tipo: "erro"; mensagem: string };

/**
 * Fila "Falta lançar no GESET", no Radar (`?fila=geset`).
 *
 * Mesma ideia da grade de itens: a primeira página vem do servidor, e busca,
 * filtro e página viram consulta direta ao Postgres (a RLS decide o que volta).
 * Marcar uma linha chama a Server Action `marcarGeset`; a linha sai da fila na
 * nova consulta e `router.refresh()` atualiza a contagem do segmento.
 *
 * Petróleo e grafite, nunca as cores do semáforo: é ação, não situação.
 */
export function ListaGeset({
  inicial,
  filtrosIniciais,
  fotosIniciais,
  requisitos,
}: {
  inicial: PaginaGeset;
  filtrosIniciais: FiltrosGeset;
  fotosIniciais: Record<string, string>;
  requisitos: string[];
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState<FiltrosGeset>(filtrosIniciais);
  const [pagina, setPagina] = useState<PaginaGeset>(inicial);
  const [fotos, setFotos] = useState<Record<string, string>>(fotosIniciais);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const primeiraRenderizacao = useRef(true);
  // Descarta resposta antiga que chegou depois de uma nova.
  const requisicao = useRef(0);
  const filtrosAtuais = useRef(filtros);
  useEffect(() => {
    filtrosAtuais.current = filtros;
  }, [filtros]);

  const buscar = useCallback(async (novos: FiltrosGeset) => {
    const meu = ++requisicao.current;
    setCarregando(true);
    const supabase = criarClienteNavegador();

    const resultado = await buscarPendenciasGeset(supabase, novos);
    if (meu !== requisicao.current) return;

    // Marcar a última linha da última página a deixa vazia: volta uma página.
    const paginaPedida = Math.max(1, Number(novos.pagina) || 1);
    if (resultado.linhas.length === 0 && resultado.total > 0 && paginaPedida > 1) {
      const ultima = totalDePaginas(resultado.total);
      setFiltros((f) => ({ ...f, pagina: ultima > 1 ? ultima : undefined }));
      return;
    }

    setPagina(resultado);
    setCarregando(false);

    const caminhos = [
      ...new Set(resultado.linhas.map((l) => l.foto_url).filter((c): c is string => !!c)),
    ];
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
    // `replaceState` e não `router.replace`: o endereço continua
    // compartilhável sem o round-trip de uma navegação do Next.
    window.history.replaceState(null, "", `/radar?${filtrosGesetParaBusca(filtros)}`);
    void buscar(filtros);
  }, [filtros, buscar]);

  // Marcar ou desfazer tira (ou devolve) uma linha, e com ela some o botão que
  // tinha o foco: o navegador o joga no <body>. Depois da nova consulta, se o
  // foco se perdeu assim, ele vai para o aviso.
  const avisoRef = useRef<HTMLDivElement>(null);
  const focarAvisoSePerdido = useRef(false);
  useEffect(() => {
    if (!focarAvisoSePerdido.current) return;
    focarAvisoSePerdido.current = false;
    const ativo = document.activeElement;
    if (!ativo || ativo === document.body) avisoRef.current?.focus();
  }, [pagina]);

  /** Marca (ou desfaz) um evento. Resolve quando a lista já foi refeita. */
  async function executar(eventoId: string, nome: string, lancado: boolean) {
    const dados = new FormData();
    dados.set("evento_id", eventoId);
    dados.set("lancado", lancado ? "true" : "false");

    const resultado = await marcarGeset(null, dados);
    if (!resultado.ok) {
      setAviso({ tipo: "erro", mensagem: resultado.erro });
      return;
    }

    focarAvisoSePerdido.current = true;
    setAviso({
      tipo: "ok",
      mensagem: resultado.mensagem,
      // Só marcar oferece desfazer; desfazer não encadeia outro.
      desfazer: lancado ? { eventoId, nome } : undefined,
    });
    router.refresh();
    await buscar(filtrosAtuais.current);
  }

  // Busca com 300 ms de espera depois da última tecla.
  const [texto, setTexto] = useState(filtros.busca ?? "");
  useEffect(() => {
    if (texto.trim() === (filtros.busca ?? "")) return;
    const espera = setTimeout(
      () => setFiltros((f) => ({ ...f, busca: texto.trim() || undefined, pagina: undefined })),
      300
    );
    return () => clearTimeout(espera);
  }, [texto, filtros.busca]);

  const paginaAtual = Math.max(1, Number(filtros.pagina) || 1);
  const ultimaPagina = totalDePaginas(pagina.total);
  const temFiltro = !!(filtros.busca || filtros.requisito);

  function irPara(p: number) {
    setFiltros((f) => ({ ...f, pagina: p > 1 ? p : undefined }));
  }

  return (
    <>
      <div className="card mb-4 grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow basis-[280px]">
            <label className="label" htmlFor="g-busca">Buscar colaborador</label>
            <div className="relative">
              <IconeBusca className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                id="g-busca"
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
            <label className="label" htmlFor="g-requisito">Requisito</label>
            <select
              id="g-requisito"
              className="field"
              value={filtros.requisito ?? ""}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, requisito: e.target.value || undefined, pagina: undefined }))
              }
            >
              <option value="">Todos</option>
              {requisitos.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {temFiltro && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setTexto("");
                setFiltros({});
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Sempre no DOM, para o leitor de tela anunciar o que entra nele. */}
      <div ref={avisoRef} tabIndex={-1} role="status" className="outline-none">
        {aviso?.tipo === "ok" && (
          <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 text-label">
            <span>{aviso.mensagem}</span>
            <span className="flex gap-2 shrink-0">
              {aviso.desfazer && (
                <FormularioDesfazer
                  aoDesfazer={() => executar(aviso.desfazer!.eventoId, aviso.desfazer!.nome, false)}
                  nome={aviso.desfazer.nome}
                />
              )}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAviso(null)}>
                Fechar
              </button>
            </span>
          </div>
        )}
      </div>

      {aviso?.tipo === "erro" && (
        <div role="alert" className="card mb-4 flex flex-wrap items-center justify-between gap-3 text-label">
          <span>{aviso.mensagem}</span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      )}

      {pagina.erro && (
        <p role="alert" className="text-label mb-4">
          Não foi possível carregar a fila: {pagina.erro}
        </p>
      )}

      <div aria-busy={carregando} data-carregando={carregando}>
        <h2 className="sr-only">ASO e AVP que faltam lançar no GESET</h2>
        {pagina.linhas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabela tabela--geset">
              <caption className="sr-only">ASO e AVP que faltam lançar no GESET</caption>
              <thead>
                <tr>
                  <th scope="col">Colaborador</th>
                  <th scope="col">Requisito</th>
                  <th scope="col">Supervisor</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Vencimento</th>
                  <th scope="col" className="text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pagina.linhas.map((linha) => (
                  <LinhaGeset
                    key={linha.evento_id}
                    linha={linha}
                    fotoUrl={fotos[linha.foto_url ?? ""]}
                    aoMarcar={() => executar(linha.evento_id, linha.nome, true)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagina.linhas.length === 0 && !carregando && !pagina.erro && (
          <Vazio>{temFiltro ? "Nada na fila com esse filtro." : "Tudo lançado no GESET."}</Vazio>
        )}
      </div>

      {pagina.total > 0 && (
        <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-label text-ink-muted m-0 tabular">
            Mostrando {(paginaAtual - 1) * POR_PAGINA_GESET + 1}–
            {Math.min(paginaAtual * POR_PAGINA_GESET, pagina.total)} de {pagina.total}
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

function LinhaGeset({
  linha,
  fotoUrl,
  aoMarcar,
}: {
  linha: PendenciaGeset;
  fotoUrl?: string;
  aoMarcar: () => Promise<void>;
}) {
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <AvatarColaborador nome={linha.nome} fotoUrl={fotoUrl} />
          <div className="min-w-0">
            <BotaoNomeColaborador colaboradorId={linha.colaborador_id} nome={linha.nome} />
            <span className="block text-caption text-ink-faint tabular">
              {linha.matricula}
              {linha.cargo ? ` · ${linha.cargo}` : ""}
            </span>
          </div>
        </div>
      </td>
      <td className="text-label">{linha.requisito}</td>
      <td className="text-label">
        {linha.supervisor_nome ?? <span className="text-ink-faint">Sem supervisor</span>}
      </td>
      <td className="tabular">{formatarData(linha.data_documento)}</td>
      <td className="tabular">{formatarData(linha.data_vencimento)}</td>
      <td>
        {/* `action` com função: o React roda numa transição e `useFormStatus`
            enxerga o envio até a lista ser refeita. */}
        <form action={aoMarcar} className="flex justify-end">
          <BotaoMarcar nome={linha.nome} requisito={linha.requisito} />
        </form>
      </td>
    </tr>
  );
}

function BotaoMarcar({ nome, requisito }: { nome: string; requisito: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending}>
      {pending ? "Marcando…" : "Marcar como lançado"}
      <span className="sr-only"> — {nome}, {requisito}</span>
    </button>
  );
}

function FormularioDesfazer({ aoDesfazer, nome }: { aoDesfazer: () => Promise<void>; nome: string }) {
  return (
    <form action={aoDesfazer}>
      <BotaoDesfazer nome={nome} />
    </form>
  );
}

function BotaoDesfazer({ nome }: { nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--secondary btn--sm" disabled={pending} aria-busy={pending}>
      {pending ? "Desfazendo…" : "Desfazer"}
      <span className="sr-only"> a marca de {nome}</span>
    </button>
  );
}
