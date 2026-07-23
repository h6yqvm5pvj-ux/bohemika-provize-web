import { NextResponse, type NextRequest } from "next/server";

import {
  isCashflowSubscriptionPlan,
  isSubscriptionCashflowOwner,
  type CashflowSubscriptionPlan,
} from "@/app/cashflow/subscriptionCashflow";
import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  normalizeIsoDay,
  normalizeSubscriptionPlan,
} from "@/lib/subscriptionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE_DEFAULT = 2000;
const PAGE_SIZE_MAX = 5000;

type FirestoreTimestamp = {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

type SubscriptionCashflowPayment = {
  id: string;
  userEmail: string;
  userName: string | null;
  plan: CashflowSubscriptionPlan;
  amountCzk: number;
  periodFrom: string | null;
  periodUntil: string | null;
  createdAtMs: number | null;
  paymentDateMs: number;
  note: string | null;
};

type SubscriptionCashflowResponse =
  | {
      ok: true;
      payments: SubscriptionCashflowPayment[];
      hasMore: boolean;
    }
  | {
      ok: false;
      error: string;
    };

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const parseLimit = (value: string | null): number => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return PAGE_SIZE_DEFAULT;
  return Math.min(Math.floor(parsed), PAGE_SIZE_MAX);
};

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
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

const isoDayToNoonMs = (value: string | null): number | null => {
  if (!value) return null;
  const ms = new Date(`${value}T12:00:00.000Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const pickProfileName = (data: Record<string, unknown>): string =>
  normalizeText(data.fullName) ||
  normalizeText(data.name) ||
  normalizeText(data.displayName);

async function loadUserNameMap(emails: string[]): Promise<Map<string, string>> {
  if (!adminDb || emails.length === 0) return new Map();
  const db = adminDb;

  const pairs = await Promise.all(
    emails.map(async (email) => {
      try {
        const publicDirectSnap = await db.collection("users").doc(email).get();
        const publicDirectName = pickProfileName(
          (publicDirectSnap.data() ?? {}) as Record<string, unknown>
        );
        if (publicDirectName) return [email, publicDirectName] as const;

        const publicByEmailSnap = await db
          .collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();
        const publicByEmailName = pickProfileName(
          (publicByEmailSnap.docs[0]?.data() ?? {}) as Record<string, unknown>
        );
        if (publicByEmailName) return [email, publicByEmailName] as const;

        const privateSnap = await db.collection("usersPrivate").doc(email).get();
        const privateName = pickProfileName(
          (privateSnap.data() ?? {}) as Record<string, unknown>
        );
        if (privateName) return [email, privateName] as const;

        return [email, nameFromEmail(email)] as const;
      } catch {
        return [email, nameFromEmail(email)] as const;
      }
    })
  );

  return new Map(pairs);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAdminAuthContext(req, {
      minimumRole: "owner",
      actionLabel: "cashflow předplatného",
    });
    if ("error" in auth) {
      return adminAuthErrorResponse(auth);
    }
    if (!isSubscriptionCashflowOwner(auth.adminEmail)) {
      return NextResponse.json(
        { ok: false, error: "Nemáš oprávnění načíst cashflow předplatného." } satisfies SubscriptionCashflowResponse,
        { status: 403 }
      );
    }
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies SubscriptionCashflowResponse,
        { status: 500 }
      );
    }

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const snap = await adminDb
      .collectionGroup("subscriptionPayments")
      .limit(limit)
      .get();

    const rawRows = snap.docs.flatMap((doc) => {
      const userEmail = normalizeEmail(doc.ref.parent.parent?.id);
      if (!userEmail || !EMAIL_RE.test(userEmail)) return [];

      const data = (doc.data() as Record<string, unknown> | undefined) ?? {};
      const plan = normalizeSubscriptionPlan(data.plan);
      if (!isCashflowSubscriptionPlan(plan)) return [];

      const amountCzk = Number(data.amountCzk ?? 0);
      if (!Number.isFinite(amountCzk) || amountCzk <= 0) return [];

      const periodFrom = normalizeIsoDay(data.periodFrom);
      const periodUntil = normalizeIsoDay(data.periodUntil);
      const createdAtMs =
        toMillis(data.createdAt) ??
        toMillis(data.createdAtMs) ??
        toMillis(data.paidAt);
      const paymentDateMs =
        toMillis(data.paymentDate) ??
        createdAtMs ??
        isoDayToNoonMs(periodFrom) ??
        Date.now();
      const note = normalizeText(data.note) || null;

      return [{
        id: `${userEmail}___${doc.id}`,
        userEmail,
        userName: null,
        plan,
        amountCzk,
        periodFrom,
        periodUntil,
        createdAtMs,
        paymentDateMs,
        note,
      } satisfies SubscriptionCashflowPayment];
    });

    const userNameMap = await loadUserNameMap(
      [...new Set(rawRows.map((row) => row.userEmail))].sort()
    );
    const payments = rawRows
      .map((row) => ({
        ...row,
        userName: userNameMap.get(row.userEmail) ?? nameFromEmail(row.userEmail),
      }))
      .sort((a, b) => {
        const dateDiff = b.paymentDateMs - a.paymentDateMs;
        if (dateDiff !== 0) return dateDiff;
        return a.userName.localeCompare(b.userName, "cs");
      });

    return NextResponse.json({
      ok: true,
      payments,
      hasMore: snap.size >= limit,
    } satisfies SubscriptionCashflowResponse);
  } catch (error) {
    console.error("GET /api/subscription-payments/list failed", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst platby předplatného." } satisfies SubscriptionCashflowResponse,
      { status: 500 }
    );
  }
}
