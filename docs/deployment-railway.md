# Despliegue en Railway (entorno de prueba)

Railway como banco de pruebas: cinco servicios en un proyecto, Postgres sigue
en Neon. **No es el destino final** — el plan es un VPS. Todo lo de acá está
pensado para migrar sin fricción: los mismos Dockerfiles sirven en el VPS con
`docker compose`.

> **El free tier alcanza para probar, no para operar.** El trial da **$5 por
> única vez, 30 días, 1 GB de RAM y 5 servicios por proyecto**. Este stack
> consume **~355 MB medidos**, así que entra con holgura; a $10/GB/mes son
> ~$3,6/mes de RAM, o sea el crédito cubre aproximadamente el mes de trial
> con todo prendido (menos si el CPU se usa mucho). Cuando se agota, la cuenta cae al plan
> Free ($1/mes de crédito) y eso no sostiene nada. Ver
> [Estirar el crédito](#estirar-el-crédito).

---

## Los cinco servicios

| Servicio | Imagen / Dockerfile | Público | RAM medida |
|---|---|---|---|
| `app` | `Dockerfile` (raíz) | **sí** | **107 MB** |
| `osrm` | `docker/osrm/Dockerfile` | no | **159 MB** (imagen 543 MB) |
| `vroom` | `docker/vroom/Dockerfile` | no | **46 MB** |
| `centrifugo` | `docker/centrifugo/Dockerfile` | **sí** (WebSocket) | ~32 MB |
| `redis` | template oficial de Railway | no | ~10 MB |

`app` y `centrifugo` necesitan dominio público: el navegador abre el WebSocket
directo contra Centrifugo. En el VPS eso no hace falta porque un reverse proxy
los sirve en el mismo origen (ver
[`deployment-centrifugo.md`](./deployment-centrifugo.md)).

### Por qué OSRM entra en 1 GB

Porque la imagen **no** carga Perú entero. `docker/osrm/Dockerfile` recorta el
mapa a Lima Metropolitana antes de procesarlo. Medido sobre una matriz de
1000×1000:

| | Perú | Lima |
|---|---|---|
| Datos procesados | 2,17 GB | **0,25 GB** |
| RAM bajo carga | 1,21 GiB | **253 MB** |
| Tiempo de la matriz | 14,8 s | **8,1 s** |

Con Perú entero **no entrarías** en el límite de 1 GB del trial.

⚠️ Un pedido fuera del bbox no obtiene ruta. El default cubre
Ancón–Pucusana–Chosica. Para sumar ciudades, cambiá el `BBOX` del servicio y
reconstruí.

---

## Camino rápido: importar el Compose

Railway **no ejecuta** un `docker-compose.yml`: lo lee al soltarlo en el canvas
del proyecto y crea un servicio por entrada. Para eso está
[`docker-compose.railway.yml`](../docker-compose.railway.yml) — arrastralo al
canvas y quedan los cinco servicios creados, apuntando a sus Dockerfiles.
Después completá las variables marcadas `CAMBIAR` y desplegá.

> No importes `docker-compose.yml` (el de desarrollo). Railway **no soporta
> bind mounts**, y ese archivo monta tres cosas del repo: el `config.json` de
> Centrifugo, el `config.yml` de VROOM y los datos de OSRM. Importado tal cual
> te deja Centrifugo sin los namespaces `chat`/`monitoring` (todo canal
> responde "unknown channel"), VROOM sin saber dónde está OSRM, y OSRM sin
> mapa. Tampoco incluye la app. Los Dockerfiles existen justamente para
> hornear esas tres configs.

Railway ignora además `profiles`, `healthcheck`, `ulimits` y `depends_on`; los
servicios arrancan en cualquier orden y reintentan solos.

Si preferís crearlos a mano, el detalle está abajo.

---

## Pasos

### 1. Verificá la cuenta

Sin verificar, Railway **restringe el tráfico saliente**. La app no podría
llegar a Neon, R2 ni OneSignal y vas a perseguir un fantasma.

### 2. Redis

`+ New` → `Database` → `Redis`. Copiá su `REDIS_URL` privada.

### 3. `osrm`

`+ New` → `GitHub Repo` → este repo.

- **Root Directory**: `/`
- **Dockerfile Path**: `docker/osrm/Dockerfile`
- **Networking**: solo privado (sin dominio público)

El primer build descarga ~226 MB de Geofabrik y procesa el recorte: tarda
varios minutos y es normal. Se rehace solo cuando cambia el Dockerfile.

Para otra cobertura, agregá variables de build:

```
BBOX=-77.35,-12.55,-76.60,-11.60   # default (Lima). Vacío = región completa
REGION=peru
CONTINENT=south-america
```

### 4. `vroom`

- **Dockerfile Path**: `docker/vroom/Dockerfile`
- **Networking**: solo privado

```
OSRM_HOST=osrm.railway.internal
OSRM_PORT=5000
VROOM_THREADS=2        # vCPU compartida en el trial; 4 solo si pagás
```

### 5. `centrifugo`

- **Dockerfile Path**: `docker/centrifugo/Dockerfile`
- **Networking**: **dominio público** (lo abre el navegador)

```
CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY = <mismo valor que CENTRIFUGO_TOKEN_HMAC_SECRET_KEY de la app>
CENTRIFUGO_HTTP_API_KEY                 = <mismo valor que CENTRIFUGO_API_KEY de la app>
CENTRIFUGO_CLIENT_ALLOWED_ORIGINS       = https://<dominio-de-app>.up.railway.app
```

Healthcheck: `/health`.

### 6. `app`

- **Dockerfile Path**: `Dockerfile`
- **Networking**: **dominio público**

`NEXT_PUBLIC_CENTRIFUGO_WS_URL` es **build arg**, no solo variable de runtime:
las `NEXT_PUBLIC_*` se inlinean en el bundle del cliente durante el build. Si
la agregás después de construir, el navegador queda sin URL. Railway pasa las
variables del servicio como build args, así que definila **antes** del primer
deploy.

---

## Variables de la app

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Neon (`us-east-1`) |
| `JWT_SECRET` | **nuevo**, ≥32 chars, distinto al de desarrollo |
| `REDIS_URL` | la privada del servicio Redis |
| `VROOM_URL` | `http://vroom.railway.internal:3000` |
| `OSRM_URL` | `http://osrm.railway.internal:5000` |
| `VROOM_TIMEOUT` / `OSRM_TIMEOUT` | `60000` / `30000` |
| `CENTRIFUGO_URL` | `http://centrifugo.railway.internal:8000` |
| `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` | igual que en el servicio Centrifugo |
| `CENTRIFUGO_API_KEY` | igual que en el servicio Centrifugo |
| `CENTRIFUGO_ALLOWED_ORIGIN` | `https://<dominio-de-app>.up.railway.app` |
| `NEXT_PUBLIC_CENTRIFUGO_WS_URL` | `wss://<dominio-de-centrifugo>.up.railway.app/connection/websocket` |
| `R2_*` | las cinco de Cloudflare R2 |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` | las tuyas |
| `NODE_ENV` | `production` |

`getSecretKey()` (`src/lib/auth/auth.ts`) **rechaza** los placeholders del
`.env.example`: si copiás el `JWT_SECRET` de desarrollo, el login devuelve 500.

Las migraciones no corren solas — `bun run db:migrate` desde tu máquina contra
la misma `DATABASE_URL`.

---

## Verificación

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<app>.up.railway.app/login
curl -s https://<centrifugo>.up.railway.app/health
```

Luego, en la app: entrar, importar pedidos, correr una optimización (ejercita
VROOM→OSRM por la red privada) y abrir Monitoreo (ejercita el WebSocket).

Si el realtime cae a polling sin error visible, mirá la consola del navegador:
un bloqueo de CSP sobre el origen de Centrifugo es la causa típica y significa
que `NEXT_PUBLIC_CENTRIFUGO_WS_URL` no estaba presente **en el build**.

---

## Estado real (2026-08-29)

Lo de arriba describe el stack entero en Railway. Hoy está partido: `app` corre
en Vercel y en Railway quedaron sólo los que Vercel no puede hospedar bien.

| Servicio | Dónde | Consumo medido (7 días) |
|---|---|---|
| `app` | Vercel | — |
| `osrm` | Railway | 13,7 MB medios → **~$0,14/mes** |
| `vroom` | Railway | 2,8 MB medios → **~$0,03/mes** |
| `centrifugo` | Railway (movido 2026-08-30) | ~32 MB → **~$0,35/mes** |
| `redis` | Upstash | — |

Los promedios son bajísimos porque duermen: el consumo se cobra por minuto
encendido, y sin tráfico no hay minutos. La cuenta está en el plan **Free**,
que da **$1/mes que no se acumula** y **exige `sleepApplication: true`** en
todos los servicios (Railway rechaza la config sin eso).

**Por qué se mueve Centrifugo.** En Vercel corre como container service y los
WebSockets abiertos le impiden escalar a cero: está encendido las 24 horas
consumiendo CPU activa, que es como factura el plan Hobby. En Railway el app
sleeping sí lo apaga cuando no queda ninguna conexión — de noche y fines de
semana no cuesta nada. Con conexiones activas no duerme: la
[doc de Railway](https://docs.railway.com/guides/rabbitmq-producers-consumers)
lo dice para cualquier conexión persistente, porque el heartbeat cuenta como
tráfico saliente.

> **Los deploys del free tier en us-west2 están bloqueados entre las 8:00 y las
> 20:00 de Los Ángeles** (10:00–22:00 en Perú), y cambiar de región es función
> de pago. El límite es sólo para desplegar: una vez arriba, los servicios
> responden a cualquier hora.

**Centrifugo: dejar que mande el Dockerfile.** El `startCommand` de Railway
pisa el `CMD` de la imagen y **no expande variables**: un `${PORT}` ahí llega
literal y Centrifugo aborta con `'http_server.port' cannot parse value as
'int'`, en bucle, hasta que el deploy se da por fallido. El `CMD` del
Dockerfile sí lo expande porque es un `sh -c` real. Con `startCommand` vacío y
el builder en `Dockerfile.vercel` arranca a la primera; el dominio se genera
con `targetPort: 8000`, que es donde escucha.

Ojo también con la fuente: un `connect-service-source --image` deja
`source.image` fijo aunque el deploy se rechace, y a partir de ahí ignora el
Dockerfile. `railway up` la devuelve a los archivos del repo.

---

## Estirar el crédito

Los ~355 MB del stack cuestan ~$3,6/mes de RAM, así que el crédito de $5 da
justo para el mes de trial — pero el CPU se cobra aparte ($20/vCPU/mes) y cada
optimización lo consume. Para que rinda más:

- **Pausá `osrm` y `vroom` cuando no probás optimización.** Son dos tercios
  del consumo de RAM y solo hacen falta al planificar. La app arranca sin ellos;
  lo único que falla es optimizar, y falla ruidosamente (no hay fallback:
  ADR-0001).
- **Pausá el proyecto entero** entre sesiones de prueba.
- `VROOM_THREADS=2` en vez de 4: con vCPU compartida, más hilos no aceleran.

---

## Migrar al VPS

Los cuatro Dockerfiles sirven igual; cambia quién los orquesta.

En el VPS **sí podés levantar Perú completo**: `BBOX=""` en el build de OSRM y
1,21 GiB de RAM disponibles. Pero conviene tener claro qué gana eso:

- **Gana cobertura**: repartir fuera de Lima. Hoy, fuera del bbox no hay ruta.
- **No gana precisión**: dentro de Lima el mapa recortado devuelve las mismas
  rutas, y la matriz de 1000×1000 tarda 8,1 s en vez de 14,8 s.

O sea: ampliá el bbox cuando repartas en otra ciudad, no "por las dudas" —
cargar el país entero para operar en 311 km² cuesta 5× la RAM y el doble de
tiempo por matriz, a cambio de nada.

En el VPS, además, Centrifugo vuelve detrás del reverse proxy en el mismo
origen que la app (ver [`deployment-centrifugo.md`](./deployment-centrifugo.md)):
ahí `NEXT_PUBLIC_CENTRIFUGO_WS_URL` apunta a tu propio dominio y la CSP no
necesita una entrada extra.
