import { NextResponse, type NextRequest } from "next/server";

import {
  createAuthenticationOptions,
  PasskeyError,
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
      namespace: "api:passkeys:authentication-options",
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

    const options = await createAuthenticationOptions(req);
    const response = NextResponse.json({ ok: true, options });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey authentication options error", error);
    return jsonError(error, "Nepodařilo se připravit passkey přihlášení.");
  }
}
