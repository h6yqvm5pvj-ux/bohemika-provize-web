import { NextResponse, type NextRequest } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { getAdvisorSetupError } from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";
import {
  type PaymentFrequency,
  type Product,
} from "@/app/types/domain";

export const runtime = "nodejs";

const TIP_PAYOUTS_RATE_LIMIT = 180;
const TIP_PAYOUTS_RATE_LIMIT_WINDOW_MS = 60_000;
const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_MAX = 200;

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type TipPayoutListItem = {
  id: string;
  payoutDate: number | null;
  amount: number;
  note: string | null;
  productKey: Product | null;
  frequencyRaw: PaymentFrequency | null;
  tipsterPercent: number | null;
  sourceOwnerEmail: string | null;
  sourceToken: string | null;
  sourceContractSignedDate: number | null;
  adviserEmail: string | null;
};

type TipPayoutsListResponse = {
  ok: true;
  payouts: TipPayoutListItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
};

type CursorTokenPayload = {
  ts: number;
  id: string;
};

type TipPayoutsErrorResponse = {
  ok: false;
  error: string;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveUserDocId = async ({
  email,
  uid,
}: {
  email: string;
  uid: string | null | undefined;
}): Promise<string> => {
  if (!adminDb) return email;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return "";

  const usersCol = adminDb.collection("users");
  const directSnap = await usersCol.doc(normalizedEmail).get();
  if (directSnap.exists) {
    return directSnap.id;
  }

  const byEmailSnap = await usersCol
    .where("email", "==", normalizedEmail)
    .limit(5)
    .get();
  if (!byEmailSnap.empty) {
    return byEmailSnap.docs[0].id;
  }

  const normalizedUid =
    typeof uid === "string" ? uid.trim() : "";
  if (normalizedUid) {
    const byUidSnap = await usersCol.where("userId", "==", normalizedUid).limit(5).get();
    if (!byUidSnap.empty) {
      return byUidSnap.docs[0].id;
    }
  }

  return normalizedEmail;
};

const getBearerToken = (req: NextRequest): string | null => {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    const ms = parsed.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object") {
    const ts = value as FirestoreTimestamp;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (
      typeof ts.seconds === "number" &&
      Number.isFinite(ts.seconds) &&
      typeof ts.nanoseconds === "number" &&
      Number.isFinite(ts.nanoseconds)
    ) {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
    }
  }
  return null;
};

const sourceTokenFromRaw = (sourceKey: unknown): string | null => {
  if (typeof sourceKey !== "string") return null;
  const normalized = sourceKey.trim();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
};

