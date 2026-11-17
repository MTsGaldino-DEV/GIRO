import type { Metadata } from "next";
import { exigirOperador } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { assinarFotos } from "@/lib/colaborador";
import { carregarColaboradores } from "@/lib/consulta-colaboradores";
import {
  consultarColaboradores,
  equipePadrao,
  normalizarFiltros,
  podeEscolherMinha,
  type ParametrosUrl,
} from "@/lib/regras-colaboradores";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { ListaColaboradores } from "@/components/colaboradores/lista";
import { BotaoAtualizarNeo } from "@/components/colaboradores/botao-atualizar-neo";
import { estadoDaSincronizacao, type TentativaNeo } from "@/lib/estado-neo";

export const metadata: Metadata = { title: "Colaboradores" };
export const dynamic = "force-dynamic";

/**
 * Lista única de colaboradores da UEN, para qualquer operador (spec, seção 9).
 *
 * Lê as ~250 pessoas uma vez e entrega à lista, que filtra e pagina no
 * navegador. O supervisor com equipe vinculada abre em "Minha equipe" e pode
 * tirar o filtro; os demais abrem em "Todos". As fotos da primeira página vêm
 * assinadas daqui, para o HTML já chegar com elas.
 */
export default async function Colaboradores({
  searchParams,
}: {
  searchParams: Promise<ParametrosUrl>;
}) {
  const perfil = await exigirOperador();
  const filtros = normalizarFiltros(await searchParams, perfil);

  const supabase = await criarClienteServidor();
  const [dados, { data: supervisoresBrutos }, { data: tipos }, { data: tentativasBrutas }] = await Promise.all([
    carregarColaboradores(supabase),
    supabase.from("supervisores").select("id, nome").order("nome"),
    supabase.from("tipos_requisito").select("nome").eq("ativo", true).order("nome"),
    // Sem a tabela (migration 0023 ainda não aplicada) a consulta só volta vazia: a página abre igual.
    supabase
      .from("neo_sincronizacoes")
      .select("iniciado_em, origem, erro")
      .order("iniciado_em", { ascending: false })
      .limit(10),
  ]);
  const sincronizacao = estadoDaSincronizacao(
    ((tentativasBrutas ?? []) as Omit<TentativaNeo, "resumo">[]).map((t) => ({ ...t, resumo: null }))
  );

  const primeira = consultarColaboradores(dados, filtros, perfil.supervisor_id);
  const urlPorCaminho = await assinarFotos(primeira.linhas.map((l) => l.foto_url));

  return (
    <div>
      <CabecalhoPagina
        titulo="Colaboradores"
        descricao="Quem trabalha na UEN, com o pior status de cada pessoa. Abra o nome para ver o perfil."
      >
        <BotaoAtualizarNeo
          ultimaSucessoEm={sincronizacao.ultimaSucessoEm}
          ultimaFalhou={sincronizacao.ultimaFalhou}
        />
      </CabecalhoPagina>

      <ListaColaboradores
        dados={dados}
        filtrosIniciais={filtros}
        fotosIniciais={Object.fromEntries(urlPorCaminho)}
        supervisores={(supervisoresBrutos ?? []) as { id: string; nome: string }[]}
        requisitos={(tipos ?? []).map((t) => t.nome as string)}
        escopo={{
          equipePadrao: equipePadrao(perfil),
          supervisorId: perfil.supervisor_id,
          podeEscolherMinha: podeEscolherMinha(perfil),
        }}
      />
    </div>
  );
}
