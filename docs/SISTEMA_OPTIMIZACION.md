# Sistema de Planificación y Optimización de Rutas

## Tabla de Contenidos

1. [Resumen del Sistema](#resumen-del-sistema)
2. [Arquitectura](#arquitectura)
3. [Configuración de Perfil de Empresa](#configuración-de-perfil-de-empresa)
4. [Gestión de Órdenes](#gestión-de-órdenes)
5. [Gestión de Vehículos](#gestión-de-vehículos)
6. [Proceso de Optimización](#proceso-de-optimización)
7. [Flujo Completo de Uso](#flujo-completo-de-uso)
8. [APIs Disponibles](#apis-disponibles)
9. [Parámetros y Configuraciones](#parámetros-y-configuraciones)

---

## Resumen del Sistema

El sistema de planificación permite a empresas de diferentes tipos configurar y optimizar rutas de entrega según sus necesidades específicas. Soporta múltiples dimensiones de capacidad (peso, volumen, valorizado, unidades) y dos motores de optimización:

- **VROOM (Optimización Rápida)**: Resultados en segundos, ideal para planificación diaria
- **PYVRP (Optimización Avanzada)**: Mayor calidad, para optimización a largo plazo (futuro)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│  /configuracion     │  /planificacion    │  /orders             │
│  (Perfil Empresa)   │  (Wizard 3 pasos)  │  (CRUD Órdenes)      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Routes                               │
├─────────────────────────────────────────────────────────────────┤
│  /api/company-profiles  │  /api/optimization/configure          │
│  /api/orders            │  /api/optimization/engines            │
│  /api/vehicles          │  /api/orders/csv-template             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Capa de Optimización                          │
├─────────────────────────────────────────────────────────────────┤
│  OptimizerFactory  →  IOptimizer Interface                       │
│       │                    │                                     │
│       ├──> VroomAdapter ──────> VROOM (OSR Tools)               │
│       └──> PyVRPAdapter ──────> PYVRP (Python/Futuro)           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Capacity Mapper                               │
├─────────────────────────────────────────────────────────────────┤
│  - Mapea dimensiones según perfil de empresa                     │
│  - Convierte órdenes → jobs VROOM                                │
│  - Convierte vehículos → vehicles VROOM                          │
│  - Calcula prioridades según tipo de pedido                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuración de Perfil de Empresa

### Página: `/configuracion`

Permite configurar qué dimensiones de capacidad son relevantes para la empresa.

### Dimensiones Disponibles

| Dimensión | Campo BD | Descripción |
|-----------|----------|-------------|
| **Peso** | `enableWeight` | Capacidad en kg |
| **Volumen** | `enableVolume` | Capacidad en litros |
| **Valorizado** | `enableOrderValue` | Valor monetario máximo por ruta |
| **Unidades** | `enableUnits` | Cantidad de paquetes/items |

### Templates Predefinidos

| Template | Peso | Volumen | Valor | Unidades | Caso de Uso |
|----------|------|---------|-------|----------|-------------|
| **LOGISTICS** | ✅ | ✅ | ❌ | ❌ | Logística tradicional |
| **HIGH_VALUE** | ❌ | ❌ | ✅ | ✅ | Productos de alto valor (electrónicos) |
| **SIMPLE** | ❌ | ❌ | ❌ | ❌ | Sin restricciones de capacidad |
| **FULL** | ✅ | ✅ | ✅ | ✅ | Control completo |

### Prioridades por Tipo de Pedido

El sistema permite configurar la prioridad (0-100) para cada tipo de orden:

| Tipo | Prioridad Default | Descripción |
|------|-------------------|-------------|
| `NEW` | 50 | Pedidos nuevos |
| `RESCHEDULED` | 80 | Pedidos reprogramados |
| `URGENT` | 100 | Pedidos urgentes |

> Las prioridades más altas indican mayor importancia para ser incluidos en la ruta.

### API de Perfil

```bash
# Obtener perfil actual
GET /api/company-profiles
Headers: x-company-id: <company-id>

# Crear/actualizar perfil
POST /api/company-profiles
Headers: x-company-id: <company-id>
Body: {
  "enableWeight": true,
  "enableVolume": true,
  "enableOrderValue": false,
  "enableUnits": false,
  "enableOrderType": false,
  "priorityNew": 50,
  "priorityRescheduled": 80,
  "priorityUrgent": 100
}

# Usar template
POST /api/company-profiles
Body: { "templateId": "LOGISTICS" }

# Restablecer a defaults
DELETE /api/company-profiles
```

---

## Gestión de Órdenes

### Campos de Orden

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `trackingId` | string | ✅ | Identificador único del pedido |
| `address` | string | ✅ | Dirección de entrega |
| `latitude` | string | ✅ | Coordenada latitud |
| `longitude` | string | ✅ | Coordenada longitud |
| `weightRequired` | number | ❌ | Peso requerido (kg) |
| `volumeRequired` | number | ❌ | Volumen requerido (L) |
| `orderValue` | number | ❌ | Valor del pedido (céntimos) |
| `unitsRequired` | number | ❌ | Unidades/paquetes |
| `orderType` | enum | ❌ | NEW, RESCHEDULED, URGENT |
| `priority` | number | ❌ | Prioridad manual (0-100) |
| `timeWindowPresetId` | string | ❌ | Ventana horaria |

### Importación CSV

El sistema genera plantillas CSV dinámicas según el perfil de empresa:

```bash
# Descargar plantilla CSV según perfil
GET /api/orders/csv-template
Headers: x-company-id: <company-id>
```

**Campos base (siempre requeridos):**
- trackcode, direccion, referencia, departamento, provincia, distrito, latitud, longitud

**Campos opcionales según perfil:**
- peso_kg (si enableWeight)
- volumen_litros (si enableVolume)
- valor (si enableOrderValue)
- unidades (si enableUnits)
- tipo_pedido (si enableOrderType)

### Creación Individual

```bash
POST /api/orders
Headers: x-company-id: <company-id>
Body: {
  "trackingId": "ORD-001",
  "address": "Av. Principal 123",
  "latitude": "-12.0464",
  "longitude": "-77.0428",
  "weightRequired": 5.5,
  "volumeRequired": 10,
  "orderValue": 15000,  // céntimos
  "orderType": "NEW"
}
```

### Importación Masiva

```bash
POST /api/orders/batch
Headers: x-company-id: <company-id>
Body: {
  "orders": [...],
  "skipDuplicates": true
}
```

---

## Gestión de Vehículos

### Campos de Vehículo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | string | Nombre del vehículo |
| `plate` | string | Placa |
| `weightCapacity` | number | Capacidad peso (kg) |
| `volumeCapacity` | number | Capacidad volumen (L) |
| `maxValueCapacity` | number | Capacidad valorizado |
| `maxUnitsCapacity` | number | Capacidad unidades |
| `maxOrders` | number | Máximo de órdenes |
| `originLatitude` | string | Ubicación origen |
| `originLongitude` | string | Ubicación origen |

### Mapeo de Capacidades

El `capacity-mapper` convierte los campos de vehículo al formato VROOM según las dimensiones activas:

```typescript
// Ejemplo: Perfil con peso y volumen activos
vehicle.capacity = [weightCapacity, volumeCapacity]

// Ejemplo: Perfil con valor y unidades activos
vehicle.capacity = [maxValueCapacity, maxUnitsCapacity]
```

---

## Proceso de Optimización

### Motores Disponibles

#### VROOM (Optimización Rápida)

| Característica | Valor |
|----------------|-------|
| Velocidad | Milisegundos a segundos |
| Calidad | Buena |
| Capacidad multi-dimensional | ✅ Ilimitadas |
| Prioridades | ✅ 0-100 |
| Ventanas horarias | ✅ |
| Habilidades | ✅ |
| Max órdenes | 10,000 |
| Max vehículos | 500 |

#### PYVRP (Optimización Avanzada) - Futuro

| Característica | Valor |
|----------------|-------|
| Velocidad | Minutos a horas |
| Calidad | Excelente |
| Restricciones custom | ✅ |
| Precedencias | ✅ |

### Selección Automática

El `OptimizerFactory` puede seleccionar automáticamente el motor:

```typescript
// AUTO selecciona según tamaño del problema
const optimizer = OptimizerFactory.getOptimizer("AUTO", {
  orderCount: 500,
  vehicleCount: 20
});
// Si orderCount > 1000 y PYVRP disponible → PYVRP
// De lo contrario → VROOM
```

### Configuración de Optimización

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `objective` | enum | BALANCED | TIME, DISTANCE, BALANCED |
| `capacityEnabled` | boolean | true | Respetar capacidades |
| `serviceTimeMinutes` | number | 10 | Tiempo por entrega |
| `workWindowStart` | string | "08:00" | Hora inicio |
| `workWindowEnd` | string | "20:00" | Hora fin |
| `timeWindowStrictness` | enum | SOFT | STRICT, SOFT |
| `penaltyFactor` | number | 5 | Penalización ventanas |
| `optimizerType` | enum | VROOM | VROOM, PYVRP, AUTO |

---

## Flujo Completo de Uso

### Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. CONFIGURACIÓN INICIAL                      │
├─────────────────────────────────────────────────────────────────┤
│  Admin accede a /configuracion                                   │
│       │                                                          │
│       ▼                                                          │
│  Selecciona template o configura dimensiones                     │
│       │                                                          │
│       ▼                                                          │
│  Configura prioridades por tipo de pedido                        │
│       │                                                          │
│       ▼                                                          │
│  Guarda perfil de empresa                                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    2. CARGA DE DATOS                             │
├─────────────────────────────────────────────────────────────────┤
│  Opción A: Importar órdenes via CSV                              │
│       │    - Descargar template (/api/orders/csv-template)       │
│       │    - Llenar datos                                        │
│       │    - Subir desde /planificacion                          │
│       │                                                          │
│  Opción B: Crear órdenes manualmente                             │
│       │    - Desde /orders/new                                   │
│       │    - Formulario muestra campos según perfil              │
│       │                                                          │
│  Registrar vehículos en /vehicles                                │
│       │    - Configurar capacidades                              │
│       │    - Asignar conductor                                   │
│       │    - Definir ubicación origen                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    3. PLANIFICACIÓN                              │
├─────────────────────────────────────────────────────────────────┤
│  Acceder a /planificacion                                        │
│       │                                                          │
│       ▼                                                          │
│  PASO 1: Seleccionar Vehículos                                   │
│       │    - Filtrar por flota                                   │
│       │    - Ver capacidades y conductor asignado                │
│       │    - Seleccionar vehículos para el plan                  │
│       │                                                          │
│       ▼                                                          │
│  PASO 2: Seleccionar Visitas                                     │
│       │    - Ver órdenes pendientes                              │
│       │    - Identificar alertas (sin coordenadas)               │
│       │    - Editar órdenes con problemas                        │
│       │    - Seleccionar órdenes a incluir                       │
│       │                                                          │
│       ▼                                                          │
│  PASO 3: Configurar Optimización                                 │
│       │    - Seleccionar motor (Rápida/Avanzada)                 │
│       │    - Definir objetivo (tiempo/distancia/balanceado)      │
│       │    - Configurar tiempo de servicio                       │
│       │    - Activar/desactivar restricciones de capacidad       │
│       │                                                          │
│       ▼                                                          │
│  Ejecutar "Optimizar rutas"                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    4. RESULTADOS                                 │
├─────────────────────────────────────────────────────────────────┤
│  Sistema ejecuta optimización                                    │
│       │    - Capacity Mapper transforma datos según perfil       │
│       │    - VROOM/PYVRP calcula rutas óptimas                   │
│       │                                                          │
│       ▼                                                          │
│  Ver resultados en /planificacion/[id]/results                   │
│       │    - Mapa con rutas coloreadas                           │
│       │    - Lista de rutas por vehículo                         │
│       │    - Estadísticas (distancia, tiempo, órdenes)           │
│       │                                                          │
│       ▼                                                          │
│  Confirmar y crear plan de distribución                          │
│       │    - Asignar rutas a conductores                         │
│       │    - Generar hojas de ruta                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    5. MONITOREO                                  │
├─────────────────────────────────────────────────────────────────┤
│  Seguimiento en /monitoring                                      │
│       │    - Posición de conductores en tiempo real              │
│       │    - Estado de entregas                                  │
│       │    - Alertas y desviaciones                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## APIs Disponibles

### Perfiles de Empresa

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/company-profiles` | Obtener perfil actual |
| POST | `/api/company-profiles` | Crear/actualizar perfil |
| DELETE | `/api/company-profiles` | Restablecer a defaults |

### Órdenes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/orders` | Listar órdenes |
| POST | `/api/orders` | Crear orden |
| PATCH | `/api/orders/[id]` | Actualizar orden |
| DELETE | `/api/orders/[id]` | Eliminar orden |
| POST | `/api/orders/batch` | Importación masiva |
| GET | `/api/orders/csv-template` | Descargar template CSV |

### Optimización

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/optimization/engines` | Listar motores disponibles |
| POST | `/api/optimization/configure` | Crear configuración |
| POST | `/api/optimization/run` | Ejecutar optimización |
| GET | `/api/optimization/[id]/results` | Obtener resultados |

### Vehículos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/vehicles` | Listar vehículos |
| GET | `/api/vehicles/available` | Vehículos disponibles |
| POST | `/api/vehicles` | Crear vehículo |
| PATCH | `/api/vehicles/[id]` | Actualizar vehículo |

---

## Parámetros y Configuraciones

### Tabla de Referencia Rápida

| Parámetro | Ubicación | Valores | Descripción |
|-----------|-----------|---------|-------------|
| `enableWeight` | Perfil | boolean | Activar dimensión peso |
| `enableVolume` | Perfil | boolean | Activar dimensión volumen |
| `enableOrderValue` | Perfil | boolean | Activar dimensión valorizado |
| `enableUnits` | Perfil | boolean | Activar dimensión unidades |
| `priorityNew` | Perfil | 0-100 | Prioridad pedidos nuevos |
| `priorityRescheduled` | Perfil | 0-100 | Prioridad reprogramados |
| `priorityUrgent` | Perfil | 0-100 | Prioridad urgentes |
| `optimizerType` | Optimización | VROOM/PYVRP/AUTO | Motor a usar |
| `objective` | Optimización | TIME/DISTANCE/BALANCED | Objetivo |
| `capacityEnabled` | Optimización | boolean | Respetar capacidades |
| `serviceTimeMinutes` | Optimización | number | Tiempo por entrega |
| `timeWindowStrictness` | Optimización | STRICT/SOFT | Rigidez ventanas |

### Valores Recomendados por Tipo de Empresa

#### Empresa de Logística (paquetería)

```json
{
  "enableWeight": true,
  "enableVolume": true,
  "enableOrderValue": false,
  "enableUnits": false,
  "priorityNew": 50,
  "priorityRescheduled": 80,
  "priorityUrgent": 100,
  "optimizerType": "VROOM",
  "objective": "BALANCED",
  "serviceTimeMinutes": 5
}
```

#### Empresa de Productos de Alto Valor

```json
{
  "enableWeight": false,
  "enableVolume": false,
  "enableOrderValue": true,
  "enableUnits": true,
  "priorityNew": 50,
  "priorityRescheduled": 90,
  "priorityUrgent": 100,
  "optimizerType": "VROOM",
  "objective": "TIME",
  "serviceTimeMinutes": 15
}
```

#### Empresa Simple (sin restricciones)

```json
{
  "enableWeight": false,
  "enableVolume": false,
  "enableOrderValue": false,
  "enableUnits": false,
  "priorityNew": 50,
  "priorityRescheduled": 50,
  "priorityUrgent": 100,
  "optimizerType": "VROOM",
  "objective": "DISTANCE",
  "serviceTimeMinutes": 10
}
```

---

## Troubleshooting

### Problema: Órdenes no aparecen en planificación

**Causas posibles:**
1. Órdenes no tienen estado `PENDING`
2. Órdenes no tienen coordenadas válidas
3. Órdenes pertenecen a otra empresa

**Solución:**
- Verificar estado en `/orders`
- Editar órdenes sin coordenadas desde el wizard

### Problema: Capacidad no se respeta

**Causas posibles:**
1. `capacityEnabled` está en `false`
2. Perfil de empresa no tiene dimensiones activas
3. Vehículos no tienen capacidades configuradas

**Solución:**
- Verificar perfil en `/configuracion`
- Verificar capacidades de vehículos en `/vehicles`

### Problema: Prioridades no funcionan

**Causas posibles:**
1. `enableOrderType` está en `false`
2. Órdenes no tienen `orderType` asignado

**Solución:**
- Activar `enableOrderType` en perfil
- Asignar tipo a órdenes (NEW/RESCHEDULED/URGENT)

---

## Arquitectura de Archivos Relevantes

```
src/
├── app/
│   ├── (protected)/
│   │   ├── configuracion/page.tsx    # UI perfil empresa
│   │   └── planificacion/page.tsx    # Wizard de planificación
│   └── api/
│       ├── company-profiles/route.ts # API perfiles
│       ├── orders/
│       │   ├── csv-template/route.ts # Template CSV dinámico
│       │   └── batch/route.ts        # Importación masiva
│       └── optimization/
│           └── engines/route.ts      # Lista motores
├── lib/
│   ├── capacity-mapper.ts            # Mapeo de capacidades
│   ├── dynamic-csv-fields.ts         # Campos CSV dinámicos
│   ├── vroom-optimizer.ts            # Integración VROOM
│   └── optimization/
│       ├── optimizer-interface.ts    # Interface común
│       ├── optimizer-factory.ts      # Factory pattern
│       ├── vroom-adapter.ts          # Adaptador VROOM
│       └── pyvrp-adapter.ts          # Adaptador PYVRP
└── db/
    └── schema.ts                     # Definición BD
```

---

*Documentación generada para el Sistema de Planificación Multi-Empresa v1.0*
