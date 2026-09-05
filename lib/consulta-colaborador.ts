import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemAberto, LinhaStatus, Supervisor } from "./tipos";
import type { ColaboradorCompleto } from "./colaborador";

/**
 * Consultas do Perfil do Colaborador, executáveis no navegador.
 *
 * As funções equivalentes em `lib/colaborador.ts` chamam `criarClienteServidor()`
 * por dentro, que importa `next/headers` — server-only, quebra o build se
 * chegar num componente de navegador. Aqui o cliente vem por parâmetro, então a
 * mesma função serve dos dois lados.
 *
 * É seguro porque a filtragem por papel mora na RLS do Postgres, não aqui:
 * `vw_status_colaborador`, `vw_itens_abertos` e `vw_documentos_colaborador` são
 * `security_invoker = true`, e as políticas de `colaboradores` e
 * `documentos_colaborador` filtram por `fn_e_qsms()` ou equipe. Quem abrir o
 * DevTools e refizer estas consultas à mão recebe exatamente as mesmas linhas.
 *
 * Mesmo padrão já provado em `lib/consulta-itens.ts` e `components/tabela-itens.tsx`.
 */

/** Cabeçalho do perfil: identificação, conformidade e ciclo em aberto. */
export interface ResumoColaborador {
  colaborador: ColaboradorCompleto;
  status: LinhaStatus | null;
  item: ItemAberto | null;
  supervisorNome: string | null;
  totalExames: number;
  totalDocumentos: number;
  fotoUrl: string | null;
}

const CAMPOS_COLABORADOR =
  "id, matricula, nome, cpf, cargo, uen, local, polo, data_admissao, data_nascimento, situacao, supervisor_id, foto_url, ativo";

/**
 * Tudo que o cabeçalho precisa, numa rodada de consultas paralelas.
 *
 * O colaborador vem primeiro porque `supervisor_id` e `foto_url` são entrada
 * das duas últimas — não dá para paralelizar o que depende do resultado.
 */
