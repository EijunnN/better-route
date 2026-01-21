# 📋 Estado del Proyecto - Sistema de Planificación de Rutas

> **Última actualización:** Enero 2025
> **Stack tecnológico:** Next.js 16 + React 19 + Drizzle ORM + PostgreSQL + VROOM

---

## 📊 Resumen Ejecutivo

Sistema de planificación y optimización de rutas de entrega multi-empresa con capacidades de:

| Funcionalidad | Estado | Progreso |
|---------------|--------|----------|
| Multi-tenancy | ✅ Completado | 100% |
| Gestión de Flotas | ✅ Completado | 100% |
| Gestión de Vehículos | ✅ Completado | 100% |
| Gestión de Conductores | ✅ Completado | 100% |
| Importación de Pedidos | ✅ Completado | 100% |
| Optimización de Rutas | ✅ Completado | 100% |
| Monitoreo en Tiempo Real | ✅ Completado | 95% |
| Sistema de Alertas | ✅ Completado | 90% |
| Roles y Permisos | ✅ Completado | 100% |
| Zonas Geográficas | ✅ Completado | 100% |

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Arquitectura General

```mermaid
flowchart TB
    subgraph Cliente["🖥️ Cliente (Browser)"]
        UI[React 19 + Next.js 16]
        Maps[MapLibre GL]
    end

    subgraph NextJS["⚡ Next.js App Router"]
        Pages[Pages - App Router]
        API[API Routes]
        Auth[Autenticación JWT]
        Middleware[Middleware Multi-tenant]
    end

    subgraph Services["🔧 Servicios de Negocio"]
        OptEngine[Motor de Optimización]
        AlertEngine[Motor de Alertas]
        DriverAssign[Asignación de Conductores]
        GeoService[Servicios Geoespaciales]
    end

    subgraph External["🌐 Servicios Externos"]
        VROOM[VROOM - VRP Solver]
        OSRM[OSRM - Routing]
    end

    subgraph Data["💾 Capa de Datos"]
        Drizzle[Drizzle ORM]
        PG[(PostgreSQL)]
        Redis[(Redis - Caché)]
    end

    UI --> Pages
    Maps --> Pages
    Pages --> API
    API --> Auth
    Auth --> Middleware
    Middleware --> Services

    OptEngine --> VROOM
    OptEngine --> OSRM
    GeoService --> Maps

    Services --> Drizzle
    Drizzle --> PG
    Services --> Redis

    style Cliente fill:#e1f5fe
    style NextJS fill:#fff3e0
    style Services fill:#e8f5e9
    style External fill:#fce4ec
    style Data fill:#f3e5f5
```

### Diagrama de Modelo de Datos

```mermaid
erDiagram
    COMPANIES ||--o{ USERS : "tiene"
    COMPANIES ||--o{ FLEETS : "tiene"
    COMPANIES ||--o{ VEHICLES : "tiene"
    COMPANIES ||--o{ ORDERS : "tiene"
    COMPANIES ||--o{ ZONES : "tiene"
    COMPANIES ||--o{ OPTIMIZATION_CONFIGS : "tiene"

    FLEETS ||--o{ VEHICLE_FLEETS : "contiene"
    VEHICLES ||--o{ VEHICLE_FLEETS : "pertenece"
    VEHICLES ||--o{ ROUTE_STOPS : "asignado"

    USERS ||--o{ USER_ROLES : "tiene"
    USERS ||--o{ USER_SKILLS : "tiene"
    USERS ||--o{ ROUTE_STOPS : "asignado"

    ROLES ||--o{ USER_ROLES : "asignado"
    ROLES ||--o{ ROLE_PERMISSIONS : "tiene"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "asignado"

    ORDERS ||--o{ ROUTE_STOPS : "genera"

    OPTIMIZATION_CONFIGS ||--o{ OPTIMIZATION_JOBS : "ejecuta"
    OPTIMIZATION_JOBS ||--o{ ROUTE_STOPS : "genera"
    OPTIMIZATION_JOBS ||--o{ PLAN_METRICS : "tiene"

    ZONES ||--o{ ZONE_VEHICLES : "asigna"
    VEHICLES ||--o{ ZONE_VEHICLES : "pertenece"

    COMPANIES {
        uuid id PK
        string legalName
        string commercialName
        string country
        string timezone
    }

    USERS {
        uuid id PK
        uuid companyId FK
        string name
        string email
        string role
        string driverStatus
    }

    VEHICLES {
        uuid id PK
        uuid companyId FK
        string name
        string plate
        int maxOrders
        string status
    }

    ORDERS {
        uuid id PK
        uuid companyId FK
        string trackingId
        string address
        string latitude
        string longitude
        string status
    }

    OPTIMIZATION_JOBS {
        uuid id PK
        uuid configurationId FK
        string status
        int progress
        text result
    }

    ROUTE_STOPS {
        uuid id PK
        uuid jobId FK
        uuid vehicleId FK
        uuid userId FK
        uuid orderId FK
        int sequence
        string status
    }
```

