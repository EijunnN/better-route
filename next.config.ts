import type { NextConfig } from "next";

/**
 * Origen del WebSocket de Centrifugo, derivado de la URL que ya consume el
 * cliente. En el VPS Centrifugo vive detrás del mismo reverse proxy que la app
 * (ver docs/deployment-centrifugo.md), así que `'self'` alcanza y esto queda
 * vacío. En Railway cada servicio tiene su propio dominio: sin esta entrada la
 * CSP mata el handshake y el realtime cae a polling en silencio.
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
  // Railway/Docker: empaqueta solo el server y sus deps reales en vez de
  // arrastrar node_modules entero a la imagen.
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
            // In production, Centrifugo lives behind the same reverse
            // proxy as the app (wss://same-origin/connection/websocket),
            // which `'self'` already covers. In dev the SDK reaches
            // ws://localhost:8000 directly, so we whitelist it
            // explicitly — without this entry the WebSocket handshake
            // is killed by CSP before the Centrifuge SDK can connect,
            // and live chat / monitoring silently fall back to polling.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              `connect-src 'self'${centrifugoConnectSrc()} https://tiles.openfreemap.org https://nominatim.openstreetmap.org https://*.upstash.io`,
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
