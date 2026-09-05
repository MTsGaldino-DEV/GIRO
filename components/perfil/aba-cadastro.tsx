"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { FormularioCadastro } from "@/app/(app)/qsms/colaborador/[id]/cadastro/formulario";
import { EnvioFoto } from "@/app/(app)/qsms/colaborador/[id]/cadastro/envio-foto";
import { formatarData } from "@/lib/dominio";
import { carregarSupervisoresAtivos } from "@/lib/consulta-colaborador";
import type { ResumoColaborador } from "@/lib/consulta-colaborador";
import type { Supervisor } from "@/lib/tipos";

/**
 * Aba Cadastro.
 *
 * Reutiliza `FormularioCadastro` e `EnvioFoto` da página cheia — os mesmos
 * componentes, chamando as mesmas Server Actions. As permissões continuam
 * valendo onde sempre valeram: `exigirQsms()` na ação e a política
 * `colaboradores_escrita_qsms` no banco. O painel não abre nenhuma porta que a
 * página já não abrisse.
 *
 * Nome, matrícula e CPF seguem só de leitura pelo motivo original: vêm da folha
 * e editá-los aqui criaria divergência silenciosa na próxima reimportação.
 */
export function AbaCadastro({
  resumo,
  aoAtualizar,
}: {
  resumo: ResumoColaborador;
  aoAtualizar: () => void;
}) {
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
      <div className="card">
        <h3 className="mb-1">Dados da folha</h3>
        <p className="text-ink-muted text-label mb-3">
          Vêm da importação e não são editáveis aqui.
        </p>
        <dl className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3 m-0">
          <div>
            <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">Nome</dt>
            <dd className="m-0 mt-0.5 text-label break-words">{colaborador.nome}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">Matrícula</dt>
            <dd className="m-0 mt-0.5 text-label tabular">{colaborador.matricula}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">CPF</dt>
            <dd className="m-0 mt-0.5 text-label tabular">{colaborador.cpf ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">Admissão</dt>
            <dd className="m-0 mt-0.5 text-label tabular">
              {formatarData(colaborador.data_admissao)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">Nascimento</dt>
            <dd className="m-0 mt-0.5 text-label tabular">
              {formatarData(colaborador.data_nascimento)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">UEN</dt>
            <dd className="m-0 mt-0.5 text-label">{colaborador.uen ?? "—"}</dd>
          </div>
        </dl>
      </div>

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

      <div className="card">
        <h3 className="mb-1">Lotação e vínculo</h3>
        <p className="text-ink-muted text-label mb-4">
          Toda alteração aqui fica registrada na aba Histórico, com o valor
          anterior e o novo.
        </p>
        {supervisores === null ? (
          <div className="esqueleto h-48" aria-busy="true" />
        ) : (
          <FormularioCadastro
            colaborador={colaborador}
            supervisores={supervisores}
            origem="Perfil do Colaborador"
            aoSalvar={aoAtualizar}
          />
        )}
      </div>
    </div>
  );
}
