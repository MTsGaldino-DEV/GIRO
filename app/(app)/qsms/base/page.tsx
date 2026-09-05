import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData, ORDEM_STATUS, STATUS_ROTULO, SITUACAO_ROTULO } from "@/lib/dominio";
import { SeloStatus } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import { LinhaBase } from "./linha";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import type { LinhaStatus, ResumoStatus, StatusConformidade } from "@/lib/tipos";

export const metadata: Metadata = { title: "Conferência da base" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

export default async function PaginaBase({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; busca?: string; pagina?: string }>;
}) {
  await exigirQsms();
  const { status: statusParam, busca, pagina: paginaParam } = await searchParams;

  // Filtro padrão em 'sem_registro': a tela existe para fechar esse buraco,
  // não para navegar os 261.
  const status = (statusParam ?? "sem_registro") as StatusConformidade | "todos";
  const pagina = Math.max(1, Number(paginaParam ?? "1") || 1);
  const inicio = (pagina - 1) * POR_PAGINA;

  const supabase = await criarClienteServidor();

  const { data: resumoBruto } = await supabase.rpc("fn_resumo_status");
  const resumo = (resumoBruto?.[0] ?? null) as ResumoStatus | null;

  let consulta = supabase
    .from("vw_status_colaborador")
    .select("*", { count: "exact" })
    .order("peso_status")
    .order("nome");

  if (status !== "todos") consulta = consulta.eq("status", status);
  if (busca?.trim()) {
    const termo = busca.trim();
    const comoNumero = Number.parseInt(termo.replace(/\D/g, ""), 10);
    consulta = Number.isFinite(comoNumero) && /^\d+$/.test(termo.trim())
      ? consulta.eq("matricula", comoNumero)
      : consulta.ilike("nome", `%${termo}%`);
  }

  const { data, count, error } = await consulta.range(inicio, inicio + POR_PAGINA - 1);
  const linhas = (data ?? []) as LinhaStatus[];
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  function url(patch: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const base = { status, busca: busca ?? "", pagina: String(pagina), ...patch };
    for (const [k, v] of Object.entries(base)) {
      if (v && !(k === "pagina" && v === "1")) p.set(k, v);
    }
    return `/qsms/base${p.toString() ? `?${p}` : ""}`;
  }

  return (
    <div>
      <CabecalhoPagina
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Conferência da base" }]}
        titulo="Conferência da base"
        descricao={
          <span className="block max-w-[70ch]">
            Informe a data do último ASO de cada colaborador. Cada data
            registrada aqui vira um evento retroativo e recoloca a pessoa no
            semáforo — sai de &ldquo;sem registro&rdquo; e passa a ter
            vencimento calculado.
          </span>
        }
      />

      {resumo && (
        <div className="card mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="text-[1.75rem] leading-none font-medium tabular">
            {Number(resumo.sem_registro)}
          </span>
          <span className="text-ink-muted text-label">
            de <span className="tabular">{Number(resumo.total)}</span> sem data de referência
          </span>
          {Number(resumo.sem_registro) === 0 && (
            <span className="text-label">
              Fase 0 concluída — todos os colaboradores têm data de referência.
            </span>
          )}
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[200px]">
          <label className="label" htmlFor="busca">
            Buscar
          </label>
          <input
            id="busca"
            name="busca"
            className="field"
            defaultValue={busca ?? ""}
            placeholder="Nome ou matrícula"
          />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="field" defaultValue={status}>
            <option value="sem_registro">{STATUS_ROTULO.sem_registro}</option>
            {ORDEM_STATUS.filter((s) => s !== "sem_registro").map((s) => (
              <option key={s} value={s}>
                {STATUS_ROTULO[s]}
              </option>
            ))}
            <option value="todos">Todos</option>
          </select>
        </div>
        <button type="submit" className="btn btn--secondary">
          Filtrar
        </button>
      </form>

      {error && (
        <p role="alert" className="text-label mb-4">
          Não foi possível carregar a base: {error.message}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="tabela">
          <caption className="sr-only">
            Colaboradores e data do último ASO registrado
          </caption>
          <thead>
            <tr>
              <th scope="col">Matrícula</th>
              <th scope="col">Colaborador</th>
              <th scope="col">Cargo</th>
              <th scope="col">Situação</th>
              <th scope="col">Último ASO</th>
              <th scope="col">Status</th>
              <th scope="col">Registrar data do último ASO</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={`${linha.colaborador_id}-${linha.tipo_requisito_id}`}>
                <td className="tabular text-ink-muted">{linha.matricula}</td>
                <td>
                  <Link
                    href={`/qsms/colaborador/${linha.colaborador_id}`}
                    className="font-medium no-underline"
                  >
                    {linha.nome}
                  </Link>
                  {linha.ultimo_documento_estimado && (
                    <span className="block text-caption text-ink-faint">data estimada</span>
                  )}
                </td>
                <td className="text-ink-muted text-label">{linha.cargo ?? "—"}</td>
                <td className="text-ink-muted text-label">
                  {SITUACAO_ROTULO[linha.situacao] ?? linha.situacao}
                </td>
                <td className="tabular">{formatarData(linha.ultimo_documento)}</td>
                <td>
                  <SeloStatus status={linha.status} dias={linha.dias_restantes} titulo />
                </td>
                <td>
                  <LinhaBase
                    colaboradorId={linha.colaborador_id}
                    tipoRequisitoId={linha.tipo_requisito_id}
                    nome={linha.nome}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {linhas.length === 0 && (
          <Vazio>
            {status === "sem_registro"
              ? "Nenhum colaborador sem data de referência. A Fase 0 está fechada."
              : "Nenhum colaborador nesse filtro."}
          </Vazio>
        )}
      </div>

      {paginas > 1 && (
        <nav className="flex items-center justify-between mt-4 text-label" aria-label="Paginação">
          <span className="text-ink-muted tabular">
            {inicio + 1}–{Math.min(inicio + POR_PAGINA, total)} de {total}
          </span>
          <span className="flex gap-2">
            {pagina > 1 && (
              <Link className="btn btn--secondary" href={url({ pagina: String(pagina - 1) })}>
                Anterior
              </Link>
            )}
            {pagina < paginas && (
              <Link className="btn btn--secondary" href={url({ pagina: String(pagina + 1) })}>
                Próxima
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}
