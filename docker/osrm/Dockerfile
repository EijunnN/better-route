# OSRM con los datos ya cocinados dentro de la imagen (docker-compose.prod.yml).
#
# Los .osrm pesan >2 GB para Perú entero y están gitignoreados, así que no
# viajan en el repo: se generan acá en build time desde Geofabrik. El build
# tarda minutos, pero es reproducible y el runtime arranca en segundos.
#
# BBOX recorta el mapa antes de procesarlo. Medido contra Perú completo, Lima
# Metropolitana (-77.35,-12.55,-76.60,-11.60) son 0,25 GB en vez de 2,17 GB y
# 253 MB de RAM en vez de 1,21 GiB bajo una matriz de 1000×1000.
#
#   BBOX=""  → sin recorte, procesa la región entera. Es el default del VPS
#              compartido: una empresa fuera de Lima no puede quedarse sin
#              rutas por una optimización de RAM.
#
# Un pedido FUERA del bbox no obtiene ruta: no degrada, falla.
#
# Versión fija en build y runtime: el formato de los .osrm cambia entre
# versiones y un runtime distinto al que los generó no los carga.

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
ARG BBOX=""
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
# MLD (no CH): es el algoritmo que espera `osrm-routed --algorithm mld`, y el
# único que soporta customize incremental.
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1 AS build
WORKDIR /data
COPY --from=clip /data/map.osm.pbf .
RUN osrm-extract -p /opt/car.lua map.osm.pbf \
 && osrm-partition map.osrm \
 && osrm-customize map.osrm \
 && rm -f map.osm.pbf \
 && du -sh /data

# ── runtime ───────────────────────────────────────────────────────────────
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1 AS runtime
WORKDIR /data
COPY --from=build /data/ /data/

EXPOSE 5000

# --max-table-size debe ser >= `maxlocations` de docker/vroom/config.yml
# (5000): si OSRM rechaza la tabla, VROOM devuelve code 3 y la corrida entera
# falla, no degrada.
CMD ["osrm-routed", "--algorithm", "mld", "--max-table-size", "5000", "/data/map.osrm"]
