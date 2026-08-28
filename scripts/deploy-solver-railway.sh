#!/usr/bin/env bash
#
# Despliega el solver (osrm + vroom) en Railway.
#
# Railway bloquea los deploys del free tier en us-west2 entre las 8:00 y las
# 20:00 hora de Los Angeles (12:00 a 24:00 en Perú), y cambiar de región es
# función de pago. Correr este script FUERA de esa ventana: desde las 22:00
# hora Perú. El límite es solo para desplegar — una vez arriba, los servicios
# responden a cualquier hora.
#
#   bash scripts/deploy-solver-railway.sh
#
# El proyecto y los servicios ya existen y están configurados (builder
# DOCKERFILE apuntando a Dockerfile.vercel, app sleeping activado para que
# duerman sin tráfico y no quemen el crédito). Esto solo sube el código.
set -euo pipefail

PROJECT_ID="ebeb514d-d4f9-47aa-9f2c-d32f722665a7"

# shellcheck disable=SC1090
source "$HOME/.railway/env"

export RAILWAY_CALLER="skill:use-railway@1.3.7"
export RAILWAY_AGENT_SESSION="deploy-solver-$(date +%s)"

cd "$(dirname "$0")/.."

echo "==> osrm (descarga el mapa y lo recorta a Lima: tarda varios minutos)"
railway up docker/osrm --path-as-root --service osrm --project "$PROJECT_ID" \
  --detach -m "osrm con el mapa de Lima"

echo "==> vroom"
railway up docker/vroom --path-as-root --service vroom --project "$PROJECT_ID" \
  --detach -m "vroom + puente a osrm"

echo
echo "Los builds siguen en curso. Verificá el estado con:"
echo "  railway deployment list --project $PROJECT_ID --json"
echo
echo "Cuando ambos digan SUCCESS, falta:"
echo "  1. Darle dominio publico a vroom y a osrm (Settings > Networking)"
echo "  2. Setear OSRM_URL en el servicio vroom apuntando al dominio de osrm"
echo "  3. En Vercel, apuntar VROOM_URL y OSRM_URL a esos dominios y redesplegar"
