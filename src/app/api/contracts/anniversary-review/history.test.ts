import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendReviewHistory, readReviewHistory, reviewDto, type ReviewMutation } from "./history";

type Data = Record<string, unknown>;
type Snapshot = { id: string | undefined; exists: boolean; data: () => Data | undefined };
type Query = { where: (field: string, operator: string, value: number) => Query; limit: (value: number) => Query; get: () => Promise<{ docs: Snapshot[] }> };
type Ref = { path: string; doc: (id: string) => Ref; collection: (id: string) => Ref; get: () => Promise<Snapshot>; orderBy: () => Query };
type Transaction = { get: (ref: Ref) => Promise<Snapshot>; set: (ref: Ref, data: Data, options?: { merge: boolean }) => unknown };
function memoryDatabase() {
  const docs = new Map<string, Data>();
  const snapshot = (path: string) => ({ id: path.split("/").at(-1), exists: docs.has(path), data: () => docs.get(path) });
  let failCommit = false;
  let queue = Promise.resolve();
  const ref = (path: string): Ref => ({
    path, doc: (id: string) => ref(`${path}/${id}`), collection: (id: string) => ref(`${path}/${id}`),
    get: async () => snapshot(path),
    orderBy: () => {
      let before = Infinity; let limit = Infinity;
      const query = {
        where: (_field: string, _operator: string, value: number) => { before = value; return query; },
        limit: (value: number) => { limit = value; return query; },
        get: async () => ({ docs: [...docs.entries()].filter(([key, data]) => key.startsWith(`${path}/`) && Number(data.sequence) < before)
          .sort((a, b) => Number(b[1].sequence) - Number(a[1].sequence)).slice(0, limit).map(([key]) => snapshot(key)) }),
      };
      return query;
    },
  });
  const db = {
    collection: (name: string) => ref(name),
    runTransaction: <T>(callback: (tx: Transaction) => Promise<T>) => {
      // Serialize test transactions and stage writes, as Firestore's retries do.
      const result = queue.then(async () => {
        const writes: Array<{ path: string; data: Data; merge?: boolean }> = [];
        const value = await callback({
          get: async (reference: { path: string }) => { expect(writes).toHaveLength(0); return snapshot(reference.path); },
          set: (reference: { path: string }, data: Data, options?: { merge: boolean }) => writes.push({ path: reference.path, data, merge: options?.merge }),
        });
        if (failCommit) throw new Error("commit failed");
        for (const write of writes) docs.set(write.path, { ...(write.merge ? docs.get(write.path) : {}), ...write.data });
        return value;
      });
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  } as unknown as Firestore;
  docs.set("users/own@example.test/entries/contract-1", { entryType: "contract" });
  return { db, docs, failNextCommit: () => { failCommit = true; } };
}

const mutation = (overrides: Partial<ReviewMutation> = {}): ReviewMutation => ({
  action: "mark", ownerEmail: "own@example.test", entryId: "contract-1", occurrenceKey: "2026-09-10",
  contractNumber: "123", contactOutcome: "no_answer", note: "Zkusit později", requestId: "request-00000001", ...overrides,
});
const reviewPath = "anniversaryReviews/own@example.test__contract-1";
const workflowMutation = (action: "complete" | "reopen", requestId = `request-${action}-0001`, extra: Partial<ReviewMutation> = {}) => mutation({
  action, requestId, contactOutcome: undefined, note: undefined, meetingAt: undefined, ...extra,
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-07T09:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("persistent anniversary contact history", () => {
  it.each(["reached", "no_answer", "meeting", "ignore"] as const)("keeps %s in progress until explicitly completed", async contactOutcome => {
    const { db } = memoryDatabase();
    const result = await appendReviewHistory(db, mutation({ contactOutcome }), "advisor@example.test");
    expect(result).toMatchObject({ processingStatus: "in_progress", completedAtMs: null, completedBy: null });
  });

  it("completes and reopens without losing the latest contact, meeting or note", async () => {
    const { db, docs } = memoryDatabase();
    const original = { contactOutcome: "meeting" as const, note: "Klient souhlasí s návrhem", meetingAt: "2026-09-15T14:00" };
    await appendReviewHistory(db, mutation(original), "advisor@example.test");
    const completed = await appendReviewHistory(db, workflowMutation("complete"), "manager@example.test");
    expect(completed).toMatchObject({ ...original, processingStatus: "completed", completedBy: "manager@example.test", completedAtMs: Date.now(), historyCount: 2 });
    expect(reviewDto(docs.get(reviewPath)!)).toMatchObject({ processingStatus: "completed", completedBy: "manager@example.test" });
    const reopened = await appendReviewHistory(db, workflowMutation("reopen"), "advisor@example.test");
    expect(reopened).toMatchObject({ ...original, processingStatus: "in_progress", completedBy: null, completedAtMs: null, historyCount: 3 });
    const events = (await readReviewHistory(db, "own@example.test", "contract-1", null)).history;
    expect(events.map(event => event.kind)).toEqual(["reopened", "completed", "contact"]);
    expect(events[1]).toMatchObject({ actorEmail: "manager@example.test", createdAtMs: Date.now(), note: null });
  });

  it("supports completion without a call and keeps the reopened case in progress", async () => {
    const { db } = memoryDatabase();
    expect(await appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test")).toMatchObject({ processingStatus: "completed", contactOutcome: null, note: null });
    expect(await appendReviewHistory(db, workflowMutation("reopen"), "advisor@example.test")).toMatchObject({ processingStatus: "in_progress", contactOutcome: null, note: null });
  });

  it("keeps supplementary notes on completed cases and rejects contacts until reopening", async () => {
    const { db } = memoryDatabase();
    await appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test");
    const updated = await appendReviewHistory(db, mutation({ action: "save", contactOutcome: undefined, note: "Potvrzení odesláno" }), "advisor@example.test");
    expect(updated).toMatchObject({ processingStatus: "completed", note: "Potvrzení odesláno" });
    await expect(appendReviewHistory(db, mutation({ requestId: "new-contact-0001" }), "advisor@example.test")).rejects.toMatchObject({ status: 409 });
    await expect(appendReviewHistory(db, mutation({ action: "clearOutcome", contactOutcome: undefined, requestId: "clear-outcome-0001" }), "advisor@example.test")).rejects.toMatchObject({ status: 409 });
  });

  it("resets completion when a new anniversary starts and never completes legacy contacts", async () => {
    const { db } = memoryDatabase();
    expect(reviewDto({ contactOutcome: "meeting", reviewedAt: new Date() }).processingStatus).toBeNull();
    await appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test");
    const nextYear = await appendReviewHistory(db, mutation({ occurrenceKey: "2027-09-10" }), "advisor@example.test");
    expect(nextYear).toMatchObject({ occurrenceKey: "2027-09-10", processingStatus: "in_progress", completedAtMs: null, completedBy: null });
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history.map(event => event.kind)).toEqual(["contact", "completed"]);
  });

  it("deduplicates completion and reopening retries without applying stale completion again", async () => {
    const { db } = memoryDatabase();
    await Promise.all([appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test"), appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test")]);
    await appendReviewHistory(db, workflowMutation("complete", "second-complete-0001"), "advisor@example.test");
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history).toHaveLength(1);
    await appendReviewHistory(db, workflowMutation("reopen"), "advisor@example.test");
    await appendReviewHistory(db, workflowMutation("reopen"), "advisor@example.test");
    const stale = await appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test");
    expect(stale.processingStatus).toBe("in_progress");
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history.map(event => event.kind)).toEqual(["reopened", "completed"]);
  });

  it("does not partially persist completion if the transaction fails", async () => {
    const { db, docs, failNextCommit } = memoryDatabase();
    await appendReviewHistory(db, mutation(), "advisor@example.test");
    failNextCommit();
    await expect(appendReviewHistory(db, workflowMutation("complete"), "advisor@example.test")).rejects.toThrow("commit failed");
    expect(reviewDto(docs.get(reviewPath)!)).toMatchObject({ processingStatus: "in_progress", historyCount: 1 });
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history).toHaveLength(1);
  });

  it("preserves Monday no answer, Wednesday reached and Friday meeting with separate notes/times", async () => {
    const { db, docs } = memoryDatabase();
    await appendReviewHistory(db, mutation(), "advisor@example.test");
    vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
    await appendReviewHistory(db, mutation({ contactOutcome: "reached", note: "Probrat krytí", requestId: "request-00000002" }), "advisor@example.test");
    vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    const review = await appendReviewHistory(db, mutation({ contactOutcome: "meeting", note: "Přinese smlouvu", meetingAt: "2026-09-15T14:00", requestId: "request-00000003" }), "manager@example.test");
    expect(review).toMatchObject({ contactOutcome: "meeting", historyCount: 3, note: "Přinese smlouvu" });
    const history = await readReviewHistory(db, "own@example.test", "contract-1", null);
    expect(history.history.map(event => event.contactOutcome)).toEqual(["meeting", "reached", "no_answer"]);
    expect(history.history.map(event => event.note)).toEqual(["Přinese smlouvu", "Probrat krytí", "Zkusit později"]);
    expect(history.history[0]).toMatchObject({ actorEmail: "manager@example.test", createdAtMs: Date.parse("2026-09-11T12:00:00Z"), meetingAt: "2026-09-15T14:00" });
    expect(history.history[2].createdAtMs).toBe(Date.parse("2026-09-07T09:00:00Z"));
    expect(reviewDto(docs.get(reviewPath)!)).not.toHaveProperty("historyId");
  });

  it("preserves the existing legacy state exactly once without inventing a missing timestamp", async () => {
    const { db, docs } = memoryDatabase();
    docs.set(reviewPath, { ownerEmail: "own@example.test", entryId: "contract-1", occurrenceKey: "2025-09-10", note: "Původní poznámka", contactOutcome: "reached" });
    const original = await readReviewHistory(db, "own@example.test", "contract-1", null);
    expect(original.history[0]).toMatchObject({ kind: "legacy", createdAtMs: null, occurrenceKey: "2025-09-10" });
    await appendReviewHistory(db, mutation(), "advisor@example.test");
    await appendReviewHistory(db, mutation({ requestId: "request-00000002" }), "advisor@example.test");
    const history = await readReviewHistory(db, "own@example.test", "contract-1", null);
    expect(history.history).toHaveLength(3);
    expect(history.history.filter(event => event.kind === "legacy")).toHaveLength(1);
    expect(history.history[2].note).toBe("Původní poznámka");
  });

  it("keeps notes and earlier contacts after reopening and after a new anniversary cycle", async () => {
    const { db } = memoryDatabase();
    await appendReviewHistory(db, mutation(), "advisor@example.test");
    await appendReviewHistory(db, mutation({ action: "save", contactOutcome: undefined, note: "Nová poznámka", requestId: "request-00000002" }), "advisor@example.test");
    const reopened = await appendReviewHistory(db, mutation({ action: "clearOutcome", contactOutcome: undefined, note: undefined, requestId: "request-00000003" }), "advisor@example.test");
    expect(reopened).toMatchObject({ handled: false, contactOutcome: null, note: "Nová poznámka", historyCount: 3 });
    const newYear = await appendReviewHistory(db, mutation({ action: "save", contactOutcome: undefined, note: "Další rok", occurrenceKey: "2027-09-10", requestId: "request-00000004" }), "advisor@example.test");
    expect(newYear).toMatchObject({ handled: false, contactOutcome: null, meetingAt: null });
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history.map(event => event.kind)).toEqual(["note", "reopened", "note", "contact"]);
  });

  it("deduplicates retries, rejects changed payloads with the same ID, and retains concurrent contacts", async () => {
    const { db } = memoryDatabase();
    await Promise.all([appendReviewHistory(db, mutation(), "advisor@example.test"), appendReviewHistory(db, mutation(), "advisor@example.test")]);
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history).toHaveLength(1);
    await expect(appendReviewHistory(db, mutation({ note: "Changed" }), "advisor@example.test")).rejects.toMatchObject({ status: 409 });
    await Promise.all([
      appendReviewHistory(db, mutation({ requestId: "request-00000002" }), "advisor@example.test"),
      appendReviewHistory(db, mutation({ requestId: "request-00000003" }), "manager@example.test"),
    ]);
    expect((await readReviewHistory(db, "own@example.test", "contract-1", null)).history.map(event => event.sequence)).toEqual([3, 2, 1]);
  });

  it("commits the current state and event together or neither of them", async () => {
    const { db, docs, failNextCommit } = memoryDatabase();
    failNextCommit();
    await expect(appendReviewHistory(db, mutation(), "advisor@example.test")).rejects.toThrow("commit failed");
    expect(docs.size).toBe(1);
  });

  it("loads history in pages without losing older events when a new contact is added", async () => {
    const { db } = memoryDatabase();
    for (let i = 0; i < 25; i++) await appendReviewHistory(db, mutation({ requestId: `request-number-${i}` }), "advisor@example.test");
    const first = await readReviewHistory(db, "own@example.test", "contract-1", null);
    expect(first.history).toHaveLength(20); expect(first.nextCursor).toBe(6);
    await appendReviewHistory(db, mutation({ requestId: "request-newer-contact" }), "advisor@example.test");
    const second = await readReviewHistory(db, "own@example.test", "contract-1", first.nextCursor);
    expect(second.history.map(event => event.sequence)).toEqual([5, 4, 3, 2, 1]);
    expect(second.hasMore).toBe(false);
  });

  it("follows the review's stable history pointer when a contract changes owner", async () => {
    const { db, docs } = memoryDatabase();
    await appendReviewHistory(db, mutation(), "advisor@example.test");
    docs.set("anniversaryReviews/new@example.test__contract-1", { ...docs.get(reviewPath), ownerEmail: "new@example.test" });
    docs.delete(reviewPath);
    docs.delete("users/own@example.test/entries/contract-1");
    docs.set("users/new@example.test/entries/contract-1", { entryType: "contract" });
    await appendReviewHistory(db, mutation({ ownerEmail: "new@example.test", requestId: "request-00000002" }), "new@example.test");
    expect((await readReviewHistory(db, "new@example.test", "contract-1", null)).history).toHaveLength(2);
    await expect(appendReviewHistory(db, mutation(), "advisor@example.test")).rejects.toMatchObject({ status: 404 });
    expect(docs.has(reviewPath)).toBe(false);
  });
});
