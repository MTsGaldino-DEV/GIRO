"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from "@/components/ui/dialog";
import { AvatarColaborador } from "@/components/avatar-colaborador";
import { SeloStatus } from "@/components/selo-status";
import { IconeFechar } from "@/components/icones";
import { criarClienteNavegador } from "@/lib/supabase/browser";
import { carregarResumo, type ResumoColaborador } from "@/lib/consulta-colaborador";
import { SITUACAO_ROTULO, formatarData } from "@/lib/dominio";
import type { Situacao, StatusConformidade } from "@/lib/tipos";
import { ABAS_PERFIL, usePerfilColaborador } from "./contexto";
import { AbaVisaoGeral } from "./aba-visao-geral";
import { AbaAso } from "./aba-aso";
import { AbaDocumentos } from "./aba-documentos";
import { AbaCadastro } from "./aba-cadastro";
import { AbaHistorico } from "./aba-historico";

function Indicador({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="indicador-compacto">
      <div className="indicador-compacto__rotulo">{rotulo}</div>
      <div className="indicador-compacto__valor">{children}</div>
    </div>
  );
}

/**
 * Painel flutuante do Perfil do Colaborador.
 *
 * Entra pela direita e deixa a lista visível atrás: quem está trabalhando a
 * fila precisa continuar vendo onde estava para não perder a posição ao fechar.
 *
 * O cabeçalho e os indicadores carregam de imediato; cada aba busca os próprios
 * dados só quando é aberta. Documentos e Histórico são as mais caras (URLs
 * assinadas por arquivo, união de duas trilhas) e seriam desperdício em toda
 * abertura — a maioria das visitas quer só a Visão geral.
 *
 * As telas cheias em /qsms/colaborador/[id]/... continuam existindo e
 * funcionando por link direto. Este painel é adição, não substituição.
 */
export function PainelPerfilColaborador() {
  const { colaboradorId, aba, trocarAba, fechar } = usePerfilColaborador();
  const [resumo, setResumo] = useState<ResumoColaborador | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscarResumo = useCallback(async (id: string) => {
    const supabase = criarClienteNavegador();
    const dados = await carregarResumo(supabase, id);
    if (!dados) {
      // Sem linha é "não existe" ou "fora do seu alcance" — a RLS não
      // distingue os dois de propósito, e a mensagem também não.
      setErro("Colaborador não encontrado ou fora do seu acesso.");
      setResumo(null);
    } else {
      setErro(null);
      setResumo(dados);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!colaboradorId) return;
    setCarregando(true);
    setResumo(null);
    setErro(null);
    void buscarResumo(colaboradorId);
  }, [colaboradorId, buscarResumo]);

  const atualizar = useCallback(() => {
    if (colaboradorId) void buscarResumo(colaboradorId);
  }, [colaboradorId, buscarResumo]);

  const aberto = colaboradorId !== null;

  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && fechar()}>
      <DialogContent lado="direita" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <AvatarColaborador
                nome={resumo?.colaborador.nome ?? "?"}
                fotoUrl={resumo?.fotoUrl}
                tamanho={52}
              />
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  {resumo?.colaborador.nome ?? (carregando ? "Carregando…" : "Perfil")}
                </DialogTitle>
                {resumo && (
                  <DialogDescription className="truncate">
                    <span className="tabular">{resumo.colaborador.matricula}</span>
                    {resumo.colaborador.cargo && ` · ${resumo.colaborador.cargo}`}
                    {resumo.colaborador.polo && ` · ${resumo.colaborador.polo}`}
                  </DialogDescription>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {resumo?.status && (
                <SeloStatus
                  status={resumo.status.status as StatusConformidade}
                  dias={resumo.status.dias_restantes}
                  titulo
                />
              )}
              <DialogClose className="dialogo__fechar" aria-label="Fechar perfil">
                <IconeFechar />
              </DialogClose>
            </div>
          </div>

          {resumo && (
            <>
              <p className="text-caption text-ink-faint mt-2 mb-0 truncate">
                {resumo.supervisorNome ?? "Sem supervisor"}
                {" · "}
                {SITUACAO_ROTULO[resumo.colaborador.situacao as Situacao] ??
                  resumo.colaborador.situacao}
                {resumo.colaborador.local && ` · ${resumo.colaborador.local}`}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <Indicador rotulo="Requisito">{resumo.status?.requisito ?? "—"}</Indicador>
                <Indicador rotulo="Vencimento">
                  {formatarData(resumo.status?.data_vencimento)}
                </Indicador>
                <Indicador rotulo="ASOs">{resumo.totalExames}</Indicador>
                <Indicador rotulo="Documentos">{resumo.totalDocumentos}</Indicador>
              </div>

              {/* A tela cheia continua sendo o lugar de trabalhar com calma, e
                  o único endereço compartilhável — o painel não tem URL. */}
              <nav aria-label="Seções do perfil" className="abas mt-4 mb-0">
                {ABAS_PERFIL.map((item) => (
                  <button
                    key={item.chave}
                    type="button"
                    className="abas__item"
                    aria-current={aba === item.chave ? "page" : undefined}
                    onClick={() => trocarAba(item.chave)}
                  >
                    {item.rotulo}
                  </button>
                ))}
              </nav>
            </>
          )}
        </DialogHeader>

        <DialogBody>
          {carregando && <div className="esqueleto h-40" aria-busy="true" />}

          {erro && (
            <p role="alert" className="text-label">
              {erro}
            </p>
          )}

          {resumo && (
            <>
              {aba === "visao-geral" && <AbaVisaoGeral resumo={resumo} />}
              {aba === "aso" && (
                <AbaAso colaboradorId={resumo.colaborador.id} item={resumo.item} />
              )}
              {aba === "documentos" && <AbaDocumentos colaboradorId={resumo.colaborador.id} />}
              {aba === "cadastro" && <AbaCadastro resumo={resumo} aoAtualizar={atualizar} />}
              {aba === "historico" && <AbaHistorico colaboradorId={resumo.colaborador.id} />}

              <p className="text-caption text-ink-faint mt-4 mb-0">
                <Link href={`/qsms/colaborador/${resumo.colaborador.id}/visao-geral`}>
                  Abrir em tela cheia
                </Link>{" "}
                — endereço fixo, para compartilhar ou guardar nos favoritos.
              </p>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
