import { STATUS_LEITURA } from "@/lib/dominio";
import { hrefDashboard, type ContagemStatus, type EscopoDashboard } from "@/lib/regras-dashboard";
import type { StatusConformidade } from "@/lib/tipos";
import { CartaoKpi } from "./cartao-kpi";

/** Ordem e nome dos seis cartões (mockup dashboard-v3). */
export const ROTULO_SEMAFORO: Record<StatusConformidade, string> = {
  vencido: "Vencidos",
  sem_registro: "Sem registro",
  critico: "Críticos",
  atencao: "Atenção",
  programar: "Programar",
  // "Em dia" é tudo que não venceu (crítico a regular); ver `pessoasEmDia`.
  ok: "Regular",
};

const ORDEM: StatusConformidade[] = ["vencido", "sem_registro", "critico", "atencao", "programar", "ok"];

/** Mini legenda sob os cartões: o que cada cor quer dizer, em poucas palavras. */
const LEGENDA: Record<StatusConformidade, string> = {
  vencido: "prazo passou; não pode trabalhar",
  sem_registro: "sem data de referência; tratar como vencido",
  critico: "vence em menos de 15 dias",
  atencao: "vence entre 15 e 30 dias",
  programar: "vence entre 31 e 90 dias",
  ok: "vence em mais de 90 dias",
};

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

  return (
    <section aria-labelledby="titulo-semaforo">
      {/* Título só para leitor de tela: visualmente os cartões abrem a página logo
          abaixo do cabeçalho, e o total de pessoas já está no subtítulo dele. */}
      <h2 id="titulo-semaforo" className="sr-only">
        {contagem ? `Situação das ${contagem.total} pessoas, no pior status entre ASO e AVP` : "Situação das pessoas"}
      </h2>
      <div className="kpis kpis--6">
        {ORDEM.map((status) => (
          <CartaoKpi
            key={status}
            href={hrefDashboard(escopo, status)}
            valor={contagem ? contagem[status] : null}
            rotulo={ROTULO_SEMAFORO[status]}
            variante={`kpi--${status}`}
            ativo={ativo === status}
            titulo={STATUS_LEITURA[status]}
          />
        ))}
      </div>
      <ul className="legenda-status" aria-label="O que significa cada status (pior entre ASO e AVP)">
        {ORDEM.map((status) => (
          <li key={status}>
            <span className={`legenda-status__cor kpi--${status}`} aria-hidden />
            <strong>{ROTULO_SEMAFORO[status]}:</strong> {LEGENDA[status]}
          </li>
        ))}
      </ul>
    </section>
  );
}
