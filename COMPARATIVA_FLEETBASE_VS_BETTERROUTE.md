# Comparativa: Fleetbase vs BetterRoute Planeamiento

> Fecha: 2026-02-14
> Propósito: Análisis de funcionalidades para identificar gaps y oportunidades

---

## Resumen Ejecutivo

| Aspecto | Fleetbase | BetterRoute |
|---------|-----------|-------------|
| **Tipo** | Plataforma logística modular (extensiones) | Sistema de planificación y gestión de flotas |
| **Stack** | Ember.js + Laravel (PHP) + MySQL + SocketCluster | Next.js 16 + React 19 + PostgreSQL + VROOM/OSRM |
| **Licencia** | AGPL-3.0 | Propietario |
| **Arquitectura** | Monolito modular con extensiones (Ember Engines) | App monolítica con compound components |
| **Multi-tenancy** | Organizaciones + API keys | Multi-empresa con companyId global |
| **Enfoque** | TMS genérico (first-mile a last-mile) | Optimización de rutas de entrega |

---

## Comparativa por Módulo

### 1. Gestión de Pedidos / Orders

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| CRUD de pedidos | ✅ | ✅ | Paridad |
| Estados de pedido (workflow) | ✅ Custom workflows | ✅ PENDING→ASSIGNED→COMPLETED | BR más simple |
| Importación CSV/Excel | ❌ No mencionado | ✅ Con mapeo automático | **BR ventaja** |
| Geocodificación automática | ✅ | ✅ | Paridad |
| Ventanas de tiempo | ✅ | ✅ Con presets reutilizables | **BR ventaja** |
| Peso/volumen/unidades/valor | Parcial | ✅ 4 dimensiones de capacidad | **BR ventaja** |
| Habilidades requeridas (skills) | ❌ | ✅ | **BR ventaja** |
| Prioridad de pedido | ✅ | ✅ | Paridad |
| Proof of Delivery (firma/foto) | ✅ Via Navigator app | ❌ | **Gap BR** |
| Tracking link para cliente | ✅ Via Customer Portal | ❌ | **Gap BR** |
| Workflows personalizables | ✅ | ❌ Workflow fijo | **Gap BR** |
| Campos personalizados | ✅ Custom fields | ❌ | **Gap BR** |

### 2. Optimización de Rutas

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Motor de optimización | ❌ No tiene (solo dispatch manual) | ✅ VROOM + PyVRP + OSRM | **BR ventaja mayor** |
| Matriz de distancias reales | ❌ | ✅ OSRM | **BR ventaja** |
| Restricciones de capacidad | ❌ | ✅ Peso/volumen/unidades/valor | **BR ventaja** |
| Ventanas de tiempo (hard/soft) | ❌ | ✅ Con strictness configurable | **BR ventaja** |
| Matching de habilidades | ❌ | ✅ Driver + Vehicle skills | **BR ventaja** |
| Horarios de trabajo/descanso | ❌ | ✅ | **BR ventaja** |
| Multi-objetivo (costo/tiempo/distancia) | ❌ | ✅ | **BR ventaja** |
| Presets de optimización | ❌ | ✅ Reutilizables | **BR ventaja** |
| Workflow de planificación (3 pasos) | ❌ | ✅ Vehículos→Pedidos→Config | **BR ventaja** |
| Historial de planes | ❌ | ✅ Con paginación | **BR ventaja** |
| Confirmación de plan | ❌ | ✅ | **BR ventaja** |
| Reasignación de conductores | ❌ | ✅ Con análisis de impacto | **BR ventaja** |
| Métricas de resultado (KPIs) | ❌ | ✅ Distancia, tiempo, utilización | **BR ventaja** |

> **Nota**: La optimización de rutas es la ventaja competitiva principal de BetterRoute. Fleetbase NO tiene motor de optimización integrado.

### 3. Gestión de Flotas

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| CRUD de flotas | ✅ | ✅ | Paridad |
| Asignación de vehículos M:N | ✅ | ✅ | Paridad |
| Tipos de flota | No claro | ✅ HEAVY/LIGHT/EXPRESS/REFRIGERATED/SPECIAL | **BR ventaja** |
| Horarios operacionales | No claro | ✅ | **BR ventaja** |
| Capacidad de flota | No claro | ✅ | **BR ventaja** |

### 4. Gestión de Vehículos

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| CRUD de vehículos | ✅ | ✅ | Paridad |
| Datos maestros (marca, modelo, año) | ✅ | ✅ | Paridad |
| Capacidades (peso/volumen/unidades/valor) | Parcial | ✅ 4 dimensiones | **BR ventaja** |
| Especialización (refrigerado, etc.) | No claro | ✅ | **BR ventaja** |
| Habilidades de vehículo (skills) | ❌ | ✅ Con categorías | **BR ventaja** |
| Estado de vehículo | ✅ | ✅ | Paridad |
| Historial de flotas | No claro | ✅ Audit trail | **BR ventaja** |
| Horario de trabajo del vehículo | ❌ | ✅ Con descansos | **BR ventaja** |
| Origen/depósito configurable | ❌ | ✅ Por vehículo | **BR ventaja** |

