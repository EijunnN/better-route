# BetterRoute

**Plataforma de optimización de rutas y operación de entregas de última milla.**

Planifica rutas óptimas sobre la red vial real, despacha a tus conductores,
sigue cada entrega en vivo y dale visibilidad al cliente final — todo
autohospedado, en tu propia infraestructura y siendo dueño de tus datos.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Bun](https://img.shields.io/badge/Bun-1.x-000?logo=bun)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![VROOM](https://img.shields.io/badge/VROOM-routing-green)
![License](https://img.shields.io/badge/License-MIT-yellow?logo=opensourceinitiative)

---

## Tabla de contenidos

- [¿Por qué BetterRoute?](#por-qué-betterroute)
- [Funcionalidades destacadas](#funcionalidades-destacadas)
- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Requisitos](#requisitos)
- [Cómo levantar el proyecto](#cómo-levantar-el-proyecto)
- [Variables de entorno](#variables-de-entorno)
- [Roles y permisos (RBAC)](#roles-y-permisos-rbac)
- [App móvil del conductor](#app-móvil-del-conductor)
- [Internacionalización (i18n)](#internacionalización-i18n)
- [Roadmap](#roadmap)
- [Licencia](#licencia)

---

## ¿Por qué BetterRoute?

Operar entregas de última milla a escala es difícil: hay que **planificar**
rutas que respeten capacidad, ventanas horarias, habilidades y jornada de cada
conductor; **despachar** y reasignar sobre la marcha; **acompañar** al conductor
en la calle; y **dar visibilidad** al cliente final — sin perder el control de
los datos ni de los costos.

La mayoría de las herramientas para esto son servicios cerrados: tus datos
viven en infraestructura ajena y el costo crece con cada conductor que sumas.

**BetterRoute nació para resolver eso de raíz:** una plataforma completa que
hace **optimización + despacho + app del conductor + seguimiento al cliente**
en un solo lugar, pensada para **autohospedarse**. La corres en tu propio
servidor, los datos son tuyos, y el costo no depende de cuántos conductores
tengas.

Principios de diseño que guían el proyecto:

- **Real, no aproximado.** Las distancias y tiempos salen de la red vial
  (OSRM), no de la línea recta.
- **Cristalizar antes que configurar.** El flujo de entrega es un contrato
  fijo y predecible (4 estados); lo que cambia por empresa son las *políticas*
  (etiquetas, motivos de fallo, requisitos de foto) y los *campos
  personalizados*, no la máquina de estados. Menos sorpresas en producción.
- **Determinista y verificable.** Cada plan pasa por un *verifier*
  independiente del solver que confirma que se cumplen las restricciones antes
  de confirmarlo.
- **Dueño de tus datos.** Single-tenant por instalación: una empresa, su
  propio despliegue, su propia base de datos.

---

## Funcionalidades destacadas

### Optimización de rutas (motor VROOM + OSRM)
- **Escala real:** 1000+ paradas por plan, con batching por zona
  (`createZoneBatches`) para que un vehículo no cruce sus límites de servicio.
- **Distancias de red vial** vía OSRM (matriz de tiempos/distancias reales).
- **Restricciones avanzadas:** capacidad (peso / volumen / unidades / valor),
  ventanas horarias (con tolerancia flexible), **habilidades requeridas**
  (ej. refrigerado, carga pesada), **jornada laboral del vehículo** con
  **descanso/almuerzo como ventana flexible** (VROOM coloca el descanso donde
  mejor encaje), distancia máxima por ruta y factor de tráfico.
- **Verifier independiente del solver:** valida violaciones HARD / SOFT / INFO
  (ventanas, jornada, descanso, habilidades, capacidad) y explica el *porqué*
  de cada pedido que no se pudo asignar.
- **Presets de optimización** reutilizables (tráfico, distancia máxima,
  ventanas flexibles, rutas abiertas, balance de carga, minimización de
  vehículos).
- **Swap de vehículos** entre rutas con reoptimización automática.

### Gestión de pedidos
- Importación masiva por **CSV/Excel** con mapeo de columnas reutilizable.
- **Reversión de pedidos** con máquina de estados explícita y auditada:
  desasignar de un plan, reabrir una parada, reactivar un fallido o revertir
  una entrega (con permiso elevado) — todo transaccional, con *optimistic
  locking* e historial append-only (`order_status_history`).
- Cancelación definitiva con categoría y motivo.
- Evidencia fotográfica y captura de GPS en cada visita.

### Planificación y despacho
- Asignación de conductores **manual** o por **sugerencia** (scoring por
  habilidades, licencia, flota, carga).
- **Reasignación** de paradas entre conductores.
- Confirmación de planes que materializa las `route_stops` para la app.

### Monitoreo en vivo
- Mapa con **posición GPS de los conductores** y trazado de rutas.
- Panel de eventos y **alertas** configurables.
- **Tiempo real** vía Centrifugo (WebSocket): los cambios de estado de parada
  se reflejan al instante en el dashboard.
- Aislamiento multi-tenant verificado en cada endpoint.

### Seguimiento público (tracking)
- Página pública por **token único**: el cliente final ve el estado de su
  entrega, el mapa y el conductor — sin cuenta. Controlado por un interruptor
  de privacidad por empresa (`trackingEnabled`).

### Chat despacho ↔ conductor
- Mensajería en tiempo real (Centrifugo) + **notificaciones push** (OneSignal),
  incluyendo **broadcast de emergencia** a toda la flota.

### Personalización por empresa
- **Campos personalizados** dinámicos (texto, número, select, fecha, moneda,
  teléfono, email, booleano) — definidos desde la UI, validados server-side y
  renderizados en formularios, tablas, import CSV y la app móvil.
- **Política de entrega** por empresa: etiquetas y colores de estado,
  requisitos de foto/firma/notas, y **lista de motivos de no-entrega** (texto
  libre que el conductor elige y se guarda verbatim).

### Multi-tenant + RBAC tipado
- Aislamiento de datos por empresa (header `x-company-id` validado contra el
  JWT).
- **Contrato de permisos tipado** (`EntityType` × `Action`) único entre
  servidor y cliente: imposible escribir un permiso inválido (error de
  compilación).
- Roles legacy + **roles personalizados por empresa** desde `/roles`.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                            CLIENTES                                │
│   Web (Next.js / React 19)   ·   App Flutter   ·   Tracking público │
└───────────────┬───────────────────┬───────────────────┬───────────┘
                │                   │                   │
                ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND — Next.js API Routes                   │
│   /api/auth · /api/orders · /api/optimization · /api/route-stops   │
│   /api/monitoring · /api/mobile/driver · /api/chat · /api/tracking │
└───────────────┬───────────────────┬──────────────┬────────────────┘
                │                   │              │
        ┌───────┴──────┐   ┌────────┴──────┐  ┌────┴───────────┐
        │  PostgreSQL  │   │ Upstash Redis │  │ Cloudflare R2  │
        │  (Drizzle)   │   │    (cache)    │  │   (evidencia)  │
        └──────────────┘   └───────────────┘  └────────────────┘
                │
   ┌────────────┼─────────────┬──────────────────┐
   ▼            ▼             ▼                  ▼
┌──────┐   ┌────────┐   ┌────────────┐   ┌──────────────┐
│ VROOM│   │  OSRM  │   │ Centrifugo │   │  OneSignal   │
│ (VRP)│   │ (red   │   │ (realtime  │   │   (push)     │
│      │   │  vial) │   │  WebSocket)│   │              │
└──────┘   └────────┘   └────────────┘   └──────────────┘
```

**Patrón de la app web** — *compound components*:
`Provider > State / Actions / Derived / Meta`, con barrels (`index.ts`) por
feature. **Cadena de layout:** `AppShell > ThemeProvider > PermissionsProvider
> CompanyProvider > LayoutProvider`.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Web | Next.js 16 (App Router, Turbopack), React 19, TailwindCSS, shadcn/ui |
| Estado / datos | SWR + hooks de dominio sobre `useApiData` |
| Mapas | MapLibre GL |
| Backend | Next.js API Routes (Bun) |
| Base de datos | PostgreSQL (Neon) + Drizzle ORM |
| Cache | Upstash Redis |
| Almacenamiento | Cloudflare R2 (S3-compatible) |
| Auth | JWT (cookies) |
| Optimización | VROOM (solver VRP) + OSRM (red vial) |
| Tiempo real | Centrifugo (WebSocket) |
| Push | OneSignal |
| App móvil | Flutter + Riverpod |
| Tests / lint | Bun Test (integración) · Biome |

---

## Requisitos

**Desarrollo**
- **Bun** 1.x
- **PostgreSQL** 15+
- **Docker** (para VROOM + OSRM + Centrifugo)
- ~4 GB RAM, 2 vCPU

**Producción (referencia)**
- VPS con 8 GB RAM, 4 vCPU
- SSD 50 GB+ (los mapas de OSRM ocupan espacio)
- Redis (Upstash o self-hosted)
- Almacenamiento S3-compatible (Cloudflare R2 / MinIO)

---

## Cómo levantar el proyecto

### 1. Dependencias

```bash
bun install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Edita .env con tus valores (ver "Variables de entorno" más abajo)
```

### 3. Datos de OSRM (red vial)

Descarga el mapa de tu país/región (ejemplo: Perú) y procésalo una vez:

```bash
mkdir -p docker/osrm && cd docker/osrm
wget https://download.geofabrik.de/south-america/peru-latest.osm.pbf

docker run -t -v "$(pwd):/data" osrm/osrm-backend osrm-extract  -p /opt/car.lua /data/peru-latest.osm.pbf
docker run -t -v "$(pwd):/data" osrm/osrm-backend osrm-partition  /data/peru-latest.osrm
docker run -t -v "$(pwd):/data" osrm/osrm-backend osrm-customize  /data/peru-latest.osrm
cd ../..
```

> Otros mapas: <https://download.geofabrik.de/>

### 4. Servicios en Docker (routing + realtime)

```bash
docker compose --profile routing up -d   # OSRM (5001) + VROOM (5000)
docker compose up -d centrifugo           # Centrifugo (8000)
```

### 5. Base de datos

> **Importante:** se usa `db:generate` + `db:migrate`. **Nunca `db:push`.**

```bash
bun run db:migrate     # aplica las migraciones
bun run db:seed        # (opcional) catálogo RBAC + datos de ejemplo
```

Para generar una migración nueva tras cambiar el schema:

```bash
bun run db:generate    # crea el SQL en drizzle/
bun run db:migrate     # lo aplica
```

### 6. Levantar la app

```bash
bun run dev            # http://localhost:3000  (Turbopack)
# Producción:
bun run build && bun run start
```

### 7. Primer ingreso

El **onboarding** crea la primera empresa + sus roles. Si cargaste el seed, hay
un administrador del sistema de ejemplo (revisa `src/db/seed.ts` para las
credenciales por defecto) — **cámbialo en producción**.

### Comandos útiles

```bash
bun test                       # tests (integración → requieren Postgres arriba)
bun test src/tests/unit        # solo unit tests
bun run tsc --noEmit           # type-check
bun run lint                   # Biome
bun run db:studio              # Drizzle Studio
```

---

## Variables de entorno

Todas viven en [`.env.example`](./.env.example). Resumen:

| Variable | Para qué |
|----------|----------|
| `DATABASE_URL` | Conexión PostgreSQL |
| `JWT_SECRET` | Firma de los JWT (cambiar en producción) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Cache (Upstash Redis) |
| `VROOM_URL` / `OSRM_URL` / `*_TIMEOUT` | Motores de optimización y red vial |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | Almacenamiento de evidencia (Cloudflare R2) |
| `CENTRIFUGO_URL` / `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` / `CENTRIFUGO_API_KEY` / `CENTRIFUGO_ALLOWED_ORIGIN` | Realtime (servidor) |
| `NEXT_PUBLIC_CENTRIFUGO_WS_URL` | WebSocket del navegador (en prod se deja vacío: same-origin tras el reverse proxy) |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` | Push de chat al conductor |
| `NEXT_PUBLIC_ENABLE_PLAYGROUND` | Playground de datos de prueba (dev). **Nunca en prod.** |

> Para el despliegue: las notificaciones push solo salen si `ONESIGNAL_APP_ID`
> coincide con el de la app móvil y `ONESIGNAL_REST_API_KEY` está configurada.

---

## Roles y permisos (RBAC)

| Rol | Alcance |
|-----|---------|
| `ADMIN_SISTEMA` | Acceso total (wildcard), multi-empresa |
| `ADMIN_FLOTA` | Flota, vehículos, conductores, habilidades, zonas + configuración de empresa |
| `PLANIFICADOR` | Pedidos (CRUD + import + bulk delete + cancelar + revertir), planes, asignación de rutas |
| `MONITOR` | Lectura + accionar alertas + cambiar estado de paradas desde la web |
| `CONDUCTOR` | Solo sus paradas, actualizadas desde la app móvil |

Cada empresa puede crear **roles personalizados** desde `/roles`. Los permisos
efectivos son la unión del rol legacy base + los custom roles, aplicada
server-side en una sola consulta. El contrato tipado vive en
[`src/lib/auth/permissions/`](./src/lib/auth/permissions/README.md) — léelo
antes de tocar cualquier botón mutativo o ruta API.

---

## App móvil del conductor

La app **Flutter** (Android/iOS) es el *cockpit* del conductor: agenda del día,
navegación, cierre de entregas con evidencia, **cola offline a prueba de zonas
sin señal**, tracking GPS y chat con despacho. Su documentación y setup están en
su propio `README.md`. Consume `GET /api/mobile/driver/*` + `PATCH
/api/route-stops/:id` + `/api/chat/*` + `/api/upload/presigned-url`.

---

## Internacionalización (i18n)

Hoy la interfaz y los textos de la plataforma están en **español** (mercado
LATAM). La arquitectura ya facilita la traducción futura: buena parte de los
textos de cara al cliente (motivos de no-entrega, etiquetas de estado) son
**datos por empresa** (política de entrega), no strings hardcodeados.

**En el roadmap:** adoptar i18n para poder traducir todo a cualquier idioma.

- **Web:** extraer los strings de UI a catálogos de mensajes (ej. `next-intl`)
  con detección de locale por usuario/empresa.
- **App móvil:** `flutter_localizations` + `gen-l10n` con archivos `.arb` por
  idioma.
- **Datos por empresa:** mantener etiquetas y motivos traducibles desde la
  configuración, para que cada operación los muestre en su idioma.

El objetivo es que la misma plataforma sirva a operaciones en cualquier región
sin tocar código.

---

## Roadmap

- ✅ RBAC tipado end-to-end (contrato único server/cliente, custom roles)
- ✅ Campos personalizados por empresa
- ✅ Presets de optimización + swap de vehículos
- ✅ Tracking público por token
- ✅ Jornada laboral + descansos en el solver (con verifier)
- ✅ Reversión de pedidos auditada (máquina de estados de orden)
- ✅ Chat realtime + push, monitoreo en vivo
- 🔜 Internacionalización (i18n) — UI y datos traducibles a cualquier idioma
- 🔜 Reoptimización en vivo ante incidentes del conductor
- 🔜 ETA en tiempo real al cliente final
- 🔜 Reportes y analytics históricos (cumplimiento, tiempos, costos)
- 🔜 Debuggabilidad completa de descansos (placement del break en el plan)

---

## Agradecimientos

- [VROOM](https://github.com/VROOM-Project/vroom) — solver de optimización
- [OSRM](https://project-osrm.org/) — enrutamiento sobre red vial
- [Next.js](https://nextjs.org/) · [Drizzle ORM](https://orm.drizzle.team/) ·
  [shadcn/ui](https://ui.shadcn.com/) · [MapLibre](https://maplibre.org/) ·
  [Centrifugo](https://centrifugal.dev/)

---

## Licencia

Distribuido bajo la [Licencia MIT](LICENSE).

<div align="center">

**BetterRoute** — Optimiza tus entregas, no tu presupuesto.

</div>
