import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { isAdminPanelEmail } from "@/lib/adminAccess";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { getAdvisorAccessError } from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import {
  addDaysIso,
  evaluateSubscriptionFromProfile,
  getTodayIsoInPrague,
  isIsoDay,
  normalizeIsoDay,
  normalizeSubscriptionPlan,
} from "@/lib/subscriptionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_HISTORY_ROWS = 80;
const DUE_SOON_DAYS = 7;

type PaidSubscriptionPlan = "monthly" | "semiannual" | "yearly";
type SubscriptionPaymentPlan = PaidSubscriptionPlan | "unlimited";

const PLAN_AMOUNT_CZK: Record<PaidSubscriptionPlan, number> = {
  monthly: 300,
  semiannual: 1590,
  yearly: 2800,
};

const PLAN_MONTHS: Record<PaidSubscriptionPlan, number> = {
  monthly: 1,
  semiannual: 6,
  yearly: 12,
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeNote = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 1200);
};

function addMonthsMinusOneDay(fromIso: string, months: number): string {
  const fromDate = new Date(`${fromIso}T00:00:00.000Z`);
  const end = new Date(
    Date.UTC(
      fromDate.getUTCFullYear(),
      fromDate.getUTCMonth() + months,
      fromDate.getUTCDate()
    )
  );
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

function resolveMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object") {
    const row = value as { toDate?: () => Date };
    if (typeof row.toDate === "function") {
      const date = row.toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date.getTime();
      }
    }
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayIndex(isoDay: string): number {
  return Math.floor(new Date(`${isoDay}T00:00:00.000Z`).getTime() / DAY_MS);
}

function diffIsoDays(fromIso: string, toIso: string): number {
  return toDayIndex(toIso) - toDayIndex(fromIso);
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
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return { error: `Invalid or expired token (${code}): ${message}`, status: 401 } as const;
  }

  const email = normalizeEmail(decoded.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }

  const lockout = getLoginAttemptLockoutError(req, email);
  if (lockout) return lockout;

  const setupError = await getAdvisorAccessError({ email, uid: decoded.uid });
  if (setupError) return setupError;

  if (!isAdminPanelEmail(email)) {
    return { error: "Nemáš oprávnění spravovat předplatné.", status: 403 } as const;
  }

  return {
    adminEmail: email,
  } as const;
}