### Flujo de Optimización de Rutas

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant FE as 🖥️ Frontend
    participant API as ⚡ API
    participant OPT as 🧮 Optimizador
    participant VROOM as 🚛 VROOM
    participant DB as 💾 PostgreSQL

    U->>FE: 1. Selecciona vehículos y pedidos
    FE->>API: 2. POST /api/optimization/configure
    API->>DB: 3. Crear configuración
    DB-->>API: 4. ID de configuración

    FE->>API: 5. GET /api/optimization/jobs/{id}
    API->>OPT: 6. Iniciar optimización
    OPT->>DB: 7. Cargar pedidos y vehículos

    OPT->>VROOM: 8. Enviar problema VRP
    VROOM-->>OPT: 9. Solución optimizada

    OPT->>OPT: 10. Post-procesamiento (balanceo)
    OPT->>DB: 11. Guardar rutas y métricas

    OPT-->>API: 12. Resultado completo
    API-->>FE: 13. Rutas optimizadas
    FE-->>U: 14. Mostrar en mapa

    U->>FE: 15. Confirmar plan
    FE->>API: 16. POST /api/optimization/jobs/{id}/confirm
    API->>DB: 17. Crear route_stops
    API->>DB: 18. Actualizar estados
    DB-->>API: 19. Plan confirmado
    API-->>FE: 20. Éxito
