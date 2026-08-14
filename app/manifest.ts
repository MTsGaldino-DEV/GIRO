import type { MetadataRoute } from "next";

/**
 * Manifesto para instalação na tela inicial.
 *
 * O supervisor abre isso no celular, em campo, às vezes de luva. Um atalho na
 * tela inicial poupa o passo de achar o e-mail para reencontrar o painel.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GIRO — Gestão integrada de requisitos ocupacionais",
    short_name: "GIRO",
    description: "Controle de ASO da UEN 211.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F1EC",
    theme_color: "#0E7C74",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
