import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

// Script que se ejecuta antes del renderizado para evitar flash de tema incorrecto
const themeScript = `
  (function() {
    try {
      var savedTheme = localStorage.getItem('theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
      if (shouldBeDark) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cockpitSans.variable} ${cockpitMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
