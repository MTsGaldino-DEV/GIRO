import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GIRO",
    template: "%s · GIRO",
  },
  description: "Gestão integrada de requisitos ocupacionais — controle de ASO, UEN 211.",
  applicationName: "GIRO",
};

export const viewport: Viewport = {
  themeColor: "#0E7C74",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={plex.variable}>
      <body>{children}</body>
    </html>
  );
}
