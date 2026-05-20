import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
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
              `connect-src 'self'${process.env.NODE_ENV === "development" ? " ws://localhost:8000" : ""} https://*.basemaps.cartocdn.com https://nominatim.openstreetmap.org https://*.upstash.io`,
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