async function loadTargetProfile(targetEmail: string) {
  if (!adminDb) return null;
  const usersPrivateRef = adminDb.collection("usersPrivate").doc(targetEmail);
  const [privateSnap, directPublicSnap, byEmailSnap] = await Promise.all([
    usersPrivateRef.get(),
    adminDb.collection("users").doc(targetEmail).get(),
    adminDb.collection("users").where("email", "==", targetEmail).limit(3).get(),
  ]);

  let privateData: Record<string, unknown> = {};
  if (privateSnap.exists) {
    privateData = (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
  }

  let publicData: Record<string, unknown> = {};
  if (directPublicSnap.exists) {
    publicData = (directPublicSnap.data() as Record<string, unknown> | undefined) ?? {};
  }
  byEmailSnap.docs.forEach((docSnap) => {
    publicData = {
      ...publicData,
      ...((docSnap.data() as Record<string, unknown> | undefined) ?? {}),
    };
  });

  const userId = normalizeText(publicData.userId) || null;
  const fullName =
    normalizeText(publicData.fullName) ||
    normalizeText(publicData.name) ||
    null;

  return {
    privateRef: usersPrivateRef,
    userId,
    fullName,
    profile: {
      ...publicData,
      ...privateData,
    },
  };
}

async function loadPayments(targetEmail: string) {
  if (!adminDb) return [];
  const snap = await adminDb
    .collection("usersPrivate")
    .doc(targetEmail)
    .collection("subscriptionPayments")
    .orderBy("periodFrom", "desc")
    .limit(MAX_HISTORY_ROWS)
    .get()
    .catch(() => null);

  if (!snap) return [];
  return snap.docs.map((doc) => {
    const data = (doc.data() as Record<string, unknown> | undefined) ?? {};
    return {
      id: doc.id,
      plan: normalizeText(data.plan),
      amountCzk: Number(data.amountCzk ?? 0) || 0,
      periodFrom: normalizeText(data.periodFrom),
      periodUntil: normalizeText(data.periodUntil),
      note: normalizeText(data.note) || null,
      createdAtMs: resolveMillis(data.createdAt),
      createdByEmail: normalizeEmail(data.createdByEmail) || null,
    };
  });
}

async function loadSubscriptionDirectoryUsers() {
  if (!adminDb) return [];

  const [usersSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("usersPrivate").get(),
  ]);

  const mergedByEmail = new Map<
    string,
    {
      email: string;
      fullName: string | null;
      managerEmail: string | null;
      position: string | null;
      profile: Record<string, unknown>;
    }
  >();

  const ensureEntry = (email: string) => {
    const existing = mergedByEmail.get(email);
    if (existing) return existing;
    const created = {
      email,
      fullName: null,
      managerEmail: null,
      position: null,
      profile: {},
    };
    mergedByEmail.set(email, created);
    return created;
  };

  usersSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email || !EMAIL_RE.test(email)) return;
    const row = ensureEntry(email);
    const fullName = normalizeText(data.fullName) || normalizeText(data.name) || null;
    row.fullName = fullName || row.fullName;
    row.managerEmail = normalizeEmail(data.managerEmail) || row.managerEmail;
    row.position = normalizeText(data.position) || row.position;
    row.profile = {
      ...row.profile,
      ...data,
    };
  });

  privateSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(docSnap.id) || normalizeEmail(data.email);
    if (!email || !EMAIL_RE.test(email)) return;
    const row = ensureEntry(email);
    row.profile = {
      ...row.profile,
      ...data,
    };
  });

  const todayIso = getTodayIsoInPrague();
  const rows = Array.from(mergedByEmail.values()).map((row) => {
    const evaluation = evaluateSubscriptionFromProfile(row.profile);
    const paidUntil = normalizeIsoDay(evaluation.paidUntil);
    const daysUntilDue = paidUntil ? diffIsoDays(todayIso, paidUntil) : null;
    const isDueSoon =
      evaluation.state === "active" &&
      evaluation.plan !== "unlimited" &&
      typeof daysUntilDue === "number" &&
      daysUntilDue >= 0 &&
      daysUntilDue <= DUE_SOON_DAYS;
    const isOverdue =
      evaluation.reason === "grace" ||
      evaluation.reason === "expired" ||
      evaluation.reason === "unpaid";

    return {
      email: row.email,
      fullName: row.fullName || null,
      managerEmail: row.managerEmail || null,
      position: row.position || null,
      subscription: {
        status: evaluation.status,
        effectiveState: evaluation.state,
        reason: evaluation.reason,
        plan: evaluation.plan,
        paidFrom: evaluation.paidFrom,
        paidUntil: evaluation.paidUntil,
        graceUntil: evaluation.graceUntil,
      },
      flags: {
        isOverdue,
        isDueSoon,
        daysUntilDue,
      },
    };
  });

  rows.sort((a, b) => {
    const aName = normalizeText(a.fullName || nameFromEmail(a.email));
    const bName = normalizeText(b.fullName || nameFromEmail(b.email));
    if (aName !== bName) return aName.localeCompare(bName, "cs");
    return a.email.localeCompare(b.email, "cs");
  });

  return rows;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) =>
      part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if ("error" in auth) {
      const response = NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
      if ("retryAfterSeconds" in auth) {
        response.headers.set("Retry-After", String(auth.retryAfterSeconds));
      }
      return response;
    }
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      );
    }

    const scope = normalizeText(req.nextUrl.searchParams.get("scope"));
    if (scope === "list") {
      const users = await loadSubscriptionDirectoryUsers();
      return NextResponse.json({
        ok: true,
        users,
      });
    }

    const targetEmail = normalizeEmail(req.nextUrl.searchParams.get("email"));
    if (!targetEmail || !EMAIL_RE.test(targetEmail)) {
      return NextResponse.json(
        { ok: false, error: "Zadej platný e-mail uživatele." },
        { status: 400 }
      );
    }

    const loaded = await loadTargetProfile(targetEmail);
    if (!loaded) {
      return NextResponse.json({ ok: false, error: "Uživatele se nepodařilo načíst." }, { status: 500 });
    }

    const evaluation = evaluateSubscriptionFromProfile(loaded.profile);
    const payments = await loadPayments(targetEmail);

    return NextResponse.json({
      ok: true,
      user: {
        email: targetEmail,
        fullName: loaded.fullName,
      },
      subscription: {
        status: evaluation.status,
        effectiveState: evaluation.state,
        reason: evaluation.reason,
        plan: evaluation.plan,
        paidFrom: evaluation.paidFrom,
        paidUntil: evaluation.paidUntil,
        graceUntil: evaluation.graceUntil,
      },
      payments,
    });
  } catch (error) {
    console.error("GET /api/admin/subscriptions failed", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst předplatné uživatele." },
      { status: 500 }
    );
  }
}

type AddPaymentPayload = {
  action: "addPayment";
  email: string;
  plan: SubscriptionPaymentPlan;
  periodFrom?: string;
  note?: string;
};

type SetUnpaidPayload = {
  action: "setUnpaid";
  email: string;
  note?: string;
};

