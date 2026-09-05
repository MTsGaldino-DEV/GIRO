"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { Aviso, Vazio } from "@/components/aviso";
import { AcoesItem } from "@/components/acoes-item";
import { formatarData, RESULTADO_ROTULO, ETAPA_ROTULO } from "@/lib/dominio";
import { carregarExames, type EventoColaborador } from "@/lib/consulta-colaborador";
import type { Clinica, ItemAberto } from "@/lib/tipos";

/**
 * Aba ASO do painel.
 *
 * A máquina de estados NÃO é reimplementada aqui: `<AcoesItem>` é o mesmo
 * componente que a página cheia usa, com os mesmos formulários chamando as
 * mesmas Server Actions de `app/(app)/qsms/acoes.ts`. Etapas, SLA, transições e
 * regras de desfecho continuam exatamente onde estavam.
 *
 * O que muda é só de onde vêm os dados de leitura: consulta no navegador em vez
 * de Server Component, porque o painel não tem rota própria para renderizar do
 * servidor.
 */
export function AbaAso({ colaboradorId, item }: { colaboradorId: string; item: ItemAberto | null }) {
  const [eventos, setEventos] = useState<EventoColaborador[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [clinicas, setClinicas] = useState<Clinica[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    const supabase = criarClienteNavegador();
    setCarregando(true);

    Promise.all([
      carregarExames(supabase, colaboradorId),
      supabase.from("clinicas").select("*").eq("ativo", true).order("nome"),
    ]).then(([exames, { data: clinicasBrutas }]) => {
      if (!ativo) return;
      setEventos(exames.eventos);
      setLinks(exames.links);
      setClinicas((clinicasBrutas ?? []) as Clinica[]);
      setCarregando(false);
    });

    return () => {
      ativo = false;
    };
  }, [colaboradorId]);

  return (
    <div className="grid gap-4">
      {item ? (
        <>
          <AcoesItem item={item} clinicas={clinicas} />
          <p className="text-caption text-ink-faint m-0">
            Etapa atual: {ETAPA_ROTULO[item.etapa]}. A visão focada deste ciclo,
            com a linha do tempo, está em{" "}
            <Link href={`/qsms/item/${item.item_id}`}>abrir o item</Link>.
          </p>
        </>
      ) : (
        <Aviso titulo="Nenhum ciclo em aberto">
          O item é criado automaticamente quando o vencimento entra na janela de
          90 dias, ou pelo botão &ldquo;Gerar itens&rdquo; no painel.
        </Aviso>
      )}

      <div className="card">
        <h3 className="mb-3">Exames realizados</h3>

        {carregando ? (
          <div className="esqueleto h-24" aria-busy="true" />
        ) : eventos.length === 0 ? (
          <Vazio>Nenhum exame registrado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela" style={{ minWidth: 640 }}>
              <caption className="sr-only">Histórico de exames</caption>
              <thead>
                <tr>
                  <th scope="col">Documento</th>
                  <th scope="col">Realizado</th>
                  <th scope="col">Venceu/vence</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Clínica</th>
                  <th scope="col"><span className="sr-only">Arquivo</span></th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((evento) => (
                  <tr key={evento.id}>
                    <td className="tabular">
                      {formatarData(evento.data_documento)}
                      {evento.estimado && (
                        <span className="block text-caption text-ink-faint">data estimada</span>
                      )}
                    </td>
                    <td className="tabular">{formatarData(evento.data_realizado)}</td>
                    <td className="tabular">{formatarData(evento.vencia_em)}</td>
                    <td className="text-label">
                      {RESULTADO_ROTULO[evento.resultado] ?? evento.resultado}
                    </td>
                    <td className="text-label">{evento.clinica ?? "—"}</td>
                    <td>
                      {links[evento.id] ? (
                        <a
                          href={links[evento.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-label"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-caption text-ink-faint">sem arquivo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
