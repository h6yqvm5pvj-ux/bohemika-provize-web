import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { type CommissionMode, type Position } from "@/app/types/domain";
import { getAdvisorAccessError } from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";

export const runtime = "nodejs";

const POSITION_ORDER: Position[] = [
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

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CHAIN_DEPTH = 9;

type RequestBody = {
  signedDateIso?: string | null;
};

type PositionTimelineEntry = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};

type ManagerChainSnapshotEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

type UserProfile = {
  docId: string;
  email: string;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  positionTimeline: unknown;
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizePosition(value: unknown): Position | null {
  if (typeof value !== "string") return null;
  return POSITION_ORDER.includes(value as Position) ? (value as Position) : null;
}

function normalizeMode(value: unknown): CommissionMode | null {
  return value === "accelerated" || value === "standard" ? value : null;
}

function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function parsePositionTimeline(raw: unknown): PositionTimelineEntry[] {
  if (!Array.isArray(raw)) return [];

  const rows: PositionTimelineEntry[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const position = normalizePosition(row.position);
    if (!position) return;

    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || null;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
}

function resolvePositionTimelineMatch(
  signedDate: string,
  timeline: PositionTimelineEntry[]
): PositionTimelineEntry | null {
  if (!isIsoDay(signedDate) || timeline.length === 0) return null;

  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDate) return false;
    if (row.validTo && signedDate >= row.validTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });

  return candidates[0] ?? null;
}

function resolvePositionForSignedDate(
  userData: { positionTimeline?: unknown; position?: unknown },
  signedDateIso: string | null
): Position | null {
  const timeline = parsePositionTimeline(userData.positionTimeline);
  const timelineMatch =
    signedDateIso && isIsoDay(signedDateIso)
      ? resolvePositionTimelineMatch(signedDateIso, timeline)
      : null;

  return timelineMatch?.position ?? normalizePosition(userData.position) ?? null;
}

function profileFromRaw(
  docId: string,
  raw: Record<string, unknown> | null
): UserProfile | null {
  if (!raw) return null;
  const email = normalizeEmail(raw.email) ?? normalizeEmail(docId);
  if (!email) return null;

  return {
    docId,
    email,
    managerEmail: normalizeEmail(raw.managerEmail),
    position: normalizePosition(raw.position),
    commissionMode: normalizeMode(raw.commissionMode),
    positionTimeline: raw.positionTimeline ?? null,
  };
}

function pickBetterProfile(current: UserProfile, next: UserProfile, emailKey: string): UserProfile {
  const currentDocCanonical = current.docId.toLowerCase() === emailKey ? 0 : 1;
  const nextDocCanonical = next.docId.toLowerCase() === emailKey ? 0 : 1;
  if (currentDocCanonical !== nextDocCanonical) {
    return currentDocCanonical < nextDocCanonical ? current : next;
  }

  const currentHasPosition = current.position ? 0 : 1;
  const nextHasPosition = next.position ? 0 : 1;
  if (currentHasPosition !== nextHasPosition) {
    return currentHasPosition < nextHasPosition ? current : next;
  }

  const currentHasManager = current.managerEmail ? 0 : 1;
  const nextHasManager = next.managerEmail ? 0 : 1;
  if (currentHasManager !== nextHasManager) {
    return currentHasManager < nextHasManager ? current : next;
  }

  return current.docId.localeCompare(next.docId, "cs") <= 0 ? current : next;
}

