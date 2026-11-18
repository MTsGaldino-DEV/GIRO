import Link from "next/link";
import { Vazio } from "@/components/aviso";
import { SeloStatus } from "@/components/selo-status";
import { BotaoNomeColaborador } from "@/components/perfil/botao-nome";
import { DONO_ROTULO, ETAPA_ROTULO, formatarData } from "@/lib/dominio";
import {
  hrefDashboard,
  type ChaveDetalhe,
  type Detalhe,
  type EscopoDashboard,
  type LinhaResponsavel,
} from "@/lib/regras-dashboard";
import { ROTULO_SEMAFORO } from "./cartoes-semaforo";
import { RolarAteDetalhe } from "./rolar-ate-detalhe";
import { Indisponivel } from "./indisponivel";

const SIMPLES: Record<string, string> = {
  radar: "No radar",
  agendados: "Agendados",
  parados: "Parados além do prazo",
  concluidos: "Concluídos no mês",
  abertos: "Todos os itens abertos",
  em_dia: "Pessoas em dia (não vencidas nem sem registro)",
};

export function tituloDetalhe(chave: ChaveDetalhe, responsaveis: LinhaResponsavel[]): string {
  switch (chave.tipo) {
    case "status":
      return ROTULO_SEMAFORO[chave.status];
    case "etapa":
      return `Etapa: ${ETAPA_ROTULO[chave.etapa]}`;
    case "dono":
      return chave.dono === "qsms" ? "Com o QSMS" : "Com a supervisão";
    case "responsavel":
      return `Com ${responsaveis.find((r) => r.id === chave.id)?.nome ?? "o responsável"}`;
    default:
      return SIMPLES[chave.tipo];
  }
}

function contar(detalhe: Detalhe): string {
  const n = detalhe.linhas.length;
  if (detalhe.tipo === "pessoas") return `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
  if (detalhe.tipo === "eventos") return `${n} ${n === 1 ? "conclusão" : "conclusões"}`;
  return `${n} ${n === 1 ? "item" : "itens"}`;
}

/**
 * Lista de quem está no número clicado, no fim da página (`#detalhe`).
 * Renderizada no servidor a partir de `?detalhe=`; "Fechar" volta à URL sem ele.
 */
export function DetalheDashboard({
  titulo,
  detalhe,
  indisponivel = false,
  escopo,
}: {
  titulo: string | null;
  detalhe: Detalhe | null;
  /** A consulta de que a lista depende falhou: aviso, nunca "ninguém neste número". */
  indisponivel?: boolean;
  escopo: EscopoDashboard;
}) {
  if (!titulo || !detalhe) {
    return (
      <p className="card text-label text-ink-faint m-0">
        Clique em qualquer número acima: a lista de quem está nele abre aqui.
      </p>
    );
  }

  const { tipo, linhas } = detalhe;

  return (
    <section id="detalhe" className="card detalhe-dash" aria-labelledby="titulo-detalhe">
      <RolarAteDetalhe chave={titulo} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 id="titulo-detalhe" className="text-[1.0625rem]">
          {indisponivel ? titulo : `${titulo} · `}
          {!indisponivel && <span data-contagem={linhas.length}>{contar(detalhe)}</span>}
        </h2>
        <Link href={hrefDashboard(escopo)} scroll={false} className="btn btn--secondary">
          Fechar
        </Link>
      </div>

      {indisponivel ? (
        <Indisponivel />
      ) : linhas.length === 0 ? (
        <Vazio>Ninguém neste número.</Vazio>
      ) : (
        <div className="rolagem-dash" tabIndex={0} aria-label="Lista rolável">
          <table className="tabela-dash">
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr>
                <th scope="col">Colaborador</th>
                <th scope="col">{tipo === "pessoas" ? "Pior requisito" : "Requisito"}</th>
                <th scope="col">Supervisor</th>
                <th scope="col">{tipo === "eventos" ? "Documento" : "Situação"}</th>
                {tipo !== "eventos" && <th scope="col">Etapa</th>}
                {tipo === "itens" && <th scope="col">Com quem</th>}
                {tipo === "itens" && <th scope="col">Dias na etapa</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave}>
                  <td>
                    <BotaoNomeColaborador colaboradorId={l.colaboradorId} nome={l.nome} />
                  </td>
                  <td>{l.requisito}</td>
                  <td>{l.supervisor}</td>
                  <td>
                    {tipo === "eventos" ? (
                      formatarData(l.data)
                    ) : l.status ? (
                      <SeloStatus status={l.status} dias={l.dias} />
                    ) : (
                      "—"
                    )}
                  </td>
                  {tipo !== "eventos" && <td className="text-ink-muted">{l.etapa ? ETAPA_ROTULO[l.etapa] : "—"}</td>}
                  {tipo === "itens" && <td className="text-ink-muted">{l.dono ? DONO_ROTULO[l.dono] : "—"}</td>}
                  {tipo === "itens" && <td>{l.diasParados ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
