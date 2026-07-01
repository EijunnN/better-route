# Contrato del seam: app móvil (aea) ↔ backend (planeamiento)

> **v1 — 2026-07-01.** Fuente única del contrato de API entre el backend
> Next.js (`planeamiento`) y la app Flutter del conductor (`aea`).
> **Copia canónica: `planeamiento/docs/API-CONTRACT-MOBILE.md`.** El espejo
> `aea/docs/API-CONTRACT-MOBILE.md` debe ser byte-idéntico: editá el del web
> y copiá (un `diff` entre ambos = drift).
>
> Autorado leyendo **ambos repos a la vez** (sesión SOTA 2026-07-01). Cada
> shape fue extraído del código real de los dos lados, no de docs.
>
> **Semántica:** lo descriptivo documenta el wire format REAL de hoy. Las
> entradas `[FIX-n]` son cambios **normativos acordados** (§11): hasta que se
> apliquen, manda lo descriptivo. Cualquier cambio de shape exige bump de
> `CONTRACT_VERSION` (§10) y actualización de este doc **en ambos repos en el
> mismo cambio**.

---

## 1. Convenciones transversales

### Headers (móvil → server)

El interceptor de `ApiService` (Dio, `aea/lib/services/api_service.dart`)
inyecta en **toda** request al backend:

| Header | Valor | Nota |
|---|---|---|
| `Authorization` | `Bearer <access_token>` | de `flutter_secure_storage` |
| `x-company-id` | `user.companyId` persistido en login | **hint**, no autoridad: el server valida contra el JWT (`extractTenantContextAuthed`, ADR-0008) |
| `x-user-id` | `user.id` | informativo; el server NO lo usa para auth |
| `Content-Type` / `Accept` | `application/json` | |

**Única excepción:** el `PUT` binario al presigned URL de R2 usa un Dio
limpio — solo `Content-Type` (el del presign), sin auth ni tenant headers.

### Envelopes de respuesta (estado real: 4 familias)

No existe un helper compartido; cada handler arma su JSON. Familias:

1. **`{ data: ... }`** — my-route, my-orders, field-definitions,
   delivery-policy, route-stops `GET/PATCH`, reopen, chat messages `GET/POST`.
2. **Top-level plano** — auth (login/refresh/logout/me), location
   `POST`/`GET`, presigned-url, realtime `{token}`.
3. **`{ ok: true }`** — chat read; `{ ok, reached }` broadcast.
4. **Híbrido** — `route-stops/[id]/history` → `{ data, total }` top-level;
   my-orders mete `total` DENTRO de `data`.

**Norma:** endpoints móviles **nuevos** usan `{ data: ... }`. Los existentes
NO se migran sin bump de versión (los parsers Dart tienen el envelope
cableado por endpoint).

### Errores

- Siempre `{ error: string }`. `code` (`AUTH_REQUIRED`, `FORBIDDEN`,
  `BAD_REQUEST`, `NOT_FOUND`, `TENANT_MISMATCH`, `COMPANY_REQUIRED`,
  `UNSUPPORTED_CHANNEL`, `TOKEN_ERROR`) solo existe en chat/realtime y en los
  helpers de auth/tenancy. Los endpoints `mobile/driver/*` y `route-stops`
  devuelven `{ error }` a secas (a veces `details` o `validTransitions`).
- Mensajes mezclan español e inglés. El móvil NO debe hacer matching de
  strings de error; decide por **status code** (+ `code` si existe).
- `201` solo en location `POST` y chat message `POST`; el resto de
  mutaciones devuelve `200`.

### Tipos en el wire

- Fechas: ISO-8601 UTC strings. **Excepción**: time windows de la Order en
  my-orders son `HH:MM` crudos (§4).
- Coordenadas: `latitude`/`longitude` son `number` en respuestas del server;
  los parsers móviles toleran string-o-num. En el `PATCH` de cierre,
  `gpsLatitude`/`gpsLongitude` viajan como **string**.
- Los `fromJson` móviles usan **casts no-nullables** para los campos
  marcados REQ en §3: si el server deja de mandarlos, la app crashea el
  parseo. Esos campos están **congelados** por este contrato.

---

## 2. Autenticación y sesión

Endpoints top-level SIN envelope `data`.

### POST `/api/auth/login`

- Req: `{ email, password }`. Rate-limit 5/min por IP (en memoria de proceso).
- 200: `{ user: { id, companyId, email, name, role }, accessToken,
  refreshToken, expiresIn }`. `expiresIn` = segundos del access token
  (**900 prod / 86400 dev**). Todos REQ para `AuthResponse.fromJson`.
