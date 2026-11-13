"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { registrarResultado, type Acao } from "@/app/(app)/qsms/acoes";
import { Aviso, MensagemErro } from "@/components/aviso";
import { Info } from "@/components/info";
import { Concluido, useAvisarConclusao, type AoConcluir } from "@/components/formularios-item";
import { DESFECHO_CONSEQUENCIA, DESFECHO_ROTULO, hojeIso } from "@/lib/dominio";
import type { Desfecho, ItemAberto } from "@/lib/tipos";

/**
 * Registrar resultado: o desfecho e, se "fez e apto", o ASO, num passo só
 * (spec 2026-11-13-telas-e-fluxo, seção 8). Usado na janela do Radar e na
 * ficha do item, para os dois se comportarem igual.
 *
 * Os cinco desfechos aparecem como rádio, com a consequência ao lado: uma
 * lista suspensa esconderia justamente o que precisa ser lido antes de
 * escolher — quatro dos cinco NÃO encerram o ciclo. Nenhum vem marcado: o
 * clique é uma decisão, não um padrão aceito sem ler.
 *
 * Os campos do ASO só existem no DOM com "fez e apto". Nos outros desfechos
 * o banco ignoraria o documento em silêncio, então nem se oferece o envio.
 */

const DESFECHOS: Desfecho[] = ["fez_apto", "fez_inapto", "faltou", "incompleto", "retorno_necessario"];

// Os mesmos limites de `enviarDocumentoAso` (lib/storage.ts) e do bucket.
const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

const AJUDA_APTO =
  "A data de realização é a que reinicia o ciclo de 12 meses; sem ela, vale a data do documento. O GIRO não lê o PDF: confira o resultado no documento antes de salvar.";

export function FormularioResultado({
  item,
  aoConcluir,
}: {
  item: ItemAberto;
  aoConcluir?: AoConcluir;
}) {
  const [estado, acao, pendente] = useActionState<Acao | null, FormData>(registrarResultado, null);
  const [escolhido, setEscolhido] = useState<Desfecho | null>(null);
  useAvisarConclusao(estado, aoConcluir);
  const id = useId();

  if (estado?.ok) return <Concluido mensagem={estado.mensagem} />;

  const hoje = hojeIso();
  // Sugestão para a realização: o dia marcado, se já passou. Data futura
  // travaria o `max` e o envio.
  const realizadoSugerido = item.data_agendada && item.data_agendada <= hoje ? item.data_agendada : "";

  // Envio pelo `onSubmit`, não pelo `action` do form: o `action` limpa o
  // formulário ao terminar, e um erro do servidor (data recusada, falha de
  // rede) faria a pessoa escolher o arquivo e as datas de novo. O botão fica
  // desabilitado enquanto `pendente`; com o botão padrão desabilitado, o
  // navegador também não faz o envio implícito pelo Enter.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => acao(dados));
  }

  function conferirArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const campo = evento.currentTarget;
    const arquivo = campo.files?.[0];
    let problema = "";
    if (arquivo && !TIPOS_ACEITOS.includes(arquivo.type)) {
      problema = "Formato não aceito. Envie PDF, JPG ou PNG.";
    } else if (arquivo && arquivo.size > TAMANHO_MAXIMO) {
      problema = "O arquivo passa de 8 MB. Reduza a resolução da digitalização.";
    }
    campo.setCustomValidity(problema);
    if (problema) campo.reportValidity();
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" aria-busy={pendente}>
      <input type="hidden" name="item_id" value={item.item_id} />

      <fieldset className="border-0 p-0 m-0 grid gap-1">
        <legend className="label mb-1">O que aconteceu na clínica</legend>
        {DESFECHOS.map((d) => (
          <label key={d} className="flex items-start gap-2.5 text-label min-h-[42px] py-1.5 cursor-pointer">
            <input
              type="radio"
              name="desfecho"
              value={d}
              className="size-4 mt-0.5 shrink-0"
              required
              checked={escolhido === d}
              onChange={() => setEscolhido(d)}
            />
            <span>
              <span className="font-medium">{DESFECHO_ROTULO[d]}</span>
              <span className="block text-caption text-ink-faint">{DESFECHO_CONSEQUENCIA[d]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {escolhido === "fez_apto" && (
        <fieldset className="border-0 p-0 m-0 grid gap-4">
          {/* `display: flex` em <legend> não pega em todo navegador: o
              alinhamento vai num span por dentro. */}
          <legend className="label mb-1">
            <span className="inline-flex items-center gap-1.5">
              ASO do exame
              <Info>{AJUDA_APTO}</Info>
            </span>
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${id}-resultado`}>Resultado</label>
              <select id={`${id}-resultado`} name="resultado" className="field" defaultValue="apto">
                <option value="apto">Apto</option>
                <option value="apto_com_restricao">Apto com restrição</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`${id}-data-documento`}>Data do documento</label>
              <input
                id={`${id}-data-documento`}
                name="data_documento"
                type="date"
                className="field"
                required
                max={hoje}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${id}-data-realizado`}>
                Data de realização <span className="text-ink-faint">(opcional)</span>
              </label>
              <input
                id={`${id}-data-realizado`}
                name="data_realizado"
                type="date"
                className="field"
                max={hoje}
                defaultValue={realizadoSugerido}
              />
            </div>
            <div>
              <label className="label" htmlFor={`${id}-medico`}>
                Médico <span className="text-ink-faint">(opcional)</span>
              </label>
              <input id={`${id}-medico`} name="medico" className="field" defaultValue={item.medico ?? ""} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor={`${id}-documento`}>Arquivo do ASO</label>
            <input
              id={`${id}-documento`}
              name="documento"
              type="file"
              className="field"
              required
              accept="application/pdf,image/jpeg,image/png"
              aria-describedby={`${id}-ajuda-documento`}
              onChange={conferirArquivo}
            />
            <p id={`${id}-ajuda-documento`} className="text-caption text-ink-faint mt-1">
              PDF, JPG ou PNG, até 8 MB.
            </p>
          </div>
        </fieldset>
      )}

      {escolhido === "fez_inapto" && (
        <Aviso tom="forte" titulo="Inapto trava o processo">
          O item entra em tratativa: não atualiza a validade, não abre ciclo novo e
          o colaborador continua bloqueado até alguém resolver o caso.
        </Aviso>
      )}

      <div>
        <label className="label" htmlFor={`${id}-observacao`}>
          Observação <span className="text-ink-faint">(opcional)</span>
        </label>
        <input
          id={`${id}-observacao`}
          name="observacao"
          className="field"
          placeholder="Fica no histórico"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" className="btn btn--primary" disabled={pendente} aria-busy={pendente}>
          {pendente ? "Registrando…" : "Registrar resultado"}
        </button>
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </form>
  );
}
