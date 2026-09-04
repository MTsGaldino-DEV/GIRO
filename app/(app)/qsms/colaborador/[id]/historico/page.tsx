import type { Metadata } from "next";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Vazio } from "@/components/aviso";
import { ETAPA_ROTULO, formatarDataHora } from "@/lib/dominio";
import type { Etapa } from "@/lib/tipos";

export const metadata: Metadata = { title: "Histórico" };
export const dynamic = "force-dynamic";

interface EntradaColaborador {
  id: string;
  item_id: string;
  etapa_de: Etapa | null;
  etapa_para: Etapa;
  autor_nome: string | null;
  em_nome_de: string | null;
  observacao: string | null;
  criado_em: string;
}

export default async function AbaHistorico({ params }: { params: Promise<{ id: string }> }) {
  await exigirQsms();
  const { id } = await params;

  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("fn_historico_do_colaborador", { p_colaborador_id: id });
  const entradas = (data ?? []) as EntradaColaborador[];

  // Agrupa por ciclo: a pessoa tem vários itens ao longo dos anos, e uma lista
  // corrida de transições não deixa ver onde um ciclo termina e outro começa.
  const ciclos = new Map<string, EntradaColaborador[]>();
  for (const entrada of entradas) {
    const lista = ciclos.get(entrada.item_id) ?? [];
    lista.push(entrada);
    ciclos.set(entrada.item_id, lista);
  }

  if (entradas.length === 0) {
    return <Vazio>Sem movimentação registrada para este colaborador.</Vazio>;
  }

  return (
    <div className="grid gap-5 max-w-[760px]">
      <p className="text-ink-muted text-label m-0">
        Todas as transições de todos os ciclos, da mais recente para a mais
        antiga. É a resposta para &ldquo;de quem era a responsabilidade e desde
        quando&rdquo;.
      </p>

      {[...ciclos.entries()].map(([itemId, lista], indice) => (
        <div key={itemId} className="card">
          <h2 className="text-[1.0625rem] mb-3">
            {indice === 0 ? "Ciclo mais recente" : `Ciclo anterior ${indice}`}
          </h2>

          <ol className="list-none p-0 m-0">
            {lista.map((entrada, i) => (
              <li
                key={entrada.id}
                className="relative pl-5 pb-4 last:pb-0"
                style={{
                  borderLeft:
                    i === lista.length - 1
                      ? "1px solid transparent"
                      : "1px solid var(--color-line)",
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
                    <span className="font-medium">
                      Item criado em {ETAPA_ROTULO[entrada.etapa_para]}
                    </span>
                  ) : entrada.etapa_de === entrada.etapa_para ? (
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
                  <p className="text-label text-ink-muted mt-1 mb-0 max-w-[60ch]">
                    {entrada.observacao}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
