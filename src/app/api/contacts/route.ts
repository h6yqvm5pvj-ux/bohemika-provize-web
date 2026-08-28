import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_DIRECTORY_CONTACTS,
  describeContactDirectoryChange,
  normalizeDirectoryContacts,
  type ContactDirectoryChangeSummary,
} from "@/app/lib/contactDirectory";
import {
  loadAllBroadcastUserEmails,
  sendAdminBroadcastNow,
} from "@/lib/server/adminBroadcastNotifications";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import { canManageToolDocuments } from "@/lib/server/toolDocuments";

export const runtime = "nodejs";

const CONTACT_DIRECTORY_COLLECTION = "appConfig";
const CONTACT_DIRECTORY_DOCUMENT = "contactDirectory";
const CONTACTS_RATE_LIMIT = 120;
const CONTACTS_WRITE_RATE_LIMIT = 30;
const CONTACTS_WINDOW_MS = 60_000;
const CONTACTS_DEEP_LINK = "/?contacts=1&source=contact-notification";
const CONTACTS_MAILBOX_BATCH_SIZE = 400;

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

async function notifyContactDirectoryChange(
  summary: ContactDirectoryChangeSummary,
  req: NextRequest,
  actor: { email: string; uid: string },
) {
  const results = await Promise.allSettled([
    loadAllBroadcastUserEmails().then(async (recipientEmails) => {
      let firstError: unknown = null;
      for (
        let index = 0;
        index < recipientEmails.length;
        index += CONTACTS_MAILBOX_BATCH_SIZE
      ) {
        try {
          await writeMailboxEntries({
            recipientEmails: recipientEmails.slice(
              index,
              index + CONTACTS_MAILBOX_BATCH_SIZE,
            ),
            type: "contact_directory_update",
            title: summary.title,
            body: summary.message,
            deepLink: CONTACTS_DEEP_LINK,
            metadata: {
              changeKind: summary.kind,
              changedCount: summary.changedCount,
              institutionKey: summary.institutionKey,
              contactId: summary.contactId,
              changedByEmail: actor.email,
            },
          });
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError) throw firstError;
    }),
    sendAdminBroadcastNow(
      {
        emoji: "📇",
        title: summary.title,
        message: summary.message,
        targetPath: CONTACTS_DEEP_LINK,
        targetMode: "all",
        recipientEmail: null,
        recipientGroup: null,
        scheduledAtIso: null,
        scheduledAtMs: null,
      },
      { adminEmail: actor.email, adminUid: actor.uid },
      req,
    ),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Notifikace o změně kontaktů selhala:", result.reason);
    }
  });
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
    const previousContacts = await loadStoredContacts();
    const changeSummary = describeContactDirectoryChange(
      previousContacts,
      contacts,
    );
    await adminDb!
      .collection(CONTACT_DIRECTORY_COLLECTION)
      .doc(CONTACT_DIRECTORY_DOCUMENT)
      .set({
        contacts,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByEmail: guard.ctx.email,
      });

    if (changeSummary) {
      await notifyContactDirectoryChange(changeSummary, req, {
        email: guard.ctx.email,
        uid: guard.ctx.uid,
      });
    }

    return response(
      {
        ok: true,
        contacts,
        canManage: true,
        notificationSent: Boolean(changeSummary),
      },
      200,
      guard.ctx,
    );
  } catch (error) {
    console.error("PUT /api/contacts selhalo:", error);
    return response(
      { ok: false, error: "Změny kontaktů se nepodařilo uložit." },
      500,
      guard.ctx,
    );
  }
}
