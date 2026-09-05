import { NextResponse, type NextRequest } from "next/server";

import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionCookieValue,
  getAppSessionMaxAgeSeconds,
  verifyAppSessionCookieValue,
} from "@/lib/appSession";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import {
  buildLoginAttemptLockedResponse,
  getLoginAttemptStatus,
} from "@/lib/server/loginAttemptLockout";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getRequestIp,
} from "@/lib/server/rateLimit";
import { recordAppSession, revokeAppSession } from "@/lib/server/appSessionRegistry";
import { loadUserProfileForAdvisorSetup } from "@/lib/server/advisorSetupGuard";
import { evaluateSubscriptionFromProfile } from "@/lib/subscriptionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT_RATE_LIMIT = 80;
const ENDPOINT_RATE_LIMIT_WINDOW_MS = 60_000;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function readBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function setNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function parseRememberThisDevicePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return Boolean((payload as { rememberThisDevice?: unknown }).rememberThisDevice);
}

function setAppSessionCookie(
  response: NextResponse,
  value: string,
  maxAgeSeconds: number
): NextResponse {
  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}

function clearAppSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const rememberThisDevice = parseRememberThisDevicePayload(payload);

  const endpointLimit = await consumeRateLimit({
    namespace: "api:auth:session",
    key: getRequestIp(req),
    limit: ENDPOINT_RATE_LIMIT,
    windowMs: ENDPOINT_RATE_LIMIT_WINDOW_MS,
  });

  const withCommonHeaders = (response: NextResponse) => {
    applyRateLimitHeaders(response.headers, endpointLimit);
    return setNoStoreHeaders(response);
  };

  if (!endpointLimit.allowed) {
    return withCommonHeaders(
      NextResponse.json(
        {
          ok: false,
          error: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
        },
        { status: endpointLimit.store === "unavailable" ? 503 : 429 }
      )
    );
  }

  if (!adminAuth) {
    return withCommonHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      )
    );
  }

  const token = readBearerToken(req);
  if (!token) {
    return withCommonHeaders(
      NextResponse.json(
        { ok: false, error: "Pro vytvoření session chybí bearer token." },
        { status: 401 }
      )
    );
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (error: any) {
    const code = error?.code || "auth/invalid-token";
    return withCommonHeaders(
      NextResponse.json(
        { ok: false, error: `Neplatný nebo expirovaný bearer token (${code}).` },
        { status: 401 }
      )
    );
  }

  const email = normalizeEmail(decoded.email);
  const uid = String(decoded.uid ?? "").trim();
  if (!email || !uid) {
    return withCommonHeaders(
      NextResponse.json(
        { ok: false, error: "Přihlášený účet nemá dostupný e-mail nebo UID." },
        { status: 401 }
      )
    );
  }

  const lockout = await getLoginAttemptStatus(req, email);
  if (lockout.locked) {
    return withCommonHeaders(buildLoginAttemptLockedResponse(lockout));
  }

  const profile = await loadUserProfileForAdvisorSetup({ email, uid });
  if (profile?.data) {
    const subscription = evaluateSubscriptionFromProfile(profile.data);
    if (subscription.state === "blocked") {
      return withCommonHeaders(
        NextResponse.json(
          {
            ok: false,
            error:
              subscription.reason === "unpaid"
                ? "Tento účet je označený jako nezaplacený."
                : "Tento účet nemá aktivní předplatné.",
          },
          { status: 403 }
        )
      );
    }
  }

  try {
    const session = await createAppSessionCookieValue({
      uid,
      email,
      maxAgeSeconds: getAppSessionMaxAgeSeconds({ rememberThisDevice }),
    });
    await recordAppSession({
      email,
      uid,
      sessionId: session.sessionId,
      expiresAtMs: session.expiresAt * 1000,
      req,
    });
    const response = NextResponse.json({
      ok: true,
      expiresAt: session.expiresAt,
      maxAgeSeconds: session.maxAgeSeconds,
    });
    setAppSessionCookie(response, session.value, session.maxAgeSeconds);
    return withCommonHeaders(response);
  } catch (error) {
    console.error("POST /api/auth/session failed", error);
    return withCommonHeaders(
      NextResponse.json(
        { ok: false, error: "Serverovou session se nepodařilo vytvořit." },
        { status: 500 }
      )
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const verification = await verifyAppSessionCookieValue(req.cookies.get(APP_SESSION_COOKIE_NAME)?.value);
    if (verification.ok) await revokeAppSession(verification.session);
    else if (verification.reason === "not-configured") throw new Error("Session verification unavailable");
    return setNoStoreHeaders(clearAppSessionCookie(NextResponse.json({ ok: true })));
  } catch {
    // Keep the cookie so the client can retry instead of reporting a false logout.
    return setNoStoreHeaders(NextResponse.json({ ok: false, error: "Odhlášení se nepodařilo dokončit. Zkus to znovu." }, { status: 503 }));
  }
}
