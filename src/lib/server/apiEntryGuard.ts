import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getRequestIp,
  type RateLimitResult,
} from "@/lib/server/rateLimit";

export type AuthedRateLimitContext = {
  token: string;
  uid: string;
  email: string;
  decoded: Awaited<ReturnType<NonNullable<typeof adminAuth>["verifyIdToken"]>>;
  rateLimit: RateLimitResult;
};

export type AdvisorAuthedRateLimitContext = AuthedRateLimitContext & {
  accountType: "advisor";
  profileDocId: string;
};

export type IpRateLimitContext = {
  key: string;
  rateLimit: RateLimitResult;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveAccountType = (data: Record<string, unknown> | null): "advisor" | "tipster" => {
  const raw =
    typeof data?.accountType === "string"
      ? data.accountType
      : typeof data?.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

async function loadUserProfileForAuth({
  email,
  uid,
}: {
  email: string;
  uid: string;
}): Promise<{ docId: string; data: Record<string, unknown> } | null> {
  if (!adminDb) return null;
  const db = adminDb;
  const usersCol = db.collection("users");
  const loadPrivateProfile = async (profileEmail: string) => {
    if (!profileEmail) return {};
    const privateSnap = await db.collection("usersPrivate").doc(profileEmail).get();
    return (privateSnap.data() ?? {}) as Record<string, unknown>;
  };

  const directSnap = email ? await usersCol.doc(email).get() : null;
  if (directSnap?.exists) {
    const data = (directSnap.data() ?? {}) as Record<string, unknown>;
    return {
      docId: directSnap.id,
      data: {
        ...data,
        ...(await loadPrivateProfile(normalizeEmail(data.email) || email)),
      },
    };
  }

  if (email) {
    const byEmailSnap = await usersCol.where("email", "==", email).limit(1).get();
    if (!byEmailSnap.empty) {
      const doc = byEmailSnap.docs[0]!;
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        docId: doc.id,
        data: {
          ...data,
          ...(await loadPrivateProfile(normalizeEmail(data.email) || email)),
        },
      };
    }
  }

  if (uid) {
    const byUidSnap = await usersCol.where("userId", "==", uid).limit(1).get();
    if (!byUidSnap.empty) {
      const doc = byUidSnap.docs[0]!;
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        docId: doc.id,
        data: {
          ...data,
          ...(await loadPrivateProfile(normalizeEmail(data.email) || email)),
        },
      };
    }
  }

  return null;
}

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

  const rateLimit = await consumeRateLimit({
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

export async function requireAdvisorAuthedRateLimited(
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
  | { ok: true; ctx: AdvisorAuthedRateLimitContext }
  | { ok: false; response: NextResponse }
> {
  const guard = await requireAuthedRateLimited(req, { namespace, limit, windowMs });
  if (!guard.ok) return guard;

  if (!adminDb) {
    return {
      ok: false,
      response: withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován (Firestore)." },
          { status: 500 }
        ),
        guard.ctx
      ),
    };
  }

  const profile = await loadUserProfileForAuth({
    email: guard.ctx.email,
    uid: guard.ctx.uid,
  });
  if (!profile) {
    return {
      ok: false,
      response: withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Uživatel nemá interní profil v systému." },
          { status: 403 }
        ),
        guard.ctx
      ),
    };
  }

  if (resolveAccountType(profile.data) === "tipster") {
    return {
      ok: false,
      response: withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Tipařské účty nemají přístup k dokumentům." },
          { status: 403 }
        ),
        guard.ctx
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      ...guard.ctx,
      accountType: "advisor",
      profileDocId: profile.docId,
    },
  };
}

export async function requireIpRateLimited(
  req: Request,
  {
    namespace,
    limit,
    windowMs,
  }: {
    namespace: string;
    limit: number;
    windowMs: number;
  }
): Promise<{ ok: true; ctx: IpRateLimitContext } | { ok: false; response: NextResponse }> {
  const key = getRequestIp(req);
  const rateLimit = await consumeRateLimit({
    namespace,
    key,
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
      key,
      rateLimit,
    },
  };
}

export function withIpRateLimitHeaders(
  response: NextResponse,
  ctx: IpRateLimitContext
): NextResponse {
  applyRateLimitHeaders(response.headers, ctx.rateLimit);
  return response;
}
