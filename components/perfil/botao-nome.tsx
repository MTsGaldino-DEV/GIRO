"use client";

import { usePerfilColaborador } from "./contexto";
import type { AbaPerfil } from "./contexto";

/**
 * O nome do colaborador numa lista, abrindo o painel de perfil.
 *
 * É `<button>` e não `<Link>` porque não há navegação — o painel não tem
 * endereço próprio. Herda a aparência de link porque o que o usuário percebe é
 * o mesmo: clicar no nome leva à pessoa.
 *
 * Existe como componente para o painel do QSMS e a Conferência da base
 * compartilharem o mesmo comportamento; a Conferência é Server Component e não
 * poderia chamar o contexto direto.
 */
export function BotaoNomeColaborador({
  colaboradorId,
  nome,
  aba,
  className,
}: {
  colaboradorId: string;
  nome: string;
  /** Abre direto numa aba específica. Padrão: Visão geral. */
  aba?: AbaPerfil;
  className?: string;
}) {
  const { abrir } = usePerfilColaborador();

  return (
    <button
      type="button"
      className={className ? `nome-colaborador ${className}` : "nome-colaborador"}
      onClick={() => abrir(colaboradorId, aba)}
    >
      {nome}
    </button>
  );
}
