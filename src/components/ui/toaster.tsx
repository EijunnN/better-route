"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/layout/theme-context";

/**
 * Sonner no observa el tema por su cuenta (su default es "light"), así que le
 * pasamos el resuelto por nuestro ThemeProvider. Debe montarse dentro de él.
 */
export function Toaster() {
  const { theme } = useTheme();

  return <SonnerToaster theme={theme} position="bottom-right" richColors />;
}
