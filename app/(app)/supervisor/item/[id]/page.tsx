import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSupervisor } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FichaItem } from "@/components/ficha-item";
import { Timeline, type EntradaHistorico } from "@/components/timeline";
import { Aviso } from "@/components/aviso";
import { FormularioLiberacao } from "./formulario-liberacao";
import { FormularioComparecimento } from "./formulario-comparecimento";
import { formatarData } from "@/lib/dominio";
import type { ItemAberto } from "@/lib/tipos";

export const metadata: Metadata = { title: "Item" };
export const dynamic = "force-dynamic";

export default async function ItemSupervisor({ params }: { params: Promise<{ id: string }> }) {
  await exigirSupervisor();
  const { id } = await params;

  const supabase = await criarClienteServidor();

  // RLS decide o acesso: item de outra equipe simplesmente não volta.
  const { data } = await supabase
    .from("vw_itens_abertos")
    .select("*")
    .eq("item_id", id)
    .maybeSingle();

  if (!data) notFound();
  const item = data as ItemAberto;

  const { data: historico } = await supabase.rpc("fn_historico_do_item", { p_item_id: id });

  return (
    <div className="max-w-[760px]">
      <Link href="/supervisor" className="text-label">← Voltar</Link>

      <div className="mt-3 grid gap-5">
        <FichaItem item={item} />

        {item.etapa === "previsto" && (
          <div className="card">
            <h2 className="text-[1.0625rem] mb-1">Quando pode liberar?</h2>
            <p className="text-ink-muted text-label mb-4">
              Escolha um dia em que o colaborador pode sair da equipe para o
              exame. O QSMS agenda com a clínica a partir daí.
            </p>
            <FormularioLiberacao item={item} />
          </div>
        )}

        {item.etapa === "data_proposta" && (
          <Aviso titulo="Com o QSMS">
            Você informou{" "}
            <strong className="font-medium">
              {formatarData(item.data_liberacao_proposta)}
            </strong>
            . O QSMS está fechando a data com a clínica. Você recebe o
            agendamento por aqui e por e-mail.
          </Aviso>
        )}

        {item.etapa === "agendado" && (
          <div className="card">
            <h2 className="text-[1.0625rem] mb-1">O colaborador compareceu?</h2>
            <p className="text-ink-muted text-label mb-4">
              Responda depois de {formatarData(item.data_agendada)}.
            </p>
            <FormularioComparecimento itemId={item.item_id} />
          </div>
        )}

        {item.etapa === "aguardando_documento" && (
          <Aviso titulo="Com o QSMS">
            Presença confirmada. O QSMS está buscando o ASO na clínica. A
            pendência só se encerra quando o documento chega — comparecer não é o
            mesmo que estar regular.
          </Aviso>
        )}

        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Histórico</h2>
          <Timeline entradas={(historico ?? []) as EntradaHistorico[]} />
        </div>
      </div>
    </div>
  );
}