export async function carregarResumo(
  supabase: SupabaseClient,
  colaboradorId: string
): Promise<ResumoColaborador | null> {
  const { data: bruto } = await supabase
    .from("colaboradores")
    .select(CAMPOS_COLABORADOR)
    .eq("id", colaboradorId)
    .maybeSingle();

  // Sem linha significa "não existe" ou "fora do seu alcance pela RLS" — e a
  // interface trata os dois igual, de propósito: confirmar que o registro
  // existe para quem não pode vê-lo já é vazamento.
  if (!bruto) return null;
  const colaborador = bruto as ColaboradorCompleto;

  const [status, item, supervisor, exames, documentos, foto] = await Promise.all([
    supabase
      .from("vw_status_colaborador")
      .select("*")
      .eq("colaborador_id", colaboradorId)
      .order("peso_status")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("vw_itens_abertos")
      .select("*")
      .eq("colaborador_id", colaboradorId)
      .order("peso_status")
      .limit(1)
      .maybeSingle(),
    colaborador.supervisor_id
      ? supabase.from("supervisores").select("nome").eq("id", colaborador.supervisor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("eventos_requisito")
      .select("id", { count: "exact", head: true })
      .eq("colaborador_id", colaboradorId),
    supabase
      .from("documentos_colaborador")
      .select("id", { count: "exact", head: true })
      .eq("colaborador_id", colaboradorId),
    colaborador.foto_url
      ? supabase.storage.from("fotos").createSignedUrl(colaborador.foto_url, 3600)
      : Promise.resolve({ data: null }),
  ]);

  return {
    colaborador,
    status: (status.data as LinhaStatus) ?? null,
    item: (item.data as ItemAberto) ?? null,
    supervisorNome: (supervisor.data as { nome: string } | null)?.nome ?? null,
    totalExames: exames.count ?? 0,
    totalDocumentos: documentos.count ?? 0,
    fotoUrl: (foto.data as { signedUrl: string } | null)?.signedUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Aba ASO
// ---------------------------------------------------------------------------

export interface EventoColaborador {
  id: string;
  requisito: string;
  data_realizado: string | null;
  data_documento: string;
  vencia_em: string;
  resultado: string;
  clinica: string | null;
  medico: string | null;
  documento_url: string | null;
  observacoes: string | null;
  estimado: boolean;
}

/**
 * Exames do colaborador, com URL assinada de cada documento.
 *
 * As assinaturas saem numa chamada só (`createSignedUrls`, plural). Uma por
 * exame seria uma ida ao Storage por linha, em série — cinco ASOs custariam
 * cinco viagens antes da aba aparecer.
 */
export async function carregarExames(
  supabase: SupabaseClient,
  colaboradorId: string
): Promise<{ eventos: EventoColaborador[]; links: Record<string, string> }> {
  const { data } = await supabase
    .from("vw_eventos_colaborador")
    .select("*")
    .eq("colaborador_id", colaboradorId)
    .order("data_documento", { ascending: false });

  const eventos = (data ?? []) as EventoColaborador[];
  const caminhos = eventos.map((e) => e.documento_url).filter((c): c is string => !!c);

  const links: Record<string, string> = {};
  if (caminhos.length > 0) {
    const { data: assinadas } = await supabase.storage.from("asos").createSignedUrls(caminhos, 3600);
    const porCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
    for (const evento of eventos) {
      const url = evento.documento_url ? porCaminho.get(evento.documento_url) : null;
      if (url) links[evento.id] = url;
    }
  }

  return { eventos, links };
}

// ---------------------------------------------------------------------------
// Aba Documentos
// ---------------------------------------------------------------------------

export interface DocumentoColaborador {
  id: string;
  colaborador_id: string;
  nome_arquivo: string;
  tipo: string;
  storage_path: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  data_documento: string | null;
  data_validade: string | null;
  descricao: string | null;
  criado_em: string;
  criado_por: string | null;
  criado_por_nome: string;
  vencido: boolean;
}

export async function carregarDocumentos(
  supabase: SupabaseClient,
  colaboradorId: string
): Promise<{ documentos: DocumentoColaborador[]; links: Record<string, string> }> {
  const { data } = await supabase
    .from("vw_documentos_colaborador")
    .select("*")
    .eq("colaborador_id", colaboradorId)
    .order("criado_em", { ascending: false });

  const documentos = (data ?? []) as DocumentoColaborador[];
  const links: Record<string, string> = {};

  if (documentos.length > 0) {
    const { data: assinadas } = await supabase.storage
      .from("documentos")
      .createSignedUrls(documentos.map((d) => d.storage_path), 3600);
    const porCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
    for (const doc of documentos) {
      const url = porCaminho.get(doc.storage_path);
      if (url) links[doc.id] = url;
    }
  }

  return { documentos, links };
}

/**
 * Tipos sugeridos no formulário de anexo.
 *
 * Lista fixa, não tabela: um catálogo no banco só se paga quando houver regra
 * pendurada no tipo (validade obrigatória, alerta de vencimento, exigência por
 * cargo) — e nada disso existe na V1. O campo aceita texto livre, então um tipo
 * fora da lista não fica bloqueado.
 */
export const TIPOS_DOCUMENTO = [
  "Avaliação Psicológica",
  "Exame Complementar",
  "Certificado de Treinamento",
  "Documento Pessoal",
  "Atestado",
  "Outro",
] as const;

// ---------------------------------------------------------------------------
// Aba Histórico
// ---------------------------------------------------------------------------

export interface EntradaLinhaDoTempo {
  id: string;
  /** "aso" vem da máquina de estados; "cadastro" da auditoria de campo. */
  fonte: "aso" | "cadastro";
  criado_em: string;
  autor_nome: string | null;
  acao: string | null;
  entidade: string | null;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  etapa_de: string | null;
  etapa_para: string | null;
  observacao: string | null;
  em_nome_de: string | null;
}

export const HISTORICO_POR_PAGINA = 25;

/**
 * Linha do tempo unificada, paginada.
 *
 * Pede uma entrada a mais que o tamanho da página para saber se existe próxima
 * sem precisar de um `count` — que na RPC custaria varrer as duas tabelas de
 * novo só para descobrir um número que a interface usa apenas como "tem mais?".
 */
export async function carregarLinhaDoTempo(
  supabase: SupabaseClient,
  colaboradorId: string,
  deslocamento = 0
): Promise<{ entradas: EntradaLinhaDoTempo[]; temMais: boolean }> {
  const { data } = await supabase.rpc("fn_linha_do_tempo_colaborador", {
    p_colaborador_id: colaboradorId,
    p_limite: HISTORICO_POR_PAGINA + 1,
    p_deslocamento: deslocamento,
  });

  const todas = (data ?? []) as EntradaLinhaDoTempo[];
  return {
    entradas: todas.slice(0, HISTORICO_POR_PAGINA),
    temMais: todas.length > HISTORICO_POR_PAGINA,
  };
}

// ---------------------------------------------------------------------------
// Aba Cadastro
// ---------------------------------------------------------------------------

export async function carregarSupervisoresAtivos(
  supabase: SupabaseClient
): Promise<Supervisor[]> {
  const { data } = await supabase
    .from("supervisores")
    .select("id, nome, email, ativo")
    .eq("ativo", true)
    .order("nome");
  return (data ?? []) as Supervisor[];
}
