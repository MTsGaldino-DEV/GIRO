// Seed de dados fictícios para ambiente de teste/demonstração.
//
// Substitui completamente qualquer colaborador e supervisor reais por 20
// colaboradores fictícios (ajuste ao mvp.md, seção 2) cobrindo todos os
// status do semáforo e todos os estados da máquina da Fase 1 — inclusive os
// dois "pontos cegos": sem data de referência, e sem processo nenhum. Cria
// também as 3 contas de teste (admin, qsms, supervisor) com senha temporária.
//
// As datas são relativas à execução (hoje ± N dias): rodar este script em
// dias diferentes continua produzindo os status corretos.
//
//   node scripts/seed-teste.mjs
//
// Destrutivo por design: apaga todos os colaboradores e supervisores
// existentes antes de popular os fictícios. Nunca rodar contra uma base com
// dado real que precise ser preservado.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, subMonths, format } from "date-fns";
import { criarClienteAdmin } from "./lib/supabase.mjs";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const supabase = criarClienteAdmin();
const SENHA_TESTE = "Giro@Teste123";

const hoje = new Date();
const iso = (d) => format(d, "yyyy-MM-dd");
/** Data do documento que produz o vencimento em `offsetDias` a partir de hoje. */
const dataDocumentoPara = (offsetDias) => iso(subMonths(addDays(hoje, offsetDias), 12));

// -----------------------------------------------------------------------------
// CPFs de dígitos repetidos: inválidos pelo checksum, nunca colidem com pessoa
// real. Matrículas na faixa 90000+, fora da faixa real (1-261 na UEN 211).
// -----------------------------------------------------------------------------
const COLABORADORES = [
  { matricula: 90001, nome: "Carlos Eduardo Ramos", cargo: "Instalador Reparador Rede I", cpf: "11111111111", estagio: "concluido", offset: 90 },
  { matricula: 90002, nome: "Juliana Aparecida Ferreira", cargo: "Instalador Serviços Comerc I", cpf: "22222222222", estagio: "concluido", offset: 50 },
  { matricula: 90003, nome: "Renato Costa Almeida", cargo: "Instalador Reparador Rede III", cpf: "33333333333", estagio: "agendado", offset: 25 },
  { matricula: 90004, nome: "Patrícia Souza Lima", cargo: "Instalador Reparador Rede II", cpf: "44444444444", estagio: "data_proposta", offset: 10 },
  { matricula: 90005, nome: "Fábio Henrique Barros", cargo: "Instalador Reparador Rede IV", cpf: "55555555555", estagio: "aguardando_documento", offset: -5 },
  { matricula: 90006, nome: "Marcelo Vinícius Teixeira", cargo: "Instalador Serviços Comerc II", cpf: "66666666666", estagio: "sem_registro" },
  { matricula: 90007, nome: "Ana Beatriz Nogueira", cargo: "Assistente Administrativo III", cpf: "77777777777", estagio: "sem_registro" },
  { matricula: 90008, nome: "Diego Martins Rocha", cargo: "Supervisor Comercial I", cpf: "88888888888", estagio: "concluido", offset: 120 },
  { matricula: 90009, nome: "Bruna Castro Pereira", cargo: "Instalador Reparador Rede V", cpf: "99999999999", estagio: "agendado", offset: 20 },
  { matricula: 90010, nome: "Thiago Nunes Cardoso", cargo: "Instalador Reparador Rede I", cpf: "12121212121", estagio: "aguardando_documento", offset: -40 },
  { matricula: 90011, nome: "Camila Rezende Pinto", cargo: "Instalador Serviços Comerc III", cpf: "23232323232", estagio: "concluido", offset: 65 },
  { matricula: 90012, nome: "Rodrigo Almeida Vasconcelos", cargo: "Instalador Reparador Rede III", cpf: "34343434343", estagio: "agendado", offset: 14 },
  { matricula: 90013, nome: "Fernanda Lopes Guimarães", cargo: "Assistente Administrativo V", cpf: "45454545454", estagio: "sem_registro" },
  { matricula: 90014, nome: "Vinícius Tavares Correia", cargo: "Instalador Reparador Rede II", cpf: "56565656565", estagio: "data_proposta", offset: 5 },
  { matricula: 90015, nome: "Igor Barbosa Siqueira", cargo: "Supervisor Comercial II", cpf: "67676767676", estagio: "concluido", offset: 100 },
  // Fase 1: os estados novos da máquina (plano de ação, seção 6.2).
  { matricula: 90016, nome: "Leandro Pires Andrade", cargo: "Instalador Reparador Rede I", cpf: "78787878787", estagio: "data_solicitada", offset: 35 },
  { matricula: 90017, nome: "Simone Cardoso Batista", cargo: "Instalador Serviços Comerc I", cpf: "89898989898", estagio: "enviado_clinica", offset: 18 },
  { matricula: 90018, nome: "Wagner Duarte Machado", cargo: "Instalador Reparador Rede IV", cpf: "10101010101", estagio: "inapto_em_tratativa", offset: -12 },
  { matricula: 90019, nome: "Elaine Moreira Sampaio", cargo: "Assistente Administrativo II", cpf: "13131313131", estagio: "cancelado", offset: 70 },
  // Sem vigência e fora de qualquer processo: o ponto cego puro (semáforo preto).
  { matricula: 90020, nome: "Otávio Ribeiro Fontes", cargo: "Auxiliar de Serviços Gerais", cpf: "14141414141", estagio: "sem_processo" },
];

