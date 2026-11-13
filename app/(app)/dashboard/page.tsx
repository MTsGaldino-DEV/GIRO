import type { Metadata } from "next";
import { exigirOperador } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aplicarRegrasRadar } from "@/lib/consulta-itens";
import { contarPendenciasGeset } from "@/lib/consulta-geset";
import { buscarConcluidos, buscarItensAbertos, buscarLinhasStatus, buscarTodas } from "@/lib/consulta-dashboard";
import {
  agruparEtapas,
  conclusoesPorMes,
  contarPorEtapa,
  detalheParaTexto,
  lerDetalhe,
  maisProximosDeVencer,
  mediaDiasParados,
  mediaDiasPorEtapa,
  montarDetalhe,
  percentual,
  podeEscolherEquipe,
  porResponsavel,
  primeiroDiaDoMes,
  resolverEscopoDashboard,
  resumirPorPessoa,
  totalPorDono,
  type ContagemStatus,
} from "@/lib/regras-dashboard";
import { hojeIso } from "@/lib/dominio";
import { Aviso } from "@/components/aviso";
import { Info } from "@/components/info";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import type { PontoMes } from "@/components/grafico-conclusoes";
import { CartoesSemaforo } from "@/components/dashboard/cartoes-semaforo";
import { CartoesProcesso } from "@/components/dashboard/cartoes-processo";
import { PorEtapa } from "@/components/dashboard/por-etapa";
import { PorResponsavel } from "@/components/dashboard/por-responsavel";
import { MaisProximos } from "@/components/dashboard/mais-proximos";
import { OutrasMetricas } from "@/components/dashboard/outras-metricas";
import { DetalheDashboard, tituloDetalhe } from "@/components/dashboard/detalhe";
import { SegmentoEquipe } from "@/components/dashboard/segmento-equipe";
import { AtualizacaoAutomatica } from "./atualizacao";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const FUSO = "America/Sao_Paulo";
/** Meses da curva de conclusões (mockup dashboard-v3: seis). */
const MESES = 6;

function saudacao(agora: Date): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: FUSO }).format(agora));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** Linha de `fn_resumo_status` (bigint chega como texto). */
function lerResumo(bruto: unknown): ContagemStatus | null {
  const r = (Array.isArray(bruto) ? bruto[0] : null) as Record<string, number | string> | null;
  if (!r) return null;
  const n = (k: string) => Number(r[k]);
  return {
    total: n("total"),
    sem_registro: n("sem_registro"),
    vencido: n("vencido"),
    critico: n("critico"),
    atencao: n("atencao"),
    programar: n("programar"),
    ok: n("ok"),
  };
}

