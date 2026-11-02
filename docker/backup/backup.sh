#!/bin/sh
# Un dump al arrancar y después cada BACKUP_INTERVAL_SECONDS. Formato custom
# (-Fc): comprimido y restaurable tabla por tabla con pg_restore.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

offsite_enabled() {
  [ -n "${R2_BACKUP_BUCKET:-}" ] && [ -n "${R2_BACKUP_ACCESS_KEY_ID:-}" ]
}

if offsite_enabled; then
  # rclone arma el remote "r2" desde estas variables, sin archivo de config.
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
else
  echo "[backup] AVISO: sin R2_BACKUP_*, los dumps quedan solo en este VPS"
fi

while true; do
  file="/backups/betterroute-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump -Fc -f "$file.partial" && mv "$file.partial" "$file"; then
    echo "[backup] ok $(basename "$file") $(du -h "$file" | cut -f1)"
    if offsite_enabled; then
      rclone copy "$file" "r2:${R2_BACKUP_BUCKET}/postgres/" \
        && echo "[backup] subido a r2:${R2_BACKUP_BUCKET}/postgres/" \
        || echo "[backup] ERROR subiendo a R2"
    fi
    find /backups -name 'betterroute-*.dump' -mtime +"$KEEP_DAYS" -delete
  else
    rm -f "$file.partial"
    echo "[backup] ERROR en pg_dump"
  fi
  sleep "$INTERVAL"
done
