# Centrifugo con la config de namespaces horneada en la imagen.
#
# En docker-compose el config.json se monta como volumen; Railway no monta
# archivos del repo, así que acá va COPY. Los secretos siguen viniendo por
# entorno: Centrifugo lee CENTRIFUGO_<CONFIG_PATH> de forma nativa, igual que
# en docker-compose.yml.
#
# Variables que el servicio necesita en Railway:
#   CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY  = CENTRIFUGO_TOKEN_HMAC_SECRET_KEY de la app
#   CENTRIFUGO_HTTP_API_KEY                  = CENTRIFUGO_API_KEY de la app
#   CENTRIFUGO_CLIENT_ALLOWED_ORIGINS        = origen público de la app
FROM centrifugo/centrifugo:v6

USER root
COPY config.json /centrifugo/config.json
RUN chown centrifugo:centrifugo /centrifugo/config.json
USER centrifugo

ENV PORT=8000

EXPOSE 8000

# --health.enabled expone /health, que es lo que Railway usa como healthcheck.
# El puerto no puede ir fijo: Railway lo asigna por variable. En v6 los flags
# son `--http_server.port` / `--http_server.address` (no existen `--port` ni
# `--address`: el binario aborta con "unknown flag" y el servicio no arranca).
CMD ["sh", "-c", "centrifugo --health.enabled --http_server.port ${PORT} --http_server.address 0.0.0.0"]
