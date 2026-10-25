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
import { GET as getAttachment } from "../attachment/route";
import { decryptMailboxJson } from "@/lib/server/mailboxEncryption";
import { PDF_PARSER_REPORT_VERSION } from "@/app/lib/pdfParserReport";
import { DELETE, GET } from "../route";
import { PATCH as updateConversation } from "../conversation/route";
import { mailboxConversationId } from "@/lib/server/mailboxConversation";
import { MAILBOX_SUPPORT_RECIPIENT } from "@/app/posta/mailboxSupport";

type Data = Record<string, unknown>;
type Write = { kind: "create" | "set" | "delete" | "update"; path: string; data?: Data; merge?: boolean; expected?: string };
const alice = "alice@example.test", bob = "bob@example.test", carol = "carol@example.test", dave = "dave@example.test";
const key = "123e4567-e89b-42d3-a456-426614174000";
let store: ReturnType<typeof privateFirestore>;
let objects: Map<string, Buffer>;
let beforeCommit: (() => Promise<void>) | undefined;
let loseCommitResponse = false;
let duringUpload: (() => Promise<void>) | undefined;
let snapshotVersions: WeakMap<object,string>;
const mailboxPath = (email: string, id = key) => `usersPrivate/${email}/mailbox/${id}`;

// Firestore create preconditions reject the whole batch, including earlier writes.
// Stage/check all creates before applying anything; the shared fixture is not atomic.
function atomicBatch() {
  const writes: Write[] = [];
  return {
    get: async (ref: { path: string }) => store.db.doc(ref.path).get(),
    create: (ref: { path: string }, data: Data) => writes.push({ kind: "create", path: ref.path, data }),
    set: (ref: { path: string }, data: Data, options?: { merge?: boolean }) => writes.push({ kind: "set", path: ref.path, data, merge: options?.merge }),
    update: (ref: { path: string }, data: Data, precondition?: {lastUpdateTime:object}) => writes.push({kind:"update",path:ref.path,data,merge:true,expected:precondition ? snapshotVersions.get(precondition.lastUpdateTime) : undefined}),
    delete: (ref: { path: string }) => writes.push({ kind: "delete", path: ref.path }),
    commit: async () => {
      await beforeCommit?.();
      const existing = new Set(store.records.keys());
      for (const write of writes) {
        if (write.kind === "update" && (!existing.has(write.path) || (write.expected !== undefined && JSON.stringify(store.records.get(write.path)) !== write.expected))) {
          throw Object.assign(new Error("FAILED_PRECONDITION: document changed"), {code:9});
        }
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
  store = privateFirestore(); objects = new Map(); beforeCommit = undefined; loseCommitResponse = false; duringUpload = undefined; snapshotVersions = new WeakMap();
  const wrapRef = (ref: ReturnType<Firestore["doc"]>): ReturnType<Firestore["doc"]> => Object.assign(Object.create(ref),{
    get:async()=>{
      const snapshot=await ref.get();
      snapshotVersions.set(snapshot.updateTime!,JSON.stringify(snapshot.data()));
      return snapshot;
    },
    collection:(name:string)=>wrapCollection(ref.collection(name)),
  });
  const wrapCollection = (ref: ReturnType<Firestore["collection"]>): ReturnType<Firestore["collection"]> => Object.assign(Object.create(ref),{
    doc:(id?:string)=>wrapRef(id ? ref.doc(id) : ref.doc()),
  });
  mocks.db = { ...store.db, batch: atomicBatch,
    doc:(path:string)=>wrapRef(store.db.doc(path)),collection:(name:string)=>wrapCollection(store.db.collection(name)),
    runTransaction: async (work: (tx: ReturnType<typeof atomicBatch>) => Promise<unknown>) => {
      // Model Firestore's read-version preconditions and callback retry. Writes
      // remain staged until every read is still current at the commit boundary.
      for (let attempt=0; attempt<5; attempt++) {
        const reads = new Map<string,string | undefined>();
        const tx = atomicBatch();
        tx.get = async ref => {
          const snapshot = await store.db.doc(ref.path).get();
          const data = snapshot.data();
          reads.set(ref.path,JSON.stringify(data));
          return Object.assign(Object.create(snapshot),{data:()=>data});
        };
        const result = await work(tx);
        await beforeCommit?.();
        if ([...reads].some(([path,data])=>JSON.stringify(store.records.get(path))!==data)) continue;
        await tx.commit();
        return result;
      }
      throw new Error("Transaction retries exhausted");
    },
  } as unknown as Firestore;
  for (const email of [alice, bob, carol, dave]) store.records.set(`users/${email}`, { name: email, accountType: "advisor" });
  mocks.guard.mockImplementation(async (req: NextRequest) => {
    const email = req.headers.get("x-test-user")!;
    return { ok: true, ctx: { email, uid: email, actorEmail: email, actorUid: email } };
  });
  mocks.setup.mockResolvedValue({ accountType: "advisor" });
  mocks.push.mockResolvedValue({});
  vi.stubEnv("FIREBASE_STORAGE_BUCKET", "demo.firebasestorage.app");
  mocks.storage.mockReturnValue({ bucket: (name: string) => ({
    name, file: (path: string) => ({
      save: async (bytes: Buffer) => { objects.set(path, bytes); await duringUpload?.(); },
      delete: async () => { objects.delete(path); },
      download: async () => {
        if (!objects.has(path)) throw Object.assign(new Error("Missing synthetic object"), { code: 404 });
        return [objects.get(path)];
      },
    }),
  }) });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("private support conversations", () => {
  const support = MAILBOX_SUPPORT_RECIPIENT.email;
  beforeEach(() => { store.records.set(`users/${support}`, { name: "Support operator", accountType: "advisor" }); });

  it("delivers separate encrypted conversations and replies through the existing mailbox flow", async () => {
    const first = await POST(request(alice, [support], { text: "Alice support question", conversationId: mailboxConversationId(alice, bob) }));
    expect(first.status).toBe(200);
    const aliceThread = (await first.json()).conversationId;
    expect(aliceThread).toBe(mailboxConversationId(alice, support));
    const secondKey = "123e4567-e89b-42d3-a456-426614174001";
    const second = await POST(request(bob, [support], { id: secondKey, text: "Bob support question" }));
    expect(second.status).toBe(200);
    expect((await second.json()).conversationId).not.toBe(aliceThread);
    const received = store.records.get(mailboxPath(support))!;
    expect(received.encryptedContent).toBeTruthy();
    expect(JSON.stringify(received)).not.toContain("Alice support question");
    const otherUser = await GET(new NextRequest(`https://example.test/api/mailbox?conversationId=${aliceThread}&includeUnreadCount=0`, { headers: { "x-test-user": bob } }));
    expect(otherUser.status).toBe(200);
    expect((await otherUser.json()).items).toEqual([]);
    const replyKey = "123e4567-e89b-42d3-a456-426614174002";
    const reply = await POST(request(support, [alice], { id: replyKey, text: "Support reply" }));
    expect(reply.status).toBe(200);
    expect((await reply.json()).conversationId).toBe(aliceThread);
    expect(store.records.has(mailboxPath(alice, replyKey))).toBe(true);
    expect(store.records.has(mailboxPath(bob, replyKey))).toBe(false);
  });

  it.each([401, 403])("retains authentication and authorization rejection %s before sending to support", async status => {
    const before = new Map(store.records);
    mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await POST(request(alice, [support]))).status).toBe(status);
    expect(store.records).toEqual(before);
  });

  it("keeps tipster direct-chat restrictions in place", async () => {
    mocks.setup.mockResolvedValueOnce({ accountType: "tipster", profile: { tipRecipientEmail: support } });
    const before = new Map(store.records);
    expect((await POST(request(alice, [support]))).status).toBe(403);
    expect(store.records).toEqual(before);
  });
});

describe("automatic PDF parser reports", () => {
  const support = MAILBOX_SUPPORT_RECIPIENT.email;
  const pdfBytes = "%PDF-1.7\nSynthetic private PDF body";
  const diagnostic = { product: "flexi", parserVersion: PDF_PARSER_REPORT_VERSION, extraction: "native", missingFields: ["amount"] };
  beforeEach(() => { store.records.set(`users/${support}`, { name: "Support operator", accountType: "advisor" }); });

  function reportRequest(sender = alice, report: unknown = diagnostic, files = [new File([pdfBytes], "private-client-name.pdf", { type: "application/pdf" })]) {
    const form = new FormData();
    form.set("parserReportJson", JSON.stringify(report));
    // Manipulated routing and content must not influence a diagnostic delivery.
    form.set("recipientEmail", bob);
    form.set("subject", "Injected subject");
    form.set("text", "Injected sensitive value");
    form.set("conversationId", "group_manipulated_123456");
    form.set("createGroupOnly", "true");
    form.set("metadataJson", JSON.stringify({ tipsterTip: true, senderEmail: carol }));
    form.set("clientRequestId", key);
    files.forEach(file => form.append("files", file));
    return new NextRequest("https://example.test/api/mailbox/compose", { method: "POST", headers: { "x-test-user": sender }, body: form });
  }

  it("fixes recipient, sender, thread and message on the server and encrypts the PDF", async () => {
    const response = await POST(reportRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.conversationId).toBe(mailboxConversationId(alice, support));
    expect(payload.recipientEmail).toBe(support);
    const saved = store.records.get(mailboxPath(support, payload.messageId))!;
    const raw = JSON.stringify(saved);
    expect(raw).not.toContain("private-client-name");
    expect(raw).not.toContain("Injected sensitive value");
    expect([...objects.values()][0].toString()).not.toContain(pdfBytes);
    const content = decryptMailboxJson<{ subject: string; messageText: string }>(saved.encryptedContent, `message:${payload.messageId}`);
    expect(content.messageText).toContain("Pojistné / příspěvek");
    expect(content.messageText).not.toContain("Injected");
    expect([...store.records.keys()].filter(path => path.includes("/mailbox/"))).toHaveLength(2);

    const attachmentUrl = new URL(payload.attachmentItems[0].url, "https://example.test");
    const adminDownload = await getAttachment(new NextRequest(attachmentUrl, { headers: { "x-test-user": support } }));
    expect(adminDownload.status).toBe(200);
    expect(await adminDownload.text()).toBe(pdfBytes);
    expect(adminDownload.headers.get("cache-control")).toContain("no-store");
    expect((await getAttachment(new NextRequest(attachmentUrl, { headers: { "x-test-user": bob } }))).status).toBe(404);
    expect((await getAttachment(new NextRequest(attachmentUrl, { headers: { "x-test-user": alice } }))).status).toBe(200);
  });

  it("deduplicates repeated PDF contents across renamed files and reordered fields", async () => {
    const first = await (await POST(reportRequest(alice, { ...diagnostic, missingFields: ["amount", "frequency"] }))).json();
    const second = await (await POST(reportRequest(alice, { ...diagnostic, missingFields: ["frequency", "amount", "amount"] }, [new File([pdfBytes], "renamed.pdf")]))).json();
    expect(first.messageId).toBe(second.messageId);
    expect(objects.size).toBe(1);
    expect([...store.records.keys()].filter(path => path.includes("/mailbox/"))).toHaveLength(2);
    expect(mocks.push).toHaveBeenCalledOnce();
  });

  it("keeps reports by different users separate even for identical PDF bytes", async () => {
    const first = await (await POST(reportRequest(alice))).json();
    const second = await (await POST(reportRequest(bob))).json();
    expect(first.messageId).not.toBe(second.messageId);
    expect(first.conversationId).not.toBe(second.conversationId);
    expect(objects.size).toBe(2);
  });

  it("deduplicates concurrent deliveries without deleting the winning encrypted attachment", async () => {
    raceTwoCommits();
    const results = await Promise.all([POST(reportRequest()), POST(reportRequest())]);
    expect(results.map(response => response.status)).toEqual([200, 200]);
    expect(objects.size).toBe(1);
    expect([...store.records.keys()].filter(path => path.includes("/mailbox/"))).toHaveLength(2);
  });

  it("records the support owner's own upload once without enabling ordinary self messages", async () => {
    const first = await POST(reportRequest(support));
    expect(first.status).toBe(200);
    const payload = await first.json();
    expect((await POST(reportRequest(support))).status).toBe(200);
    const messages = [...store.records.entries()].filter(([path]) => path.includes("/mailbox/"));
    expect(messages).toHaveLength(1);
    expect(messages[0][1].metadata).toMatchObject({ mailboxDirection: "received", senderEmail: support });
    expect(payload.senderMailboxId).toBe(payload.recipientMailboxId);
    expect((await POST(request(support, [support]))).status).toBe(400);
  });

  it.each([401, 403, 429])("preserves authentication, authorization and rate-limit rejection %s", async status => {
    const before = new Map(store.records);
    mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await POST(reportRequest())).status).toBe(status);
    expect(store.records).toEqual(before);
    expect(objects.size).toBe(0);
  });

  it("rejects tipsters and impersonated report senders without storing data", async () => {
    mocks.setup.mockResolvedValueOnce({ accountType: "tipster", profile: { tipRecipientEmail: support } });
    expect((await POST(reportRequest())).status).toBe(403);
    mocks.guard.mockResolvedValueOnce({ ok: true, ctx: { email: alice, uid: alice, isImpersonating: true } });
    expect((await POST(reportRequest())).status).toBe(403);
    expect(objects.size).toBe(0);
  });

  it.each([
    { ...diagnostic, extraction: "ocr" }, { ...diagnostic, missingFields: ["constructor"] },
    { ...diagnostic, missingFields: [] }, { ...diagnostic, product: "unknown" },
  ])("rejects malformed or OCR diagnostics %j", async report => {
    expect((await POST(reportRequest(alice, report))).status).toBe(400);
    expect(objects.size).toBe(0);
  });

  it.each([
    { files: [] }, { files: [new File(["<script>synthetic</script>"], "fake.pdf", { type: "application/pdf" })] },
    { files: [new File(["%PDF-1.7"], "a.pdf"), new File(["%PDF-1.7"], "b.pdf")] },
  ])("rejects missing, spoofed or multiple PDF attachments", async ({ files }) => {
    expect((await POST(reportRequest(alice, diagnostic, files))).status).toBe(400);
    expect(objects.size).toBe(0);
  });

  it("returns and logs a generic diagnostic failure without leaking storage errors", async () => {
    duringUpload = async () => { throw new Error("Synthetic private storage detail"); };
    const response = await POST(reportRequest());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Synthetic private storage detail");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Synthetic private storage detail");
  });
});

