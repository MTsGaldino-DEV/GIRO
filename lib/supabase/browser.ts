"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador. Usado só no login e no upload de arquivo. */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
