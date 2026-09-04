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
      } else if (item.dono === "supervisor") precisamDeData.push(item);
      // As etapas que estão com o QSMS não entram no e-mail do supervisor: não
      // há nada que ele possa fazer com elas.
    }

    const blocos: BlocoEmail[] = [
      {
        chave: "acao",
        titulo: "Precisa de você",
        explicacao:
          "Vencem nos próximos 90 dias e ainda não têm data de liberação. Informe quando o colaborador pode sair da equipe.",
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

  // ---------------------------------------------------------------------------
  // Digest interno do QSMS e do admin (plano da Fase 1, seção 9)
  //
  // Não depende de login de supervisor, então entra já na Fase 1. Cobre o que
  // o e-mail por supervisor não cobre: os processos parados com o próprio QSMS
  // e os colaboradores sem supervisor vinculado, que hoje não recebem e-mail
  // nenhum e por isso somem da fila de todo mundo.
  // ---------------------------------------------------------------------------
  const digest = await enviarDigestInterno({
    supabase,
    resend,
    remetente,
    siteUrl,
    referencia,
    simulacao,
  });

  if (previa === "qsms" && digest.html) {
    return new NextResponse(digest.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const resultado = {
    referencia,
    simulacao,
    enviados: enviados.length,
    detalhe_enviados: enviados,
    pulados: pulados.length,
    falhas,
    colaboradores_sem_supervisor: orfaos ?? 0,
    digest_interno: digest.relatorio,
  };

  console.log("[cron:email-semanal]", resultado);
  return NextResponse.json(resultado);
}

/**
 * O digest interno: uma leitura da fila inteira, para quem responde por ela.
 *
 * Três blocos, do mais urgente para o menos: quem está irregular hoje, o que
 * travou com o QSMS, e o que já passou do limite de marcação (vencimento − 7
 * dias) e ainda não foi agendado.
 */
async function enviarDigestInterno({
  supabase,
  resend,
  remetente,
  siteUrl,
  referencia,
  simulacao,
}: {
  supabase: ReturnType<typeof criarClienteAdmin>;
  resend: Resend | null;
  remetente: string | undefined;
  siteUrl: string;
  referencia: string;
  simulacao: boolean;
}): Promise<{ html: string | null; relatorio: Record<string, unknown> }> {
  const { data: perfisBrutos } = await supabase
    .from("perfis")
    .select("email, nome, papel")
    .in("papel", ["qsms", "admin"])
    .eq("ativo", true);

  const destinatarios = (perfisBrutos ?? []) as { email: string; nome: string | null }[];
  if (destinatarios.length === 0) {
    return { html: null, relatorio: { enviados: 0, motivo: "nenhum perfil qsms/admin ativo" } };
  }

  const { data: todosBrutos } = await supabase
    .from("vw_itens_abertos")
    .select("*")
    .order("peso_status");

  const todos = (todosBrutos ?? []) as ItemAberto[];

  // Cada item entra em um bloco só, pela mesma razão do e-mail do supervisor:
  // contagem repetida é contagem em que ninguém confia.
  const irregulares: ItemAberto[] = [];
  const parados: ItemAberto[] = [];
  const foraDoPrazoDeMarcar: ItemAberto[] = [];

  for (const item of todos) {
    if (item.status === "vencido" || item.status === "sem_registro") irregulares.push(item);
    else if (item.sla_estourado || item.etapa === "inapto_em_tratativa") parados.push(item);
    else if (item.limite_marcacao_estourado && item.etapa !== "aguardando_documento") {
      foraDoPrazoDeMarcar.push(item);
    }
  }

  const blocos: BlocoEmail[] = [
    {
      chave: "irregulares",
      titulo: "Não podem trabalhar hoje",
      explicacao:
        "ASO vencido ou sem nenhuma data de referência. Ausência de informação tem o mesmo peso operacional que vencido.",
      itens: irregulares,
    },
    {
      chave: "parados",
      titulo: "Processos parados",
      explicacao:
        "Passaram do prazo da etapa ou estão travados em tratativa de inapto. Ninguém vai destravar sozinho.",
      itens: parados,
    },
    {
      chave: "acao",
      titulo: "Fora do prazo de marcação",
      explicacao:
        "Já passaram do limite de marcar (vencimento menos 7 dias) e ainda não têm exame agendado.",
      itens: foraDoPrazoDeMarcar,
    },
  ];

  const total = blocos.reduce((soma, b) => soma + b.itens.length, 0);
  if (total === 0) {
    return { html: null, relatorio: { enviados: 0, motivo: "fila limpa" } };
  }

  const { assunto, html, texto } = montarEmail({
    supervisorNome: "equipe do QSMS",
    blocos,
    siteUrl,
    rotaItem: "/qsms/item",
    intro: "Resumo semanal da fila de ASO da UEN 211 — inclusive o que está parado com o QSMS.",
    assunto: `GIRO · ${total} ${total === 1 ? "pendência" : "pendências"} de ASO exigem atenção`,
  });

  if (simulacao) {
    return {
      html,
      relatorio: {
        simulado: true,
        assunto,
        destinatarios: destinatarios.map((d) => d.email),
        irregulares: irregulares.length,
        parados: parados.length,
        fora_do_prazo: foraDoPrazoDeMarcar.length,
      },
    };
  }

  // Uma linha de dedup para o digest inteiro: item e supervisor nulos, coberto
  // pelo índice uq_alerta_interno.
  const { error: erroDedup } = await supabase.from("alertas_enviados").insert({
    item_id: null,
    supervisor_id: null,
    tipo_alerta: "digest_qsms",
    referencia,
  });

  if (erroDedup) {
    if (erroDedup.code === "23505") {
      return { html, relatorio: { enviados: 0, motivo: "já enviado nesta semana" } };
    }
    return { html, relatorio: { enviados: 0, erro: erroDedup.message } };
  }

  if (!resend || !remetente) {
    return { html, relatorio: { enviados: 0, erro: "Resend não configurado" } };
  }

  const { error: erroEnvio } = await resend.emails.send({
    from: remetente,
    to: destinatarios.map((d) => d.email),
    subject: assunto,
    html,
    text: texto,
  });

  if (erroEnvio) {
    await supabase
      .from("alertas_enviados")
      .delete()
      .eq("tipo_alerta", "digest_qsms")
      .eq("referencia", referencia)
      .is("item_id", null)
      .is("supervisor_id", null);
    return { html, relatorio: { enviados: 0, erro: erroEnvio.message } };
  }

  return {
    html,
    relatorio: {
      enviados: destinatarios.length,
      irregulares: irregulares.length,
      parados: parados.length,
      fora_do_prazo: foraDoPrazoDeMarcar.length,
    },
  };
}

export async function GET(request: NextRequest) {
  return executar(request);
}

export async function POST(request: NextRequest) {
  return executar(request);
}
