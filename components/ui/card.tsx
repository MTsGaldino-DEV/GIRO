import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Cartão — partes do shadcn/ui sobre a classe `.card` do GIRO.
 *
 * `.card` traz fundo, raio, borda fina e a elevação suave; as partes abaixo
 * cuidam só do ritmo interno. `interativo` liga o realce de hover, e existe
 * porque elevação é promessa de clique: cartão que não responde não sobe.
 */
function Card({
  className,
  interativo = false,
  ...props
}: React.ComponentProps<"div"> & { interativo?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn("card flex flex-col gap-4", interativo && "card--interativo", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-label font-medium text-ink-muted", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-caption text-ink-faint", className)}
      {...props}
    />
  );
}

/** Canto superior direito — é onde o menu "⋮" do cartão de estatística mora. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("shrink-0", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2 text-caption text-ink-faint", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
