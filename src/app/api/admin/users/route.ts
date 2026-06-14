import { NextResponse, type NextRequest } from "next/server";
import type { UserRecord } from "firebase-admin/auth";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";
import { isSpecialistProfile } from "@/lib/specialistAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const AUTH_LIST_USERS_LIMIT = 1000;
const FULL_NAME_MAX_LEN = 120;
const AGENCY_NUMBER_MAX_LEN = 80;
const PHONE_NUMBER_MAX_LEN = 40;
const PROFILE_ICO_MAX_LEN = 8;
type AccountType = "advisor" | "tipster";
const ACCOUNT_TYPE_SET = new Set<AccountType>(["advisor", "tipster"]);

type ApiError = { ok: false; error: string };

type AdminUsersRow = {
  uid: string;
  email: string;
  fullName: string | null;
  agencyNumber: string | null;
  ico: string | null;
  phoneNumber: string | null;
  position: string | null;
  positionTimeline: Array<{
    id: string;
    position: string;
    validFrom: string;
    validTo: string | null;
  }>;
  accountType: string | null;
  managerEmail: string | null;
  tipRecipientEmail: string | null;
  commissionMode: string | null;
  specialist: boolean;
  accountSetupCompletedAt: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  profileExists: boolean;
  privateProfileExists: boolean;
};

type ProfileSummary = {
  publicDocId: string | null;
  privateDocId: string | null;
  publicData: Record<string, unknown>;
  privateData: Record<string, unknown>;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionalText = (value: unknown, maxLen: number): string | null => {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return null;
  return trimmed;
};

const normalizeOptionalIco = (value: unknown): string | null => {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D+/g, "");
  if (digits.length > PROFILE_ICO_MAX_LEN) return null;
  if (digits.length > 0 && digits.length !== PROFILE_ICO_MAX_LEN) return null;
  return digits;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sanitizePositionTimeline(value: unknown): AdminUsersRow["positionTimeline"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw, index) => {
      if (!isPlainObject(raw)) return null;
      const position = normalizeText(raw.position);
      const validFrom = normalizeText(raw.validFrom);
      const validTo = normalizeText(raw.validTo);
      if (!position || !validFrom) return null;
      return {
        id: normalizeText(raw.id) || `timeline-${index}`,
        position,
        validFrom,
        validTo: validTo || null,
      };
    })
    .filter((row): row is AdminUsersRow["positionTimeline"][number] => Boolean(row));
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  if (!adminAuth) return [];

  const users: UserRecord[] = [];
  let pageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(AUTH_LIST_USERS_LIMIT, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function loadProfileSummaries() {
  if (!adminDb) return new Map<string, ProfileSummary>();

  const [usersSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("usersPrivate").get(),
  ]);
  const byEmail = new Map<string, ProfileSummary>();

  const ensureSummary = (email: string): ProfileSummary => {
    const existing = byEmail.get(email);
    if (existing) return existing;
    const next: ProfileSummary = {
      publicDocId: null,
      privateDocId: null,
      publicData: {},
      privateData: {},
    };
    byEmail.set(email, next);
    return next;
  };

  usersSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email || !EMAIL_RE.test(email)) return;
    const summary = ensureSummary(email);
    summary.publicDocId = docSnap.id;
    summary.publicData = data;
  });

  privateSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email || !EMAIL_RE.test(email)) return;
    const summary = ensureSummary(email);
    summary.privateDocId = docSnap.id;
    summary.privateData = data;
  });

  return byEmail;
}

function serializeUser(authUser: UserRecord, summary: ProfileSummary | undefined): AdminUsersRow | null {
  const email = normalizeEmail(authUser.email);
  if (!email || !EMAIL_RE.test(email)) return null;

  const publicData = summary?.publicData ?? {};
  const privateData = summary?.privateData ?? {};
  const mergedData = {
    ...publicData,
    ...privateData,
  };
  const fullName =
    normalizeText(mergedData.fullName) ||
    normalizeText(mergedData.name) ||
    normalizeText(authUser.displayName) ||
    null;
  const accountType =
    normalizeText(mergedData.accountType) ||
    normalizeText(mergedData.userRole) ||
    null;

  return {
    uid: authUser.uid,
    email,
    fullName,
    agencyNumber: normalizeText(mergedData.agencyNumber) || null,
    ico: normalizeText(mergedData.ico).replace(/\D+/g, "") || null,
    phoneNumber: normalizeText(mergedData.phoneNumber) || null,
    position: normalizeText(mergedData.position) || null,
    positionTimeline: sanitizePositionTimeline(mergedData.positionTimeline),
    accountType,
    managerEmail: normalizeEmail(mergedData.managerEmail) || null,
    tipRecipientEmail: normalizeEmail(mergedData.tipRecipientEmail) || null,
    commissionMode: normalizeText(mergedData.commissionMode) || null,
    specialist: isSpecialistProfile(mergedData),
    accountSetupCompletedAt: normalizeText(mergedData.accountSetupCompletedAt) || null,
    disabled: authUser.disabled,
    emailVerified: authUser.emailVerified,
    createdAt: authUser.metadata.creationTime || null,
    lastSignInAt: authUser.metadata.lastSignInTime || null,
    profileExists: Boolean(summary?.publicDocId),
    privateProfileExists: Boolean(summary?.privateDocId || Object.keys(privateData).length > 0),
  };
}

