import type { Metadata } from "next";
import { exigirAdmin } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTratamento } from "@/lib/consulta-tratamento";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { ListaTratamento } from "@/components/tratamento/lista-tratamento";

export const metadata: Metadata = { title: "Tratamento" };
export const dynamic = "force-dynamic";

/**
 * Tratamento: o que falta no cadastro, uma linha por lacuna (spec de 17/11/2026).
 * Só admin. A lista é recalculada a cada abertura; corrigido o dado, a linha some.
 */
export default async function PaginaTratamento() {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const [tarefas, { data: supervisores }] = await Promise.all([
    carregarTratamento(supabase),
    supabase.from("supervisores").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="max-w-[1280px] mx-auto">
      <CabecalhoPagina
        titulo="Tratamento"
        descricao={`${tarefas.length} ${tarefas.length === 1 ? "pendência" : "pendências"} no cadastro. Cada linha some quando o dado é corrigido.`}
      />
      <ListaTratamento tarefas={tarefas} supervisores={(supervisores ?? []) as { id: string; nome: string }[]} />
    </div>
  );
}
