import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit, type RateLimitResult } from "@/lib/server/rateLimit";

export type AuthedRateLimitContext = {
  token: string;
  uid: string;
  email: string;
  decoded: Awaited<ReturnType<NonNullable<typeof adminAuth>["verifyIdToken"]>>;
  rateLimit: RateLimitResult;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function readBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export async function requireAuthedRateLimited(
  req: NextRequest,
  {
    namespace,
    limit,
    windowMs,
  }: {
    namespace: string;
    limit: number;
    windowMs: number;
  }
): Promise<
  | { ok: true; ctx: AuthedRateLimitContext }
  | { ok: false; response: NextResponse }
> {
  if (!adminAuth) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
    };
  }

  const token = readBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 401 }),
    };
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: `Invalid or expired token (${code}): ${message}` },
        { status: 401 }
      ),
    };
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Přihlášený účet nemá dostupný e-mail v tokenu." },
        { status: 401 }
      ),
    };
  }

  const rateLimit = consumeRateLimit({
    namespace,
    key: email,
    limit,
    windowMs,
  });
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, rateLimit);
    return {
      ok: false,
      response,
    };
  }

  return {
    ok: true,
    ctx: {
      token,
      uid: decoded.uid,
      email,
      decoded,
      rateLimit,
    },
  };
}

export function withRateLimitHeaders(response: NextResponse, ctx: AuthedRateLimitContext): NextResponse {
  applyRateLimitHeaders(response.headers, ctx.rateLimit);
  return response;
}
