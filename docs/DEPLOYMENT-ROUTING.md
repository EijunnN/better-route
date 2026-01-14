# Despliegue de OSRM + VROOM para Optimización de Rutas

Esta guía documenta la configuración y despliegue de los servicios de ruteo (OSRM) y optimización de rutas (VROOM) para el sistema de planificación.

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│     VROOM       │────▶│   OSRM Backend  │
│  (Puerto 3000)  │     │  (Puerto 5000)  │     │  (Puerto 5001)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                        │
                                ▼                        ▼
                        Optimización VRP         Matrices de distancia
                        (Vehicle Routing)        (Rutas reales por calles)
```

### Componentes

| Servicio | Puerto | Imagen Docker | Descripción |
|----------|--------|---------------|-------------|
| OSRM Backend | 5001 | `osrm/osrm-backend:latest` | Motor de ruteo que calcula distancias y tiempos reales por calles |
| VROOM | 5000 | `ghcr.io/vroom-project/vroom-docker:v1.14.0` | Optimizador de rutas VRP (Vehicle Routing Problem) |

## Configuración Local (Desarrollo)

### Requisitos Previos

- Docker Desktop instalado
- ~2GB de espacio en disco para mapas procesados

### Paso 1: Descargar y Procesar Mapas

```powershell
# Crear directorio para datos OSRM
mkdir docker\osrm -Force

# Descargar mapa de Perú (~250MB)
Invoke-WebRequest -Uri "https://download.geofabrik.de/south-america/peru-latest.osm.pbf" -OutFile "docker\osrm\peru-latest.osm.pbf"

# Procesar el mapa (5-15 minutos según tu PC)
docker run -t -v "${PWD}/docker/osrm:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/peru-latest.osm.pbf
docker run -t -v "${PWD}/docker/osrm:/data" osrm/osrm-backend osrm-partition /data/peru-latest.osrm
docker run -t -v "${PWD}/docker/osrm:/data" osrm/osrm-backend osrm-customize /data/peru-latest.osrm
```

### Paso 2: Iniciar Servicios

```powershell
# Levantar OSRM y VROOM
docker compose --profile routing up -d

# Verificar que estén corriendo
docker ps
```

### Paso 3: Verificar Funcionamiento

```powershell
# Test OSRM (ruta en Lima)
curl "http://localhost:5001/route/v1/driving/-77.0428,-12.0464;-77.0300,-12.0600?overview=false"

# Test VROOM (optimización simple)
curl -X POST http://localhost:5000 -H "Content-Type: application/json" -d '{"vehicles":[{"id":1,"start":[-77.0428,-12.0464],"end":[-77.0428,-12.0464],"capacity":[100]}],"jobs":[{"id":1,"location":[-77.03,-12.06],"delivery":[10]}]}'
```

## Despliegue en Producción (VPS con Coolify)

### Opción 1: Docker Compose en Coolify

1. **Crear servicio Docker Compose** en Coolify
2. **Configurar el docker-compose.yml:**

```yaml
services:
  osrm-backend:
    image: osrm/osrm-backend:latest
    container_name: osrm-backend
    restart: unless-stopped
    ports:
      - "5001:5000"
    volumes:
      - ./docker/osrm:/data
    command: osrm-routed --algorithm mld /data/peru-latest.osrm

  vroom:
    image: ghcr.io/vroom-project/vroom-docker:v1.14.0
    container_name: vroom
    restart: unless-stopped
    ports:
      - "5000:3000"
    volumes:
      - ./docker/vroom/config.yml:/conf/config.yml:ro
    depends_on:
      - osrm-backend
```

3. **Configuración de VROOM** (`docker/vroom/config.yml`):

```yaml
cliArgs:
  geometry: true
  planmode: false
  threads: 4
  explore: 5
  limit: '10mb'
  logdir: '/..'
  logsize: '100M'
  maxlocations: 5000
  maxvehicles: 200
  override: true
  path: ''
  port: 3000
  router: 'osrm'
  timeout: 300000
  baseurl: '/'
routingServers:
  osrm:
    car:
      host: 'osrm-backend'
      port: '5000'
```

### Opción 2: Servicios Separados en Coolify

Si prefieres manejar cada servicio por separado:

#### OSRM Backend

1. Crear servicio Docker
2. Imagen: `osrm/osrm-backend:latest`
3. Puerto: `5001:5000`
4. Comando: `osrm-routed --algorithm mld /data/peru-latest.osrm`
5. Volumen: `./osrm-data:/data`

#### VROOM

1. Crear servicio Docker
2. Imagen: `ghcr.io/vroom-project/vroom-docker:v1.14.0`
3. Puerto: `5000:3000`
4. Volumen: `./vroom-config:/conf`
5. Dependencia: OSRM Backend

### Preparar Mapas en el Servidor

```bash
# Conectar al servidor
ssh user@tu-servidor

