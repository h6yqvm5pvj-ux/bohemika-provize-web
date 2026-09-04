import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { toDate } from "@/app/lib/formatters";
import type { CommissionMode, Position } from "@/app/types/domain";
import { adminRoleAtLeast, resolveAdminRoleFromClaims } from "@/lib/adminAccess";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { addDaysIso, getTodayIsoInPrague } from "@/lib/subscriptionAccess";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import {
  USER_REQUEST_SCREENSHOT_MAX_FILES,
  deleteUserRequestScreenshot,
  normalizeStoredUserRequestScreenshots,
  prepareUserRequestScreenshotFile,
  toPublicUserRequestScreenshot,
  uploadUserRequestScreenshot,
  type PreparedUserRequestScreenshot,
  type PublicUserRequestScreenshot,
  type StoredUserRequestScreenshot,
} from "@/lib/server/userRequestScreenshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_REQUESTS_COLLECTION = "userRequests";

const USER_REQUESTS_GET_LIMIT = 60;
const USER_REQUESTS_GET_WINDOW_MS = 60_000;
const USER_REQUESTS_POST_LIMIT = 20;
const USER_REQUESTS_POST_WINDOW_MS = 60_000;
const USER_REQUESTS_PATCH_LIMIT = 30;
const USER_REQUESTS_PATCH_WINDOW_MS = 60_000;
const USER_REQUESTS_PUT_LIMIT = 20;
const USER_REQUESTS_PUT_WINDOW_MS = 60_000;
const USER_REQUESTS_DELETE_LIMIT = 40;
const USER_REQUESTS_DELETE_WINDOW_MS = 60_000;

const USER_REQUEST_MESSAGE_MIN_LEN = 5;
const USER_REQUEST_MESSAGE_MAX_LEN = 2500;
const USER_REQUEST_FEEDBACK_MAX_LEN = 1200;
const USER_REQUEST_CORPORATE_EMAIL_MAX_LEN = 180;
const USER_REQUEST_MANAGER_EMAIL_MAX_LEN = 180;
const USER_REQUEST_FULL_NAME_MAX_LEN = 120;
const USER_REQUEST_AGENCY_NUMBER_MAX_LEN = 80;
const USER_REQUEST_TEMP_PASSWORD_MIN_LEN = 8;
const USER_REQUEST_TEMP_PASSWORD_MAX_LEN = 128;
const NEW_USER_TRIAL_DAYS = 2;

type UserRequestSubject = "userCreation" | "problem" | "other";
type UserRequestPriority = "normal" | "urgent";
type UserRequestStatus = "pending" | "needsInfo" | "accepted" | "rejected";

type UserCreationRequestDraft = {
  fullName: string | null;
  agencyNumber: string | null;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode;
};

type UserRequestPayload = {
  id: string;
  requesterEmail: string;
  subject: UserRequestSubject;
  requestedCorporateEmail: string | null;
  requestedUserDraft: UserCreationRequestDraft | null;
  message: string;
  priority: UserRequestPriority;
  status: UserRequestStatus;
  feedback: string | null;
  createdUserEmail: string | null;
  createdUserUid: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  decidedAtMs: number | null;
  decidedByEmail: string | null;
  screenshots: PublicUserRequestScreenshot[];
};

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

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value: string): boolean => EMAIL_RE.test(value);

const isAdmin = (
  email: string,
  decoded: Record<string, unknown> | null | undefined
): boolean =>
  adminRoleAtLeast(resolveAdminRoleFromClaims(email, decoded), "admin");

const parseSubject = (value: unknown): UserRequestSubject | null => {
  if (value === "userCreation" || value === "problem" || value === "other") {
    return value;
  }
  return null;
};

const parsePriority = (value: unknown): UserRequestPriority | null => {
  if (value === "normal" || value === "urgent") return value;
  return null;
};

