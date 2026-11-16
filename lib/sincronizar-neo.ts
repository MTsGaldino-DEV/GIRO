import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhaNeo } from "./neo";

/**
 * Sincronização com a CENTRAL-NEO: busca o cadastro inteiro na NEO e entrega à
 * RPC `fn_sincronizar_neo`, que casa, atualiza e audita tudo numa transação.
 *
 * Ordem que importa: a listagem COMPLETA vem primeiro. Se a NEO estiver fora do
 * ar, recusar o segredo, devolver HTTP 500 ou cortar a paginação, a RPC nem é
 * chamada e nada fica aplicado pela metade (Review Focus 5 do plano).
 *
 * Sem log de linhas, nomes ou CPF. Mensagens de falha gravadas em
 * `neo_sincronizacoes` e relançadas não carregam segredo nem detalhe do Postgres:
 * só o texto de um `ErroNeo` (escrito em lib/neo.ts) ou uma frase genérica.
 *
 * `listar` é injetado (quem chama passa `listarColaboradoresNeo`) para este arquivo
 * continuar testável sem rede: scripts/teste-neo-sincronizar.mjs.
 */

export type OrigemSincronizacao = "cron" | "manual" | "carga";

/** Formato devolvido por `fn_sincronizar_neo` (migration 0024). */
export type RelatorioSincronizacao = {
  total_neo: number;
  ligados_novos: number;
  atualizados: number;
  sem_mudanca: number;
  nao_numericas: number;
  na_neo_fora_do_giro: number;
  no_giro_sem_neo: number;
  divergencias: { matricula: number; motivo: "cpf_diferente" | "ja_ligada_a_outro" }[];
  matricula_diferente: number;
  campos_alterados: Record<string, number>;
  desligados_novos: number;
  supervisores_vinculados: number;
  supervisores_sem_vinculo: { texto: string; quantidade: number }[];
  bases: { base: string; quantidade: number }[];
};

export type OpcoesSincronizacao = {
  aplicar: boolean;
  origem: OrigemSincronizacao;
  listar: () => Promise<LinhaNeo[]>;
};

const MENSAGEM_GENERICA = "Não foi possível sincronizar com a NEO.";

/** `ErroNeo` (lib/neo.ts) reconhecido pelo nome, para este arquivo não importar valor de lá. */
function ehErroNeo(e: unknown): e is Error {
  return e instanceof Error && e.name === "ErroNeo";
}

/** Grava a tentativa que falhou; se isso também falhar, o erro original é que importa. */
async function registrarFalha(
  supabase: SupabaseClient,
  origem: OrigemSincronizacao,
  mensagem: string
): Promise<void> {
  try {
    await supabase.rpc("fn_registrar_falha_neo", { p_origem: origem, p_erro: mensagem });
  } catch {
    // não mascarar o erro original
  }
}

export async function executarSincronizacao(
  supabase: SupabaseClient,
  opcoes: OpcoesSincronizacao
): Promise<RelatorioSincronizacao> {
  const { aplicar, origem, listar } = opcoes;

  let linhas: LinhaNeo[];
  try {
    linhas = await listar();
  } catch (e) {
    const erro = ehErroNeo(e) ? e : new Error(MENSAGEM_GENERICA);
    if (aplicar) await registrarFalha(supabase, origem, erro.message);
    throw erro;
  }

  const { data, error } = await supabase.rpc("fn_sincronizar_neo", {
    p_linhas: linhas,
    p_aplicar: aplicar,
    p_origem: origem,
  });

  if (error) {
    const mensagem = `Falha ao gravar a sincronização (${error.code ?? "sem código"}).`;
    if (aplicar) await registrarFalha(supabase, origem, mensagem);
    throw new Error(mensagem);
  }

  return data as RelatorioSincronizacao;
}

/** Só números: o que a rota de cron devolve e registra (nunca pessoas, matrículas ou textos). */
export function resumoContagens(r: RelatorioSincronizacao) {
  return {
    total_neo: r.total_neo,
    ligados_novos: r.ligados_novos,
    atualizados: r.atualizados,
    sem_mudanca: r.sem_mudanca,
    nao_numericas: r.nao_numericas,
    na_neo_fora_do_giro: r.na_neo_fora_do_giro,
    no_giro_sem_neo: r.no_giro_sem_neo,
    divergencias: r.divergencias.length,
    matricula_diferente: r.matricula_diferente,
    desligados_novos: r.desligados_novos,
    supervisores_vinculados: r.supervisores_vinculados,
    supervisores_sem_vinculo: r.supervisores_sem_vinculo.length,
  };
}
