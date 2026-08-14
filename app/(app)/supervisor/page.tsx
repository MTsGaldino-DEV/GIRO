import type { Metadata } from "next";
import Link from "next/link";
import { exigirSupervisor } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ETAPA_ROTULO, formatarData, formatarHora, avisoJanelaUtil } from "@/lib/dominio";
import { SeloStatus } from "@/components/selo-status";
import { Vazio } from "@/components/aviso";
import type { ItemAberto } from "@/lib/tipos";

export const metadata: Metadata = { title: "Minha equipe" };
export const dynamic = "force-dynamic";

/** O que se pede ao supervisor, em uma frase, por etapa. */
const CHAMADA: Record<string, string> = {
  previsto: "Informe quando pode liberar",
  data_proposta: "Aguardando o QSMS agendar",
  agendado: "Confirme se compareceu",
  aguardando_documento: "Aguardando o QSMS obter o documento",
};

export default async function PainelSupervisor() {
  const perfil = await exigirSupervisor();
  const supabase = await criarClienteServidor();

  // RLS já limita à equipe dele; a ordenação é por gravidade.
  const { data, error } = await supabase
    .from("vw_itens_abertos")
    .select("*")
    .order("peso_status")
    .order("dias_restantes", { nullsFirst: true });

  const itens = (data ?? []) as ItemAberto[];
  const meus = itens.filter((i) => i.dono === "supervisor");
  const comQsms = itens.filter((i) => i.dono !== "supervisor");

  return (
    <div className="max-w-[760px]">
      <h1>Minha equipe</h1>
      <p className="text-ink-muted text-label mt-1 mb-5">
        {meus.length === 0
          ? "Nada esperando por você agora."
          : `${meus.length} ${meus.length === 1 ? "item precisa" : "itens precisam"} da sua ação.`}
      </p>

      {error && (
        <p role="alert" className="text-label mb-4">
          Não foi possível carregar sua equipe: {error.message}
        </p>
      )}

      {meus.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[1.0625rem] mb-3">Com você</h2>
          <ul className="list-none p-0 m-0 grid gap-3">
            {meus.map((item) => (
              <LinhaItem key={item.item_id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {comQsms.length > 0 && (
        <section>
          <h2 className="text-[1.0625rem] mb-1">Com o QSMS</h2>
          <p className="text-ink-muted text-label mb-3">
            Nada a fazer aqui — é só para você saber em que pé está.
          </p>
          <ul className="list-none p-0 m-0 grid gap-3">
            {comQsms.map((item) => (
              <LinhaItem key={item.item_id} item={item} discreto />
            ))}
          </ul>
        </section>
      )}

      {itens.length === 0 && !error && (
        <Vazio>
          Nenhum ASO a vencer nos próximos 60 dias na sua equipe.
          {perfil.supervisor_id === null &&
            " (Seu usuário ainda não está vinculado a uma equipe — fale com o QSMS.)"}
        </Vazio>
      )}
    </div>
  );
}

function LinhaItem({ item, discreto }: { item: ItemAberto; discreto?: boolean }) {
  const janela = avisoJanelaUtil(item);

  return (
    <li>
      <Link
        href={`/supervisor/item/${item.item_id}`}
        className="card block no-underline text-ink hover:border-line-strong"
        style={discreto ? { background: "transparent" } : undefined}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-medium">{item.nome}</div>
            <div className="text-caption text-ink-faint tabular">
              {item.matricula}
              {item.cargo && ` · ${item.cargo}`}
            </div>
          </div>
          <SeloStatus status={item.status} dias={item.dias_restantes} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-label text-ink-muted">
            {CHAMADA[item.etapa] ?? ETAPA_ROTULO[item.etapa]}
          </span>
          {item.dono === "supervisor" && (
            <span className="btn btn--primary" aria-hidden>
              Abrir
            </span>
          )}
        </div>

        {item.etapa === "agendado" && (
          <p className="text-label mt-3 mb-0 tabular">
            {formatarData(item.data_agendada)} às {formatarHora(item.hora_agendada)}
            {item.clinica && ` · ${item.clinica}`}
          </p>
        )}

        {janela && (
          <p className="text-caption text-ink-muted mt-2 mb-0">{janela}</p>
        )}

        {item.sla_estourado && (
          <p className="text-caption mt-2 mb-0">
            <span className="dias-parados" data-estourado="true">
              {item.dias_parados}d
            </span>
          </p>
        )}
      </Link>
    </li>
  );
}
