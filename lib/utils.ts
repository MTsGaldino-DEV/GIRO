import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta classes condicionais e resolve conflitos do Tailwind.
 *
 * Assinatura padrão do shadcn/ui — os componentes de `components/ui` contam
 * com ela para deixar o chamador sobrescrever qualquer utilitário via
 * `className` sem precisar de `!important`.
 *
 * `twMerge` só arbitra utilitários do Tailwind. As classes próprias do GIRO
 * (`btn`, `card`, `status`…) passam intactas, que é exatamente o que se quer:
 * elas é que carregam a identidade visual, e o utilitário vem por cima.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