describe("mailbox compose cannot replace an existing message", () => {
  const conversationId = "group_revocation_test_1234";
  const conversationPath = (email: string) => `usersPrivate/${email}/mailboxConversations/${conversationId}`;
  const seedGroup = () => {
    const participantEmails=[bob,alice,carol,dave];
    for (const email of participantEmails) store.records.set(conversationPath(email),{
      conversationId,groupConversation:true,groupName:"Private group",groupOwnerEmail:bob,
      participants:participantEmails.map(email=>({email,name:email})),participantEmails,active:true,
    });
  };
  const removeMember = (email: string) => updateConversation(new NextRequest("https://example.test/api/mailbox/conversation", {
    method:"PATCH",headers:{"x-test-user":bob,"content-type":"application/json"},
    body:JSON.stringify({conversationId,action:"remove",email}),
  }));
  it.each([alice,dave])("rejects an in-flight send after %s is removed during upload",async removed => {
    seedGroup();
    duringUpload=async()=>{duringUpload=undefined;expect((await removeMember(removed)).status).toBe(200);};
    const response=await POST(request(alice,[bob,carol,dave],{conversationId,file:true}));
    expect(response.status).toBe(400);
    expect(store.records.get(conversationPath(removed))?.active).toBe(false);
    expect([...store.records.keys()].some(path=>path.includes("/mailbox/"))).toBe(false);
    expect(objects.size).toBe(0);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("rechecks membership on a transaction conflict at the commit boundary",async()=>{
    seedGroup();
    beforeCommit=async()=>{beforeCommit=undefined;expect((await removeMember(alice)).status).toBe(200);};
    const response=await POST(request(alice,[bob,carol,dave],{conversationId,file:true}));
    expect(response.status).toBe(400);
    expect(store.records.get(conversationPath(alice))?.active).toBe(false);
    expect(objects.size).toBe(0);
    expect([...store.records.keys()].some(path=>path.includes("/mailbox/"))).toBe(false);
  });
  it("preserves membership, names and preferences on an authorized group send",async()=>{
    seedGroup();
    for(const email of [alice,bob,carol,dave]) store.records.set(conversationPath(email),{...store.records.get(conversationPath(email)),muted:true});
    const response=await POST(request(alice,[bob,carol,dave],{conversationId,file:true}));
    expect(response.status).toBe(200);
    for(const email of [alice,bob,carol,dave]) expect(store.records.get(conversationPath(email))).toMatchObject({
      active:true,muted:true,groupName:"Private group",groupOwnerEmail:bob,participantEmails:[bob,alice,carol,dave],
    });
    expect(objects.size).toBe(1);
  });
  it.each(["rename","add"])("rejects a stale owner %s after concurrent member removal",async action=>{
    seedGroup();
    const extra="extra@example.test";
    store.records.set(`users/${extra}`,{name:"New member",accountType:"advisor"});
    beforeCommit=async()=>{beforeCommit=undefined;expect((await removeMember(alice)).status).toBe(200);};
    const response=await updateConversation(new NextRequest("https://example.test/api/mailbox/conversation",{
      method:"PATCH",headers:{"x-test-user":bob,"content-type":"application/json"},
      body:JSON.stringify({conversationId,action,email:extra,groupName:"Renamed"}),
    }));
    expect(response.status).toBe(409);
    expect(store.records.get(conversationPath(alice))?.active).toBe(false);
    expect(store.records.get(conversationPath(bob))?.participantEmails).not.toContain(alice);
    expect(store.records.has(conversationPath(extra))).toBe(false);
  });
  it("does not allow an ordinary member to manage the group",async()=>{
    seedGroup();const before=new Map(store.records);
    const response=await updateConversation(new NextRequest("https://example.test/api/mailbox/conversation",{
      method:"PATCH",headers:{"x-test-user":alice,"content-type":"application/json"},
      body:JSON.stringify({conversationId,action:"remove",email:dave}),
    }));
    expect(response.status).toBe(403);expect(store.records).toEqual(before);
  });
  it("rejects a manipulated group participant set",async()=>{
    seedGroup();const before=new Map(store.records);
    const response=await POST(request(alice,[bob,carol],{conversationId}));
    expect(response.status).toBe(400);expect(store.records).toEqual(before);
  });
  it.each([401,403])("preserves guard rejection %s before any group access",async status=>{
    seedGroup();const before=new Map(store.records);
    mocks.guard.mockResolvedValueOnce({ok:false,response:NextResponse.json({ok:false},{status})});
    expect((await POST(request(alice,[bob,carol,dave],{conversationId}))).status).toBe(status);
    expect(store.records).toEqual(before);expect(objects.size).toBe(0);
  });
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
