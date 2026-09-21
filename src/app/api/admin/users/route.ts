import { markHallOwnerDirty } from "@/lib/server/hallOfFameProjection";
import type { AdminUsersRow, AdminUserSummary } from "@/app/admin/zadosti/adminUsers";
import { buildAdminUserMissingItems } from "@/app/admin/zadosti/adminUserCompleteness";
import { withCashflowMutation, trackCashflowWrite } from "@/lib/server/cashflowMutationTracking";
import { NextResponse, type NextRequest } from "next/server";
import type { MultiFactorInfo, UserRecord } from "firebase-admin/auth";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { getAdminAccountAccess } from "@/lib/server/adminAccountAccess";
import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";
import {
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";
import { isSpecialistProfile } from "@/lib/specialistAccess";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";
import type { Position } from "@/app/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const AUTH_LIST_USERS_LIMIT = 1000;
const FULL_NAME_MAX_LEN = 120;
const AGENCY_NUMBER_MAX_LEN = 80;
const PHONE_NUMBER_MAX_LEN = 40;
const PROFILE_ICO_MAX_LEN = 8;
const ONLINE_CARD_SLUG_MAX_LEN = 64;
type AccountType = "advisor" | "tipster";
const ACCOUNT_TYPE_SET = new Set<AccountType>(["advisor", "tipster"]);
const POSITION_SET = new Set<Position>([
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

type ApiError = { ok: false; error: string };

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

const slugifyOnlineCard = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ONLINE_CARD_SLUG_MAX_LEN);

async function resolveAvailableOnlineCardSlug({
  preferredSlug,
  ownerEmail,
  ownerUid,
}: {
  preferredSlug: string;
  ownerEmail: string;
  ownerUid: string;
}): Promise<string | null> {
  if (!adminDb) return null;
  const base = slugifyOnlineCard(preferredSlug) || "vizitka";

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const suffixText = suffix === 1 ? "" : `-${suffix}`;
    const candidate = `${base.slice(0, ONLINE_CARD_SLUG_MAX_LEN - suffixText.length)}${suffixText}`;
    if (candidate.length < 3 || !ONLINE_CARD_SLUG_RE.test(candidate)) continue;

    const snap = await adminDb
      .collection("users")
      .where("onlineCard.slug", "==", candidate)
      .limit(12)
      .get();
    const occupiedByOtherUser = snap.docs.some((docSnap) => {
      const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
      const dataEmail = normalizeEmail(data.email);
      const dataUid = normalizeText(data.userId);
      return (
        normalizeEmail(docSnap.id) !== ownerEmail &&
        dataEmail !== ownerEmail &&
        (!ownerUid || dataUid !== ownerUid)
      );
    });
    if (!occupiedByOtherUser) return candidate;
  }

  return null;
}

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

function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function currentIsoDay(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function resolveCurrentPositionFromTimeline(
  timeline: AdminUsersRow["positionTimeline"]
): string | null {
  const today = currentIsoDay();
  const candidates = timeline.filter((row) => {
    if (!POSITION_SET.has(row.position as Position)) return false;
    if (!isIsoDay(row.validFrom)) return false;
    if (row.validTo && !isIsoDay(row.validTo)) return false;
    if (row.validFrom > today) return false;
    if (row.validTo && row.validTo < today) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });
  return candidates[0]?.position ?? null;
}

function summarizeOnlineCard(value: unknown): AdminUsersRow["onlineCard"] {
  if (!isPlainObject(value)) {
    return {
      enabled: false,
      slug: null,
      ready: false,
    };
  }

  const enabled = value.enabled === true;
  const slug = normalizeOnlineCardSlug(value.slug);
  const fullName = normalizeText(value.fullName);
  const validSlug = slug.length >= 3 && ONLINE_CARD_SLUG_RE.test(slug);

  return {
    enabled,
    slug: slug || null,
    ready: enabled && validSlug && Boolean(fullName),
  };
}

function serializeFactor(factor: MultiFactorInfo): AdminUsersRow["mfa"]["factors"][number] {
  const maybePhone = factor as MultiFactorInfo & { phoneNumber?: string };
  return {
    uid: factor.uid,
    factorId: factor.factorId,
    displayName: factor.displayName ?? null,
    enrollmentTime: factor.enrollmentTime ?? null,
    phoneNumber: typeof maybePhone.phoneNumber === "string" ? maybePhone.phoneNumber : null,
  };
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

async function loadProfileSummaries(directoryOnly = false) {
  if (!adminDb) return new Map<string, ProfileSummary>();

  const [usersSnap, privateSnap] = await Promise.all([
    (directoryOnly ? adminDb.collection("users").select(...DIRECTORY_PROFILE_FIELDS) : adminDb.collection("users")).get(),
    (directoryOnly ? adminDb.collection("usersPrivate").select(...DIRECTORY_PROFILE_FIELDS) : adminDb.collection("usersPrivate")).get(),
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

function serializeUser(authUser: UserRecord, summary: ProfileSummary | undefined, block?: FirebaseFirestore.DocumentData): AdminUsersRow | null {
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
  const factors = (authUser.multiFactor?.enrolledFactors ?? []).map(serializeFactor);
  const positionTimeline = sanitizePositionTimeline(mergedData.positionTimeline);
  const currentPosition =
    resolveCurrentPositionFromTimeline(positionTimeline) ||
    normalizeText(mergedData.position) ||
    null;

  return {
    uid: authUser.uid,
    email,
    fullName,
    profileAvatar: normalizeProfileAvatar(publicData.profileAvatar),
    agencyNumber: normalizeText(mergedData.agencyNumber) || null,
    ico: normalizeText(mergedData.ico).replace(/\D+/g, "") || null,
    phoneNumber: normalizeText(mergedData.phoneNumber) || null,
    position: currentPosition,
    positionTimeline,
    accountType,
    managerEmail: normalizeEmail(mergedData.managerEmail) || null,
    tipRecipientEmail: normalizeEmail(mergedData.tipRecipientEmail) || null,
    commissionMode: normalizeText(mergedData.commissionMode) || null,
    specialist: isSpecialistProfile(mergedData),
    accountSetupCompletedAt: normalizeText(mergedData.accountSetupCompletedAt) || null,
    disabled: authUser.disabled,
    access: getAdminAccountAccess(authUser, block),
    emailVerified: authUser.emailVerified,
    createdAt: authUser.metadata.creationTime || null,
    lastSignInAt: authUser.metadata.lastSignInTime || null,
    profileExists: Boolean(summary?.publicDocId),
    privateProfileExists: Boolean(summary?.privateDocId || Object.keys(privateData).length > 0),
    mfa: {
      enabled: factors.length > 0,
      factorCount: factors.length,
      hasTotp: factors.some((factor) => factor.factorId === "totp"),
      hasPhone: factors.some((factor) => factor.factorId === "phone"),
      factors,
    },
    onlineCard: summarizeOnlineCard(publicData.onlineCard),
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

const DIRECTORY_PROFILE_FIELDS = [
  "email", "fullName", "name", "profileAvatar", "agencyNumber", "ico", "phoneNumber",
  "position", "positionTimeline", "accountType", "userRole", "managerEmail", "tipRecipientEmail",
  "commissionMode", "specialist", "documentsSpecialist", "role", "appRole", "roles",
];

function serializeDirectoryUser(row: AdminUsersRow): AdminUserSummary {
  return { uid: row.uid, email: row.email, fullName: row.fullName, profileAvatar: row.profileAvatar,
    agencyNumber: row.agencyNumber, ico: row.ico, phoneNumber: row.phoneNumber, position: row.position,
    accountType: row.accountType, managerEmail: row.managerEmail, tipRecipientEmail: row.tipRecipientEmail,
    commissionMode: row.commissionMode, specialist: row.specialist, disabled: row.disabled,
    access: row.access,
    emailVerified: row.emailVerified, profileExists: row.profileExists, missingItems: buildAdminUserMissingItems(row),
  };
}

async function loadUserDetail(email: string): Promise<AdminUsersRow | null> {
  if (!adminAuth || !adminDb) throw new Error("Firebase Admin is unavailable.");
  const authUser = await adminAuth.getUserByEmail(email);
  const [publicDirect, privateDirect, block] = await Promise.all([
    adminDb.collection("users").doc(email).get(), adminDb.collection("usersPrivate").doc(email).get(),
    adminDb.collection("accountBlocks").doc(authUser.uid).get(),
  ]);
  // Older accounts may use a document ID other than their email.
  const [publicFallback, privateFallback] = await Promise.all([
    publicDirect.exists ? null : adminDb.collection("users").where("email", "==", email).limit(1).get(),
    privateDirect.exists ? null : adminDb.collection("usersPrivate").where("email", "==", email).limit(1).get(),
  ]);
  let publicDoc = publicDirect.exists ? publicDirect : publicFallback?.docs[0];
  if (!publicDoc) publicDoc = (await adminDb.collection("users").where("userId", "==", authUser.uid).limit(1).get()).docs[0];
  const privateDoc = privateDirect.exists ? privateDirect : privateFallback?.docs[0];
  return serializeUser(authUser, { publicDocId: publicDoc?.id ?? null, privateDocId: privateDoc?.id ?? null,
    publicData: publicDoc?.data() ?? {}, privateData: privateDoc?.data() ?? {},
  }, block.data());
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

    const requestedEmail = req.nextUrl.searchParams.get("email");
    if (requestedEmail !== null) {
      const email = normalizeEmail(requestedEmail);
      if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Neplatný e-mail." }, { status: 400 });
      const user = await loadUserDetail(email);
      return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
    }
    const directoryOnly = req.nextUrl.searchParams.get("view") === "directory";
    if (!adminDb) throw new Error("Firebase Admin is unavailable.");
    const [authUsers, profilesByEmail, blocks] = await Promise.all([
      listAllAuthUsers(),
      loadProfileSummaries(directoryOnly),
      adminDb.collection("accountBlocks").get(),
    ]);
    const blocksByUid = new Map(blocks.docs.map(doc => [doc.id, doc.data()]));

    const users = authUsers
      .map((authUser) => serializeUser(authUser, profilesByEmail.get(normalizeEmail(authUser.email)), blocksByUid.get(authUser.uid)))
      .filter((row): row is AdminUsersRow => Boolean(row))
      .sort((a, b) => {
        const aName = a.fullName || a.email;
        const bName = b.fullName || b.email;
        return aName.localeCompare(bName, "cs");
      });

    const response = NextResponse.json({
      ok: true,
      users: directoryOnly ? users.map(serializeDirectoryUser) : users,
      summary: {
        total: users.length,
        disabled: users.filter((user) => user.disabled).length,
        missingProfile: users.filter((user) => !user.profileExists).length,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/user-not-found") return NextResponse.json({ ok: false, error: "Uživatel nebyl nalezen." }, { status: 404 });
    console.error("GET /api/admin/users selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst uživatele." } satisfies ApiError,
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return withCashflowMutation("app/api/admin/users/route:PATCH", async () => {
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
    const hasOnlineCardEnabledPatch = Object.prototype.hasOwnProperty.call(
      body,
      "onlineCardEnabled"
    );
    if (hasOnlineCardEnabledPatch && typeof body.onlineCardEnabled !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "Stav online vizitky má neplatnou hodnotu." } satisfies ApiError,
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

    if (hasOnlineCardEnabledPatch) {
      const publicSnapshot = await publicRef.get();
      const publicData = publicSnapshot.exists
        ? ((publicSnapshot.data() as Record<string, unknown> | undefined) ?? {})
        : {};
      const existingOnlineCard = isPlainObject(publicData.onlineCard)
        ? publicData.onlineCard
        : {};
      const enabled = body.onlineCardEnabled === true;
      const existingSlug = normalizeOnlineCardSlug(existingOnlineCard.slug);
      const existingFullName = normalizeText(existingOnlineCard.fullName);
      const cardFullName = existingFullName || fullName || email.split("@")[0] || email;
      let slug = existingSlug;

      if (enabled) {
        slug =
          (await resolveAvailableOnlineCardSlug({
            preferredSlug:
              slug.length >= 3 && ONLINE_CARD_SLUG_RE.test(slug)
                ? slug
                : cardFullName || email,
            ownerEmail: email,
            ownerUid: authUser?.uid ?? "",
          })) ?? "";
        if (!slug) {
          return NextResponse.json(
            { ok: false, error: "Pro online vizitku se nepodařilo vytvořit volnou URL." } satisfies ApiError,
            { status: 409 }
          );
        }
      }

      patch.onlineCard = {
        ...existingOnlineCard,
        enabled,
        slug,
        ownerEmail: email,
        fullName: cardFullName,
        email,
        phone: normalizeText(existingOnlineCard.phone) || phoneNumberRaw,
        ico: normalizeText(existingOnlineCard.ico).replace(/\D+/g, "") || icoRaw,
        updatedAt: new Date().toISOString(),
      };
    }

    await trackCashflowWrite(() => publicRef.set(patch, { merge: true }));

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
        onlineCard: hasOnlineCardEnabledPatch
          ? summarizeOnlineCard(patch.onlineCard)
          : undefined,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/users selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se uložit uživatele." } satisfies ApiError,
      { status: 500 }
    );
  }
  });
}

export async function DELETE(req: NextRequest) {
  return withCashflowMutation("app/api/admin/users/route:DELETE", async () => {
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
    markHallOwnerDirty(batch, adminDb, email);
    [...publicRefs, ...privateRefs].forEach((ref) => batch.delete(ref));
    if (publicRefs.length === 0) batch.delete(adminDb.collection("users").doc(email));
    if (privateRefs.length === 0) batch.delete(adminDb.collection("usersPrivate").doc(email));
    await trackCashflowWrite(() => batch.commit());

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
  });
}
