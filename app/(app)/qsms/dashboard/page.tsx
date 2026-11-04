import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { assinarFotos } from "@/lib/colaborador";
import { SeloStatus } from "@/components/selo-status";
import { GraficoConclusoes, type PontoMes } from "@/components/grafico-conclusoes";
import { RoscaStatus } from "@/components/rosca-status";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { Vazio } from "@/components/aviso";
import { Info } from "@/components/info";
import { ETAPA_ROTULO, DONO_ROTULO } from "@/lib/dominio";
import { AtualizacaoAutomatica } from "./atualizacao";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { NumeroAnimado } from "@/components/numero-animado";
import type { ResumoStatus, Etapa, Dono, ItemAberto } from "@/lib/tipos";

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
function BarraProporcao({ valor, total, indice = 0 }: { valor: number; total: number; indice?: number }) {
  const porcento = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden mt-1.5"
      style={{ background: "var(--color-line)" }}
      role="presentation"
    >
      <div
        className="h-full rounded-full barra-proporcao__valor"
        style={{ width: `${porcento}%`, background: "var(--color-brand)", "--i": indice } as React.CSSProperties}
      />
    </div>
  );
}

const FUSO = "America/Sao_Paulo";

function saudacao(agora: Date): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: FUSO }).format(agora));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Dashboard "ação primeiro" (redesign do QSMS, 03/11/2026).
 *
 * A ordem da tela é a ordem das perguntas de quem abre o sistema de manhã:
 * o que está pegando fogo (três números), quem está parado há mais tempo (com
 * o botão para agir), onde está o gargalo (supervisão ou QSMS) e só depois o
 * retrato geral — status, curva, demanda à frente e ranking.
 */
