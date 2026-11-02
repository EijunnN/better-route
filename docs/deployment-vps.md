# Despliegue en el VPS

Un VPS sirve a todas las empresas (ADR-0012). Todo el stack vive en
`docker-compose.prod.yml`. Solo Caddy publica puertos (80/443): el resto se
comunica por la red interna del compose.

```
internet ──▶ Caddy :443 ─┬─ /connection/* ──▶ centrifugo:8000
                         └─ resto ──────────▶ app:3000 ──┬─▶ postgres
                                                         ├─▶ redis
                                                         ├─▶ vroom ──▶ osrm-backend
                                                         └─▶ centrifugo (API HTTP)
              migrate (one-shot, antes de app) · backup (pg_dump diario → R2)
```

## Requisitos

- **8 GB de RAM y 4 vCPU.** OSRM con Perú completo usa ~1,2 GiB en
  runtime, pero el primer build (extract/partition) pide bastante más.
  Con 4 GB, limitá el mapa con `OSRM_BBOX` o agregá swap antes de buildear.
- **50 GB de SSD.** Imágenes, mapa procesado, volúmenes y backups.
- Ubuntu 24.04 o Debian 12 con Docker Engine y el plugin compose.
- Un dominio con registro **A** apuntando a la IP del VPS **antes** del
  primer `up`. Caddy pide el certificado de Let's Encrypt al arrancar.

## Primera instalación

```bash
# 1. Firewall: solo SSH y web. Ojo: Docker se salta ufw para los `ports:`
#    publicados. Por eso el compose no publica nada salvo Caddy.
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp
sudo ufw enable

# 2. Código y variables
git clone <repo> betterroute && cd betterroute
cp .env.vps.example .env.vps
chmod 600 .env.vps
$EDITOR .env.vps          # completar cada CAMBIAR

# 3. Build y arranque. El primer build de OSRM baja y procesa el mapa
#    (minutos). `migrate` corre las migraciones antes de que arranque la app.
docker compose -f docker-compose.prod.yml --env-file .env.vps up -d --build

# 4. Catálogo RBAC + el ADMIN_SISTEMA (SEED_ADMIN_EMAIL / _PASSWORD)
docker compose -f docker-compose.prod.yml --env-file .env.vps \
  run --rm migrate bun run db:seed
```

Después del seed, borrá `SEED_ADMIN_PASSWORD` de `.env.vps`: ya no se usa y
la app la recibiría por entorno. Entrá a `https://$DOMAIN` con ese admin y
creá las empresas desde `/companies`.

> **`ADMIN_SISTEMA` es solo para quien opera el VPS.** Ve a todas las
> empresas. A un cliente nunca se le da ese rol (ADR-0012).

Alias útil para no repetir flags:

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.vps'
```

## Verificación

```bash
dc ps                                   # todo "running"; migrate "exited (0)"
dc logs migrate                         # migraciones aplicadas
dc logs backup | tail -3                # "[backup] ok …" (y "subido a r2" si está configurado)
curl -sI https://$DOMAIN | head -1      # HTTP/2 200 (o redirect a /login)
```

Desde afuera, además:

- **Login y rate limit.** Tras 6 intentos fallidos seguidos con el mismo
  email tiene que responder `429`. Si nunca llega a `429`, la IP no está
  llegando: revisá `header_up X-Real-IP` en `docker/caddy/Caddyfile`.
- **Realtime.** En `/monitoring`, la pestaña Network tiene que mostrar un
  WebSocket a `wss://$DOMAIN/connection/websocket` en estado 101.
- **Optimización.** Correr un plan chico. Si falla con code 3, el pedido cae
  fuera del mapa (`OSRM_BBOX`).
- **Puertos.** Desde otra máquina, `nmap -p 3000,5000,5432,6379,8000 $IP`
  tiene que dar todo `filtered`/`closed`.

## Desplegar una versión nueva

```bash
git pull
dc up -d --build          # migrate vuelve a correr; la app espera a que termine
docker image prune -f
```

Las migraciones se generan en desarrollo (`db:generate`) y se commitean. En
el VPS solo se aplican. Nunca `db:push` (ADR-0009).

## Backups y restauración

`backup` hace un `pg_dump -Fc` al arrancar y después cada 24 h. Guarda los
dumps en el volumen `backups`, borra los de más de `BACKUP_KEEP_DAYS` y, si
`R2_BACKUP_*` está configurado, los copia a `r2:<bucket>/postgres/`. **Sin R2
el backup no sobrevive a perder el VPS.**

Restaurar (pisa la base actual):

```bash
dc stop app
dc exec backup ls -lh /backups                         # elegir el dump
dc exec backup pg_restore --clean --if-exists -d betterroute /backups/<archivo>.dump
dc start app
```

Probá una restauración al menos una vez antes de que haga falta.

## Migrar datos desde Neon (una sola vez)

Si la beta ya tiene datos en Neon:

```bash
pg_dump -Fc "$NEON_DATABASE_URL" -f neon.dump
docker compose -f docker-compose.prod.yml --env-file .env.vps cp neon.dump backup:/backups/
dc stop app
dc exec backup pg_restore --clean --if-exists --no-owner -d betterroute /backups/neon.dump
dc start app
```

En ese caso no corras `db:seed`: los datos ya traen catálogo y admin.

## Mantenimiento opcional

Limpieza de ubicaciones viejas de conductores (crontab del host, diaria):

```cron
0 4 * * * cd /home/<usuario>/betterroute && docker compose -f docker-compose.prod.yml --env-file .env.vps run --rm migrate bun run cleanup:locations
```

## App móvil

La app del conductor tiene las URLs compiladas en el APK (`dart_define.json`
de `aea`). Al cambiar de dominio hay que recompilar y redistribuir el APK con:

```json
{
  "API_BASE_URL": "https://<DOMAIN>",
  "WS_URL": "wss://<DOMAIN>/connection/websocket"
}
```
