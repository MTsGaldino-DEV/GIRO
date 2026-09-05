import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botão — API do shadcn/ui, aparência do GIRO.
 *
 * O shadcn original monta a aparência com dezenas de utilitários Tailwind por
 * variante (`bg-primary text-primary-foreground shadow-xs hover:bg-primary/90`
 * …). Aqui cada variante emite as classes que já existem em globals.css. Não é
 * teimosia: com a aparência escrita nos utilitários, um botão passa a poder ser
 * repintado direto no JSX, e a regra de cor reservada do semáforo — que só é
 * verificável se as cores morarem no CSS — deixaria de ter onde ser aplicada.
 *
 * O que se ganha do shadcn continua inteiro: `asChild` (que faz um <Link> herdar
 * o visual de botão sem <a> dentro de <button>), tipagem das variantes e o
 * mesmo nome de props do ecossistema.
 */
const variantesBotao = cva("btn", {
  variants: {
    variant: {
      default: "btn--primary",
      secondary: "btn--secondary",
      outline: "btn--secondary",
      ghost: "btn--fantasma",
      link: "btn--link",
      /* Grafite, não vermelho. A cor não avisa que a ação é destrutiva; o rótulo
         e a confirmação avisam. Ver a ponte de tokens em globals.css. */
      destructive: "btn--destrutivo",
    },
    size: {
      default: "",
      sm: "btn--sm",
      lg: "btn--lg",
      icon: "btn--icone",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof variantesBotao> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(variantesBotao({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, variantesBotao };