async function loadUserProfileByEmail(email: string): Promise<UserProfile | null> {
  if (!adminDb) return null;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const usersCol = adminDb.collection("users");
  const candidates = new Map<string, UserProfile>();

  const directSnap = await usersCol.doc(normalizedEmail).get();
  if (directSnap.exists) {
    const profile = profileFromRaw(
      directSnap.id,
      (directSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (profile) candidates.set(profile.docId, profile);
  }

  const byEmailSnap = await usersCol.where("email", "==", normalizedEmail).limit(5).get();
  byEmailSnap.docs.forEach((docSnap) => {
    const profile = profileFromRaw(
      docSnap.id,
      (docSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (profile) candidates.set(profile.docId, profile);
  });

  let best: UserProfile | null = null;
  candidates.forEach((candidate) => {
    best = best ? pickBetterProfile(best, candidate, normalizedEmail) : candidate;
  });
  return best;
}

async function loadCallerProfile({
  uid,
  tokenEmail,
}: {
  uid: string;
  tokenEmail: string | null;
}): Promise<UserProfile | null> {
  if (!adminDb) return null;

  if (tokenEmail) {
    const byEmail = await loadUserProfileByEmail(tokenEmail);
    if (byEmail) return byEmail;
  }

  const usersCol = adminDb.collection("users");
  const byUidSnap = await usersCol.where("userId", "==", uid).limit(5).get();

  let best: UserProfile | null = null;
  byUidSnap.docs.forEach((docSnap) => {
    const profile = profileFromRaw(
      docSnap.id,
      (docSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (!profile) return;
    if (!best) {
      best = profile;
      return;
    }
    const emailKey = tokenEmail ?? profile.email;
    best = pickBetterProfile(best, profile, emailKey);
  });

  return best;
}

async function buildManagerChainSnapshotForSignedDate({
  directManagerEmail,
  signedDateIso,
}: {
  directManagerEmail: string | null;
  signedDateIso: string | null;
}): Promise<ManagerChainSnapshotEntry[]> {
  const startEmail = normalizeEmail(directManagerEmail);
  if (!startEmail) return [];

  const chain: ManagerChainSnapshotEntry[] = [];
  const visited = new Set<string>();
  let currentEmail: string | null = startEmail;
  let depth = 0;

  while (currentEmail && depth < MAX_CHAIN_DEPTH && !visited.has(currentEmail)) {
    visited.add(currentEmail);
    const profile = await loadUserProfileByEmail(currentEmail);
    if (!profile) break;

    chain.push({
      email: profile.email,
      position: resolvePositionForSignedDate(profile, signedDateIso),
      commissionMode: profile.commissionMode,
    });

    currentEmail = normalizeEmail(profile.managerEmail);
    depth += 1;
  }

  return chain;
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 401 });
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch (err: any) {
      const code = err?.code || "auth/invalid-token";
      const message = err?.message || "Invalid or expired token";
      return NextResponse.json(
        { ok: false, error: `Invalid or expired token (${code}): ${message}` },
        { status: 401 }
      );
    }

    const tokenEmail = normalizeEmail(decoded.email);
    const lockout = await getLoginAttemptLockoutError(req, tokenEmail);
    if (lockout) {
      const response = NextResponse.json(
        { ok: false, error: lockout.error },
        { status: lockout.status }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }
    const setupError = await getAdvisorAccessError({ email: tokenEmail, uid: decoded.uid });
    if (setupError) {
      return NextResponse.json(
        { ok: false, error: setupError.error, missingSetup: setupError.missing },
        { status: setupError.status }
      );
    }
    const body = ((await req.json().catch(() => null)) ?? {}) as RequestBody;
    const signedDateIsoRaw =
      typeof body?.signedDateIso === "string" ? body.signedDateIso.trim() : "";
    const signedDateIso = isIsoDay(signedDateIsoRaw) ? signedDateIsoRaw : null;

    const callerProfile = await loadCallerProfile({
      uid: decoded.uid,
      tokenEmail,
    });

    if (!callerProfile) {
      return NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst profil přihlášeného uživatele." },
        { status: 403 }
      );
    }

    const managerEmail = normalizeEmail(callerProfile.managerEmail);
    const managerChain = await buildManagerChainSnapshotForSignedDate({
      directManagerEmail: managerEmail,
      signedDateIso,
    });

    const managerPosition = managerChain[0]?.position ?? null;
    const managerMode = managerChain[0]?.commissionMode ?? null;

    return NextResponse.json({
      ok: true,
      ownerEmail: callerProfile.email,
      managerEmail,
      managerPosition,
      managerMode,
      managerChain,
    });
  } catch (error) {
    console.error("manager-snapshot error", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst manager snapshot." },
      { status: 500 }
    );
  }
}
