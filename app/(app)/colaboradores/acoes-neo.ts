"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
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

function revalidar() {
  revalidatePath("/colaboradores");
  revalidatePath("/qsms/supervisores");
}

/**
 * "Atualizar agora": qualquer operador puxa o cadastro da NEO sem esperar o cron
 * das 08:30. Usa a sessão do próprio usuário (a auditoria registra quem pediu).
 * Falha da NEO não quebra a tela: devolve o aviso em português.
 */
export async function atualizarAgoraNeo(): Promise<ResultadoNeo> {
  await exigirOperador();
  try {
    const supabase = await criarClienteServidor();
    const relatorio = await executarSincronizacao(supabase, {
      aplicar: true,
      origem: "manual",
      listar: listarColaboradoresNeo,
    });
    revalidar();
    return { ok: true, mensagem: resumoParaOperador(relatorio) };
  } catch (e) {
    revalidar(); // a falha também fica em neo_sincronizacoes e muda o aviso da tela
    return { ok: false, erro: e instanceof ErroNeo ? e.message : MENSAGEM_FALHA };
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
    await executarSincronizacao(supabase, {
      aplicar: true,
      origem: "manual",
      listar: listarColaboradoresNeo,
    });
  } catch (e) {
    revalidar();
    const motivo = e instanceof ErroNeo ? e.message : MENSAGEM_FALHA;
    return { ok: true, mensagem: `Nome vinculado, mas a atualização falhou: ${motivo}` };
  }

  revalidar();
  return { ok: true, mensagem: "Nome vinculado e equipes atualizadas." };
}
