import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { type CommissionMode, type Position } from "@/app/types/domain";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  adminAuthErrorResponse,
  getAccountCreatorAuthContext,
} from "@/lib/server/adminAuth";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";
import { addDaysIso, getTodayIsoInPrague } from "@/lib/subscriptionAccess";

export const runtime = "nodejs";

type ApiError = { ok: false; error: string };
type ApiSuccess = {
  ok: true;
  email: string;
  uid: string;
  profilePath: string;
};

const CREATE_USER_RATE_LIMIT = 20;
const CREATE_USER_WINDOW_MS = 10 * 60_000;
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const NEW_USER_TRIAL_DAYS = 2;
const AGENCY_NUMBER_MAX_LEN = 80;

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
type UserAccountType = "advisor" | "tipster";
const ACCOUNT_TYPE_SET = new Set<UserAccountType>(["advisor", "tipster"]);

type ParsedCreateUser = {
  email: string;
  password: string;
  fullName: string | null;
  agencyNumber: string | null;
  managerEmail: string | null;
  tipRecipientEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode;
  accountType: UserAccountType;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeOptionalText = (value: unknown, maxLen: number): string | null => {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return null;
  return trimmed;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

async function publicProfileExists(email: string): Promise<boolean> {
  if (!adminDb) return false;
  const usersCol = adminDb.collection("users");
  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) return true;

  const byEmailSnap = await usersCol.where("email", "==", email).limit(1).get();
  return !byEmailSnap.empty;
}

async function anyInternalProfileExists(email: string): Promise<boolean> {
  if (!adminDb) return false;
  const [publicExists, privateSnap] = await Promise.all([
    publicProfileExists(email),
    adminDb.collection("usersPrivate").doc(email).get(),
  ]);
  return publicExists || privateSnap.exists;
}

function parseCreateUserPayload(body: unknown): ParsedCreateUser | { error: string } {
  if (!isPlainObject(body)) return { error: "Neplatný payload." };

  const email = normalizeEmail(body.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Zadej platný e-mail nového uživatele." };
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 128) {
    return { error: "Dočasné heslo musí mít 8 až 128 znaků." };
  }

  const fullNameRaw = normalizeOptionalText(body.fullName, 120);
  if (fullNameRaw == null) {
    return { error: "Jméno je příliš dlouhé." };
  }
  const fullName = fullNameRaw || null;

  const agencyNumberRaw = normalizeOptionalText(body.agencyNumber, AGENCY_NUMBER_MAX_LEN);
  if (agencyNumberRaw == null) {
    return { error: `Agenturní číslo může mít maximálně ${AGENCY_NUMBER_MAX_LEN} znaků.` };
  }
  const agencyNumber = agencyNumberRaw || null;

  const accountTypeRaw =
    typeof body.accountType === "string" ? body.accountType.trim() : "advisor";
  if (!ACCOUNT_TYPE_SET.has(accountTypeRaw as UserAccountType)) {
    return { error: "Pole accountType má neplatnou hodnotu." };
  }
  const accountType = accountTypeRaw as UserAccountType;

  const managerEmailRaw = normalizeEmail(body.managerEmail);
  const tipRecipientEmailRaw =
    normalizeEmail(body.tipRecipientEmail) ||
    (accountType === "tipster" ? managerEmailRaw : "");
  const managerEmail = accountType === "advisor" ? managerEmailRaw || null : null;
  const tipRecipientEmail =
    accountType === "tipster" ? tipRecipientEmailRaw || null : null;
  const relationEmail = accountType === "tipster" ? tipRecipientEmail : managerEmail;

  if (relationEmail && !EMAIL_RE.test(relationEmail)) {
    return {
      error:
        accountType === "tipster"
          ? "E-mail příjemce tipů není platný."
          : "E-mail nadřízeného není platný.",
    };
  }
  if (relationEmail === email) {
    return {
      error:
        accountType === "tipster"
          ? "Příjemce tipů nemůže být stejný jako nový uživatel."
          : "Nadřízený nemůže být stejný jako nový uživatel.",
    };
  }
  if (accountType === "tipster" && !tipRecipientEmail) {
    return { error: "U tipaře zadej příjemce tipů." };
  }

  const positionRaw =
    typeof body.position === "string" ? body.position.trim() : "";
  if (positionRaw && !POSITION_SET.has(positionRaw as Position)) {
    return { error: "Pole position má neplatnou hodnotu." };
  }

  const modeRaw =
    typeof body.commissionMode === "string"
      ? body.commissionMode.trim()
      : "standard";
  if (!COMMISSION_MODE_SET.has(modeRaw as CommissionMode)) {
    return { error: "Pole commissionMode má neplatnou hodnotu." };
  }

  return {
    email,
    password,
    fullName,
    agencyNumber,
    managerEmail,
    tipRecipientEmail,
    position: positionRaw ? (positionRaw as Position) : null,
    commissionMode: modeRaw as CommissionMode,
    accountType,
  };
}

function mapAuthCreateError(error: unknown): { message: string; status: number } {
  const err = error as { code?: string; message?: string };
  if (err?.code === "auth/email-already-exists") {
    return { message: "Účet ve Firebase Auth už pro tento e-mail existuje.", status: 409 };
  }
  if (err?.code === "auth/invalid-password") {
    return { message: "Firebase odmítl dočasné heslo. Zkus jiné heslo.", status: 400 };
  }
  if (err?.code === "auth/invalid-email") {
    return { message: "Firebase odmítl e-mail jako neplatný.", status: 400 };
  }
  return {
    message: err?.message || "Nepodařilo se vytvořit Firebase Auth účet.",
    status: 500,
  };
}

export async function POST(req: NextRequest) {
  const ctx = await getAccountCreatorAuthContext(req, {
    actionLabel: "vytváření uživatelů",
  });
  if ("error" in ctx) {
    return adminAuthErrorResponse(ctx);
  }
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies ApiError,
      { status: 500 }
    );
  }

  const rateLimit = await consumeRateLimit({
    namespace: "api:user-create:post",
    key: ctx.adminEmail,
    limit: CREATE_USER_RATE_LIMIT,
    windowMs: CREATE_USER_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const res = NextResponse.json(
      { ok: false, error: "Příliš mnoho pokusů o vytvoření uživatele. Zkus to prosím za chvíli." } satisfies ApiError,
      { status: 429 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  const body = await req.json().catch(() => null);
  const parsed = parseCreateUserPayload(body);
  if ("error" in parsed) {
    const res = NextResponse.json(
      { ok: false, error: parsed.error } satisfies ApiError,
      { status: 400 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  let profileExists = false;
  let authUserExists = false;
  let relationProfileExists = true;
  const relationEmail =
    parsed.accountType === "tipster" ? parsed.tipRecipientEmail : parsed.managerEmail;
  try {
    [profileExists, authUserExists, relationProfileExists] = await Promise.all([
      anyInternalProfileExists(parsed.email),
      adminAuth
        .getUserByEmail(parsed.email)
        .then(() => true)
        .catch((error: { code?: string }) => {
          if (error?.code === "auth/user-not-found") return false;
          throw error;
        }),
      relationEmail ? publicProfileExists(relationEmail) : Promise.resolve(true),
    ]);
  } catch (error) {
    const mapped = mapAuthCreateError(error);
    const res = NextResponse.json(
      { ok: false, error: mapped.message } satisfies ApiError,
      { status: mapped.status }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  if (profileExists) {
    const res = NextResponse.json(
      { ok: false, error: "Interní profil pro tento e-mail už existuje." } satisfies ApiError,
      { status: 409 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  if (authUserExists) {
    const res = NextResponse.json(
      { ok: false, error: "Firebase Auth účet pro tento e-mail už existuje." } satisfies ApiError,
      { status: 409 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  if (!relationProfileExists) {
    const res = NextResponse.json(
      {
        ok: false,
        error:
          parsed.accountType === "tipster"
            ? "Zadaný příjemce tipů nemá interní profil v systému."
            : "Zadaný nadřízený nemá interní profil v systému.",
      } satisfies ApiError,
      { status: 400 }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }

  let createdUid: string | null = null;
  try {
    const authUser = await adminAuth.createUser({
      email: parsed.email,
      password: parsed.password,
      displayName: parsed.fullName ?? undefined,
      emailVerified: false,
      disabled: false,
    });
    createdUid = authUser.uid;

    const now = FieldValue.serverTimestamp();
    const trialFrom = getTodayIsoInPrague();
    const trialUntil = addDaysIso(trialFrom, NEW_USER_TRIAL_DAYS - 1);
    const publicProfile: Record<string, unknown> = {
      email: parsed.email,
      userId: authUser.uid,
      accountType: parsed.accountType,
      userRole: parsed.accountType,
      commissionMode: parsed.commissionMode,
      managerEmail: parsed.managerEmail,
      tipRecipientEmail: parsed.tipRecipientEmail,
      canChangePosition: parsed.accountType === "advisor",
      activeCollaboration: parsed.accountType === "advisor",
      createdAt: now,
      createdByEmail: ctx.adminEmail,
      updatedAt: now,
      updatedByEmail: ctx.adminEmail,
    };
    if (parsed.accountType === "advisor" && parsed.position) {
      publicProfile.position = parsed.position;
    }
    if (parsed.fullName) {
      publicProfile.name = parsed.fullName;
      publicProfile.fullName = parsed.fullName;
    }
    if (parsed.agencyNumber) {
      publicProfile.agencyNumber = parsed.agencyNumber;
    }

    const privateProfile: Record<string, unknown> = {
      subscriptionStatus: "active",
      subscriptionPaidFrom: trialFrom,
      subscriptionPaidUntil:
        parsed.accountType === "tipster" ? null : trialUntil,
      subscriptionPlan: parsed.accountType === "tipster" ? "unlimited" : null,
      adminFunction: false,
      createdAt: now,
      createdByEmail: ctx.adminEmail,
      updatedAt: now,
      updatedByEmail: ctx.adminEmail,
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection("users").doc(parsed.email), publicProfile, {
      merge: false,
    });
    batch.set(adminDb.collection("usersPrivate").doc(parsed.email), privateProfile, {
      merge: false,
    });
    await batch.commit();

    const res = NextResponse.json({
      ok: true,
      email: parsed.email,
      uid: authUser.uid,
      profilePath: `users/${parsed.email}`,
    } satisfies ApiSuccess);
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  } catch (error) {
    if (createdUid) {
      await adminAuth.deleteUser(createdUid).catch((deleteError) => {
        console.error("create-user rollback failed", deleteError);
      });
    }

    const mapped = createdUid
      ? { message: "Účet se vytvořil v Auth, ale nepodařilo se uložit profil. Auth účet jsem zkusil vrátit zpět.", status: 500 }
      : mapAuthCreateError(error);
    const res = NextResponse.json(
      { ok: false, error: mapped.message } satisfies ApiError,
      { status: mapped.status }
    );
    applyRateLimitHeaders(res.headers, rateLimit);
    return res;
  }
}
