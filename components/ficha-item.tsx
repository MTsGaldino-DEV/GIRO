import {
  ETAPA_ROTULO,
  ETAPA_ACAO,
  DONO_ROTULO,
  SITUACAO_ROTULO,
  formatarData,
  formatarHora,
  formatarDataHora,
  avisoJanelaUtil,
} from "@/lib/dominio";
import { SeloStatus } from "@/components/selo-status";
import { Aviso } from "@/components/aviso";
import type { ItemAberto } from "@/lib/tipos";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-faint uppercase tracking-[0.04em]">{rotulo}</dt>
      <dd className="m-0 mt-0.5 tabular">{children}</dd>
    </div>
  );
}

/** Cabeçalho comum às duas telas de detalhe: quem é, qual o risco, de quem é a bola. */
export function FichaItem({ item }: { item: ItemAberto }) {
  const janela = avisoJanelaUtil(item);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{item.nome}</h1>
          <p className="text-ink-muted text-label mt-0.5 tabular">
            {item.matricula}
            {item.cargo && ` · ${item.cargo}`}
            {item.polo && ` · ${item.polo}`}
          </p>
        </div>
        <SeloStatus status={item.status} dias={item.dias_restantes} titulo />
      </div>

      <div className="card">
        <dl className="grid gap-x-6 gap-y-4 grid-cols-2 sm:grid-cols-3 m-0">
          <Campo rotulo="Requisito">{item.requisito}</Campo>
          <Campo rotulo="Vencimento">{formatarData(item.data_vencimento)}</Campo>
          <Campo rotulo="Último ASO">
            {formatarData(item.ultimo_documento)}
            {item.ultimo_documento_estimado && (
              <span className="block text-caption text-ink-faint">data estimada</span>
            )}
          </Campo>
          <Campo rotulo="Etapa">{ETAPA_ROTULO[item.etapa]}</Campo>
          <Campo rotulo="Com quem">{DONO_ROTULO[item.dono]}</Campo>
          <Campo rotulo="Parado há">
            <span className="dias-parados" data-estourado={item.sla_estourado}>
              {item.dias_parados} {item.dias_parados === 1 ? "dia" : "dias"}
            </span>
          </Campo>
          <Campo rotulo="Situação">{SITUACAO_ROTULO[item.situacao] ?? item.situacao}</Campo>
          <Campo rotulo="Supervisor">{item.supervisor_nome ?? "Sem supervisor"}</Campo>
          <Campo rotulo="Prazo da etapa">{formatarDataHora(item.sla_vence_em)}</Campo>
        </dl>

        <p className="text-label text-ink-muted mt-4 mb-0">
          <span className="text-ink-faint">Próxima ação: </span>
          {ETAPA_ACAO[item.etapa]}
        </p>
      </div>

      {item.status === "sem_registro" && (
        <Aviso tom="forte" titulo="Sem data de referência">
          Não há ASO registrado para este colaborador. Enquanto não houver, ele é
          tratado com a mesma gravidade de um ASO vencido — não pode subir em
          poste amanhã.
        </Aviso>
      )}

      {item.bloqueado_para_agendamento && (
        <Aviso titulo="Agendamento bloqueado">
          O colaborador está em situação &ldquo;
          {SITUACAO_ROTULO[item.situacao] ?? item.situacao}&rdquo;. Só quem está
          trabalhando pode ser agendado.
        </Aviso>
      )}

      {janela && (
        <Aviso tom={item.conflito_bloqueante ? "forte" : "neutro"} titulo="Janela útil">
          {janela}
        </Aviso>
      )}

      {item.etapa === "agendado" && (
        <div className="card">
          <h2 className="text-[1.0625rem] mb-3">Agendamento</h2>
          <dl className="grid gap-x-6 gap-y-4 grid-cols-2 sm:grid-cols-3 m-0">
            <Campo rotulo="Clínica">{item.clinica ?? "—"}</Campo>
            <Campo rotulo="Endereço">{item.endereco ?? "—"}</Campo>
            <Campo rotulo="Médico">{item.medico ?? "—"}</Campo>
            <Campo rotulo="Data">{formatarData(item.data_agendada)}</Campo>
            <Campo rotulo="Hora">{formatarHora(item.hora_agendada)}</Campo>
            <Campo rotulo="Avaliação psicossocial">
              {item.avaliacao_psicossocial ? "Sim" : "Não"}
            </Campo>
          </dl>

          {item.exige_jejum && (
            <p className="text-label mt-4 mb-0">
              <strong className="font-medium">Jejum de 8 horas.</strong>{" "}
              <span className="text-ink-muted">
                {/* P6: a regra não foi confirmada com a clínica. O e-mail atual do
                    QSMS diz "exceto administrativos", mas ninguém sabe se o jejum é
                    do ASO ou só de quem faz exame de sangue. */}
                Regra ainda não confirmada com a clínica — na dúvida, orientar jejum.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
