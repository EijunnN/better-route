import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escapa una cadena para interpolarla de forma segura dentro de HTML
 * (innerHTML / setHTML / strings de marcadores de mapa). Nunca interpolar
 * datos del usuario en HTML sin pasar por acá.
 */
export function escapeHtml(value: string | null | undefined): string {
  // Tolera null/undefined a propósito: esto corre dentro del forEach que pinta
  // los marcadores del mapa, así que una excepción acá no deja un popup a
  // medias — aborta el bucle y el mapa pierde TODAS las paradas siguientes.
  // Un campo vacío es un defecto visible; un mapa en blanco esconde el dato.
  if (value == null) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
