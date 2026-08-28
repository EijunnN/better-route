#!/usr/bin/env bash
#
# Despliega el solver (osrm + vroom) en Railway.
#
# Railway bloquea los deploys del free tier en us-west2 entre las 8:00 y las
# 20:00 hora de Los Angeles (10:00 a 22:00 en Perú), y cambiar de región es
# función de pago. Correr este script FUERA de esa ventana: desde las 22:00
# hora Perú. El límite es solo para desplegar — una vez arriba, los servicios
# responden a cualquier hora.
#
#   bash scripts/deploy-solver-railway.sh
#
# Lo que ya está hecho y este script NO repite: proyecto y servicios creados,
# builder DOCKERFILE apuntando a Dockerfile.vercel, app sleeping activado
# (duermen sin tráfico para no quemar el crédito), dominios públicos
# generados y OSRM_URL de vroom apuntando a osrm por la red privada.
set -euo pipefail

PROJECT_ID="ebeb514d-d4f9-47aa-9f2c-d32f722665a7"
ENVIRONMENT="production"

# shellcheck disable=SC1090
source "$HOME/.railway/env"

export RAILWAY_CALLER="skill:use-railway@1.3.7"
export RAILWAY_AGENT_SESSION="deploy-solver-$(date +%s)"

cd "$(dirname "$0")/.."

# --path-as-root sube solo ese directorio como contexto de build, que es lo
# que esperan los Dockerfiles. --project exige --environment en la CLI.
echo "==> osrm (descarga el mapa y lo recorta a Lima: tarda varios minutos)"
railway up docker/osrm --path-as-root --service osrm \
  --project "$PROJECT_ID" --environment "$ENVIRONMENT" \
  --detach -m "osrm con el mapa de Lima"

echo "==> vroom"
railway up docker/vroom --path-as-root --service vroom \
  --project "$PROJECT_ID" --environment "$ENVIRONMENT" \
  --detach -m "vroom apuntando a osrm por red privada"

echo
echo "Builds lanzados. Seguí el estado con:"
echo "  railway deployment list --project $PROJECT_ID --environment $ENVIRONMENT --json"
echo
echo "Cuando ambos digan SUCCESS, avisame y hago lo que falta:"
echo "  - verificar que vroom resuelva (es lo que se cuelga en Vercel)"
echo "  - apuntar VROOM_URL y OSRM_URL de Vercel a los dominios de Railway"
echo "  - sacar osrm/vroom de vercel.json y redesplegar"