const parseStatus = (value: unknown): UserRequestStatus | null => {
  if (
    value === "pending" ||
    value === "needsInfo" ||
    value === "accepted" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
};

const parsePosition = (value: unknown): Position | null =>
  typeof value === "string" && POSITION_SET.has(value as Position)
    ? (value as Position)
    : null;

const parseCommissionMode = (value: unknown): CommissionMode =>
  typeof value === "string" && COMMISSION_MODE_SET.has(value as CommissionMode)
    ? (value as CommissionMode)
    : "standard";

const errorWithStatus = (message: string, status: number): Error =>
  Object.assign(new Error(message), { status });

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

type CreateUserFromRequestParams = {
  requestId: string;
  requestedCorporateEmail: string;
  fullName: string | null;
  agencyNumber: string | null;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode;
  password: string;
  decidedByEmail: string;
};

async function createUserFromRequest(
  params: CreateUserFromRequestParams
): Promise<{ email: string; uid: string }> {
  if (!adminAuth || !adminDb) {
    throw errorWithStatus("Server není správně nakonfigurován (Firebase Admin).", 500);
  }

  let profileExists = false;
  let authUserExists = false;
  let managerExists = true;
  try {
    [profileExists, authUserExists, managerExists] = await Promise.all([
      anyInternalProfileExists(params.requestedCorporateEmail),
      adminAuth
        .getUserByEmail(params.requestedCorporateEmail)
        .then(() => true)
        .catch((error: { code?: string }) => {
          if (error?.code === "auth/user-not-found") return false;
          throw error;
        }),
      params.managerEmail ? publicProfileExists(params.managerEmail) : Promise.resolve(true),
    ]);
  } catch (error) {
    const mapped = mapAuthCreateError(error);
    throw errorWithStatus(mapped.message, mapped.status);
  }

  if (profileExists) {
    throw errorWithStatus("Interní profil pro tento e-mail už existuje.", 409);
  }
  if (authUserExists) {
    throw errorWithStatus("Firebase Auth účet pro tento e-mail už existuje.", 409);
  }
  if (!managerExists) {
    throw errorWithStatus("Zadaný nadřízený nemá interní profil v systému.", 400);
  }

  let createdUid: string | null = null;
  try {
    const authUser = await adminAuth.createUser({
      email: params.requestedCorporateEmail,
      password: params.password,
      displayName: params.fullName ?? undefined,
      emailVerified: false,
      disabled: false,
    });
    createdUid = authUser.uid;

    const now = FieldValue.serverTimestamp();
    const trialFrom = getTodayIsoInPrague();
    const trialUntil = addDaysIso(trialFrom, NEW_USER_TRIAL_DAYS - 1);
    const publicProfile: Record<string, unknown> = {
      email: params.requestedCorporateEmail,
      userId: authUser.uid,
      commissionMode: params.commissionMode,
      managerEmail: params.managerEmail,
      canChangePosition: true,
      activeCollaboration: true,
      createdAt: now,
      createdByEmail: params.decidedByEmail,
      updatedAt: now,
      updatedByEmail: params.decidedByEmail,
      createdFromRequestId: params.requestId,
    };
    if (params.position) {
      publicProfile.position = params.position;
    }
    if (params.fullName) {
      publicProfile.name = params.fullName;
      publicProfile.fullName = params.fullName;
    }
    if (params.agencyNumber) {
      publicProfile.agencyNumber = params.agencyNumber;
    }

    const privateProfile = {
      subscriptionStatus: "active",
      subscriptionPaidFrom: trialFrom,
      subscriptionPaidUntil: trialUntil,
      adminFunction: false,
      createdAt: now,
      createdByEmail: params.decidedByEmail,
      updatedAt: now,
      updatedByEmail: params.decidedByEmail,
      createdFromRequestId: params.requestId,
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection("users").doc(params.requestedCorporateEmail), publicProfile, {
      merge: false,
    });
    batch.set(adminDb.collection("usersPrivate").doc(params.requestedCorporateEmail), privateProfile, {
      merge: false,
    });
    await batch.commit();

    return {
      email: params.requestedCorporateEmail,
      uid: authUser.uid,
    };
  } catch (error) {
    if (createdUid) {
      await adminAuth.deleteUser(createdUid).catch((deleteError) => {
        console.error("create-user-from-request rollback failed", deleteError);
      });
    }
    const mapped = createdUid
      ? {
          message:
            "Účet se vytvořil v Auth, ale nepodařilo se uložit profil. Auth účet jsem zkusil vrátit zpět.",
          status: 500,
        }
      : mapAuthCreateError(error);
    throw errorWithStatus(mapped.message, mapped.status);
  }
}

const parseRequestDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): UserRequestPayload | null => {
  if (!docSnap.exists) return null;
  const data = docSnap.data() as Record<string, unknown>;
  const requesterEmail = normalizeEmail(data.requesterEmail);
  const subject = parseSubject(data.subject);
  const requestedCorporateEmailRaw = normalizeEmail(data.requestedCorporateEmail);
  const priority = parsePriority(data.priority);
  const status = parseStatus(data.status);
  const message = normalizeText(data.message);
  const feedback = normalizeText(data.feedback);
  const requestedFullName = normalizeText(data.requestedFullName);
  const requestedAgencyNumber = normalizeText(data.requestedAgencyNumber);
  const requestedManagerEmail = normalizeEmail(data.requestedManagerEmail);
  const requestedPosition = parsePosition(data.requestedPosition);
  const requestedCommissionMode = parseCommissionMode(data.requestedCommissionMode);
  const createdUserEmail = normalizeEmail(data.createdUserEmail);
  const createdUserUid = normalizeText(data.createdUserUid);
  const screenshots = normalizeStoredUserRequestScreenshots(data.screenshots)
    .map((item) => toPublicUserRequestScreenshot(item))
    .filter((item): item is PublicUserRequestScreenshot => item != null);

  if (!requesterEmail || !subject || !priority || !status || !message) {
    return null;
  }

  const createdAtMs = toDate(data.createdAt)?.getTime() ?? Date.now();
  const updatedAtMs = toDate(data.updatedAt)?.getTime() ?? createdAtMs;
  const decidedAtMs = toDate(data.decidedAt)?.getTime() ?? null;
  const decidedByEmail = normalizeEmail(data.decidedByEmail) || null;

  return {
    id: docSnap.id,
    requesterEmail,
    subject,
    requestedCorporateEmail: requestedCorporateEmailRaw || null,
    requestedUserDraft:
      subject === "userCreation"
        ? {
            fullName: requestedFullName || null,
            agencyNumber: requestedAgencyNumber || null,
            managerEmail: requestedManagerEmail || null,
            position: requestedPosition,
            commissionMode: requestedCommissionMode,
          }
        : null,
    message,
    priority,
    status,
    feedback: feedback || null,
    createdUserEmail: createdUserEmail || null,
    createdUserUid: createdUserUid || null,
    createdAtMs,
    updatedAtMs,
    decidedAtMs,
    decidedByEmail,
    screenshots,
  };
};

