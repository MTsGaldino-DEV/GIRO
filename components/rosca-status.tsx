import { ORDEM_STATUS, STATUS_ROTULO } from "@/lib/dominio";
import { NumeroAnimado } from "@/components/numero-animado";
import type { ResumoStatus, StatusConformidade } from "@/lib/tipos";

/**
 * Rosca de status da base inteira.
 *
 * É uma das poucas superfícies autorizadas a usar as cores do semáforo, porque
 * o que ela mostra é exatamente conformidade. Os tons do arco são os do selo
 * misturados (ver `.rosca__arco--*` em globals.css): o fundo do selo é claro
 * demais para um arco fino e o texto, escuro demais para separar as fatias.
 *
 * SVG inline pelo mesmo motivo do gráfico de conclusões: seis arcos não pagam
 * uma biblioteca de gráficos no bundle.
 */
const RAIO = 54;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
// Folga entre fatias: sem ela, dois tons escuros vizinhos (vencido e sem
// registro) viram uma fatia só.
const FOLGA = 2;

export function RoscaStatus({ resumo }: { resumo: ResumoStatus }) {
  const total = Number(resumo.total);
  const fatias = ORDEM_STATUS.map((status) => ({
    status,
    valor: Number(resumo[status as keyof ResumoStatus] ?? 0),
  })).filter((f) => f.valor > 0);

  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: 148, height: 148 }}>
        <svg viewBox="0 0 148 148" width={148} height={148} role="img" aria-label="Colaboradores por status">
          <circle cx={74} cy={74} r={RAIO} fill="none" stroke="var(--color-line)" strokeWidth={16} />
          {total > 0 &&
            fatias.map((fatia, i) => {
              const comprimento = (fatia.valor / total) * CIRCUNFERENCIA;
              const visivel = Math.max(comprimento - (fatias.length > 1 ? FOLGA : 0), 0.5);
              const deslocamento = -acumulado;
              acumulado += comprimento;
              return (
                <circle
                  key={fatia.status}
                  cx={74}
                  cy={74}
                  r={RAIO}
                  fill="none"
                  strokeWidth={16}
                  className={`rosca__arco rosca__arco--${fatia.status}`}
                  strokeDasharray={`${visivel} ${CIRCUNFERENCIA}`}
                  strokeDashoffset={deslocamento}
                  transform="rotate(-90 74 74)"
                  style={{ "--i": i } as React.CSSProperties}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-[1.5rem] font-medium leading-none tabular">
            <NumeroAnimado valor={total} />
          </span>
          <span className="text-caption text-ink-faint mt-1">pessoas</span>
        </div>
      </div>

      <ul className="list-none m-0 p-0 grid gap-1.5 min-w-[160px] flex-1">
        {ORDEM_STATUS.map((status) => {
          const valor = Number(resumo[status as keyof ResumoStatus] ?? 0);
          return (
            <li key={status} className="flex items-center justify-between gap-3 text-label">
              <span className="flex items-center gap-2">
                <span className={`rosca__marca rosca__arco--${status}`} aria-hidden />
                {STATUS_ROTULO[status as StatusConformidade]}
              </span>
              <span className="tabular text-ink-muted">{valor}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
