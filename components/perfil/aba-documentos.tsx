"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { MensagemErro, Vazio } from "@/components/aviso";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarDataHora } from "@/lib/dominio";
import {
  carregarDocumentos,
  TIPOS_DOCUMENTO,
  type DocumentoColaborador,
} from "@/lib/consulta-colaborador";
import { anexarDocumento, type Acao } from "@/app/(app)/qsms/colaborador/acoes-documentos";
import { EditarDocumento } from "./editar-documento";

/** Bytes em algo legível. 8 MB é o teto, então KB e MB bastam. */
function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Enviando…" : "Anexar documento"}
    </button>
  );
}

/**
 * Aba Documentos.
 *
 * O que motiva a aba: hoje o único arquivo que o sistema guarda é o PDF do ASO,
 * preso ao evento de exame. Avaliação psicológica, certificado de NR e exame
 * complementar não tinham onde existir — é o primeiro passo para acomodar
 * requisitos além do ASO, sem construir o motor de requisitos ainda.
 *
 * Anexar, listar, baixar, editar metadados e remover. Trocar o arquivo de um
 * documento existente não é possível de propósito — isso exigiria versionamento,
 * que está fora desta entrega; quem precisa de outra versão anexa um documento
 * novo e remove o antigo, e as duas ações ficam na trilha.
 */
export function AbaDocumentos({ colaboradorId }: { colaboradorId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoColaborador[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [estado, acao] = useActionState<Acao | null, FormData>(anexarDocumento, null);
  const [emEdicao, setEmEdicao] = useState<DocumentoColaborador | null>(null);

  const buscar = useCallback(async () => {
    const supabase = criarClienteNavegador();
    const resultado = await carregarDocumentos(supabase, colaboradorId);
    setDocumentos(resultado.documentos);
    setLinks(resultado.links);
    setCarregando(false);
  }, [colaboradorId]);

  useEffect(() => {
    setCarregando(true);
    void buscar();
  }, [buscar]);

  // O painel não é uma rota, então `revalidatePath` na Server Action não tem o
  // que revalidar aqui: a lista precisa se refazer por conta própria depois de
  // um anexo bem-sucedido.
  useEffect(() => {
    if (estado?.ok) void buscar();
  }, [estado, buscar]);

  return (
    <div className="grid gap-4">
      <div className="card">
        <h3 className="mb-1">Anexar documento</h3>
        <p className="text-ink-muted text-label mb-4">
          PDF, JPG, PNG ou WebP, até 8 MB. O arquivo vai para um bucket privado —
          o acesso continua valendo pelas mesmas regras do resto do sistema.
        </p>

        <form action={acao} className="grid gap-3">
          <input type="hidden" name="colaborador_id" value={colaboradorId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="doc-arquivo">Arquivo</label>
              <input
                id="doc-arquivo"
                name="arquivo"
                type="file"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="field"
              />
            </div>

            <div>
              <label className="label" htmlFor="doc-tipo">Tipo</label>
              <input
                id="doc-tipo"
                name="tipo"
                required
                list="lista-tipos-documento"
                placeholder="Avaliação Psicológica"
                className="field"
              />
              {/* `datalist` e não `select`: sugere os tipos conhecidos sem
                  impedir um que ainda não previmos. Um select fechado obrigaria
                  uma migration a cada tipo novo de documento. */}
              <datalist id="lista-tipos-documento">
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="label" htmlFor="doc-data">Data do documento</label>
              <input id="doc-data" name="data_documento" type="date" className="field" />
            </div>

            <div>
              <label className="label" htmlFor="doc-validade">Validade</label>
              <input id="doc-validade" name="data_validade" type="date" className="field" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="doc-descricao">Descrição</label>
            <input
              id="doc-descricao"
              name="descricao"
              maxLength={500}
              placeholder="Opcional"
              className="field"
            />
          </div>

          <div className="flex items-center gap-3">
            <BotaoEnviar />
            {estado?.ok && (
              <span role="status" className="text-label text-ink-muted">
                {estado.mensagem}
              </span>
            )}
          </div>

          {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
        </form>
      </div>

      <div className="card">
        <h3 className="mb-3">Documentos anexados</h3>

        {carregando ? (
          <div className="esqueleto h-24" aria-busy="true" />
        ) : documentos.length === 0 ? (
          <Vazio>Nenhum documento anexado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela" style={{ minWidth: 720 }}>
              <caption className="sr-only">Documentos do colaborador</caption>
              <thead>
                <tr>
                  <th scope="col">Documento</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Data</th>
                  <th scope="col">Validade</th>
                  <th scope="col">Status</th>
                  <th scope="col">Anexado por</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <span className="font-medium block break-words">{doc.nome_arquivo}</span>
                      <span className="text-caption text-ink-faint">
                        {tamanhoLegivel(doc.tamanho_bytes)}
                        {doc.descricao ? ` · ${doc.descricao}` : ""}
                      </span>
                    </td>
                    <td className="text-label">{doc.tipo}</td>
                    <td className="tabular">{formatarData(doc.data_documento)}</td>
                    <td className="tabular">{formatarData(doc.data_validade)}</td>
                    <td className="text-label">
                      {/* Etiqueta neutra, nunca cor de semáforo: verde, âmbar e
                          vermelho são linguagem reservada da conformidade do
                          colaborador. Documento fora da validade é um aviso de
                          documento, não um status de quem pode trabalhar. */}
                      {doc.data_validade === null ? (
                        <span className="text-ink-faint">sem validade</span>
                      ) : doc.vencido ? (
                        <Badge variant="secondary" className="font-medium">Vencido</Badge>
                      ) : (
                        <Badge variant="outline">Vigente</Badge>
                      )}
                    </td>
                    <td className="text-label">
                      {doc.criado_por_nome}
                      <span className="block text-caption text-ink-faint tabular">
                        {formatarDataHora(doc.criado_em)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {links[doc.id] ? (
                          <a
                            href={links[doc.id]}
                            target="_blank"
                            rel="noreferrer"
                            className="text-label"
                          >
                            Abrir
                          </a>
                        ) : (
                          <span className="text-caption text-ink-faint">indisponível</span>
                        )}
                        <button
                          type="button"
                          className="text-label text-ink-muted underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0"
                          onClick={() => setEmEdicao(doc)}
                        >
                          Editar
                          <span className="sr-only"> {doc.nome_arquivo}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditarDocumento
        key={emEdicao?.id ?? "nenhum"}
        documento={emEdicao}
        aberto={emEdicao !== null}
        aoFechar={() => setEmEdicao(null)}
        aoConcluir={buscar}
      />
    </div>
  );
}
