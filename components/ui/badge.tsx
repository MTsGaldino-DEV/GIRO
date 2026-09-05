import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Etiqueta de metadado — papel, polo, tipo de requisito, contagem.
 *
 * NÃO é o selo de conformidade. Status de colaborador usa `<SeloStatus>` e a
 * família `.status--*`, que é a única com direito a verde, âmbar, coral e
 * vermelho. Se um dia uma etiqueta destas precisar "chamar atenção", a resposta
 * é peso ou posição, nunca cor de semáforo — duas linguagens de cor competindo
 * pelo mesmo olhar é como o painel deixa de ser lido em um passe.
 */
const variantesEtiqueta = cva("etiqueta", {
  variants: {
    variant: {
      default: "etiqueta--marca",
      secondary: "etiqueta--neutra",
      outline: "etiqueta--contorno",
      solid: "etiqueta--solida",
      destructive: "etiqueta--solida",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof variantesEtiqueta> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(variantesEtiqueta({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, variantesEtiqueta };
