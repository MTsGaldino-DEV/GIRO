// Cria o primeiro acesso (admin ou qsms). Sem isso ninguém entra: o login
// exige uma linha ativa em `perfis`, e a tela que cadastra os demais usuários
// é protegida por perfil admin — alguém precisa existir antes dela.
//
//   node scripts/criar-perfil.mjs admin fulano@engelmig.com.br "Fulano de Tal" SenhaTemporaria123
//
// Para supervisor, prefira a tela /admin/usuarios ou /qsms/supervisores — elas
// criam o registro em `supervisores` (ou selecionam um existente) e o perfil
// de uma vez só.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarClienteAdmin } from "./lib/supabase.mjs";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const [papel, email, nomeArg, senhaArg] = process.argv.slice(2);

if (!papel || !email || !nomeArg || !senhaArg || !["qsms", "admin"].includes(papel)) {
  console.error(
    'Uso: node scripts/criar-perfil.mjs <qsms|admin> <email> "<Nome>" <senha-temporaria (8+ chars)>'
  );
  process.exit(1);
}

if (senhaArg.length < 8) {
  console.error("A senha temporária precisa ter ao menos 8 caracteres.");
  process.exit(1);
}

const supabase = criarClienteAdmin();
const emailNormalizado = email.trim().toLowerCase();

async function main() {
  const { data: lista, error: erroLista } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (erroLista) {
    console.error("Falha ao listar usuários:", erroLista.message);
    process.exit(1);
  }

  let usuario = lista.users.find((u) => u.email?.toLowerCase() === emailNormalizado);

  if (usuario) {
    console.log(`Usuário já existe: ${usuario.id}. Atualizando a senha.`);
    await supabase.auth.admin.updateUserById(usuario.id, { password: senhaArg });
  } else {
    // email_confirm: não há fluxo de confirmação por e-mail a validar; o
    // acesso é liberado direto, com senha definida aqui.
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailNormalizado,
      password: senhaArg,
      email_confirm: true,
    });
    if (error) {
      console.error("Falha ao criar usuário:", error.message);
      process.exit(1);
    }
    usuario = data.user;
    console.log(`Usuário criado: ${usuario.id}`);
  }

  const { error: erroPerfil } = await supabase.from("perfis").upsert(
    { id: usuario.id, email: emailNormalizado, nome: nomeArg, papel, supervisor_id: null, ativo: true },
    { onConflict: "id" }
  );

  if (erroPerfil) {
    console.error("Falha ao gravar o perfil:", erroPerfil.message);
    process.exit(1);
  }

  console.log(`\nPerfil ${papel} pronto para ${emailNormalizado}.`);
  console.log("Entre em /login com esse e-mail e a senha informada.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
