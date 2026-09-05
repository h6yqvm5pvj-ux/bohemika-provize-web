import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import {
  canManageContractOwner,
  hasContractAccess,
} from "../_lib/contractsApi.access";
import type { ContractDoc } from "../_lib/contractsApi.types";
import {
  type ContractNoteDto,
  isSafeContractNoteId,
  normalizeContractNoteMutation,
} from "./contractNotes";

const CONTRACT_NOTES_COLLECTION = "contractNotes";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

type FirestoreTimestamp = {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeEntryId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toMillis = (value: unknown): number | null => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object") {
    const timestamp = value as FirestoreTimestamp;
    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().getTime();
    }
    if (typeof timestamp.seconds === "number") {
      return (
        timestamp.seconds * 1000 +
        Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000)
      );
    }
  }
  return null;
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

const noteDto = (
  id: string,
  data: Record<string, unknown>,
  legacy = false
): ContractNoteDto => {
  const nowMs = Date.now();
  const createdAtMs =
    numberOrNull(data.createdAtMs) ?? toMillis(data.createdAt) ?? nowMs;
  const updatedAtMs =
    numberOrNull(data.updatedAtMs) ?? toMillis(data.updatedAt) ?? createdAtMs;
  return {
    id,
    text: typeof data.text === "string" ? data.text.trim() : "",
    reminderEnabled: data.reminderEnabled === true,
    reminderAtMs: numberOrNull(data.reminderAtMs),
    reminderLastSentForAtMs: numberOrNull(data.reminderLastSentForAtMs),
    reminderSentAtMs: numberOrNull(data.reminderSentAtMs),
    createdAtMs,
    updatedAtMs,
    legacy,
  };
};

const readJsonBody = async (
  req: NextRequest
): Promise<Record<string, unknown> | null> => {
  try {
    const value = (await req.json()) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const authorizeContract = async ({
  req,
  ownerEmail,
  entryId,
  mutation,
}: {
  req: NextRequest;
  ownerEmail: string;
  entryId: string;
  mutation: boolean;
}) => {
  const guard = await requireContractsEntryGuard(req, {
    namespace: mutation ? "api:contracts:notes:write" : "api:contracts:notes:read",
    ...RATE_LIMIT,
  });
  if (!guard.ok) return { ok: false as const, response: guard.response };

  if (!adminDb) {
    return {
      ok: false as const,
      response: guard.withRateLimit(
        NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován." },
          { status: 500 }
        )
      ),
    };
  }
  if (!EMAIL_RE.test(ownerEmail) || !isSafeContractNoteId(entryId)) {
    return {
      ok: false as const,
      response: guard.withRateLimit(
        NextResponse.json(
          { ok: false, error: "Chybí platná identifikace smlouvy." },
          { status: 400 }
        )
      ),
    };
  }

  const contractRef = adminDb
    .collection("users")
    .doc(ownerEmail)
    .collection("entries")
    .doc(entryId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) {
    return {
      ok: false as const,
      response: guard.withRateLimit(
        NextResponse.json(
          { ok: false, error: "Smlouva nebyla nalezena." },
          { status: 404 }
        )
      ),
    };
  }

  const contract = (contractSnap.data() ?? {}) as ContractDoc;
  const canView = hasContractAccess({
    viewerEmail: guard.ctx.email,
    teamEmails: guard.ctx.contractAccessEmails,
    ownerEmail,
    contract,
  });
  const canManage = canManageContractOwner({
    viewerEmail: guard.ctx.email,
    teamEmails: guard.ctx.contractAccessEmails,
    ownerEmail,
    canManageContractsAsAdmin: guard.ctx.canManageContractsAsAdmin,
  });
  if (!(mutation ? canManage : canView)) {
    return {
      ok: false as const,
      response: guard.withRateLimit(
        NextResponse.json(
          { ok: false, error: "Nemáš oprávnění pro poznámky této smlouvy." },
          { status: 403 }
        )
      ),
    };
  }

  return {
    ok: true as const,
    contract,
    contractRef,
    notesRef: contractRef.collection(CONTRACT_NOTES_COLLECTION),
    actorEmail: guard.ctx.email,
    withRateLimit: guard.withRateLimit,
  };
};

export async function GET(req: NextRequest) {
  const ownerEmail = normalizeEmail(req.nextUrl.searchParams.get("ownerEmail"));
  const entryId = normalizeEntryId(req.nextUrl.searchParams.get("entryId"));
  const access = await authorizeContract({ req, ownerEmail, entryId, mutation: false });
  if (!access.ok) return access.response;

  const snapshot = await access.notesRef.orderBy("createdAtMs", "desc").limit(100).get();
  const notes = snapshot.docs
    .map((docSnap) => noteDto(docSnap.id, docSnap.data()))
    .filter((note) => note.text);

  const legacyText =
    typeof access.contract.note === "string" ? access.contract.note.trim() : "";
  if (legacyText && !notes.some((note) => note.id === "legacy")) {
    const legacyCreatedAtMs = toMillis(access.contract.createdAt) ?? Date.now();
    notes.push({
      id: "legacy",
      text: legacyText,
      reminderEnabled: false,
      reminderAtMs: null,
      reminderLastSentForAtMs: null,
      reminderSentAtMs: null,
      createdAtMs: legacyCreatedAtMs,
      updatedAtMs: legacyCreatedAtMs,
      legacy: true,
    });
    notes.sort((left, right) => right.createdAtMs - left.createdAtMs);
  }

  return access.withRateLimit(NextResponse.json({ ok: true, notes }));
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Neplatný JSON payload." },
      { status: 400 }
    );
  }
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const entryId = normalizeEntryId(body.entryId);
  const access = await authorizeContract({ req, ownerEmail, entryId, mutation: true });
  if (!access.ok) return access.response;

  const normalized = normalizeContractNoteMutation(body);
  if (!normalized.ok) {
    return access.withRateLimit(
      NextResponse.json({ ok: false, error: normalized.error }, { status: 400 })
    );
  }

  const nowMs = Date.now();
  const noteRef = access.notesRef.doc();
  const data: Record<string, unknown> = {
    ownerEmail,
    entryId,
    contractNumber:
      typeof access.contract.contractNumber === "string"
        ? access.contract.contractNumber.trim()
        : "",
    clientName:
      typeof access.contract.clientName === "string"
        ? access.contract.clientName.trim()
        : "",
    productKey:
      typeof access.contract.productKey === "string"
        ? access.contract.productKey
        : "",
    text: normalized.value.text,
    reminderEnabled: normalized.value.reminderEnabled,
    reminderAtMs: normalized.value.reminderAtMs,
    ...(normalized.value.reminderEnabled
      ? { reminderRecipientEmail: access.actorEmail }
      : {}),
    createdByEmail: access.actorEmail,
    updatedByEmail: access.actorEmail,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await noteRef.set(data);

  return access.withRateLimit(
    NextResponse.json({ ok: true, note: noteDto(noteRef.id, data) })
  );
}

