import { redirect } from "next/navigation";
import { exigirOperador } from "@/lib/perfil";

export const dynamic = "force-dynamic";

/**
 * Rota antiga do supervisor, mantida viva porque os e-mails semanais apontam
 * para ela (lib/email-semanal.ts). Desde 13/11 supervisor e QSMS operam o mesmo
 * fluxo, e a tela do item é uma só: `/qsms/item/[id]`, com as ações de cada
 * etapa em `AcoesItem`. Esta página tinha formulários próprios que divergiram
 * (oferecia "Compareceu" em `agendado` e não tinha ação para `data_solicitada`
 * nem `enviado_clinica`), por isso só redireciona.
 */
export default async function ItemSupervisor({ params }: { params: Promise<{ id: string }> }) {
  await exigirOperador();
  const { id } = await params;
  redirect(`/qsms/item/${encodeURIComponent(id)}`);
}
