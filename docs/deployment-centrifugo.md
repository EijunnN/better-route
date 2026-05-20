# Deploying Centrifugo (realtime)

Centrifugo is the realtime WebSocket server — see
`docs/adr/0007-realtime-via-centrifugo.md`. It runs as a Docker Compose
service (`centrifugo`) on the same host as the app.

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
}
```

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