- 400 body inválido; 401 (`'Usuario no encontrado'` ≠ `'Credenciales
  inválidas'` — enumeración de usuarios, endurecer algún día); 403 inactivo;
  429 rate limit.
- Side effects: si `role === CONDUCTOR` → `users.appOnline = true`; crea
  sesión Redis; setea cookies httpOnly que el móvil ignora.
- El móvil valida `user.role == 'CONDUCTOR'` (string exacto) y hace
  auto-logout si no.

### POST `/api/auth/refresh`

- Req: `{ refreshToken }` en body (la cookie `refresh_token`, si existiera,
  tiene precedencia — irrelevante para móvil sin cookie jar).
- 200: `{ accessToken, refreshToken, expiresIn }` (sin `user`). Ambos tokens
  REQ (casts no-nullables en Dart).
- 401 `'Token inválido'`: firma/exp inválida, `type !== 'refresh'`, o la
  sesión Redis ya no existe. **401 aquí = sesión terminada** → logout local y
  re-login; NO es transitorio. 403 usuario inactivo.

**Semántica de sesión (extraída del código, congelada como contrato):**

- Access JWT: claims `{ userId, companyId, email, role, type:'access' }`,
  validación 100% stateless (firma+exp; nunca Redis). TTL 15 min prod / 24 h dev.
- Refresh JWT: mismos claims + `sessionId` + `type:'refresh'`. TTL 7 d.
- Sesión Redis `session:{sessionId}`: TTL 7 días **absoluto desde el login;
  el refresh NO lo renueva** → a los 7 días exactos todo refresh devuelve
  401 y el conductor re-loguea. La app debe tratarlo como flujo normal.
- **NO hay rotación real**: `/refresh` emite un par nuevo con el mismo
  `sessionId` pero no invalida el viejo. Dos refresh concurrentes con el
  mismo token → ambos 200, ambos pares válidos. No existe detección de reuse.
- Si Redis está caído, `isRefreshTokenValid` es **fail-open** (degrada a
  JWT-only; la revocación queda inoperante).
- `/refresh` no tiene rate limit.

**`[FIX-4]` (móvil) — single-flight de refresh.** Hoy `_isRefreshing` es un
bool: el primer 401 refresca y reintenta; los 401 concurrentes se rechazan
de inmediato con `'Sesion expirada'` (errores espurios en ráfagas). Spec: un
`Completer`/mutex único; los requests concurrentes **esperan** el resultado
del refresh en vuelo y se replayean con el token nuevo. Persistir
atómicamente UN par ganador. Es corrección **local** (el server tolera
refresh paralelo); un fallo del refresh en vuelo rechaza toda la cola y
dispara logout local **solo** si el fallo fue 401 del `/refresh` (no por
timeout/red — eso hoy nukea el storage con `clearAll()` ante cualquier
excepción: corregirlo en el mismo fix).

### POST `/api/auth/logout`

- Req: sin body. Auth opcional (cookie o Bearer); 200 siempre.
- Con Bearer: apaga `users.appOnline` (presencia en monitoring) pero **NO
  revoca la sesión Redis** (la revocación lee la cookie `session_id`) — el
  refreshToken sigue vivo hasta sus 7 d. `[FIX-8]` (web): aceptar
  `{ refreshToken }` en el body de logout, derivar `sessionId` y revocar;
  (móvil): mandarlo. Nota: si el access token ya expiró, `appOnline` queda
  en `true` — el móvil debe refrescar antes de hacer logout si hace falta.

### GET `/api/auth/me`

- 200 top-level plano: `{ id, companyId, email, name, role, active,
  createdAt, permissions: string[] }` (permisos frescos de DB, formato
  `'entity:action'`). Endpoint canónico de verificación de sesión / permisos
  para el móvil (hoy sin consumidor Dart; usarlo para el check de capability
  set §9 en vez de asumir permisos).

---

## 3. Endpoints del seam

Leyenda: **[M]** = el móvil lo consume hoy; **[W]** = web/dispatch-only pero
afecta el estado que el móvil ve. Permiso = `requireRoutePermission`.

