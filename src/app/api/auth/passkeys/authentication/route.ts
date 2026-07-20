import { NextResponse, type NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import {
  PasskeyError,
  verifyAuthentication,
} from "@/lib/server/passkeys";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getRequestIp,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";

type ApiError = { ok: false; error: string };

function jsonError(error: unknown, fallback: string) {
  const status = error instanceof PasskeyError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ ok: false, error: message } satisfies ApiError, {
    status,
  });
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await consumeRateLimit({
      namespace: "api:passkeys:authentication",
      key: getRequestIp(req),
      limit: 30,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho pokusů. Zkus to za chvíli." } satisfies ApiError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimit);
      return response;
    }

    const payload = (await req.json().catch(() => null)) as {
      response?: AuthenticationResponseJSON;
    } | null;
    if (!payload?.response) {
      return NextResponse.json(
        { ok: false, error: "Chybí odpověď přístupového klíče." } satisfies ApiError,
        { status: 400 }
      );
    }

    const result = await verifyAuthentication(payload.response);
    const response = NextResponse.json({ ok: true, ...result });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey authentication error", error);
    return jsonError(error, "Přihlášení přes přístupový klíč se nepodařilo ověřit.");
  }
}