const encodeCursorToken = (cursor: CursorTokenPayload): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursorToken = (token: string | null): CursorTokenPayload | null => {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  try {
    const raw = Buffer.from(trimmed, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as CursorTokenPayload;
    if (
      typeof parsed.ts !== "number" ||
      !Number.isFinite(parsed.ts) ||
      typeof parsed.id !== "string" ||
      !parsed.id.trim()
    ) {
      return null;
    }
    return {
      ts: parsed.ts,
      id: parsed.id.trim(),
    };
  } catch {
    return null;
  }
};

export async function GET(req: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        {
          ok: false,
          error: "Server není správně nakonfigurován.",
        } satisfies TipPayoutsErrorResponse,
        { status: 500 }
      );
    }
    const db = adminDb;

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing bearer token" } satisfies TipPayoutsErrorResponse,
        { status: 401 }
      );
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch (err: any) {
      const code = err?.code || "auth/invalid-token";
      const message = err?.message || "Invalid or expired token";
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid or expired token (${code}): ${message}`,
        } satisfies TipPayoutsErrorResponse,
        { status: 401 }
      );
    }

    const email = normalizeEmail(decoded.email);
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "User e-mail missing in token" } satisfies TipPayoutsErrorResponse,
        { status: 401 }
      );
    }
    const lockout = getLoginAttemptLockoutError(req, email);
    if (lockout) {
      const response = NextResponse.json(
        { ok: false, error: lockout.error } satisfies TipPayoutsErrorResponse,
        { status: lockout.status }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }
    const setupError = await getAdvisorSetupError({ email, uid: decoded.uid });
    if (setupError) {
      return NextResponse.json(
        {
          ok: false,
          error: setupError.error,
        } satisfies TipPayoutsErrorResponse,
        { status: setupError.status }
      );
    }
    const userDocId = await resolveUserDocId({
      email,
      uid: decoded.uid,
    });
    if (!userDocId) {
      return NextResponse.json(
        { ok: false, error: "Nepodařilo se určit profil uživatele." } satisfies TipPayoutsErrorResponse,
        { status: 401 }
      );
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:tip-payouts:list",
      key: email,
      limit: TIP_PAYOUTS_RATE_LIMIT,
      windowMs: TIP_PAYOUTS_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const search = req.nextUrl.searchParams;
    const rawLimit = Number(search.get("limit"));
    const pageSize =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.max(1, Math.floor(rawLimit)), PAGE_SIZE_MAX)
        : PAGE_SIZE_DEFAULT;
    const rawPayoutFrom = Number(search.get("payoutFrom"));
    const payoutFromDate =
      Number.isFinite(rawPayoutFrom) && rawPayoutFrom > 0
        ? new Date(rawPayoutFrom)
        : null;
    const cursor = decodeCursorToken(search.get("cursor"));

    const buildQuery = (ownerDocId: string, usePayoutFrom: boolean) => {
      let query = db
        .collection("users")
        .doc(ownerDocId)
        .collection("tipPayouts")
        .orderBy("payoutDate", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (usePayoutFrom && payoutFromDate) {
        query = query.where("payoutDate", ">=", payoutFromDate);
      }

      if (cursor) {
        query = query.startAfter(new Date(cursor.ts), cursor.id);
      }
      return query.limit(pageSize + 1);
    };

    const readSnapshot = async (ownerDocId: string, usePayoutFrom: boolean) => {
      let snap = await buildQuery(ownerDocId, usePayoutFrom).get();
      if (!cursor && snap.empty && ownerDocId !== email) {
        snap = await buildQuery(email, usePayoutFrom).get();
      }
      return snap;
    };

    let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    try {
      snap = await readSnapshot(userDocId, true);
    } catch (err) {
      if (!payoutFromDate) {
        throw err;
      }
      snap = await readSnapshot(userDocId, false);
    }
    const docs = snap.docs.slice(0, pageSize);
    const hasMore = snap.docs.length > pageSize;

    const payouts: TipPayoutListItem[] = docs.map((docSnap) => {
      const raw = (docSnap.data() ?? {}) as Record<string, unknown>;
      return {
        id: docSnap.id,
        payoutDate: toMillis(raw.payoutDate),
        amount:
          typeof raw.amount === "number" && Number.isFinite(raw.amount)
            ? raw.amount
            : 0,
        note: typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null,
        productKey:
          typeof raw.productKey === "string" && raw.productKey.trim()
            ? (raw.productKey as Product)
            : null,
        frequencyRaw:
          typeof raw.frequencyRaw === "string" && raw.frequencyRaw.trim()
            ? (raw.frequencyRaw as PaymentFrequency)
            : null,
        tipsterPercent:
          typeof raw.tipsterPercent === "number" && Number.isFinite(raw.tipsterPercent)
            ? raw.tipsterPercent
            : null,
        sourceOwnerEmail: normalizeEmail(raw.sourceOwnerEmail) || null,
        sourceToken: sourceTokenFromRaw(raw.sourceKey),
        sourceContractSignedDate: toMillis(raw.sourceContractSignedDate),
        adviserEmail: normalizeEmail(raw.adviserEmail) || null,
      };
    });

    const lastDoc = docs[docs.length - 1] ?? null;
    const lastRaw = (lastDoc?.data() ?? {}) as Record<string, unknown>;
    const lastTs = toMillis(lastRaw.payoutDate);
    const nextCursorToken =
      hasMore && lastDoc && lastTs != null
        ? encodeCursorToken({ ts: lastTs, id: lastDoc.id })
        : null;

    const response = NextResponse.json({
      ok: true,
      payouts,
      hasMore,
      nextCursor: hasMore ? lastTs : null,
      nextCursorToken,
    } satisfies TipPayoutsListResponse);
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (err) {
    console.error("GET /api/tip-payouts/list failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Nepodařilo se načíst TIP výplaty.",
      } satisfies TipPayoutsErrorResponse,
      { status: 500 }
    );
  }
}
