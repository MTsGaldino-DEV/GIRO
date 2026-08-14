"use client";

import { useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/browser";

const MENSAGENS_ERRO: Record<string, string> = {
  link_invalido: "O link expirou ou já foi usado. Peça um novo abaixo.",
  sem_perfil:
    "Seu e-mail não tem acesso liberado. Fale com o QSMS para ser cadastrado.",
};

export function FormularioLogin({
  proximo,
  erroInicial,
}: {
  proximo?: string;
  erroInicial?: string;
}) {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"parado" | "enviando" | "enviado">("parado");
  const [erro, setErro] = useState<string | null>(
    erroInicial ? (MENSAGENS_ERRO[erroInicial] ?? "Não foi possível entrar.") : null
  );

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEstado("enviando");

    const supabase = criarClienteNavegador();
    const destino = new URL("/auth/callback", window.location.origin);
    if (proximo) destino.searchParams.set("proximo", proximo);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: destino.toString(),
        // Não criar usuário no primeiro acesso: quem entra é quem o QSMS
        // cadastrou. Sem isso, qualquer endereço vira conta no Supabase.
        shouldCreateUser: false,
      },
    });

    if (error) {
      // "Signups not allowed for otp" é o que o Supabase devolve para e-mail
      // não cadastrado. Traduzir: o supervisor não tem como saber o que isso é.
      const naoCadastrado =
        error.message.toLowerCase().includes("signups not allowed") ||
        error.message.toLowerCase().includes("user not found");
      setErro(
        naoCadastrado
          ? "Este e-mail não tem acesso liberado. Fale com o QSMS."
          : "Não foi possível enviar o link. Tente de novo em alguns instantes."
      );
      setEstado("parado");
      return;
    }

    setEstado("enviado");
  }

  if (estado === "enviado") {
    return (
      <div role="status" aria-live="polite">
        <p className="mb-2">
          Link enviado para <strong className="font-medium">{email}</strong>.
        </p>
        <p className="text-ink-muted text-label mb-4">
          Abra o e-mail no celular e toque no link. Ele vale por uma hora.
        </p>
        <button type="button" className="btn btn--secondary" onClick={() => setEstado("parado")}>
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate>
      <label className="label" htmlFor="email">
        E-mail
      </label>
      <input
        id="email"
        className="field"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        required
        placeholder="nome@engelmig.com.br"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={erro ? "erro-login" : undefined}
        aria-invalid={erro ? true : undefined}
      />

      {erro && (
        <p id="erro-login" role="alert" className="text-label mt-2 text-ink">
          {erro}
        </p>
      )}

      <button
        type="submit"
        className="btn btn--primary w-full mt-4"
        disabled={estado === "enviando" || email.trim() === ""}
      >
        {estado === "enviando" ? "Enviando…" : "Receber link de acesso"}
      </button>
    </form>
  );
}
