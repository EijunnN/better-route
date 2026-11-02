# Mismo major que el servicio postgres: pg_dump se niega a volcar un server
# más nuevo que él.
FROM postgres:17-alpine
RUN apk add --no-cache rclone
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
