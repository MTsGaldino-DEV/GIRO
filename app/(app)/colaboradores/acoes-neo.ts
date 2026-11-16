"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { exigirOperador } from "@/lib/perfil";
import { ErroNeo, listarColaboradoresNeo } from "@/lib/neo";
import { executarSincronizacao, type RelatorioSincronizacao } from "@/lib/sincronizar-neo";

export type ResultadoNeo = { ok: true; mensagem: string } | { ok: false; erro: string };

const MENSAGEM_FALHA = "Não foi possível atualizar agora. Tente de novo em instantes.";

/** Texto curto para o operador: o que mudou, sem nome nem CPF de ninguém. */
function resumoParaOperador(r: RelatorioSincronizacao): string {
  const partes: string[] = [];
  if (r.ligados_novos > 0) partes.push(`${r.ligados_novos} ligado${r.ligados_novos > 1 ? "s" : ""} à NEO`);
  if (r.atualizados > 0) partes.push(`${r.atualizados} atualizado${r.atualizados > 1 ? "s" : ""}`);
  if (r.divergencias.length > 0) {
    partes.push(`${r.divergencias.length} divergência${r.divergencias.length > 1 ? "s" : ""} a conferir`);
  }
  return partes.length > 0
    ? `Cadastro atualizado a partir da NEO: ${partes.join(", ")}.`
    : "Cadastro já estava em dia com a NEO.";
}

/** Texto para o operador: o aviso da NEO ou da trava da primeira carga (já em português) ou a frase genérica. */
function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroNeo) return e.message;
  if (e instanceof Error && e.message.startsWith("A primeira carga")) return e.message;
  return MENSAGEM_FALHA;
}

function revalidar() {
  revalidatePath("/colaboradores");
  revalidatePath("/qsms/supervisores");
}

/**
 * "Atualizar agora": qualquer operador puxa o cadastro da NEO sem esperar o cron
 * das 08:30. A ação confere o operador e a função do banco (só service role) grava
 * a auditoria em nome dele (p_usuario_id). Falha da NEO não quebra a tela: devolve
 * o aviso em português.
 */
export async function atualizarAgoraNeo(): Promise<ResultadoNeo> {
  const perfil = await exigirOperador();
  try {
    const relatorio = await executarSincronizacao(criarClienteAdmin(), {
      aplicar: true,
      origem: "manual",
      usuarioId: perfil.id,
      listar: listarColaboradoresNeo,
    });
    revalidar();
    return { ok: true, mensagem: resumoParaOperador(relatorio) };
  } catch (e) {
    revalidar(); // a falha também fica em neo_sincronizacoes e muda o aviso da tela
    return { ok: false, erro: mensagemDoErro(e) };
  }
}

const esquemaVinculoNome = z.object({
  texto: z.string().trim().min(1, "Informe o nome como aparece na NEO."),
  supervisorId: z.string().uuid("Escolha o supervisor."),
});

/**
 * Liga um nome de supervisor escrito na NEO a um supervisor do GIRO (só QSMS e
 * admin) e já sincroniza, para a equipe aparecer na hora. O vínculo vale também
 * para as próximas sincronizações.
 */
export async function vincularNomeSupervisor(
  textoNeo: string,
  supervisorId: string
): Promise<ResultadoNeo> {
  const perfil = await exigirOperador();
  if (perfil.papel !== "qsms" && perfil.papel !== "admin") {
    return { ok: false, erro: "Apenas QSMS ou administrador pode vincular nomes de supervisor." };
  }

  const analise = esquemaVinculoNome.safeParse({ texto: textoNeo, supervisorId });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fn_vincular_apelido_supervisor", {
    p_texto: analise.data.texto,
    p_supervisor_id: analise.data.supervisorId,
  });
  if (error) return { ok: false, erro: error.message };

  try {
    await executarSincronizacao(criarClienteAdmin(), {
      aplicar: true,
      origem: "manual",
      usuarioId: perfil.id,
      listar: listarColaboradoresNeo,
    });
  } catch (e) {
    revalidar();
    return { ok: true, mensagem: `Nome vinculado, mas a atualização falhou: ${mensagemDoErro(e)}` };
  }

  revalidar();
  return { ok: true, mensagem: "Nome vinculado e equipes atualizadas." };
}
