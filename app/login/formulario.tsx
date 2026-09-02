"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { entrar, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";

const MENSAGENS_ERRO: Record<string, string> = {
  sem_perfil: "Seu e-mail não tem acesso liberado. Fale com o QSMS para ser cadastrado.",
};

const MENSAGENS_SUCESSO: Record<string, string> = {
  senha_redefinida: "Senha redefinida. Entre com a nova senha.",
};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full mt-4" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function FormularioLogin({
  proximo,
  erroInicial,
  sucessoInicial,
}: {
  proximo?: string;
  erroInicial?: string;
  sucessoInicial?: string;
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(entrar, null);

  const erro = estado && !estado.ok ? estado.erro : erroInicial ? MENSAGENS_ERRO[erroInicial] ?? null : null;
  const sucesso = sucessoInicial ? MENSAGENS_SUCESSO[sucessoInicial] : null;

  return (
    <form action={acao} noValidate>
      {proximo && <input type="hidden" name="proximo" value={proximo} />}

      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          required
          placeholder="nome@engelmig.com.br"
        />
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          className="field"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </div>

      {sucesso && (
        <p role="status" className="text-label text-ink-muted mt-2">{sucesso}</p>
      )}
      {erro && <MensagemErro>{erro}</MensagemErro>}

      <Botao />

      <p className="text-label text-center mt-3 mb-0">
        <Link href="/login/recuperar">Esqueci minha senha</Link>
      </p>
    </form>
  );
}
