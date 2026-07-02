#!/usr/bin/env bash
# Sync del contrato móvil (API-CONTRACT-MOBILE.md §10.3): copia los
# fixtures golden de src/tests/contract/fixtures/ y el doc canónico
# docs/API-CONTRACT-MOBILE.md al espejo del repo móvil (aea).
#
# Modos:
#   sin flags  → sincroniza (copia canónico → espejo, borra huérfanos).
#   --check    → NO escribe; sale 1 listando el drift (para CI/hooks).
#
# El repo móvil se asume hermano en disco; override con BR_MOBILE_REPO.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOBILE_ROOT="${BR_MOBILE_REPO:-$WEB_ROOT/../test-mobile/aea}"

SRC_FIXTURES="$WEB_ROOT/src/tests/contract/fixtures"
SRC_DOC="$WEB_ROOT/docs/API-CONTRACT-MOBILE.md"
DST_FIXTURES="$MOBILE_ROOT/test/contract/fixtures"
DST_DOC="$MOBILE_ROOT/docs/API-CONTRACT-MOBILE.md"

MODE="sync"
[[ "${1:-}" == "--check" ]] && MODE="check"

if [[ ! -d "$MOBILE_ROOT" ]]; then
  echo "✗ repo móvil no encontrado: $MOBILE_ROOT (override: BR_MOBILE_REPO)" >&2
  exit 1
fi
if [[ ! -d "$SRC_FIXTURES" || ! -f "$SRC_DOC" ]]; then
  echo "✗ faltan los canónicos web ($SRC_FIXTURES / $SRC_DOC)" >&2
  exit 1
fi

drift=()

compare_file() { # $1 = canónico, $2 = espejo
  if [[ ! -f "$2" ]]; then
    drift+=("falta en espejo: $2")
  elif ! cmp -s "$1" "$2"; then
    drift+=("difiere del canónico: $2")
  fi
}

if [[ "$MODE" == "check" ]]; then
  for f in "$SRC_FIXTURES"/*.json; do
    compare_file "$f" "$DST_FIXTURES/$(basename "$f")"
  done
  if [[ -d "$DST_FIXTURES" ]]; then
    for f in "$DST_FIXTURES"/*.json; do
      [[ -e "$f" ]] || continue
      [[ -f "$SRC_FIXTURES/$(basename "$f")" ]] ||
        drift+=("extra en espejo (no existe en web): $f")
    done
  else
    drift+=("falta el directorio espejo: $DST_FIXTURES")
  fi
  compare_file "$SRC_DOC" "$DST_DOC"

  if ((${#drift[@]})); then
    {
      echo "✗ drift entre canónico web y espejo móvil:"
      printf '  %s\n' "${drift[@]}"
      echo "  Corré scripts/sync-contract-fixtures.sh (sin flags) para resincronizar."
    } >&2
    exit 1
  fi
  echo "✓ fixtures y doc del contrato en sync (CONTRACT_VERSION intacta)"
  exit 0
fi

mkdir -p "$DST_FIXTURES" "$(dirname "$DST_DOC")"
if compgen -G "$DST_FIXTURES/*.json" > /dev/null; then
  for f in "$DST_FIXTURES"/*.json; do
    [[ -f "$SRC_FIXTURES/$(basename "$f")" ]] || rm -- "$f"
  done
fi
cp -- "$SRC_FIXTURES"/*.json "$DST_FIXTURES/"
cp -- "$SRC_DOC" "$DST_DOC"

# Verificación post-copia: el espejo DEBE quedar byte-idéntico.
for f in "$SRC_FIXTURES"/*.json; do
  compare_file "$f" "$DST_FIXTURES/$(basename "$f")"
done
compare_file "$SRC_DOC" "$DST_DOC"
if ((${#drift[@]})); then
  {
    echo "✗ la copia no dejó el espejo byte-idéntico:"
    printf '  %s\n' "${drift[@]}"
  } >&2
  exit 1
fi

count=$(find "$SRC_FIXTURES" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')
echo "✓ espejo actualizado: $count fixtures → $DST_FIXTURES"
echo "✓ doc del contrato → $DST_DOC"