async function limpar() {
  console.log("Apagando colaboradores e supervisores existentes…");

  // Perfis de supervisor apontam para `supervisores` com on delete set null, e
  // a constraint perfil_supervisor_precisa_vinculo proíbe supervisor_id nulo
  // em papel 'supervisor'. Sem apagar os perfis antes, a segunda execução do
  // seed falha ao limpar a tabela. Perfis qsms e admin ficam intactos.
  const { error: erroPerfis } = await supabase.from("perfis").delete().eq("papel", "supervisor");
  if (erroPerfis) throw new Error(`Falha ao limpar perfis de supervisor: ${erroPerfis.message}`);

  // itens_pendencia, eventos_requisito, ausencias e historico_item caem em
  // cascata por FK. alertas_enviados também, via item_id ou supervisor_id.
  const { error: erroCol } = await supabase.from("colaboradores").delete().not("id", "is", null);
  if (erroCol) throw new Error(`Falha ao apagar colaboradores: ${erroCol.message}`);

  const { error: erroSup } = await supabase.from("supervisores").delete().not("id", "is", null);
  if (erroSup) throw new Error(`Falha ao apagar supervisores: ${erroSup.message}`);
}

async function obterTipoRequisito() {
  const { data, error } = await supabase
    .from("tipos_requisito")
    .select("id")
    .eq("nome", "ASO Periódico")
    .single();
  if (error || !data) {
    throw new Error(
      "Tipo de requisito 'ASO Periódico' não encontrado. Rode `npm run db:push` antes do seed."
    );
  }
  return data.id;
}

