# VROOM con la config resuelta en runtime.
#
# `docker/vroom/config.yml` apunta a `host: osrm-backend`, que es el nombre de
# servicio de docker-compose. En Railway el host es otro
# (`osrm.railway.internal`) y el puerto lo asigna la plataforma, así que la
# config no puede quedar fija en la imagen: se genera al arrancar.
#
# La imagen base ya trae un entrypoint que copia /conf/config.yml adentro de
# /vroom-express; lo dejamos hacer su trabajo y solo escribimos ese archivo
# antes.
FROM ghcr.io/vroom-project/vroom-docker:v1.14.0

USER root

# maxlocations debe ser <= --max-table-size de OSRM (5000): si OSRM rechaza la
# tabla, VROOM devuelve code 3 y la corrida entera falla, no degrada.
ENV OSRM_HOST=osrm.railway.internal \
    OSRM_PORT=5000 \
    PORT=3000 \
    VROOM_THREADS=4 \
    VROOM_MAXLOCATIONS=5000 \
    VROOM_MAXVEHICLES=200 \
    VROOM_TIMEOUT_MS=300000 \
    VROOM_ROUTER=osrm \
    VROOM_LOG=/conf

# Ojo con el escapado: cada `\$` deja la variable SIN expandir en build para
# que la resuelva el heredoc al arrancar. Un `$` pelado acá congelaría los
# defaults de arriba dentro de la imagen y el servicio buscaría siempre
# `osrm.railway.internal`, ignorando lo que configures en la plataforma.
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -e' \
  'mkdir -p /conf' \
  'cat > /conf/config.yml <<EOF' \
  'cliArgs:' \
  '  geometry: true' \
  '  planmode: false' \
  '  threads: ${VROOM_THREADS}' \
  '  explore: 5' \
  "  limit: '10mb'" \
  "  logdir: '/..'" \
  "  logsize: '100M'" \
  '  maxlocations: ${VROOM_MAXLOCATIONS}' \
  '  maxvehicles: ${VROOM_MAXVEHICLES}' \
  '  override: true' \
  "  path: ''" \
  '  port: ${PORT}' \
  "  router: '\${VROOM_ROUTER}'" \
  '  timeout: ${VROOM_TIMEOUT_MS}' \
  "  baseurl: '/'" \
  'routingServers:' \
  '  osrm:' \
  '    car:' \
  "      host: '\${OSRM_HOST}'" \
  "      port: '\${OSRM_PORT}'" \
  'EOF' \
  'echo "[vroom] router=${VROOM_ROUTER} osrm=${OSRM_HOST}:${OSRM_PORT} port=${PORT} threads=${VROOM_THREADS}"' \
  'exec /bin/bash /docker-entrypoint.sh' \
  > /usr/local/bin/railway-entrypoint.sh \
 && chmod +x /usr/local/bin/railway-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
