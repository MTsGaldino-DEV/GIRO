import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Trilha } from "@/components/trilha";
import { FichaItem } from "@/components/ficha-item";
import { AcoesItem } from "@/components/acoes-item";
import { Timeline, type EntradaHistorico } from "@/components/timeline";
import { ETAPA_ROTULO } from "@/lib/dominio";
import type { Clinica, Etapa, ItemAberto } from "@/lib/tipos";

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
    // Item finalizado ou cancelado sai da view de abertos. Mostrar isso em vez
    // de 404: o histórico é justamente o que se vai consultar depois.
    const { data: encerrado } = await supabase
      .from("itens_pendencia")
      .select("id, etapa, colaborador_id, colaboradores(nome, matricula)")
      .eq("id", id)
      .maybeSingle();

    if (!encerrado) notFound();

    const { data: historico } = await supabase.rpc("fn_historico_do_item", { p_item_id: id });
    const colaborador = encerrado.colaboradores as unknown as { nome: string; matricula: number };
    const etapa = encerrado.etapa as Etapa;

    return (
      <div className="max-w-[760px]">
        <Trilha
          degraus={[
            { rotulo: "Operação" },
            { rotulo: "Painel", href: "/qsms" },
            { rotulo: colaborador?.nome ?? "Item encerrado" },
          ]}
        />
        <h1 className="mt-3">{colaborador?.nome ?? "Item encerrado"}</h1>
        <p className="text-ink-muted text-label mt-1 mb-5">
          {etapa === "cancelado"
            ? "Item cancelado. O motivo está no histórico abaixo."
            : `${ETAPA_ROTULO[etapa]}. O próximo vencimento já está em outro item.`}
        </p>
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Histórico</h2>
          <Timeline entradas={(historico ?? []) as EntradaHistorico[]} />
        </div>
      </div>
    );
  }

  const item = data as ItemAberto;

  const [{ data: historico }, { data: clinicas }] = await Promise.all([
    supabase.rpc("fn_historico_do_item", { p_item_id: id }),
    supabase.from("clinicas").select("*").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="max-w-[900px]">
      <Trilha
        degraus={[
          { rotulo: "Operação" },
          { rotulo: "Painel", href: "/qsms" },
          { rotulo: item.nome },
        ]}
      />

      <div className="mt-3 grid gap-5">
        <FichaItem item={item} />

        <AcoesItem item={item} clinicas={(clinicas ?? []) as Clinica[]} />

        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Histórico</h2>
          <Timeline entradas={(historico ?? []) as EntradaHistorico[]} />
        </div>
      </div>
    </div>
  );
}
