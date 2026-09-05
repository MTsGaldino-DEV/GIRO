"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const ABAS_PERFIL = [
  { chave: "visao-geral", rotulo: "Visão geral" },
  { chave: "aso", rotulo: "ASO" },
  { chave: "documentos", rotulo: "Documentos" },
  { chave: "cadastro", rotulo: "Cadastro" },
  { chave: "historico", rotulo: "Histórico" },
] as const;

export type AbaPerfil = (typeof ABAS_PERFIL)[number]["chave"];

interface EstadoPerfil {
  colaboradorId: string | null;
  aba: AbaPerfil;
  abrir: (colaboradorId: string, aba?: AbaPerfil) => void;
  trocarAba: (aba: AbaPerfil) => void;
  fechar: () => void;
}

const Contexto = createContext<EstadoPerfil | null>(null);

/**
 * Estado do painel de perfil, compartilhado por toda a área logada.
 *
 * Existe como contexto, e não como estado local de cada tela, porque o painel
 * abre de três lugares — o nome na tabela do painel, o menu "⋮" da mesma linha
 * e a lista da Conferência da base. Com estado local, cada tela precisaria da
 * própria cópia da lógica de abrir/fechar e da própria instância do painel, e
 * as três divergiriam no primeiro ajuste.
 *
 * O painel deliberadamente NÃO reflete na URL. A escolha é do usuário e tem
 * consequência conhecida: atualizar a página fecha o painel, e não há link
 * direto para uma aba. Em troca, o mesmo componente abre de qualquer lista sem
 * duplicar estrutura de rotas — as telas cheias em /qsms/colaborador/[id]/...
 * continuam existindo e funcionando por link direto, intocadas.
 */
export function ProvedorPerfilColaborador({ children }: { children: React.ReactNode }) {
  const [colaboradorId, setColaboradorId] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaPerfil>("visao-geral");

  const abrir = useCallback((id: string, abaInicial: AbaPerfil = "visao-geral") => {
    setColaboradorId(id);
    setAba(abaInicial);
  }, []);

  const fechar = useCallback(() => setColaboradorId(null), []);
  const trocarAba = useCallback((proxima: AbaPerfil) => setAba(proxima), []);

  const valor = useMemo(
    () => ({ colaboradorId, aba, abrir, trocarAba, fechar }),
    [colaboradorId, aba, abrir, trocarAba, fechar]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePerfilColaborador(): EstadoPerfil {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("usePerfilColaborador precisa estar dentro de <ProvedorPerfilColaborador>.");
  }
  return contexto;
}
