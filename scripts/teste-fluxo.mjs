// Teste end-to-end da máquina de estados contra o banco real.
//
//   node scripts/teste-fluxo.mjs
//
// Usa um colaborador de teste próprio (matrícula 999999), roda o ciclo inteiro
// e limpa tudo no final. Não toca nos 261 colaboradores reais.
//
// Simula os dois papéis trocando o auth.uid() da sessão: as RPCs são
// SECURITY DEFINER e decidem permissão por perfil, então testar sem passar por
// auth.uid() testaria outra coisa.

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

let passou = 0;
let falhou = 0;

function ok(descricao) {
  passou++;
  console.log(`  ok    ${descricao}`);
}

function erro(descricao, detalhe) {
  falhou++;
  console.log(`  FALHA ${descricao}`);
  if (detalhe) console.log(`        ${detalhe}`);
}

async function esperaSucesso(descricao, sql, params) {
  try {
    const r = await client.query(sql, params);
    ok(descricao);
    return r;
  } catch (e) {
    erro(descricao, e.message);
    return null;
  }
}

async function esperaFalha(descricao, sql, params, trechoEsperado) {
  try {
    await client.query(sql, params);
    erro(descricao, "a operação foi aceita, mas deveria ter sido rejeitada");
  } catch (e) {
    if (trechoEsperado && !e.message.toLowerCase().includes(trechoEsperado.toLowerCase())) {
      erro(descricao, `rejeitou por outro motivo: ${e.message}`);
    } else {
      ok(descricao);
    }
  }
}

/** Faz as próximas chamadas rodarem como se fossem deste usuário. */
async function comoUsuario(uid) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
}

