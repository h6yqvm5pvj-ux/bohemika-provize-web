import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { getAdvisorSetupError } from "@/lib/server/advisorSetupGuard";
import { resolveServerImpersonation } from "@/lib/server/impersonation";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { evaluateSubscriptionFromProfile } from "@/lib/subscriptionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_HISTORY_ROWS = 50;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

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

  const actorEmail = normalizeEmail(decoded.email);
  const actorUid = String(decoded.uid ?? "").trim();
  if (!actorEmail || !EMAIL_RE.test(actorEmail) || !actorUid) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }

  const lockout = await getLoginAttemptLockoutError(req, actorEmail);
  if (lockout) return lockout;

  let email = actorEmail;
  let uid = actorUid;
  let rawTokenEmail = typeof decoded.email === "string" ? decoded.email.trim() : "";
  const impersonationResult = await resolveServerImpersonation({
    req,
    actorEmail,
    actorUid,
    decoded: decoded as Record<string, unknown>,
  });
  if (!impersonationResult.ok) {
    return {
      error: impersonationResult.error,
      status: impersonationResult.status,
    } as const;
  }
  if (impersonationResult.impersonation) {
    email = impersonationResult.impersonation.targetEmail;
    uid = impersonationResult.impersonation.targetUid;
    rawTokenEmail = impersonationResult.impersonation.targetEmail;
  }

  const setupError = await getAdvisorSetupError({
    email,
    uid,
  });
  if (setupError) return setupError;

  return {
    email,
    uid,
    rawTokenEmail,
  } as const;
}

async function loadProfiles({
  email,
  rawTokenEmail,
  uid,
}: {
  email: string;
  rawTokenEmail: string;
  uid: string;
}) {
  if (!adminDb) return null;

  const privateCandidates = Array.from(
    new Set([email, rawTokenEmail, rawTokenEmail.toLowerCase()].map((value) => value.trim()).filter(Boolean))
  );

  let privateDocId = email;
  let privateData: Record<string, unknown> = {};
  for (const docId of privateCandidates) {
    const snap = await adminDb.collection("usersPrivate").doc(docId).get();
    if (!snap.exists) continue;
    privateDocId = docId;
    privateData = {
      ...privateData,
      ...((snap.data() as Record<string, unknown> | undefined) ?? {}),
    };
  }

  let publicData: Record<string, unknown> = {};
  const directSnap = await adminDb.collection("users").doc(email).get();
  if (directSnap.exists) {
    publicData = {
      ...publicData,
      ...((directSnap.data() as Record<string, unknown> | undefined) ?? {}),
    };
  }

  const [byEmailSnap, byUidSnap] = await Promise.all([
    adminDb.collection("users").where("email", "==", email).limit(3).get(),
    uid ? adminDb.collection("users").where("userId", "==", uid).limit(3).get() : null,
  ]);
  byEmailSnap.docs.forEach((docSnap) => {
    publicData = {
      ...publicData,
      ...((docSnap.data() as Record<string, unknown> | undefined) ?? {}),
    };
  });
  byUidSnap?.docs.forEach((docSnap) => {
    publicData = {
      ...publicData,
      ...((docSnap.data() as Record<string, unknown> | undefined) ?? {}),
    };
  });

  return {
    privateDocId,
    profile: {
      ...publicData,
      ...privateData,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if ("error" in ctx) {
      const response = NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
      if ("retryAfterSeconds" in ctx) {
        response.headers.set("Retry-After", String(ctx.retryAfterSeconds));
      }
      return response;
    }
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      );
    }

    const profiles = await loadProfiles(ctx);
    if (!profiles) {
      return NextResponse.json({ ok: false, error: "Profil se nepodařilo načíst." }, { status: 500 });
    }

    const evaluation = evaluateSubscriptionFromProfile(profiles.profile);

    const historySnap = await adminDb
      .collection("usersPrivate")
      .doc(profiles.privateDocId)
      .collection("subscriptionPayments")
      .orderBy("periodFrom", "desc")
      .limit(MAX_HISTORY_ROWS)
      .get()
      .catch(() => null);

    const payments = historySnap
      ? historySnap.docs.map((doc) => {
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
        })
      : [];

    const fullName =
      normalizeText(profiles.profile.fullName) ||
      normalizeText(profiles.profile.name) ||
      null;

    return NextResponse.json({
      ok: true,
      email: ctx.email,
      fullName,
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
    console.error("GET /api/subscription/me failed", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst předplatné." },
      { status: 500 }
    );
  }
}