| # | Endpoint | Rol | Permiso |
|---|---|---|---|
| 1 | `POST /api/auth/login` [M] | — | — |
| 2 | `POST /api/auth/refresh` [M] | — | — |
| 3 | `POST /api/auth/logout` [M] | — | — |
| 4 | `GET /api/auth/me` | — | — |
| 5 | `GET /api/mobile/driver/my-route` [M] | CONDUCTOR | `ROUTE:read` |
| 6 | `PATCH /api/route-stops/[id]` [M] | CONDUCTOR (solo SUS stops) | `ROUTE_STOP:update` |
| 7 | `POST /api/mobile/driver/location` [M] | CONDUCTOR | `ROUTE_STOP:update` |
| 8 | `GET /api/mobile/driver/location` | CONDUCTOR | ninguno (self-only deliberado) |
| 9 | `GET /api/mobile/driver/my-orders` | CONDUCTOR | `ORDER:read` (sin consumidor móvil hoy) |
| 10 | `GET /api/mobile/driver/delivery-policy` [M] | CONDUCTOR | `ROUTE_STOP:read` |
| 11 | `GET /api/mobile/driver/field-definitions` [M] | CONDUCTOR | `ORDER:read` |
| 12 | `GET /api/upload/presigned-url` [M] | cualquier user con company | ninguno (solo auth) |
| 13 | `GET /api/chat/conversations/[driverId]/messages` [M] | driver: solo su hilo | `CHAT:read` |
| 14 | `POST /api/chat/conversations/[driverId]/messages` [M] | driver: solo su hilo | `CHAT:create` |
| 15 | `POST /api/chat/conversations/[driverId]/read` [M] | driver: solo su hilo | `CHAT:read` (deliberado pese a ser POST) |
| 16 | `GET /api/realtime/token` [M] | cualquier user | ninguno (solo auth+tenant) |
| 17 | `POST /api/route-stops/[id]/reopen` [W] | operador | `ROUTE_STOP:update` |
| 18 | `GET /api/route-stops/[id]` / `.../history` [W] | — | `ROUTE_STOP:read` |
| 19 | `POST /api/chat/broadcast` [W] | dispatch | `CHAT:create` |
| 20 | `GET /api/realtime/subscription-token` [W] | dispatch | `CHAT:read` |

Los endpoints `mobile/driver/*` además exigen `role === CONDUCTOR` (gate
inline → 403 `'Este endpoint es solo para conductores'`; un `ADMIN_SISTEMA`
no puede probarlos).

### 3.5 GET `/api/mobile/driver/my-route` — la respuesta rica canónica

```jsonc
{ "data": {
    "driver": { "id": REQ, "name": REQ, "email", "phone", "photo",
                "identification", "status" /* driverStatus || "AVAILABLE" */,
                "license": { "number", "expiry" /* ISO|null */, "categories" } },
    "vehicle": /* null-able */ { "id", "name", "plate", "brand", "model",
                "maxOrders", "origin": { "address", "latitude", "longitude" } },
    "route": /* null si no hay ruta hoy */ {
      "id" REQ, "jobId" REQ,
      "jobCreatedAt" REQ,        // ⚠️ Dart usa DateTime.parse (NO tryParse):
                                 // null o no-ISO ⇒ crash. CONGELADO como REQ ISO.
      "jobIds": [], "geometry": /* polyline prec-5 | null (planes viejos) */,
      "stops": [ /* shape móvil §4 col-1 */ ] },
    "metrics": /* null-able; ints (un double en campos int crashea el cast Dart) */ {
      "totalStops", "completedStops", "pendingStops", "inProgressStops",
      "failedStops", "progressPercentage", "totalDistance" /* metros */,
      "totalDuration" /* seg */, "totalWeight", "totalVolume", "totalValue",
      "totalUnits" },
    "message": /* solo variantes sin ruta */ "No tienes rutas asignadas para hoy"
} }
```

- Paradas del día = `scheduledDate == hoy` (fecha calendario del server),
  fallback `createdAt ∈ [hoy, mañana)` para filas legacy. Dedup por
  `orderId` (gana el job más reciente); orden: activos primero, luego
  `sequence`.
- 200 aun sin ruta (`route: null` + `message`); 404 si el conductor no
  existe.

### 3.6 PATCH `/api/route-stops/[id]` — cierre/estado de un stop

Request (todos opcionales salvo la regla "status O customFields"):

```jsonc
{ "status": "PENDING|IN_PROGRESS|COMPLETED|FAILED",
  "notes": "string",            // ⚠️ hoy: si se omite, el server BORRA las
                                // notas previas (notes: notes || null) [FIX-3]
  "failureReason": "string",    // verbatim de policy.failureReasons (ADR-0011)
  "evidenceUrls": ["url"],      // publicUrl(s) devueltas por el presign
  "customFields": { },          // entity=route_stops
  "gpsLatitude": "string", "gpsLongitude": "string" }
```

Validaciones server (en orden): transición válida contra
`STOP_STATUS_TRANSITIONS` (400 con `validTransitions`); `COMPLETED` exige
`evidenceUrls` no-vacío si `policy.completedRequiresPhoto` (default true) y
custom fields required completos; `FAILED` exige `failureReason` string
truthy mientras `policy.failureReasons` sea no-vacío (default sí) — **hoy
`"  "` (espacios) pasa; `[FIX-2]` exige no-blank tras trim en server y el
móvil bloquea el encolado sin motivo**. Membresía en la lista NO se valida
(deliberado, ADR-0011).

