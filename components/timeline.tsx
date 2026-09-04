import { ETAPA_ROTULO, formatarDataHora } from "@/lib/dominio";
import type { Etapa } from "@/lib/tipos";

export interface EntradaHistorico {
  id: string;
  etapa_de: Etapa | null;
  etapa_para: Etapa;
  autor_nome: string | null;
  /** Supervisor por quem o autor falou (plano, seção 5). */
  em_nome_de: string | null;
  observacao: string | null;
  criado_em: string;
}

/**
 * A timeline do item.
 *
 * É a resposta para "de quem era a responsabilidade e desde quando" — a
 * pergunta que o e-mail encadeado nunca conseguiu responder e que motivou o
 * sistema inteiro.
 */
export function Timeline({ entradas }: { entradas: EntradaHistorico[] }) {
  if (entradas.length === 0) {
    return <p className="text-ink-faint text-label">Sem movimentação registrada.</p>;
  }

  return (
    <ol className="list-none p-0 m-0">
      {entradas.map((entrada, indice) => (
        <li
          key={entrada.id}
          className="relative pl-5 pb-4 last:pb-0"
          style={{
            borderLeft:
              indice === entradas.length - 1 ? "1px solid transparent" : "1px solid var(--color-line)",
            marginLeft: "3px",
          }}
        >
          <span
            aria-hidden
            className="absolute left-0 top-1.5 size-[7px] rounded-full -translate-x-1/2"
            style={{ background: "var(--color-ink-faint)" }}
          />
          <div className="text-label">
            {entrada.etapa_de === null ? (
              <span className="font-medium">Item criado em {ETAPA_ROTULO[entrada.etapa_para]}</span>
            ) : entrada.etapa_de === entrada.etapa_para ? (
              // Ação registrada dentro da etapa — informar os dados ao
              // supervisor, por exemplo. "Agendado → Agendado" não é uma
              // transição, é ruído: aqui só o rótulo da etapa.
              <span className="font-medium">Em {ETAPA_ROTULO[entrada.etapa_para]}</span>
            ) : (
              <>
                <span className="text-ink-muted">{ETAPA_ROTULO[entrada.etapa_de]}</span>
                <span className="mx-1.5 text-ink-faint" aria-label="passou para">→</span>
                <span className="font-medium">{ETAPA_ROTULO[entrada.etapa_para]}</span>
              </>
            )}
          </div>
          <div className="text-caption text-ink-faint tabular">
            {formatarDataHora(entrada.criado_em)}
            {entrada.autor_nome && <> · {entrada.autor_nome}</>}
            {entrada.em_nome_de && <> · em nome de {entrada.em_nome_de}</>}
          </div>
          {entrada.observacao && (
            <p className="text-label text-ink-muted mt-1 mb-0 max-w-[60ch]">{entrada.observacao}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
