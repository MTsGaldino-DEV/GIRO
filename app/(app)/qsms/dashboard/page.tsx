import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CartaoContagem } from "@/components/selo-status";
import { GraficoConclusoes, type PontoMes } from "@/components/grafico-conclusoes";
import { Vazio } from "@/components/aviso";
import { ORDEM_STATUS, ETAPA_ROTULO, DONO_ROTULO } from "@/lib/dominio";
import { AtualizacaoAutomatica } from "./atualizacao";
import type { ResumoStatus, Etapa, Dono } from "@/lib/tipos";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

interface LinhaEtapa {
  etapa: Etapa;
  dono: Dono;
  quantidade: number;
  estourados: number;
  dias_max: number;
}

interface LinhaSupervisor {
  supervisor_id: string | null;
  supervisor_nome: string;
  equipe: number;
  vencidos: number;
  sem_registro: number;
  criticos: number;
  itens_abertos: number;
  estourados: number;
  dias_mais_antigo: number;
}

/** Barra de proporção. Petróleo, nunca cor de status: mede volume, não risco. */
function BarraProporcao({ valor, total }: { valor: number; total: number }) {
  const porcento = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden mt-1.5"
      style={{ background: "var(--color-line)" }}
      role="presentation"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${porcento}%`, background: "var(--color-brand)" }}
      />
    </div>
  );
}

export default async function Dashboard() {
  await exigirQsms();
  const supabase = await criarClienteServidor();

  const [
    { data: resumoBruto },
    { data: etapasBrutas },
    { data: supervisoresBrutos },
    { data: curvaBruta },
    { data: vencimentosBrutos },
  ] = await Promise.all([
    supabase.rpc("fn_resumo_status"),
    supabase.rpc("fn_resumo_por_etapa"),
    supabase.rpc("fn_resumo_por_supervisor"),
    supabase.rpc("fn_conclusoes_por_mes", { p_meses: 12 }),
    supabase.rpc("fn_vencimentos_a_frente"),
  ]);

  const resumo = (resumoBruto?.[0] ?? null) as ResumoStatus | null;
  const etapas = (etapasBrutas ?? []) as LinhaEtapa[];
  const supervisores = (supervisoresBrutos ?? []) as LinhaSupervisor[];
  const curva = (curvaBruta ?? []) as PontoMes[];
  const vencimentos = (vencimentosBrutos?.[0] ?? { ate_30: 0, ate_60: 0, ate_90: 0 }) as {
    ate_30: number;
    ate_60: number;
    ate_90: number;
  };

  const totalAbertos = etapas.reduce((soma, e) => soma + Number(e.quantidade), 0);
  const totalEstourados = etapas.reduce((soma, e) => soma + Number(e.estourados), 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1>Dashboard</h1>
          <p className="text-ink-muted text-label mt-1">
            A operação inteira numa tela. Para trabalhar a fila, use o{" "}
            <Link href="/qsms">painel</Link>.
          </p>
        </div>
        <AtualizacaoAutomatica />
      </div>

      {resumo && (
        <>
          <h2 className="sr-only">Contagem por status</h2>
          <div className="grid gap-3 mb-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {ORDEM_STATUS.map((s) => (
              <Link key={s} href={`/qsms?status=${s}`} className="no-underline">
                <CartaoContagem status={s} quantidade={Number(resumo[s as keyof ResumoStatus] ?? 0)} />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start mb-5">
        <div className="card">
          <h2 className="text-[1.0625rem] mb-1">Onde está a bola</h2>
          <p className="text-ink-muted text-label mb-4">
            {totalAbertos} {totalAbertos === 1 ? "item aberto" : "itens abertos"}
            {totalEstourados > 0 && `, ${totalEstourados} com SLA estourado`}. É
            aqui que se vê se o gargalo é a supervisão que não libera ou o QSMS
            que não agenda.
          </p>

          {etapas.length === 0 ? (
            <Vazio>Nenhum item em aberto.</Vazio>
          ) : (
            <ul className="list-none p-0 m-0 grid gap-3">
              {etapas.map((linha) => (
                <li key={`${linha.etapa}-${linha.dono}`}>
                  <Link
                    href={`/qsms?etapa=${linha.etapa}`}
                    className="no-underline text-ink block"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-label">
                        {ETAPA_ROTULO[linha.etapa]}
                        <span className="text-ink-faint"> · {DONO_ROTULO[linha.dono]}</span>
                      </span>
                      <span className="text-label tabular whitespace-nowrap">
                        {linha.quantidade}
                        {Number(linha.estourados) > 0 && (
                          <span className="dias-parados" data-estourado="true">
                            {" "}
                            {linha.estourados} fora do prazo
                          </span>
                        )}
                      </span>
                    </div>
                    <BarraProporcao valor={Number(linha.quantidade)} total={totalAbertos} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="text-[1.0625rem] mb-1">Vencimentos à frente</h2>
          <p className="text-ink-muted text-label mb-4">
            Para dimensionar a demanda da clínica.
          </p>
          <dl className="grid gap-3 m-0">
            {[
              { rotulo: "Próximos 30 dias", valor: vencimentos.ate_30 },
              { rotulo: "Próximos 60 dias", valor: vencimentos.ate_60 },
              { rotulo: "Próximos 90 dias", valor: vencimentos.ate_90 },
            ].map((faixa) => (
              <div key={faixa.rotulo} className="flex items-baseline justify-between gap-3">
                <dt className="text-label text-ink-muted">{faixa.rotulo}</dt>
                <dd className="m-0 text-[1.25rem] font-medium tabular">{Number(faixa.valor)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="card mb-5">
        <h2 className="text-[1.0625rem] mb-1">Conclusões por mês</h2>
        <p className="text-ink-muted text-label mb-4">
          ASOs concluídos nos últimos 12 meses. É o indicador que diz se a
          operação está melhorando.
        </p>
        <GraficoConclusoes dados={curva} />
      </div>

      <div className="card p-0">
        <div className="p-5 pb-0">
          <h2 className="text-[1.0625rem] mb-1">Por supervisor</h2>
          <p className="text-ink-muted text-label mb-0">
            Ordenado por quem tem mais gente irregular. A linha &ldquo;Sem
            supervisor&rdquo; são os colaboradores por quem ninguém é cobrado.
          </p>
        </div>

        <div className="overflow-x-auto p-5 pt-3">
          {supervisores.length === 0 ? (
            <Vazio>Nenhum supervisor com equipe.</Vazio>
          ) : (
            <table className="tabela">
              <caption className="sr-only">Situação por supervisor</caption>
              <thead>
                <tr>
                  <th scope="col">Supervisor</th>
                  <th scope="col">Equipe</th>
                  <th scope="col">Vencidos</th>
                  <th scope="col">Sem registro</th>
                  <th scope="col">Críticos</th>
                  <th scope="col">Itens abertos</th>
                  <th scope="col">Parado há</th>
                </tr>
              </thead>
              <tbody>
                {supervisores.map((s) => (
                  <tr key={s.supervisor_id ?? "sem-supervisor"}>
                    <td>
                      <Link
                        href={`/qsms?supervisor=${s.supervisor_id ?? "sem-supervisor"}`}
                        className="font-medium no-underline"
                      >
                        {s.supervisor_nome}
                      </Link>
                    </td>
                    <td className="tabular">{Number(s.equipe)}</td>
                    <td className="tabular">{Number(s.vencidos)}</td>
                    <td className="tabular">{Number(s.sem_registro)}</td>
                    <td className="tabular">{Number(s.criticos)}</td>
                    <td className="tabular">{Number(s.itens_abertos)}</td>
                    <td>
                      <span className="dias-parados" data-estourado={Number(s.estourados) > 0}>
                        {Number(s.dias_mais_antigo)}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
