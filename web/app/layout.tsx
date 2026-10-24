import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "@fontsource-variable/inter/wght.css";
import "../styles/osen/app.scss";
import "./globals.css";

export const metadata: Metadata = {
  title: "SealHour",
  description: "Exam papers sealed under a double lock: drand timelock and the centre key.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Before first paint, like the template's config.js: saved theme and sidenav size for the window width.
// Keys and sizes match components/Shell.tsx (THEME_KEY, SIDENAV_KEY, fitSize).
const FIRST_PAINT = `(function(){var h=document.documentElement,s=null;try{var t=localStorage.getItem("sealhour.theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";h.setAttribute("data-bs-theme",t);s=localStorage.getItem("sealhour.sidenav");if(s!=="sm-hover"&&s!=="sm-hover-active")s=null}catch(e){}var w=window.innerWidth;h.setAttribute("data-sidenav-size",w<=767.98?"full":w<=1140?"condensed":s||"sm-hover-active")})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-bs-theme="light"
      data-layout="vertical"
      data-layout-mode="fluid"
      data-topbar-color="light"
      data-menu-color="dark"
      data-sidenav-size="sm-hover-active"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FIRST_PAINT }} />
      </head>
      <body>
        <a className="skip visually-hidden-focusable" href="#main">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