Respuestas: 200 `{ data: <fila routeStops cruda $inferSelect> }` (§4 col-2);
**idempotencia terminal**: re-PATCH del MISMO status terminal → 200 con la
fila actual, sin duplicar `delivery_visits`/history (el outbox depende de
esto); 400 validaciones; 403 conductor ajeno; 404; **409 lock optimista**
(reintentar tras refetch); 500.

Efectos de una transición terminal: inserta `delivery_visits` (append-only,
ADR-0005) + `route_stop_history` + sincroniza la Order
(`COMPLETED→COMPLETED`, `FAILED→FAILED`; `CANCELLED` nunca se pisa) +
alerta `STOP_FAILED` + publish a `monitoring:{companyId}` + recompute de ETA.

### 3.7 POST `/api/mobile/driver/location`

Request (el móvil manda; ⚠️ = el server hoy lo ignora):

```jsonc
{ "latitude": REQ, "longitude": REQ, "accuracy", "speed" /* km/h */,
  "heading", "altitude", "batteryLevel", "recordedAt" /* ISO, ≤60s futuro */,
  "source": "GPS|MANUAL|GEOFENCE|NETWORK",
  "isMoving": ⚠️,  "stopSequence": ⚠️, "jobId": ⚠️, "routeId": ⚠️ }
```

- 201 `{ success: true, locationId, savedAt }` (sin envelope `data`). El
  móvil acepta cualquier 2xx (histórico 200/201) — **congelado: éxito = 2xx**.
- ⚠️ El server **ignora el contexto de ruta del cliente** y deriva
  `routeId`/`stopSequence` del job COMPLETED más reciente **de la empresa**
  (no necesariamente del driver). `[FIX-7]`: usar el contexto del body
  cuando venga; fallback a la derivación.
- ⚠️ Valores `0` se pierden (`accuracy ? ... : null` — falsy). `[FIX-6]`:
  usar `??`. `isMoving` lo recalcula el server como `speed > 5`.
- 400 con mensajes por campo; validación estricta de rangos.

### 3.8 GET `/api/mobile/driver/delivery-policy`

- 200 `{ data: { policy: <fila companyDeliveryPolicy completa>,
  stateMachine: { states: [...], transitions: { <code>: [...] } } } }`.
- GET con efecto: lazy-insert de la policy si falta ⇒ **contrato: `policy`
  nunca es null**.
- Campos que el móvil LEE (congelados): `labelPending`, `labelInProgress`,
  `labelCompleted`, `labelFailed` (String?, fallback = código);
  `completedRequiresPhoto`, `completedRequiresNotes`, `failedRequiresPhoto`,
  `failedRequiresNotes` (bool?, default false); `failureReasons` (string[]?,
  default []). `transitions` vacío = terminal. El móvil valida estos gates
  ANTES de enviar; el server los re-valida (§3.6).
- `[FIX-9]` (web): agregar `quickReplies: [{code,label}]` al DTO (hoy
  hardcodeadas espejo en ambos repos — §7); el móvil usa su lista embebida
  como fallback si el campo falta.

### 3.9 GET `/api/mobile/driver/field-definitions`

- 200 `{ data: [<filas companyFieldDefinitions>] }` filtradas
  `active && showInMobile`, orden `position`. Campos que el móvil lee: `id`
  REQ, `code` REQ, `label` REQ, `entity` (`'orders'|'route_stops'`),
  `fieldType` (`text|number|select|date|currency|phone|email|boolean`),
  `required`, `placeholder`, `options`, `defaultValue`, `position`.
- Los `required` de `entity=route_stops` se exigen server-side al COMPLETAR.

### 3.10 GET `/api/upload/presigned-url` (flujo de evidencia R2)

- Query: `trackingId` (o `filename`), `contentType` (default `image/jpeg`;
  solo jpeg/png/webp/heic/heif), `folder` (default `evidence`),
  `index` (**1–99, opcional**).
- 200 top-level: `{ uploadUrl, publicUrl, key, expiresIn: 300,
  maxFileSize: 10485760, contentType }` — **TODOS REQ** (casts no-nullables
  en `PresignedUrlResponse`).
- Key determinística con trackingId: `{trackingId}_{index}.{ext}` (sin
  `index` ⇒ `{trackingId}.{ext}`: **todas las fotos del mismo stop
  colisionan en una key** — ver `[FIX-1]` §5). `maxFileSize` es informativo
  (el PUT no lo fuerza).
