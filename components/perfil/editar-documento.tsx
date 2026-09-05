"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from "@/components/ui/dialog";
import { MensagemErro } from "@/components/aviso";
import { IconeFechar } from "@/components/icones";
import { TIPOS_DOCUMENTO, type DocumentoColaborador } from "@/lib/consulta-colaborador";
import {
  editarDocumento,
  excluirDocumento,
  type Acao,
} from "@/app/(app)/qsms/colaborador/acoes-documentos";

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

function BotaoExcluir() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--destrutivo btn--sm" disabled={pending}>
      {pending ? "Removendo…" : "Remover definitivamente"}
    </button>
  );
}

/**
 * Edição de metadados e exclusão de um documento.
 *
 * Modal centrado, não painel lateral: já existe um painel aberto atrás (o
 * perfil), e um segundo drawer entrando pelo mesmo lado empilharia duas
 * superfícies deslizantes sem hierarquia visível.
 *
 * A exclusão fica atrás de uma confirmação explícita porque é irreversível: o
 * arquivo sai do bucket e não há soft delete no projeto. O que sobrevive é a
 * linha de auditoria, que registra nome, tipo, autor e data — a remoção não é
 * silenciosa, mas também não é desfazível.
 */
export function EditarDocumento({
  documento,
  aberto,
  aoFechar,
  aoConcluir,
}: {
  documento: DocumentoColaborador | null;
  aberto: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [estadoEdicao, acaoEditar] = useActionState<Acao | null, FormData>(editarDocumento, null);
  const [estadoExclusao, acaoExcluir] = useActionState<Acao | null, FormData>(
    excluirDocumento,
    null
  );
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  // O painel não é uma rota: `revalidatePath` na Server Action não tem o que
  // revalidar, então quem recarrega a lista é o componente pai.
  //
  // `jaTratado` não é zelo: `useActionState` guarda o último resultado depois
  // que o modal fecha, e `aoFechar`/`aoConcluir` chegam como funções novas a
  // cada render do pai. Sem a trava, o efeito reexecutava, encontrava o `ok`
  // da edição anterior e fechava o modal no mesmo instante em que ele abria
  // para o documento seguinte.
  const jaTratado = useRef(false);

  useEffect(() => {
    if (jaTratado.current) return;
    if (estadoEdicao?.ok || estadoExclusao?.ok) {
      jaTratado.current = true;
      aoConcluir();
      aoFechar();
    }
  }, [estadoEdicao, estadoExclusao, aoConcluir, aoFechar]);

  // Reabrir para outro documento não deve herdar a confirmação pendente do
  // anterior — seria um clique de distância de apagar o arquivo errado.
  useEffect(() => {
    if (!aberto) setConfirmandoExclusao(false);
  }, [aberto, documento?.id]);

  if (!documento) return null;

  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && aoFechar()}>
      <DialogContent lado="centro">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">Editar documento</DialogTitle>
              <DialogDescription className="truncate">{documento.nome_arquivo}</DialogDescription>
            </div>
            <DialogClose className="dialogo__fechar" aria-label="Fechar">
              <IconeFechar />
            </DialogClose>
          </div>
        </DialogHeader>

        <DialogBody>
          <form action={acaoEditar} className="grid gap-3">
            <input type="hidden" name="id" value={documento.id} />
            <input type="hidden" name="colaborador_id" value={documento.colaborador_id} />

            <div>
              <label className="label" htmlFor="edit-tipo">Tipo</label>
              <input
                id="edit-tipo"
                name="tipo"
                required
                defaultValue={documento.tipo}
                list="lista-tipos-documento-edicao"
                className="field"
              />
              <datalist id="lista-tipos-documento-edicao">
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="edit-data">Data do documento</label>
                <input
                  id="edit-data"
                  name="data_documento"
                  type="date"
                  defaultValue={documento.data_documento ?? ""}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-validade">Validade</label>
                <input
                  id="edit-validade"
                  name="data_validade"
                  type="date"
                  defaultValue={documento.data_validade ?? ""}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="edit-descricao">Descrição</label>
              <input
                id="edit-descricao"
                name="descricao"
                maxLength={500}
                defaultValue={documento.descricao ?? ""}
                placeholder="Opcional"
                className="field"
              />
            </div>

            {estadoEdicao && !estadoEdicao.ok && <MensagemErro>{estadoEdicao.erro}</MensagemErro>}

            <div className="flex items-center gap-2 mt-1">
              <BotaoSalvar />
              <DialogClose className="btn btn--secondary btn--sm">Cancelar</DialogClose>
            </div>
          </form>

          <hr className="border-0 border-t border-line my-4" />

          {confirmandoExclusao ? (
            <form action={acaoExcluir}>
              <input type="hidden" name="id" value={documento.id} />
              <input type="hidden" name="colaborador_id" value={documento.colaborador_id} />
              <p className="text-label mb-3">
                O arquivo sai do sistema e não há como recuperá-lo. Fica o
                registro no histórico de que você removeu &ldquo;
                {documento.nome_arquivo}&rdquo;.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <BotaoExcluir />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setConfirmandoExclusao(false)}
                >
                  Cancelar
                </button>
              </div>
              {estadoExclusao && !estadoExclusao.ok && (
                <MensagemErro>{estadoExclusao.erro}</MensagemErro>
              )}
            </form>
          ) : (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setConfirmandoExclusao(true)}
            >
              Remover documento
            </button>
          )}
        </DialogBody>

      </DialogContent>
    </Dialog>
  );
}
