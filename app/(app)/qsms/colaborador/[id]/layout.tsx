import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Trilha } from "@/components/trilha";
import {
  carregarColaborador,
  carregarStatus,
  carregarItemAberto,
  assinarFoto,
} from "@/lib/colaborador";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { SeloStatus } from "@/components/selo-status";
import { formatarData, SITUACAO_ROTULO } from "@/lib/dominio";
import { IconeAusencias, IconeBase, IconePainel, IconeSupervisores } from "@/components/icones";
import { AbasColaborador } from "./abas";
import type { Situacao } from "@/lib/tipos";

export const dynamic = "force-dynamic";

function Indicador({
  icone,
  rotulo,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="indicador">
        <span className="indicador__icone" aria-hidden>{icone}</span>
        <div className="min-w-0">
          <div className="text-caption text-ink-faint uppercase tracking-[0.04em]">{rotulo}</div>
          <div className="text-[1.125rem] font-medium tabular truncate">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default async function LayoutColaborador({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await exigirQsms();
  const { id } = await params;

  const colaborador = await carregarColaborador(id);
  const [status, item, fotoUrl, supabase] = await Promise.all([
    carregarStatus(id),
    carregarItemAberto(id),
    assinarFoto(colaborador.foto_url),
    criarClienteServidor(),
  ]);

  const [{ count: totalExames }, { data: supervisor }] = await Promise.all([
    supabase
      .from("eventos_requisito")
      .select("*", { count: "exact", head: true })
      .eq("colaborador_id", id),
    colaborador.supervisor_id
      ? supabase.from("supervisores").select("nome").eq("id", colaborador.supervisor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div>
      <Trilha
        degraus={[
          { rotulo: "Operação" },
          { rotulo: "Painel", href: "/qsms" },
          { rotulo: colaborador.nome },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4 mt-3 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          <AvatarColaborador nome={colaborador.nome} fotoUrl={fotoUrl} tamanho={64} />
          <div className="min-w-0">
            <h1 className="truncate">{colaborador.nome}</h1>
            <p className="text-ink-muted text-label mt-0.5">
              <span className="tabular">{colaborador.matricula}</span>
              {colaborador.cargo && ` · ${colaborador.cargo}`}
              {colaborador.polo && ` · ${colaborador.polo}`}
            </p>
            <p className="text-caption text-ink-faint mt-0.5">
              {supervisor?.nome ?? "Sem supervisor"}
              {" · "}
              {SITUACAO_ROTULO[colaborador.situacao as Situacao] ?? colaborador.situacao}
            </p>
          </div>
        </div>

        {status && <SeloStatus status={status.status} dias={status.dias_restantes} titulo />}
      </div>

      <div className="grid gap-3 mb-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador icone={<IconePainel />} rotulo="Requisito">
          {status?.requisito ?? "—"}
        </Indicador>
        <Indicador icone={<IconeAusencias />} rotulo="Próximo vencimento">
          {formatarData(status?.data_vencimento)}
        </Indicador>
        <Indicador icone={<IconeSupervisores />} rotulo="Parado há">
          {item ? `${item.dias_parados} ${item.dias_parados === 1 ? "dia" : "dias"}` : "—"}
        </Indicador>
        <Indicador icone={<IconeBase />} rotulo="ASOs registrados">
          {totalExames ?? 0}
        </Indicador>
      </div>

      <AbasColaborador id={id} />

      {children}
    </div>
  );
}