- Quirk de tenancy: usa `authUser.companyId` directo e ignora
  `x-company-id` (allowlist §9).
- Flujo: presign → `PUT` binario a `uploadUrl` (Dio limpio) → incluir
  `publicUrl` en `evidenceUrls` del PATCH.

### 3.11 Chat (driver-side)

- `GET .../messages`: query `after` XOR `before` (400 si ambos), `limit`
  (default 50, cap 200; en modo `after` se fuerza 200). 200
  `{ data: [<fila chatMessages>] }` **oldest-first**. Fila: `{ id, companyId,
  driverId, senderId, direction: "TO_DRIVER"|"TO_DISPATCH",
  kind: "TEXT"|"TEMPLATE"|"BROADCAST", body, templateCode, readAt,
  createdAt }` (los 6 primeros + body REQ para el parser).
- `POST .../messages`: `{ body (trim, no-vacío), templateCode? }` →
  `templateCode` debe pasar `isQuickReplyCode` (400 si no). El server deriva
  `direction`/`kind` del rol (no spoofeables). 201 `{ data: <fila> }`.
- `POST .../read`: sin body → `{ ok: true }`. Driver marca leídos los
  despacho→driver. **No hay read-receipt en vivo hacia el driver** (el
  dispatch que lee publica solo al inbox de dispatch): el móvil reconcilia
  `readAt` por fetch.
- `{driverId}` = SIEMPRE el userId del conductor logueado (403 si no).

### 3.12 GET `/api/realtime/token`

- 200 `{ token }` (JWT de conexión Centrifugo). 401/400/403 vía helpers de
  auth/tenant. Detalle §7.

### 3.13 POST `/api/route-stops/[id]/reopen` [W]

Web-only pero define lo que el móvil ve tras un re-intento: solo
`FAILED→PENDING`; limpia `failureReason/evidenceUrls/notes/startedAt/
completedAt`; la Visit previa queda (ADR-0005). El stop reabierto reaparece
en `my-route` con `attemptNumber` mayor. `reason` del reopen SÍ exige
no-vacío tras trim (a diferencia del PATCH — resuelto por `[FIX-2]`).

---

## 4. El recurso Stop — TRES representaciones del mismo route_stop

| Campo | (1) `my-route` stops[] | (2) `PATCH`/`reopen` (fila cruda) | (3) `GET route-stops/[id]` |
|---|---|---|---|
| time window | `timeWindow: {start,end}` ISO\|null (con fallback compuesto desde HH:MM de la orden) | `timeWindowStart`/`timeWindowEnd` planos | como (2) |
| order | `order: {id, trackingId, customerName, ...}` anidado | `orderId` (string) | `order` anidado (otro subset) + `user`/`vehicle`/`job`/`history[]` |
| ETA vivo | `liveEtaAt` (Redis) + `estimatedArrival` | solo `estimatedArrival`/`predictedEtaAt` | como (2) |
| revisitas | `attemptNumber` **visible** (= max(attempt, priorVisits+1)), `priorVisitsCount`, `isRevisit` | `attemptNumber` crudo de DB | crudo |
| extras | — | `companyId, routeId, userId, vehicleId, scheduledDate, createdAt, updatedAt, etaComputedAt` | como (2) |

**Reglas normativas:**
- El móvil **no** renderiza desde la respuesta del PATCH (fila plana
  degradaría el stop): tras un cierre, refetch de `my-route`
  (rúbrica móvil §8). El parser defensivo de `RouteStop.fromJson` tolera la
  fila plana, pero es tolerancia, no contrato de UI.
- **Tercer formato de time window** en `my-orders`: a nivel Order son
  strings `HH:MM` crudos + `strictness`; a nivel `stop` embebido son ISO.
  No unificar sin bump de versión.
- Wire de status: `PENDING|IN_PROGRESS|COMPLETED|FAILED` (4 — no existe
  `SKIPPED`). Desconocido ⇒ el móvil degrada a PENDING (fail-soft).

---

## 5. Flujo completar/fallar + outbox offline

### Camino online (pantalla del stop)

1. Por cada foto `i`: `GET presigned-url?trackingId=X&index=i+1` → `PUT` R2.
2. `PATCH` con `status`, `evidenceUrls` (publicUrls), `notes?`,
   `failureReason?` (si FAILED), `customFields?`, `gpsLatitude/Longitude?`.
3. Refetch `my-route`.

### Camino offline (`OfflineOutbox`, `aea/lib/services/offline_outbox.dart`)

