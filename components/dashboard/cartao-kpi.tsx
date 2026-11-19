import Link from "next/link";
import { NumeroAnimado } from "@/components/numero-animado";

/**
 * Cartão de número do Dashboard. Com `href` é link: o número abre a lista de
 * quem está nele; sem `href` é só leitura (média sem lista por trás). `valor` nulo (consulta falhou) aparece como "—", nunca como 0.
 *
 * `variante` é a classe de cor: `kpi--<status>` só nos seis cartões do
 * semáforo; os de processo ficam no branco/grafite padrão.
 */
export function CartaoKpi({
  href,
  valor,
  rotulo,
  nota,
  sufixo,
  variante,
  ativo = false,
  titulo,
  textoNulo = "indisponível",
}: {
  href?: string;
  valor: number | null;
  rotulo: string;
  nota?: string;
  /** Unidade colada ao número, como "%" ou " dias". */
  sufixo?: string;
  variante?: string;
  ativo?: boolean;
  titulo?: string;
  /** O que o leitor de tela ouve no lugar do "—". Padrão: a consulta falhou. */
  textoNulo?: string;
}) {
  const classe = variante ? `kpi ${variante}` : "kpi";
  const conteudo = (
    <>
      <span className="kpi__numero">
        {valor === null ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">{textoNulo}</span>
          </>
        ) : (
          <>
            <NumeroAnimado valor={valor} />
            {sufixo}
          </>
        )}
      </span>
      <span className="kpi__rotulo">{rotulo}</span>
      {nota && <span className="kpi__nota">{nota}</span>}
    </>
  );
  if (!href) {
    return (
      <div className={`${classe} kpi--leitura`} title={titulo}>
        {conteudo}
      </div>
    );
  }
  return (
    <Link href={href} className={classe} aria-current={ativo ? "true" : undefined} title={titulo}>
      {conteudo}
    </Link>
  );
}
