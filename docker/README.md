# Docker Services

Este directorio contiene la configuración de los servicios que acompañan a la
app: optimización de rutas (VROOM + OSRM), realtime (Centrifugo) y caché
(Redis).

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│     VROOM       │
│   (Frontend)    │     │  (Optimization) │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │      OSRM       │
         │              │    (Routing)    │
         │              └─────────────────┘
         │
         ├────────────▶ Centrifugo (WebSocket realtime)
         └────────────▶ Redis (caché)
```

## Servicios

| Servicio | Puerto host | Perfil | Descripción |
|----------|-------------|--------|-------------|
| **VROOM** | 5000 | `routing` | Optimizador de rutas VRP (único solver — ADR-0001) |
| **OSRM** | 5001 | `routing` | Motor de routing por carretera |
| **Centrifugo** | 8000 | — | Realtime WebSocket (ADR-0007) — config del reverse proxy y checklist de despliegue en `docs/deployment-centrifugo.md` |
| **Redis** | 6379 (solo localhost) | — | Caché |

## Inicio Rápido

### 1. Preparar datos de OSRM (solo la primera vez)

OSRM necesita datos de OpenStreetMap procesados. El repo trabaja con
**Perú** (`peru-latest`), que es lo que espera `docker/osrm/`:

```powershell
# Windows
cd docker/osrm
.\setup.ps1
```

```bash
# Linux/Mac
cd docker/osrm
chmod +x setup.sh
./setup.sh
```

Esto descargará los datos de Perú y los procesará (toma ~10-30 min).

### 2. Iniciar servicios

```bash
docker compose --profile routing up -d
```

Sin `--profile routing` arrancan solo Centrifugo y Redis; VROOM y OSRM
quedan fuera (útil cuando trabajás en UI y no vas a optimizar).

### 3. Verificar que funcionan

```bash
# VROOM health
curl http://localhost:5000/health

# OSRM test route
curl "http://localhost:5001/route/v1/driving/-99.1332,19.4326;-99.1677,19.4270?overview=false"
```

## Variables de Entorno

Agregar a `.env`:

```env
VROOM_URL=http://localhost:5000
OSRM_URL=http://localhost:5001
VROOM_TIMEOUT=60000
OSRM_TIMEOUT=30000
```

## Sin VROOM/OSRM no hay optimización

**No hay fallback.** VROOM es el único solver (ADR-0001) y una corrida sin él
falla ruidosamente: el job queda FAILED con el error del solver. El
nearest-neighbor greedy que existía fue eliminado a propósito (SEMANTICS
A11) — ignoraba ventanas de tiempo y no emitía horarios de llegada, así que
producía planes plausibles pero falsos. Un error honesto es mejor.

Podés desarrollar UI sin levantar el perfil `routing`; lo que no vas a poder
es optimizar.

## Recortar el mapa (menos RAM, más velocidad)

`setup.sh` procesa la región entera. Para operar en un área acotada conviene
recortar antes: medido sobre una matriz de 1000×1000 en Lima,

| | Perú | Lima Metropolitana |
|---|---|---|
| Datos procesados | 2,17 GB | **0,25 GB** |
| RAM bajo carga | 1,21 GiB | **253 MB** |
| Tiempo de la matriz | 14,8 s | **8,1 s** |

Mismas rutas dentro del área; lo que se pierde es cobertura fuera del bbox
(ahí no hay ruta, no hay degradación). El recorte:

```bash
docker run --rm -v "$PWD:/data" stefda/osmium-tool   osmium extract --bbox=-77.35,-12.55,-76.60,-11.60 --set-bounds   -o lima.osm.pbf peru-latest.osm.pbf
```

`docker/osrm/Dockerfile` hace esto solo en build time (variable `BBOX`), que es
como se despliega en Railway — ver
[`docs/deployment-railway.md`](../docs/deployment-railway.md).

## Regiones Soportadas

Por defecto se usa **Perú**. Los scripts aceptan la región como argumento
(`.\setup.ps1 -Region colombia` / `./setup.sh colombia`), pero descargan
siempre del continente `south-america`:

| Región | URL Geofabrik | Sirve el argumento |
|--------|---------------|---|
| Perú | `south-america/peru-latest.osm.pbf` | sí (default) |
| Colombia | `south-america/colombia-latest.osm.pbf` | sí |
| Argentina | `south-america/argentina-latest.osm.pbf` | sí |
| México | `north-america/mexico-latest.osm.pbf` | no — hay que editar la URL del script |

## Recursos

- [VROOM API Docs](https://github.com/VROOM-Project/vroom/blob/master/docs/API.md)
- [OSRM API Docs](http://project-osrm.org/docs/v5.24.0/api/)
- [Geofabrik Downloads](https://download.geofabrik.de/)