### 5. Gestión de Conductores / Usuarios

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| CRUD de usuarios | ✅ | ✅ | Paridad |
| Roles del sistema | ✅ | ✅ 5 roles + custom | Paridad |
| Permisos granulares | ✅ | ✅ Por entidad/acción | Paridad |
| Datos de licencia | ✅ | ✅ Con vencimiento y categorías | Paridad |
| Estado del conductor | ✅ | ✅ 7 estados | Paridad |
| Habilidades del conductor | ❌ | ✅ Con expiración | **BR ventaja** |
| Importación CSV de usuarios | ❌ | ✅ | **BR ventaja** |
| Disponibilidad por día | ❌ | ✅ Scheduling | **BR ventaja** |
| Multi-sesión + invalidación | ❌ | ✅ | **BR ventaja** |
| Foto de perfil | ✅ | ✅ | Paridad |
| Chat integrado | ✅ | ❌ | **Gap BR** |

### 6. Monitoreo en Tiempo Real

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Tracking de conductores en mapa | ✅ WebSocket (SocketCluster) | ✅ Polling HTTP | FB más avanzado |
| Dashboard de métricas en vivo | ✅ | ✅ | Paridad |
| Estado de paradas | ✅ | ✅ | Paridad |
| Compliance de ventanas de tiempo | ❌ | ✅ | **BR ventaja** |
| Alertas y reglas | ✅ | ✅ | Paridad |
| WebSocket real-time | ✅ SocketCluster nativo | ❌ Polling | **Gap BR** |
| Canales por recurso | ✅ driver.{id}, order.{id} | ❌ | **Gap BR** |
| Geofencing triggers | ✅ | ❌ | **Gap BR** |

### 7. Zonas / Geofencing

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Zonas/áreas de servicio | ✅ Service areas | ✅ | Paridad |
| Editor de polígonos en mapa | ✅ | ✅ Con MapLibre GL | Paridad |
| Asociación zona-vehículo | No claro | ✅ | **BR ventaja** |
| Uso en optimización | ❌ (no hay optimización) | ✅ | **BR ventaja** |

### 8. E-Commerce / Storefront

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Tienda online | ✅ Storefront extension | ❌ | **Gap BR** |
| Catálogo de productos | ✅ | ❌ | **Gap BR** |
| Carrito de compras | ✅ | ❌ | **Gap BR** |
| Checkout y pagos | ✅ | ❌ | **Gap BR** |
| Multi-vendor | ✅ | ❌ | **Gap BR** |
| Portal del cliente | ✅ | ❌ | **Gap BR** |

> **Nota**: El módulo Storefront es un diferenciador de Fleetbase para e-commerce. BetterRoute se enfoca en B2B/logística interna, no e-commerce.

### 9. Inventario / Warehouse (WMS)

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Gestión de inventario | ✅ Pallet extension | ❌ | **Gap BR** |
| SKU management | ✅ | ❌ | **Gap BR** |
| Inbound/outbound | ✅ | ❌ | **Gap BR** |
| Multi-ubicación | ✅ | ❌ | **Gap BR** |

> **Nota**: No es relevante para el caso de uso actual de BetterRoute (planificación de rutas).

### 10. App Móvil del Conductor

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| App móvil dedicada | ✅ Navigator (Flutter) | ✅ API básica para Flutter | FB más avanzado |
| Recibir pedidos | ✅ | ✅ | Paridad |
| Navegación turn-by-turn | ✅ Mapbox Navigation | ❌ | **Gap BR** |
| Proof of delivery | ✅ Firma + fotos | ❌ | **Gap BR** |
| Reporte de incidencias | ✅ | ❌ | **Gap BR** |
| Tracking GPS | ✅ | ✅ Location endpoint | Paridad |
| Modo offline | ❌ No claro | ❌ | Paridad |

### 11. Integraciones / API

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| REST API pública | ✅ Documentada | ✅ API routes internas | FB más avanzado |
| Webhooks | ✅ Con eventos configurables | ❌ | **Gap BR** |
| WebSocket channels | ✅ SocketCluster | ❌ | **Gap BR** |
| SDKs (JS, PHP) | ✅ Múltiples | ❌ | **Gap BR** |
| Shipping carriers (FedEx, etc.) | ✅ Omniship library | ❌ | **Gap BR** |
| Extension marketplace | ✅ 20+ extensiones | ❌ | **Gap BR** |
| API keys management | ✅ | ❌ | **Gap BR** |

### 12. Dashboard / Analytics

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Dashboard principal | ✅ Con widgets | ✅ Métricas básicas | FB más avanzado |
| KPIs de optimización | ❌ | ✅ Distancia, tiempo, utilización | **BR ventaja** |
| Historial de métricas | ❌ | ✅ Plan metrics | **BR ventaja** |
| Widgets configurables | ✅ | ❌ | **Gap BR** |
| Reportes exportables | ❌ No claro | ❌ | Paridad |

### 13. Configuración / Settings