- **Todo cierre terminal pasa por `submitClose`** (persiste
  `PendingClose` a disco ANTES de intentar red) + `applyLocalClose`
  (optimista). PATCH terminal directo = bug (rúbrica móvil §2).
- `PendingClose`: `{ id==stopId (dedup natural), stopId, trackingId, status,
  failureReason?, notes?, customFields?, gpsLatitude?, gpsLongitude?,
  photoPaths[], uploadedByPath{path→publicUrl} (resume-safe), createdAtMs,
  retryCount }`. Persistido en SharedPreferences `offline_outbox_v1`.
- Reintentos: transitorio (sin response / ≥500 / desconocido) →
  `retryCount++` hasta 60, luego **drop** con `lastError` client-only;
  **4xx → drop inmediato**. En ningún caso se informa al server (gap
  conocido y aceptado v1).
- Idempotencia: depende del PATCH terminal no-op (§3.6) para reintentar
  tras un ack perdido sin duplicar Visits. **Congelado server-side.**
- Flush: timer 30 s + al encolar + app resume + reload de ruta; secuencial,
  corta al primer fallo transitorio.

### Los dos bugs de pérdida de datos (normativo)

- **`[FIX-1]` (móvil, crítico) — fotos sin `index` en el drain.** El camino
  online presigna con `index=i+1`; el drain del outbox llama
  `uploadEvidencePhoto` SIN index ⇒ con `trackingId` la key es
  `{trackingId}.jpg` para TODAS las fotos ⇒ se pisan en R2. Spec: el drain
  pasa `index = posición+1` igual que el camino online (y `PendingClose` no
  necesita campo nuevo: el índice es la posición en `photoPaths`).
- **`[FIX-2]` (ambos, crítico) — FAILED sin motivo se pierde.** Offline, un
  `PendingClose` FAILED sin `failureReason` llega al server sin el campo
  (RouteService omite strings vacíos) → 400 → el outbox dropea 4xx → **la
  falla desaparece**. Spec móvil: si la policy cacheada tiene
  `failureReasons`, la UI exige motivo ANTES de encolar (bloqueo en el
  form, no en el drain). Spec server: `failureReason` debe ser no-blank
  tras `trim()` (hoy `"  "` pasa).

### `[FIX-3]` (web) — PATCH parcial honesto

`updateData` hace `notes: notes || null`: un PATCH de solo-status borra las
notas previas. Spec: incluir en el UPDATE únicamente los campos presentes en
el body (semántica JSON-merge-patch: ausente = no tocar, `null` explícito =
borrar). Aplica a `notes` y a cualquier campo opcional futuro.

---

## 6. Tracking GPS

- `POST /api/mobile/driver/location` (§3.7). Cadencia adaptativa del móvil:
  20 s en movimiento / 60 s detenido (umbral 2 km/h); Geolocator con
  `distanceFilter` 25 m, foreground-service en Android;
  `forceSendLocation` (abrir/cerrar parada) manda payload reducido.
- Retries: 3 × 5 s; agotados → cola `_pendingLocations` **EN MEMORIA**
  (max 100 FIFO) que se pierde al matar el proceso. Asimetría deliberada v1
  frente al outbox de cierres (disk): **spec pendiente para Opus** — decidir
  persistir la cola GPS con el patrón del outbox o documentar la pérdida
  como aceptable (el cierre de stop SÍ registra GPS de forma durable vía
  PendingClose). Hasta esa decisión: no "arreglarlo" de pasada.
- El server publica `driver.location` a `monitoring:{companyId}` (el driver
  no lo recibe) y persiste en `driver_locations`. Presencia del driver en
  monitoring = `users.appOnline` (login/logout) + recencia GPS — **no** la
  presencia de Centrifugo (socket efímero, ADR-0007).

---

## 7. Realtime (Centrifugo) + push (OneSignal)

### Canales por rol (`computeAllowedChannels`, claim `channels` del token)

- **CONDUCTOR** → `chat:{companyId}:driver:{userId}` +
  `chat:{companyId}:broadcast`. Nunca `monitoring:*` ni inbox.
- PLANIFICADOR / ADMIN_FLOTA / ADMIN_SISTEMA → `monitoring:{companyId}` +
  `chat:{companyId}:inbox` + broadcast. MONITOR → solo monitoring.
- Suscripción server-side por el claim: el cliente no puede suscribirse
  fuera de la lista.

### Tokens

- Conexión: `GET /api/realtime/token` → `{ token }` JWT HS256 con
  `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY` (secreto SEPARADO del JWT de sesión),
  TTL **15 min**, claims `sub=userId`, `info:{role,companyId}`, `channels`.
  El SDK re-pide vía `getToken` antes del expiry.
