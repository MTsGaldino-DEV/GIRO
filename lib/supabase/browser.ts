import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente para componentes de navegador.
 *
 * Usa a mesma sessão (cookie) do cliente de servidor, então as consultas
 * chegam ao Postgres com o mesmo `auth.uid()` — e portanto sob a mesma RLS. Um
 * supervisor consultando daqui recebe exatamente o que receberia de um Server
 * Component: quem filtra por equipe é a política no banco, não este código.
 *
 * É o que torna a busca no cliente segura neste projeto. Onde a filtragem por
 * papel mora em código de aplicação, mover a consulta para o navegador entrega
 * ao usuário o poder de removê-la; aqui ela não está aqui para ser removida.
 *
 * A chave `anon` é pública por definição — vai no bundle e isso é esperado.
 * Nunca usar a `service_role` deste lado: ela ignora RLS.
 *
 * Uma instância por aba, memoizada: `createBrowserClient` monta um listener de
 * sessão, e criar um por render vazaria listeners a cada digitação de filtro.
 */
let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function criarClienteNavegador() {
  if (!cliente) {
    cliente = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return cliente;
}
