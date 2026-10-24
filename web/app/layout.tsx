import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SealHour",
  description: "Sujets d'examen scellés sous double verrou : timelock drand et clé du centre.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="skip" href="#main">
          Aller au contenu / Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