async function parseRequestInput(req: NextRequest): Promise<
  | { value: unknown; screenshotFiles: File[] }
  | { error: string }
> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      value: await req.json().catch(() => null),
      screenshotFiles: [],
    };
  }

  const form = await req.formData().catch(() => null);
  if (!form) return { error: "Neplatný formát požadavku." };
  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") {
    return { error: "Chybí údaje žádosti." };
  }

  let value: unknown = null;
  try {
    value = JSON.parse(payloadRaw);
  } catch {
    return { error: "Údaje žádosti nejsou platné." };
  }

  const screenshotFiles = form
    .getAll("screenshots")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (screenshotFiles.length > USER_REQUEST_SCREENSHOT_MAX_FILES) {
    return {
      error: `K žádosti lze přiložit nejvýše ${USER_REQUEST_SCREENSHOT_MAX_FILES} screenshoty.`,
    };
  }
  return { value, screenshotFiles };
}

async function prepareScreenshots(files: File[]): Promise<
  | { ok: true; screenshots: PreparedUserRequestScreenshot[] }
  | { ok: false; error: string }
> {
  const screenshots: PreparedUserRequestScreenshot[] = [];
  for (const file of files) {
    const prepared = await prepareUserRequestScreenshotFile(file);
    if (!prepared.ok) return prepared;
    screenshots.push(prepared.screenshot);
  }
  return { ok: true, screenshots };
}

