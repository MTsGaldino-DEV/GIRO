import { cache } from "react";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "./supabase/server";
import { BUCKET_FOTOS } from "./storage";
import type { ItemAberto, LinhaStatus, ResumoStatus } from "./tipos";

export { BUCKET_FOTOS } from "./storage";

export interface ColaboradorCompleto {
  id: string;
  matricula: number;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  uen: string | null;
  local: string | null;
  polo: string | null;
  data_admissao: string | null;
  data_nascimento: string | null;
  situacao: string;
  supervisor_id: string | null;
  foto_url: string | null;
  ativo: boolean;
}

/**
 * Carrega o colaborador ou encerra em 404.
 *
 * O 404 também cobre o caso de acesso negado: com RLS ativa, um colaborador
 * fora do alcance do usuário simplesmente não volta na consulta. Responder
 * "não existe" em vez de "existe mas você não pode ver" evita confirmar a
 * existência de um registro para quem não deveria saber dele.
 */
export async function carregarColaborador(id: string): Promise<ColaboradorCompleto> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("colaboradores")
    .select(
      "id, matricula, nome, cpf, cargo, uen, local, polo, data_admissao, data_nascimento, situacao, supervisor_id, foto_url, ativo"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  return data as ColaboradorCompleto;
}

/** Linha de conformidade do colaborador. Um requisito por linha; hoje, só o ASO. */
export async function carregarStatus(colaboradorId: string): Promise<LinhaStatus | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("vw_status_colaborador")
    .select("*")
    .eq("colaborador_id", colaboradorId)
    .order("peso_status")
    .limit(1)
    .maybeSingle();

  return (data as LinhaStatus) ?? null;
}

/** Ciclo em aberto, se houver. Colaborador em dia e fora da janela de 90 dias não tem. */
export async function carregarItemAberto(colaboradorId: string): Promise<ItemAberto | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("vw_itens_abertos")
    .select("*")
    .eq("colaborador_id", colaboradorId)
    .order("peso_status")
    .limit(1)
    .maybeSingle();

  return (data as ItemAberto) ?? null;
}

/**
 * URLs assinadas para uma página de fotos, numa chamada só.
 *
 * Uma assinatura por linha seria 25 chamadas sequenciais — mais lento que a
 * consulta que trouxe os dados. Caminhos vazios nem entram na chamada.
 */
export async function assinarFotos(caminhos: (string | null)[]): Promise<Map<string, string>> {
  const validos = [...new Set(caminhos.filter((c): c is string => !!c))];
  const mapa = new Map<string, string>();
  if (validos.length === 0) return mapa;

  const supabase = await criarClienteServidor();
  const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(validos, 3600);

  for (const item of data ?? []) {
    if (item.signedUrl && item.path) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

/** Uma foto só. Atalho para o cabeçalho da página do colaborador. */
export async function assinarFoto(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const mapa = await assinarFotos([caminho]);
  return mapa.get(caminho) ?? null;
}

/**
 * Contagem por status para o banner e para os cartões do painel.
 *
 * Em `cache()` porque o layout (banner global) e o painel do QSMS pedem os
 * mesmos números no mesmo request. Medido: era uma RPC de ~43 ms repetida a
 * cada carregamento de página, devolvendo por definição o mesmo resultado.
 */
export const obterResumoStatus = cache(async function obterResumoStatus(): Promise<ResumoStatus | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("fn_resumo_status");
  return (data?.[0] ?? null) as ResumoStatus | null;
});

/**
 * Polos distintos, para o filtro do painel.
 *
 * Não depende de nenhuma outra consulta — existe como função própria para
 * poder ser disparada junto das outras num `Promise.all` em vez de esperar a
 * fila inteira, que era o que acontecia antes (~38 ms no fim do caminho
 * crítico, sem motivo).
 */
export async function obterPolos(): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("colaboradores")
    .select("polo")
    .eq("ativo", true)
    .not("polo", "is", null);

  return [...new Set((data ?? []).map((p) => p.polo as string))].sort();
}
