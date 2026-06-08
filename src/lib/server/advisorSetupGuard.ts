import { NextResponse } from "next/server";
import type { UserRecord } from "firebase-admin/auth";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";

const POSITION_VALUES = new Set([
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
]);

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type AccountType = "advisor" | "tipster";

export type AdvisorSetupCheck = {
  accountType: AccountType;
  profileDocId: string | null;
  profile: Record<string, unknown> | null;
  hasTotpMfa: boolean;
  missing: string[];
};

export type AdvisorSetupError = {
  error: string;
  status: 403;
  missing: string[];
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function resolveAccountType(data: Record<string, unknown> | null): AccountType {
  const raw =
    typeof data?.accountType === "string"
      ? data.accountType
      : typeof data?.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
}

function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function hasUsablePhoneNumber(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6;
}

function hasUsablePositionTimeline(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const row = raw as Record<string, unknown>;
    const position = typeof row.position === "string" ? row.position.trim() : "";
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    return POSITION_VALUES.has(position) && isIsoDay(validFrom);
  });
}

function authUserHasTotpMfa(user: UserRecord | null): boolean {
  const factors = user?.multiFactor?.enrolledFactors ?? [];
  return factors.some((factor) => factor.factorId === "totp");
}

async function loadPrivateProfile(profileEmail: string): Promise<Record<string, unknown>> {
  if (!adminDb || !profileEmail) return {};
  const privateSnap = await adminDb.collection("usersPrivate").doc(profileEmail).get();
  return (privateSnap.data() ?? {}) as Record<string, unknown>;
}

export async function loadUserProfileForAdvisorSetup({
  email,
  uid,
}: {
  email: string | null;
  uid: string;
}): Promise<{ docId: string; data: Record<string, unknown> } | null> {
  if (!adminDb) return null;
  const db = adminDb;
  const usersCol = db.collection("users");
  const emailKey = normalizeEmail(email);

  const mergePrivate = async (data: Record<string, unknown>) => ({
    ...data,
    ...(await loadPrivateProfile(normalizeEmail(data.email) || emailKey)),
  });

  const directSnap = emailKey ? await usersCol.doc(emailKey).get() : null;
  if (directSnap?.exists) {
    const data = (directSnap.data() ?? {}) as Record<string, unknown>;
    return {
      docId: directSnap.id,
      data: await mergePrivate(data),
    };
  }

  if (emailKey) {
    const byEmailSnap = await usersCol.where("email", "==", emailKey).limit(1).get();
    if (!byEmailSnap.empty) {
      const doc = byEmailSnap.docs[0]!;
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        docId: doc.id,
        data: await mergePrivate(data),
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
        data: await mergePrivate(data),
      };
    }
  }

  return null;
}

export async function checkAdvisorSetup({
  email,
  uid,
  profile,
}: {
  email: string | null;
  uid: string;
  profile?: { docId: string; data: Record<string, unknown> } | null;
}): Promise<AdvisorSetupCheck> {
  const loadedProfile =
    profile === undefined
      ? await loadUserProfileForAdvisorSetup({ email, uid })
      : profile;
  const data = loadedProfile?.data ?? null;
  const accountType = resolveAccountType(data);

  let hasTotpMfa = false;
  if (adminAuth && uid) {
    const authUser = await adminAuth.getUser(uid).catch(() => null);
    hasTotpMfa = authUserHasTotpMfa(authUser);
  }

  const missing: string[] = [];
  if (accountType === "advisor") {
    if (!data) missing.push("profile");
    if (!hasUsablePhoneNumber(data?.phoneNumber)) missing.push("phoneNumber");
    if (!hasUsablePositionTimeline(data?.positionTimeline)) {
      missing.push("positionTimeline");
    }
    if (!hasTotpMfa) missing.push("totpMfa");
  }

  return {
    accountType,
    profileDocId: loadedProfile?.docId ?? null,
    profile: data,
    hasTotpMfa,
    missing,
  };
}

export function advisorSetupError(missing: string[]): AdvisorSetupError {
  const missingSet = new Set(missing);
  const parts: string[] = [];
  if (missingSet.has("profile")) parts.push("interní profil");
  if (missingSet.has("phoneNumber")) parts.push("telefon");
  if (missingSet.has("positionTimeline")) parts.push("kariérní historii");
  if (missingSet.has("totpMfa")) parts.push("2FA");

  return {
    error:
      parts.length > 0
        ? `Nejdřív dokonči nastavení účtu: ${parts.join(", ")}.`
        : "Nejdřív dokonči nastavení účtu.",
    status: 403,
    missing,
  };
}

export async function getAdvisorSetupError({
  email,
  uid,
  profile,
}: {
  email: string | null;
  uid: string;
  profile?: { docId: string; data: Record<string, unknown> } | null;
}): Promise<AdvisorSetupError | null> {
  const setup = await checkAdvisorSetup({ email, uid, profile });
  if (setup.accountType !== "advisor") return null;
  if (setup.missing.length === 0) return null;
  return advisorSetupError(setup.missing);
}

export function buildAdvisorSetupResponse(error: AdvisorSetupError): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: error.error,
      missingSetup: error.missing,
    },
    { status: error.status }
  );
}
