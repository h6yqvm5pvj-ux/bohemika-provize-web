import { NextResponse, type NextRequest } from "next/server";

import {
  createRegistrationOptions,
  PasskeyError,
  requireFirebasePasskeyAuth,
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
    const auth = await requireFirebasePasskeyAuth(req, { requireRecent: true });
    const rateLimit = await consumeRateLimit({
      namespace: "api:passkeys:registration-options",
      key: `${getRequestIp(req)}:${auth.uid}`,
      limit: 10,
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

    const options = await createRegistrationOptions(req, auth);
    const response = NextResponse.json({ ok: true, options });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey registration options error", error);
    return jsonError(error, "Nepodařilo se připravit passkey registraci.");
  }
}