async function uploadScreenshots({
  screenshots,
  requestId,
  uploaderEmail,
}: {
  screenshots: PreparedUserRequestScreenshot[];
  requestId: string;
  uploaderEmail: string;
}): Promise<StoredUserRequestScreenshot[]> {
  const uploaded: StoredUserRequestScreenshot[] = [];
  try {
    for (const screenshot of screenshots) {
      uploaded.push(
        await uploadUserRequestScreenshot({ screenshot, requestId, uploaderEmail })
      );
    }
    return uploaded;
  } catch (error) {
    await Promise.allSettled(uploaded.map((item) => deleteUserRequestScreenshot(item)));
    throw error;
  }
}

const cleanupScreenshots = async (screenshots: StoredUserRequestScreenshot[]) => {
  await Promise.allSettled(
    screenshots.map((screenshot) => deleteUserRequestScreenshot(screenshot))
  );
};

function parseCreatePayload(raw: unknown):
  | {
      subject: UserRequestSubject;
      requestedCorporateEmail: string | null;
      requestedUserDraft: UserCreationRequestDraft | null;
      message: string;
      priority: UserRequestPriority;
    }
  | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Neplatný payload." };
  }
  const row = raw as Record<string, unknown>;

  const subject = parseSubject(row.subject);
  if (!subject) {
    return { error: "Vyber předmět žádosti." };
  }

  const priority = parsePriority(row.priority);
  if (!priority) {
    return { error: "Vyber prioritu žádosti." };
  }

  const requestedCorporateEmail = normalizeEmail(row.requestedCorporateEmail);
  if (requestedCorporateEmail.length > USER_REQUEST_CORPORATE_EMAIL_MAX_LEN) {
    return {
      error: `Firemní e-mail může mít maximálně ${USER_REQUEST_CORPORATE_EMAIL_MAX_LEN} znaků.`,
    };
  }
  if (subject === "userCreation") {
    if (!requestedCorporateEmail) {
      return { error: "Pro založení uživatele vyplň firemní e-mail." };
    }
    if (!isValidEmail(requestedCorporateEmail)) {
      return { error: "Firemní e-mail nemá platný formát." };
    }
  } else if (requestedCorporateEmail && !isValidEmail(requestedCorporateEmail)) {
    return { error: "Firemní e-mail nemá platný formát." };
  }

  const requestedFullName = normalizeText(row.requestedFullName);
  if (subject === "userCreation" && !requestedFullName) {
    return { error: "Pro založení uživatele vyplň jméno a příjmení." };
  }
  if (requestedFullName.length > USER_REQUEST_FULL_NAME_MAX_LEN) {
    return {
      error: `Jméno může mít maximálně ${USER_REQUEST_FULL_NAME_MAX_LEN} znaků.`,
    };
  }

  const requestedAgencyNumber = normalizeText(row.requestedAgencyNumber);
  if (requestedAgencyNumber.length > USER_REQUEST_AGENCY_NUMBER_MAX_LEN) {
    return {
      error: `Agenturní číslo může mít maximálně ${USER_REQUEST_AGENCY_NUMBER_MAX_LEN} znaků.`,
    };
  }

  const requestedManagerEmail = normalizeEmail(row.requestedManagerEmail);
  if (subject === "userCreation" && !requestedManagerEmail) {
    return { error: "Pro založení uživatele vyplň e-mail přímého nadřízeného." };
  }
  if (requestedManagerEmail.length > USER_REQUEST_MANAGER_EMAIL_MAX_LEN) {
    return {
      error: `E-mail nadřízeného může mít maximálně ${USER_REQUEST_MANAGER_EMAIL_MAX_LEN} znaků.`,
    };
  }
  if (requestedManagerEmail && !isValidEmail(requestedManagerEmail)) {
    return { error: "E-mail nadřízeného nemá platný formát." };
  }
  if (
    subject === "userCreation" &&
    requestedManagerEmail &&
    requestedManagerEmail === requestedCorporateEmail
  ) {
    return { error: "Nadřízený nemůže být stejný jako nový uživatel." };
  }

  const requestedPosition = parsePosition(row.requestedPosition);
  const requestedCommissionMode = parseCommissionMode(row.requestedCommissionMode);

  const message = normalizeText(row.message);
  if (message.length < USER_REQUEST_MESSAGE_MIN_LEN) {
    return { error: `Popis žádosti musí mít alespoň ${USER_REQUEST_MESSAGE_MIN_LEN} znaků.` };
  }
  if (message.length > USER_REQUEST_MESSAGE_MAX_LEN) {
    return { error: `Popis žádosti může mít maximálně ${USER_REQUEST_MESSAGE_MAX_LEN} znaků.` };
  }

  return {
    subject,
    requestedCorporateEmail: requestedCorporateEmail || null,
    requestedUserDraft:
      subject === "userCreation"
        ? {
            fullName: requestedFullName || null,
            agencyNumber: requestedAgencyNumber || null,
            managerEmail: requestedManagerEmail || null,
            position: requestedPosition,
            commissionMode: requestedCommissionMode,
          }
        : null,
    message,
    priority,
  };
}

