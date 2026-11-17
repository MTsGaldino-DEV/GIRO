import type { Metadata } from "next";
import { exigirOperador } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { GradeItens } from "@/components/grade-itens";
import { assinarFotos, obterPolos } from "@/lib/colaborador";
import {
  buscarPaginaItens,
  contarItensPorEtapa,
  equipePadrao,
  resolverEquipe,
  type FiltrosPainel,
} from "@/lib/consulta-itens";
import { ETAPAS_ABERTAS } from "@/lib/regras-dashboard";
import { BotaoGerarItens } from "./gerar-itens";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { ListaGeset } from "@/components/geset/lista-geset";
import { SegmentoFila } from "@/components/geset/segmento-fila";
import {
  buscarPendenciasGeset,
  contarPendenciasGeset,
  normalizarFiltrosGeset,
} from "@/lib/consulta-geset";
import type { Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Radar" };
export const dynamic = "force-dynamic";

/**
 * Casca do painel: autenticação, contagens e a primeira página da grade.
 *
 * Daqui em diante quem manda é `GradeItens`, no navegador — filtro, ordenação
 * e paginação viraram consulta direta ao Postgres, sem passar por aqui. Esta
 * página continua renderizando a primeira página no servidor para que o HTML
 * nunca chegue vazio e um link filtrado, colado no chat, abra já com conteúdo.
 */
export default async function Radar({
  searchParams,
}: {
  searchParams: Promise<FiltrosPainel & { fila?: string }>;
}) {
  const perfil = await exigirOperador();
  const { fila, ...pedidos } = await searchParams;

  // O escopo é resolvido aqui, uma vez, e desce já definido: servidor e
  // navegador consultam com o mesmo valor, sem cada um inventar o padrão.
  const padrao = equipePadrao(perfil);
  const filtros: FiltrosPainel = { ...pedidos, equipe: resolverEquipe(perfil, pedidos) };

  const supabase = await criarClienteServidor();

  // Fila "Falta lançar no GESET": outra visão do mesmo Radar, escolhida pela URL.
  if (fila === "geset") {
    return paginaGeset(supabase, pedidos);
  }

  // Consultas independentes entre si, disparadas juntas. Os polos ficavam por
  // último, no fim da fila, esperando itens e fotos que não têm nada a ver com
  // eles — 38 ms de espera pura, medidos. As contagens da faixa "Para você
  // agir" entram aqui pelo mesmo motivo: o HTML já chega com os números.
  const [contagensIniciais, { data: supervisoresBrutos }, polos, { data: tipos }, pendentesGeset] = await Promise.all([
    contarItensPorEtapa(
      supabase,
      ETAPAS_ABERTAS,
      filtros.equipe ?? padrao,
      perfil.supervisor_id
    ),
    supabase.from("supervisores").select("id, nome, email, ativo").order("nome"),
    obterPolos(),
    supabase.from("tipos_requisito").select("nome").eq("ativo", true).order("nome"),
    contarPendenciasGeset(supabase),
  ]);

  const supervisores = (supervisoresBrutos ?? []) as Supervisor[];

  // A view já traz foto_url (migration 0013), então a página deixou de precisar
  // de uma segunda consulta a `colaboradores` só para descobrir a miniatura.
  const { itens, total, erro } = await buscarPaginaItens(supabase, filtros, perfil.supervisor_id);
  const urlPorCaminho = await assinarFotos(itens.map((i) => i.foto_url));
  const fotosIniciais = Object.fromEntries(urlPorCaminho);

  return (
    <div>
      <CabecalhoPagina
        trilha={[{ rotulo: "Operação" }, { rotulo: "Radar" }]}
        titulo="Radar"
        descricao="Vencidos, sem registro e quem vence em até 90 dias."
      >
        <BotaoGerarItens />
      </CabecalhoPagina>

      <SegmentoFila ativa="acoes" pendentes={pendentesGeset} />

      <GradeItens
        inicial={{ itens, total, erro }}
        filtrosIniciais={filtros}
        fotosIniciais={fotosIniciais}
        supervisores={supervisores}
        polos={polos}
        requisitos={(tipos ?? []).map((t) => t.nome as string)}
        contagensIniciais={contagensIniciais}
        escopo={{
          papel: perfil.papel,
          equipePadrao: padrao,
          supervisorId: perfil.supervisor_id,
          // QSMS/admin sem vínculo não têm "equipe" para escolher.
          podeEscolherMinha: perfil.papel === "supervisor" || !!perfil.supervisor_id,
        }}
      />

    </div>
  );
}

/**
 * A fila do GESET, com a primeira página já no HTML. O mesmo cabeçalho e o
 * mesmo segmento: só o conteúdo abaixo troca.
 */
async function paginaGeset(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  pedidos: FiltrosPainel
) {
  const filtros = normalizarFiltrosGeset(pedidos);

  const [inicial, pendentes, { data: tipos }] = await Promise.all([
    buscarPendenciasGeset(supabase, filtros),
    contarPendenciasGeset(supabase),
    supabase.from("tipos_requisito").select("nome").eq("ativo", true).order("nome"),
  ]);

  const urlPorCaminho = await assinarFotos(inicial.linhas.map((l) => l.foto_url));

  return (
    <div>
      <CabecalhoPagina
        trilha={[{ rotulo: "Operação" }, { rotulo: "Radar" }]}
        titulo="Radar"
        descricao="ASO e AVP concluídos que faltam lançar no GESET."
      >
        <BotaoGerarItens />
      </CabecalhoPagina>

      <SegmentoFila ativa="geset" pendentes={pendentes} />

      <ListaGeset
        inicial={inicial}
        filtrosIniciais={{
          busca: filtros.busca || undefined,
          requisito: filtros.requisito,
          pagina: filtros.pagina > 1 ? filtros.pagina : undefined,
        }}
        fotosIniciais={Object.fromEntries(urlPorCaminho)}
        requisitos={(tipos ?? []).map((t) => t.nome as string)}
      />
    </div>
  );
}
