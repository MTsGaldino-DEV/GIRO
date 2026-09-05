"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { Vazio } from "@/components/aviso";
import { ETAPA_ROTULO, SITUACAO_ROTULO, formatarData, formatarDataHora } from "@/lib/dominio";
import {
  carregarLinhaDoTempo,
  HISTORICO_POR_PAGINA,
  type EntradaLinhaDoTempo,
} from "@/lib/consulta-colaborador";
import type { Etapa, Situacao } from "@/lib/tipos";

const CAMPO_ROTULO: Record<string, string> = {
  cargo: "cargo",
  polo: "polo",
  local: "setor",
  situacao: "situação",
  supervisor: "supervisor",
};

/** Vazio precisa de palavra, não de traço: "de — para Maria" não se lê. */
function valorLegivel(campo: string | null, valor: string | null): string {
  if (valor === null || valor === "") return "vazio";
  if (campo === "situacao") return SITUACAO_ROTULO[valor as Situacao] ?? valor;
  // Datas de documento chegam em ISO. "de 2027-03-01 para 2027-06-01" obriga o
  // leitor a traduzir; a trilha existe justamente para ser lida de relance.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarData(valor);
  return valor;
}

/**
 * Uma entrada, em duas gramáticas diferentes.
 *
 * A trilha do ASO fala em transição de etapa ("Agendado → Enviado à clínica");
 * a de cadastro fala em campo alterado ("supervisor: Carlos → Maria"). Forçar
 * as duas no mesmo formato deixaria uma das metades ilegível, então cada fonte
 * desenha a própria frase.
 */
function Entrada({ entrada }: { entrada: EntradaLinhaDoTempo }) {
  return (
    <li
      className="relative pl-5 pb-4 last:pb-0"
      style={{ borderLeft: "1px solid var(--color-line)", marginLeft: "3px" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1.5 size-[7px] rounded-full -translate-x-1/2"
        style={{ background: "var(--color-ink-faint)" }}
      />

      <div className="text-label">
        {entrada.fonte === "aso" ? (
          entrada.etapa_de === null ? (
            <span className="font-medium">
              Item criado em {ETAPA_ROTULO[entrada.etapa_para as Etapa] ?? entrada.etapa_para}
            </span>
          ) : entrada.etapa_de === entrada.etapa_para ? (
            <span className="font-medium">
              Em {ETAPA_ROTULO[entrada.etapa_para as Etapa] ?? entrada.etapa_para}
            </span>
          ) : (
            <>
              <span className="text-ink-muted">
                {ETAPA_ROTULO[entrada.etapa_de as Etapa] ?? entrada.etapa_de}
              </span>
              <span className="mx-1.5 text-ink-faint" aria-label="passou para">→</span>
              <span className="font-medium">
                {ETAPA_ROTULO[entrada.etapa_para as Etapa] ?? entrada.etapa_para}
              </span>
            </>
          )
        ) : entrada.acao === "anexou" ? (
          <span>
            anexou <span className="font-medium break-words">{entrada.valor_novo}</span>
          </span>
        ) : entrada.acao === "removeu" ? (
          <span>
            removeu <span className="font-medium break-words">{entrada.valor_anterior}</span>
            {entrada.campo && <span className="text-ink-faint"> ({entrada.campo})</span>}
          </span>
        ) : entrada.entidade === "foto" ? (
          // A foto anterior é apagada do bucket na troca, então não há "de → para"
          // possível. O fato relevante é que mudou, e por quem.
          <span className="font-medium">
            {entrada.acao === "criou" ? "adicionou a foto" : "trocou a foto"}
          </span>
        ) : (
          <span>
            alterou {CAMPO_ROTULO[entrada.campo ?? ""] ?? entrada.campo}:{" "}
            <span className="text-ink-muted">
              {valorLegivel(entrada.campo, entrada.valor_anterior)}
            </span>
            <span className="mx-1.5 text-ink-faint" aria-label="para">→</span>
            <span className="font-medium">{valorLegivel(entrada.campo, entrada.valor_novo)}</span>
          </span>
        )}
      </div>

      <div className="text-caption text-ink-faint tabular">
        {formatarDataHora(entrada.criado_em)}
        {entrada.autor_nome && <> · {entrada.autor_nome}</>}
        {entrada.em_nome_de && <> · em nome de {entrada.em_nome_de}</>}
        {entrada.fonte === "cadastro" && entrada.observacao && <> · {entrada.observacao}</>}
      </div>

      {entrada.fonte === "aso" && entrada.observacao && (
        <p className="text-label text-ink-muted mt-1 mb-0 max-w-[60ch]">{entrada.observacao}</p>
      )}
    </li>
  );
}

/**
 * Aba Histórico — as duas trilhas numa linha do tempo só.
 *
 * A do ASO (`historico_item`) continua sendo escrita pela máquina de estados,
 * intocada; a de cadastro e documentos (`auditoria_colaborador`) é nova. A RPC
 * `fn_linha_do_tempo_colaborador` une as duas por data — não há segunda máquina
 * de histórico do ASO em lugar nenhum.
 *
 * Carrega em páginas de 25 porque um colaborador antigo acumula transições de
 * vários ciclos, e a lista inteira de uma vez seria a consulta mais cara do
 * painel para informação que quase ninguém rola até o fim.
 */
export function AbaHistorico({ colaboradorId }: { colaboradorId: string }) {
  const [entradas, setEntradas] = useState<EntradaLinhaDoTempo[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(
    async (deslocamento: number) => {
      const supabase = criarClienteNavegador();
      const resultado = await carregarLinhaDoTempo(supabase, colaboradorId, deslocamento);
      setEntradas((atuais) =>
        deslocamento === 0 ? resultado.entradas : [...atuais, ...resultado.entradas]
      );
      setTemMais(resultado.temMais);
      setCarregando(false);
    },
    [colaboradorId]
  );

  useEffect(() => {
    setCarregando(true);
    setEntradas([]);
    void buscar(0);
  }, [buscar]);

  if (carregando) {
    return <div className="esqueleto h-40" aria-busy="true" />;
  }

  return (
    <div className="card">
      <h3 className="mb-1">Linha do tempo</h3>
      <p className="text-ink-muted text-label mb-4">
        Movimentação do ASO, alterações de cadastro e documentos anexados, em
        ordem — do mais recente para o mais antigo.
      </p>

      {entradas.length === 0 ? (
        <Vazio>Sem movimentação registrada.</Vazio>
      ) : (
        <>
          <ol className="list-none p-0 m-0">
            {entradas.map((entrada) => (
              <Entrada key={`${entrada.fonte}-${entrada.id}`} entrada={entrada} />
            ))}
          </ol>

          {temMais && (
            <button
              type="button"
              className="btn btn--secondary btn--sm mt-3"
              onClick={() => void buscar(entradas.length)}
            >
              Carregar mais {HISTORICO_POR_PAGINA}
            </button>
          )}
        </>
      )}
    </div>
  );
}
