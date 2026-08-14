import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cronAutorizado, referenciaSemanal } from "@/lib/cron";
import { montarEmail, type BlocoEmail } from "@/lib/email-semanal";
import type { ItemAberto } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron de segunda-feira: um e-mail por supervisor, só com a equipe dele.
 *
 * Três blocos, na ordem em que a pessoa precisa deles: o que depende dela, o
 * que já está marcado, e quem não pode trabalhar. Supervisor sem pendência não
 * recebe nada — e-mail que chega toda semana sem conteúdo vira e-mail que
 * ninguém abre, inclusive na semana em que importa.
 */
async function executar(request: NextRequest) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const chaveResend = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const parametros = new URL(request.url).searchParams;
  const previa = parametros.get("previa");
  const simulacao = parametros.get("simular") === "1" || previa !== null;

  // Simulação e prévia não enviam nada, então não precisam de credencial. São
  // os modos em que se confere quem receberia o quê antes de ligar o Resend.
  if (!simulacao && (!chaveResend || !remetente)) {
    return NextResponse.json(
      { erro: "RESEND_API_KEY e EMAIL_REMETENTE precisam estar configurados." },
      { status: 500 }
    );
  }

  const supabase = criarClienteAdmin();
  const resend = chaveResend ? new Resend(chaveResend) : null;
  const referencia = referenciaSemanal();

  const { data: itensBrutos, error } = await supabase
    .from("vw_itens_abertos")
    .select("*")
    .not("supervisor_id", "is", null)
    .order("peso_status");

  if (error) {
    console.error("[cron:email-semanal]", error.message);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const itens = (itensBrutos ?? []) as ItemAberto[];

  // Colaborador sem supervisor não entra em e-mail nenhum (P1). Se sobrar
  // algum, é sinal de que o mapa de equipes está incompleto — reportar em vez
  // de fingir que a fila está limpa.
  const { count: orfaos } = await supabase
    .from("colaboradores")
    .select("*", { count: "exact", head: true })
    .eq("ativo", true)
    .is("supervisor_id", null);

  const porSupervisor = new Map<string, ItemAberto[]>();
  for (const item of itens) {
    if (!item.supervisor_id) continue;
    const lista = porSupervisor.get(item.supervisor_id) ?? [];
    lista.push(item);
    porSupervisor.set(item.supervisor_id, lista);
  }

  const enviados: string[] = [];
  const pulados: string[] = [];
  const falhas: { supervisor: string; erro: string }[] = [];

  for (const [supervisorId, lista] of porSupervisor) {
    const primeiro = lista[0];
    const email = primeiro.supervisor_email;
    const nome = primeiro.supervisor_nome ?? "supervisor";

    if (!email) {
      falhas.push({ supervisor: nome, erro: "supervisor sem e-mail cadastrado" });
      continue;
    }

    // Deduplicação: uma linha por supervisor por semana ISO. O índice único
    // parcial no banco é a garantia real — duas execuções concorrentes do cron
    // não conseguem inserir a mesma referência duas vezes.
    if (!simulacao) {
      const { error: erroDedup } = await supabase.from("alertas_enviados").insert({
        item_id: null,
        supervisor_id: supervisorId,
        tipo_alerta: "semanal",
        referencia,
      });

      if (erroDedup) {
        // 23505 = unique_violation: já foi enviado nesta semana.
        if (erroDedup.code === "23505") {
          pulados.push(nome);
          continue;
        }
        falhas.push({ supervisor: nome, erro: erroDedup.message });
        continue;
      }
    }

    // Cada colaborador entra em exatamente um bloco. Um nome repetido em duas
    // seções, com o mesmo botão nas duas, faz o supervisor duvidar da contagem
    // — e a contagem é a única coisa que ele lê antes de decidir se abre.
    //
    // A ordem é de ação mais específica para menos: quem já tem exame marcado
    // precisa comparecer, mesmo estando vencido hoje. O selo de status na
    // própria linha continua mostrando a gravidade.
    const agendados: ItemAberto[] = [];
    const naoPodemTrabalhar: ItemAberto[] = [];
    const precisamDeData: ItemAberto[] = [];

    for (const item of lista) {
      if (item.etapa === "agendado") agendados.push(item);
      else if (item.status === "vencido" || item.status === "sem_registro") {
        naoPodemTrabalhar.push(item);
      } else if (item.etapa === "previsto") precisamDeData.push(item);
      // data_proposta e aguardando_documento estão com o QSMS: não há nada
      // que o supervisor possa fazer, então não entram no e-mail dele.
    }

    const blocos: BlocoEmail[] = [
      {
        chave: "acao",
        titulo: "Precisa de você",
        explicacao:
          "Vencem nos próximos 60 dias e ainda não têm data de liberação. Informe quando o colaborador pode sair da equipe.",
        itens: precisamDeData,
      },
      {
        chave: "agendados",
        titulo: "Agendados",
        explicacao: "Data, hora e local já fechados. Garanta o comparecimento.",
        itens: agendados,
      },
      {
        chave: "irregulares",
        titulo: "Não podem trabalhar",
        explicacao:
          "ASO vencido ou sem nenhuma data de referência, e ainda sem exame marcado. Nos dois casos o colaborador está irregular hoje.",
        itens: naoPodemTrabalhar,
      },
    ];

    if (blocos.every((b) => b.itens.length === 0)) {
      pulados.push(nome);
      // Desfaz a marca de dedup: nada foi enviado, e na semana que vem o
      // supervisor pode ter pendência de verdade.
      if (!simulacao) {
        await supabase
          .from("alertas_enviados")
          .delete()
          .eq("supervisor_id", supervisorId)
          .eq("tipo_alerta", "semanal")
          .eq("referencia", referencia)
          .is("item_id", null);
      }
      continue;
    }

    const { assunto, html, texto } = montarEmail({ supervisorNome: nome, blocos, siteUrl });

    // ?previa=<supervisor_id> devolve o HTML em vez do relatório: serve para
    // conferir como o e-mail chega antes de ligar o Resend.
    if (previa === supervisorId) {
      return new NextResponse(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (simulacao) {
      enviados.push(`${nome} <${email}> — ${assunto}`);
      continue;
    }

    const { error: erroEnvio } = await resend!.emails.send({
      from: remetente!,
      to: email,
      subject: assunto,
      html,
      text: texto,
    });

    if (erroEnvio) {
      falhas.push({ supervisor: nome, erro: erroEnvio.message });
      await supabase
        .from("alertas_enviados")
        .delete()
        .eq("supervisor_id", supervisorId)
        .eq("tipo_alerta", "semanal")
        .eq("referencia", referencia)
        .is("item_id", null);
      continue;
    }

    enviados.push(nome);
  }

  const resultado = {
    referencia,
    simulacao,
    enviados: enviados.length,
    detalhe_enviados: enviados,
    pulados: pulados.length,
    falhas,
    colaboradores_sem_supervisor: orfaos ?? 0,
  };

  console.log("[cron:email-semanal]", resultado);
  return NextResponse.json(resultado);
}

export async function GET(request: NextRequest) {
  return executar(request);
}

export async function POST(request: NextRequest) {
  return executar(request);
}
