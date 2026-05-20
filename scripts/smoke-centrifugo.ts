/**
 * End-to-end smoke test for the Centrifugo realtime layer (ADR-0007).
 *
 *   bun run scripts/smoke-centrifugo.ts
 *
 * Requires Centrifugo running (`docker compose up -d centrifugo`) and the
 * CENTRIFUGO_* vars set in .env. Verifies the full issue-007 surface:
 * token signing, WebSocket connect, server-side subscriptions, and a
 * round-trip publish via the HTTP API.
 */

import { centrifugoPublish, issueCentrifugoToken } from "@/lib/realtime";

const WS_URL = "ws://localhost:8000/connection/websocket";
const COMPANY = "smoke-co";

async function main() {
  const token = await issueCentrifugoToken({
    userId: "smoke-user",
    role: "PLANIFICADOR",
    companyId: COMPANY,
  });
  console.log("✓ token signed");

  const ws = new WebSocket(WS_URL);

  const outcome = await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => resolve("✗ TIMEOUT — no push received"), 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, connect: { token } }));
    };

    ws.onmessage = (ev) => {
      const raw = String(ev.data);
      if (raw === "{}") {
        ws.send("{}"); // Centrifugo ping → pong
        return;
      }
      const msg = JSON.parse(raw);

      if (msg.id === 1 && msg.error) {
        clearTimeout(timeout);
        resolve(`✗ CONNECT REJECTED: ${JSON.stringify(msg.error)}`);
        return;
      }

      if (msg.id === 1 && msg.connect) {
        const subs = Object.keys(msg.connect.subs ?? {});
        console.log(`✓ connected — client ${msg.connect.client}`);
        console.log(`✓ server-side subscriptions: ${subs.join(", ")}`);
        // Publish to a channel the connection token subscribed us to.
        centrifugoPublish(`monitoring:${COMPANY}`, {
          kind: "smoke",
          at: new Date().toISOString(),
        });
        return;
      }

      if (msg.push) {
        clearTimeout(timeout);
        console.log(
          `✓ push received on ${msg.push.channel}:`,
          JSON.stringify(msg.push.pub.data),
        );
        resolve("✓ OK — full round-trip works");
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve("✗ WS ERROR — is Centrifugo running on :8000?");
    };
  });

  ws.close();
  console.log(outcome);
  process.exit(outcome.startsWith("✓") ? 0 : 1);
}

main();
