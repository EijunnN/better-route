#!/usr/bin/env bash
#
# Mueve Centrifugo de Vercel a Railway.
#
# En Vercel corre como container service y los WebSockets lo mantienen
# encendido las 24 horas: no puede escalar a cero, así que consume CPU activa
# todo el día contra una cuota mensual. En Railway el mismo contenedor cuesta
# por minuto encendido, y con app sleeping duerme cuando no queda ninguna
# conexión abierta (de noche, fines de semana).
#
# CORRER DESPUÉS DE LAS 22:00 HORA PERÚ. Railway bloquea los deploys del free
# tier en us-west2 entre las 8:00 y las 20:00 de Los Ángeles; fuera de esa
# ventana el deploy entra normal. Una vez arriba, el servicio responde a
# cualquier hora — el límite es sólo para desplegar.
#
#   bash scripts/deploy-centrifugo-railway.sh
#
# Ya está hecho y este script NO lo repite: el servicio `centrifugo` existe,
# con sus secretos (rotados, distintos de los que usaba Vercel), los
# namespaces en CENTRIFUGO_CHANNEL_NAMESPACES, healthcheck en /health,
# builder apuntando a Dockerfile.vercel y app sleeping activado —
# obligatorio en el plan Free.
set -euo pipefail

PROJECT_ID="ebeb514d-d4f9-47aa-9f2c-d32f722665a7"
ENVIRONMENT="production"

# shellcheck disable=SC1090
source "$HOME/.railway/env"
export PATH="$PATH:$HOME/.railway/bin"
export RAILWAY_CALLER="skill:use-railway@1.3.7"
export RAILWAY_AGENT_SESSION="deploy-centrifugo-$(date +%s)"

cd "$(dirname "$0")/.."

echo "==> centrifugo"
railway up docker/centrifugo --path-as-root --service centrifugo \
  --project "$PROJECT_ID" --environment "$ENVIRONMENT" \
  --detach -m "centrifugo movido desde vercel"

cat <<'NEXT'

Build lanzado. Seguí el estado con:
  railway deployment list --project ebeb514d-d4f9-47aa-9f2c-d32f722665a7 --environment production --json

Cuando diga SUCCESS falta, en este orden:

  1. Generar el dominio público del servicio y anotarlo.
  2. En Vercel, apuntar la app al nuevo host:
       CENTRIFUGO_URL                 = https://<dominio>
       NEXT_PUBLIC_CENTRIFUGO_WS_URL  = wss://<dominio>/connection/websocket
       CENTRIFUGO_TOKEN_HMAC_SECRET_KEY / CENTRIFUGO_API_KEY = los secretos
       rotados que quedaron en Railway (CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY
       y CENTRIFUGO_HTTP_API_KEY). Los dos lados tienen que coincidir o el
       handshake falla con "invalid token".
  3. Sacar el servicio `centrifugo` y su rewrite /connection/* de vercel.json.
  4. Redesplegar Vercel: NEXT_PUBLIC_* se hornea en build, no alcanza con
     cambiar la variable.
  5. Recompilar el APK con el WS_URL nuevo en dart_define.json y repartirlo:
     ese valor también va horneado en el binario.

NEXT
