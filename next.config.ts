import type { NextConfig } from "next";

/**
 * Origen del WebSocket de Centrifugo, derivado de la URL que ya consume el
 * cliente. En el VPS Centrifugo vive detrás del mismo reverse proxy que la app
 * (docker/caddy/Caddyfile), así que `'self'` alcanza y esto queda vacío. En
 * dev Centrifugo escucha en otro puerto: sin esta entrada la CSP mata el
 * handshake y el realtime cae a polling en silencio.
 */
function centrifugoConnectSrc(): string {
  const raw = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;
  if (!raw) return "";
  try {
    const { origin } = new URL(raw);
    return ` ${origin}`;
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Empaqueta el server y sus deps reales en vez de arrastrar node_modules
  // entero a la imagen del VPS.
  output: "standalone",
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Corre el React Compiler dentro de Turbopack en vez de Babel, que era
    // el único transform de Babel que quedaba en el pipeline. Experimental
    // (16.3): si aparece un bug de compilación, sacar este flag lo devuelve
    // al camino Babel sin tocar código.
    turbopackRustReactCompiler: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              `connect-src 'self'${centrifugoConnectSrc()} https://tiles.openfreemap.org https://nominatim.openstreetmap.org`,
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
