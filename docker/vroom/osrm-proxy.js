/**
 * Puente HTTP local entre VROOM y OSRM, solo para Vercel.
 *
 * VROOM configura su router con `host` y `port` sueltos y habla HTTP plano
 * (docker/vroom/config.yml). Un service binding de Vercel, en cambio, inyecta
 * una URL absoluta que puede venir en https: sin puerto explícito — VROOM la
 * interpretaría como host:443 sobre HTTP y fallaría con code 3 en cada corrida.
 *
 * Este proceso escucha en 127.0.0.1 y reenvía a OSRM_URL respetando su
 * esquema, así VROOM sigue viendo un OSRM local y plano como en
 * docker-compose. Sin OSRM_URL no se levanta: en el VPS VROOM habla directo
 * con el contenedor vecino.
 */
const http = require("node:http");
const https = require("node:https");

const rawTarget = process.env.OSRM_URL;
if (!rawTarget) {
  console.error("[osrm-proxy] OSRM_URL no definido — nada que proxear");
  process.exit(1);
}

const target = new URL(rawTarget);
const client = target.protocol === "https:" ? https : http;

/**
 * El binding resuelve a `*.services.vercel-infra.com` sobre TLS con un
 * certificado que la imagen de VROOM no puede validar: no trae bundle de CA
 * ("Ignoring extra certs from /etc/ssl/certs/ca-certificates.crt ... No such
 * file") y la cadena de Vercel es interna, así que el handshake muere con
 * "self-signed certificate in certificate chain" y VROOM ve un 502.
 *
 * Saltar la verificación queda acotado a ese dominio interno: el tráfico no
 * sale a la red pública —Vercel lo enruta service-to-service, sin pasar por
 * el pipeline público— y el permiso de acceso ya lo da el binding, no el
 * certificado. Contra cualquier otro host se valida normal.
 */
const isVercelInternal = target.hostname.endsWith(".services.vercel-infra.com");
const agent =
  target.protocol === "https:" && isVercelInternal
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;
const upstreamPort = target.port || (target.protocol === "https:" ? 443 : 80);
// El binding puede traer un path base; hay que anteponerlo a la ruta de OSRM.
const basePath = target.pathname.replace(/\/$/, "");
const listenPort = Number(process.env.OSRM_PROXY_PORT || 5000);

/**
 * Los headers hop-by-hop describen UNA conexión, no el mensaje, así que
 * reenviarlos entre dos conexiones distintas deja a las puntas negociando
 * cosas que no valen para su tramo. VROOM habla con un cliente Go que usa
 * keep-alive: al copiarle su `connection`/`transfer-encoding` al tramo de
 * salida, la respuesta llegaba sin cerrar y el solve se colgaba hasta el
 * timeout de 240 s, pese a que OSRM había contestado la matriz en 111 ms.
 * Node arma los suyos para cada tramo; acá solo hay que no estorbarlo.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function stripHopByHop(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

http
  .createServer((req, res) => {
    const upstream = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: upstreamPort,
        path: basePath + req.url,
        method: req.method,
        // El Host original es 127.0.0.1: mandarlo rompe el ruteo del destino.
        headers: { ...stripHopByHop(req.headers), host: target.host },
        agent,
      },
      (upstreamRes) => {
        res.writeHead(
          upstreamRes.statusCode || 502,
          stripHopByHop(upstreamRes.headers),
        );
        upstreamRes.pipe(res);
      },
    );

    upstream.on("error", (err) => {
      console.error(`[osrm-proxy] fallo hacia ${target.href}: ${err.message}`);
      if (!res.headersSent)
        res.writeHead(502, { "content-type": "text/plain" });
      res.end("osrm upstream unreachable");
    });

    req.pipe(upstream);
  })
  .listen(listenPort, "127.0.0.1", () => {
    console.log(`[osrm-proxy] 127.0.0.1:${listenPort} -> ${target.href}`);
  });
