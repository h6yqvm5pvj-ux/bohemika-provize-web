import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";
import { type CommissionMode, type Position } from "@/app/types/domain";

export const runtime = "nodejs";

type ApiError = { ok: false; error: string };
type ApiSuccess = {
  ok: true;
  email: string;
  hasTeam: boolean;
  hasProfile: boolean;
  profile: Record<string, unknown>;
};

const PROFILE_GET_RATE_LIMIT = 180;
const PROFILE_GET_WINDOW_MS = 60_000;
const PROFILE_PATCH_RATE_LIMIT = 120;
const PROFILE_PATCH_WINDOW_MS = 60_000;
const MAX_TIMELINE_ROWS = 150;

const POSITION_VALUES: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const POSITION_SET = new Set<Position>(POSITION_VALUES);
const COMMISSION_MODE_SET = new Set<CommissionMode>(["accelerated", "standard"]);
const HOME_SECTION_SET = new Set([
  "gold",
  "summary",
  "goal",
  "leaderboard",
  "quickActions",
  "chart",
]);
const QUICK_ACTION_SET = new Set([
  "argumenty",
  "dokumenty",
  "zaznam",
  "tvorba",
  "investicni-kalkulacka",
  "statistika",
  "export-produkce",
  "plan-produkce",
  "zlato",
  "katastr",
  "data-o-vozidle",
  "projekce-vykonu",
  "pracovni-neschopenka",
  "invalidita",
]);

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_PATCH_KEYS = new Set([
  "position",
  "commissionMode",
  "monthlyGoal",
  "notifyMinutes",
  "backgroundColor",
  "boxTheme",
  "reduceMotion",
  "tipsterCollaborationMode",
  "tipsterCommissionPercent",
  "notificationSettings",
  "positionTimeline",
  "homeLayout",
  "homeWidgets",
  "homePerformanceMode",
  "homeQuickActions",
  "lastActivePing",
]);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeOptionalText = (value: unknown, maxLen: number): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > maxLen) return null;
  return trimmed;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

async function getAuthContext(req: NextRequest) {
  if (!adminAuth || !adminDb) {
    return { error: "Server není správně nakonfigurován (Firebase Admin).", status: 500 } as const;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return { error: "Missing bearer token", status: 401 } as const;
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return { error: `Invalid or expired token (${code}): ${message}`, status: 401 } as const;
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }

  return {
    email,
    uid: String(decoded.uid ?? "").trim(),
    rawTokenEmail: typeof decoded.email === "string" ? decoded.email.trim() : "",
  } as const;
}

type UserCandidate = {
  docId: string;
  data: Record<string, unknown>;
};

function pickBestCandidate(
  current: UserCandidate,
  next: UserCandidate,
  emailKey: string
): UserCandidate {
  const currentDoc = current.docId.trim().toLowerCase();
  const nextDoc = next.docId.trim().toLowerCase();
  const currentCanonical = currentDoc === emailKey ? 0 : 1;
  const nextCanonical = nextDoc === emailKey ? 0 : 1;
  if (currentCanonical !== nextCanonical) {
    return currentCanonical < nextCanonical ? current : next;
  }

  const currentHasTimeline = Array.isArray(current.data.positionTimeline) ? 0 : 1;
  const nextHasTimeline = Array.isArray(next.data.positionTimeline) ? 0 : 1;
  if (currentHasTimeline !== nextHasTimeline) {
    return currentHasTimeline < nextHasTimeline ? current : next;
  }

  return currentDoc.localeCompare(nextDoc, "cs") <= 0 ? current : next;
}

