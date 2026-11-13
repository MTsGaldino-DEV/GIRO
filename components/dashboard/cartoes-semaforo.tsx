import { STATUS_LEITURA } from "@/lib/dominio";
import { hrefDashboard, percentual, type ContagemStatus, type EscopoDashboard } from "@/lib/regras-dashboard";
import type { StatusConformidade } from "@/lib/tipos";
import { CartaoKpi } from "./cartao-kpi";

/** Ordem e nome dos seis cartões (mockup dashboard-v3). */
export const ROTULO_SEMAFORO: Record<StatusConformidade, string> = {
  vencido: "Vencidos",
  sem_registro: "Sem registro",
  critico: "Críticos",
  atencao: "Atenção",
  programar: "Programar",
  ok: "Em dia",
};

const ORDEM: StatusConformidade[] = ["vencido", "sem_registro", "critico", "atencao", "programar", "ok"];

/**
 * Os seis cartões do semáforo: cada pessoa conta uma vez, no pior status
 * entre ASO e AVP. Única superfície do Dashboard com as cores reservadas.
 */
export function CartoesSemaforo({
  contagem,
  escopo,
  ativo,
}: {
  contagem: ContagemStatus | null;
  escopo: EscopoDashboard;
  ativo: string | null;
}) {
  const emDia = contagem ? percentual(contagem.ok, contagem.total) : null;

  return (
    <section aria-labelledby="titulo-semaforo">
      {/* Título só para leitor de tela: visualmente os cartões encostam na faixa
          escura, e o total de pessoas já está no subtítulo do cabeçalho. */}
      <h2 id="titulo-semaforo" className="sr-only">
        {contagem ? `Situação das ${contagem.total} pessoas, no pior status entre ASO e AVP` : "Situação das pessoas"}
      </h2>
      <div className="kpis kpis--6">
        {ORDEM.map((status) => (
          <CartaoKpi
            key={status}
            href={hrefDashboard(escopo, status)}
            valor={contagem ? contagem[status] : null}
            rotulo={status === "ok" && emDia !== null ? `${ROTULO_SEMAFORO.ok} (${emDia}%)` : ROTULO_SEMAFORO[status]}
            variante={`kpi--${status}`}
            ativo={ativo === status}
            titulo={STATUS_LEITURA[status]}
          />
        ))}
      </div>
    </section>
  );
}
