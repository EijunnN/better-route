import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// IBM Plex pairing reserved for [data-cockpit] surfaces — currently the
// /monitoring dashboard. Declared globally so the font vars cascade into
// Radix portals (Dialog, Popover) that render outside the cockpit tree.
// The CSS in globals.css only applies the family within `[data-cockpit]`,
// so the rest of the app keeps the Geist look.
const cockpitSans = IBM_Plex_Sans({
  variable: "--cockpit-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const cockpitMono = IBM_Plex_Mono({
  variable: "--cockpit-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BetterRoute",
  description: "Aplicación de planificación de rutas",
};

// Inlined into <head> by next/script with strategy="beforeInteractive"
// so it runs before the first paint and avoids a theme flash for users
// whose system preference disagrees with the SSR-default dark class.
// next/script handles the <script> tag for us — no raw
// dangerouslySetInnerHTML in this file.
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var k=s==='dark'||(!s&&d);if(k){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${cockpitSans.variable} ${cockpitMono.variable} antialiased`}
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
