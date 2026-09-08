"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { FichaCadastro } from "@/app/(app)/qsms/colaborador/[id]/cadastro/ficha-cadastro";
import { BotaoDesligar } from "@/app/(app)/qsms/colaborador/[id]/cadastro/botao-desligar";
import { EnvioFoto } from "@/app/(app)/qsms/colaborador/[id]/cadastro/envio-foto";
import { carregarSupervisoresAtivos } from "@/lib/consulta-colaborador";
import type { ResumoColaborador } from "@/lib/consulta-colaborador";
import type { Supervisor } from "@/lib/tipos";
import { usePerfilColaborador } from "./contexto";

/**
 * Aba Cadastro.
 *
 * Reutiliza `FichaCadastro`, `EnvioFoto` e `BotaoDesligar` da página cheia — os
 * mesmos componentes, chamando as mesmas Server Actions. As permissões
 * continuam valendo onde sempre valeram: `exigirQsms()` / `exigirAdmin()` na
 * ação e a política `colaboradores_escrita_qsms` no banco. O painel não abre
 * nenhuma porta que a página já não abrisse.
 */
export function AbaCadastro({
  resumo,
  aoAtualizar,
}: {
  resumo: ResumoColaborador;
  aoAtualizar: () => void;
}) {
  const { papel } = usePerfilColaborador();
  const [supervisores, setSupervisores] = useState<Supervisor[] | null>(null);
  const { colaborador, fotoUrl } = resumo;

  useEffect(() => {
    let ativo = true;
    carregarSupervisoresAtivos(criarClienteNavegador()).then((lista) => {
      if (ativo) setSupervisores(lista);
    });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="grid gap-4">
      {/* A ficha só entra depois da lista de supervisores: o campo mostraria
          "Sem supervisor" para quem tem um, e salvar dali apagaria o vínculo. */}
      {supervisores === null ? (
        <div className="esqueleto h-64" aria-busy="true" />
      ) : (
        <FichaCadastro
          colaborador={colaborador}
          supervisores={supervisores}
          papel={papel}
          origem="Perfil do Colaborador"
          aoSalvar={aoAtualizar}
        />
      )}

      <div className="card">
        <h3 className="mb-1">Foto</h3>
        <p className="text-ink-muted text-label mb-3">
          Reduzida para 256px no navegador antes do envio.
        </p>
        <EnvioFoto
          colaboradorId={colaborador.id}
          nome={colaborador.nome}
          fotoUrl={fotoUrl}
          origem="Perfil do Colaborador"
        />
      </div>

      {papel === "admin" && (
        <div className="card">
          <h3 className="mb-1">Quadro</h3>
          <p className="text-ink-muted text-label mb-4">
            {colaborador.ativo
              ? "Colaborador ativo: entra no semáforo e gera pendência de ASO."
              : "Colaborador desligado."}
          </p>
          <BotaoDesligar
            colaborador={colaborador}
            origem="Perfil do Colaborador"
            aoSalvar={aoAtualizar}
          />
        </div>
      )}
    </div>
  );
}
