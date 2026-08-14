import { NextResponse, type NextRequest } from "next/server";

import {
  deleteCredential,
  listCredentials,
  PasskeyError,
  renameCredential,
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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFirebasePasskeyAuth(req);
    const rateLimit = await consumeRateLimit({
      namespace: "api:passkeys:credentials:get",
      key: `${getRequestIp(req)}:${auth.uid}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to za chvíli." } satisfies ApiError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimit);
      return response;
    }

    const credentials = await listCredentials(auth);
    const response = NextResponse.json({ ok: true, credentials });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey credentials list error", error);
    return jsonError(error, "Přístupové klíče se nepodařilo načíst.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireFirebasePasskeyAuth(req, { requireRecent: true });
    const rateLimit = await consumeRateLimit({
      namespace: "api:passkeys:credentials:delete",
      key: `${getRequestIp(req)}:${auth.uid}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to za chvíli." } satisfies ApiError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimit);
      return response;
    }

    const payload = (await req.json().catch(() => null)) as {
      credentialId?: unknown;
    } | null;
    await deleteCredential(auth, payload?.credentialId);
    const response = NextResponse.json({ ok: true });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey credential delete error", error);
    return jsonError(error, "Přístupový klíč se nepodařilo odebrat.");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireFirebasePasskeyAuth(req, { requireRecent: true });
    const rateLimit = await consumeRateLimit({
      namespace: "api:passkeys:credentials:rename",
      key: `${getRequestIp(req)}:${auth.uid}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to za chvíli." } satisfies ApiError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimit);
      return response;
    }

    const payload = (await req.json().catch(() => null)) as {
      credentialId?: unknown;
      name?: unknown;
    } | null;
    const credential = await renameCredential(auth, payload?.credentialId, payload?.name);
    const response = NextResponse.json({ ok: true, credential });
    applyRateLimitHeaders(response.headers, rateLimit);
    return response;
  } catch (error) {
    console.error("passkey credential rename error", error);
    return jsonError(error, "Přístupový klíč se nepodařilo přejmenovat.");
  }
}