async function main() {
  await client.connect();
  console.log("Teste do ciclo de vida do item\n");

  const { rows: tipos } = await client.query(
    `select id, periodicidade_meses from tipos_requisito where nome = 'ASO Periódico'`
  );
  const tipoId = tipos[0].id;

  // -------------------------------------------------------------------------
  // Cenário
  // -------------------------------------------------------------------------
  await client.query(`delete from colaboradores where matricula = 999999`);
  await client.query(`delete from supervisores where email = 'teste-giro@exemplo.invalido'`);

  const { rows: sup } = await client.query(
    `insert into supervisores (nome, email) values ('Supervisor de Teste', 'teste-giro@exemplo.invalido')
     returning id`
  );
  const supervisorId = sup[0].id;

  const { rows: col } = await client.query(
    `insert into colaboradores (matricula, nome, cargo, situacao, supervisor_id)
     values (999999, 'COLABORADOR DE TESTE', 'INSTALADOR', 'trabalhando', $1)
     returning id`,
    [supervisorId]
  );
  const colaboradorId = col[0].id;

  const { rows: usuarios } = await client.query(
    `select id, papel, supervisor_id from perfis where ativo order by papel limit 5`
  );
  const perfilQsms = usuarios.find((u) => u.papel === "qsms");
  if (!perfilQsms) {
    console.error("Nenhum perfil QSMS ativo. Rode scripts/criar-perfil.mjs antes.");
    process.exit(1);
  }

  // Perfil de supervisor temporário, apontando para o supervisor de teste.
  const { rows: userSup } = await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', 'teste-giro-user@exemplo.invalido', now(), now())
     returning id`
  );
  const supUserId = userSup[0].id;
  await client.query(
    `insert into perfis (id, email, nome, papel, supervisor_id)
     values ($1, 'teste-giro-user@exemplo.invalido', 'Supervisor de Teste', 'supervisor', $2)`,
    [supUserId, supervisorId]
  );

  console.log("Cenário criado: 1 colaborador, 1 supervisor, 2 perfis.\n");

  // -------------------------------------------------------------------------
  console.log("Geração de item");
  // -------------------------------------------------------------------------
  await comoUsuario(perfilQsms.id);

  await esperaSucesso("QSMS gera itens pendentes", `select * from fn_gerar_itens_pendentes()`);

  const { rows: itens } = await client.query(
    `select id, etapa, data_vencimento, sla_vence_em from itens_pendencia
      where colaborador_id = $1 and etapa <> 'concluido'`,
    [colaboradorId]
  );
  if (itens.length === 1) ok("um item aberto criado para o colaborador sem registro");
  else erro("um item aberto criado", `foram ${itens.length}`);

  const itemId = itens[0]?.id;
  if (itens[0]?.etapa === "previsto") ok("item nasce em 'previsto'");
  else erro("item nasce em 'previsto'", `nasceu em ${itens[0]?.etapa}`);
  if (itens[0]?.sla_vence_em) ok("SLA calculado na criação");
  else erro("SLA calculado na criação");

  await esperaSucesso("rodar a geração de novo não duplica", `select * from fn_gerar_itens_pendentes()`);
  const { rows: depois } = await client.query(
    `select count(*)::int as n from itens_pendencia where colaborador_id = $1 and etapa <> 'concluido'`,
    [colaboradorId]
  );
  if (depois[0].n === 1) ok("continua com um único item aberto");
  else erro("continua com um único item aberto", `agora são ${depois[0].n}`);

  // -------------------------------------------------------------------------
  console.log("\nTransições e permissões");
  // -------------------------------------------------------------------------
  // fn_propor_data não restringe papel de propósito: o QSMS às vezes recebe a
  // data por telefone e lança pelo supervisor. Quem não é da equipe continua
  // barrado por fn_exigir_acesso_ao_item.
  await comoUsuario(supUserId);

  await esperaFalha(
    "supervisor não consegue agendar (é do QSMS)",
    `select fn_agendar($1,'Clinica X','Rua Y','Dr. Z', current_date + 5, '08:00', false, null)`,
    [itemId],
    "Apenas o QSMS"
  );

  await esperaFalha(
    "data de liberação no passado é rejeitada",
    `select fn_propor_data($1, current_date - 1, null)`,
    [itemId],
    "passado"
  );

  await esperaSucesso(
    "supervisor informa data de liberação",
    `select fn_propor_data($1, current_date + 10, 'Libero na terça')`,
    [itemId]
  );

  const { rows: e1 } = await client.query(`select etapa from itens_pendencia where id = $1`, [itemId]);
  if (e1[0].etapa === "data_proposta") ok("etapa virou 'data_proposta'");
  else erro("etapa virou 'data_proposta'", `está em ${e1[0].etapa}`);

  await esperaFalha(
    "propor data duas vezes é rejeitado",
    `select fn_propor_data($1, current_date + 12, null)`,
    [itemId],
    'não está na etapa'
  );

  // Ausência bloqueando agendamento
  await comoUsuario(perfilQsms.id);
  await client.query(
    `insert into ausencias (colaborador_id, tipo, data_inicio, data_fim)
     values ($1, 'ferias', current_date + 3, current_date + 20)`,
    [colaboradorId]
  );

  await esperaFalha(
    "agendar dentro de período de férias é bloqueado",
    `select fn_agendar($1,'Clinica X','Rua Y','Dr. Z', current_date + 5, '08:00', false, null)`,
    [itemId],
    "ausência"
  );

  await client.query(`delete from ausencias where colaborador_id = $1`, [colaboradorId]);

  await esperaFalha(
    "agendar sem clínica é rejeitado",
    `select fn_agendar($1,'','Rua Y','Dr. Z', current_date + 5, '08:00', false, null)`,
    [itemId],
    "Informe a clínica"
  );

  await esperaSucesso(
    "QSMS agenda com a clínica",
    `select fn_agendar($1,'Clínica Vida','Av. Brasil, 100','Dra. Ana', current_date + 5, '08:00', true, null)`,
    [itemId]
  );

  const { rows: e2 } = await client.query(
    `select etapa, sla_vence_em, data_agendada from itens_pendencia where id = $1`,
    [itemId]
  );
  if (e2[0].etapa === "agendado") ok("etapa virou 'agendado'");
  else erro("etapa virou 'agendado'", `está em ${e2[0].etapa}`);

  // O SLA de 'agendado' acompanha a data marcada, não um prazo fixo.
  const slaEsperado = new Date(e2[0].data_agendada);
  slaEsperado.setDate(slaEsperado.getDate() + 1);
  if (new Date(e2[0].sla_vence_em) > new Date()) ok("SLA de 'agendado' segue a data do exame");
  else erro("SLA de 'agendado' segue a data do exame");

  // -------------------------------------------------------------------------
  console.log("\nFalta e reentrada no ciclo");
  // -------------------------------------------------------------------------
  await comoUsuario(supUserId);

  await esperaSucesso(
    "supervisor marca falta",
    `select fn_registrar_comparecimento($1, false, 'Chamado de emergência')`,
    [itemId]
  );

  const { rows: e3 } = await client.query(
    `select etapa, compareceu, data_agendada from itens_pendencia where id = $1`,
    [itemId]
  );
  if (e3[0].etapa === "previsto") ok("falta devolve o item para 'previsto'");
  else erro("falta devolve o item para 'previsto'", `está em ${e3[0].etapa}`);
  if (e3[0].data_agendada === null) ok("agendamento antigo foi limpo");
  else erro("agendamento antigo foi limpo");

  // Refaz o caminho até aguardando_documento
  await esperaSucesso("supervisor propõe nova data", `select fn_propor_data($1, current_date + 2, null)`, [itemId]);
  await comoUsuario(perfilQsms.id);
  await esperaSucesso(
    "QSMS reagenda",
    `select fn_agendar($1,'Clínica Vida','Av. Brasil, 100','Dra. Ana', current_date + 2, '09:00', false, null)`,
    [itemId]
  );
  await comoUsuario(supUserId);
  await esperaSucesso(
    "supervisor confirma presença",
    `select fn_registrar_comparecimento($1, true, null)`,
    [itemId]
  );

  const { rows: e4 } = await client.query(`select etapa from itens_pendencia where id = $1`, [itemId]);
  if (e4[0].etapa === "aguardando_documento") ok("presença leva a 'aguardando_documento'");
  else erro("presença leva a 'aguardando_documento'", `está em ${e4[0].etapa}`);

  // -------------------------------------------------------------------------
  console.log("\nConclusão e próximo ciclo");
  // -------------------------------------------------------------------------
  await esperaFalha(
    "supervisor não pode registrar resultado",
    `select fn_concluir_item($1, current_date, 'apto', null, null, null, null)`,
    [itemId],
    "Apenas o QSMS"
  );

  await comoUsuario(perfilQsms.id);

  await esperaFalha(
    "documento com data futura é rejeitado",
    `select fn_concluir_item($1, current_date + 1, 'apto', null, null, null, null)`,
    [itemId],
    "futuro"
  );

  await esperaSucesso(
    "QSMS conclui com resultado apto",
    `select fn_concluir_item($1, current_date, 'apto', null, 'Dra. Ana', null, 'ASO entregue')`,
    [itemId]
  );

  const { rows: e5 } = await client.query(`select etapa, evento_id from itens_pendencia where id = $1`, [itemId]);
  if (e5[0].etapa === "concluido") ok("item concluído");
  else erro("item concluído", `está em ${e5[0].etapa}`);
  if (e5[0].evento_id) ok("evento_requisito vinculado ao item");
  else erro("evento_requisito vinculado ao item");

  const { rows: proximos } = await client.query(
    `select id, etapa, data_vencimento from itens_pendencia
      where colaborador_id = $1 and etapa <> 'concluido'`,
    [colaboradorId]
  );
  if (proximos.length === 1) ok("próximo ciclo aberto automaticamente");
  else erro("próximo ciclo aberto automaticamente", `foram ${proximos.length}`);

  const { rows: periodicidade } = await client.query(
    `select (current_date + interval '12 months')::date as esperado`
  );
  if (
    proximos[0] &&
    new Date(proximos[0].data_vencimento).toISOString().slice(0, 10) ===
      new Date(periodicidade[0].esperado).toISOString().slice(0, 10)
  ) {
    ok("próximo vencimento a 12 meses da data do documento");
  } else {
    erro(
      "próximo vencimento a 12 meses da data do documento",
      `veio ${proximos[0]?.data_vencimento}, esperado ${periodicidade[0].esperado}`
    );
  }

  const { rows: status } = await client.query(
    `select status, dias_restantes from vw_status_colaborador where colaborador_id = $1`,
    [colaboradorId]
  );
  if (status[0]?.status === "ok") ok("colaborador saiu de 'sem_registro' e está regular");
  else erro("colaborador regular após conclusão", `status ${status[0]?.status}`);

  // -------------------------------------------------------------------------
  console.log("\nAuditoria");
  // -------------------------------------------------------------------------
  const { rows: historico } = await client.query(
    `select etapa_de, etapa_para, autor, observacao from historico_item
      where item_id = $1 order by criado_em`,
    [itemId]
  );

  if (historico.length >= 7) ok(`histórico com ${historico.length} transições registradas`);
  else erro("histórico completo", `só ${historico.length} linhas`);

  if (historico.every((h) => h.etapa_para)) ok("toda linha de histórico tem etapa de destino");
  else erro("toda linha de histórico tem etapa de destino");

  const comAutor = historico.filter((h) => h.autor).length;
  if (comAutor >= historico.length - 1) ok("transições têm autor identificado");
  else erro("transições têm autor identificado", `${comAutor} de ${historico.length}`);

  const falta = historico.find((h) => h.observacao?.includes("emergência"));
  if (falta) ok("observação da falta foi gravada no histórico");
  else erro("observação da falta foi gravada no histórico");

  // -------------------------------------------------------------------------
  console.log("\nInapto não gera conformidade");
  // -------------------------------------------------------------------------
  const proximoId = proximos[0].id;
  await comoUsuario(supUserId);
  await client.query(`select fn_propor_data($1, current_date + 1, null)`, [proximoId]);
  await comoUsuario(perfilQsms.id);
  await client.query(
    `select fn_agendar($1,'Clínica Vida','Av. Brasil','Dra. Ana', current_date + 1, '08:00', false, null)`,
    [proximoId]
  );
  await comoUsuario(supUserId);
  await client.query(`select fn_registrar_comparecimento($1, true, null)`, [proximoId]);
  await comoUsuario(perfilQsms.id);

  await esperaSucesso(
    "QSMS registra resultado inapto",
    `select fn_concluir_item($1, current_date, 'inapto', null, null, null, 'Restrição médica')`,
    [proximoId]
  );

  const { rows: aposInapto } = await client.query(
    `select count(*)::int as n from itens_pendencia where colaborador_id = $1 and etapa <> 'concluido'`,
    [colaboradorId]
  );
  if (aposInapto[0].n === 0) ok("inapto não abre ciclo novo");
  else erro("inapto não abre ciclo novo", `abriu ${aposInapto[0].n}`);

  const { rows: statusInapto } = await client.query(
    `select status from vw_status_colaborador where colaborador_id = $1`,
    [colaboradorId]
  );
  if (statusInapto[0]?.status === "ok") {
    ok("último ASO apto ainda vale — colaborador segue regular até vencer");
  } else {
    erro("status após inapto", `veio ${statusInapto[0]?.status}`);
  }

  // -------------------------------------------------------------------------
  // Limpeza
  // -------------------------------------------------------------------------
  await client.query(`select set_config('request.jwt.claims', null, false)`);
  await client.query(`delete from colaboradores where matricula = 999999`);
  await client.query(`delete from perfis where id = $1`, [supUserId]);
  await client.query(`delete from auth.users where id = $1`, [supUserId]);
  await client.query(`delete from supervisores where email = 'teste-giro@exemplo.invalido'`);

  console.log(`\n${passou} passaram, ${falhou} falharam.`);
  if (falhou > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nErro no teste:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
