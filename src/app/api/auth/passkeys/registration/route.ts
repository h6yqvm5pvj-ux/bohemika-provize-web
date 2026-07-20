import { NextResponse, type NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import {
  PasskeyError,
  requireFirebasePasskeyAuth,
  verifyRegistration,
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
      namespace: "api:passkeys:registration",
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

    const payload = (await req.json().catch(() => null)) as {
      response?: RegistrationResponseJSON;
      name?: unknown;
    } | null;
    if (!payload?.response) {
      return NextResponse.json(
        { ok: false, error: "Chybí odpověď přístupového klíče." } satisfies ApiError,
        { status: 400 }
      );
    }

    const credential = await verifyRegistration(auth, payload.response, payload.name);
    const response = NextResponse.json({ ok: true, credential });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey registration error", error);
    return jsonError(error, "Přístupový klíč se nepodařilo uložit.");
  }
}
