"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { criarUsuario, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";
import type { Supervisor } from "@/lib/tipos";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending}>
      {pending ? "Criando…" : "Criar acesso"}
    </button>
  );
}

export function FormularioUsuario({ supervisores }: { supervisores: Supervisor[] }) {
  const [estado, acao] = useActionState<Acao | null, FormData>(criarUsuario, null);
  const [papel, setPapel] = useState<"qsms" | "supervisor" | "admin">("supervisor");

  return (
    <form action={acao} className="grid gap-3">
      <div>
        <label className="label" htmlFor="nome-usuario">Nome</label>
        <input id="nome-usuario" name="nome" className="field" required minLength={3} />
      </div>

      <div>
        <label className="label" htmlFor="email-usuario">E-mail</label>
        <input
          id="email-usuario"
          name="email"
          type="email"
          className="field"
          required
          autoCapitalize="off"
          placeholder="nome@engelmig.com.br"
        />
      </div>

      <div>
        <label className="label" htmlFor="senha-usuario">Senha temporária</label>
        <input
          id="senha-usuario"
          name="senha"
          type="text"
          className="field"
          required
          minLength={8}
          placeholder="Mínimo de 8 caracteres"
        />
      </div>

      <div>
        <label className="label" htmlFor="papel-usuario">Papel</label>
        <select
          id="papel-usuario"
          name="papel"
          className="field"
          value={papel}
          onChange={(e) => setPapel(e.target.value as typeof papel)}
        >
          <option value="supervisor">Supervisor</option>
          <option value="qsms">QSMS</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {papel === "supervisor" && (
        <div>
          <label className="label" htmlFor="supervisor-usuario">Supervisor vinculado</label>
          <select id="supervisor-usuario" name="supervisor_id" className="field" required>
            <option value="">Selecione…</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <p className="text-caption text-ink-faint mt-1">
            Sem registro em Supervisores ainda? Cadastre em{" "}
            <a href="/qsms/supervisores">Supervisores</a> primeiro.
          </p>
        </div>
      )}

      <Botao />

      {estado?.ok && <p role="status" className="text-label text-ink-muted m-0">{estado.mensagem}</p>}
      {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
    </form>
  );
}
