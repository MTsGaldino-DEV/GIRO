"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { IconeChevron, IconePonto } from "@/components/icones";

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/**
 * Filtro em "pílula" no lugar do <select> do navegador (referência: ListaSuspensa
 * da CENTRAL-NEO). Mostra o nome do campo e o valor escolhido; com filtro
 * aplicado, a pílula fica petróleo. Radix por baixo: setas, Home/End, busca por
 * digitação, Esc devolvendo o foco e posicionamento na borda da tela.
 *
 * Valor vazio ("") = sem filtro ("Todos").
 */
export function FiltroSuspenso({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  rotuloTodos = "Todos",
}: {
  rotulo: string;
  valor: string;
  opcoes: OpcaoFiltro[];
  aoMudar: (valor: string) => void;
  rotuloTodos?: string;
}) {
  const escolhida = opcoes.find((o) => o.valor === valor);
  const texto = escolhida?.rotulo ?? rotuloTodos;
  const ativo = !!valor && !!escolhida;

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="filtro-suspenso" data-ativo={ativo ? "true" : undefined} aria-label={`${rotulo}: ${texto}`}>
        <span className="filtro-suspenso__rotulo">{rotulo}</span>
        <span className="filtro-suspenso__valor">{texto}</span>
        <IconeChevron className="filtro-suspenso__seta" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu-suspenso filtro-suspenso__menu" sideOffset={6} align="start" collisionPadding={12}>
          <Menu.Label className="menu-suspenso__rotulo">{rotulo}</Menu.Label>
          <Menu.RadioGroup value={valor} onValueChange={aoMudar}>
            {[{ valor: "", rotulo: rotuloTodos }, ...opcoes].map((o) => (
              <Menu.RadioItem
                key={o.valor || "__todos"}
                value={o.valor}
                className="menu-suspenso__item menu-suspenso__item--marcavel"
              >
                <span className="menu-suspenso__marca">
                  <Menu.ItemIndicator>
                    <IconePonto className="size-2.5" />
                  </Menu.ItemIndicator>
                </span>
                {o.rotulo}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
