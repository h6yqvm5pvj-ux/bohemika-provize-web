import { NextResponse } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import {
  buildLoginAttemptLockedResponse,
  clearLoginAttemptFailures,
  getLoginAttemptStatus,
  LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
  normalizeLoginAttemptEmail,
  recordLoginAttemptFailure,
} from "@/lib/server/loginAttemptLockout";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getRequestIp,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const ENDPOINT_RATE_LIMIT = 80;
const ENDPOINT_RATE_LIMIT_WINDOW_MS = 60_000;

type LoginAttemptAction = "check" | "failure" | "success";

function normalizeAction(value: unknown): LoginAttemptAction | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "check" || raw === "failure" || raw === "success") return raw;
  return null;
}

function readBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function verifySuccessToken(req: Request, email: string) {
  if (!adminAuth) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
    } as const;
  }

  const token = readBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Pro potvrzení úspěšného přihlášení chybí bearer token." },
        { status: 401 }
      ),
    } as const;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    const tokenEmail = normalizeLoginAttemptEmail(decoded.email);
    if (!tokenEmail || tokenEmail !== email) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Bearer token neodpovídá přihlašovanému e-mailu." },
          { status: 403 }
        ),
      } as const;
    }
  } catch (error: any) {
    const code = error?.code || "auth/invalid-token";
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: `Neplatný nebo expirovaný bearer token (${code}).` },
        { status: 401 }
      ),
    } as const;
  }

  return { ok: true } as const;
}

export async function POST(req: Request) {
  const endpointLimit = await consumeRateLimit({
    namespace: "api:auth:login-attempts",
    key: getRequestIp(req),
    limit: ENDPOINT_RATE_LIMIT,
    windowMs: ENDPOINT_RATE_LIMIT_WINDOW_MS,
  });

  const withEndpointHeaders = (response: NextResponse) => {
    applyRateLimitHeaders(response.headers, endpointLimit);
    return response;
  };

  if (!endpointLimit.allowed) {
    return withEndpointHeaders(
      NextResponse.json(
        {
          ok: false,
          locked: true,
          limit: endpointLimit.limit,
          attemptsRemaining: 0,
          retryAfterSeconds: endpointLimit.retryAfterSeconds,
          message: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
        },
        { status: 429 }
      )
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withEndpointHeaders(
      NextResponse.json({ ok: false, error: "Neplatný požadavek." }, { status: 400 })
    );
  }

  const payload = body as { action?: unknown; email?: unknown };
  const action = normalizeAction(payload?.action);
  const email = normalizeLoginAttemptEmail(payload?.email);

  if (!action || !email) {
    return withEndpointHeaders(
      NextResponse.json({ ok: false, error: "Chybí akce nebo e-mail." }, { status: 400 })
    );
  }

  if (action === "success") {
    const verification = await verifySuccessToken(req, email);
    if (!verification.ok) return withEndpointHeaders(verification.response);

    const status = getLoginAttemptStatus(req, email);
    if (status.locked) {
      return withEndpointHeaders(buildLoginAttemptLockedResponse(status));
    }

    clearLoginAttemptFailures(req, email);
    return withEndpointHeaders(
      NextResponse.json({
        ok: true,
        locked: false,
        limit: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
        attemptsRemaining: LOGIN_ATTEMPT_MAX_FAILED_ATTEMPTS,
        retryAfterSeconds: 0,
      })
    );
  }

  const currentStatus = getLoginAttemptStatus(req, email);
  if (currentStatus.locked) {
    return withEndpointHeaders(buildLoginAttemptLockedResponse(currentStatus));
  }

  if (action === "check") {
    return withEndpointHeaders(
      NextResponse.json({
        ok: true,
        locked: false,
        limit: currentStatus.limit,
        attemptsRemaining: currentStatus.attemptsRemaining,
        retryAfterSeconds: 0,
      })
    );
  }

  const nextStatus = recordLoginAttemptFailure(req, email);
  if (nextStatus.locked) {
    return withEndpointHeaders(buildLoginAttemptLockedResponse(nextStatus));
  }

  return withEndpointHeaders(
    NextResponse.json({
      ok: true,
      locked: false,
      limit: nextStatus.limit,
      attemptsRemaining: nextStatus.attemptsRemaining,
      retryAfterSeconds: 0,
    })
  );
}
