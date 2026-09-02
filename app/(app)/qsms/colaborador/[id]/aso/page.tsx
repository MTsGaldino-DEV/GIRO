import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarItemAberto, carregarStatus } from "@/lib/colaborador";
import { urlAssinada } from "@/lib/storage";
import { Aviso, Vazio } from "@/components/aviso";
import { formatarData, RESULTADO_ROTULO, ETAPA_ROTULO } from "@/lib/dominio";
import { FormularioAgendar } from "../../../item/[id]/formulario-agendar";
import { FormularioConcluir } from "../../../item/[id]/formulario-concluir";
import { FormularioDevolver } from "../../../item/[id]/formulario-devolver";
import { FormularioCemig } from "../../../item/[id]/formulario-cemig";
import { FormularioRetroativo } from "./formulario-retroativo";

export const metadata: Metadata = { title: "ASO" };
export const dynamic = "force-dynamic";

interface EventoLinha {
  id: string;
  requisito: string;
  data_realizado: string | null;
  data_documento: string;
  vencia_em: string;
  resultado: string;
  clinica: string | null;
  medico: string | null;
  documento_url: string | null;
  observacoes: string | null;
  estimado: boolean;
}

export default async function AbaAso({ params }: { params: Promise<{ id: string }> }) {
  await exigirQsms();
  const { id } = await params;

  const supabase = await criarClienteServidor();
  const [item, status, { data: eventosBrutos }, { data: tipo }] = await Promise.all([
    carregarItemAberto(id),
    carregarStatus(id),
    supabase
      .from("vw_eventos_colaborador")
      .select("*")
      .eq("colaborador_id", id)
      .order("data_documento", { ascending: false }),
    supabase.from("tipos_requisito").select("id").eq("nome", "ASO Periódico").maybeSingle(),
  ]);

  const eventos = (eventosBrutos ?? []) as EventoLinha[];

  // Uma URL assinada por documento. São poucos por colaborador — ao contrário
  // da lista, aqui não compensa complicar com assinatura em lote.
  const links = new Map<string, string>();
  for (const evento of eventos) {
    if (!evento.documento_url) continue;
    const url = await urlAssinada(supabase, evento.documento_url);
    if (url) links.set(evento.id, url);
  }

  return (
    <div className="grid gap-5 max-w-[900px]">
      {item ? (
        <>
          {item.etapa === "previsto" && (
            <Aviso titulo="Aguardando a supervisão">
              O item está com {item.supervisor_nome ?? "a supervisão"}, que precisa
              informar a data em que libera o colaborador. Prazo desta etapa: 7 dias.
            </Aviso>
          )}

          {item.etapa === "data_proposta" && (
            <>
              <div className="card">
                <h2 className="text-[1.0625rem] mb-1">Agendar com a clínica</h2>
                <p className="text-ink-muted text-label mb-4">
                  A supervisão liberou o colaborador para{" "}
                  <strong className="font-medium tabular">
                    {formatarData(item.data_liberacao_proposta)}
                  </strong>
                  .
                </p>
                <FormularioAgendar item={item} />
              </div>
              <FormularioDevolver itemId={item.item_id} />
            </>
          )}

          {item.etapa === "agendado" && (
            <Aviso titulo="Aguardando o comparecimento">
              O item está com a supervisão até {formatarData(item.data_agendada)}.
              Quem confirma presença é o supervisor.
            </Aviso>
          )}

          {item.etapa === "aguardando_documento" && (
            <div className="card">
              <h2 className="text-[1.0625rem] mb-1">Registrar resultado</h2>
              <p className="text-ink-muted text-label mb-4">
                O colaborador compareceu. O que zera a pendência é o documento —
                comparecimento não é conformidade.
              </p>
              <FormularioConcluir item={item} />
            </div>
          )}

          <FormularioCemig itemId={item.item_id} atual={item.comunicado_cemig_em} />

          <p className="text-caption text-ink-faint m-0">
            Etapa atual: {ETAPA_ROTULO[item.etapa]}. A visão focada deste ciclo,
            com a linha do tempo, está em{" "}
            <Link href={`/qsms/item/${item.item_id}`}>abrir o item</Link>.
          </p>
        </>
      ) : (
        <Aviso titulo="Nenhum ciclo em aberto">
          O item é criado automaticamente quando o vencimento entra na janela de
          60 dias, ou pelo botão &ldquo;Gerar itens&rdquo; no painel.
        </Aviso>
      )}

      {status?.status === "sem_registro" && tipo && (
        <div className="card">
          <h2 className="text-[1.0625rem] mb-1">Registrar o último ASO conhecido</h2>
          <p className="text-ink-muted text-label mb-4">
            Sem uma data de referência não dá para calcular vencimento. Se o
            documento existe em papel ou no sistema da clínica, lance a data aqui.
          </p>
          <FormularioRetroativo colaboradorId={id} tipoRequisitoId={tipo.id} />
        </div>
      )}

      <div>
        <h2 className="text-[1.0625rem] mb-3">Exames realizados</h2>

        {eventos.length === 0 ? (
          <Vazio>Nenhum exame registrado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <caption className="sr-only">Histórico de exames</caption>
              <thead>
                <tr>
                  <th scope="col">Documento</th>
                  <th scope="col">Requisito</th>
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
                    <td className="text-label">{evento.requisito}</td>
                    <td className="tabular">{formatarData(evento.data_realizado)}</td>
                    <td className="tabular">{formatarData(evento.vencia_em)}</td>
                    <td className="text-label">
                      {RESULTADO_ROTULO[evento.resultado] ?? evento.resultado}
                    </td>
                    <td className="text-label">{evento.clinica ?? "—"}</td>
                    <td>
                      {links.has(evento.id) ? (
                        <a
                          href={links.get(evento.id)}
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
