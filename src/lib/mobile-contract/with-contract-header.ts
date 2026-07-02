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
 *
 * También captura throws no manejados del handler: sin esto, un throw
 * produce el 500 crudo de Next sin header ni el envelope `{ error }`
 * que el contrato §1 declara. El requestId correlaciona la respuesta
 * genérica con su stack en los logs del server.
 */
export function withContractHeader<Args extends unknown[]>(
  handler: SeamHandler<Args>,
): (request: NextRequest, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    let response: Response;
    try {
      response = await handler(request, ...args);
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error(
        `[mobile-seam:${requestId}] unhandled error en ${request.method} ${request.nextUrl?.pathname ?? request.url}`,
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { error },
      );
      response = NextResponse.json(
        { error: "Error interno del servidor" },
        { status: 500 },
      );
    }
    response.headers.set(CONTRACT_HEADER, String(CONTRACT_VERSION));
    return response;
  };
}
