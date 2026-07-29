import { NextResponse, type NextRequest } from "next/server";

import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionCookieValue,
  getAppSessionMaxAgeSeconds,
  type VerifiedAppSession,
  verifyAppSessionCookieValue,
} from "@/lib/appSession";
import {
  listActiveAppSessions,
  recordAppSession,
  revokeOtherAppSessions,
  touchAppSession,
} from "@/lib/server/appSessionRegistry";
import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSIONS_GET_RATE_LIMIT = 60;
const SESSIONS_MUTATE_RATE_LIMIT = 10;
const SESSIONS_RATE_LIMIT_WINDOW_MS = 60_000;

type ApiError = { ok: false; error: string };
type ResolvedCurrentSession =
  | {
      ok: true;
      session: VerifiedAppSession;
      cookie?: {
        value: string;
        maxAgeSeconds: number;
      };
    }
  | { ok: false; error: string };

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
  const verification = await verifyAppSessionCookieValue(
    req.cookies.get(APP_SESSION_COOKIE_NAME)?.value
  );
  if (!verification.ok) {
    if (
      verification.reason === "missing" ||
      verification.reason === "expired" ||
      verification.reason === "malformed" ||
      verification.reason === "invalid-signature"
    ) {
      return createCurrentAppSession(req, ctx);
    }

    return {
      ok: false as const,
      error: "Serverová session není správně nakonfigurována.",
    };
  }

  const session = verification.session;
  if (session.uid !== ctx.uid || session.email !== ctx.email || !session.sessionId) {
    return createCurrentAppSession(req, ctx);
  }

  return { ok: true as const, session };
}

async function createCurrentAppSession(
  req: NextRequest,
  ctx: { uid: string; email: string }
): Promise<ResolvedCurrentSession> {
  try {
    const session = await createAppSessionCookieValue({
      uid: ctx.uid,
      email: ctx.email,
      maxAgeSeconds: getAppSessionMaxAgeSeconds(),
    });
    await recordAppSession({
      email: ctx.email,
      uid: ctx.uid,
      sessionId: session.sessionId,
      expiresAtMs: session.expiresAt * 1000,
      req,
    });
    return {
      ok: true,
      session: {
        uid: ctx.uid,
        email: ctx.email,
        sessionId: session.sessionId,
        issuedAt: session.expiresAt - session.maxAgeSeconds,
        expiresAt: session.expiresAt,
      },
      cookie: {
        value: session.value,
        maxAgeSeconds: session.maxAgeSeconds,
      },
    };
  } catch (error) {
    console.error("Vytvoření aktuální aplikační session selhalo:", error);
    return {
      ok: false as const,
      error: "Serverovou session se nepodařilo obnovit.",
    };
  }
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
          status: 401,
        }),
        ctx
      )
    );
  }

  await touchAppSession({
    email: ctx.email,
    sessionId: current.session.sessionId,
  }).catch((error) => {
    console.warn("GET /api/auth/sessions: aktualizace aktuální relace selhala", error);
  });

  const sessions = await listActiveAppSessions({
    email: ctx.email,
    currentSessionId: current.session.sessionId,
  });

  const response = NextResponse.json({
    ok: true,
    sessions,
    currentSessionId: current.session.sessionId,
  });
  if (current.cookie) {
    setAppSessionCookie(response, current.cookie.value, current.cookie.maxAgeSeconds);
  }
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
          status: 401,
        }),
        ctx
      )
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== "revokeOthers") {
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
    const currentSessionId = current.session.sessionId;
    if (!currentSessionId) {
      throw new Error("Aktuální serverová session nemá ID.");
    }
    const customToken = await adminAuth.createCustomToken(ctx.uid);
    await adminAuth.revokeRefreshTokens(ctx.uid);

    await touchAppSession({
      email: ctx.email,
      sessionId: currentSessionId,
    }).catch((error) => {
      console.warn("POST /api/auth/sessions: aktualizace aktuální relace selhala", error);
    });
    const revokedSessions = await revokeOtherAppSessions({
      email: ctx.email,
      keepSessionId: currentSessionId,
      reason: "user_revoke_others",
    });

    const response = NextResponse.json({
      ok: true,
      customToken,
      revokedSessions,
      sessionId: currentSessionId,
      expiresAt: current.session.expiresAt,
      maxAgeSeconds: current.session.expiresAt - current.session.issuedAt,
    });
    if (current.cookie) {
      setAppSessionCookie(response, current.cookie.value, current.cookie.maxAgeSeconds);
    }
    return setNoStoreHeaders(withRateLimitHeaders(response, ctx));
  } catch (error) {
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
