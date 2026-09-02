import { redirect } from "next/navigation";

export default async function ColaboradorRaiz({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/qsms/colaborador/${id}/visao-geral`);
}