function parsePatchPayload(raw: unknown):
  | {
      id: string;
      status: Exclude<UserRequestStatus, "pending">;
      feedback: string | null;
      tempPassword: string;
    }
  | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Neplatný payload." };
  }
  const row = raw as Record<string, unknown>;

  const id = normalizeText(row.id);
  if (!id) return { error: "Chybí id žádosti." };

  const status = parseStatus(row.status);
  if (status !== "accepted" && status !== "rejected" && status !== "needsInfo") {
    return { error: "Stav musí být accepted, rejected nebo needsInfo." };
  }

  const feedbackRaw = normalizeText(row.feedback);
  if (feedbackRaw.length > USER_REQUEST_FEEDBACK_MAX_LEN) {
    return { error: `Zpětná vazba může mít maximálně ${USER_REQUEST_FEEDBACK_MAX_LEN} znaků.` };
  }
  if (status === "needsInfo" && feedbackRaw.length < USER_REQUEST_MESSAGE_MIN_LEN) {
    return {
      error: `Pro vrácení k doplnění zadej zpětnou vazbu (min. ${USER_REQUEST_MESSAGE_MIN_LEN} znaků).`,
    };
  }

  const tempPasswordRaw =
    typeof row.tempPassword === "string" ? row.tempPassword : "";
  if (tempPasswordRaw.length > USER_REQUEST_TEMP_PASSWORD_MAX_LEN) {
    return {
      error: `Dočasné heslo může mít maximálně ${USER_REQUEST_TEMP_PASSWORD_MAX_LEN} znaků.`,
    };
  }

  return {
    id,
    status,
    feedback: feedbackRaw || null,
    tempPassword: tempPasswordRaw,
  };
}

function parseDeletePayload(raw: unknown): { id: string } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Neplatný payload." };
  }
  const row = raw as Record<string, unknown>;
  const id = normalizeText(row.id);
  if (!id) return { error: "Chybí id žádosti." };
  return { id };
}

