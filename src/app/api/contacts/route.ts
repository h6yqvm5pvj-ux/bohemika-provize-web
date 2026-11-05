import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  describeContactDirectoryChange,
  normalizeDirectoryContacts,
  type ContactDirectoryChangeSummary,
  type ContactDirectoryGroup,
} from "@/app/lib/contactDirectory";
import {
  CONTACT_DIRECTORY_REF,
  CONTACT_DIRECTORY_RESTRICTED_REF,
  CONTACT_DIRECTORY_MAX_BYTES,
  CONTACT_DIRECTORY_MAX_GROUPS,
  PILLOW_DEFAULTS_VERSION,
  ContactDirectoryError,
  mergeStoredContactDirectories,
  publicContactDirectoryVersion,
  canViewDirectoryContact,
  contactDirectoryNotificationIsRestricted,
  assertContactGroupExists,
  isContactDirectoryId,
  normalizeContactGroupName,
  normalizeContactMemberUids,
  contactGroupNameKey,
  type LoadedContactDirectory,
} from "@/lib/server/contactDirectory";
import { loadContactDirectoryMembers } from "@/lib/server/contactDirectoryMembers";
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
  nextResponse.headers.set("Vary", "Authorization, Cookie");
  return withRateLimitHeaders(nextResponse, ctx);
};

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
      console.error("CONTACT_DIRECTORY_NOTIFICATION_FAILED");
    }
  });
}

async function directoryPayload(state: LoadedContactDirectory, viewer: { uid: string; canManage: boolean }) {
  const memberDirectory = viewer.canManage && state.groups.some(group => group.memberUids.length > 0)
    ? await loadContactDirectoryMembers() : [];
  const membersByUid = new Map(memberDirectory.map(member => [member.uid, member]));
  const groups: ContactDirectoryGroup[] = state.groups
    .filter(group => viewer.canManage || group.memberUids.includes(viewer.uid))
    .map(group => ({
      id: group.id, name: group.name, memberCount: group.memberUids.length,
      ...(viewer.canManage ? { members: group.memberUids.map(uid => membersByUid.get(uid) ?? {
        uid, name: "Nedostupný účet", email: "",
      }) } : {}),
    }));
  return {
    ok: true,
    contacts: state.contacts.filter(contact => canViewDirectoryContact(contact, state.groups, viewer)),
    groups, canManage: viewer.canManage, revision: state.revision, publicVersion: state.publicVersion,
  };
}

