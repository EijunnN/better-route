# OSRM con los datos ya cocinados dentro de la imagen.
#
# Los .osrm pesan >2 GB para Perú entero y están gitignoreados, así que no
# viajan en el repo: se generan acá en build time desde Geofabrik. El build
# tarda (minutos), pero es reproducible y el runtime arranca en segundos.
#
# BBOX recorta el mapa antes de procesarlo. El default cubre Lima
# Metropolitana (Ancón–Pucusana–Chosica), que es donde opera la flota:
# medido contra Perú completo son 0,25 GB en vez de 2,17 GB y 253 MB de RAM
# en vez de 1,21 GiB bajo una matriz de 1000×1000.
#
#   BBOX=""  → sin recorte, procesa la región entera (lo que querés en un VPS
#              con RAM de sobra y reparto fuera de Lima).
#
# Un pedido FUERA del bbox no obtiene ruta. Si sumás ciudades, ampliá el bbox
# y reconstruí — no es un cambio de arquitectura, es otro `osmium extract`.

# ── descarga ──────────────────────────────────────────────────────────────
# Stage aparte a propósito: la imagen de osmium corre Debian 9, que ya está
# EOL y cuyos repos de apt no responden, así que ahí no se puede instalar
# curl. Bajamos el .pbf con alpine y lo pasamos por COPY.
FROM alpine:3.21 AS fetch
ARG REGION=peru
ARG CONTINENT=south-america
WORKDIR /data
RUN apk add --no-cache curl ca-certificates \
 && curl -fSL --retry 3 --retry-delay 5 \
      -o region.osm.pbf \
      "https://download.geofabrik.de/${CONTINENT}/${REGION}-latest.osm.pbf" \
 && ls -la region.osm.pbf

# ── recorte ───────────────────────────────────────────────────────────────
FROM stefda/osmium-tool:latest AS clip
ARG BBOX=-77.35,-12.55,-76.60,-11.60
WORKDIR /data
COPY --from=fetch /data/region.osm.pbf .

RUN if [ -n "$BBOX" ]; then \
      echo "Recortando a bbox ${BBOX}" && \
      osmium extract --bbox="${BBOX}" --set-bounds -o map.osm.pbf region.osm.pbf && \
      rm region.osm.pbf; \
    else \
      echo "Sin recorte: se procesa la region completa" && \
      mv region.osm.pbf map.osm.pbf; \
    fi \
 && ls -la map.osm.pbf

# ── procesado ─────────────────────────────────────────────────────────────
# MLD (no CH): es el algoritmo que espera `osrm-routed --algorithm mld` en
# docker-compose.yml, y el único que soporta customize incremental.
FROM osrm/osrm-backend:latest AS build
WORKDIR /data
COPY --from=clip /data/map.osm.pbf .
RUN osrm-extract -p /opt/car.lua map.osm.pbf \
 && osrm-partition map.osrm \
 && osrm-customize map.osrm \
 && rm -f map.osm.pbf \
 && du -sh /data

# ── runtime ───────────────────────────────────────────────────────────────
FROM osrm/osrm-backend:latest AS runtime
WORKDIR /data
COPY --from=build /data/ /data/

# max-table-size debe ser >= `maxlocations` de docker/vroom/config.yml (5000):
# si OSRM rechaza la tabla, VROOM devuelve code 3 y la corrida entera falla.
ENV OSRM_MAX_TABLE_SIZE=5000 \
    PORT=5000

EXPOSE 5000

# La plataforma asigna PORT en runtime, así que no puede quedar fijo en CMD.
#
# `--ip ::` y no 0.0.0.0: la red privada de Railway es IPv6, y escuchando solo
# en IPv4 el host interno (osrm.railway.internal) resuelve a una dirección
# donde nadie atiende — VROOM recibe "upstream unreachable" pese a que el
# dominio público sí responde. En IPv6 dual-stack esto igual acepta IPv4.
CMD ["sh", "-c", "osrm-routed --algorithm mld --max-table-size ${OSRM_MAX_TABLE_SIZE} --port ${PORT} --ip :: /data/map.osrm"]