export default async function Dashboard() {
  const perfil = await exigirQsms();
  const supabase = await criarClienteServidor();

  const [
    { data: resumoBruto },
    { data: etapasBrutas },
    { data: supervisoresBrutos },
    { data: curvaBruta },
    { data: vencimentosBrutos },
    { data: paradosBrutos },
  ] = await Promise.all([
    supabase.rpc("fn_resumo_status"),
    supabase.rpc("fn_resumo_por_etapa"),
    supabase.rpc("fn_resumo_por_supervisor"),
    supabase.rpc("fn_conclusoes_por_mes", { p_meses: 12 }),
    supabase.rpc("fn_vencimentos_a_frente"),
    supabase.from("vw_itens_abertos").select("*").order("dias_parados", { ascending: false }).limit(5),
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
  const parados = (paradosBrutos ?? []) as ItemAberto[];
  const fotos = await assinarFotos(parados.map((p) => p.foto_url));

  const totalAbertos = etapas.reduce((soma, e) => soma + Number(e.quantidade), 0);

  // "Onde está a bola", dividido pelo dono da etapa: é o que responde se o
  // gargalo é a supervisão que não libera ou o QSMS que não agenda.
  const lados = (["supervisor", "qsms"] as const).map((dono) => {
    const linhas = etapas.filter((e) => e.dono === dono);
    return {
      dono,
      linhas,
      quantidade: linhas.reduce((soma, e) => soma + Number(e.quantidade), 0),
      estourados: linhas.reduce((soma, e) => soma + Number(e.estourados), 0),
    };
  });

  const agora = new Date();
  const primeiroNome = (perfil.nome ?? perfil.email).trim().split(/\s+/)[0];
  const hoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSO }).format(agora);

  const urgencias = resumo
    ? [
        {
          rotulo: "Vencidos",
          valor: Number(resumo.vencido),
          href: "/qsms?status=vencido",
          selo: <SeloStatus status="vencido" dias={null} />,
        },
        {
          rotulo: "Sem registro",
          valor: Number(resumo.sem_registro),
          href: "/qsms?status=sem_registro",
          selo: <SeloStatus status="sem_registro" dias={null} />,
        },
        {
          rotulo: "Fora do prazo",
          valor: Number(resumo.sla_estourado),
          href: "/qsms?parados=1",
          selo: <span className="text-caption text-ink-muted">SLA da etapa estourado</span>,
        },
      ]
    : [];

  return (
    <div>
      <CabecalhoPagina
        titulo={`${saudacao(agora)}, ${primeiroNome}`}
        descricao={<span className="first-letter:uppercase inline-block">{hoje}</span>}
      >
        <AtualizacaoAutomatica />
      </CabecalhoPagina>

      {urgencias.length > 0 && (
        <>
          <h2 className="sr-only">O que pede ação</h2>
          <div className="grid gap-4 mb-5 sm:grid-cols-3">
            {urgencias.map((u) => (
              <Link key={u.rotulo} href={u.href} className="card card--interativo urgencia no-underline">
                <span className="urgencia__rotulo">{u.rotulo}</span>
                <span className="urgencia__numero tabular">
                  <NumeroAnimado valor={u.valor} />
                </span>
                {u.selo}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] items-start mb-5">
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[1.0625rem]">Parados há mais tempo</h2>
            <Info>Os cinco itens que estão há mais dias na mesma etapa, de qualquer status.</Info>
            <Link href="/qsms?ordem=parados&dir=desc" className="ml-auto text-label">
              Ver todos
            </Link>
          </div>

          {parados.length === 0 ? (
            <Vazio>Nenhum item em aberto.</Vazio>
          ) : (
            <ul className="list-none m-0 p-0 grid">
              {parados.map((item) => (
                <li key={item.item_id} className="parado">
                  <AvatarColaborador nome={item.nome} fotoUrl={fotos.get(item.foto_url ?? "")} tamanho={40} />
                  <div className="min-w-0 flex-1">
                    <BotaoNomeColaborador
                      colaboradorId={item.colaborador_id}
                      nome={item.nome}
                      className="cartao-item__nome"
                    />
                    <span className="block text-caption text-ink-faint truncate">
                      {ETAPA_ROTULO[item.etapa]} · com {DONO_ROTULO[item.dono]}
                    </span>
                  </div>
                  <span className="dias-parados parado__dias" data-estourado={item.sla_estourado}>
                    {item.dias_parados}d
                  </span>
                  <Link href={`/qsms/item/${item.item_id}`} className="btn btn--secondary btn--sm">
                    Agir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[1.0625rem]">Onde está a bola</h2>
            <Info>
              Itens abertos pelo dono da etapa atual: mostra se o gargalo é a
              supervisão que não libera ou o QSMS que não agenda.
            </Info>
          </div>

          {totalAbertos === 0 ? (
            <Vazio>Nenhum item em aberto.</Vazio>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {lados.map((lado) => (
                <div key={lado.dono} className="bola">
                  <span className="urgencia__rotulo">{DONO_ROTULO[lado.dono]}</span>
                  <span className="text-[1.75rem] font-medium leading-tight tabular">
                    <NumeroAnimado valor={lado.quantidade} />
                  </span>
                  <span className="text-caption text-ink-faint">
                    {lado.estourados > 0 ? `${lado.estourados} fora do prazo` : "Nada fora do prazo"}
                  </span>
                  <BarraProporcao valor={lado.quantidade} total={totalAbertos} />

                  <ul className="list-none m-0 p-0 mt-3 grid gap-1.5">
                    {lado.linhas.map((linha) => (
                      <li key={linha.etapa}>
                        <Link
                          href={`/qsms?etapa=${linha.etapa}`}
                          className="flex items-baseline justify-between gap-2 text-label text-ink no-underline hover:text-brand"
                        >
                          <span className="truncate">{ETAPA_ROTULO[linha.etapa]}</span>
                          <span className="tabular text-ink-muted">{linha.quantidade}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] items-start mb-5">
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[1.0625rem]">Conclusões por mês</h2>
            <Info>ASOs concluídos nos últimos 12 meses. É o indicador que diz se a operação está melhorando.</Info>
          </div>
          <GraficoConclusoes dados={curva} />
        </section>

        <div className="grid gap-5">
          {resumo && (
            <section className="card">
              <h2 className="text-[1.0625rem] mb-4">Status da base</h2>
              <RoscaStatus resumo={resumo} />
            </section>
          )}

          <section className="card">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[1.0625rem]">Vencimentos à frente</h2>
              <Info>Para dimensionar a demanda da clínica.</Info>
            </div>
            <dl className="grid grid-cols-3 gap-3 m-0">
              {[
                { rotulo: "30 dias", valor: vencimentos.ate_30 },
                { rotulo: "60 dias", valor: vencimentos.ate_60 },
                { rotulo: "90 dias", valor: vencimentos.ate_90 },
              ].map((faixa) => (
                <div key={faixa.rotulo} className="flex flex-col">
                  <dd className="m-0 order-1 text-[1.5rem] font-medium tabular">
                    <NumeroAnimado valor={Number(faixa.valor)} />
                  </dd>
                  <dt className="order-2 text-caption text-ink-faint">{faixa.rotulo}</dt>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="flex items-center gap-2">
          <h2 className="text-[1.0625rem]">Por supervisor</h2>
          <Info>
            Ordenado por quem tem mais gente irregular. A linha “Sem supervisor”
            são os colaboradores por quem ninguém é cobrado.
          </Info>
        </div>

        <div className="overflow-x-auto mt-3">
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
      </section>
    </div>
  );
}
