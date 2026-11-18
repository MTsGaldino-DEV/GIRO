import { nomeArquivoExame, urlParaBaixar } from "@/lib/storage";

/**
 * "Abrir" e "Baixar" do documento de um exame (ASO, AVP).
 *
 * Usado na aba ASO do painel e na página cheia do colaborador, para as duas
 * tabelas de exames não divergirem. Sem hooks: serve a Server e Client
 * Components.
 */
export function LinksDocumento({
  url,
  requisito,
  dataDocumento,
  caminho,
}: {
  /** URL assinada; ausente quando o exame não tem arquivo. */
  url: string | null | undefined;
  requisito: string;
  dataDocumento: string;
  caminho: string | null;
}) {
  if (!url || !caminho) {
    return <span className="text-caption text-ink-faint">sem arquivo</span>;
  }

  const nome = nomeArquivoExame(requisito, dataDocumento, caminho);
  return (
    <span className="inline-flex gap-3 whitespace-nowrap">
      <a href={url} target="_blank" rel="noreferrer" className="text-label">
        Abrir
      </a>
      <a href={urlParaBaixar(url, nome)} download={nome} className="text-label">
        Baixar
      </a>
    </span>
  );
}
