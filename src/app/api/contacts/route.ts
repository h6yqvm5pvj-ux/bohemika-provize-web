import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_DIRECTORY_CONTACTS,
  normalizeDirectoryContacts,
} from "@/app/lib/contactDirectory";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { canManageToolDocuments } from "@/lib/server/toolDocuments";

export const runtime = "nodejs";

const CONTACT_DIRECTORY_COLLECTION = "appConfig";
const CONTACT_DIRECTORY_DOCUMENT = "contactDirectory";
const CONTACTS_RATE_LIMIT = 120;
const CONTACTS_WRITE_RATE_LIMIT = 30;
const CONTACTS_WINDOW_MS = 60_000;

const response = (
  payload: Record<string, unknown>,
  status: number,
  ctx: Parameters<typeof withRateLimitHeaders>[1],
) => {
  const nextResponse = NextResponse.json(payload, { status });
  nextResponse.headers.set("Cache-Control", "private, no-store, max-age=0");
  return withRateLimitHeaders(nextResponse, ctx);
};

async function loadStoredContacts() {
  const snapshot = await adminDb!
    .collection(CONTACT_DIRECTORY_COLLECTION)
    .doc(CONTACT_DIRECTORY_DOCUMENT)
    .get();
  if (!snapshot.exists) return DEFAULT_DIRECTORY_CONTACTS;

  const normalized = normalizeDirectoryContacts(snapshot.data()?.contacts);
  return normalized ?? DEFAULT_DIRECTORY_CONTACTS;
}

async function canManageContacts(ctx: {
  email: string;
  uid: string;
  decoded: Record<string, unknown>;
}) {
  return canManageToolDocuments(ctx);
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:contacts:get",
    limit: CONTACTS_RATE_LIMIT,
    windowMs: CONTACTS_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  try {
    const [contacts, canManage] = await Promise.all([
      loadStoredContacts(),
      canManageContacts({
        email: guard.ctx.email,
        uid: guard.ctx.uid,
        decoded: guard.ctx.decoded as Record<string, unknown>,
      }),
    ]);

    return response({ ok: true, contacts, canManage }, 200, guard.ctx);
  } catch (error) {
    console.error("GET /api/contacts selhalo:", error);
    return response(
      { ok: false, error: "Kontakty se momentálně nepodařilo načíst." },
      500,
      guard.ctx,
    );
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:contacts:put",
    limit: CONTACTS_WRITE_RATE_LIMIT,
    windowMs: CONTACTS_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  const canManage = await canManageContacts({
    email: guard.ctx.email,
    uid: guard.ctx.uid,
    decoded: guard.ctx.decoded as Record<string, unknown>,
  });
  if (!canManage) {
    return response(
      {
        ok: false,
        error: "Kontakty může upravovat pouze administrátor nebo specialista.",
      },
      403,
      guard.ctx,
    );
  }

  const body = await req.json().catch(() => null);
  const contacts = normalizeDirectoryContacts(
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).contacts
      : null,
  );
  if (!contacts) {
    return response(
      { ok: false, error: "Kontakty obsahují neplatné nebo neúplné údaje." },
      400,
      guard.ctx,
    );
  }

  try {
    await adminDb!
      .collection(CONTACT_DIRECTORY_COLLECTION)
      .doc(CONTACT_DIRECTORY_DOCUMENT)
      .set({
        contacts,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByEmail: guard.ctx.email,
      });

    return response({ ok: true, contacts, canManage: true }, 200, guard.ctx);
  } catch (error) {
    console.error("PUT /api/contacts selhalo:", error);
    return response(
      { ok: false, error: "Změny kontaktů se nepodařilo uložit." },
      500,
      guard.ctx,
    );
  }
}
