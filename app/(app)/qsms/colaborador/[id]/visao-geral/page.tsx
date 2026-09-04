import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarColaborador, carregarStatus, carregarItemAberto } from "@/lib/colaborador";
import { Aviso } from "@/components/aviso";
import {
  ETAPA_ROTULO,
  ETAPA_ACAO,
  DONO_ROTULO,
  SITUACAO_ROTULO,
  formatarData,
  formatarDataHora,
  avisoJanelaUtil,
  TIPO_AUSENCIA_ROTULO,
} from "@/lib/dominio";
import type { Situacao } from "@/lib/tipos";

export const metadata: Metadata = { title: "Visão geral" };
export const dynamic = "force-dynamic";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">{rotulo}</dt>
      <dd className="m-0 mt-0.5 tabular">{children}</dd>
    </div>
  );
}

export default async function VisaoGeral({ params }: { params: Promise<{ id: string }> }) {
  await exigirQsms();
  const { id } = await params;

  const colaborador = await carregarColaborador(id);
  const [status, item] = await Promise.all([carregarStatus(id), carregarItemAberto(id)]);

  const supabase = await criarClienteServidor();
  const { data: ausenciaVigente } = await supabase
    .from("ausencias")
    .select("tipo, data_inicio, data_fim")
    .eq("colaborador_id", id)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  const janela = item ? avisoJanelaUtil(item) : null;

  return (
    <div className="grid gap-5 max-w-[900px]">
      {status?.status === "sem_registro" && (
        <Aviso tom="forte" titulo="Sem data de referência">
          Não há ASO registrado para este colaborador. Enquanto não houver, ele é
          tratado com a mesma gravidade de um ASO vencido. Lance a data do último
          exame em <Link href="/qsms/base">Conferir a base</Link> ou na aba ASO.
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
        <h2 className="text-[1.0625rem] mb-3">Ciclo em aberto</h2>

        {item ? (
          <>
            <dl className="grid gap-x-6 gap-y-4 grid-cols-2 sm:grid-cols-3 m-0">
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
              <Link href={`/qsms/colaborador/${id}/aso`} className="btn btn--primary">
                Agir sobre este ciclo
              </Link>
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
        <h2 className="text-[1.0625rem] mb-3">Ausência</h2>
        {ausenciaVigente ? (
          <dl className="grid gap-x-6 gap-y-4 grid-cols-2 sm:grid-cols-3 m-0">
            <Campo rotulo="Tipo">
              {TIPO_AUSENCIA_ROTULO[ausenciaVigente.tipo] ?? ausenciaVigente.tipo}
            </Campo>
            <Campo rotulo="Início">{formatarData(ausenciaVigente.data_inicio)}</Campo>
            <Campo rotulo="Retorno">
              {ausenciaVigente.data_fim ? (
                formatarData(ausenciaVigente.data_fim)
              ) : (
                <span className="text-ink-faint text-label">sem previsão</span>
              )}
            </Campo>
          </dl>
        ) : (
          <p className="text-ink-faint text-label m-0">Nenhuma ausência registrada.</p>
        )}
      </div>
    </div>
  );
}
