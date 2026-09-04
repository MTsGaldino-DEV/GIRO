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
  // Ordem importa: perfis.supervisor_id é ON DELETE SET NULL, e a constraint
  // perfil_supervisor_precisa_vinculo proíbe nulo em papel 'supervisor'. Apagar
  // supervisores antes do perfil deixa a limpeza de uma execução interrompida
  // impossível de refazer.
  await client.query(`delete from colaboradores where matricula = 999999`);
  await client.query(`delete from perfis where email = 'teste-giro-user@exemplo.invalido'`);
  await client.query(`delete from auth.users where email = 'teste-giro-user@exemplo.invalido'`);
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
    `select fn_agendar($1, null, 'Clinica X','Rua Y','Dr. Z', current_date + 5, '08:00', false, null)`,
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
    'não está aguardando data'
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
    `select fn_agendar($1, null, 'Clinica X','Rua Y','Dr. Z', current_date + 5, '08:00', false, null)`,
    [itemId],
    "ausência"
  );

  await client.query(`delete from ausencias where colaborador_id = $1`, [colaboradorId]);

  await esperaFalha(
    "agendar sem clínica é rejeitado",
    `select fn_agendar($1, null, '','Rua Y','Dr. Z', current_date + 5, '08:00', false, null)`,
    [itemId],
    "Informe a clínica"
  );

  await esperaSucesso(
    "QSMS agenda com a clínica",
    `select fn_agendar($1, null, 'Clínica Vida','Av. Brasil, 100','Dra. Ana', current_date + 5, '08:00', true, null)`,
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
  if (e3[0].etapa === "data_solicitada") ok("falta devolve o item para 'data_solicitada'");
  else erro("falta devolve o item para 'data_solicitada'", `está em ${e3[0].etapa}`);
  if (e3[0].data_agendada === null) ok("agendamento antigo foi limpo");
  else erro("agendamento antigo foi limpo");

  // Refaz o caminho até aguardando_documento
  await esperaSucesso("supervisor propõe nova data", `select fn_propor_data($1, current_date + 2, null)`, [itemId]);
  await comoUsuario(perfilQsms.id);
  await esperaSucesso(
    "QSMS reagenda",
    `select fn_agendar($1, null, 'Clínica Vida','Av. Brasil, 100','Dra. Ana', current_date + 2, '09:00', false, null)`,
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
    `select fn_agendar($1, null, 'Clínica Vida','Av. Brasil','Dra. Ana', current_date + 1, '08:00', false, null)`,
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

  const { rows: eInapto } = await client.query(
    `select etapa, desfecho, evento_id from itens_pendencia where id = $1`,
    [proximoId]
  );
  if (eInapto[0].etapa === "inapto_em_tratativa") ok("inapto trava o item em 'inapto_em_tratativa'");
  else erro("inapto trava o item", `está em ${eInapto[0].etapa}`);
  if (eInapto[0].evento_id) ok("evento do exame inapto foi registrado mesmo sem conformidade");
  else erro("evento do exame inapto foi registrado");

  const { rows: novosAposInapto } = await client.query(
    `select count(*)::int as n from itens_pendencia
      where colaborador_id = $1 and etapa not in ('concluido','cancelado','inapto_em_tratativa')`,
    [colaboradorId]
  );
  if (novosAposInapto[0].n === 0) ok("inapto não abre ciclo novo");
  else erro("inapto não abre ciclo novo", `abriu ${novosAposInapto[0].n}`);

  await esperaSucesso(
    "geração automática roda sem duplicar o item travado",
    `select * from fn_gerar_itens_pendentes()`
  );
  const { rows: aindaTravado } = await client.query(
    `select count(*)::int as n from itens_pendencia
      where colaborador_id = $1 and etapa not in ('concluido','cancelado')`,
    [colaboradorId]
  );
  if (aindaTravado[0].n === 1) ok("item travado continua ocupando o ciclo aberto");
  else erro("item travado ocupa o ciclo aberto", `são ${aindaTravado[0].n}`);

  await esperaFalha(
    "não há saída do inapto por fluxo normal",
    `select fn_propor_data($1, current_date + 3, null)`,
    [proximoId],
    "aguardando data"
  );

  await esperaFalha(
    "encerrar inapto sem descrever a resolução é rejeitado",
    `select fn_encerrar_inapto($1, '  ')`,
    [proximoId],
    "resolvido"
  );

  await esperaSucesso(
    "QSMS encerra a tratativa com motivo",
    `select fn_encerrar_inapto($1, 'Dispensado — tratativa com o RH')`,
    [proximoId]
  );

  const { rows: eEncerrado } = await client.query(
    `select etapa from itens_pendencia where id = $1`,
    [proximoId]
  );
  if (eEncerrado[0].etapa === "cancelado") ok("tratativa encerrada leva o item a 'cancelado'");
  else erro("tratativa encerrada leva a 'cancelado'", `está em ${eEncerrado[0].etapa}`);

  // -------------------------------------------------------------------------
  console.log("\nFluxo completo da Fase 1 (QSMS conduz, supervisor sem login)");
  // -------------------------------------------------------------------------
  // O cancelamento libera a chave de ciclo aberto. Aqui o item novo é criado à
  // mão porque o colaborador acabou de ficar regular (ASO apto de hoje), então
  // fn_gerar_itens_pendentes corretamente não geraria nada.
  const { rows: novoCiclo } = await esperaSucesso(
    "novo ciclo pode ser aberto depois do cancelamento",
    `insert into itens_pendencia (colaborador_id, tipo_requisito_id, data_vencimento, etapa)
     values ($1, $2, current_date + 30, 'previsto') returning id`,
    [colaboradorId, tipoId]
  );
  const fase1Id = novoCiclo[0].id;

  const { rows: clinica } = await client.query(`select id from clinicas where nome = 'ENGESEG'`);
  const clinicaId = clinica[0].id;

  await esperaSucesso(
    "passo 2 · QSMS solicita data ao supervisor",
    `select fn_solicitar_data($1, 'WhatsApp', null)`,
    [fase1Id]
  );

  await esperaFalha(
    "passo 3 · registrar data sem dizer em nome de quem é rejeitado",
    `select fn_registrar_data_supervisor($1, current_date + 4, '', null)`,
    [fase1Id],
    "em nome de qual supervisor"
  );

  await esperaSucesso(
    "passo 3 · QSMS registra a data em nome do supervisor",
    `select fn_registrar_data_supervisor($1, current_date + 4, 'Supervisor de Teste', null)`,
    [fase1Id]
  );

  const { rows: emNome } = await client.query(
    `select em_nome_de, autor from historico_item
      where item_id = $1 and etapa_para = 'data_proposta' order by criado_em desc limit 1`,
    [fase1Id]
  );
  if (emNome[0]?.em_nome_de === "Supervisor de Teste" && emNome[0]?.autor === perfilQsms.id) {
    ok("auditoria separa quem lançou de quem decidiu");
  } else {
    erro("auditoria separa quem lançou de quem decidiu", JSON.stringify(emNome[0]));
  }

  await esperaSucesso(
    "passo 4 · devolver ao supervisor quando a clínica não tem vaga",
    `select fn_devolver_ao_supervisor($1, 'Clínica sem vaga nessa semana')`,
    [fase1Id]
  );

  const { rows: devolvido } = await client.query(
    `select etapa from itens_pendencia where id = $1`,
    [fase1Id]
  );
  if (devolvido[0].etapa === "data_solicitada") ok("devolução volta para 'data_solicitada'");
  else erro("devolução volta para 'data_solicitada'", `está em ${devolvido[0].etapa}`);

  await client.query(
    `select fn_registrar_data_supervisor($1, current_date + 6, 'Supervisor de Teste', null)`,
    [fase1Id]
  );

  await esperaSucesso(
    "passo 4 · agendar usando a clínica do cadastro",
    `select fn_agendar($1, $2, null, null, 'Dra. Ana', current_date + 6, '08:00', false, null)`,
    [fase1Id, clinicaId]
  );

  const { rows: agendado } = await client.query(
    `select clinica, clinica_id, dados_informados_em from itens_pendencia where id = $1`,
    [fase1Id]
  );
  if (agendado[0].clinica === "ENGESEG") ok("nome da clínica veio do cadastro");
  else erro("nome da clínica veio do cadastro", agendado[0].clinica);
  if (agendado[0].dados_informados_em === null) ok("agendar não marca os dados como informados");
  else erro("agendar não marca os dados como informados");

  await esperaFalha(
    "passo 6 · enviar à clínica exige item agendado",
    `select fn_enviar_clinica($1, null)`,
    [itemId],
    "não está agendado"
  );

  await esperaSucesso(
    "passo 5 · QSMS informa clínica, horário e orientações",
    `select fn_informar_dados($1, 'Supervisor de Teste', null)`,
    [fase1Id]
  );

  const { rows: informado } = await client.query(
    `select etapa, dados_informados_em from itens_pendencia where id = $1`,
    [fase1Id]
  );
  if (informado[0].dados_informados_em) ok("carimbo de 'dados informados' gravado");
  else erro("carimbo de 'dados informados' gravado");
  if (informado[0].etapa === "agendado") ok("informar dados não muda a etapa");
  else erro("informar dados não muda a etapa", informado[0].etapa);

  await esperaSucesso(
    "passo 6 · colaborador enviado à clínica",
    `select fn_enviar_clinica($1, null)`,
    [fase1Id]
  );

  await esperaFalha(
    "desfecho inválido é rejeitado",
    `select fn_registrar_desfecho($1, 'foi_embora', null)`,
    [fase1Id],
    "Desfecho inválido"
  );

  await esperaSucesso(
    "passo 7 · desfecho 'foi mas não fez tudo'",
    `select fn_registrar_desfecho($1, 'incompleto', null)`,
    [fase1Id]
  );

  const { rows: incompleto } = await client.query(
    `select etapa, desfecho, data_agendada, dados_informados_em from itens_pendencia where id = $1`,
    [fase1Id]
  );
  if (incompleto[0].etapa === "data_solicitada") ok("desfecho parcial reabre com o supervisor");
  else erro("desfecho parcial reabre com o supervisor", incompleto[0].etapa);
  if (incompleto[0].data_agendada === null && incompleto[0].dados_informados_em === null) {
    ok("agendamento antigo foi limpo na reabertura");
  } else {
    erro("agendamento antigo foi limpo na reabertura");
  }

  // Segunda volta, agora até o fim.
  await client.query(
    `select fn_registrar_data_supervisor($1, current_date + 2, 'Supervisor de Teste', null)`,
    [fase1Id]
  );
  await client.query(
    `select fn_agendar($1, $2, null, null, 'Dra. Ana', current_date + 2, '08:00', false, null)`,
    [fase1Id, clinicaId]
  );
  await client.query(`select fn_informar_dados($1, null, null)`, [fase1Id]);
  await client.query(`select fn_enviar_clinica($1, null)`, [fase1Id]);

  await esperaSucesso(
    "passo 7 · desfecho 'fez e apto'",
    `select fn_registrar_desfecho($1, 'fez_apto', null)`,
    [fase1Id]
  );

  const { rows: apto } = await client.query(
    `select etapa from itens_pendencia where id = $1`,
    [fase1Id]
  );
  if (apto[0].etapa === "aguardando_documento") ok("apto segue para o documento");
  else erro("apto segue para o documento", apto[0].etapa);

  await esperaSucesso(
    "passo 8 · recebido e inserido no GESET",
    `select fn_concluir_item($1, current_date, 'apto', current_date - 3, 'Dra. Ana', null, null)`,
    [fase1Id]
  );

  const { rows: fechado } = await client.query(
    `select etapa, desfecho from itens_pendencia where id = $1`,
    [fase1Id]
  );
  if (fechado[0].etapa === "concluido") ok("ciclo finalizado");
  else erro("ciclo finalizado", fechado[0].etapa);

  // O relógio parte da data de REALIZAÇÃO do exame (plano, seção 7), não da
  // data do documento — aqui as duas são diferentes de propósito.
  const { rows: reinicio } = await client.query(
    `select data_vencimento, data_limite_marcar from itens_pendencia
      where colaborador_id = $1 and etapa not in ('concluido','cancelado')`,
    [colaboradorId]
  );
  const { rows: esperadoReinicio } = await client.query(
    `select ((current_date - 3) + interval '12 months')::date as d`
  );
  const iguais =
    reinicio[0] &&
    new Date(reinicio[0].data_vencimento).toISOString().slice(0, 10) ===
      new Date(esperadoReinicio[0].d).toISOString().slice(0, 10);
  if (iguais) ok("próximo vencimento parte da data de realização do exame");
  else {
    erro(
      "próximo vencimento parte da data de realização",
      `veio ${reinicio[0]?.data_vencimento}, esperado ${esperadoReinicio[0].d}`
    );
  }

  const dias =
    (new Date(reinicio[0].data_vencimento) - new Date(reinicio[0].data_limite_marcar)) / 86400000;
  if (dias === 7) ok("data limite de marcação é o vencimento menos 7 dias");
  else erro("data limite de marcação", `diferença de ${dias} dias`);

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
