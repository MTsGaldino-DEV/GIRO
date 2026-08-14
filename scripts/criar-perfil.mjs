// Cria o primeiro acesso QSMS. Sem isso ninguém entra: o login exige uma linha
// ativa em `perfis`, e a tela que cadastra perfis é protegida por perfil QSMS.
//
//   node scripts/criar-perfil.mjs qsms fulano@engelmig.com.br "Fulano de Tal"
//
// Para supervisor, prefira a tela /qsms/supervisores — ela cria o registro em
// `supervisores` e o perfil de uma vez só.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarClienteAdmin } from "./lib/supabase.mjs";
import { carregarEnv } from "./lib/env.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(raiz);

const [papel, email, ...restoNome] = process.argv.slice(2);
const nome = restoNome.join(" ") || null;

if (!papel || !email || !["qsms", "supervisor"].includes(papel)) {
  console.error('Uso: node scripts/criar-perfil.mjs <qsms|supervisor> <email> ["Nome"]');
  process.exit(1);
}

if (papel === "supervisor") {
  console.error(
    "Perfil de supervisor precisa estar vinculado a um registro em `supervisores`.\n" +
      "Use a tela /qsms/supervisores, que faz as duas coisas de uma vez."
  );
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
    console.log(`Usuário já existe: ${usuario.id}`);
  } else {
    // email_confirm: o acesso é por magic link; não há e-mail de confirmação
    // a validar, e sem isso o primeiro login falha.
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailNormalizado,
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
    { id: usuario.id, email: emailNormalizado, nome, papel, supervisor_id: null, ativo: true },
    { onConflict: "id" }
  );

  if (erroPerfil) {
    console.error("Falha ao gravar o perfil:", erroPerfil.message);
    process.exit(1);
  }

  console.log(`\nPerfil ${papel} pronto para ${emailNormalizado}.`);
  console.log("Entre em /login, informe esse e-mail e siga o link recebido.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