- Suscripción (dispatch-only): TTL 5 min, claim `channel` único.
- **`[FIX-5]` (móvil) — `getToken` mata reconexiones.** Hoy cualquier fallo
  (timeout, 500, red) se convierte en `UnauthorizedException`, que detiene
  los reconnects del SDK permanentemente. Spec: `UnauthorizedException`
  SOLO ante 401 real de `/api/realtime/token`; cualquier otro error se
  relanza como transitorio para que el backoff (300 ms–30 s) siga.

### Payloads que el driver recibe

- `chat:{companyId}:driver:{driverId}` → `{ kind: "chat.message",
  message: <fila chatMessages, Dates como ISO> }`. Se publica en ambas
  direcciones (el driver recibe eco de su propio mensaje) y el broadcast
  entra por acá como fila `kind:"BROADCAST"` (fan-out per-driver).
- `chat:{companyId}:broadcast` → `{ kind: "chat.broadcast", body, sentAt }`.
  **El móvil lo ignora a propósito** (deduplicación: ya llega in-thread).
- Reconciliación post-reconnect: `GET .../messages?after=<lastMessageId>`.

### Push (OneSignal)

- Se envía SIEMPRE (sin check de presencia) en mensajes TO_DRIVER y
  broadcasts; el móvil suprime el banner si el chat está en foreground.
- Payload `data`: 1:1 → `{ type: "chat", driverId, messageId }`; broadcast →
  `{ type: "broadcast" }`. El router móvil hoy solo navega con
  `type == 'chat'` — **congelado**: nuevos tipos de push requieren bump.
- Targeting: `include_aliases.external_id = [userId]`
  (`OneSignal.login(user.id)` en el móvil; el backend no guarda device
  tokens).
- **Pairing de App ID**: server `ONESIGNAL_APP_ID` (env) debe == App ID del
  móvil (hoy hardcodeado `35dbded5-641d-47b1-b931-07dad0d49770`, público by
  design). `[FIX-10]` (móvil): moverlo a `--dart-define`
  `ONESIGNAL_APP_ID` con el valor actual como default, y documentar el par
  env↔define en `dart_define.example.json`.

### Quick replies (catálogo espejado — fuente de drift)

Lista canónica (`src/lib/chat/quick-replies.ts`, validada server-side en el
POST; un código fuera de lista → 400):

`ON_THE_WAY` "Voy en camino" · `ARRIVED` "Llegué al punto" ·
`CUSTOMER_ABSENT` "Cliente ausente" · `DELAYED` "Me demoro unos minutos" ·
`NEED_HELP` "Necesito ayuda"

El móvil manda el **label como `body`** + el `code` como `templateCode` (el
server no deriva el body del code). Hoy la lista está duplicada a mano en
`chat_message.dart` — `[FIX-9]` la sirve en delivery-policy; hasta entonces,
**cambiar la lista = cambiarla en ambos repos en el mismo cambio**.

---

## 8. RBAC — driver capability set

El móvil asume (invisiblemente desde su repo) que el rol `CONDUCTOR` tiene:

```
ROUTE:read          (my-route)
ROUTE_STOP:read     (delivery-policy)
ROUTE_STOP:update   (PATCH stop, location POST)
ORDER:read          (field-definitions, my-orders)
CHAT:read           (messages GET, read POST, subscription implícita)
CHAT:create         (messages POST)
```

**Normativo:** este set es parte del contrato. Quitarle cualquiera de estos
permisos a `CONDUCTOR` (en `ROLE_PERMISSIONS` o vía custom role que lo
reemplace) rompe la app en silencio. **Para Opus:** test server-side
(`src/tests/unit/` o integration) que asserte que el rol CONDUCTOR resuelve
estos 6 permisos, con referencia a este doc en el nombre del test.

**Allowlist de endpoints sin RBAC** (deliberados; es la lista de excepciones
para cualquier hook/gate de tenancy — ADR-0008):

- `GET /api/mobile/driver/location` — self-only a propósito (un permiso
  `DRIVER:read` dejaría entrar admins).
- `GET /api/realtime/token` — la autorización real es la derivación de
  canales por rol.
- `GET /api/upload/presigned-url` — solo auth + companyId del JWT (ignora
  `x-company-id`).

---

## 9. DTO estable / campos congelados (resumen para parsers)

Campos que el server **no puede dejar de mandar** sin bump (casts
no-nullables o `DateTime.parse` en Dart):

