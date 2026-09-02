import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  ETAPA_ROTULO,
  DONO_ROTULO,
  ORDEM_STATUS,
  STATUS_ROTULO,
  formatarData,
  avisoJanelaUtil,
} from "@/lib/dominio";
import { SeloStatus, CartaoContagem } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { Paginacao } from "@/components/paginacao";
import { assinarFotos } from "@/lib/colaborador";
import { BotaoGerarItens } from "./gerar-itens";
import { ColunaOrdenavel, COLUNAS_ORDENAVEIS, ehChaveOrdenacao } from "./ordenacao";
import type { ItemAberto, ResumoStatus, Supervisor, Etapa, StatusConformidade } from "@/lib/tipos";

export const metadata: Metadata = { title: "Painel do QSMS" };
export const dynamic = "force-dynamic";

const SEM_SUPERVISOR = "sem-supervisor";

const POR_PAGINA = 25;

export default async function PainelQsms({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    etapa?: string;
    supervisor?: string;
    polo?: string;
    parados?: string;
    ordem?: string;
    dir?: string;
    pagina?: string;
  }>;
}) {
  await exigirQsms();
  const filtros = await searchParams;

  const supabase = await criarClienteServidor();

  const [{ data: resumoBruto }, { data: supervisoresBrutos }] = await Promise.all([
    supabase.rpc("fn_resumo_status"),
    supabase.from("supervisores").select("id, nome, email, ativo").order("nome"),
  ]);

  const resumo = (resumoBruto?.[0] ?? null) as ResumoStatus | null;
  const supervisores = (supervisoresBrutos ?? []) as Supervisor[];

  const ordem = ehChaveOrdenacao(filtros.ordem) ? filtros.ordem : null;
  const direcao = filtros.dir === "desc" ? "desc" : "asc";
  const pagina = Math.max(1, Number(filtros.pagina) || 1);

  // count exact: a paginação precisa do total, não só da fatia.
  let consulta = supabase.from("vw_itens_abertos").select("*", { count: "exact" });

  if (ordem) {
    consulta = consulta.order(COLUNAS_ORDENAVEIS[ordem].coluna, { ascending: direcao === "asc" });
  } else {
    // Padrão: pior primeiro, e dentro do mesmo status quem está parado há mais
    // tempo. É a ordem que responde "o que eu faço agora".
    consulta = consulta.order("peso_status").order("dias_parados", { ascending: false });
  }

  if (filtros.status) consulta = consulta.eq("status", filtros.status);
  if (filtros.etapa) consulta = consulta.eq("etapa", filtros.etapa);
  if (filtros.polo) consulta = consulta.eq("polo", filtros.polo);
  if (filtros.parados === "1") consulta = consulta.eq("sla_estourado", true);
  if (filtros.supervisor === SEM_SUPERVISOR) consulta = consulta.is("supervisor_id", null);
  else if (filtros.supervisor) consulta = consulta.eq("supervisor_id", filtros.supervisor);

  const inicio = (pagina - 1) * POR_PAGINA;
  const { data, error, count } = await consulta.range(inicio, inicio + POR_PAGINA - 1);
  const itens = (data ?? []) as ItemAberto[];
  const total = count ?? 0;

  // A view de itens não carrega foto_url. Uma consulta pelos ids da página,
  // depois uma única chamada de assinatura para todas as fotos dela.
  const { data: fotosBrutas } = await supabase
    .from("colaboradores")
    .select("id, foto_url")
    .in("id", itens.map((i) => i.colaborador_id));

  const caminhoPorColaborador = new Map(
    (fotosBrutas ?? []).map((c) => [c.id, c.foto_url as string | null])
  );
  const urlPorCaminho = await assinarFotos([...caminhoPorColaborador.values()]);

  const { data: polosBrutos } = await supabase
    .from("colaboradores")
    .select("polo")
    .eq("ativo", true)
    .not("polo", "is", null);
  const polos = [...new Set((polosBrutos ?? []).map((p) => p.polo as string))].sort();

  const temFiltro = Object.entries(filtros).some(([, v]) => v);

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

      {resumo && (
        <>
          <h2 className="sr-only">Contagem por status</h2>
          <div className="grid gap-3 mb-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {ORDEM_STATUS.map((s) => (
              <Link key={s} href={`/qsms?status=${s}`} className="no-underline">
                <CartaoContagem
                  status={s}
                  quantidade={Number(resumo[s as keyof ResumoStatus] ?? 0)}
                  ativo={filtros.status === s}
                />
              </Link>
            ))}
          </div>
        </>
      )}

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="f-status">Status</label>
          <select id="f-status" name="status" className="field" defaultValue={filtros.status ?? ""}>
            <option value="">Todos</option>
            {ORDEM_STATUS.map((s) => (
              <option key={s} value={s}>{STATUS_ROTULO[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-etapa">Etapa</label>
          <select id="f-etapa" name="etapa" className="field" defaultValue={filtros.etapa ?? ""}>
            <option value="">Todas</option>
            {(Object.keys(ETAPA_ROTULO) as Etapa[])
              .filter((e) => e !== "concluido")
              .map((e) => (
                <option key={e} value={e}>{ETAPA_ROTULO[e]}</option>
              ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-supervisor">Supervisor</label>
          <select
            id="f-supervisor"
            name="supervisor"
            className="field"
            defaultValue={filtros.supervisor ?? ""}
          >
            <option value="">Todos</option>
            <option value={SEM_SUPERVISOR}>Sem supervisor</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        {polos.length > 1 && (
          <div>
            <label className="label" htmlFor="f-polo">Polo</label>
            <select id="f-polo" name="polo" className="field" defaultValue={filtros.polo ?? ""}>
              <option value="">Todos</option>
              {polos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-2 text-label h-[42px]">
          <input
            type="checkbox"
            name="parados"
            value="1"
            defaultChecked={filtros.parados === "1"}
            className="size-4"
          />
          Só SLA estourado
        </label>

        <button type="submit" className="btn btn--secondary">Filtrar</button>
        {temFiltro && (
          <Link href="/qsms" className="btn btn--secondary">Limpar</Link>
        )}
      </form>

      {error && (
        <p role="alert" className="text-label mb-4">
          Não foi possível carregar os itens: {error.message}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="tabela">
          <caption className="sr-only">Itens de pendência em aberto</caption>
          <thead>
            <tr>
              <ColunaOrdenavel
                chave="nome" rotulo="Colaborador"
                ordem={ordem} direcao={direcao} parametros={filtros} base="/qsms"
              />
              <th scope="col">Supervisor</th>
              <ColunaOrdenavel
                chave="vencimento" rotulo="Vencimento"
                ordem={ordem} direcao={direcao} parametros={filtros} base="/qsms"
              />
              <ColunaOrdenavel
                chave="status" rotulo="Status"
                ordem={ordem} direcao={direcao} parametros={filtros} base="/qsms"
              />
              <th scope="col">Etapa</th>
              <th scope="col">Com quem</th>
              <ColunaOrdenavel
                chave="parados" rotulo="Dias parados"
                ordem={ordem} direcao={direcao} parametros={filtros} base="/qsms"
              />
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const janela = avisoJanelaUtil(item);
              return (
                <tr key={item.item_id}>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarColaborador
                        nome={item.nome}
                        fotoUrl={urlPorCaminho.get(
                          caminhoPorColaborador.get(item.colaborador_id) ?? ""
                        )}
                      />
                      <div className="min-w-0">
                        {/* O nome leva à pessoa; o botão "Abrir" leva ao ciclo. */}
                        <Link
                          href={`/qsms/colaborador/${item.colaborador_id}`}
                          className="font-medium no-underline"
                        >
                          {item.nome}
                        </Link>
                        <span className="block text-caption text-ink-faint tabular">
                          {item.matricula}
                          {item.cargo ? ` · ${item.cargo}` : ""}
                        </span>
                        {janela && (
                          <span className="block text-caption text-ink-muted mt-1 max-w-[42ch]">
                            {janela}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-label">
                    {item.supervisor_nome ?? (
                      <span className="text-ink-faint">Sem supervisor</span>
                    )}
                  </td>
                  <td className="tabular">{formatarData(item.data_vencimento)}</td>
                  <td>
                    <SeloStatus status={item.status as StatusConformidade} dias={item.dias_restantes} titulo />
                  </td>
                  <td className="text-label">{ETAPA_ROTULO[item.etapa]}</td>
                  <td className="text-label">{DONO_ROTULO[item.dono]}</td>
                  <td>
                    <span className="dias-parados" data-estourado={item.sla_estourado}>
                      {item.dias_parados}d
                    </span>
                  </td>
                  <td>
                    <Link href={`/qsms/item/${item.item_id}`} className="btn btn--secondary">
                      Abrir
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {itens.length === 0 && (
          <Vazio>
            {temFiltro
              ? "Nenhum item nesse filtro."
              : "Nenhum item em aberto. Use “Gerar itens” para criar as pendências dos próximos 60 dias."}
          </Vazio>
        )}
      </div>

      <Paginacao
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={total}
        base="/qsms"
        parametros={filtros}
      />
    </div>
  );
}
