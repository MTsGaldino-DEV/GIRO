"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { Aviso, Vazio } from "@/components/aviso";
import {
  ETAPA_ROTULO,
  ETAPA_ACAO,
  DONO_ROTULO,
  SITUACAO_ROTULO,
  TIPO_AUSENCIA_ROTULO,
  formatarData,
  formatarDataHora,
  avisoJanelaUtil,
} from "@/lib/dominio";
import type { ResumoColaborador } from "@/lib/consulta-colaborador";
import type { Situacao } from "@/lib/tipos";
import { usePerfilColaborador } from "./contexto";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">{rotulo}</dt>
      <dd className="m-0 mt-0.5 text-label tabular break-words">{children}</dd>
    </div>
  );
}

interface AusenciaResumo {
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
}

/**
 * Resumo do colaborador.
 *
 * Deliberadamente NÃO repete o que as outras abas mostram inteiro: a lista de
 * exames fica em ASO, a de arquivos em Documentos, a trilha em Histórico. Aqui
 * entra só o que responde "o que está acontecendo com essa pessoa agora".
 */
export function AbaVisaoGeral({ resumo }: { resumo: ResumoColaborador }) {
  const { trocarAba } = usePerfilColaborador();
  const { colaborador, status, item } = resumo;
  const [ausencia, setAusencia] = useState<AusenciaResumo | null>(null);

  useEffect(() => {
    let ativo = true;

    async function buscarAusencia() {
      const supabase = criarClienteNavegador();
      const { data } = await supabase
        .from("ausencias")
        .select("tipo, data_inicio, data_fim")
        .eq("colaborador_id", colaborador.id)
        .order("data_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ativo) setAusencia((data as AusenciaResumo) ?? null);
    }

    void buscarAusencia();
    return () => {
      ativo = false;
    };
  }, [colaborador.id]);

  const janela = item ? avisoJanelaUtil(item) : null;

  return (
    <div className="grid gap-4">
      {status?.status === "sem_registro" && (
        <Aviso tom="forte" titulo="Sem data de referência">
          Não há ASO registrado para este colaborador. Enquanto não houver, ele é
          tratado com a mesma gravidade de um ASO vencido. Lance a data do último
          exame na aba ASO.
        </Aviso>
      )}

      {status?.bloqueado_para_agendamento && (
        <Aviso titulo="Agendamento bloqueado">
          Situação &ldquo;{SITUACAO_ROTULO[colaborador.situacao as Situacao] ?? colaborador.situacao}
          &rdquo;. Só quem está trabalhando pode ser agendado.
        </Aviso>
      )}

      {janela && (
        <Aviso tom={item?.conflito_bloqueante ? "forte" : "neutro"} titulo="Janela útil">
          {janela}
        </Aviso>
      )}

      <div className="card">
        <h3 className="mb-3">Identificação</h3>
        <dl className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3 m-0">
          <Campo rotulo="Matrícula">{colaborador.matricula}</Campo>
          <Campo rotulo="Cargo">{colaborador.cargo ?? "—"}</Campo>
          <Campo rotulo="Polo/UEN">{colaborador.polo ?? colaborador.uen ?? "—"}</Campo>
          <Campo rotulo="Setor">{colaborador.local ?? "—"}</Campo>
          <Campo rotulo="Supervisor">{resumo.supervisorNome ?? "Sem supervisor"}</Campo>
          <Campo rotulo="Situação">
            {SITUACAO_ROTULO[colaborador.situacao as Situacao] ?? colaborador.situacao}
          </Campo>
        </dl>
      </div>

      <div className="card">
        <h3 className="mb-3">Ciclo em aberto</h3>

        {item ? (
          <>
            <dl className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3 m-0">
              <Campo rotulo="Etapa">{ETAPA_ROTULO[item.etapa]}</Campo>
              <Campo rotulo="Com quem">{DONO_ROTULO[item.dono]}</Campo>
              <Campo rotulo="Prazo da etapa">{formatarDataHora(item.sla_vence_em)}</Campo>
              <Campo rotulo="Vencimento">{formatarData(item.data_vencimento)}</Campo>
              <Campo rotulo="Último ASO">
                {formatarData(item.ultimo_documento)}
                {item.ultimo_documento_estimado && (
                  <span className="block text-caption text-ink-faint">data estimada</span>
                )}
              </Campo>
              <Campo rotulo="Parado há">
                <span className="dias-parados" data-estourado={item.sla_estourado}>
                  {item.dias_parados} {item.dias_parados === 1 ? "dia" : "dias"}
                </span>
              </Campo>
            </dl>

            <p className="text-label text-ink-muted mt-4 mb-0">
              <span className="text-ink-faint">Próxima ação: </span>
              {ETAPA_ACAO[item.etapa]}
            </p>

            <div className="mt-4">
              <button type="button" className="btn btn--primary" onClick={() => trocarAba("aso")}>
                Agir sobre este ciclo
              </button>
            </div>
          </>
        ) : (
          <p className="text-ink-faint text-label m-0">
            Nenhum ciclo em aberto. O item é criado automaticamente quando o
            vencimento entra na janela de 90 dias.
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="mb-3">Ausência</h3>
        {ausencia ? (
          <dl className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3 m-0">
            <Campo rotulo="Tipo">{TIPO_AUSENCIA_ROTULO[ausencia.tipo] ?? ausencia.tipo}</Campo>
            <Campo rotulo="Início">{formatarData(ausencia.data_inicio)}</Campo>
            <Campo rotulo="Retorno">
              {ausencia.data_fim ? (
                formatarData(ausencia.data_fim)
              ) : (
                <span className="text-ink-faint">sem previsão</span>
              )}
            </Campo>
          </dl>
        ) : (
          <p className="text-ink-faint text-label m-0">Nenhuma ausência registrada.</p>
        )}
      </div>

      {/* Treinamentos continua fora do escopo (seção 36 do plano): o catálogo
          tem uma linha só e não há dados de conclusão por colaborador. Dizer
          isso é melhor que um cartão vazio sem explicação. */}
      <div className="card">
        <h3 className="mb-1">Treinamentos</h3>
        <Vazio>
          Ainda não há registro de treinamentos por colaborador. O catálogo de
          requisitos complementares está em construção.
        </Vazio>
      </div>
    </div>
  );
}