| Endpoint | Campos congelados |
|---|---|
| login | `user{id,companyId,email,name,role}`, `accessToken`, `refreshToken`, `expiresIn` |
| refresh | `accessToken`, `refreshToken` |
| my-route | `data.driver{id,name}`; si `route` ≠ null: `route.{id,jobId,jobCreatedAt(ISO parseable),stops[]}`; por stop: `id`, `sequence`(int), `address`; por order embebida: `id` |
| PATCH stop | `data.{id,sequence,address}` (aunque la UI no lo use — §4) |
| presigned-url | los 6: `uploadUrl,publicUrl,key,expiresIn,maxFileSize,contentType` |
| chat messages | por fila: `id,companyId,driverId,senderId,direction,kind,body` |
| delivery-policy | `data.policy` (nunca null), `data.stateMachine.{states,transitions}` |
| field-definitions | por fila: `id,code,label` |
| realtime/token | `token` no-vacío |

Tolerantes (el móvil tiene defaults): metrics, timeWindow, geometry,
liveEtaAt, evidenceUrls, customFields, batteryLevel, readAt, createdAt de
chat (fallback `now()`).

---

## 10. Versionado + contract-tests (mecanismo decidido — implementa Opus)

**Decisión: fixtures golden compartidos + validación dual, sin codegen**
(compatible con la regla NO-CODEGEN del móvil). No se adopta `/api/v1` en la
URL: pre-deploy y single-tenant-per-VPS (ADR-0008) hacen que server y app se
desplieguen coordinados; un handshake liviano alcanza.

1. **`CONTRACT_VERSION = 1`** — web: `src/lib/mobile-contract/version.ts`;
   móvil: `lib/core/contract_version.dart`. Bump en cualquier cambio de
   shape/semántica de este doc; siempre en ambos repos en el mismo cambio.
2. **Header de handshake** — el web agrega `x-br-contract: <version>` en las
   respuestas del seam (helper compartido en los handlers móviles); el móvil
   lo compara post-login y loguea/avisa UI en mismatch (no bloquea).
3. **Fixtures golden** — canónicos en web
   `src/tests/contract/fixtures/<endpoint>.json` (una respuesta realista por
   endpoint del §3, con `"contractVersion"`), espejo en aea
   `test/contract/fixtures/` vía `scripts/sync-contract-fixtures.ps1`/`.sh`
   (repos hermanos en disco). Un fixture distinto entre repos = drift.
4. **Web-side tests** (`bun test src/tests/contract/`): schemas Zod
   hand-written por endpoint (derivados de este doc, en
   `src/tests/contract/schemas.ts`) que validan (a) los fixtures y (b) en
   integración, respuestas reales de los handlers.
5. **Mobile-side tests** (`flutter test test/contract/`): cada fixture se
   parsea con el `fromJson` REAL (`AuthResponse`, `DriverRouteData`,
   `RouteStop`, `ChatMessage`, `PresignedUrlResponse`, `FieldDefinition`,
   policy de `WorkflowService`) y se asserta que no lanza + campos clave.
   Primer contenido del directorio `test/` del repo móvil.
6. **Regla de PR**: tocar un handler del seam sin actualizar
   fixture+schema+este doc debe fallar el contract-test correspondiente.

---

## 11. Registro de fixes normativos

| ID | Lado | Sev | Resumen |
|---|---|---|---|
| FIX-1 | móvil | 🔴 pérdida de datos | drain del outbox presigna sin `index` → fotos colisionan en R2 |
| FIX-2 | ambos | 🔴 pérdida de datos | FAILED sin motivo: exigir al encolar (móvil) + no-blank tras trim (web) |
| FIX-3 | web | 🟠 | PATCH parcial: no clobberear `notes` omitidas (`|| null`) |
| FIX-4 | móvil | 🟠 | refresh 401 single-flight real (Completer + replay; clearAll solo ante 401 del refresh) |
| FIX-5 | móvil | 🟠 | `getToken` Centrifugo: `UnauthorizedException` solo ante 401 real |
| FIX-6 | web | 🟡 | location POST: valores `0` se pierden (falsy→null) → usar `??` |
| FIX-7 | web | 🟡 | location POST: honrar `routeId/stopSequence/jobId` del cliente |
| FIX-8 | ambos | 🟡 | logout Bearer: aceptar `{refreshToken}` y revocar sesión Redis |
| FIX-9 | web | 🟡 | servir `quickReplies` en delivery-policy (hoy espejo hardcodeado) |
| FIX-10 | móvil | 🟢 | OneSignal App ID a `--dart-define` (default = actual) |

Gaps conocidos y **aceptados** v1 (no fixes): outbox no reporta drops al
server; cola GPS en memoria (decisión pendiente §6); read-receipt del
dispatch no llega en vivo al driver; access tokens viejos válidos hasta exp
tras logout/revocación; rate-limit de auth en memoria de proceso.
