import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio } from "@/components/aviso";
import { FormularioSupervisor } from "./formulario-supervisor";
import { VinculoEmMassa } from "./vinculo-massa";
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
  await exigirQsms();
  const { busca, cargo, equipe } = await searchParams;

  const supabase = await criarClienteServidor();

  const { data: supervisoresBrutos } = await supabase
    .from("supervisores")
    .select("id, nome, email, ativo")
    .order("nome");
  const supervisores = (supervisoresBrutos ?? []) as Supervisor[];

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
      <h1>Supervisores e equipes</h1>
      <p className="text-ink-muted text-label mt-1 mb-5 max-w-[70ch]">
        Cadastrar o supervisor aqui só registra a equipe. O login dele (com
        senha) é liberado em Gestão de usuários. Vincular colaboradores define
        quem aparece no painel de quem e quem recebe qual e-mail na
        segunda-feira.
      </p>

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

      <div className="grid gap-5 lg:grid-cols-[340px_1fr] items-start">
        <div className="grid gap-5">
          <div className="card">
            <h2 className="text-[1.0625rem] mb-3">Cadastrar supervisor</h2>
            <FormularioSupervisor />
          </div>

          <div className="card">
            <h2 className="text-[1.0625rem] mb-3">Equipes</h2>
            {supervisores.length === 0 ? (
              <p className="text-ink-faint text-label m-0">Nenhum supervisor cadastrado ainda.</p>
            ) : (
              <ul className="list-none p-0 m-0 grid gap-2">
                {supervisores.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="block">{s.nome}</span>
                      <span className="block text-caption text-ink-faint">{s.email}</span>
                    </span>
                    <span className="text-label text-ink-muted tabular whitespace-nowrap">
                      {porSupervisor.get(s.id) ?? 0}
                    </span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 pt-2 border-t border-line">
                  <span className="text-ink-faint">Sem supervisor</span>
                  <span className="text-label tabular">{semSupervisor}</span>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Vincular colaboradores</h2>

          <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-[180px]">
              <label className="label" htmlFor="busca">Buscar</label>
              <input id="busca" name="busca" className="field" defaultValue={busca ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="equipe">Equipe</label>
              <select id="equipe" name="equipe" className="field" defaultValue={equipe ?? "sem"}>
                <option value="sem">Sem supervisor</option>
                <option value="">Todos</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            {cargos.length > 0 && (
              <div>
                <label className="label" htmlFor="cargo">Cargo</label>
                <select id="cargo" name="cargo" className="field" defaultValue={cargo ?? ""}>
                  <option value="">Todos</option>
                  {cargos.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" className="btn btn--secondary">Filtrar</button>
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
