import { NextResponse, type NextRequest } from "next/server";

import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionCookieValue,
} from "@/lib/appSession";
import {
  listAppSessions,
  recordAppSession,
  revokeAppSession,
  revokeOtherAppSessions,
  touchAppSession,
} from "@/lib/server/appSessionRegistry";
import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { verifyActiveAppSession } from "@/lib/server/activeAppSession";
import { consumeSessionReauthentication, prepareSessionReauthentication, SessionReauthenticationError } from "@/lib/server/sessionReauthentication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSIONS_GET_RATE_LIMIT = 60;
const SESSIONS_MUTATE_RATE_LIMIT = 10;
const SESSIONS_RATE_LIMIT_WINDOW_MS = 60_000;

type ApiError = { ok: false; error: string };

function setNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
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

async function verifyMatchingAppSession(req: NextRequest, ctx: { uid: string; email: string }) {
  const verification = await verifyActiveAppSession(
    req.cookies.get(APP_SESSION_COOKIE_NAME)?.value
  );
  if (!verification.ok) {
    return {
      ok: false as const,
      status: verification.reason === "unavailable" ? 503 : 401,
      error: "Přihlášení není platné nebo ho nelze ověřit. Přihlas se prosím znovu.",
    };
  }

  const session = verification.session;
  if (session.uid !== ctx.uid || session.email !== ctx.email || !session.sessionId) {
    return { ok: false as const, status: 401, error: "Relace neodpovídá přihlášenému účtu." };
  }

  return { ok: true as const, session };
}

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:auth:sessions:get",
    limit: SESSIONS_GET_RATE_LIMIT,
    windowMs: SESSIONS_RATE_LIMIT_WINDOW_MS,
    enforceAdvisorSetup: false,
  });
  if (!guard.ok) return setNoStoreHeaders(guard.response);
  const { ctx } = guard;

  if (!adminDb) {
    return setNoStoreHeaders(
      withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován (Firestore)." } satisfies ApiError,
          { status: 500 }
        ),
        ctx
      )
    );
  }

  const current = await verifyMatchingAppSession(req, ctx);
  if (!current.ok) {
    return setNoStoreHeaders(
      withRateLimitHeaders(
        NextResponse.json({ ok: false, error: current.error } satisfies ApiError, {
          status: current.status,
        }),
        ctx
      )
    );
  }

  await touchAppSession({
    email: ctx.email,
    sessionId: current.session.sessionId,
    req,
  }).catch((error) => {
    console.warn("GET /api/auth/sessions: aktualizace aktuální relace selhala", error);
  });

  const sessions = await listAppSessions({
    email: ctx.email,
    currentSessionId: current.session.sessionId,
  });

  const response = NextResponse.json({
    ok: true,
    sessions,
    currentSessionId: current.session.sessionId,
  });
  return setNoStoreHeaders(withRateLimitHeaders(response, ctx));
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:auth:sessions:post",
    limit: SESSIONS_MUTATE_RATE_LIMIT,
    windowMs: SESSIONS_RATE_LIMIT_WINDOW_MS,
    enforceAdvisorSetup: false,
  });
  if (!guard.ok) return setNoStoreHeaders(guard.response);
  const { ctx } = guard;

  if (!adminAuth || !adminDb) {
    return setNoStoreHeaders(
      withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies ApiError,
          { status: 500 }
        ),
        ctx
      )
    );
  }

  const current = await verifyMatchingAppSession(req, ctx);
  if (!current.ok) {
    return setNoStoreHeaders(
      withRateLimitHeaders(
        NextResponse.json({ ok: false, error: current.error } satisfies ApiError, {
          status: current.status,
        }),
        ctx
      )
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== "revokeOthers" && body?.action !== "prepareRevokeOthers") {
    return setNoStoreHeaders(
      withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Neplatná akce relací." } satisfies ApiError,
          { status: 400 }
        ),
        ctx
      )
    );
  }

  try {
    if (body.action === "prepareRevokeOthers") {
      const challenge = await prepareSessionReauthentication(current.session);
      return setNoStoreHeaders(withRateLimitHeaders(NextResponse.json({ ok: true, ...challenge }), ctx));
    }
    await consumeSessionReauthentication(current.session, ctx.decoded, body.challengeId);
    const currentSessionId = current.session.sessionId;
    if (!currentSessionId) {
      throw new Error("Aktuální serverová session nemá ID.");
    }
    await adminAuth.revokeRefreshTokens(ctx.uid);
    const revokedSessions = await revokeOtherAppSessions({
      email: ctx.email,
      keepSessionId: currentSessionId,
      reason: "user_revoke_others",
    });
    await revokeAppSession(current.session);
    const replacement = await createAppSessionCookieValue({
      uid: ctx.uid,
      email: ctx.email,
      maxAgeSeconds: current.session.expiresAt - Math.floor(Date.now() / 1000),
    });
    await recordAppSession({
      email: ctx.email, uid: ctx.uid, sessionId: replacement.sessionId,
      expiresAtMs: replacement.expiresAt * 1000, req,
    });
    const customToken = await adminAuth.createCustomToken(ctx.uid);

    const response = NextResponse.json({
      ok: true,
      customToken,
      revokedSessions,
      sessionId: replacement.sessionId,
    });
    setAppSessionCookie(response, replacement.value, replacement.maxAgeSeconds);
    return setNoStoreHeaders(withRateLimitHeaders(response, ctx));
  } catch (error) {
    if (error instanceof SessionReauthenticationError) {
      return setNoStoreHeaders(withRateLimitHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 403 }), ctx));
    }
    console.error("POST /api/auth/sessions revokeOthers selhalo:", error);
    return setNoStoreHeaders(
      withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Ostatní zařízení se nepodařilo odhlásit." } satisfies ApiError,
          { status: 500 }
        ),
        ctx
      )
    );
  }
}
