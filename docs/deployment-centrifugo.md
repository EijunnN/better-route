# Despliegue: reverse proxy + Centrifugo

Centrifugo is the realtime WebSocket server — see
`docs/adr/0007-realtime-via-centrifugo.md`. It runs as a Docker Compose
service (`centrifugo`) on the same host as the app.

Además de Centrifugo, acá vive la config del **reverse proxy del sitio**
(porque el mismo bloque enruta `/connection/*` y la app) y el
[checklist al desplegar](#checklist-al-desplegar) — los pasos manuales en
el servidor que ningún test cubre.

## Reverse proxy

Browser and mobile clients reach Centrifugo on the same origin as the
app — no subdomain, no CORS. The reverse proxy routes `/connection/*` to
Centrifugo (`:8000`); everything else goes to Next.js (`:3000`).
WebSocket upgrades must be forwarded, so the `Upgrade` / `Connection`
headers have to be passed through.

### nginx

```nginx
location /connection/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 600s;   # keep idle WS connections alive
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    # OBLIGATORIO: es la única fuente de IP que la app considera confiable.
    # Sin esto, el rate limit de /api/auth/login ve a todos los clientes como
    # "unknown" y comparten una sola cubeta de 5/min.
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

> **Por qué importa el header de IP.** `getClientIp`
> (`src/lib/infra/rate-limit.ts`) lee `X-Real-IP` primero y, si no está, el
> **último** hop de `X-Forwarded-For` — nunca el primero, porque esa parte la
> escribe el cliente y variarla en cada request estrenaba una cubeta nueva.
> Para que eso funcione, el proxy tiene que ser el último en tocar el header:
> no agregues saltos intermedios que no controles.

### Caddy

```caddy
your-domain.com {
    handle /connection/* {
        reverse_proxy 127.0.0.1:8000
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

Caddy forwards WebSocket upgrades automatically — no extra header
config needed.

Para la IP del cliente, en cambio, **sí** hace falta ser explícito: Caddy
manda `X-Forwarded-For` por defecto, pero no `X-Real-IP`. Agregá el header
al `handle` de la app para no depender del comportamiento por defecto:

```caddy
    handle {
        reverse_proxy 127.0.0.1:3000 {
            header_up X-Real-IP {remote_host}
        }
    }
```

## Environment

The app and Centrifugo share these (see `.env.example`):

| Variable | Used by | Purpose |
|---|---|---|
| `CENTRIFUGO_URL` | app | Centrifugo HTTP API base (e.g. `http://centrifugo:8000` inside the docker network) |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | app + Centrifugo | signs / verifies connection JWTs |
| `CENTRIFUGO_API_KEY` | app + Centrifugo | authenticates the app's publish calls |
| `CENTRIFUGO_ALLOWED_ORIGIN` | Centrifugo | the public app origin allowed to open WebSockets |

`docker/centrifugo/config.json` holds only non-secret config (the
channel namespaces). The three secrets reach Centrifugo through its
native `CENTRIFUGO_<CONFIG_PATH>` env vars — the `environment:` block in
`docker-compose.yml` maps the app's var names onto Centrifugo's
(`CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` → `CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY`,
`CENTRIFUGO_API_KEY` → `CENTRIFUGO_HTTP_API_KEY`, `CENTRIFUGO_ALLOWED_ORIGIN`
→ `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS`).

## Smoke test

```bash
docker compose up -d centrifugo
curl http://localhost:8000/health          # {} when healthy

# Full round-trip: sign a token, connect over WebSocket, publish, receive.
bun run scripts/smoke-centrifugo.ts
```

---

## Checklist al desplegar

Pasos que se hacen **en el servidor** y que ningún test del repo puede
verificar por vos.

### 1. Headers de IP en el reverse proxy

Editá la config del sitio (nginx: típicamente
`/etc/nginx/sites-available/<tu-sitio>`) con los `proxy_set_header` de la
sección *Reverse proxy*, y recargá:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` valida la sintaxis sin aplicar nada; el `&&` hace que la recarga
ocurra **solo** si la validación pasó, para no dejar el sitio caído con una
config rota. `reload` levanta workers nuevos y deja terminar a los viejos —
a diferencia de `restart`, no corta las conexiones abiertas (incluidos los
WebSockets de Centrifugo).

Comprobación rápida desde afuera: el login debe seguir funcionando y, tras
6 intentos fallidos seguidos con el mismo email, devolver `429`.

### 2. Variables que la app exige en producción

| Variable | Qué pasa si falta |
|---|---|
| `JWT_SECRET` | La app **tira excepción** al firmar/verificar cualquier token: no hay login posible. |
| `DATABASE_URL` | Sin base no arranca nada. |
| `REDIS_URL` | Degrada en silencio y con consecuencias de seguridad: el rate limit pasa a ser por proceso (se reinicia en cada deploy) y la rotación de refresh tokens no se puede verificar. Con la variable **puesta** pero Redis caído, el refresh responde 401 (fail-closed) — es deliberado. |

### 3. Migraciones

```bash
bun run db:migrate
```

Nunca `db:push` (ADR-0009).