type AdminPatchPayload = AddPaymentPayload | SetUnpaidPayload;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parsePatchPayload(body: unknown): AdminPatchPayload | { error: string } {
  if (!isPlainObject(body)) return { error: "Neplatný payload." };
  const action = normalizeText(body.action);
  const email = normalizeEmail(body.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Zadej platný e-mail uživatele." };
  }

  if (action === "setUnpaid") {
    return {
      action: "setUnpaid",
      email,
      note: normalizeNote(body.note) ?? undefined,
    };
  }

  if (action === "addPayment") {
    const plan = normalizeSubscriptionPlan(body.plan);
    if (!plan) {
      return { error: "Zadej platný tarif (monthly / semiannual / yearly / unlimited)." };
    }
    if (plan !== "monthly" && plan !== "semiannual" && plan !== "yearly" && plan !== "unlimited") {
      return { error: "Zadej platný tarif (monthly / semiannual / yearly / unlimited)." };
    }
    const periodFromRaw = normalizeText(body.periodFrom);
    if (periodFromRaw && !isIsoDay(periodFromRaw)) {
      return { error: "Pole periodFrom musí být ve formátu YYYY-MM-DD." };
    }
    return {
      action: "addPayment",
      email,
      plan,
      periodFrom: periodFromRaw || undefined,
      note: normalizeNote(body.note) ?? undefined,
    };
  }

  return { error: "Neznámá akce." };
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if ("error" in auth) {
      const response = NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
      if ("retryAfterSeconds" in auth) {
        response.headers.set("Retry-After", String(auth.retryAfterSeconds));
      }
      return response;
    }
    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = parsePatchPayload(body);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const target = await loadTargetProfile(parsed.email);
    if (!target) {
      return NextResponse.json({ ok: false, error: "Uživatele se nepodařilo načíst." }, { status: 500 });
    }

    if (parsed.action === "setUnpaid") {
      await target.privateRef.set(
        {
          subscriptionStatus: "unpaid",
          subscriptionBlockedReason: parsed.note ?? "Označeno administrátorem.",
          subscriptionUpdatedAt: FieldValue.serverTimestamp(),
          subscriptionUpdatedByEmail: auth.adminEmail,
        },
        { merge: true }
      );

      if (target.userId) {
        await adminAuth.revokeRefreshTokens(target.userId).catch((error) => {
          console.warn("revokeRefreshTokens failed", error);
        });
      }

      return NextResponse.json({ ok: true });
    }

    const todayIso = getTodayIsoInPrague();
    const periodFrom = parsed.periodFrom && isIsoDay(parsed.periodFrom) ? parsed.periodFrom : todayIso;

    if (parsed.plan === "unlimited") {
      await target.privateRef.set(
        {
          subscriptionStatus: "active",
          subscriptionPlan: "unlimited",
          subscriptionPaidFrom: periodFrom,
          subscriptionPaidUntil: FieldValue.delete(),
          subscriptionBlockedReason: FieldValue.delete(),
          subscriptionUpdatedAt: FieldValue.serverTimestamp(),
          subscriptionUpdatedByEmail: auth.adminEmail,
        },
        { merge: true }
      );

      return NextResponse.json({ ok: true });
    }

    const currentPaidUntil = normalizeIsoDay(
      target.profile.subscriptionPaidUntil ?? target.profile.subscriptionpaiduntil
    );
    let paidPeriodFrom = periodFrom;
    if (currentPaidUntil && currentPaidUntil >= paidPeriodFrom) {
      paidPeriodFrom = addDaysIso(currentPaidUntil, 1);
    }

    const periodUntil = addMonthsMinusOneDay(paidPeriodFrom, PLAN_MONTHS[parsed.plan]);
    const amountCzk = PLAN_AMOUNT_CZK[parsed.plan];

    const paymentRef = target.privateRef.collection("subscriptionPayments").doc();
    const batch = adminDb.batch();
    batch.set(
      target.privateRef,
      {
        subscriptionStatus: "active",
        subscriptionPlan: parsed.plan,
        subscriptionPaidFrom: paidPeriodFrom,
        subscriptionPaidUntil: periodUntil,
        subscriptionBlockedReason: FieldValue.delete(),
        subscriptionUpdatedAt: FieldValue.serverTimestamp(),
        subscriptionUpdatedByEmail: auth.adminEmail,
      },
      { merge: true }
    );
    batch.set(
      paymentRef,
      {
        plan: parsed.plan,
        amountCzk,
        periodFrom: paidPeriodFrom,
        periodUntil,
        note: parsed.note ?? null,
        createdAt: FieldValue.serverTimestamp(),
        createdByEmail: auth.adminEmail,
      },
      { merge: false }
    );
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/admin/subscriptions failed", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se uložit změnu předplatného." },
      { status: 500 }
    );
  }
}
