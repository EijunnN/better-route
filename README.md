# BetterRoute

**Sistema de Optimizacion de Rutas y Gestion de Entregas**

Una alternativa open-source a SimpliRoute, OptimoRoute y LogiNext — sin costos por conductor.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![VROOM](https://img.shields.io/badge/VROOM-1.14-green)
![License](https://img.shields.io/badge/License-MIT-yellow?logo=opensourceinitiative)

---

## Tabla de Contenidos

- [Por que BetterRoute?](#por-que-betterroute)
- [Caracteristicas](#caracteristicas)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalacion](#instalacion)
- [Configuracion](#configuracion)
- [Uso](#uso)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Base de Datos](#base-de-datos)
- [API Reference](#api-reference)
- [App Movil](#app-movil)
- [Roadmap](#roadmap)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Por que BetterRoute?

### El Problema

Las empresas de logistica y distribucion enfrentan un problema critico: las soluciones SaaS de optimizacion de rutas como **SimpliRoute**, **OptimoRoute** o **LogiNext** cobran **por conductor activo**, lo que resulta en costos prohibitivos:

| Solucion | Precio por conductor/mes | 50 conductores/mes |
|----------|--------------------------|-------------------|
| SimpliRoute | ~$35-50 USD | **$1,750 - $2,500** |
| OptimoRoute | ~$40-60 USD | **$2,000 - $3,000** |
| LogiNext | ~$50-80 USD | **$2,500 - $4,000** |
| **BetterRoute** | $0 (self-hosted) | **$0 + hosting** |

### La Solucion

**BetterRoute** es un sistema completo de optimizacion de rutas que puedes hospedar en tu propia infraestructura. Pagas solo por el servidor (desde ~$20/mes en un VPS) sin importar cuantos conductores tengas.

**Ahorro potencial:** Una empresa con 50 conductores puede ahorrar **$24,000 - $48,000 USD al ano**.

---

## Caracteristicas

### Optimizacion de Rutas
- **Motor VROOM + OSRM** — Rapido y escalable, ideal para operaciones de ultima milla con 1000+ paradas por plan
- **Distancias reales** — Calculo basado en red vial via OSRM, no linea recta
- **Zonas con isolation hard** — La planificacion se particiona por zona (`createZoneBatches`) para que un vehiculo no cruce limites de servicio
- **Verifier independiente del solver** — Capa de validacion HARD/SOFT/INFO que confirma que las rutas cumplen las restricciones antes de confirmarse
- **Presets de optimizacion** — Configuraciones reutilizables (factor de trafico, distancia maxima, ventanas flexibles, rutas abiertas, balance de carga, etc.)
- **Intercambio de vehiculos** — Swap completo de rutas entre vehiculos con reoptimizacion automatica
- **Restricciones avanzadas:**
  - Capacidad de vehiculos (peso, volumen, bultos)
  - Ventanas horarias de entrega (con tolerancia flexible configurable)
  - Habilidades requeridas (cadena de frio, carga pesada, etc.)
  - Horarios de trabajo de conductores
  - Zonas de servicio
  - Distancia maxima por ruta
  - Factor de trafico configurable (0-100%)
  - Rutas abiertas (sin retorno a origen)
  - Minimizacion de vehiculos basada en capacidad real

### Gestion de Pedidos
- Importacion masiva desde CSV/Excel
- Geocodificacion automatica de direcciones
- Estados de entrega en tiempo real
- Evidencia fotografica de entregas
- Motivos de no entrega configurables

### Gestion de Flotas
- Vehiculos con capacidades y restricciones
- Asignacion de conductores
- Historial de mantenimiento
- Seguimiento GPS en tiempo real

### Campos Personalizados (Custom Fields)
- Cada empresa define sus propios campos en pedidos sin cambios de codigo
- Tipos: `text`, `number`, `select`, `date`, `currency`, `phone`, `email`, `boolean`
- Configurables por visibilidad: tabla, app movil, CSV import
- Validacion automatica (min/max, required, pattern)
- Renderizado dinamico en formularios, tablas, CSV import y app movil

### Workflow States Custom
- Cada empresa define sus propios estados de entrega
- Transiciones configurables entre estados
- Requisitos por estado: foto, firma, motivo, notas
- Colores e iconos personalizables
- Integrado con app movil Flutter

### Multi-Empresa (SaaS-ready)
- Aislamiento completo de datos por empresa (JWT-cross-validated)
- Sistema RBAC end-to-end con permisos tipados (TypeScript template literal)
- Roles legacy predefinidos + roles personalizables por empresa via UI `/roles`
- Perfiles de optimizacion por empresa

### RBAC Tipado
- **Contrato unificado server/cliente** — `EntityType`, `Action` y `Permission` en `src/lib/auth/permissions/` son la unica fuente de verdad
- **Gating UI declarativo** — `<Can perm="order:update">` esconde botones segun permiso
- **Fail-closed por defecto** — `<ProtectedPage>` deniega si olvidas declarar `requiredPermission`
- **Custom roles dinamicos** — Los permisos adicionales asignados via DB se aplican tanto en UI como en enforcement server
- **Imposible typear mal** — `<Can perm="order:edit">` es error de compilacion (`Action.EDIT` no existe)

### Monitoreo en Tiempo Real
- Mapa con ubicacion de conductores
- Estado de entregas actualizado
- Alertas configurables
- Dashboard con metricas clave

### App Movil (Flutter)
- Visualizacion de ruta asignada
- Navegacion integrada (Google Maps/Waze)
- Captura de evidencia
- Envio de ubicacion GPS al servidor
- Funciona offline (cola de sincronizacion)

---

## Arquitectura

```
+------------------------------------------------------------------+
|                         FRONTEND                                  |
|  +----------------+  +----------------+  +------------------+     |
|  |  Next.js Web   |  |  Flutter App   |  |   API Clients    |     |
|  |   (React 19)   |  |  (Android/iOS) |  |  (Integraciones) |     |
|  +-------+--------+  +-------+--------+  +--------+---------+     |
+----------|-------------------|---------------------|---------------+
           |                   |                     |
           v                   v                     v
+------------------------------------------------------------------+
|                         BACKEND                                   |
|  +--------------------------------------------------------------+ |
|  |                    Next.js API Routes                        | |
|  |  * /api/auth/*           * /api/orders/*                     | |
|  |  * /api/optimization/*   * /api/mobile/driver/*              | |
|  |  * /api/monitoring/*     * /api/vehicles/*                   | |
|  +--------------------------------------------------------------+ |
|                              |                                    |
|              +---------------+---------------+                    |
|              v               v               v                    |
|  +-------------+ +-------------+ +------------------+             |
|  | PostgreSQL  | |    Redis    | |  Cloudflare R2   |             |
|  |  (Drizzle)  | |  (Upstash)  | |   (S3 Storage)   |             |
|  +-------------+ +-------------+ +------------------+             |
+------------------------------------------------------------------+
           |
           v
+------------------------------------------------------------------+
|                    ROUTING ENGINES                                |
|  +-------------------------------+  +--------------------------+ |
|  |            VROOM              |  |           OSRM           | |
|  |  (Fast VRP, zone-batched,     |  |  (Road network distance  | |
|  |   1000+ orders per plan)      |  |   and duration matrix)   | |
|  +-------------------------------+  +--------------------------+ |
+------------------------------------------------------------------+
```

---

## Requisitos

### Minimos (Desarrollo)
- **Bun** 1.0+ (recomendado) o **Node.js** 20+
- **PostgreSQL** 15+
- **Docker** (para VROOM + OSRM)
- 4GB RAM, 2 CPU cores

### Recomendados (Produccion)
- **VPS** con 8GB RAM, 4 CPU cores
- **SSD** 50GB+ (para mapas OSRM)
- **Redis** (Upstash o self-hosted)
- **S3-compatible storage** (Cloudflare R2, MinIO)

---

## Instalacion

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/betterroute.git
cd betterroute
```

### 2. Instalar dependencias

```bash
# Con Bun (recomendado)
bun install

# O con npm
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
# Base de datos PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/betterroute

# JWT Secret (genera uno seguro para produccion)
JWT_SECRET=tu-secreto-super-seguro-minimo-32-caracteres

# Redis para cache (opcional pero recomendado)
UPSTASH_REDIS_REST_URL=https://tu-instancia.upstash.io
UPSTASH_REDIS_REST_TOKEN=tu-token

# Motores de rutas
VROOM_URL=http://localhost:5000
OSRM_URL=http://localhost:5001

# Cloudflare R2 para almacenamiento (fotos de evidencia)
R2_ACCOUNT_ID=tu-account-id
R2_ACCESS_KEY_ID=tu-access-key
R2_SECRET_ACCESS_KEY=tu-secret-key
R2_BUCKET_NAME=betterroute-files
R2_PUBLIC_URL=https://tu-bucket.tu-dominio.com
```

### 4. Configurar OSRM (Motor de rutas)

Descarga los datos de tu pais/region:

```bash
# Crear directorio para datos
mkdir -p docker/osrm
cd docker/osrm

# Descargar mapa (ejemplo: Peru)
wget https://download.geofabrik.de/south-america/peru-latest.osm.pbf

# Procesar mapa (puede tardar 10-30 minutos)
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/peru-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/peru-latest.osrm
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-customize /data/peru-latest.osrm

cd ../..
```

**Mapas disponibles:** https://download.geofabrik.de/

### 5. Iniciar servicios de routing

```bash
docker compose --profile routing up -d
```

Esto inicia:
- **OSRM** en `http://localhost:5001` — calculo de distancias/tiempos
- **VROOM** en `http://localhost:5000` — optimizacion de rutas

### 6. Configurar base de datos

```bash
# Ejecutar migraciones
bun run db:migrate

# Cargar datos de ejemplo (opcional)
bun run db:seed
```

### 7. Iniciar la aplicacion

```bash
# Desarrollo
bun run dev

# Produccion
bun run build
bun run start
```

La aplicacion estara disponible en `http://localhost:3000`

### 8. Credenciales por defecto

Despues de `bun run db:seed`:

| Rol | Email | Contrasena |
|-----|-------|------------|
| Admin Sistema | `admin@planeamiento.com` | `admin123` |

Para crear un set completo de usuarios de prueba (uno por rol legacy,
todos sobre una empresa `TestCo RBAC`), usa el script de verificacion:

```bash
bun run scripts/create-test-users.ts
```

Eso provisiona:

| Rol | Email | Contrasena |
|-----|-------|------------|
| ADMIN_SISTEMA | `admin@test.local` | `test123` |
| ADMIN_FLOTA | `adminflota@test.local` | `test123` |
| PLANIFICADOR | `planificador@test.local` | `test123` |
| MONITOR | `monitor@test.local` | `test123` |
| CONDUCTOR | `conductor@test.local` | `test123` |

Para verificar que el camino de custom roles (roles dinamicos via DB)
funciona correctamente end-to-end:

```bash
bun run scripts/verify-custom-role.ts
```

> **Importante:** Cambia estas contrasenas en produccion.

---

## Configuracion

### Perfiles de Empresa

Cada empresa puede configurar:

- **Campos de pedido** — Que columnas mostrar en CSV
- **Restricciones de vehiculos** — Capacidad, peso maximo, etc.
- **Parametros de optimizacion** — Balance velocidad/calidad
- **Ventanas horarias** — Presets reutilizables

### Roles y Permisos

| Rol | Descripcion |
|-----|-------------|
| `ADMIN_SISTEMA` | Acceso total (wildcard), gestion multi-empresa |
| `ADMIN_FLOTA` | Flota, vehiculos, conductores, skills, zonas + configuracion de empresa (workflow, custom fields, presets) |
| `PLANIFICADOR` | Pedidos (CRUD + import + bulk delete), planes (create/update/confirm/cancel), asignacion de rutas |
| `MONITOR` | Lectura + accionar alertas + actualizar status de paradas desde la web |
| `CONDUCTOR` | Solo sus rutas asignadas, update de status de paradas desde la app movil |

Ademas de los roles legacy, cada empresa puede crear **roles personalizados**
desde `/roles` con permisos toggleables por entidad x accion. Los permisos
resultantes son la **union** del rol legacy base + los custom roles asignados.
El enforcement server-side aplica ambos en una sola consulta.

Para el patron completo (como agregar una feature con RBAC, anti-patterns,
convenciones), ver [`src/lib/auth/permissions/README.md`](./src/lib/auth/permissions/README.md).

---

## Estructura del Proyecto

```
planeamiento/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Paginas de autenticacion
│   │   ├── (protected)/       # Paginas protegidas
│   │   │   ├── dashboard/
│   │   │   ├── orders/
│   │   │   ├── vehicles/
│   │   │   ├── planificacion/
│   │   │   ├── monitoring/
│   │   │   ├── custom-fields/ # Admin campos personalizados
│   │   │   ├── workflow/      # Config workflow states
│   │   │   └── ...
│   │   └── api/               # API Routes (~70 handlers)
│   │       ├── auth/
│   │       ├── orders/
│   │       ├── companies/     # CRUD empresas + field definitions
│   │       ├── optimization/  # Jobs, config, swap, confirm, reassign
│   │       ├── mobile/        # APIs para app movil
│   │       └── monitoring/
│   ├── components/            # Componentes React
│   │   ├── ui/               # shadcn/ui components
│   │   ├── layout/           # AppShell, Sidebar, CompanyProvider
│   │   ├── custom-fields/    # Admin campos personalizados
│   │   ├── orders/           # Formularios y tablas de ordenes
│   │   ├── monitoring/       # Vista monitoreo con mapa
│   │   └── optimization/     # Dashboard con swap, presets, resultados
│   ├── db/                    # Drizzle ORM
│   │   ├── schema.ts         # Definicion de tablas
│   │   └── seed.ts           # Datos de ejemplo
│   ├── tests/                 # Tests de integracion
│   │   └── integration/      # 170+ tests, real PostgreSQL
│   └── lib/                   # Logica de negocio
│       ├── auth/             # Autenticacion + RBAC
│       │   ├── permissions/  # Contrato tipado (EntityType, Action, Permission)
│       │   └── authorization.ts  # Role permissions matrix + DB checks
│       ├── optimization/     # VROOM adapter, runner, verifier
│       ├── orders/           # Profile schema, CSV import pipeline
│       ├── geo/              # Zone batching, OSRM matrix helpers
│       ├── custom-fields/    # Validacion y seed de campos custom
│       ├── workflow/         # Seed de workflow states
│       ├── infra/            # Infraestructura (cache, tenant, api-middleware)
│       └── services/         # Servicios externos (VROOM, S3)
├── scripts/                   # Scripts operativos
│   ├── create-test-users.ts  # Seed idempotente de users por rol
│   └── verify-custom-role.ts # E2E verification del merge legacy + custom roles
├── drizzle/                   # Migraciones SQL
├── docker/                    # Configuracion Docker
│   ├── osrm/                 # Datos de mapas
│   └── vroom/                # Config VROOM
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## Base de Datos

### Migraciones

```bash
# Ver estado de migraciones
bun run db:studio

# Generar nueva migracion
bun run db:generate --name nombre_descriptivo

# Aplicar migraciones pendientes
bun run db:migrate

# Sincronizar schema (desarrollo)
bun run db:push
```

### Tablas Principales

| Tabla | Descripcion |
|-------|-------------|
| `companies` | Empresas/tenants |
| `users` | Usuarios y conductores |
| `vehicles` | Vehiculos de la flota |
| `fleets` | Flotas/grupos de vehiculos |
| `orders` | Pedidos a entregar |
| `optimization_jobs` | Trabajos de optimizacion |
| `route_stops` | Paradas de ruta confirmadas |
| `driver_locations` | Historial de ubicaciones GPS |
| `company_workflow_states` | Estados de workflow custom por empresa |
| `company_workflow_transitions` | Transiciones entre estados |
| `company_field_definitions` | Campos personalizados por empresa |
| `roles` / `permissions` | Sistema RBAC |

### Historial de Migraciones

| Archivo | Descripcion |
|---------|-------------|
| `0000_amused_night_nurse.sql` | Schema inicial completo |
| `0001_stormy_ironclad.sql` | Ajustes menores |
| `0002_white_rumiko_fujikawa.sql` | Alertas y notificaciones |
| `0003_brave_secret_warriors.sql` | Historial de estados |
| `0004_kind_post.sql` | Campos adicionales |
| `0005_add-vehicle-skill-assignments.sql` | Habilidades de vehiculos |
| `0006_add_driver_locations.sql` | Tracking GPS de conductores |

---

## API Reference

### Autenticacion

```bash
# Login
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

# Response
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { ... }
}
```

### Headers requeridos

```
Authorization: Bearer <accessToken>
X-Company-Id: <uuid>  # Para endpoints multi-tenant
```

### Endpoints principales

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/orders` | Listar pedidos |
| POST | `/api/orders/import` | Importar CSV |
| POST | `/api/optimization/configure` | Crear configuracion de optimizacion |
| POST | `/api/optimization/jobs` | Crear y ejecutar optimizacion |
| GET | `/api/optimization/jobs/:id` | Estado de optimizacion |
| POST | `/api/optimization/jobs/:id/confirm` | Confirmar plan |
| POST | `/api/optimization/jobs/:id/swap-vehicles` | Intercambiar rutas entre vehiculos |
| GET | `/api/optimization-presets` | Presets de optimizacion |
| POST | `/api/driver-assignment/manual` | Asignacion manual de conductor |
| POST | `/api/driver-assignment/suggestions` | Sugerencias de conductor |
| POST | `/api/reassignment/options` | Opciones de reasignacion |
| GET | `/api/monitoring/geojson` | GeoJSON para mapa |
| GET | `/api/monitoring/summary` | Resumen de monitoreo |
| POST | `/api/mobile/driver/location` | Enviar ubicacion GPS |
| GET | `/api/mobile/driver/my-route` | Ruta del conductor |
| PATCH | `/api/route-stops/:id` | Actualizar parada |
| GET | `/api/companies/:id/field-definitions` | Listar campos custom |
| GET | `/api/mobile/driver/workflow-states` | Estados de workflow |
| GET | `/api/tracking/:token` | Tracking publico de pedido |

---

## App Movil

La app movil esta en un repositorio separado: [better-route-mobile](https://github.com/EijunnN/better-route-mobile) (Flutter).

### Caracteristicas
- Lista de paradas del dia
- Navegacion a cada parada (Google Maps / Waze)
- Marcar entregas como completadas
- Capturar foto de evidencia
- Registrar motivo de no entrega
- Envio automatico de ubicacion GPS cada 20 segundos
- Cola offline para envios fallidos
- **Workflow states dinamicos** — Botones de accion generados segun la configuracion de la empresa
- **Campos personalizados** — Muestra campos custom definidos por la empresa en el detalle de cada parada

### Configuracion

Editar `lib/core/constants.dart`:

```dart
class ApiConfig {
  // Cambiar para produccion
  static const String baseUrl = 'https://tu-api.com';
}

class AppConstants {
  // Configuracion de tracking
  static const int trackingIntervalSeconds = 20;
  static const int trackingRetryAttempts = 3;
}
```

### Compilar

```bash
flutter pub get
flutter build apk --release
```

---

## Roadmap

### ~~RBAC tipado end-to-end~~ ✅ Completado
Sistema de autorizacion con contrato TypeScript unico entre server y cliente. `<Can>` component + `useCan` hook tipados, `<ProtectedPage>` fail-closed, custom roles via DB con merge automatico legacy + dinamico, enforcement server-side garantizado para ambos.

### ~~Personalizacion de pedidos~~ ✅ Completado
Cada empresa puede definir campos personalizados en sus pedidos desde la UI de admin. Los campos se renderizan dinamicamente en formularios, tablas, CSV import y la app movil.

### ~~Presets de optimizacion~~ ✅ Completado
Configuraciones reutilizables que fluyen desde la UI hasta el motor VROOM: factor de trafico, distancia maxima, ventanas flexibles, rutas abiertas, balance de carga, minimizacion de vehiculos, etc.

### ~~Intercambio de vehiculos~~ ✅ Completado
Swap completo de rutas entre vehiculos con reoptimizacion automatica via VROOM desde la interfaz de planificacion.

### ~~Tracking publico~~ ✅ Completado
Pagina publica de seguimiento de pedidos via token unico. Los clientes finales pueden ver el estado de su entrega sin necesidad de cuenta.

### Proximas mejoras
- **Reoptimizacion en vivo** — Recalcular rutas automaticamente cuando un conductor reporta un problema
- **ETA en tiempo real** — Notificaciones al cliente final con hora estimada de llegada actualizada
- **Reportes y analytics** — Dashboards con KPIs historicos (cumplimiento, tiempos, costos)
- **Webhooks** — Notificaciones push a sistemas externos en eventos clave
- **Multi-dia** — Planificacion de rutas que abarcan multiples dias

### App Movil — [better-route-mobile](https://github.com/EijunnN/better-route-mobile)
Evolucionar la app Flutter con nuevas funcionalidades: tracking GPS en tiempo real (SSE), firma digital de recepcion, modo offline mejorado y notificaciones push.

---

## Tecnologias

| Categoria | Tecnologia |
|-----------|------------|
| Frontend | Next.js 16, React 19, TailwindCSS 4 |
| UI Components | shadcn/ui, Radix UI |
| State | SWR |
| Maps | MapLibre GL |
| Backend | Next.js API Routes |
| Database | PostgreSQL + Drizzle ORM |
| Cache | Upstash Redis |
| Storage | Cloudflare R2 (S3) |
| Auth | JWT (jose) |
| Routing Engine | VROOM + OSRM |
| Mobile | Flutter + Riverpod |
| Testing | Bun Test (integration), Playwright (e2e) |
| Linting | Biome |

---

## Agradecimientos

- [VROOM Project](https://github.com/VROOM-Project/vroom) — Motor de optimizacion
- [OSRM](https://project-osrm.org/) — Calculo de rutas
- [Next.js](https://nextjs.org/) — Framework web
- [Drizzle ORM](https://orm.drizzle.team/) — ORM TypeScript
- [shadcn/ui](https://ui.shadcn.com/) — Componentes UI
- [MapLibre](https://maplibre.org/) — Mapas open-source

---

## Contribuir

Las contribuciones son bienvenidas. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para conocer las convenciones del proyecto y como enviar tu primer Pull Request.

---

## Licencia

Este proyecto esta licenciado bajo la [Licencia MIT](LICENSE).

---

<div align="center">

**BetterRoute** — Optimiza tus entregas, no tu presupuesto.

</div>
