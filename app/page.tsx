import { redirect } from "next/navigation";
import { obterPerfil, rotaInicial } from "@/lib/perfil";

export default async function Raiz() {
  const perfil = await obterPerfil();
  redirect(perfil ? rotaInicial(perfil) : "/login");
}
