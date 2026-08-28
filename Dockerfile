# Imagen de la app Next.js. Se usa en Railway y sirve igual para el VPS.
#
# `-slim` (Debian) y no `-alpine`: `sharp` —que Next usa para optimizar
# imágenes— necesita glibc; en musl hay que traer el binario correcto y se
# rompe de formas poco obvias.

# ── deps ──────────────────────────────────────────────────────────────────
FROM oven/bun:1.4-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────────────
FROM oven/bun:1.4-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las NEXT_PUBLIC_* se inlinean en el bundle del cliente durante el build, no
# se leen en runtime: si falta acá, el navegador queda sin URL de Centrifugo
# por más que la variable exista en el servicio.
ARG NEXT_PUBLIC_CENTRIFUGO_WS_URL
ARG NEXT_PUBLIC_ENABLE_PLAYGROUND
ENV NEXT_PUBLIC_CENTRIFUGO_WS_URL=$NEXT_PUBLIC_CENTRIFUGO_WS_URL \
    NEXT_PUBLIC_ENABLE_PLAYGROUND=$NEXT_PUBLIC_ENABLE_PLAYGROUND \
    NEXT_TELEMETRY_DISABLED=1

RUN bun run build

# ── runtime ───────────────────────────────────────────────────────────────
FROM oven/bun:1.4-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` deja en .next/standalone solo el server y las deps que
# el trace encontró. `public/` y `.next/static` NO entran ahí: van aparte.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Railway inyecta PORT; server.js lo respeta.
CMD ["bun", "server.js"]