/**
 * Dashboard (spec 2026-11-13-telas-e-fluxo, seção 6; mockup dashboard-v3).
 *
 * UEN inteira para todos; quem tem equipe vinculada pode recortar a sua
 * (`?equipe=minha`). Na UEN, semáforo, etapas e curva vêm das RPCs; no recorte,
 * das mesmas views filtradas por `supervisor_id` (as RPCs não filtram). Cada
 * número abre a lista no fim da página (`?detalhe=`).
 */
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ equipe?: string; detalhe?: string }>;
}) {
  const perfil = await exigirOperador();
  const pedidos = await searchParams;
  const escopo = resolverEscopoDashboard(perfil, pedidos.equipe);
  const chave = lerDetalhe(pedidos.detalhe);
  const ativo = chave ? detalheParaTexto(chave) : null;
  const equipe = escopo === "minha" ? perfil.supervisor_id : null;
  const uen = escopo === "todas";

  const supabase = await criarClienteServidor();
  const hoje = hojeIso();
  const inicioMes = primeiroDiaDoMes(hoje);

  const [resumoRpc, etapasRpc, curvaRpc, geset, status, itens, radar, concluidos] = await Promise.all([
    uen ? supabase.rpc("fn_resumo_status") : null,
    uen ? supabase.rpc("fn_resumo_por_etapa") : null,
    uen ? supabase.rpc("fn_conclusoes_por_mes", { p_meses: MESES }) : null,
    contarPendenciasGeset(supabase),
    buscarLinhasStatus(supabase, equipe),
    buscarItensAbertos(supabase, equipe),
    buscarTodas<{ item_id: string }>((de, ate) =>
      aplicarRegrasRadar(supabase.from("vw_itens_abertos").select("item_id"), { equipe: escopo }, perfil.supervisor_id)
        .order("item_id")
        .range(de, ate)
    ),
    // Na UEN a curva vem da RPC; aqui basta o mês corrente. No recorte, os seis meses.
    buscarConcluidos(supabase, uen ? inicioMes : primeiroDiaDoMes(hoje, 1 - MESES), primeiroDiaDoMes(hoje, 1), equipe),
  ]);

  const erros = [resumoRpc?.error, etapasRpc?.error, curvaRpc?.error, status.erro, itens.erro, radar.erro, concluidos.erro].filter(Boolean);

  const contagem = (uen ? lerResumo(resumoRpc?.data) : null) ?? (status.erro ? null : resumirPorPessoa(status.linhas));
  const etapas = uen && etapasRpc?.data ? agruparEtapas(etapasRpc.data) : contarPorEtapa(itens.linhas);
  const curva: PontoMes[] =
    uen && curvaRpc?.data
      ? (curvaRpc.data as { mes: string; quantidade: number | string }[]).map((p) => ({ mes: p.mes, quantidade: Number(p.quantidade) }))
      : conclusoesPorMes(concluidos.linhas.map((c) => c.data_documento), hoje, MESES);
  const concluidosMes = concluidos.linhas.filter((c) => c.data_documento >= inicioMes);
  const idsRadar = radar.erro ? null : new Set(radar.linhas.map((r) => r.item_id));
  const responsaveis = porResponsavel(itens.linhas);

  const etapaPorRequisito = new Map(itens.linhas.map((i) => [`${i.colaborador_id}|${i.tipo_requisito_id}`, i.etapa]));
  const proximos = maisProximosDeVencer(status.linhas, 20).map((l) => ({
    ...l,
    etapa: etapaPorRequisito.get(`${l.colaborador_id}|${l.tipo_requisito_id}`) ?? null,
  }));

  const semItens = !!itens.erro;
  const detalhe = chave
    ? montarDetalhe(chave, { linhasStatus: status.linhas, itens: itens.linhas, idsRadar, concluidos: concluidosMes })
    : null;

  const agora = new Date();
  const primeiroNome = (perfil.nome ?? perfil.email).trim().split(/\s+/)[0];
  const dataHoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSO }).format(agora);

  return (
    <div>
      <CabecalhoPagina
        titulo={`${saudacao(agora)}, ${primeiroNome}`}
        descricao={
          <>
            <span className="first-letter:uppercase inline-block">
              {`${dataHoje} · ${uen ? "UEN inteira" : "sua equipe"}${contagem ? ` · ${contagem.total} pessoas` : ""}`}
            </span>{" "}
            <Info>Nos cartões coloridos, cada pessoa conta uma vez, no pior status entre ASO e AVP.</Info>
          </>
        }
      >
        <AtualizacaoAutomatica />
      </CabecalhoPagina>

      {podeEscolherEquipe(perfil) && (
        <div className="mb-4">
          <SegmentoEquipe escopo={escopo} />
        </div>
      )}

      {erros.length > 0 && (
        <div className="mb-4">
          <Aviso tom="forte" titulo="Parte dos números não carregou">
            Onde aparece “—”, o valor não pôde ser lido. Atualize a página em instantes.
          </Aviso>
        </div>
      )}

      <CartoesSemaforo contagem={contagem} escopo={escopo} ativo={ativo} />

      <CartoesProcesso
        escopo={escopo}
        ativo={ativo}
        numeros={{
          noRadar: idsRadar ? idsRadar.size : null,
          agendados: semItens ? null : itens.linhas.filter((i) => i.etapa === "agendado").length,
          parados: semItens ? null : itens.linhas.filter((i) => i.sla_estourado).length,
          concluidosMes: concluidos.erro ? null : concluidosMes.length,
          geset,
        }}
      />

      <div className="grid grid-cols-1 gap-5 mb-5 lg:grid-cols-2 items-start">
        <PorEtapa etapas={etapas} medias={mediaDiasPorEtapa(itens.linhas)} escopo={escopo} ativo={ativo} />
        <PorResponsavel donos={totalPorDono(etapas)} linhas={responsaveis} escopo={escopo} ativo={ativo} />
      </div>

      <div className="grid grid-cols-1 gap-5 mb-5 lg:grid-cols-2 items-start">
        <MaisProximos linhas={proximos} />
        <OutrasMetricas
          emDia={contagem ? percentual(contagem.ok, contagem.total) : null}
          mediaDias={mediaDiasParados(itens.linhas)}
          curva={curva}
          escopo={escopo}
          ativo={ativo}
        />
      </div>

      <DetalheDashboard
        titulo={chave ? tituloDetalhe(chave, responsaveis) : null}
        detalhe={detalhe}
        escopo={escopo}
      />
    </div>
  );
}