function parsePutPayload(raw: unknown):
  | {
      id: string;
      subject: UserRequestSubject;
      requestedCorporateEmail: string | null;
      requestedUserDraft: UserCreationRequestDraft | null;
      message: string;
      priority: UserRequestPriority;
    }
  | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Neplatný payload." };
  }

  const row = raw as Record<string, unknown>;
  const id = normalizeText(row.id);
  if (!id) return { error: "Chybí id žádosti." };

  const parsed = parseCreatePayload(row);
  if ("error" in parsed) {
    return parsed;
  }

  return {
    id,
    ...parsed,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-requests:get",
    limit: USER_REQUESTS_GET_LIMIT,
    windowMs: USER_REQUESTS_GET_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const scopeRaw = (req.nextUrl.searchParams.get("scope") ?? "").trim().toLowerCase();
  const canReadAll = scopeRaw === "all" && isAdmin(ctx.email, ctx.decoded as Record<string, unknown>);
  const col = adminDb.collection(USER_REQUESTS_COLLECTION);

  const snap = canReadAll
    ? await col.get()
    : await col.where("requesterEmail", "==", ctx.email).get();

  const requests = snap.docs
    .map((doc) => parseRequestDoc(doc))
    .filter((item): item is UserRequestPayload => item != null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      requests,
    }),
    ctx
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-requests:post",
    limit: USER_REQUESTS_POST_LIMIT,
    windowMs: USER_REQUESTS_POST_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const input = await parseRequestInput(req);
  if ("error" in input) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: input.error }, { status: 400 }),
      ctx
    );
  }
  const parsed = parseCreatePayload(input.value);
  if ("error" in parsed) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: parsed.error }, { status: 400 }),
      ctx
    );
  }

  if (input.screenshotFiles.length > 0 && parsed.subject !== "problem") {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Screenshot lze přiložit pouze k hlášení problému." },
        { status: 400 }
      ),
      ctx
    );
  }
  const prepared = await prepareScreenshots(input.screenshotFiles);
  if (!prepared.ok) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: prepared.error }, { status: 400 }),
      ctx
    );
  }

  const now = new Date();
  const docRef = adminDb.collection(USER_REQUESTS_COLLECTION).doc();
  let screenshots: StoredUserRequestScreenshot[] = [];
  try {
    screenshots = await uploadScreenshots({
      screenshots: prepared.screenshots,
      requestId: docRef.id,
      uploaderEmail: ctx.email,
    });
  } catch (error) {
    console.error("User request screenshot upload failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Screenshoty se nepodařilo bezpečně uložit." },
        { status: 500 }
      ),
      ctx
    );
  }
  const createPayload = {
    requesterEmail: ctx.email,
    subject: parsed.subject,
    requestedCorporateEmail: parsed.requestedCorporateEmail,
    requestedFullName: parsed.requestedUserDraft?.fullName ?? null,
    requestedAgencyNumber: parsed.requestedUserDraft?.agencyNumber ?? null,
    requestedManagerEmail: parsed.requestedUserDraft?.managerEmail ?? null,
    requestedPosition: parsed.requestedUserDraft?.position ?? null,
    requestedCommissionMode: parsed.requestedUserDraft?.commissionMode ?? null,
    message: parsed.message,
    priority: parsed.priority,
    status: "pending" as UserRequestStatus,
    feedback: null,
    createdAt: now,
    updatedAt: now,
    decidedAt: null,
    decidedByEmail: null,
    screenshots,
  };

  try {
    await docRef.set(createPayload);
  } catch (error) {
    await cleanupScreenshots(screenshots);
    console.error("User request create failed after screenshot upload:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Žádost se nepodařilo uložit." },
        { status: 500 }
      ),
      ctx
    );
  }
  const savedSnap = await docRef.get();
  const request = parseRequestDoc(savedSnap);

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      request,
    }),
    ctx
  );
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-requests:patch",
    limit: USER_REQUESTS_PATCH_LIMIT,
    windowMs: USER_REQUESTS_PATCH_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!isAdmin(ctx.email, ctx.decoded as Record<string, unknown>)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nemáš oprávnění měnit stav žádostí." },
        { status: 403 }
      ),
      ctx
    );
  }

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parsePatchPayload(body);
  if ("error" in parsed) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: parsed.error }, { status: 400 }),
      ctx
    );
  }

  const requestRef = adminDb.collection(USER_REQUESTS_COLLECTION).doc(parsed.id);
  const existingSnap = await requestRef.get();
  const existingRequest = parseRequestDoc(existingSnap);
  if (!existingRequest) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Žádost nebyla nalezena." }, { status: 404 }),
      ctx
    );
  }
  if (existingRequest.status !== "pending") {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "O této žádosti už bylo rozhodnuto." },
        { status: 409 }
      ),
      ctx
    );
  }

  let createdUser: { email: string; uid: string } | null = null;
  if (parsed.status === "accepted" && existingRequest.subject === "userCreation") {
    const password = parsed.tempPassword.trim();
    if (password.length < USER_REQUEST_TEMP_PASSWORD_MIN_LEN) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: `Dočasné heslo musí mít alespoň ${USER_REQUEST_TEMP_PASSWORD_MIN_LEN} znaků.`,
          },
          { status: 400 }
        ),
        ctx
      );
    }

    const requestedCorporateEmail = existingRequest.requestedCorporateEmail;
    if (!requestedCorporateEmail || !isValidEmail(requestedCorporateEmail)) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: "Žádost nemá platný firemní e-mail pro založení uživatele.",
          },
          { status: 400 }
        ),
        ctx
      );
    }

    try {
      createdUser = await createUserFromRequest({
        requestId: existingRequest.id,
        requestedCorporateEmail,
        fullName: existingRequest.requestedUserDraft?.fullName ?? null,
        agencyNumber: existingRequest.requestedUserDraft?.agencyNumber ?? null,
        managerEmail: existingRequest.requestedUserDraft?.managerEmail ?? null,
        position: existingRequest.requestedUserDraft?.position ?? null,
        commissionMode: existingRequest.requestedUserDraft?.commissionMode ?? "standard",
        password,
        decidedByEmail: ctx.email,
      });
    } catch (error) {
      const err = error as { status?: number; message?: string };
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: err?.message || "Uživatele se nepodařilo vytvořit.",
          },
          { status: err?.status ?? 500 }
        ),
        ctx
      );
    }
  }

  const now = new Date();

  await adminDb.runTransaction(async (tx) => {
    tx.set(
      requestRef,
      {
        status: parsed.status,
        feedback: parsed.feedback,
        decidedAt: parsed.status === "needsInfo" ? null : now,
        decidedByEmail: parsed.status === "needsInfo" ? null : ctx.email,
        updatedAt: now,
        createdUserEmail:
          parsed.status === "accepted" ? createdUser?.email ?? null : null,
        createdUserUid:
          parsed.status === "accepted" ? createdUser?.uid ?? null : null,
      },
      { merge: true }
    );
  });

  const updatedSnap = await requestRef.get();
  const request = parseRequestDoc(updatedSnap);
  if (!request) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst aktualizovanou žádost." },
        { status: 500 }
      ),
      ctx
    );
  }

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      request,
    }),
    ctx
  );
}

