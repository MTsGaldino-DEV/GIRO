import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service_role: ignora RLS.
 *
 * Uso restrito às rotas de cron, que rodam sem usuário logado e precisam
 * enxergar os 261 colaboradores para montar o e-mail de cada supervisor.
 * Nunca importar isso de um Client Component.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
