import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientNotesFirestore } from "../../../tests/helpers/clientNotesFirestore";
import { createEmptyClientCard } from "@/app/_klienti/clientCardData";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { clientNoteDeepLink, clientNoteReminderAt, normalizeClientNote } from "@/app/_klienti/clientNotes";
import { clientNotePath, clientNoteQueueId } from "./clientNotes";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), collection: vi.fn(), doc: vi.fn(), transaction: vi.fn(), mailbox: vi.fn(),
  getUser: vi.fn(), push: vi.fn(), cleanup: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "timestamp", delete: () => "__delete__" } }));
vi.mock("./firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, doc: mocks.doc, runTransaction: mocks.transaction },
  adminAuth: { getUser: mocks.getUser }, adminMessaging: { sendEachForMulticast: mocks.push },
}));
vi.mock("./apiEntryGuard", () => ({ requireAdvisorAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: NextResponse) => response }));
vi.mock("./mailbox", () => ({ writeMailboxEntryOnce: mocks.mailbox }));
vi.mock("./pushTokens", async importOriginal => ({
  ...await importOriginal<typeof import("./pushTokens")>(), removeInvalidPushTokens: mocks.cleanup,
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/client-cards/[slug]/notes/route";
import { runClientNoteReminders } from "./clientNoteReminders";

const owner = { uid: "owner-uid", email: "advisor@example.test", isImpersonating: false };
const slug = clientSlugForName("Testovací klient")!;
const context = (value = slug) => ({ params: Promise.resolve({ slug: value }) });
const noteId = "note-one";
const notePath = clientNotePath({ ownerUid: owner.uid, slug, noteId });
const queuePath = `clientNoteReminders/${clientNoteQueueId(notePath)}`;
const due = Date.now() + 7 * 86_400_000;
const input = { noteId, expectedRevision: 0, clientName: "Testovací klient", kind: "call", text: "Zavolat kvůli podkladům.", reminderEnabled: true, reminderAtMs: due };
const request = (method = "GET", body?: unknown, query = "") => new NextRequest(`https://bohemka.app/api/client-cards/${slug}/notes${query}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
let store: ReturnType<typeof clientNotesFirestore>;
const create = async (body = input) => {
  const response = await POST(request("POST", body), context());
  expect(response.status).toBe(200);
  return response.json();
};
const run = () => runClientNoteReminders(new Date(due + 1000));

beforeEach(() => {
  vi.resetAllMocks();
  store = clientNotesFirestore();
  mocks.collection.mockImplementation(store.db.collection.bind(store.db));
  mocks.doc.mockImplementation(store.db.doc.bind(store.db));
  mocks.transaction.mockImplementation(store.db.runTransaction.bind(store.db));
  mocks.guard.mockResolvedValue({ ok: true, ctx: owner });
  mocks.getUser.mockResolvedValue({ uid: owner.uid, email: owner.email, disabled: false });
  mocks.mailbox.mockResolvedValue({ written: true });
  mocks.push.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
  mocks.cleanup.mockResolvedValue(1);
  store.records.set(`usersPrivate/${owner.email}`, { fcmTokens: ["token-one"] });
});

describe("private client notes and reminders", () => {
  it.each([401, 403, 429])("enforces the entry guard (%s) on every method", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "rejected" }, { status }) });
    for (const [method, handler] of [["GET", GET], ["POST", POST], ["PATCH", PATCH], ["DELETE", DELETE]] as const) {
      const response = await handler(request(method), context());
      expect(response.status).toBe(status);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
    }
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("rejects impersonation and malformed slugs before reading notes", async () => {
    mocks.guard.mockResolvedValueOnce({ ok: true, ctx: { ...owner, isImpersonating: true } });
    expect((await GET(request(), context())).status).toBe(403);
    expect((await GET(request(), context("../victim"))).status).toBe(404);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("creates a note and its reminder atomically without changing the personal card", async () => {
    const cardPath = `clientCardsPrivate/${owner.uid}/cards/${slug}`;
    const card = { ownerUid: owner.uid, card: createEmptyClientCard("Testovací klient"), revision: 3 };
    store.records.set(cardPath, card);
    const saved = await create();
    expect(saved.note).toMatchObject({ id: noteId, revision: 1, authorEmail: owner.email, kind: "call" });
    expect(store.records.get(queuePath)).toMatchObject({ recipientEmail: owner.email, ownerUid: owner.uid, revision: 1, reminderAtMs: due });
    expect(store.records.get(cardPath)).toEqual(card);
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ allowImpersonation: false }));
    const response = await GET(request(), context());
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect((await response.json()).notes).toEqual([saved.note]);
  });

  it("keeps a retried creation idempotent", async () => {
    await create();
    const writes = store.writes.length;
    expect((await create()).note.revision).toBe(1);
    expect(store.writes).toHaveLength(writes);
  });

  it("isolates reads, linked notes, and writes by the authenticated UID", async () => {
    await create();
    mocks.guard.mockResolvedValue({ ok: true, ctx: { ...owner, uid: "another-uid" } });
    const response = await GET(request("GET", undefined, `?noteId=${noteId}`), context());
    expect(await response.json()).toEqual({ ok: true, notes: [], nextCursor: null, focusedNote: null });
    expect((await DELETE(request("DELETE", { noteId, expectedRevision: 1 }), context())).status).toBe(409);
    expect(store.records.has(notePath)).toBe(true);
  });

  it.each([
    { recipientEmail: "victim@example.test" }, { ownerUid: "victim" }, { kind: "unknown" },
    { text: " " }, { text: "x".repeat(2001) }, { noteId: "../../victim" },
    { reminderAtMs: Date.now() - 1000 }, { expectedRevision: 1 }, { reminderAtMs: "tomorrow" },
  ])("rejects invalid or forged input %j", async patch => {
    const response = await POST(request("POST", { ...input, ...patch }), context());
    expect(response.status).toBe(400);
    expect(store.writes).toHaveLength(0);
  });

  it("bounds streamed JSON and hides persistence errors", async () => {
    expect((await POST(request("POST", { ...input, text: "ě".repeat(16_384) }), context())).status).toBe(413);
    mocks.transaction.mockRejectedValueOnce(new Error("Private text from Firestore"));
    const response = await POST(request("POST", input), context());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("Private text");
  });

  it("reschedules and cancels a reminder without losing the original author/date", async () => {
    const saved = await create();
    const updated = await PATCH(request("PATCH", { ...input, expectedRevision: 1, reminderAtMs: due + 86_400_000, kind: "meeting" }), context());
    expect((await updated.json()).note).toMatchObject({ revision: 2, createdAtMs: saved.note.createdAtMs, authorEmail: owner.email });
    expect(store.records.get(queuePath)?.reminderAtMs).toBe(due + 86_400_000);
    expect((await run()).mailboxWritten).toBe(0);
    expect((await PATCH(request("PATCH", { ...input, expectedRevision: 2, reminderEnabled: false }), context())).status).toBe(200);
    expect(store.records.has(queuePath)).toBe(false);
  });

  it("rejects stale editing and deletion without losing newer notes", async () => {
    await create();
    await PATCH(request("PATCH", { ...input, expectedRevision: 1, text: "Nové informace" }), context());
    expect((await PATCH(request("PATCH", { ...input, expectedRevision: 1 }), context())).status).toBe(409);
    expect((await DELETE(request("DELETE", { noteId, expectedRevision: 1 }), context())).status).toBe(409);
    expect(store.records.get(notePath)?.text).toBe("Nové informace");
  });

  it("deletes the note and cancels its delivery", async () => {
    await create();
    expect((await DELETE(request("DELETE", { noteId, expectedRevision: 1 }), context())).status).toBe(200);
    expect(store.records.has(notePath)).toBe(false);
    expect(store.records.has(queuePath)).toBe(false);
    expect((await run()).mailboxWritten).toBe(0);
  });

  it("paginates history and retrieves an older note directly from its notification", async () => {
    await create();
    const base = store.records.get(notePath)!;
    for (let index = 0; index < 55; index++) {
      store.records.set(notePath.replace(noteId, `older-${index}`), { ...base, createdAtMs: Number(base.createdAtMs) - index - 1 });
    }
    const first = await (await GET(request("GET", undefined, "?noteId=older-54"), context())).json();
    expect(first.notes).toHaveLength(50);
    expect(first.focusedNote.id).toBe("older-54");
    const second = await (await GET(request("GET", undefined, `?before=${first.nextCursor}`), context())).json();
    expect(second.notes).toHaveLength(6);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.notes, ...second.notes].map(note => note.id)).size).toBe(56);
  });

  it("delivers a due reminder once to the adviser and links directly to the client note", async () => {
    await create();
    expect((await run()).mailboxWritten).toBe(1);
    expect(mocks.mailbox).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: owner.email, body: input.text, type: "client_note_reminder", deepLink: clientNoteDeepLink(slug, noteId),
    }));
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ["token-one"], data: expect.objectContaining({ deepLink: clientNoteDeepLink(slug, noteId) }),
    }));
    expect(store.records.get(notePath)).toMatchObject({ reminderEnabled: false, reminderAtMs: null, reminderSentAtMs: due + 1000, revision: 2 });
    await run();
    expect(mocks.mailbox).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("claims each reminder once when two cron runs overlap", async () => {
    await create();
    await Promise.all([run(), run()]);
    expect(mocks.mailbox).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("does not push an already written mailbox reminder on retry", async () => {
    await create();
    mocks.mailbox.mockResolvedValue({ written: false });
    expect((await run()).skippedDuplicate).toBe(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(store.records.has(queuePath)).toBe(false);
  });

  it.each(["disabled", "no-token"])("keeps the inbox reminder when push is %s", async mode => {
    await create();
    store.records.set(`usersPrivate/${owner.email}`, mode === "disabled"
      ? { fcmTokens: ["token-one"], notificationSettings: { channels: { push: false } } } : {});
    expect((await run()).mailboxWritten).toBe(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("cleans permanently invalid device tokens", async () => {
    await create();
    mocks.push.mockResolvedValue({ successCount: 0, failureCount: 1, responses: [{ success: false, error: { code: "messaging/registration-token-not-registered" } }] });
    expect((await run()).cleanedInvalidTokens).toBe(1);
    expect(mocks.cleanup).toHaveBeenCalledWith(owner.email, ["token-one"]);
  });

  it("does not send private notes after account replacement", async () => {
    await create();
    mocks.getUser.mockResolvedValue({ uid: owner.uid, email: "new-address@example.test" });
    expect((await run()).skippedRecipient).toBe(1);
    expect(mocks.mailbox).not.toHaveBeenCalled();
    expect(store.records.get(notePath)?.reminderSentAtMs).toBeNull();
  });

  it("checks cancellation again after claiming and looking up the recipient", async () => {
    await create();
    mocks.getUser.mockImplementationOnce(async () => {
      await DELETE(request("DELETE", { noteId, expectedRevision: 1 }), context());
      return { uid: owner.uid, email: owner.email };
    });
    await run();
    expect(mocks.mailbox).not.toHaveBeenCalled();
    expect(store.records.has(queuePath)).toBe(false);
  });

  it("releases failed delivery for retry without recreating cancelled notes", async () => {
    await create();
    mocks.mailbox.mockRejectedValueOnce(new Error("Temporary failure"));
    expect((await run()).failed).toBe(1);
    expect(store.records.get(queuePath)?.claimId).toBeUndefined();
    expect((await run()).mailboxWritten).toBe(1);
    expect(store.records.has(queuePath)).toBe(false);
  });

  it("does not consume a newly scheduled reminder when an older delivery finishes", async () => {
    await create();
    mocks.mailbox.mockImplementationOnce(async () => {
      await PATCH(request("PATCH", { ...input, expectedRevision: 1, text: "Nový termín", reminderAtMs: due + 86_400_000 }), context());
      return { written: true };
    });
    await run();
    expect(store.records.get(queuePath)).toMatchObject({ revision: 2, reminderAtMs: due + 86_400_000 });
    expect(store.records.get(notePath)).toMatchObject({ reminderEnabled: true, text: "Nový termín" });
  });
});

describe("reminder dates", () => {
  it("uses the existing 07:45 UTC cron in both Czech winter and summer", () => {
    expect(clientNoteReminderAt("2026-01-15")).toBe(Date.parse("2026-01-15T07:45:00Z"));
    expect(clientNoteReminderAt("2026-07-15")).toBe(Date.parse("2026-07-15T07:45:00Z"));
    expect(clientNoteReminderAt("2026-02-30")).toBeNull();
    expect(normalizeClientNote({ ...input, reminderAtMs: 100 }, 101).ok).toBe(false);
  });
});