async function readDirectoryBody(req: NextRequest): Promise<Record<string, unknown>> {
  const declared = req.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) throw new ContactDirectoryError(400, "Neplatný požadavek.");
  if (declared !== null && Number(declared) > 512 * 1024) throw new ContactDirectoryError(413, "Požadavek je příliš velký.");
  const reader = req.body?.getReader();
  if (!reader) throw new ContactDirectoryError(400, "Neplatný požadavek.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) {
        await reader.cancel().catch(() => undefined);
        throw new ContactDirectoryError(413, "Požadavek je příliš velký.");
      }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new ContactDirectoryError(400, "Neplatný požadavek."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ContactDirectoryError(400, "Neplatný požadavek.");
    return body as Record<string, unknown>;
  } finally { reader.releaseLock(); }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:contacts:get", limit: CONTACTS_RATE_LIMIT, windowMs: CONTACTS_WINDOW_MS,
  });
  if (!guard.ok) {
    guard.response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return guard.response;
  }
  try {
    const [snapshot, restrictedSnapshot, canManage] = await Promise.all([
      adminDb!.doc(CONTACT_DIRECTORY_REF).get(),
      adminDb!.doc(CONTACT_DIRECTORY_RESTRICTED_REF).get(),
      canManageContacts({ email: guard.ctx.email, uid: guard.ctx.uid, decoded: guard.ctx.decoded as Record<string, unknown> }),
    ]);
    const payload = await directoryPayload(mergeStoredContactDirectories(snapshot, restrictedSnapshot), { uid: guard.ctx.uid, canManage });
    return response(payload, 200, guard.ctx);
  } catch {
    console.error("CONTACT_DIRECTORY_READ_FAILED");
    return response({ ok: false, error: "Kontakty se momentálně nepodařilo načíst." }, 500, guard.ctx);
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:contacts:put", limit: CONTACTS_WRITE_RATE_LIMIT, windowMs: CONTACTS_WINDOW_MS,
    allowImpersonation: false,
  });
  if (!guard.ok) {
    guard.response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return guard.response;
  }
  try {
    if (!await canManageContacts({ email: guard.ctx.email, uid: guard.ctx.uid, decoded: guard.ctx.decoded as Record<string, unknown> })) {
      return response({ ok: false, error: "Kontakty může upravovat pouze administrátor nebo specialista." }, 403, guard.ctx);
    }
    const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType && contentType !== "application/json" && contentType !== "text/plain") {
      return response({ ok: false, error: "Požadavek musí obsahovat JSON." }, 415, guard.ctx);
    }
    const body = await readDirectoryBody(req);
    const isLegacy = body.operation === undefined && Array.isArray(body.contacts);
    if ((!isLegacy || body.revision !== undefined) && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0)) {
      throw new ContactDirectoryError(400, "Obnovte adresář a zkuste změnu znovu.");
    }
    let validMembers: Set<string> | null = null;
    if (body.operation === "saveGroup") {
      validMembers = new Set((await loadContactDirectoryMembers()).map(member => member.uid));
    }
    const ref = adminDb!.doc(CONTACT_DIRECTORY_REF);
    const restrictedRef = adminDb!.doc(CONTACT_DIRECTORY_RESTRICTED_REF);
    const result = await adminDb!.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const restrictedSnapshot = await transaction.get(restrictedRef);
      const previous = mergeStoredContactDirectories(snapshot, restrictedSnapshot);
      if (isLegacy && body.revision === undefined && (restrictedSnapshot.exists || previous.revision > 0 || snapshot.data()?.audienceSchemaVersion === 1)) {
        throw new ContactDirectoryError(409, "Použijte aktuální formulář kontaktu. Obnovte stránku.", "contact-directory/revision-conflict");
      }
      if (body.revision !== undefined && body.revision !== previous.revision) {
        throw new ContactDirectoryError(409, "Adresář se mezitím změnil. Obnovte ho a zkuste změnu znovu.", "contact-directory/revision-conflict");
      }
      if (!isLegacy && body.publicVersion !== previous.publicVersion) {
        throw new ContactDirectoryError(409, "Adresář se mezitím změnil. Obnovte ho a zkuste změnu znovu.", "contact-directory/revision-conflict");
      }
      const next: LoadedContactDirectory = {
        contacts: [...previous.contacts], groups: [...previous.groups], revision: previous.revision + 1,
        publicVersion: previous.publicVersion,
      };
      if (!Number.isSafeInteger(next.revision)) throw new ContactDirectoryError(409, "Adresář nelze aktualizovat.");
      if (body.operation === "saveContact") {
        const raw = body.contact;
        if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Object.prototype.hasOwnProperty.call(raw, "audience")) {
          throw new ContactDirectoryError(400, "Vyberte, pro koho je kontakt určen.");
        }
        const contacts = normalizeDirectoryContacts([raw]);
        if (!contacts) throw new ContactDirectoryError(400, "Kontakt obsahuje neplatné nebo neúplné údaje.");
        const contact = contacts[0];
        assertContactGroupExists(contact, next.groups);
        const index = next.contacts.findIndex(item => item.id === contact.id);
        if (index < 0) next.contacts.push(contact); else next.contacts[index] = contact;
      } else if (body.operation === "deleteContact") {
        if (!isContactDirectoryId(body.contactId)) throw new ContactDirectoryError(400, "Neplatný kontakt.");
        if (!next.contacts.some(contact => contact.id === body.contactId)) throw new ContactDirectoryError(404, "Kontakt nebyl nalezen.");
        next.contacts = next.contacts.filter(contact => contact.id !== body.contactId);
      } else if (body.operation === "saveGroup") {
        const raw = body.group;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ContactDirectoryError(400, "Neplatná skupina.");
        const group = raw as Record<string, unknown>;
        const name = normalizeContactGroupName(group.name);
        const memberUids = normalizeContactMemberUids(group.memberUids);
        if (!name || !memberUids || memberUids.some(uid => !validMembers!.has(uid))) {
          throw new ContactDirectoryError(400, "Vyplňte název skupiny a vyberte existující uživatele.");
        }
        const existing = group.id === undefined ? undefined : next.groups.find(item => item.id === group.id);
        if (group.id !== undefined && (!isContactDirectoryId(group.id) || !existing)) throw new ContactDirectoryError(404, "Skupina nebyla nalezena.");
        if (next.groups.some(item => item.id !== existing?.id && contactGroupNameKey(item.name) === contactGroupNameKey(name))) {
          throw new ContactDirectoryError(400, "Skupina s tímto názvem již existuje.");
        }
        const saved = { id: existing?.id ?? randomUUID(), name, memberUids,
          createdByUid: existing?.createdByUid ?? guard.ctx.uid };
        if (existing) next.groups = next.groups.map(item => item.id === existing.id ? saved : item);
        else next.groups.push(saved);
        if (next.groups.length > CONTACT_DIRECTORY_MAX_GROUPS) throw new ContactDirectoryError(400, "Lze vytvořit nejvýše 30 vlastních skupin.");
      } else if (body.operation === "deleteGroup") {
        if (!isContactDirectoryId(body.groupId)) throw new ContactDirectoryError(400, "Neplatná skupina.");
        if (!next.groups.some(group => group.id === body.groupId)) throw new ContactDirectoryError(404, "Skupina nebyla nalezena.");
        if (next.contacts.some(contact => contact.audience?.type === "group" && contact.audience.groupId === body.groupId)) {
          throw new ContactDirectoryError(409, "Skupina obsahuje kontakty. Nejprve je přesuňte do jiné skupiny.", "contact-directory/group-in-use");
        }
        next.groups = next.groups.filter(group => group.id !== body.groupId);
      } else if (isLegacy) {
        // Older open clients can only replace an entirely unrestricted directory.
        // They cannot drop hidden records, groups, or a newly added restriction.
        const contacts = normalizeDirectoryContacts(body.contacts);
        if (!contacts || previous.groups.length || previous.contacts.some(contact => contact.audience?.type !== "everyone") ||
            contacts.some(contact => contact.audience?.type !== "everyone")) {
          throw new ContactDirectoryError(400, "Použijte aktuální formulář kontaktu. Obnovte stránku.");
        }
        next.contacts = contacts;
      } else throw new ContactDirectoryError(400, "Neplatná změna adresáře.");
      const publicContacts = next.contacts.filter(contact => contact.audience?.type === "everyone");
      const restrictedContacts = next.contacts.filter(contact => contact.audience?.type !== "everyone");
      if (!normalizeDirectoryContacts(publicContacts) || !normalizeDirectoryContacts(restrictedContacts)) {
        throw new ContactDirectoryError(400, "Adresář dosáhl maximální kapacity kontaktů.");
      }
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > CONTACT_DIRECTORY_MAX_BYTES) {
        throw new ContactDirectoryError(400, "Adresář je příliš velký.");
      }
      transaction.set(ref, {
        // Older deployed APIs only read this document. Never place restricted
        // contacts or group membership in their legacy public data source.
        contacts: publicContacts, groups: [], revision: next.revision,
        audienceSchemaVersion: 1, pillowDefaultsVersion: PILLOW_DEFAULTS_VERSION,
        updatedAt: FieldValue.serverTimestamp(), updatedByEmail: guard.ctx.email,
      }, { merge: true });
      transaction.set(restrictedRef, {
        contacts: restrictedContacts, groups: next.groups, revision: next.revision,
        audienceSchemaVersion: 1, pillowDefaultsVersion: PILLOW_DEFAULTS_VERSION,
        updatedAt: FieldValue.serverTimestamp(), updatedByEmail: guard.ctx.email,
      }, { merge: true });
      next.publicVersion = publicContactDirectoryVersion(publicContacts);
      const summary = describeContactDirectoryChange(previous.contacts, next.contacts);
      if (summary && contactDirectoryNotificationIsRestricted(previous.contacts, next.contacts)) {
        summary.message = "Adresář kontaktů byl aktualizován.";
        summary.institutionKey = null;
        summary.contactId = null;
      }
      return { state: next, summary };
    });
    if (result.summary) await notifyContactDirectoryChange(result.summary, req, { email: guard.ctx.email, uid: guard.ctx.uid });
    return response({ ...(await directoryPayload(result.state, { uid: guard.ctx.uid, canManage: true })),
      notificationSent: Boolean(result.summary) }, 200, guard.ctx);
  } catch (error) {
    if (error instanceof ContactDirectoryError) return response({ ok: false, error: error.message,
      ...(error.code ? { code: error.code } : {}) }, error.status, guard.ctx);
    console.error("CONTACT_DIRECTORY_WRITE_FAILED");
    return response({ ok: false, error: "Změny kontaktů se nepodařilo uložit." }, 500, guard.ctx);
  }
}
