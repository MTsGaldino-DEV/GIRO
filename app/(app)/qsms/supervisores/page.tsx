import type { Metadata } from "next";
import Link from "next/link";
import { exigirOperador } from "@/lib/perfil";
import { estadoDaSincronizacao, type TentativaNeo } from "@/lib/estado-neo";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio } from "@/components/aviso";
import { FormularioSupervisor } from "./formulario-supervisor";
import { VinculoEmMassa } from "./vinculo-massa";
import { excluirSupervisor } from "./acoes";
import { BotaoExcluir } from "@/components/botao-excluir";
import { NomesNeoSemVinculo } from "./nomes-neo-sem-vinculo";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Info } from "@/components/info";
import type { Supervisor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Supervisores" };
export const dynamic = "force-dynamic";

interface ColaboradorSimples {
  id: string;
  matricula: number;
  nome: string;
  cargo: string | null;
  polo: string | null;
  supervisor_id: string | null;
}

export default async function PaginaSupervisores({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; cargo?: string; equipe?: string }>;
}) {
  const perfil = await exigirOperador();
  const { busca, cargo, equipe } = await searchParams;

  const supabase = await criarClienteServidor();

  const { data: supervisoresBrutos } = await supabase
    .from("supervisores")
    .select("id, nome, email, ativo")
    .order("nome");
  const supervisores = (supervisoresBrutos ?? []) as Supervisor[];

  // Nomes de supervisor da NEO sem vínculo: só QSMS e admin resolvem (supervisor nem vê a seção).
  // Sem a tabela (0023 não aplicada) a consulta volta vazia e a seção some.
  const podeVincularNomes = perfil.papel === "qsms" || perfil.papel === "admin";
  let nomesSemVinculo: ReturnType<typeof estadoDaSincronizacao>["semVinculo"] = [];
  if (podeVincularNomes) {
    const { data: tentativas } = await supabase
      .from("neo_sincronizacoes")
      .select("iniciado_em, origem, erro, resumo")
      .order("iniciado_em", { ascending: false })
      .limit(10);
    nomesSemVinculo = estadoDaSincronizacao((tentativas ?? []) as TentativaNeo[]).semVinculo;
  }

  let consulta = supabase
    .from("colaboradores")
    .select("id, matricula, nome, cargo, polo, supervisor_id")
    .eq("ativo", true)
    .order("nome");

  if (equipe === "sem") consulta = consulta.is("supervisor_id", null);
  else if (equipe) consulta = consulta.eq("supervisor_id", equipe);
  if (cargo) consulta = consulta.eq("cargo", cargo);
  if (busca?.trim()) consulta = consulta.ilike("nome", `%${busca.trim()}%`);

  const { data: colaboradoresBrutos } = await consulta.limit(400);
  const colaboradores = (colaboradoresBrutos ?? []) as ColaboradorSimples[];

  const { data: todos } = await supabase
    .from("colaboradores")
    .select("cargo, supervisor_id")
    .eq("ativo", true);

  const cargos = [...new Set((todos ?? []).map((c) => c.cargo).filter(Boolean) as string[])].sort();
  const semSupervisor = (todos ?? []).filter((c) => !c.supervisor_id).length;

  const porSupervisor = new Map<string, number>();
  for (const c of todos ?? []) {
    if (c.supervisor_id) porSupervisor.set(c.supervisor_id, (porSupervisor.get(c.supervisor_id) ?? 0) + 1);
  }

  return (
    <div>
      <CabecalhoPagina
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Supervisores" }]}
        titulo="Supervisores e equipes"
        descricao={
          <span className="inline-flex items-center gap-2">
            Equipes e vínculos de cada supervisor.
            <Info>Cadastrar aqui só registra a equipe; o login é liberado em Gestão de usuários. O vínculo define quem aparece no painel de quem e quem recebe qual e-mail na segunda-feira.</Info>
          </span>
        }
      />

      {semSupervisor > 0 && (
        <div className="mb-5">
          <Aviso titulo="Pendência P1 do plano — mapa colaborador → supervisor">
            {semSupervisor} de {(todos ?? []).length} colaboradores ainda sem
            supervisor. Eles aparecem no painel do QSMS no grupo &ldquo;Sem
            supervisor&rdquo; e não entram em nenhum e-mail semanal — ninguém é
            cobrado por eles.
          </Aviso>
        </div>
      )}

      {nomesSemVinculo.length > 0 && (
        <div className="mb-5">
          <NomesNeoSemVinculo nomes={nomesSemVinculo} supervisores={supervisores} />
        </div>
      )}

      {/* Como na lista de Colaboradores da NEO: os dois cartões de cadastro em
          cima e a lista na largura toda, que é onde o trabalho acontece. */}
      <div className="grid gap-5 md:grid-cols-2 items-start mb-5">
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Cadastrar supervisor</h2>
          <FormularioSupervisor />
        </div>

        <div className="card">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-[1.0625rem] m-0">Equipes</h2>
            <span className="text-caption text-ink-faint tabular">{(todos ?? []).length} ativos</span>
          </div>
          {supervisores.length === 0 ? (
            <p className="text-ink-faint text-label m-0">Nenhum supervisor cadastrado ainda.</p>
          ) : (
            <ul className="list-none p-0 m-0 grid">
              {supervisores.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <Link
                    href={`/qsms/supervisores?equipe=${s.id}`}
                    className="flex-1 min-w-0 flex items-center justify-between gap-3 py-2 px-2 -ml-2 rounded-[var(--radius)] no-underline text-ink hover:bg-brand-wash"
                    aria-current={equipe === s.id ? "true" : undefined}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{s.nome}</span>
                      <span className="block text-caption text-ink-faint truncate">{s.email}</span>
                    </span>
                    <span className="etiqueta etiqueta--neutra tabular">{porSupervisor.get(s.id) ?? 0}</span>
                  </Link>
                  {podeVincularNomes && (
                    <BotaoExcluir
                      acao={excluirSupervisor}
                      id={s.id}
                      nome={s.nome}
                      confirmacao={`Excluir o supervisor ${s.nome}? As ${porSupervisor.get(s.id) ?? 0} pessoas da equipe dele ficam sem supervisor.`}
                    />
                  )}
                </li>
              ))}
              <li className="mt-1 pt-1 border-t border-line">
                <Link
                  href="/qsms/supervisores?equipe=sem"
                  className="flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-[var(--radius)] no-underline text-ink-muted hover:bg-brand-wash"
                >
                  <span>Sem supervisor</span>
                  <span className="etiqueta etiqueta--marca tabular">{semSupervisor}</span>
                </Link>
              </li>
            </ul>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Vincular colaboradores</h2>

          <form
            method="get"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end mb-4"
          >
            <div className="min-w-0">
              <label className="label" htmlFor="busca">Buscar</label>
              <input id="busca" name="busca" type="search" className="field" placeholder="Nome do colaborador" defaultValue={busca ?? ""} />
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="equipe">Equipe</label>
              <select id="equipe" name="equipe" className="field" defaultValue={equipe ?? "sem"}>
                <option value="sem">Sem supervisor</option>
                <option value="">Todos</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="cargo">Cargo</label>
              <select id="cargo" name="cargo" className="field" defaultValue={cargo ?? ""}>
                <option value="">Todos</option>
                {cargos.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn--secondary w-full lg:w-auto">Filtrar</button>
          </form>

          {supervisores.length === 0 ? (
            <Vazio>Cadastre ao menos um supervisor para poder vincular.</Vazio>
          ) : colaboradores.length === 0 ? (
            <Vazio>Nenhum colaborador nesse filtro.</Vazio>
          ) : (
            <VinculoEmMassa colaboradores={colaboradores} supervisores={supervisores} />
          )}
        </div>
      </div>
    </div>
  );
}
