"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * Diálogo — Radix por baixo, tokens do GIRO por cima.
 *
 * Traz o que não dá para escrever à mão sem regredir: foco preso enquanto
 * aberto, `aria-modal` e rotulagem corretas, Escape devolvendo o foco ao
 * gatilho, `inert` no resto da página e trava de rolagem do body sem o pulo de
 * layout que `overflow: hidden` causa sozinho.
 *
 * Duas variantes de posição, decididas por `lado`:
 *   - "centro": modal clássico, para confirmações e formulários curtos.
 *   - "direita": painel lateral (drawer), para conteúdo denso e navegável —
 *     é o formato do Perfil do Colaborador, onde a lista atrás precisa
 *     continuar visível para não perder o contexto de onde se estava.
 */
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("dialogo__cortina", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  lado = "centro",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  lado?: "centro" | "direita";
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-lado={lado}
        className={cn("dialogo", className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("dialogo__cabecalho", className)} {...props} />;
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("dialogo__corpo", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("dialogo__rodape", className)} {...props} />;
}

/**
 * Título — obrigatório pelo Radix, que avisa no console se faltar.
 *
 * É o que o leitor de tela anuncia ao abrir o diálogo. Quando o desenho não
 * pede um título visível, envolver em `.sr-only` continua satisfazendo a
 * exigência sem ocupar espaço.
 */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-title m-0", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-label text-ink-muted m-0", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