```

---

## 📁 Estructura del Proyecto

```
src/
├── app/                          # Next.js App Router
│   ├── (protected)/              # Rutas protegidas
│   │   ├── companies/            # 🏢 Gestión de empresas
│   │   ├── configuracion/        # ⚙️ Configuración general
│   │   ├── dashboard/            # 📊 Dashboard principal
│   │   ├── drivers/              # 👤 Gestión de conductores
│   │   ├── driver-skills/        # 🎯 Habilidades de conductores
│   │   ├── fleets/               # 🚛 Gestión de flotas
│   │   ├── monitoring/           # 📡 Monitoreo en tiempo real
│   │   ├── optimization-presets/ # 🎛️ Presets de optimización
│   │   ├── orders/               # 📦 Gestión de pedidos
│   │   ├── planificacion/        # 🗺️ Planificación de rutas
│   │   ├── roles/                # 🔐 Gestión de roles
│   │   ├── time-window-presets/  # ⏰ Ventanas horarias
│   │   ├── users/                # 👥 Gestión de usuarios
│   │   ├── user-skills/          # 🎖️ Habilidades de usuarios
│   │   ├── vehicles/             # 🚗 Gestión de vehículos
│   │   ├── vehicle-skills/       # 🔧 Habilidades de vehículos
│   │   └── zones/                # 📍 Zonas geográficas
│   ├── api/                      # API Routes
│   │   ├── auth/                 # 🔑 Autenticación
│   │   ├── alerts/               # 🚨 Sistema de alertas
│   │   ├── companies/            # Empresas API
│   │   ├── driver-assignment/    # Asignación de conductores
│   │   ├── fleets/               # Flotas API
│   │   ├── monitoring/           # Monitoreo API
│   │   ├── optimization/         # Optimización API
│   │   ├── orders/               # Pedidos API
│   │   ├── reassignment/         # Reasignación de rutas
│   │   ├── roles/                # Roles API
│   │   ├── route-stops/          # Paradas de ruta
│   │   ├── users/                # Usuarios API
│   │   ├── vehicles/             # Vehículos API
│   │   └── zones/                # Zonas API
│   └── login/                    # Página de login
├── components/                   # Componentes React
│   ├── alerts/                   # Componentes de alertas
│   ├── auth/                     # Componentes de autenticación
│   ├── monitoring/               # Componentes de monitoreo
│   ├── planificacion/            # Componentes de planificación
│   └── ui/                       # Componentes UI (shadcn)
├── db/                           # Capa de datos
│   ├── schema.ts                 # Esquema Drizzle
│   ├── index.ts                  # Conexión DB
│   └── tenant-aware.ts           # Queries multi-tenant
├── hooks/                        # Custom React Hooks
├── lib/                          # Librerías de negocio
│   ├── alerts/                   # Motor de alertas
│   ├── auth/                     # Autenticación y autorización
│   ├── export/                   # Exportación Excel/PDF
│   ├── geo/                      # Servicios geoespaciales
│   ├── infra/                    # Infraestructura (caché, audit)
│   ├── optimization/             # Motor de optimización
│   ├── orders/                   # Lógica de pedidos
│   ├── routing/                  # Generación de rutas
│   └── validations/              # Esquemas de validación Zod
└── types/                        # Tipos TypeScript
```

---

## ✅ Módulos Completados

### Diagrama de Estado de Módulos

```mermaid
pie title Estado de Módulos del Sistema
    "Completado" : 85
    "En Progreso" : 10
    "Pendiente" : 5
```

### 🟢 Módulos Completados (85%)

| Módulo | Descripción | Características |
|--------|-------------|-----------------|
| **Multi-tenancy** | Sistema multi-empresa | Aislamiento de datos por empresa, perfiles de optimización |
| **Autenticación** | JWT + Sesiones | Login, logout, refresh tokens, gestión de sesiones |
| **Usuarios** | CRUD completo | Roles, permisos, conductores, administradores |
| **Roles y Permisos** | RBAC configurable | Permisos granulares por módulo y acción |
| **Flotas** | Gestión de flotas | Tipos de flota, capacidades, horarios |
| **Vehículos** | Gestión de vehículos | Estados, capacidades, asignación de conductores |
| **Pedidos** | Gestión de pedidos | CRUD, importación CSV, estados |
| **Optimización** | Motor VROOM | VRP, ventanas horarias, capacidades, habilidades |
| **Zonas** | Zonas geográficas | Polígonos GeoJSON, asignación de vehículos |
| **Presets** | Configuraciones | Ventanas horarias, optimización |

### 🟡 Módulos En Progreso (10%)

| Módulo | Estado | Pendiente |
|--------|--------|-----------|
| **Monitoreo** | 95% | Notificaciones push en tiempo real |
| **Alertas** | 90% | Notificaciones por email/SMS |

### 🔴 Módulos Pendientes (5%)

| Módulo | Prioridad | Descripción |
|--------|-----------|-------------|
| **App Conductor** | Alta | Aplicación móvil para conductores |
| **Reportes** | Media | Dashboard de reportes y KPIs |

---

## 📊 Entidades del Sistema

### Resumen de Tablas de Base de Datos

```mermaid
graph LR
    subgraph Core["🏢 Core"]
        C[companies]
        U[users]
        R[roles]
        P[permissions]
    end

    subgraph Fleet["🚛 Flota"]
        F[fleets]
        V[vehicles]
        VS[vehicle_skills]
    end

    subgraph Orders["📦 Pedidos"]
        O[orders]
        TW[time_window_presets]
        CSV[csv_column_mapping_templates]
    end

    subgraph Optimization["🧮 Optimización"]
        OC[optimization_configurations]
        OJ[optimization_jobs]
        RS[route_stops]
        PM[plan_metrics]
        OP[optimization_presets]
    end

    subgraph Alerts["🚨 Alertas"]
        AR[alert_rules]
        A[alerts]
        AN[alert_notifications]
    end

    subgraph Zones["📍 Zonas"]
        Z[zones]
        ZV[zone_vehicles]
    end

    C --> U
    C --> F
    C --> V
    C --> O
    C --> Z
    C --> OC

    style Core fill:#e3f2fd
    style Fleet fill:#e8f5e9
    style Orders fill:#fff8e1
    style Optimization fill:#fce4ec
    style Alerts fill:#f3e5f5
    style Zones fill:#e0f7fa
