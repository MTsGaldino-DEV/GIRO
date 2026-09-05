import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { IconeChevron } from "@/components/icones";
import { cn } from "@/lib/utils";

/**
 * Trilha de navegação.
 *
 * O <nav aria-label> e o `aria-current="page"` na folha são o que fazem o
 * leitor de tela anunciar a trilha como trilha, e não como uma fileira solta de
 * links. Os separadores são `aria-hidden`: ouvir "barra" entre cada nível é
 * ruído, a hierarquia já vem da lista.
 */
function Breadcrumb(props: React.ComponentProps<"nav">) {
  return <nav aria-label="Trilha de navegação" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-caption text-ink-faint m-0 p-0 list-none",
        className
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li data-slot="breadcrumb-item" className={cn("inline-flex items-center gap-1.5", className)} {...props} />
  );
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn(
        "no-underline text-ink-faint transition-colors duration-150 ease-giro hover:text-brand",
        className
      )}
      {...props}
    />
  );
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("text-ink-muted", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("inline-flex items-center [&>svg]:size-3", className)}
      {...props}
    >
      {children ?? <IconeChevron />}
    </li>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
