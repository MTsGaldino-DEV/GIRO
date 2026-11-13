import { redirect } from "next/navigation";

// Provisório: a lista de colaboradores é construída na Task 13. Até lá, /colaboradores
// (já no menu) leva ao Radar para não cair em 404.
export default function Colaboradores() {
  redirect("/radar");
}