async function criarSupervisorFicticio() {
  const { data, error } = await supabase
    .from("supervisores")
    .insert({ nome: "Supervisor de Teste", email: "teste.supervisor@giro.local", ativo: true })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar supervisor fictício: ${error.message}`);
  return data.id;
}

async function criarColaboradores(supervisorId, tipoRequisitoId) {
  const linhas = COLABORADORES.map((c) => ({
    matricula: c.matricula,
    nome: c.nome,
    cpf: c.cpf,
    cargo: c.cargo,
    uen: "211",
    local: "Multifuncional Gov. Valadares",
    polo: "Gov. Valadares",
    situacao: "trabalhando",
    supervisor_id: supervisorId,
    ativo: true,
  }));

  const { data, error } = await supabase.from("colaboradores").insert(linhas).select("id, matricula");
  if (error) throw new Error(`Falha ao criar colaboradores: ${error.message}`);

  const idPorMatricula = new Map(data.map((c) => [c.matricula, c.id]));

  for (const c of COLABORADORES) {
    const colaboradorId = idPorMatricula.get(c.matricula);
    await criarHistoricoDoColaborador(colaboradorId, tipoRequisitoId, c);
  }
}

async function criarHistoricoDoColaborador(colaboradorId, tipoRequisitoId, c) {
  // Sem evento e sem item: aparece na view só pelo cross join, como os ~177
  // colaboradores reais sem data de referência. É o caso que o GIRO existe
  // para tornar visível, então precisa estar no seed.
  if (c.estagio === "sem_processo") return;

  if (c.estagio === "sem_registro") {
    // Sem evento nenhum: a view classifica como sem_registro sozinha. Item
    // entra na fila imediatamente, como o cron faria.
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "previsto",
      data_vencimento: iso(hoje),
    });
    return;
  }

  const dataDocumento = dataDocumentoPara(c.offset);
  const { data: evento, error: erroEvento } = await supabase
    .from("eventos_requisito")
    .insert({
      colaborador_id: colaboradorId,
      tipo_requisito_id: tipoRequisitoId,
      data_documento: dataDocumento,
      resultado: "apto",
      clinica: "Clínica Modelo",
      medico: "Dr. João Teste",
    })
    .select("id")
    .single();
  if (erroEvento) throw new Error(`Falha ao criar evento de ${c.nome}: ${erroEvento.message}`);

  const vencimento = iso(addDays(hoje, c.offset));

  if (c.estagio === "inapto_em_tratativa") {
    // Exame feito, resultado inapto: o ciclo NÃO foi cumprido. O evento fica
    // registrado, mas não conta como conformidade — a view ignora resultado
    // inapto —, então o colaborador segue vencido e o item fica travado.
    await supabase.from("eventos_requisito").insert({
      colaborador_id: colaboradorId,
      tipo_requisito_id: tipoRequisitoId,
      data_realizado: iso(addDays(hoje, -20)),
      data_documento: iso(addDays(hoje, -18)),
      resultado: "inapto",
      clinica: "ENGESEG",
      medico: "Dr. João Teste",
    });

    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "inapto_em_tratativa",
      data_vencimento: vencimento,
      desfecho: "fez_inapto",
      clinica: "ENGESEG",
      data_agendada: iso(addDays(hoje, -20)),
      hora_agendada: "09:00",
      compareceu: true,
    });
    return;
  }

  if (c.estagio === "cancelado") {
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "cancelado",
      data_vencimento: vencimento,
    });
    return;
  }

  if (c.estagio === "data_solicitada") {
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "data_solicitada",
      data_vencimento: vencimento,
    });
    return;
  }

  if (c.estagio === "enviado_clinica") {
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "enviado_clinica",
      data_vencimento: vencimento,
      data_liberacao_proposta: iso(addDays(hoje, -3)),
      clinica: "ENGESEG",
      endereco: "Rua Fictícia, 100 — Gov. Valadares",
      medico: "Dr. João Teste",
      data_agendada: iso(hoje),
      hora_agendada: "08:00",
      dados_informados_em: new Date(hoje.getTime() - 86400000).toISOString(),
    });
    return;
  }

  if (c.estagio === "concluido") {
    // Só abre item se o cron diário já teria criado um (vencimento em até 90 dias).
    if (c.offset <= 90) {
      await inserirItem(colaboradorId, tipoRequisitoId, { etapa: "previsto", data_vencimento: vencimento });
    }
    return;
  }

  if (c.estagio === "agendado") {
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "agendado",
      data_vencimento: vencimento,
      data_liberacao_proposta: iso(addDays(hoje, -5)),
      clinica: "ENGESEG",
      endereco: "Rua Fictícia, 100 — Gov. Valadares",
      medico: "Dr. João Teste",
      data_agendada: iso(addDays(hoje, Math.min(c.offset - 2, 5))),
      hora_agendada: "09:00",
      evento_id: evento.id,
    });
    return;
  }

  if (c.estagio === "data_proposta") {
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "data_proposta",
      data_vencimento: vencimento,
      data_liberacao_proposta: iso(addDays(hoje, 2)),
    });
    return;
  }

  if (c.estagio === "aguardando_documento") {
    await inserirItem(colaboradorId, tipoRequisitoId, {
      etapa: "aguardando_documento",
      data_vencimento: vencimento,
      clinica: "Clínica Modelo",
      endereco: "Rua Fictícia, 100 — Gov. Valadares",
      medico: "Dr. João Teste",
      data_agendada: iso(addDays(hoje, c.offset - 3)),
      hora_agendada: "09:00",
      compareceu: true,
      desfecho: "fez_apto",
      dados_informados_em: new Date(hoje.getTime() - 3 * 86400000).toISOString(),
    });
  }
}

async function inserirItem(colaboradorId, tipoRequisitoId, campos) {
  const { error } = await supabase.from("itens_pendencia").insert({
    colaborador_id: colaboradorId,
    tipo_requisito_id: tipoRequisitoId,
    ...campos,
  });
  if (error) throw new Error(`Falha ao criar item de pendência: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Contas de teste
// -----------------------------------------------------------------------------
async function criarConta({ email, nome, papel, supervisorId }) {
  const { data: lista, error: erroLista } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (erroLista) throw new Error(`Falha ao listar usuários: ${erroLista.message}`);

  let usuarioId = lista.users.find((u) => u.email?.toLowerCase() === email)?.id;

  if (usuarioId) {
    await supabase.auth.admin.updateUserById(usuarioId, { password: SENHA_TESTE });
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: SENHA_TESTE,
      email_confirm: true,
    });
    if (error) throw new Error(`Falha ao criar conta ${email}: ${error.message}`);
    usuarioId = data.user.id;
  }

  const { error: erroPerfil } = await supabase.from("perfis").upsert(
    { id: usuarioId, email, nome, papel, supervisor_id: supervisorId ?? null, ativo: true },
    { onConflict: "id" }
  );
  if (erroPerfil) throw new Error(`Falha ao gravar perfil de ${email}: ${erroPerfil.message}`);
}

async function main() {
  await limpar();

  const tipoRequisitoId = await obterTipoRequisito();
  const supervisorId = await criarSupervisorFicticio();

  console.log(`Criando ${COLABORADORES.length} colaboradores fictícios…`);
  await criarColaboradores(supervisorId, tipoRequisitoId);

  console.log("Criando contas de teste…");
  await criarConta({ email: "teste.admin@giro.local", nome: "Admin de Teste", papel: "admin" });
  await criarConta({ email: "teste.qsms@giro.local", nome: "QSMS de Teste", papel: "qsms" });
  await criarConta({
    email: "teste.supervisor@giro.local",
    nome: "Supervisor de Teste",
    papel: "supervisor",
    supervisorId,
  });

  console.log("\nSeed concluído.");
  console.log(`Senha temporária das 3 contas: ${SENHA_TESTE}`);
  console.log("  teste.admin@giro.local");
  console.log("  teste.qsms@giro.local");
  console.log("  teste.supervisor@giro.local (vê a equipe fictícia inteira)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
