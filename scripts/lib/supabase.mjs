// Cliente Supabase para os scripts de linha de comando.
//
// Usa a service_role: os seeds precisam escrever ignorando RLS, e rodam na
// máquina de quem administra, nunca no navegador.

import { createClient } from "@supabase/supabase-js";

export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env."
    );
    process.exit(1);
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