```

### Conteo de Entidades

| Categoría | Tablas | Descripción |
|-----------|--------|-------------|
| **Core** | 6 | companies, users, roles, permissions, role_permissions, user_roles |
| **Flota** | 8 | fleets, vehicles, vehicle_fleets, vehicle_skills, vehicle_status_history, vehicle_fleet_history |
| **Usuarios** | 5 | user_skills, user_availability, user_secondary_fleets, user_driver_status_history, user_fleet_permissions |
| **Pedidos** | 3 | orders, time_window_presets, csv_column_mapping_templates |
| **Optimización** | 6 | optimization_configurations, optimization_jobs, optimization_presets, route_stops, route_stop_history, plan_metrics |
| **Alertas** | 3 | alert_rules, alerts, alert_notifications |
| **Zonas** | 2 | zones, zone_vehicles |
| **Auditoría** | 3 | audit_logs, reassignments_history, output_history |
| **Total** | **36** | |

---

## 🔌 API Endpoints

### Resumen de Endpoints por Módulo

```mermaid
graph TB
    subgraph Auth["🔑 Autenticación"]
        A1[POST /api/auth/login]
        A2[POST /api/auth/logout]
        A3[GET /api/auth/me]
        A4[POST /api/auth/refresh]
        A5[GET /api/auth/sessions]
    end

    subgraph Orders["📦 Pedidos"]
        O1[GET/POST /api/orders]
        O2[PATCH/DELETE /api/orders/:id]
        O3[POST /api/orders/import]
        O4[POST /api/orders/batch]
        O5[GET /api/orders/geojson]
    end

    subgraph Optimization["🧮 Optimización"]
        OP1[POST /api/optimization/configure]
        OP2[GET /api/optimization/jobs/:id]
        OP3[POST /api/optimization/jobs/:id/confirm]
        OP4[POST /api/optimization/jobs/:id/reassign]
        OP5[GET /api/optimization/engines]
    end

    subgraph Monitoring["📡 Monitoreo"]
        M1[GET /api/monitoring/summary]
        M2[GET /api/monitoring/drivers]
        M3[GET /api/monitoring/drivers/:id]
        M4[GET /api/monitoring/geojson]
    end

    style Auth fill:#e3f2fd
    style Orders fill:#fff8e1
    style Optimization fill:#fce4ec
    style Monitoring fill:#e8f5e9