async function loadBestPublicProfile({
  email,
  rawTokenEmail,
  uid,
}: {
  email: string;
  rawTokenEmail: string;
  uid: string;
}): Promise<Record<string, unknown> | null> {
  if (!adminDb) return null;
  const usersCol = adminDb.collection("users");
  let best: UserCandidate | null = null;

  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) {
    const data = (directSnap.data() as Record<string, unknown> | undefined) ?? {};
    best = { docId: directSnap.id, data };
  }

  const emailCandidates = Array.from(
    new Set([email, rawTokenEmail, rawTokenEmail.toLowerCase()].map((it) => it.trim()).filter(Boolean))
  );
  for (const candidateEmail of emailCandidates) {
    const snap = await usersCol.where("email", "==", candidateEmail).limit(6).get();
    snap.docs.forEach((docSnap) => {
      const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
      const candidate = { docId: docSnap.id, data };
      best = best ? pickBestCandidate(best, candidate, email) : candidate;
    });
  }

  if (uid) {
    const byUidSnap = await usersCol.where("userId", "==", uid).limit(6).get();
    byUidSnap.docs.forEach((docSnap) => {
      const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
      const candidate = { docId: docSnap.id, data };
      best = best ? pickBestCandidate(best, candidate, email) : candidate;
    });
  }

  return best?.data ?? null;
}

async function loadPrivateProfile({
  email,
  rawTokenEmail,
}: {
  email: string;
  rawTokenEmail: string;
}): Promise<Record<string, unknown> | null> {
  if (!adminDb) return null;
  const privateCol = adminDb.collection("usersPrivate");
  const docIds = Array.from(
    new Set([email, rawTokenEmail, rawTokenEmail.toLowerCase()].map((it) => it.trim()).filter(Boolean))
  );

  let merged: Record<string, unknown> | null = null;
  for (const docId of docIds) {
    const snap = await privateCol.doc(docId).get();
    if (!snap.exists) continue;
    const data = (snap.data() as Record<string, unknown> | undefined) ?? {};
    merged = { ...(merged ?? {}), ...data };
  }
  return merged;
}

async function getHasTeam(email: string): Promise<boolean> {
  if (!adminDb) return false;
  const snap = await adminDb
    .collection("users")
    .where("managerEmail", "==", email)
    .limit(1)
    .get();
  return !snap.empty;
}

function sanitizeNotificationSettings(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const typesInput = isPlainObject(value.types) ? value.types : {};
  const channelsInput = isPlainObject(value.channels) ? value.channels : {};
  const next = {
    types: {
      newContract: typesInput.newContract === true,
      anniversary: typesInput.anniversary === true,
      unpaid: typesInput.unpaid === true,
      team: typesInput.team === true,
    },
    channels: {
      email: channelsInput.email === true,
      push: channelsInput.push === true,
    },
  };
  return next;
}

function sanitizeHomeWidgets(value: unknown): Record<string, boolean> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, boolean> = {};
  const keys = [
    "productionSummary",
    "monthlyGoal",
    "teamLeaderboard",
    "productionChart",
    "goldWidget",
    "quickActions",
  ];
  for (const key of keys) {
    out[key] = value[key] === true;
  }
  return out;
}

function sanitizeHomeLayout(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const key = typeof item === "string" ? item.trim() : "";
    if (!key || !HOME_SECTION_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function sanitizeHomeQuickActions(
  value: unknown
):
  | Array<{
      key: string;
      title: string;
      href: string;
      category: string;
    }>
  | null {
  if (!Array.isArray(value)) return null;
  const out: Array<{
    key: string;
    title: string;
    href: string;
    category: string;
  }> = [];
  const seen = new Set<string>();
  for (const itemRaw of value) {
    if (!isPlainObject(itemRaw)) return null;
    const key = typeof itemRaw.key === "string" ? itemRaw.key.trim() : "";
    if (!key || !QUICK_ACTION_SET.has(key) || seen.has(key)) continue;
    const title = normalizeOptionalText(itemRaw.title, 80);
    const href = normalizeOptionalText(itemRaw.href, 220);
    const category = normalizeOptionalText(itemRaw.category, 80);
    if (title == null || href == null || category == null) return null;
    if (!title || !href || !category) return null;
    seen.add(key);
    out.push({ key, title, href, category });
  }
  return out;
}

function sanitizePositionTimeline(value: unknown): Array<{
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
}> | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_TIMELINE_ROWS) return null;

  const rows: Array<{
    id: string;
    position: Position;
    validFrom: string;
    validTo: string | null;
  }> = [];

  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (!isPlainObject(raw)) return null;
    const id = normalizeOptionalText(raw.id, 120);
    const position = typeof raw.position === "string" ? raw.position.trim() : "";
    const validFrom = typeof raw.validFrom === "string" ? raw.validFrom.trim() : "";
    const validToRaw = typeof raw.validTo === "string" ? raw.validTo.trim() : "";
    const validTo = validToRaw || null;

    if (!id) return null;
    if (!POSITION_SET.has(position as Position)) return null;
    if (!isIsoDay(validFrom)) return null;
    if (validTo && !isIsoDay(validTo)) return null;
    if (validTo && validTo < validFrom) return null;

    rows.push({
      id,
      position: position as Position,
      validFrom,
      validTo,
    });
  }

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  const openEndedIndexes = rows
    .map((row, index) => (!row.validTo ? index : -1))
    .filter((index) => index >= 0);
  if (openEndedIndexes.length > 1) return null;
  if (openEndedIndexes.length === 1 && openEndedIndexes[0] !== rows.length - 1) return null;

  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const current = rows[i];
    const prevTo = prev.validTo ?? "9999-12-31";
    if (prevTo > current.validFrom) return null;
  }

  return rows;
}

