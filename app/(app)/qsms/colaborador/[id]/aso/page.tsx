import type { Metadata } from "next";
import Link from "next/link";
import { exigirQsms } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarItemAberto, carregarStatus } from "@/lib/colaborador";
import { urlAssinada } from "@/lib/storage";
import { Aviso, Vazio } from "@/components/aviso";
import { formatarData, RESULTADO_ROTULO, ETAPA_ROTULO } from "@/lib/dominio";
import { AcoesItem } from "@/components/acoes-item";
import { FormularioRetroativo } from "./formulario-retroativo";
import type { Clinica } from "@/lib/tipos";

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
  const [item, status, { data: eventosBrutos }, { data: tipo }, { data: clinicas }] =
    await Promise.all([
      carregarItemAberto(id),
      carregarStatus(id),
      supabase
        .from("vw_eventos_colaborador")
        .select("*")
        .eq("colaborador_id", id)
        .order("data_documento", { ascending: false }),
      supabase.from("tipos_requisito").select("id").eq("nome", "ASO Periódico").maybeSingle(),
      supabase.from("clinicas").select("*").eq("ativo", true).order("nome"),
    ]);

  const eventos = (eventosBrutos ?? []) as EventoLinha[];

  // Uma URL assinada por documento, todas de uma vez. Em série isto era uma
  // ida ao Storage por exame, uma esperando a outra: um colaborador com cinco
  // ASOs pagava cinco viagens antes da página aparecer.
  const comDocumento = eventos.filter((e) => e.documento_url);
  const assinadas = await Promise.all(
    comDocumento.map((e) => urlAssinada(supabase, e.documento_url!))
  );

  const links = new Map<string, string>();
  comDocumento.forEach((evento, i) => {
    const url = assinadas[i];
    if (url) links.set(evento.id, url);
  });

  return (
    <div className="grid gap-5 max-w-[900px]">
      {item ? (
        <>
          <AcoesItem item={item} clinicas={(clinicas ?? []) as Clinica[]} />

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
