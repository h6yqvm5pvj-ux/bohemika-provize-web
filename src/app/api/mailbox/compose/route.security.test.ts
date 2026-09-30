import "../../../../../tests/helpers/privateEncryptionTestKey";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { privateFirestore } from "../../../../../tests/helpers/privateFirestore";

const mocks = vi.hoisted(() => ({
  db: null as Firestore | null,
  guard: vi.fn(),
  setup: vi.fn(),
  push: vi.fn(),
  storage: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return mocks.db; },
  adminMessaging: { sendEachForMulticast: mocks.push },
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard,
  requireAdvisorAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ checkAdvisorSetup: mocks.setup }));
vi.mock("@/lib/server/pushTokens", () => ({ collectPushTokens: () => ["test-device"] }));
vi.mock("@/lib/server/userProfileAvatars", () => ({ loadProfileAvatarsByEmail: async () => ({}) }));
vi.mock("firebase-admin/storage", () => ({ getStorage: mocks.storage }));

import { POST } from "./route";
import { DELETE } from "../route";
import { mailboxConversationId } from "@/lib/server/mailboxConversation";

type Data = Record<string, unknown>;
type Write = { kind: "create" | "set" | "delete"; path: string; data?: Data; merge?: boolean };
const alice = "alice@example.test", bob = "bob@example.test", carol = "carol@example.test";
const key = "123e4567-e89b-42d3-a456-426614174000";
let store: ReturnType<typeof privateFirestore>;
let objects: Map<string, Buffer>;
let beforeCommit: (() => Promise<void>) | undefined;
let loseCommitResponse = false;
const mailboxPath = (email: string, id = key) => `usersPrivate/${email}/mailbox/${id}`;

// Firestore create preconditions reject the whole batch, including earlier writes.
// Stage/check all creates before applying anything; the shared fixture is not atomic.
function atomicBatch() {
  const writes: Write[] = [];
  return {
    create: (ref: { path: string }, data: Data) => writes.push({ kind: "create", path: ref.path, data }),
    set: (ref: { path: string }, data: Data, options?: { merge?: boolean }) => writes.push({ kind: "set", path: ref.path, data, merge: options?.merge }),
    delete: (ref: { path: string }) => writes.push({ kind: "delete", path: ref.path }),
    commit: async () => {
      await beforeCommit?.();
      const existing = new Set(store.records.keys());
      for (const write of writes) {
        if (write.kind === "create" && existing.has(write.path)) {
          throw Object.assign(new Error("ALREADY_EXISTS: private document path"), { code: 6 });
        }
        if (write.kind === "delete") existing.delete(write.path);
        else existing.add(write.path);
      }
      for (const write of writes) {
        if (write.kind === "delete") { store.records.delete(write.path); continue; }
        const data = { ...(write.merge ? store.records.get(write.path) : {}), ...write.data };
        for (const [field, value] of Object.entries(data)) {
          const method = (value as { methodName?: string } | null)?.methodName;
          if (method === "FieldValue.delete") delete data[field];
          if (method === "FieldValue.serverTimestamp") data[field] = new Date();
        }
        store.records.set(write.path, data);
      }
      // A committed RPC can lose its response; the SDK's retry of create then
      // fails with ALREADY_EXISTS even though this attempt's documents exist.
      if (loseCommitResponse) throw Object.assign(new Error("ALREADY_EXISTS after RPC retry"), { code: 6 });
    },
  };
}

function raceTwoCommits() {
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  beforeCommit = async () => { if (++arrived === 2) release(); await barrier; };
}

function request(sender: string, recipients: string[], options: {
  id?: string; text?: string; file?: boolean; groupOnly?: boolean; conversationId?: string; tip?: boolean;
} = {}) {
  const form = new FormData();
  form.set("recipientEmailsJson", JSON.stringify(recipients));
  form.set("subject", "Message subject");
  form.set("text", options.text ?? "Original message");
  if (options.id !== "") form.set("clientRequestId", options.id ?? key);
  if (options.file) form.append("files", new File(["%PDF-1.7\nTest document"], "document.pdf", { type: "application/pdf" }));
  if (options.groupOnly) form.set("createGroupOnly", "true");
  if (options.conversationId) form.set("conversationId", options.conversationId);
  if (options.tip) form.set("metadataJson", JSON.stringify({ tipsterTip: true, tipProduct: "life" }));
  return new NextRequest("https://example.test/api/mailbox/compose", {
    method: "POST", headers: { "x-test-user": sender }, body: form,
  });
}