async function findProfileRefs(email: string, uid?: string) {
  if (!adminDb) return { publicRefs: [] as DocumentReference[], privateRefs: [] as DocumentReference[] };

  const usersCol = adminDb.collection("users");
  const privateCol = adminDb.collection("usersPrivate");

  const [directPublic, byEmailPublic, byUidPublic, directPrivate, byEmailPrivate] =
    await Promise.all([
      usersCol.doc(email).get(),
      usersCol.where("email", "==", email).limit(10).get(),
      uid ? usersCol.where("userId", "==", uid).limit(10).get() : Promise.resolve(null),
      privateCol.doc(email).get(),
      privateCol.where("email", "==", email).limit(10).get(),
    ]);

  const dedupe = (refs: DocumentReference[]) => {
    const byPath = new Map<string, DocumentReference>();
    refs.forEach((ref) => byPath.set(ref.path, ref));
    return Array.from(byPath.values());
  };

  const publicRefs: DocumentReference[] = [];
  if (directPublic.exists) publicRefs.push(directPublic.ref);
  byEmailPublic.docs.forEach((docSnap) => publicRefs.push(docSnap.ref));
  byUidPublic?.docs.forEach((docSnap) => publicRefs.push(docSnap.ref));

  const privateRefs: DocumentReference[] = [];
  if (directPrivate.exists) privateRefs.push(directPrivate.ref);
  byEmailPrivate.docs.forEach((docSnap) => privateRefs.push(docSnap.ref));

  return {
    publicRefs: dedupe(publicRefs),
    privateRefs: dedupe(privateRefs),
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAdminAuthContext(req, {
      minimumRole: "admin",
      actionLabel: "správu uživatelů",
    });
    if ("error" in ctx) {
      return adminAuthErrorResponse(ctx);
    }

    const [authUsers, profilesByEmail] = await Promise.all([
      listAllAuthUsers(),
      loadProfileSummaries(),
    ]);

    const users = authUsers
      .map((authUser) => serializeUser(authUser, profilesByEmail.get(normalizeEmail(authUser.email))))
      .filter((row): row is AdminUsersRow => Boolean(row))
      .sort((a, b) => {
        const aName = a.fullName || a.email;
        const bName = b.fullName || b.email;
        return aName.localeCompare(bName, "cs");
      });

    const response = NextResponse.json({
      ok: true,
      users,
      summary: {
        total: users.length,
        disabled: users.filter((user) => user.disabled).length,
        missingProfile: users.filter((user) => !user.profileExists).length,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("GET /api/admin/users selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst uživatele." } satisfies ApiError,
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAdminAuthContext(req, {
      minimumRole: "admin",
      actionLabel: "úpravu uživatelů",
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

    const body = await req.json().catch(() => null);
    if (!isPlainObject(body)) {
      return NextResponse.json(
        { ok: false, error: "Neplatný payload." } satisfies ApiError,
        { status: 400 }
      );
    }

    const email = normalizeEmail(body.email);
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Zadej platný e-mail uživatele." } satisfies ApiError,
        { status: 400 }
      );
    }

    const fullNameRaw = normalizeOptionalText(body.fullName, FULL_NAME_MAX_LEN);
    if (fullNameRaw == null) {
      return NextResponse.json(
        { ok: false, error: `Jméno / název může mít maximálně ${FULL_NAME_MAX_LEN} znaků.` } satisfies ApiError,
        { status: 400 }
      );
    }
    const agencyNumberRaw = normalizeOptionalText(body.agencyNumber, AGENCY_NUMBER_MAX_LEN);
    if (agencyNumberRaw == null) {
      return NextResponse.json(
        { ok: false, error: `Agenturní číslo může mít maximálně ${AGENCY_NUMBER_MAX_LEN} znaků.` } satisfies ApiError,
        { status: 400 }
      );
    }
    const icoRaw = normalizeOptionalIco(body.ico);
    if (icoRaw == null) {
      return NextResponse.json(
        { ok: false, error: `IČO musí mít ${PROFILE_ICO_MAX_LEN} číslic.` } satisfies ApiError,
        { status: 400 }
      );
    }
    const phoneNumberRaw = normalizeOptionalText(body.phoneNumber, PHONE_NUMBER_MAX_LEN);
    if (phoneNumberRaw == null) {
      return NextResponse.json(
        { ok: false, error: `Telefonní číslo může mít maximálně ${PHONE_NUMBER_MAX_LEN} znaků.` } satisfies ApiError,
        { status: 400 }
      );
    }
    const hasAccountTypePatch = Object.prototype.hasOwnProperty.call(body, "accountType");
    const accountTypeRaw =
      hasAccountTypePatch && typeof body.accountType === "string"
        ? body.accountType.trim()
        : "";
    if (hasAccountTypePatch && typeof body.accountType !== "string") {
      return NextResponse.json(
        { ok: false, error: "Typ účtu má neplatnou hodnotu." } satisfies ApiError,
        { status: 400 }
      );
    }
    if (accountTypeRaw && !ACCOUNT_TYPE_SET.has(accountTypeRaw as AccountType)) {
      return NextResponse.json(
        { ok: false, error: "Typ účtu má neplatnou hodnotu." } satisfies ApiError,
        { status: 400 }
      );
    }

    const authUser = await adminAuth
      .getUserByEmail(email)
      .catch((error: { code?: string }) => {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      });

    const fullName = fullNameRaw || null;
    if (authUser && (authUser.displayName || "") !== (fullName ?? "")) {
      await adminAuth.updateUser(authUser.uid, {
        displayName: fullName,
      });
    }

    const { publicRefs } = await findProfileRefs(email, authUser?.uid);
    const publicRef = publicRefs[0] ?? adminDb.collection("users").doc(email);
    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = {
      email,
      updatedAt: now,
      updatedByEmail: ctx.adminEmail,
    };
    if (authUser?.uid) patch.userId = authUser.uid;
    if (fullName) {
      patch.fullName = fullName;
      patch.name = fullName;
    } else {
      patch.fullName = FieldValue.delete();
      patch.name = FieldValue.delete();
    }
    if (agencyNumberRaw) {
      patch.agencyNumber = agencyNumberRaw;
    } else {
      patch.agencyNumber = FieldValue.delete();
    }
    if (icoRaw) {
      patch.ico = icoRaw;
    } else {
      patch.ico = FieldValue.delete();
    }
    if (phoneNumberRaw) {
      patch.phoneNumber = phoneNumberRaw;
    } else {
      patch.phoneNumber = FieldValue.delete();
    }
    if (hasAccountTypePatch) {
      if (accountTypeRaw) {
        const accountType = accountTypeRaw as AccountType;
        patch.accountType = accountType;
        patch.userRole = accountType;
        patch.canChangePosition = accountType === "advisor";
        patch.activeCollaboration = accountType === "advisor";
        if (accountType === "advisor") {
          patch.tipRecipientEmail = FieldValue.delete();
        }
        if (accountType === "tipster") {
          patch.managerEmail = FieldValue.delete();
          patch.position = FieldValue.delete();
          patch.positionTimeline = FieldValue.delete();
        }
      } else {
        patch.accountType = FieldValue.delete();
        patch.userRole = FieldValue.delete();
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "specialist")) {
      if (typeof body.specialist !== "boolean") {
        return NextResponse.json(
          { ok: false, error: "Specialista má neplatnou hodnotu." } satisfies ApiError,
          { status: 400 }
        );
      }
      patch.specialist = body.specialist;
    }

    await publicRef.set(patch, { merge: true });

    return NextResponse.json({
      ok: true,
      user: {
        email,
        uid: authUser?.uid ?? "",
        fullName,
        agencyNumber: agencyNumberRaw || null,
        ico: icoRaw || null,
        phoneNumber: phoneNumberRaw || null,
        accountType: accountTypeRaw || null,
        specialist: body.specialist === true,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/users selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se uložit uživatele." } satisfies ApiError,
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAdminAuthContext(req, {
      minimumRole: "owner",
      actionLabel: "mazání uživatelů",
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

    const body = await req.json().catch(() => null);
    if (!isPlainObject(body)) {
      return NextResponse.json(
        { ok: false, error: "Neplatný payload." } satisfies ApiError,
        { status: 400 }
      );
    }

    const email = normalizeEmail(body.email);
    const confirmEmail = normalizeEmail(body.confirmEmail);
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Zadej platný e-mail uživatele." } satisfies ApiError,
        { status: 400 }
      );
    }
    if (confirmEmail !== email) {
      return NextResponse.json(
        { ok: false, error: "Pro smazání potvrď přesný e-mail uživatele." } satisfies ApiError,
        { status: 400 }
      );
    }
    if (email === ctx.adminEmail) {
      return NextResponse.json(
        { ok: false, error: "Nemůžeš smazat vlastní administrátorský účet." } satisfies ApiError,
        { status: 400 }
      );
    }

    const authUser = await adminAuth
      .getUserByEmail(email)
      .catch((error: { code?: string }) => {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      });

    const { publicRefs, privateRefs } = await findProfileRefs(email, authUser?.uid);
    if (authUser) {
      await adminAuth.deleteUser(authUser.uid);
    }

    const batch = adminDb.batch();
    [...publicRefs, ...privateRefs].forEach((ref) => batch.delete(ref));
    if (publicRefs.length === 0) batch.delete(adminDb.collection("users").doc(email));
    if (privateRefs.length === 0) batch.delete(adminDb.collection("usersPrivate").doc(email));
    await batch.commit();

    return NextResponse.json({
      ok: true,
      email,
      deletedAuth: Boolean(authUser),
      deletedProfiles: publicRefs.length + privateRefs.length,
    });
  } catch (error) {
    console.error("DELETE /api/admin/users selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se smazat uživatele." } satisfies ApiError,
      { status: 500 }
    );
  }
}
