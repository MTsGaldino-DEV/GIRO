import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FichaItem } from "@/components/ficha-item";
import { Timeline, type EntradaHistorico } from "@/components/timeline";
import { FormularioAgendar } from "./formulario-agendar";
import { FormularioConcluir } from "./formulario-concluir";
import { FormularioCemig } from "./formulario-cemig";
import { FormularioDevolver } from "./formulario-devolver";
import { Aviso } from "@/components/aviso";
import { formatarData } from "@/lib/dominio";
import type { ItemAberto } from "@/lib/tipos";

export const metadata: Metadata = { title: "Item" };
export const dynamic = "force-dynamic";

export default async function ItemQsms({ params }: { params: Promise<{ id: string }> }) {
  await exigirQsms();
  const { id } = await params;

  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from("vw_itens_abertos")
    .select("*")
    .eq("item_id", id)
    .maybeSingle();

  if (!data) {
    // Item concluído sai da view de abertos. Mostrar isso em vez de 404.
    const { data: concluido } = await supabase
      .from("itens_pendencia")
      .select("id, etapa, colaborador_id, colaboradores(nome, matricula)")
      .eq("id", id)
      .maybeSingle();

    if (!concluido) notFound();

    const { data: historico } = await supabase.rpc("fn_historico_do_item", { p_item_id: id });
    const colaborador = concluido.colaboradores as unknown as { nome: string; matricula: number };

    return (
      <div className="max-w-[760px]">
        <Link href="/qsms" className="text-label">← Voltar ao painel</Link>
        <h1 className="mt-3">{colaborador?.nome ?? "Item concluído"}</h1>
        <p className="text-ink-muted text-label mt-1 mb-5">
          Ciclo encerrado. O próximo vencimento já está em outro item.
        </p>
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Histórico</h2>
          <Timeline entradas={(historico ?? []) as EntradaHistorico[]} />
        </div>
      </div>
    );
  }

  const item = data as ItemAberto;
  const { data: historico } = await supabase.rpc("fn_historico_do_item", { p_item_id: id });

  return (
    <div className="max-w-[900px]">
      <Link href="/qsms" className="text-label">← Voltar ao painel</Link>

      <div className="mt-3 grid gap-5">
        <FichaItem item={item} />

        {item.etapa === "previsto" && (
          <Aviso titulo="Aguardando a supervisão">
            O item está com {item.supervisor_nome ?? "a supervisão"}, que precisa
            informar a data em que libera o colaborador. Prazo desta etapa: 7 dias.
          </Aviso>
        )}

        {item.etapa === "data_proposta" && (
          <>
            <div className="card">
              <h2 className="text-[1.0625rem] mb-1">Agendar com a clínica</h2>
              <p className="text-ink-muted text-label mb-4">
                A supervisão liberou o colaborador para{" "}
                <strong className="font-medium tabular">
                  {formatarData(item.data_liberacao_proposta)}
                </strong>
                .
              </p>
              <FormularioAgendar item={item} />
            </div>
            <FormularioDevolver itemId={item.item_id} />
          </>
        )}

        {item.etapa === "agendado" && (
          <Aviso titulo="Aguardando o comparecimento">
            O item está com a supervisão até {formatarData(item.data_agendada)}.
            Quem confirma presença é o supervisor.
          </Aviso>
        )}

        {item.etapa === "aguardando_documento" && (
          <div className="card">
            <h2 className="text-[1.0625rem] mb-1">Registrar resultado</h2>
            <p className="text-ink-muted text-label mb-4">
              O colaborador compareceu. O que zera a pendência é o documento —
              comparecimento não é conformidade.
            </p>
            <FormularioConcluir item={item} />
          </div>
        )}

        <FormularioCemig itemId={item.item_id} atual={item.comunicado_cemig_em} />

        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Histórico</h2>
          <Timeline entradas={(historico ?? []) as EntradaHistorico[]} />
        </div>
      </div>
    </div>
  );
}