async function deleteLocalCopy(email: string) {
  const response = await DELETE(new NextRequest("https://example.test/api/mailbox", {
    method: "DELETE", headers: { "x-test-user": email, "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [key] }),
  }));
  expect(response.status).toBe(200);
}

beforeEach(() => {
  vi.clearAllMocks();
  store = privateFirestore(); objects = new Map(); beforeCommit = undefined; loseCommitResponse = false;
  mocks.db = { ...store.db, batch: atomicBatch } as unknown as Firestore;
  for (const email of [alice, bob, carol]) store.records.set(`users/${email}`, { name: email, accountType: "advisor" });
  mocks.guard.mockImplementation(async (req: NextRequest) => {
    const email = req.headers.get("x-test-user")!;
    return { ok: true, ctx: { email, uid: email, actorEmail: email, actorUid: email } };
  });
  mocks.setup.mockResolvedValue({ accountType: "advisor" });
  mocks.push.mockResolvedValue({});
  vi.stubEnv("FIREBASE_STORAGE_BUCKET", "demo.firebasestorage.app");
  mocks.storage.mockReturnValue({ bucket: (name: string) => ({
    name, file: (path: string) => ({
      save: async (bytes: Buffer) => { objects.set(path, bytes); },
      delete: async () => { objects.delete(path); },
    }),
  }) });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("mailbox compose cannot replace an existing message", () => {
  it("blocks a recipient reusing a received ID after deleting their local copy", async () => {
    expect((await POST(request(bob, [alice]))).status).toBe(200);
    await deleteLocalCopy(alice);
    const before = new Map(store.records);
    const pushes = mocks.push.mock.calls.length;
    const response = await POST(request(alice, [bob], { text: "Replacement" }));
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("private document path");
    expect(store.records).toEqual(before);
    expect(mocks.push).toHaveBeenCalledTimes(pushes);
  });

  it("does not recreate a deleted sender copy over a recipient's saved copy", async () => {
    expect((await POST(request(alice, [bob]))).status).toBe(200);
    await deleteLocalCopy(alice);
    const before = new Map(store.records);
    expect((await POST(request(alice, [bob], { text: "Replacement" }))).status).toBe(409);
    expect(store.records).toEqual(before);
  });

  it.each([key, "legacy_retry_key_1234"])("rolls back rejected uploads for accepted ID %s", async id => {
    store.records.set(mailboxPath(bob, id), { type: "direct_message", body: "Preserve", metadata: { attachments: [{ path: "old-file" }] } });
    objects.set("old-file", Buffer.from("original"));
    const before = new Map(store.records);
    expect((await POST(request(alice, [bob], { id, file: true }))).status).toBe(409);
    expect(store.records).toEqual(before);
    expect([...objects.keys()]).toEqual(["old-file"]);
  });

  it("rejects a later group collision atomically, preserving conversations and reminders", async () => {
    store.records.set(mailboxPath(carol), { body: "Private original" });
    const conversationId = "group_test_conversation_1234";
    for (const email of [alice, bob, carol]) store.records.set(`usersPrivate/${email}/mailboxConversations/${conversationId}`, {
      conversationId, participantEmails: [alice, bob, carol], active: true,
      pendingReplyReminderMessageId: "reminder", pendingReplyReminderAtMs: 123,
    });
    store.records.set(mailboxPath(bob, "reminder"), { body: "Reminder", replyReminderAtMs: 123 });
    const before = new Map(store.records);
    expect((await POST(request(alice, [bob, carol], { conversationId, file: true }))).status).toBe(409);
    expect(store.records).toEqual(before);
    expect(objects.size).toBe(0);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves successful delivery and sequential retry (group=%s)", async group => {
    const recipients = group ? [bob, carol] : [bob];
    const first = await POST(request(alice, recipients));
    expect(first.status).toBe(200);
    const payload = await first.json();
    const before = new Map(store.records);
    const second = await POST(request(alice, recipients));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(payload);
    expect(store.records).toEqual(before);
    expect(mocks.push).toHaveBeenCalledTimes(recipients.length);
  });

  it.each([false, true])("replays concurrent identical retries with only the winning attachments (group=%s)", async group => {
    raceTwoCommits();
    const recipients = group ? [bob, carol] : [bob];
    const responses = await Promise.all([POST(request(alice, recipients, { file: true })), POST(request(alice, recipients, { file: true }))]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const payloads = await Promise.all(responses.map(response => response.json()));
    expect(payloads[1]).toEqual(payloads[0]);
    expect(mocks.push).toHaveBeenCalledTimes(recipients.length);
    const saved = store.records.get(mailboxPath(alice))!.metadata as { attachments: { path: string }[] };
    expect([...objects.keys()]).toEqual(saved.attachments.map(attachment => attachment.path));
    expect([...store.records.keys()].filter(path => path.includes("/mailbox/"))).toHaveLength(recipients.length + 1);
  });

  it("allows only one concurrent sender to create the same recipient document", async () => {
    raceTwoCommits();
    const responses = await Promise.all([POST(request(alice, [bob])), POST(request(carol, [bob]))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = responses[0].status === 200 ? alice : carol;
    const loser = winner === alice ? carol : alice;
    expect(store.records.get(mailboxPath(bob))!.metadata).toMatchObject({ senderEmail: winner });
    expect(store.records.has(mailboxPath(loser))).toBe(false);
    expect(store.records.has(`usersPrivate/${loser}/mailboxConversations/${mailboxConversationId(loser, bob)}`)).toBe(false);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it.each([
    { group: false, id: key }, { group: true, id: key },
    { group: false, id: "" }, { group: true, id: "" },
  ])("preserves committed uploads after a lost commit response: %j", async ({ group, id }) => {
    loseCommitResponse = true;
    const response = await POST(request(alice, group ? [bob, carol] : [bob], { id, file: true }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const saved = store.records.get(mailboxPath(alice, payload.senderMailboxId))!.metadata as { attachments: { path: string }[] };
    expect(saved.attachments).toHaveLength(1);
    expect([...objects.keys()]).toEqual(saved.attachments.map(attachment => attachment.path));
    expect(payload.attachmentItems).toHaveLength(1);
  });

  it.each([
    { senderEmail: bob, mailboxDirection: "received", recipientEmail: bob },
    { senderEmail: alice, mailboxDirection: "sent", recipientEmail: bob, groupConversation: true },
    { senderEmail: alice, mailboxDirection: "sent" },
  ])("does not mistake an incompatible sender document for a successful retry: %j", async metadata => {
    store.records.set(mailboxPath(alice), { type: "direct_message", metadata });
    const before = new Map(store.records);
    expect((await POST(request(alice, [bob]))).status).toBe(409);
    expect(store.records).toEqual(before);
  });

  it("keeps group creation retry IDs and rejects reuse for another conversation", async () => {
    const response = await POST(request(alice, [bob, carol], { groupOnly: true }));
    expect(response.status).toBe(200);
    const original = await response.json();
    expect(original.conversationId).toMatch(/^group_/);
    const retry = await POST(request(alice, [bob, carol], { groupOnly: true }));
    expect(await retry.json()).toEqual(original);
    expect(mocks.push).not.toHaveBeenCalled();
    const otherConversation = "group_other_conversation_1234";
    store.records.set(`usersPrivate/${alice}/mailboxConversations/${otherConversation}`, { participantEmails: [alice, bob, carol] });
    expect((await POST(request(alice, [bob, carol], { conversationId: otherConversation }))).status).toBe(409);
  });

  it("preserves tips without a client request ID and paired mailbox references", async () => {
    const response = await POST(request(alice, [bob], { id: "", tip: true }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.senderMailboxId).not.toBe(payload.recipientMailboxId);
    expect(store.records.get(mailboxPath(alice, payload.senderMailboxId))!.metadata).toMatchObject({
      messageId: payload.messageId, pairedMailboxId: payload.recipientMailboxId, tipId: payload.tipId,
    });
    expect(store.records.has(`usersPrivate/${alice}/tipsterTips/${payload.tipId}`)).toBe(true);
  });
});