| Funcionalidad | Fleetbase | BetterRoute | Estado |
|---------------|:---------:|:-----------:|--------|
| Multi-empresa | ✅ Organizations | ✅ Companies con switcher global | Paridad |
| Timezone/moneda/formato | ✅ | ✅ Por empresa | Paridad |
| Presets de optimización | ❌ | ✅ | **BR ventaja** |
| Presets de ventanas de tiempo | ❌ | ✅ | **BR ventaja** |
| Configuración de optimización | ❌ | ✅ | **BR ventaja** |

---

## Matriz Resumen de Ventajas

### Ventajas de BetterRoute sobre Fleetbase

| # | Funcionalidad | Importancia |
|---|---------------|-------------|
| 1 | **Motor de optimización de rutas** (VROOM/OSRM/PyVRP) | Crítica |
| 2 | Restricciones avanzadas (capacidad 4D, skills, horarios) | Crítica |
| 3 | Workflow de planificación en 3 pasos | Alta |
| 4 | Presets de optimización y ventanas de tiempo | Alta |
| 5 | Sistema de habilidades (conductor + vehículo) | Alta |
| 6 | Importación CSV con mapeo automático | Alta |
| 7 | Reasignación de conductores con análisis de impacto | Media |
| 8 | Historial de planes con métricas | Media |
| 9 | Disponibilidad de conductores por día | Media |
| 10 | Multi-sesión con invalidación | Baja |

### Ventajas de Fleetbase sobre BetterRoute (Gaps)

| # | Funcionalidad | Importancia para BR | Esfuerzo estimado |
|---|---------------|:-------------------:|:-----------------:|
| 1 | **WebSocket real-time** (SocketCluster) | Alta | Medio |
| 2 | **Webhooks** (eventos configurables) | Alta | Medio |
| 3 | **Proof of Delivery** (firma + fotos en app) | Alta | Alto |
| 4 | **Navegación turn-by-turn** en app conductor | Media | Alto (dependencia Mapbox) |
| 5 | **API pública documentada** con SDKs | Media | Alto |
| 6 | **Chat integrado** | Baja | Alto |
| 7 | **Portal del cliente** (tracking link) | Media | Medio |
| 8 | **Storefront** (e-commerce) | Baja (no es nuestro caso de uso) | Muy alto |
| 9 | **WMS/Inventario** (Pallet) | Baja (no es nuestro caso de uso) | Muy alto |
| 10 | **Extension marketplace** | Baja | Muy alto |
| 11 | **Campos personalizados** en entidades | Media | Medio |
| 12 | **Workflows personalizables** de pedidos | Media | Alto |

---

## Gaps Prioritarios a Cerrar

### Prioridad 1 - Alto impacto, esfuerzo razonable

1. **WebSocket para monitoreo real-time**
   - Actual: Polling HTTP cada N segundos
   - Objetivo: WebSocket con canales por conductor/pedido
   - Tecnología sugerida: Socket.io o native WebSocket con Redis pub/sub
   - Impacto: UX de monitoreo mucho más fluido

2. **Webhooks**
   - Actual: No existe
   - Objetivo: Eventos configurables (order.created, driver.location_changed, etc.)
   - Impacto: Permite integraciones con sistemas externos

3. **Tracking link para clientes**
   - Actual: No existe
   - Objetivo: URL pública con mapa de seguimiento de entrega
   - Impacto: Reduce llamadas de soporte "¿dónde está mi pedido?"

### Prioridad 2 - Alto impacto, mayor esfuerzo

4. **Proof of Delivery en app móvil**
   - Actual: Solo ubicación GPS
   - Objetivo: Captura de firma digital + fotos + notas
   - Impacto: Validación legal de entregas

5. **Campos personalizados en pedidos**
   - Actual: Schema fijo
   - Objetivo: Campos dinámicos definidos por empresa
   - Impacto: Adaptabilidad a diferentes industrias

### Prioridad 3 - Mejoras futuras

6. **Navegación turn-by-turn** en app del conductor
7. **Chat entre operador y conductor**
8. **Workflows personalizables de estados de pedido**
9. **API pública con documentación OpenAPI/Swagger**
10. **Dashboard con widgets configurables**

---

## Conclusión

**BetterRoute tiene una ventaja competitiva clara en optimización de rutas** — el core del negocio. Fleetbase NO tiene motor de optimización integrado, lo que significa que para su caso de uso principal (planificar rutas óptimas), los usuarios de Fleetbase necesitarían integraciones externas.

**Fleetbase es más amplio pero menos profundo** en logística de entrega. Su fortaleza está en ser una plataforma extensible para múltiples casos de uso (e-commerce, inventario, TMS genérico), con buenas integraciones (webhooks, WebSocket, SDKs).

**Recomendación**: No intentar replicar Fleetbase como plataforma genérica. En su lugar, cerrar los gaps que impactan directamente la experiencia de planificación y entrega:
1. WebSocket real-time
2. Webhooks
3. Tracking link para clientes
4. Proof of Delivery
5. Campos personalizados
