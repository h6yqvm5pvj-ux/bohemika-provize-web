import "../../../../../tests/helpers/privateEncryptionTestKey";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { privateFirestore } from "../../../../../tests/helpers/privateFirestore";

const mocks = vi.hoisted(() => ({ db: null as Firestore | null, guard: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; } }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_: string, run: () => unknown) => run(), trackCashflowWrite: (run: () => unknown) => run() }));
vi.mock("@/lib/server/hallOfFameProjection", () => ({ invalidateHallContractChange: vi.fn() }));
vi.mock("@/lib/server/clientContractIndex", () => ({ writeClientContractLink: vi.fn() }));
import { GET, POST, PATCH, DELETE } from "./route";
import { sealPrivateRecord, openPrivateRecord } from "@/lib/server/privateRecords";
import { CONTRACT_NOTE_FAMILY_LIMIT } from "@/lib/server/contractNoteFamily";
import { withContractHistory } from "@/lib/server/contractHistory";
import type { ContractNoteDto } from "./contractNotes";

const owner = "owner@example.test", other = "other@example.test", viewer = "viewer@example.test";
const entryPath = (id: string, ownerEmail = owner) => `users/${ownerEmail}/entries/${id}`;
const notePath = (entryId: string, id: string) => `${entryPath(entryId)}/contractNotes/${id}`;
let store: ReturnType<typeof privateFirestore>;
const asUser = (email: string) => mocks.guard.mockResolvedValue({ ok: true, ctx: { email, actorEmail: email, contractAccessEmails: [], canManageContractsAsAdmin: false }, withRateLimit: (response: NextResponse) => response });
const request = (method: string, data: Record<string, unknown> = {}, entryId = "root", ownerEmail = owner) => new NextRequest(`https://example.test/api/contracts/notes?ownerEmail=${ownerEmail}&entryId=${entryId}`, {
  method, ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerEmail, entryId, ...data }) }),
});
const setEntry = (id: string, data: Record<string, unknown> = {}, ownerEmail = owner) => {
  const path = entryPath(id, ownerEmail);
  store.records.set(path, sealPrivateRecord(path, { userEmail: ownerEmail, productKey: "neon", contractNumber: "TEST-100", entryType: "contract", createdAt: new Date(1000), ...data }));
};
const setNote = (entryId: string, id: string, data: Record<string, unknown> = {}) => {
  const path = notePath(entryId, id);
  store.records.set(path, sealPrivateRecord(path, { ownerEmail: owner, entryId, text: `${entryId} note`, createdAtMs: 2000, ...data }));
};
const notes = async (entryId = "root"): Promise<ContractNoteDto[]> => {
  const response = await GET(request("GET", {}, entryId));
  expect(response.status).toBe(200);
  return (await response.json()).notes;
};
beforeEach(() => {
  vi.clearAllMocks();
  store = privateFirestore(); mocks.db = store.db; asUser(owner);
  setEntry("root", { note: "Root inline note" });
  setEntry("addon", { entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root", note: "Addon inline note" });
  vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
});

describe("one authorized policy note feed", () => {
  it("merges root, linked endorsements and old inline notes without changing reminder storage", async () => {
    setEntry("older-addon", { entryType: "endorsement", parentContractEntryId: "addon" });
    setNote("root", "same-id");
    setNote("addon", "same-id", { reminderEnabled: true, reminderAtMs: 5000, reminderLastSentForAtMs: 5000, reminderSentAtMs: 6000, reminderClaimId: "existing-claim" });
    setNote("older-addon", "older");
    const before = JSON.stringify([...store.records]);
    const rootFeed = await notes();
    const addonFeed = await notes("addon");
    expect(addonFeed).toEqual(rootFeed);
    expect(rootFeed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legacy", sourceEntryId: "root", text: "Root inline note", legacy: true }),
      expect.objectContaining({ id: "legacy", sourceEntryId: "addon", text: "Addon inline note", legacy: true }),
      expect.objectContaining({ id: "same-id", sourceEntryId: "root" }),
      expect.objectContaining({ id: "same-id", sourceEntryId: "addon", reminderEnabled: true, reminderAtMs: 5000, reminderLastSentForAtMs: 5000, reminderSentAtMs: 6000 }),
      expect.objectContaining({ id: "older", sourceEntryId: "older-addon" }),
    ]));
    expect(new Set(rootFeed.map(note => `${note.sourceEntryId}:${note.id}`)).size).toBe(5);
    expect(JSON.stringify([...store.records])).toBe(before);
  });

  it("does not merge a policy merely by number, a different product/owner, disconnected links or cycles", async () => {
    setEntry("unrelated");
    setEntry("wrong-product", { productKey: "flexi", entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root" });
    setEntry("wrong-number", { contractNumber: "TEST-200", entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root" });
    setEntry("disconnected", { entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "missing" });
    setEntry("cycle-a", { entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "cycle-b" });
    setEntry("cycle-b", { entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "cycle-a" });
    setEntry("foreign", { entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root", note: "Foreign private note" }, other);
    for (const id of ["unrelated", "wrong-product", "wrong-number", "disconnected", "cycle-a", "cycle-b"]) setNote(id, "private");
    expect((await notes()).map(note => note.sourceEntryId)).toEqual(["addon", "root"]);
  });

  it("creates a new reminder on the root when an old endorsement URL is used", async () => {
    const response = await POST(request("POST", { text: "New policy note", reminderEnabled: true, reminderAtMs: Date.now() + 60000 }, "addon"));
    expect(response.status).toBe(200);
    const created = (await response.json()).note as ContractNoteDto;
    expect(created.sourceEntryId).toBe("root");
    const stored = store.records.get(notePath("root", created.id))!;
    expect(stored.entryId).toBe("root");
    expect(stored.reminderEnabled).toBe(true);
    expect(stored.reminderRecipientEmail).toBe(owner);
    expect(openPrivateRecord(notePath("root", created.id), stored).text).toBe("New policy note");
    expect(store.records.has(notePath("addon", created.id))).toBe(false);
    expect(JSON.stringify([...store.records])).not.toContain("New policy note");
  });

  it("edits and deletes the exact legacy source when IDs collide", async () => {
    setNote("root", "same-id", { text: "Keep root note" });
    setNote("addon", "same-id", { text: "Edit addon note", reminderEnabled: true, reminderAtMs: Date.now() + 60000 });
    const response = await PATCH(request("PATCH", { sourceEntryId: "addon", noteId: "same-id", text: "Updated addon" }));
    expect(response.status).toBe(200);
    expect((await response.json()).note).toMatchObject({ id: "same-id", sourceEntryId: "addon", text: "Updated addon" });
    expect(openPrivateRecord(notePath("root", "same-id"), store.records.get(notePath("root", "same-id"))!).text).toBe("Keep root note");
    expect((await DELETE(request("DELETE", { sourceEntryId: "addon", noteId: "same-id" }))).status).toBe(200);
    expect(store.records.has(notePath("addon", "same-id"))).toBe(false);
    expect(store.records.has(notePath("root", "same-id"))).toBe(true);
  });

  it("migrates or deletes only the selected inline legacy note", async () => {
    const response = await PATCH(request("PATCH", { sourceEntryId: "addon", noteId: "legacy", text: "Updated inline" }));
    expect(response.status).toBe(200);
    expect((await response.json()).note).toMatchObject({ sourceEntryId: "addon", text: "Updated inline", legacy: false });
    expect(openPrivateRecord(entryPath("root"), store.records.get(entryPath("root"))!).note).toBe("Root inline note");
    expect(openPrivateRecord(entryPath("addon"), store.records.get(entryPath("addon"))!).note).toBe("");
    expect((await DELETE(request("DELETE", { sourceEntryId: "root", noteId: "legacy" }))).status).toBe(200);
    expect((await notes()).filter(note => note.id === "legacy")).toEqual([expect.objectContaining({ sourceEntryId: "addon", text: "Updated inline" })]);
  });

  it("preserves backwards-compatible edits made from an endorsement URL", async () => {
    setNote("addon", "old-note");
    expect((await PATCH(request("PATCH", { noteId: "old-note", text: "Old link update" }, "addon"))).status).toBe(200);
    expect(openPrivateRecord(notePath("addon", "old-note"), store.records.get(notePath("addon", "old-note"))!).text).toBe("Old link update");
  });

  it("keeps the exact linked reminder note beyond both bounded note queries", async () => {
    for (let i = 0; i < 100; i++) {
      setNote("root", `new-${i}`, { createdAtMs: 10000 + i });
      setNote("addon", `recent-${i}`, { createdAtMs: 5000 + i });
    }
    setNote("addon", "linked-old-reminder", { text: "Older reminder", createdAtMs: 1, reminderEnabled: true, reminderAtMs: 5000 });
    expect(await notes()).toHaveLength(100);
    const response = await GET(new NextRequest(`${request("GET").url}&noteId=linked-old-reminder&sourceEntryId=addon`));
    expect(response.status).toBe(200);
    const feed = (await response.json()).notes as ContractNoteDto[];
    expect(feed).toHaveLength(101);
    expect(feed).toContainEqual(expect.objectContaining({ id: "linked-old-reminder", sourceEntryId: "addon", text: "Older reminder", reminderEnabled: true }));
    expect((await GET(new NextRequest(`${request("GET").url}&noteId=linked-old-reminder&sourceEntryId=unrelated`))).status).toBe(404);
    expect((await GET(new NextRequest(`${request("GET").url}&noteId=../bad&sourceEntryId=addon`))).status).toBe(400);
  });

  it("pages through the complete existing source feeds with colliding IDs and timestamps", async () => {
    for (let i = 0; i < 100; i++) {
      setNote("root", `shared-${i}`);
      setNote("addon", `shared-${i}`);
    }
    const all: ContractNoteDto[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await GET(new NextRequest(`${request("GET").url}${cursor ? `&cursor=${cursor}` : ""}`));
      expect(response.status).toBe(200);
      const page = await response.json() as { notes: ContractNoteDto[]; nextCursor: string | null };
      expect(page.notes.length).toBeLessThanOrEqual(100);
      all.push(...page.notes);
      cursor = page.nextCursor;
      pages++;
      expect(pages).toBeLessThanOrEqual(3);
    } while (cursor);
    expect(pages).toBe(3);
    expect(all).toHaveLength(202);
    expect(new Set(all.map(note => `${note.sourceEntryId}:${note.id}`)).size).toBe(202);
  });

  it.each(["", "not a cursor", Buffer.from("null").toString("base64url"),
    Buffer.from(JSON.stringify({ createdAtMs: 1, sourceEntryId: "unrelated", id: "legacy" })).toString("base64url"),
    Buffer.from(JSON.stringify({ createdAtMs: 1, sourceEntryId: "../addon", id: "legacy" })).toString("base64url"),
    Buffer.from(JSON.stringify({ createdAtMs: "2000", sourceEntryId: "addon", id: "legacy" })).toString("base64url"),
  ])("rejects a malformed or out-of-family page cursor: %s", async cursor => {
    expect((await GET(new NextRequest(`${request("GET").url}&cursor=${encodeURIComponent(cursor)}`))).status).toBe(400);
  });

  it("reads and edits transferred endorsement notes at their original encryption path", async () => {
    setNote("addon", "transferred", { text: "Transfer note", reminderEnabled: true, reminderAtMs: Date.now() + 60000 });
    const batch = store.db.batch();
    for (const id of ["root", "addon"]) {
      const source = store.db.doc(entryPath(id));
      const original = store.records.get(source.path)!;
      const transferred = withContractHistory(batch, source, original, { ...original, userEmail: other }, { actorEmail: owner, kind: "transfer", changes: [] });
      batch.set(store.db.doc(entryPath(id, other)), transferred);
      batch.delete(source);
    }
    await batch.commit();
    asUser(other);
    const response = await GET(request("GET", {}, "root", other));
    expect(response.status).toBe(200);
    expect((await response.json()).notes).toContainEqual(expect.objectContaining({ id: "transferred", sourceEntryId: "addon", text: "Transfer note", reminderEnabled: true }));
    expect((await PATCH(request("PATCH", { sourceEntryId: "addon", noteId: "transferred", text: "Transferred edit" }, "root", other))).status).toBe(200);
    expect(openPrivateRecord(notePath("addon", "transferred"), store.records.get(notePath("addon", "transferred"))!).text).toBe("Transferred edit");
    expect(store.records.has(`${entryPath("addon", other)}/contractNotes/transferred`)).toBe(false);
    asUser(owner);
    expect((await GET(request("GET", {}, "root", other))).status).toBe(403);
  });

  it("fails the entire feed when a sibling's storage alias is not authorized", async () => {
    const addon = store.records.get(entryPath("addon"))!;
    store.records.set(entryPath("addon"), { ...addon, contractNotesPath: entryPath("foreign", other) });
    const response = await GET(request("GET"));
    expect(response.status).toBe(409);
    expect((await response.json()).notes).toBeUndefined();
  });

  it("rechecks ownership before returning a feed read during a transfer", async () => {
    const originalDoc = store.db.doc.bind(store.db);
    let removed = false;
    const wrap = (value: unknown): unknown => new Proxy(value as object, {
      get(target, key) {
        const member = Reflect.get(target, key);
        if (key === "get") return async () => {
          const snapshot = await member.call(target);
          if (!removed && Reflect.get(target, "path") === `${entryPath("addon")}/contractNotes`) {
            removed = true;
            store.records.delete(entryPath("addon"));
          }
          return snapshot;
        };
        if (["collection", "doc", "where", "limit", "orderBy"].includes(String(key))) return (...args: unknown[]) => wrap(member.apply(target, args));
        return member;
      },
    });
    vi.spyOn(store.db, "doc").mockImplementation((path: string) => wrap(originalDoc(path)) as ReturnType<Firestore["doc"]>);
    const response = await GET(request("GET"));
    expect(removed).toBe(true);
    expect(response.status).toBe(409);
    expect((await response.json()).notes).toBeUndefined();
  });

  it.each([GET, POST, PATCH, DELETE])("requires authentication for every method", async handler => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const method = handler === GET ? "GET" : handler === POST ? "POST" : handler === PATCH ? "PATCH" : "DELETE";
    const before = JSON.stringify([...store.records]);
    expect((await handler(request(method, { text: "Forged", noteId: "legacy", sourceEntryId: "addon" }))).status).toBe(401);
    expect(JSON.stringify([...store.records])).toBe(before);
  });

  it.each([GET, POST, PATCH, DELETE])("denies another owner's data and modifications", async handler => {
    asUser(other);
    const method = handler === GET ? "GET" : handler === POST ? "POST" : handler === PATCH ? "PATCH" : "DELETE";
    expect((await handler(request(method, { text: "Forged", noteId: "legacy", sourceEntryId: "addon" }))).status).toBe(403);
  });

  it("checks access to every source and denies a read-only snapshot manager writes", async () => {
    setEntry("root", { managerEmailSnapshot: viewer, note: "Readable root" });
    setNote("addon", "private");
    asUser(viewer);
    expect(await notes()).toEqual([expect.objectContaining({ sourceEntryId: "root", text: "Readable root" })]);
    expect((await GET(request("GET", {}, "addon"))).status).toBe(403);
    expect((await POST(request("POST", { text: "Forged", sourceEntryId: "addon", role: "admin", userEmail: owner }))).status).toBe(403);
    expect((await PATCH(request("PATCH", { text: "Forged", noteId: "legacy" }))).status).toBe(403);
    expect((await DELETE(request("DELETE", { noteId: "legacy" }))).status).toBe(403);
  });

  it("preserves server-authorized administrator mutations without trusting client role fields", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: viewer, actorEmail: viewer, contractAccessEmails: [], canManageContractsAsAdmin: true }, withRateLimit: (response: NextResponse) => response });
    expect((await POST(request("POST", { text: "Admin policy note" }, "addon"))).status).toBe(200);
    expect((await PATCH(request("PATCH", { sourceEntryId: "addon", noteId: "legacy", text: "Admin inline edit" }))).status).toBe(200);
    expect((await DELETE(request("DELETE", { sourceEntryId: "addon", noteId: "legacy" }))).status).toBe(200);
    asUser(viewer);
    expect((await POST(request("POST", { text: "Forged", canManageContractsAsAdmin: true, role: "admin" }))).status).toBe(403);
  });

  it.each(["unrelated", "foreign", "missing"])("rejects a source outside the connected family: %s", async sourceEntryId => {
    setEntry("unrelated"); setNote("unrelated", "legacy");
    setEntry("foreign", {}, other);
    const before = JSON.stringify([...store.records]);
    expect((await PATCH(request("PATCH", { sourceEntryId, noteId: "legacy", text: "Forged" }))).status).toBe(404);
    expect((await DELETE(request("DELETE", { sourceEntryId, noteId: "legacy" }))).status).toBe(404);
    expect(JSON.stringify([...store.records])).toBe(before);
  });

  it.each(["../addon", "addon/notes", "x".repeat(161), null, { id: "addon" }])("rejects a manipulated source identity: %j", async sourceEntryId => {
    expect((await PATCH(request("PATCH", { sourceEntryId, noteId: "legacy", text: "Forged" }))).status).toBe(400);
    expect((await DELETE(request("DELETE", { sourceEntryId, noteId: "legacy" }))).status).toBe(400);
  });

  it.each([
    { rootContractEntryId: "../root" },
    { rootContractEntryId: "unrelated", parentContractEntryId: "root" },
    { rootContractEntryId: "root", parentContractEntryId: "missing" },
    { rootContractEntryId: null, parentContractEntryId: "addon" },
  ])("fails closed for an invalid requested endorsement chain: %j", async data => {
    setEntry("unrelated", { contractNumber: "DIFFERENT" });
    setEntry("addon", { entryType: "endorsement", ...data });
    expect((await GET(request("GET", {}, "addon"))).status).toBe(409);
    expect((await POST(request("POST", { text: "Must not write" }, "addon"))).status).toBe(409);
  });

  it("returns an error instead of an incomplete oversized family and writes nothing", async () => {
    for (let i = 0; i < CONTRACT_NOTE_FAMILY_LIMIT; i++) setEntry(`extra-${i}`, { entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root" });
    const before = JSON.stringify([...store.records]);
    expect((await GET(request("GET"))).status).toBe(409);
    expect((await POST(request("POST", { text: "Must not write" }))).status).toBe(409);
    expect(JSON.stringify([...store.records])).toBe(before);
  });
});
