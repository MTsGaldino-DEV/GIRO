import { Aviso } from "@/components/aviso";
import { FormularioAgendar } from "@/components/formulario-agendar";
import { FormularioConcluir } from "@/components/formulario-concluir";
import { FormularioCemig } from "@/components/formulario-cemig";
import { FormularioDevolver } from "@/components/formulario-devolver";
import {
  FormularioSolicitarData,
  FormularioDataSupervisor,
  FormularioInformarDados,
  FormularioEnviarClinica,
  FormularioEncerrarInapto,
  FormularioCancelar,
} from "@/components/formularios-item";
import { FormularioResultado } from "@/components/radar/formulario-resultado";
import { FormularioLiberacao } from "@/components/formulario-liberacao";
import { FormularioComparecimento } from "@/components/formulario-comparecimento";
import { acoesDaEtapa } from "@/lib/acoes-etapa";
import { DESFECHO_ROTULO, formatarData, formatarDataHora } from "@/lib/dominio";
import type { Clinica, ItemAberto, Papel } from "@/lib/tipos";

/**
 * As ações permitidas pelo estado atual (plano da Fase 1, seção 10).
 *
 * Um lugar só, usado pela tela do item e pela aba ASO do colaborador. Duas
 * cópias desta lista divergiriam no primeiro estado novo — e já divergiram uma
 * vez antes deste componente existir.
 */

function Cartao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h2 className="text-[1.0625rem] mb-1">{titulo}</h2>
      {descricao && <p className="text-ink-muted text-label mb-4">{descricao}</p>}
      {children}
    </div>
  );
}

export function AcoesItem({
  item,
  clinicas = [],
  papel,
}: {
  item: ItemAberto;
  clinicas?: Clinica[];
  /**
   * Só escolhe o formulário de "Informar data", como no Radar: o supervisor
   * informa a própria data; QSMS e admin lançam em nome dele. Quem pode o quê
   * continua decidido no banco.
   */
  papel?: Papel;
}) {
  return (
    <>
      {item.limite_marcacao_estourado && item.etapa !== "aguardando_documento" && (
        <Aviso tom="forte" titulo="Prazo de marcação vencido">
          O limite para marcar era {formatarData(item.data_limite_marcar)} — sete
          dias antes do vencimento. Marcar depois disso já não deixa margem para
          remarcação se a clínica falhar.
        </Aviso>
      )}

      {item.etapa === "previsto" && (
        <Cartao
          titulo="Solicitar data ao supervisor"
          descricao={
            <>
              Passo 1 do fluxo: pedir a {item.supervisor_nome ?? "a supervisão"} a
              data em que o colaborador pode sair da equipe. O envio da mensagem
              com um clique é da Fase 2 — aqui se registra que o pedido saiu.
            </>
          }
        >
          <FormularioSolicitarData item={item} />
        </Cartao>
      )}

      {item.etapa === "data_solicitada" &&
        (papel === "supervisor" ? (
          <Cartao
            titulo="Quando pode liberar?"
            descricao="Escolha um dia em que o colaborador pode sair da equipe para o exame. O QSMS agenda com a clínica a partir daí."
          >
            <FormularioLiberacao item={item} />
          </Cartao>
        ) : (
          <Cartao
            titulo="Registrar a data proposta"
            descricao={
              <>
                O item está com {item.supervisor_nome ?? "a supervisão"}. Se a
                data chegou por fora do GIRO, lance aqui em nome dela.
              </>
            }
          >
            <FormularioDataSupervisor item={item} />
          </Cartao>
        ))}

      {item.etapa === "data_proposta" && (
        <>
          <Cartao
            titulo="Checar a clínica e agendar"
            descricao={
              <>
                A supervisão liberou o colaborador para{" "}
                <strong className="font-medium tabular">
                  {formatarData(item.data_liberacao_proposta)}
                </strong>
                . Se a clínica tiver vaga, agende; se não, devolva para outra data.
              </>
            }
          >
            <FormularioAgendar item={item} clinicas={clinicas} />
          </Cartao>
          <FormularioDevolver itemId={item.item_id} />
        </>
      )}

      {item.etapa === "agendado" && (
        <>
          {item.dados_informados_em ? (
            <Cartao
              titulo="Enviar o colaborador à clínica"
              descricao={
                <>
                  Clínica, horário e orientações foram informados em{" "}
                  {formatarDataHora(item.dados_informados_em)}. Registre aqui
                  quando o colaborador for ao exame.
                </>
              }
            >
              <FormularioEnviarClinica item={item} />
            </Cartao>
          ) : (
            <Cartao
              titulo="Informar os dados ao supervisor"
              descricao={
                <>
                  Exame marcado para {formatarData(item.data_agendada)}. Passe
                  clínica, horário e orientações
                  {item.exige_jejum ? " (inclusive o jejum)" : ""} à supervisão e
                  marque aqui — sem isso o item fica agendado sem ninguém saber.
                </>
              }
            >
              <FormularioInformarDados item={item} />
            </Cartao>
          )}
          {/* O "Registrar falta" do menu da linha do Radar. Só a falta: quem foi
              ao exame segue por "Enviar à clínica" e "Registrar resultado". */}
          <Cartao titulo="O colaborador faltou?">
            <FormularioComparecimento itemId={item.item_id} apenasFalta />
          </Cartao>
        </>
      )}

      {item.etapa === "enviado_clinica" && (
        // O mesmo formulário da janela do Radar: a ficha e a lista não podem
        // registrar o resultado de dois jeitos diferentes.
        <Cartao
          titulo={acoesDaEtapa(item.etapa).principal?.rotulo ?? "Registrar resultado"}
          descricao="Só “fez e apto” encerra o ciclo, e já com o ASO anexado."
        >
          <FormularioResultado item={item} />
        </Cartao>
      )}

      {item.etapa === "aguardando_documento" && (
        <Cartao
          titulo={acoesDaEtapa(item.etapa).principal?.rotulo ?? "Anexar ASO e concluir"}
          descricao="O ASO é obrigatório: sem o documento anexado, o resultado apto não conclui o item. O relógio de 12 meses parte da data de realização do exame."
        >
          <FormularioConcluir item={item} />
        </Cartao>
      )}

      {item.etapa === "inapto_em_tratativa" && (
        <>
          <Aviso tom="forte" titulo="Processo travado — colaborador inapto">
            {item.desfecho ? `${DESFECHO_ROTULO[item.desfecho]}. ` : ""}
            O ciclo não foi cumprido: a validade não foi atualizada e nenhum
            processo novo é aberto. O colaborador permanece bloqueado. A saída é
            resolução explícita — tornar apto por novo exame, ou dispensar. O
            procedimento formal ainda não foi definido com o QSMS.
          </Aviso>
          <FormularioEncerrarInapto item={item} />
        </>
      )}

      <FormularioCemig itemId={item.item_id} atual={item.comunicado_cemig_em} />

      {item.etapa !== "inapto_em_tratativa" && <FormularioCancelar itemId={item.item_id} />}
    </>
  );
}