# Crear directorio
mkdir -p /opt/planeamiento/docker/osrm
cd /opt/planeamiento/docker/osrm

# Descargar mapa
wget https://download.geofabrik.de/south-america/peru-latest.osm.pbf

# Procesar (requiere ~4GB RAM)
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/peru-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/peru-latest.osrm
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-customize /data/peru-latest.osrm
```

### Variables de Entorno

Configura estas variables en tu aplicación Next.js:

```env
# Routing Services
VROOM_URL=http://localhost:5000      # En producción: http://vroom:3000 o URL del servicio
OSRM_URL=http://localhost:5001       # En producción: http://osrm-backend:5000 o URL del servicio
VROOM_TIMEOUT=60000                  # Timeout para optimización (ms)
OSRM_TIMEOUT=30000                   # Timeout para ruteo (ms)
```

**Para Coolify con red interna:**
```env
VROOM_URL=http://vroom:3000
OSRM_URL=http://osrm-backend:5000
```

## Flujo de Optimización

```
1. Usuario crea configuración de optimización
   └─ Selecciona: depot, vehículos, conductores

2. App llama a VROOM (POST /api/optimization/jobs)
   └─ VROOM construye problema VRP
   └─ VROOM consulta OSRM para matriz de distancias

3. OSRM calcula distancias/tiempos reales
   └─ Usa datos de calles de OpenStreetMap
   └─ Retorna matriz N×N

4. VROOM resuelve VRP
   └─ Algoritmo meta-heurístico
   └─ Considera: capacidad, ventanas de tiempo, skills

5. Resultado incluye:
   └─ Rutas optimizadas por vehículo
   └─ Geometría (polyline) de cada ruta
   └─ Distancias y tiempos reales

6. Frontend muestra rutas en mapa
   └─ Decodifica polyline
   └─ Dibuja rutas siguiendo calles reales
```

## Solución de Problemas

### OSRM no inicia / Restarting

```bash
# Ver logs
docker logs osrm-backend

# Causa común: faltan archivos procesados
# Solución: re-procesar el mapa
docker run -t -v ./docker/osrm:/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/peru-latest.osm.pbf
docker run -t -v ./docker/osrm:/data osrm/osrm-backend osrm-partition /data/peru-latest.osrm
docker run -t -v ./docker/osrm:/data osrm/osrm-backend osrm-customize /data/peru-latest.osrm
```

### VROOM no conecta a OSRM

```bash
# Verificar que OSRM esté corriendo
curl http://localhost:5001/route/v1/driving/-77.0428,-12.0464;-77.03,-12.06

# Verificar config.yml tiene el host correcto
# host: 'osrm-backend' (nombre del contenedor en docker-compose)
```

### Rutas se muestran como líneas rectas

1. Verificar que VROOM devuelve geometría (`options.g: true`)
2. Verificar que el resultado incluye el campo `geometry`
3. El mapa decodifica y usa la geometría automáticamente

### Fallback a Haversine

Si OSRM/VROOM no están disponibles, el sistema usa automáticamente:
- **Haversine**: Para cálculo de distancias (línea recta)
- **Nearest-Neighbor**: Para optimización de rutas (algoritmo greedy)

## Recursos

- [OSRM Documentation](http://project-osrm.org/docs/v5.24.0/api/)
- [VROOM API Documentation](https://github.com/VROOM-Project/vroom/blob/master/docs/API.md)
- [Geofabrik Downloads](https://download.geofabrik.de/) - Mapas por región
- [Polyline Algorithm](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)

## Mapas Disponibles

Para otros países/regiones, descarga de Geofabrik:

| Región | URL | Tamaño aprox. |
|--------|-----|---------------|
| Perú | https://download.geofabrik.de/south-america/peru-latest.osm.pbf | ~250MB |
| Colombia | https://download.geofabrik.de/south-america/colombia-latest.osm.pbf | ~300MB |
| Chile | https://download.geofabrik.de/south-america/chile-latest.osm.pbf | ~200MB |
| Argentina | https://download.geofabrik.de/south-america/argentina-latest.osm.pbf | ~400MB |
| México | https://download.geofabrik.de/north-america/mexico-latest.osm.pbf | ~500MB |