```

### Lista Completa de Endpoints

| Módulo | Endpoints | Métodos |
|--------|-----------|---------|
| **Auth** | 7 | login, logout, me, refresh, sessions |
| **Companies** | 2 | CRUD empresas |
| **Users** | 5 | CRUD usuarios, roles, sesiones |
| **Roles** | 4 | CRUD roles y permisos |
| **Fleets** | 4 | CRUD flotas |
| **Vehicles** | 6 | CRUD vehículos, estados |
| **Orders** | 8 | CRUD pedidos, importación, batch |
| **Optimization** | 8 | Configuración, jobs, métricas |
| **Monitoring** | 4 | Resumen, conductores, GeoJSON |
| **Alerts** | 6 | CRUD alertas, reglas |
| **Zones** | 3 | CRUD zonas |
| **Route Stops** | 3 | CRUD paradas |
| **Total** | **~60** | |

---

## 🚀 Próximos Pasos

### Prioridad Alta 🔴

```mermaid
gantt
    title Roadmap - Próximos 3 Meses
    dateFormat  YYYY-MM
    section Alta Prioridad
    App Conductor (React Native)    :a1, 2025-02, 60d
    Notificaciones Push             :a2, 2025-02, 30d

    section Media Prioridad
    Dashboard de Reportes           :b1, 2025-03, 45d
    Integración GPS en tiempo real  :b2, 2025-03, 30d

    section Baja Prioridad
    Exportación PDF avanzada        :c1, 2025-04, 15d
    Multi-idioma                    :c2, 2025-04, 20d
```

### Tareas Pendientes Priorizadas

| # | Tarea | Prioridad | Esfuerzo | Impacto |
|---|-------|-----------|----------|---------|
| 1 | **App Conductor (React Native)** | 🔴 Alta | Alto | Alto |
| 2 | **Notificaciones push en monitoreo** | 🔴 Alta | Medio | Alto |
| 3 | **Integración con GPS en tiempo real** | 🔴 Alta | Alto | Alto |
| 4 | **Dashboard de reportes y KPIs** | 🟡 Media | Medio | Medio |
| 5 | **Notificaciones por email/SMS** | 🟡 Media | Medio | Medio |
| 6 | **Exportación PDF de planes** | 🟡 Media | Bajo | Bajo |
| 7 | **Histórico de métricas comparativas** | 🟢 Baja | Bajo | Bajo |
| 8 | **Soporte multi-idioma (i18n)** | 🟢 Baja | Medio | Bajo |

---

## 🔧 Stack Tecnológico

### Frontend
- **Framework:** Next.js 16 (App Router)
- **UI Library:** React 19 con React Compiler
- **Componentes:** shadcn/ui + Radix UI
- **Estilos:** Tailwind CSS 4
- **Mapas:** MapLibre GL
- **Estado:** SWR para data fetching
- **Validación:** Zod

### Backend
- **Runtime:** Bun
- **Framework:** Next.js API Routes
- **ORM:** Drizzle ORM
- **Base de Datos:** PostgreSQL
- **Caché:** Redis (Upstash)
- **Autenticación:** JWT (jose)

### Optimización
- **Motor VRP:** VROOM
- **Routing:** OSRM
- **Algoritmo Fallback:** Nearest Neighbor

### DevOps
- **Linting:** Biome
- **Testing E2E:** Playwright
- **Containerización:** Docker

---

## 📈 Métricas del Proyecto

```mermaid
pie title Distribución de Código por Área
    "API Routes" : 35
    "Componentes UI" : 25
    "Lógica de Negocio" : 20
    "Schema/Validaciones" : 10
    "Utilidades" : 10
```

| Métrica | Valor |
|---------|-------|
| **Tablas de BD** | 36 |
| **Endpoints API** | ~60 |
| **Páginas UI** | 21 |
| **Componentes** | ~50 |
| **Archivos TypeScript** | ~150 |
| **Líneas de código (estimado)** | ~25,000 |

---

## 📚 Documentación Relacionada

- [Roles y Permisos](./ROLES-PERMISSIONS.md)
- [Sistema de Optimización](./SISTEMA_OPTIMIZACION.md)
- [Deployment y Routing](./DEPLOYMENT-ROUTING.md)

---

> 📝 **Nota:** Este documento se actualiza periódicamente para reflejar el estado actual del proyecto.
