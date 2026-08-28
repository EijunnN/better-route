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
const upstreamPort = target.port || (target.protocol === "https:" ? 443 : 80);
// El binding puede traer un path base; hay que anteponerlo a la ruta de OSRM.
const basePath = target.pathname.replace(/\/$/, "");
const listenPort = Number(process.env.OSRM_PROXY_PORT || 5000);

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
        headers: { ...req.headers, host: target.host },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
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