function buildPatchFromBody(
  body: unknown
): { patch: Record<string, unknown>; wantsPositionEdit: boolean } | { error: string } {
  if (!isPlainObject(body)) {
    return { error: "Neplatný payload." };
  }

  const patch: Record<string, unknown> = {};
  let wantsPositionEdit = false;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_PATCH_KEYS.has(key)) {
      return { error: `Pole ${key} není povolené.` };
    }
  }

  if (body.lastActivePing != null) {
    if (body.lastActivePing !== true) {
      return { error: "lastActivePing musí být true." };
    }
    patch.lastActive = FieldValue.serverTimestamp();
  }

  if (body.position != null) {
    const value = typeof body.position === "string" ? body.position.trim() : "";
    if (!POSITION_SET.has(value as Position)) {
      return { error: "Pole position má neplatnou hodnotu." };
    }
    patch.position = value;
    wantsPositionEdit = true;
  }

  if (body.commissionMode != null) {
    const value = typeof body.commissionMode === "string" ? body.commissionMode.trim() : "";
    if (!COMMISSION_MODE_SET.has(value as CommissionMode)) {
      return { error: "Pole commissionMode má neplatnou hodnotu." };
    }
    patch.commissionMode = value;
    wantsPositionEdit = true;
  }

  if (body.monthlyGoal != null) {
    const value = Number(body.monthlyGoal);
    if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
      return { error: "Pole monthlyGoal má neplatnou hodnotu." };
    }
    patch.monthlyGoal = value;
  }

  if (body.notifyMinutes != null) {
    const value = Number(body.notifyMinutes);
    if (!Number.isFinite(value) || value < 0 || value > 525_600) {
      return { error: "Pole notifyMinutes má neplatnou hodnotu." };
    }
    patch.notifyMinutes = Math.round(value);
  }

  if (body.backgroundColor != null) {
    const value = typeof body.backgroundColor === "string" ? body.backgroundColor.trim() : "";
    if (value !== "white") {
      return { error: "Pole backgroundColor má neplatnou hodnotu." };
    }
    patch.backgroundColor = value;
  }

  if (body.boxTheme != null) {
    const value = normalizeOptionalText(body.boxTheme, 64);
    if (value == null) {
      return { error: "Pole boxTheme má neplatnou hodnotu." };
    }
    patch.boxTheme = value;
  }

  if (body.reduceMotion != null) {
    if (typeof body.reduceMotion !== "boolean") {
      return { error: "Pole reduceMotion musí být true/false." };
    }
    patch.reduceMotion = body.reduceMotion;
  }

  if (body.tipsterCollaborationMode != null) {
    if (typeof body.tipsterCollaborationMode !== "boolean") {
      return { error: "Pole tipsterCollaborationMode musí být true/false." };
    }
    patch.tipsterCollaborationMode = body.tipsterCollaborationMode;
  }

  if (body.tipsterCommissionPercent != null) {
    const value = Number(body.tipsterCommissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: "Pole tipsterCommissionPercent má neplatnou hodnotu." };
    }
    patch.tipsterCommissionPercent = Math.round(value * 100) / 100;
  }

  if (body.notificationSettings != null) {
    const value = sanitizeNotificationSettings(body.notificationSettings);
    if (!value) return { error: "Pole notificationSettings má neplatný formát." };
    patch.notificationSettings = value;
  }

  if (body.positionTimeline != null) {
    const value = sanitizePositionTimeline(body.positionTimeline);
    if (!value) return { error: "Pole positionTimeline má neplatný formát." };
    patch.positionTimeline = value;
    wantsPositionEdit = true;
  }

  if (body.homeLayout != null) {
    const value = sanitizeHomeLayout(body.homeLayout);
    if (!value) return { error: "Pole homeLayout má neplatný formát." };
    patch.homeLayout = value;
  }

  if (body.homeWidgets != null) {
    const value = sanitizeHomeWidgets(body.homeWidgets);
    if (!value) return { error: "Pole homeWidgets má neplatný formát." };
    patch.homeWidgets = value;
  }

  if (body.homePerformanceMode != null) {
    const value =
      typeof body.homePerformanceMode === "string"
        ? body.homePerformanceMode.trim()
        : "";
    if (value !== "default" && value !== "lite") {
      return { error: "Pole homePerformanceMode má neplatnou hodnotu." };
    }
    patch.homePerformanceMode = value;
  }

  if (body.homeQuickActions != null) {
    const value = sanitizeHomeQuickActions(body.homeQuickActions);
    if (!value) return { error: "Pole homeQuickActions má neplatný formát." };
    patch.homeQuickActions = value;
  }

  return { patch, wantsPositionEdit };
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx && typeof ctx.error === "string") {
    return NextResponse.json({ ok: false, error: ctx.error } satisfies ApiError, {
      status: ctx.status,
    });
  }

  const { email, uid, rawTokenEmail } = ctx;
  const rateLimit = consumeRateLimit({
    namespace: "api:user-profile:get",
    key: email,
    limit: PROFILE_GET_RATE_LIMIT,
    windowMs: PROFILE_GET_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const res = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." } satisfies ApiError,
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  const [publicData, privateData, hasTeam] = await Promise.all([
    loadBestPublicProfile({ email, rawTokenEmail, uid }),
    loadPrivateProfile({ email, rawTokenEmail }),
    getHasTeam(email),
  ]);
  const profile = {
    ...(publicData ?? {}),
    ...(privateData ?? {}),
  };
  const hasProfile = Boolean(publicData || privateData);

  const res = NextResponse.json({
    ok: true,
    email,
    hasTeam,
    hasProfile,
    profile,
  } satisfies ApiSuccess);
  applyRateLimitHeaders(res.headers, rateLimit);
  return res;
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx && typeof ctx.error === "string") {
    return NextResponse.json({ ok: false, error: ctx.error } satisfies ApiError, {
      status: ctx.status,
    });
  }
  if (!adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies ApiError,
      { status: 500 }
    );
  }

  const { email } = ctx;
  const rateLimit = consumeRateLimit({
    namespace: "api:user-profile:patch",
    key: email,
    limit: PROFILE_PATCH_RATE_LIMIT,
    windowMs: PROFILE_PATCH_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const res = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." } satisfies ApiError,
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  const body = await req.json().catch(() => null);
  const parsed = buildPatchFromBody(body);
  if ("error" in parsed) {
    return NextResponse.json(
      { ok: false, error: parsed.error } satisfies ApiError,
      { status: 400 }
    );
  }

  const { patch, wantsPositionEdit } = parsed;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Není co uložit." } satisfies ApiError,
      { status: 400 }
    );
  }

  if (wantsPositionEdit) {
    const meSnap = await adminDb.collection("users").doc(email).get();
    if (meSnap.exists) {
      const data = (meSnap.data() as Record<string, unknown> | undefined) ?? {};
      if (data.canChangePosition === false) {
        return NextResponse.json(
          {
            ok: false,
            error: "Nemáš oprávnění měnit pozici nebo timeline.",
          } satisfies ApiError,
          { status: 403 }
        );
      }
    }
  }

  await adminDb.collection("users").doc(email).set(patch, { merge: true });

  const res = NextResponse.json({ ok: true });
  applyRateLimitHeaders(res.headers, rateLimit);
  return res;
}
