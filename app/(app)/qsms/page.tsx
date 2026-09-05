import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TabelaItens } from "@/components/tabela-itens";
import { assinarFotos, obterResumoStatus, obterPolos } from "@/lib/colaborador";
import { buscarPaginaItens, type FiltrosPainel } from "@/lib/consulta-itens";
import { BotaoGerarItens } from "./gerar-itens";
import type { ResumoStatus, Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Painel do QSMS" };
export const dynamic = "force-dynamic";

/**
 * Casca do painel: autenticação, contagens e a primeira página da tabela.
 *
 * Daqui em diante quem manda é `TabelaItens`, no navegador — filtro, ordenação
 * e paginação viraram consulta direta ao Postgres, sem passar por aqui. Esta
 * página continua renderizando a primeira página no servidor para que o HTML
 * nunca chegue vazio e um link filtrado, colado no chat, abra já com conteúdo.
 */
export default async function PainelQsms({
  searchParams,
}: {
  searchParams: Promise<FiltrosPainel>;
}) {
  await exigirQsms();
  const filtros = await searchParams;

  const supabase = await criarClienteServidor();

  // Três consultas independentes entre si, disparadas juntas. Os polos ficavam
  // por último, no fim da fila, esperando itens e fotos que não têm nada a ver
  // com eles — 38 ms de espera pura, medidos. O resumo vem de `cache()`, então
  // aqui reaproveita o que o layout já pediu em vez de repetir a RPC.
  const [resumo, { data: supervisoresBrutos }, polos] = await Promise.all([
    obterResumoStatus(),
    supabase.from("supervisores").select("id, nome, email, ativo").order("nome"),
    obterPolos(),
  ]);

  const supervisores = (supervisoresBrutos ?? []) as Supervisor[];

  // A view já traz foto_url (migration 0013), então a página deixou de precisar
  // de uma segunda consulta a `colaboradores` só para descobrir a miniatura.
  const { itens, total, erro } = await buscarPaginaItens(supabase, filtros);
  const urlPorCaminho = await assinarFotos(itens.map((i) => i.foto_url));
  const fotosIniciais = Object.fromEntries(urlPorCaminho);

  const temFiltro = Object.values(filtros).some(Boolean);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1>Painel do QSMS</h1>
          <p className="text-ink-muted text-label mt-1">
            {total} {total === 1 ? "item em aberto" : "itens em aberto"}
            {temFiltro && " no filtro atual"}.
          </p>
        </div>
        <BotaoGerarItens />
      </div>

      <TabelaItens
        inicial={{ itens, total, erro }}
        filtrosIniciais={filtros}
        fotosIniciais={fotosIniciais}
        supervisores={supervisores}
        polos={polos}
        resumo={resumo}
      />

    </div>
  );
}
