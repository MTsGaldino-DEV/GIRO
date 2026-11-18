"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { vincularColaborador, type Acao } from "@/app/(app)/qsms/supervisores/acoes";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { usePerfilColaborador } from "@/components/perfil/contexto";
import {
  DESCRICAO_TAREFA,
  ROTULO_TAREFA,
  TIPOS_TAREFA,
  contarPorTipo,
  type TarefaTratamento,
  type TipoTarefa,
} from "@/lib/consulta-tratamento";

type Filtro = TipoTarefa | "todos";

/** "Vencido hoje" / "Vencido há 1 dia" / "Vencido há 31 dias". */
function textoVencidoHa(dias: number): string {
  if (dias === 0) return "Vencido hoje";
  return `Vencido há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}
type Supervisor = { id: string; nome: string };

export function ListaTratamento({
  tarefas,
  supervisores,
}: {
  tarefas: TarefaTratamento[];
  supervisores: Supervisor[];
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const contagem = contarPorTipo(tarefas);
  const visiveis = filtro === "todos" ? tarefas : tarefas.filter((t) => t.tipo === filtro);

  // Resolver no painel do perfil (anexar ASO, conferir cadastro) não passa por
  // esta tela: ao fechar o painel, a lista é pedida de novo ao servidor.
  const { colaboradorId } = usePerfilColaborador();
  const router = useRouter();
  const abertoAntes = useRef<string | null>(null);
  useEffect(() => {
    if (abertoAntes.current && !colaboradorId) router.refresh();
    abertoAntes.current = colaboradorId;
  }, [colaboradorId, router]);

  const opcoes: { valor: Filtro; rotulo: string; total: number }[] = [
    { valor: "todos", rotulo: "Todos", total: tarefas.length },
    ...TIPOS_TAREFA.map((t) => ({ valor: t, rotulo: ROTULO_TAREFA[t], total: contagem[t] })),
  ];

  return (
    <div className="grid gap-4">
      <div className="segmento" role="group" aria-label="Filtrar por tipo de pendência">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            className="segmento__item"
            aria-pressed={filtro === o.valor}
            aria-current={filtro === o.valor ? "page" : undefined}
            onClick={() => setFiltro(o.valor)}
          >
            {o.rotulo}
            <span className="segmento__numero tabular">{o.total}</span>
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="tabela tabela--compacta">
          <caption className="sr-only">Pendências do cadastro</caption>
          <thead>
            <tr>
              <th scope="col">Colaborador</th>
              <th scope="col" className="hidden sm:table-cell">O que falta</th>
              <th scope="col" className="text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-ink-muted py-8">
                  Nada pendente.
                </td>
              </tr>
            ) : (
              visiveis.map((t) => (
                <tr key={t.chave}>
                  <td>
                    <BotaoNomeColaborador colaboradorId={t.colaboradorId} nome={t.nome} />
                    <span className="tabular text-ink-muted text-label ml-2">{t.matricula}</span>
                    <span className="block sm:hidden mt-1">
                      <span className="etiqueta etiqueta--neutra">{ROTULO_TAREFA[t.tipo]}</span>
                      {t.diasVencido !== undefined && (
                        <span className="faltam--vencido tabular ml-2">{textoVencidoHa(t.diasVencido)}</span>
                      )}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className="etiqueta etiqueta--neutra mr-2">{ROTULO_TAREFA[t.tipo]}</span>
                    {t.diasVencido !== undefined && (
                      <span className="faltam--vencido tabular mr-2">{textoVencidoHa(t.diasVencido)}</span>
                    )}
                    <span className="text-label text-ink-muted">{DESCRICAO_TAREFA[t.tipo]}</span>
                  </td>
                  <td className="text-right">
                    <AcaoTarefa tarefa={t} supervisores={supervisores} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AcaoTarefa({ tarefa, supervisores }: { tarefa: TarefaTratamento; supervisores: Supervisor[] }) {
  const { abrir } = usePerfilColaborador();

  if (tarefa.tipo === "sem_supervisor") {
    return <EscolherSupervisor colaboradorId={tarefa.colaboradorId} nome={tarefa.nome} supervisores={supervisores} />;
  }

  const [rotulo, aba] =
    tarefa.tipo === "sem_aso" || tarefa.tipo === "aso_vencido"
      ? (["Anexar ASO", "aso"] as const)
      : tarefa.tipo === "sem_avp" || tarefa.tipo === "avp_vencido"
        ? (["Anexar AVP", "aso"] as const)
        : (["Conferir cadastro", "cadastro"] as const);

  return (
    <button type="button" className="btn btn--secondary whitespace-nowrap" onClick={() => abrir(tarefa.colaboradorId, aba)}>
      {rotulo}
    </button>
  );
}

function EscolherSupervisor({
  colaboradorId,
  nome,
  supervisores,
}: {
  colaboradorId: string;
  nome: string;
  supervisores: Supervisor[];
}) {
  const [estado, acao] = useActionState<Acao | null, FormData>(vincularColaborador, null);
  const [escolhido, setEscolhido] = useState("");

  return (
    <form action={acao} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="colaborador_id" value={colaboradorId} />
      <select
        name="supervisor_id"
        className="field w-auto min-w-[13rem]"
        aria-label={`Supervisor de ${nome}`}
        value={escolhido}
        onChange={(e) => setEscolhido(e.target.value)}
        required
      >
        <option value="" disabled>
          Escolher supervisor…
        </option>
        {supervisores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </select>
      <BotaoSalvar desabilitado={!escolhido} />
      {estado && !estado.ok && (
        <span role="alert" className="text-caption basis-full text-right">
          {estado.erro}
        </span>
      )}
    </form>
  );
}

function BotaoSalvar({ desabilitado }: { desabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={desabilitado || pending} aria-busy={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}
