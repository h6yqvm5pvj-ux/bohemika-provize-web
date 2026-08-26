import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  TOOL_HUB_TOOL_KEYS,
  isToolHubToolKey,
  type ToolHubToolKey,
  type ToolHubUsageMetric,
} from "@/app/pomucky/toolHub";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 180;
const RATE_LIMIT_WINDOW_MS = 60_000;
const PERSONAL_COLLECTION = "toolHubUsage";
const GLOBAL_COLLECTION = "toolHubUsage";

type StoredUsage = {
  opens?: unknown;
  lastOpenedAtMs?: unknown;
  favorite?: unknown;
};

const finiteNonNegative = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const timestampMs = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const requireToolUsageAuth = (req: NextRequest, method: "get" | "post") =>
  requireAuthedRateLimited(req, {
    namespace: `api:tool-usage:${method}`,
    limit: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });

export async function GET(req: NextRequest) {
  const guard = await requireToolUsageAuth(req, "get");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." },
        { status: 500 }
      ),
      ctx
    );
  }

  const [personalSnap, globalSnap] = await Promise.all([
    adminDb
      .collection("usersPrivate")
      .doc(ctx.email)
      .collection(PERSONAL_COLLECTION)
      .get(),
    adminDb.collection(GLOBAL_COLLECTION).get(),
  ]);

  const personalByKey = new Map<ToolHubToolKey, StoredUsage>();
  personalSnap.docs.forEach((doc) => {
    if (!isToolHubToolKey(doc.id)) return;
    personalByKey.set(doc.id, doc.data() as StoredUsage);
  });

  const globalByKey = new Map<ToolHubToolKey, StoredUsage>();
  globalSnap.docs.forEach((doc) => {
    if (!isToolHubToolKey(doc.id)) return;
    globalByKey.set(doc.id, doc.data() as StoredUsage);
  });

  const usage = Object.fromEntries(
    TOOL_HUB_TOOL_KEYS.map((key) => {
      const personal = personalByKey.get(key);
      const global = globalByKey.get(key);
      const metric: ToolHubUsageMetric = {
        personalOpens: finiteNonNegative(personal?.opens),
        globalOpens: finiteNonNegative(global?.opens),
        lastOpenedAtMs: timestampMs(personal?.lastOpenedAtMs),
        favorite: personal?.favorite === true,
      };
      return [key, metric];
    })
  );

  return withRateLimitHeaders(
    NextResponse.json({ ok: true, usage }),
    ctx
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireToolUsageAuth(req, "post");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." },
        { status: 500 }
      ),
      ctx
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný JSON payload." },
        { status: 400 }
      ),
      ctx
    );
  }

  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const action =
    typeof payload.action === "string" ? payload.action.trim() : "";
  const toolKey = payload.toolKey;

  if (!isToolHubToolKey(toolKey)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neznámá pomůcka." },
        { status: 400 }
      ),
      ctx
    );
  }

  const personalRef = adminDb
    .collection("usersPrivate")
    .doc(ctx.email)
    .collection(PERSONAL_COLLECTION)
    .doc(toolKey);
  const nowMs = Date.now();

  if (action === "favorite") {
    if (typeof payload.favorite !== "boolean") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Chybí hodnota oblíbené pomůcky." },
          { status: 400 }
        ),
        ctx
      );
    }

    await personalRef.set(
      {
        toolKey,
        favorite: payload.favorite,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, toolKey, favorite: payload.favorite }),
      ctx
    );
  }

  if (action !== "open") {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neznámá akce." },
        { status: 400 }
      ),
      ctx
    );
  }

  const batch = adminDb.batch();
  batch.set(
    personalRef,
    {
      toolKey,
      opens: FieldValue.increment(1),
      lastOpenedAtMs: nowMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    adminDb.collection(GLOBAL_COLLECTION).doc(toolKey),
    {
      toolKey,
      opens: FieldValue.increment(1),
      lastOpenedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();

  return withRateLimitHeaders(
    NextResponse.json({ ok: true, toolKey, openedAtMs: nowMs }),
    ctx
  );
}