export async function PUT(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-requests:put",
    limit: USER_REQUESTS_PUT_LIMIT,
    windowMs: USER_REQUESTS_PUT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const input = await parseRequestInput(req);
  if ("error" in input) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: input.error }, { status: 400 }),
      ctx
    );
  }
  const parsed = parsePutPayload(input.value);
  if ("error" in parsed) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: parsed.error }, { status: 400 }),
      ctx
    );
  }

  const requestRef = adminDb.collection(USER_REQUESTS_COLLECTION).doc(parsed.id);
  const existingSnap = await requestRef.get();
  const existingRequest = parseRequestDoc(existingSnap);
  if (!existingRequest) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Žádost nebyla nalezena." }, { status: 404 }),
      ctx
    );
  }

  if (existingRequest.requesterEmail !== ctx.email) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nemáš oprávnění upravit tuto žádost." },
        { status: 403 }
      ),
      ctx
    );
  }

  if (existingRequest.status !== "needsInfo") {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: "Upravit lze jen žádost, která je vrácená k doplnění.",
        },
        { status: 409 }
      ),
      ctx
    );
  }

  if (input.screenshotFiles.length > 0 && parsed.subject !== "problem") {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Screenshot lze přiložit pouze k hlášení problému." },
        { status: 400 }
      ),
      ctx
    );
  }

  const existingScreenshots = normalizeStoredUserRequestScreenshots(
    (existingSnap.data() as Record<string, unknown> | undefined)?.screenshots
  );
  const keptScreenshots = parsed.subject === "problem" ? existingScreenshots : [];
  if (
    keptScreenshots.length + input.screenshotFiles.length >
    USER_REQUEST_SCREENSHOT_MAX_FILES
  ) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `K žádosti lze přiložit nejvýše ${USER_REQUEST_SCREENSHOT_MAX_FILES} screenshoty.`,
        },
        { status: 400 }
      ),
      ctx
    );
  }
  const prepared = await prepareScreenshots(input.screenshotFiles);
  if (!prepared.ok) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: prepared.error }, { status: 400 }),
      ctx
    );
  }
  let uploadedScreenshots: StoredUserRequestScreenshot[] = [];
  try {
    uploadedScreenshots = await uploadScreenshots({
      screenshots: prepared.screenshots,
      requestId: parsed.id,
      uploaderEmail: ctx.email,
    });
  } catch (error) {
    console.error("User request screenshot upload failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Screenshoty se nepodařilo bezpečně uložit." },
        { status: 500 }
      ),
      ctx
    );
  }

  const now = new Date();
  try {
    await adminDb.runTransaction(async (tx) => {
      tx.set(
        requestRef,
        {
        subject: parsed.subject,
        requestedCorporateEmail: parsed.requestedCorporateEmail,
        requestedFullName: parsed.requestedUserDraft?.fullName ?? null,
        requestedAgencyNumber: parsed.requestedUserDraft?.agencyNumber ?? null,
        requestedManagerEmail: parsed.requestedUserDraft?.managerEmail ?? null,
        requestedPosition: parsed.requestedUserDraft?.position ?? null,
        requestedCommissionMode: parsed.requestedUserDraft?.commissionMode ?? null,
        message: parsed.message,
        priority: parsed.priority,
        status: "pending" as UserRequestStatus,
        updatedAt: now,
        decidedAt: null,
          decidedByEmail: null,
          screenshots: [...keptScreenshots, ...uploadedScreenshots],
        },
        { merge: true }
      );
    });
  } catch (error) {
    await cleanupScreenshots(uploadedScreenshots);
    console.error("User request update failed after screenshot upload:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Žádost se nepodařilo aktualizovat." },
        { status: 500 }
      ),
      ctx
    );
  }
  if (parsed.subject !== "problem") {
    await cleanupScreenshots(existingScreenshots);
  }

  const updatedSnap = await requestRef.get();
  const request = parseRequestDoc(updatedSnap);
  if (!request) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst aktualizovanou žádost." },
        { status: 500 }
      ),
      ctx
    );
  }

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      request,
    }),
    ctx
  );
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-requests:delete",
    limit: USER_REQUESTS_DELETE_LIMIT,
    windowMs: USER_REQUESTS_DELETE_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parseDeletePayload(body);
  if ("error" in parsed) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: parsed.error }, { status: 400 }),
      ctx
    );
  }

  const requestRef = adminDb.collection(USER_REQUESTS_COLLECTION).doc(parsed.id);
  const snap = await requestRef.get();
  if (!snap.exists) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Žádost nebyla nalezena." }, { status: 404 }),
      ctx
    );
  }
  const row = (snap.data() ?? {}) as Record<string, unknown>;
  const requesterEmail = normalizeEmail(row.requesterEmail);
  const screenshots = normalizeStoredUserRequestScreenshots(row.screenshots);

  const canDelete =
    requesterEmail === ctx.email || isAdmin(ctx.email, ctx.decoded as Record<string, unknown>);
  if (!canDelete) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nemáš oprávnění tuto žádost smazat." },
        { status: 403 }
      ),
      ctx
    );
  }

  await requestRef.delete();
  await cleanupScreenshots(screenshots);

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      id: parsed.id,
    }),
    ctx
  );
}
