import { Info } from "@/components/info";
import { Vazio } from "@/components/aviso";
import { SeloStatus } from "@/components/selo-status";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { ETAPA_ROTULO } from "@/lib/dominio";
import type { LinhaStatusDashboard } from "@/lib/regras-dashboard";
import type { Etapa } from "@/lib/tipos";
import { Indisponivel } from "./indisponivel";

export type LinhaProxima = LinhaStatusDashboard & { etapa: Etapa | null };

/** Prazo por extenso: "há 917 dias" (vencido), "hoje", "em 12 dias". */
function textoDias(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return "hoje";
  const n = Math.abs(dias);
  const unidade = n === 1 ? "dia" : "dias";
  return dias < 0 ? `há ${n} ${unidade}` : `em ${n} ${unidade}`;
}

/**
 * Os 20 requisitos que vencem primeiro (vencidos à frente), em lista rolável.
 * No desktop o cartão estica até o fim da coluna (ver `.cartao-proximos`).
 */
export function MaisProximos({ linhas }: { /** null quando a consulta falhou. */ linhas: LinhaProxima[] | null }) {
  return (
    <section className="card cartao-proximos" aria-labelledby="titulo-proximos">
      <div className="flex items-center gap-2 mb-3">
        <h2 id="titulo-proximos" className="text-[1.0625rem]">
          {linhas ? `${linhas.length} mais próximos de vencer` : "Mais próximos de vencer"}
        </h2>
        <Info>Por dias até o vencimento, de ASO ou AVP. Vencidos aparecem primeiro; sem registro fica de fora.</Info>
      </div>

      {!linhas ? (
        <Indisponivel />
      ) : linhas.length === 0 ? (
        <Vazio>Ninguém com data de vencimento.</Vazio>
      ) : (
        <div className="rolagem-proximos" tabIndex={0} aria-label="Lista rolável">
          <table className="tabela-dash tabela-proximos">
            <caption className="sr-only">Mais próximos de vencer</caption>
            <thead>
              <tr>
                <th scope="col">Colaborador</th>
                <th scope="col">Requisito</th>
                <th scope="col">Supervisor</th>
                <th scope="col">Situação</th>
                <th scope="col" className="text-right">Vence</th>
                <th scope="col">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.colaborador_id}|${l.tipo_requisito_id}`}>
                  <td>
                    <BotaoNomeColaborador colaboradorId={l.colaborador_id} nome={l.nome} />
                  </td>
                  <td>{l.requisito}</td>
                  <td>{l.supervisor_nome ?? "Sem supervisor"}</td>
                  <td>
                    <SeloStatus status={l.status} dias={null} />
                  </td>
                  <td className="text-right">{textoDias(l.dias_restantes)}</td>
                  <td className="text-ink-muted">{l.etapa ? ETAPA_ROTULO[l.etapa] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
