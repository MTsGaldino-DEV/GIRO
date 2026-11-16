"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { acoesDaEtapa, type AcaoLinha, type IdAcao } from "@/lib/acoes-etapa";
import { formatarData } from "@/lib/dominio";
import { usePerfilColaborador } from "@/components/perfil/contexto";
import { IconeFechar, IconeReticencias } from "@/components/icones";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormularioAgendar } from "@/components/formulario-agendar";
import { FormularioConcluir } from "@/components/formulario-concluir";
import { FormularioDevolver } from "@/components/formulario-devolver";
import {
  FormularioCancelar,
  FormularioDataSupervisor,
  FormularioEncerrarInapto,
  FormularioEnviarClinica,
  FormularioInformarDados,
  FormularioSolicitarData,
  type AoConcluir,
} from "@/components/formularios-item";
import { FormularioResultado } from "@/components/radar/formulario-resultado";
import { FormularioLiberacao } from "@/components/formulario-liberacao";
import { FormularioComparecimento } from "@/components/formulario-comparecimento";
import type { Clinica, ItemAberto, Papel } from "@/lib/tipos";

/** Ações que abrem janela. Perfil e histórico abrem o painel do colaborador. */
type AcaoComJanela = Exclude<IdAcao, "perfil" | "historico">;

/**
 * Botão principal da etapa e menu "⋮" com o resto, numa célula da linha do
 * Radar (spec 2026-11-13-telas-e-fluxo, seção 7; mapa em lib/acoes-etapa.ts).
 *
 * Cada ação abre o formulário que já existe na ficha do item, numa janela
 * sobre a lista: a pessoa não perde a posição na fila. Ao dar certo, a janela
 * fecha e `aoConcluir` recarrega a lista com a mensagem do servidor.
 *
 * Quem pode fazer o quê continua no banco (admin, QSMS e supervisor operam a
 * UEN inteira). O papel aqui só escolhe qual formulário de "Informar data"
 * abrir: o supervisor informa a própria data; o QSMS lança em nome dele.
 */
