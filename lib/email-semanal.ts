import { formatarData, formatarHora, diasParaTexto, STATUS_ROTULO } from "./dominio";
import type { ItemAberto } from "./tipos";

/**
 * Corpo do e-mail semanal.
 *
 * HTML de e-mail é território hostil: sem flexbox, sem CSS externo, sem
 * variável. Tudo inline e em tabela. As cores do semáforo estão repetidas aqui
 * como literais porque um cliente de e-mail não enxerga os tokens do
 * globals.css — se a paleta mudar lá, tem que mudar aqui também.
 */

const CORES = {
  ink: "#23262B",
  inkMuted: "#5F5E5A",
  inkFaint: "#8A8983",
  mist: "#F2F1EC",
  surface: "#FFFFFF",
  line: "#E2E0D8",
  brand: "#0E7C74",
  vencidoBg: "#23262B",
  vencidoFg: "#F2F1EC",
} as const;

export interface BlocoEmail {
  /** Identifica o bloco sem depender do texto do título. */
  chave: "acao" | "agendados" | "irregulares";
  titulo: string;
  explicacao: string;
  itens: ItemAberto[];
}

function linhaItem(item: ItemAberto, siteUrl: string): string {
  const link = `${siteUrl}/supervisor/item/${item.item_id}`;
  const critico = item.status === "vencido" || item.status === "sem_registro";

  const detalhe =
    item.etapa === "agendado"
      ? `${formatarData(item.data_agendada)} às ${formatarHora(item.hora_agendada)}` +
        (item.clinica ? ` · ${item.clinica}` : "") +
        (item.endereco ? `<br><span style="color:${CORES.inkFaint}">${escapar(item.endereco)}</span>` : "") +
        (item.exige_jejum ? `<br><span style="color:${CORES.inkMuted}">Jejum de 8 horas.</span>` : "")
      : item.status === "sem_registro"
        ? "Sem data de referência — trate como vencido."
        : `Vence em ${formatarData(item.data_vencimento)} · ${diasParaTexto(item.dias_restantes)}`;

  return `
  <tr>
    <td style="padding:12px 14px;border-bottom:1px solid ${CORES.line};font-family:Arial,sans-serif">
      <div style="font-size:15px;color:${CORES.ink};font-weight:500">
        ${escapar(item.nome)}
        <span style="color:${CORES.inkFaint};font-weight:400;font-size:13px"> · ${item.matricula}</span>
      </div>
      <div style="font-size:13px;color:${CORES.inkMuted};margin-top:2px">${detalhe}</div>
      ${
        critico
          ? `<div style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;background:${CORES.vencidoBg};color:${CORES.vencidoFg};font-size:12px">${STATUS_ROTULO[item.status]}</div>`
          : ""
      }
    </td>
    <td style="padding:12px 14px;border-bottom:1px solid ${CORES.line};text-align:right;vertical-align:middle">
      <a href="${link}" style="display:inline-block;padding:9px 14px;background:${CORES.brand};color:#FFFFFF;text-decoration:none;border-radius:8px;font-family:Arial,sans-serif;font-size:14px">Abrir</a>
    </td>
  </tr>`;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function montarEmail({
  supervisorNome,
  blocos,
  siteUrl,
}: {
  supervisorNome: string;
  blocos: BlocoEmail[];
  siteUrl: string;
}): { assunto: string; html: string; texto: string } {
  const comItens = blocos.filter((b) => b.itens.length > 0);
  const total = comItens.reduce((soma, b) => soma + b.itens.length, 0);

  const irregulares = blocos.find((b) => b.chave === "irregulares")?.itens.length ?? 0;
  const precisamDeAcao = blocos.find((b) => b.chave === "acao")?.itens.length ?? 0;

  // O assunto carrega o pior caso: é o que aparece na lista do celular e
  // decide se o e-mail é aberto hoje ou na sexta.
  const assunto =
    irregulares > 0
      ? `GIRO · ${irregulares} ${irregulares === 1 ? "colaborador não pode" : "colaboradores não podem"} trabalhar`
      : precisamDeAcao > 0
        ? `GIRO · ${precisamDeAcao} ${precisamDeAcao === 1 ? "colaborador precisa" : "colaboradores precisam"} de programação de ASO`
        : `GIRO · ${total} ${total === 1 ? "pendência" : "pendências"} de ASO na sua equipe`;

  const secoes = comItens
    .map(
      (bloco) => `
    <tr><td style="padding:22px 14px 6px">
      <div style="font-family:Arial,sans-serif;font-size:16px;color:${CORES.ink};font-weight:500">
        ${escapar(bloco.titulo)} <span style="color:${CORES.inkFaint};font-weight:400">(${bloco.itens.length})</span>
      </div>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:${CORES.inkMuted};margin-top:2px">
        ${escapar(bloco.explicacao)}
      </div>
    </td></tr>
    <tr><td style="padding:0 0 4px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${CORES.surface};border:1px solid ${CORES.line};border-radius:10px;border-collapse:separate">
        ${bloco.itens.map((i) => linhaItem(i, siteUrl)).join("")}
      </table>
    </td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CORES.mist}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${CORES.mist};padding:24px 12px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
        <tr><td style="padding:0 14px 4px;font-family:Arial,sans-serif">
          <div style="font-size:15px;font-weight:500;letter-spacing:2px;color:${CORES.ink}">GIRO</div>
          <div style="font-size:12px;color:${CORES.inkFaint}">Gestão integrada de requisitos ocupacionais</div>
        </td></tr>

        <tr><td style="padding:16px 14px 0;font-family:Arial,sans-serif">
          <div style="font-size:15px;color:${CORES.ink}">Bom dia, ${escapar(supervisorNome)}.</div>
          <div style="font-size:14px;color:${CORES.inkMuted};margin-top:6px">
            Situação do ASO da sua equipe nesta semana. Cada botão abre direto no
            item — você já entra logado, sem senha.
          </div>
        </td></tr>

        ${secoes}

        <tr><td style="padding:20px 14px;font-family:Arial,sans-serif;font-size:12px;color:${CORES.inkFaint}">
          ASO vencido impede o colaborador de trabalhar e pode parar a equipe no
          dia seguinte. Se algum dado estiver errado, responda este e-mail ou fale
          com o QSMS.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const texto =
    `Bom dia, ${supervisorNome}.\n\n` +
    comItens
      .map(
        (bloco) =>
          `${bloco.titulo} (${bloco.itens.length})\n${bloco.explicacao}\n` +
          bloco.itens
            .map(
              (i) =>
                `  - ${i.nome} (${i.matricula}): ` +
                (i.etapa === "agendado"
                  ? `${formatarData(i.data_agendada)} ${formatarHora(i.hora_agendada)} ${i.clinica ?? ""}`
                  : i.status === "sem_registro"
                    ? "sem data de referência"
                    : `vence em ${formatarData(i.data_vencimento)} (${diasParaTexto(i.dias_restantes)})`) +
                `\n    ${siteUrl}/supervisor/item/${i.item_id}`
            )
            .join("\n")
      )
      .join("\n\n");

  return { assunto, html, texto };
}