export async function PATCH(req: NextRequest) {
  const body = await readJsonBody(req);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Neplatný JSON payload." },
      { status: 400 }
    );
  }
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const entryId = normalizeEntryId(body.entryId);
  const noteId = normalizeEntryId(body.noteId);
  const access = await authorizeContract({ req, ownerEmail, entryId, mutation: true });
  if (!access.ok) return access.response;
  if (!isSafeContractNoteId(noteId)) {
    return access.withRateLimit(
      NextResponse.json({ ok: false, error: "Poznámka nebyla nalezena." }, { status: 404 })
    );
  }

  const normalized = normalizeContractNoteMutation(body);
  if (!normalized.ok) {
    return access.withRateLimit(
      NextResponse.json({ ok: false, error: normalized.error }, { status: 400 })
    );
  }

  const noteRef = access.notesRef.doc(noteId);
  const existingSnap = await noteRef.get();
  const legacyText =
    noteId === "legacy" && typeof access.contract.note === "string"
      ? access.contract.note.trim()
      : "";
  if (!existingSnap.exists && !legacyText) {
    return access.withRateLimit(
      NextResponse.json({ ok: false, error: "Poznámka nebyla nalezena." }, { status: 404 })
    );
  }

  const nowMs = Date.now();
  const existingData = (existingSnap.data() ?? {}) as Record<string, unknown>;
  const createdAtMs =
    numberOrNull(existingData.createdAtMs) ??
    toMillis(existingData.createdAt) ??
    toMillis(access.contract.createdAt) ??
    nowMs;
  const updateData: Record<string, unknown> = {
    ownerEmail,
    entryId,
    contractNumber:
      typeof access.contract.contractNumber === "string"
        ? access.contract.contractNumber.trim()
        : "",
    clientName:
      typeof access.contract.clientName === "string"
        ? access.contract.clientName.trim()
        : "",
    productKey:
      typeof access.contract.productKey === "string"
        ? access.contract.productKey
        : "",
    text: normalized.value.text,
    reminderEnabled: normalized.value.reminderEnabled,
    reminderAtMs: normalized.value.reminderAtMs,
    reminderRecipientEmail: normalized.value.reminderEnabled
      ? access.actorEmail
      : FieldValue.delete(),
    reminderLastSentForAtMs: FieldValue.delete(),
    reminderSentAtMs: FieldValue.delete(),
    reminderSentAt: FieldValue.delete(),
    reminderProcessingAtMs: FieldValue.delete(),
    reminderClaimId: FieldValue.delete(),
    reminderLastError: FieldValue.delete(),
    updatedByEmail: access.actorEmail,
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existingSnap.exists
      ? {}
      : {
          createdByEmail: access.actorEmail,
          createdAtMs,
          createdAt: FieldValue.serverTimestamp(),
        }),
  };
  const batch = adminDb!.batch();
  batch.set(noteRef, updateData, { merge: true });
  if (noteId === "legacy") batch.update(access.contractRef, { note: "" });
  await batch.commit();

  return access.withRateLimit(
    NextResponse.json({
      ok: true,
      note: noteDto(noteId, {
        ...existingData,
        ...updateData,
        createdAtMs,
      }),
    })
  );
}

export async function DELETE(req: NextRequest) {
  const body = await readJsonBody(req);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Neplatný JSON payload." },
      { status: 400 }
    );
  }
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const entryId = normalizeEntryId(body.entryId);
  const noteId = normalizeEntryId(body.noteId);
  const access = await authorizeContract({ req, ownerEmail, entryId, mutation: true });
  if (!access.ok) return access.response;
  if (!isSafeContractNoteId(noteId)) {
    return access.withRateLimit(
      NextResponse.json({ ok: false, error: "Poznámka nebyla nalezena." }, { status: 404 })
    );
  }

  const noteRef = access.notesRef.doc(noteId);
  const noteSnap = await noteRef.get();
  const hasLegacy =
    noteId === "legacy" &&
    typeof access.contract.note === "string" &&
    Boolean(access.contract.note.trim());
  if (!noteSnap.exists && !hasLegacy) {
    return access.withRateLimit(
      NextResponse.json({ ok: false, error: "Poznámka nebyla nalezena." }, { status: 404 })
    );
  }

  const batch = adminDb!.batch();
  if (noteSnap.exists) batch.delete(noteRef);
  if (noteId === "legacy") batch.update(access.contractRef, { note: "" });
  await batch.commit();

  return access.withRateLimit(NextResponse.json({ ok: true, deleted: noteId }));
}