export function AcoesLinha({ item, aoConcluir }: { item: ItemAberto; aoConcluir: AoConcluir }) {
  const { abrir: abrirPerfil, papel } = usePerfilColaborador();
  const [aberta, setAberta] = useState<AcaoComJanela | null>(null);
  const { principal, secundarias } = acoesDaEtapa(item.etapa);

  // A janela abre sem `DialogTrigger`, e o Radix devolve o foco ao trigger
  // dele ao fechar — sem um, o foco caía no <body> e quem usa teclado perdia a
  // linha. Volta para quem abriu: o botão principal ou o "⋮".
  const botaoPrincipal = useRef<HTMLButtonElement>(null);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const abertaPeloMenu = useRef(false);

  const doMenu = secundarias.filter((a) => a.id !== "cancelar");
  const cancelar = secundarias.find((a) => a.id === "cancelar");

  // Estável: os formulários avisam a conclusão num efeito que depende dela.
  const concluir = useCallback(
    (mensagem: string) => {
      setAberta(null);
      aoConcluir(mensagem);
    },
    [aoConcluir]
  );

  function escolher(acao: AcaoLinha, peloMenu: boolean) {
    if (acao.id === "perfil") abrirPerfil(item.colaborador_id);
    else if (acao.id === "historico") abrirPerfil(item.colaborador_id, "historico");
    else {
      abertaPeloMenu.current = peloMenu;
      setAberta(acao.id);
    }
  }

  const [copiado, setCopiado] = useState(false);
  function copiarLink() {
    navigator.clipboard.writeText(`${window.location.origin}/qsms/item/${item.item_id}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  const rotuloAberta = aberta ? [principal, ...secundarias].find((a) => a?.id === aberta)?.rotulo : "";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {principal && (
        <button
          ref={botaoPrincipal}
          type="button"
          className="btn btn--primary btn--sm whitespace-nowrap"
          onClick={() => escolher(principal, false)}
          aria-label={`${principal.rotulo} — ${item.nome}`}
        >
          {principal.rotulo}
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={botaoMenu}
            type="button"
            className="btn btn--secondary btn--icone"
            aria-label={`Mais ações — ${item.nome}`}
            title={copiado ? "Link copiado!" : undefined}
          >
            <IconeReticencias />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {doMenu.map((a) => (
            <DropdownMenuItem key={a.id} onSelect={() => escolher(a, true)}>
              {a.rotulo}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/qsms/item/${item.item_id}`}>Abrir ficha do item</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copiarLink}>Copiar link do item</DropdownMenuItem>
          {cancelar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => escolher(cancelar, true)}>
                {cancelar.rotulo}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={aberta !== null} onOpenChange={(estado) => !estado && setAberta(null)}>
        {aberta && (
          <DialogContent
            lado="centro"
            onCloseAutoFocus={(evento) => {
              evento.preventDefault();
              (abertaPeloMenu.current ? botaoMenu : botaoPrincipal).current?.focus();
            }}
          >
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle>{rotuloAberta}</DialogTitle>
                  <DialogDescription className="truncate">
                    {item.nome} · {item.requisito}
                  </DialogDescription>
                </div>
                <DialogClose className="dialogo__fechar" aria-label="Fechar">
                  <IconeFechar />
                </DialogClose>
              </div>
            </DialogHeader>
            <DialogBody>
              <ConteudoAcao acao={aberta} item={item} papel={papel} aoConcluir={concluir} />
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** Uma frase de contexto acima do formulário; o resto fica no próprio formulário. */
function Contexto({ children }: { children: React.ReactNode }) {
  return <p className="text-label text-ink-muted mt-0 mb-4">{children}</p>;
}

function ConteudoAcao({
  acao,
  item,
  papel,
  aoConcluir,
}: {
  acao: AcaoComJanela;
  item: ItemAberto;
  papel: Papel;
  aoConcluir: AoConcluir;
}) {
  switch (acao) {
    case "solicitar_data":
      return (
        <>
          <Contexto>Registra que o pedido saiu. O item passa para a supervisão informar a data.</Contexto>
          <FormularioSolicitarData item={item} aoConcluir={aoConcluir} />
        </>
      );

    case "informar_data":
      return papel === "supervisor" ? (
        <>
          <Contexto>Dia em que o colaborador pode sair da equipe para o exame.</Contexto>
          <FormularioLiberacao item={item} aoConcluir={aoConcluir} />
        </>
      ) : (
        <>
          <Contexto>Lance a data que a supervisão informou, em nome dela.</Contexto>
          <FormularioDataSupervisor item={item} aoConcluir={aoConcluir} />
        </>
      );

    case "agendar":
      return (
        <>
          <Contexto>
            Liberado para <strong className="font-medium tabular">{formatarData(item.data_liberacao_proposta)}</strong>.
            Confirme com a clínica.
          </Contexto>
          <AgendarComClinicas item={item} aoConcluir={aoConcluir} />
        </>
      );

    case "enviar_clinica":
      return (
        <>
          <Contexto>Registre quando o colaborador for ao exame.</Contexto>
          <FormularioEnviarClinica item={item} aoConcluir={aoConcluir} />
        </>
      );

    case "registrar_resultado":
      return <FormularioResultado item={item} aoConcluir={aoConcluir} />;

    case "concluir_documento":
      return (
        <>
          <Contexto>Item antigo, que esperava o documento. Anexe o ASO para concluir.</Contexto>
          <FormularioConcluir item={item} aoConcluir={aoConcluir} />
        </>
      );

    case "encerrar_inapto":
      return <FormularioEncerrarInapto item={item} aoConcluir={aoConcluir} embutido />;

    case "devolver":
      return (
        <>
          <Contexto>A data proposta não serve para a clínica. O item volta à supervisão.</Contexto>
          <FormularioDevolver itemId={item.item_id} aoConcluir={aoConcluir} embutido />
        </>
      );

    case "informar_dados":
      return (
        <>
          <Contexto>
            Exame em {formatarData(item.data_agendada)}. Marque quando clínica, horário e
            orientações{item.exige_jejum ? " (inclusive o jejum)" : ""} forem passados à supervisão.
          </Contexto>
          <FormularioInformarDados item={item} aoConcluir={aoConcluir} />
        </>
      );

    case "registrar_falta":
      return <FormularioComparecimento itemId={item.item_id} aoConcluir={aoConcluir} apenasFalta />;

    case "cancelar":
      return (
        <>
          <Contexto>O item sai do Radar. O motivo fica no histórico.</Contexto>
          <FormularioCancelar itemId={item.item_id} aoConcluir={aoConcluir} embutido />
        </>
      );
  }
}

/**
 * O Radar não carrega clínicas; só quem vai agendar precisa delas. O
 * formulário espera a lista: o seletor é não controlado, e opções que chegam
 * depois não pegariam a clínica já gravada no item.
 */
function AgendarComClinicas({ item, aoConcluir }: { item: ItemAberto; aoConcluir: AoConcluir }) {
  const [clinicas, setClinicas] = useState<Clinica[] | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const { data } = await criarClienteNavegador()
          .from("clinicas")
          .select("*")
          .eq("ativo", true)
          .order("nome");
        if (ativo) setClinicas((data ?? []) as Clinica[]);
      } catch {
        // Sem a lista, o campo livre de clínica continua servindo.
        if (ativo) setClinicas([]);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  if (clinicas === null) {
    return (
      <p role="status" className="text-label text-ink-faint m-0">
        Carregando clínicas…
      </p>
    );
  }
  return <FormularioAgendar item={item} clinicas={clinicas} aoConcluir={aoConcluir} />;
}
