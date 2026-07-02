import { type NextRequest, NextResponse } from "next/server";
import { CONTRACT_VERSION } from "./version";

/** Header de handshake del contrato móvil (API-CONTRACT-MOBILE.md §10.2). */
export const CONTRACT_HEADER = "x-br-contract";

type SeamHandler<Args extends unknown[]> = (
  request: NextRequest,
  ...args: Args
) => Promise<Response> | Response;

/**
 * Envuelve un route handler del seam móvil para estampar
 * `x-br-contract: <CONTRACT_VERSION>` en TODA respuesta (éxito y error).
 * El móvil compara el valor post-login y loguea/avisa en mismatch —
 * nunca bloquea (§10.2), por eso un helper por-handler alcanza y no
 * hace falta middleware global.
 */
export function withContractHeader<Args extends unknown[]>(
  handler: SeamHandler<Args>,
): (request: NextRequest, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    const response = await handler(request, ...args);
    response.headers.set(CONTRACT_HEADER, String(CONTRACT_VERSION));
    return response;
  };
}
