import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { withContractHistory, readContractHistory } from "../../src/lib/server/contractHistory";
import { buildTransferredContractData } from "../../src/app/api/contracts/_lib/contractsApi.transfer";
const mocks = vi.hoisted(() => ({ db: null as Firestore | null, mailbox: vi.fn() }));
vi.mock("../../src/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; }, adminMessaging: null }));
vi.mock("../../src/lib/server/mailbox", () => ({ writeMailboxEntryOnce: mocks.mailbox }));
import { runContractNoteReminders } from "../../src/lib/server/contractNoteReminders";

let db: Firestore;
let app: App;
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Only the local demo Firestore emulator is allowed.");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "contract-history-tests");
  db = getFirestore(app);
  mocks.db = db;
});
afterAll(async () => { await db?.terminate(); if (app) await deleteApp(app); });
const ref = (owner: string, id: string) => db.collection("users").doc(`${owner}@example.test`).collection("entries").doc(id);

async function change(reference: DocumentReference, patch: Record<string, unknown>) {
  await db.runTransaction(async tx => {
    const current = await tx.get(reference);
    if (!current.exists) throw new Error("Contract missing");
    tx.update(reference, withContractHistory(tx, reference, current.data()!, patch, { actorEmail: reference.parent.parent!.id }));
  });
}
async function transfer(source: DocumentReference, target: DocumentReference) {
  await db.runTransaction(async tx => {
    const current = await tx.get(source);
    if (!current.exists) throw new Error("Contract missing");
    const before = current.data()!;
    const fromOwnerEmail = source.parent.parent!.id;
    const toOwnerEmail = target.parent.parent!.id;
    const next = buildTransferredContractData({ contract: before, fromOwnerEmail, toOwnerEmail, toOwnerUserId: null, actorEmail: "admin@example.test", transferredAt: new Date() });
    tx.create(target, withContractHistory(tx, source, before, next, { actorEmail: "admin@example.test", kind: "transfer", title: "Změna správce", changes: [{ label: "Správce", before: fromOwnerEmail, after: toOwnerEmail }] }));
    tx.delete(source);
  });
}
async function allEvents(reference: DocumentReference) {
  const current = (await reference.get()).data()!;
  let page = await readContractHistory(reference, current, null);
  const events = [...page.events];
  while (page.nextCursor) { page = await readContractHistory(reference, current, page.nextCursor); events.push(...page.events); }
  return events;
}

describe("atomic contract history in Firestore", () => {
  it("keeps the entire audit across more than 50 transfers and paginates without gaps", async () => {
    let current = ref("owner0", "history-transfer");
    await current.set({ userEmail: "owner0@example.test", clientName: "Jan Novák", createdAt: new Date("2025-01-01"), commissionPayouts: [{ amount: 33333 }] });
    await change(current, { clientName: "Jan Novotný" });
    const historyId = (await current.get()).data()!.contractHistoryId;
    for (let index = 1; index <= 52; index++) {
      const next = ref(`owner${index}`, "history-transfer");
      await transfer(current, next); current = next;
    }
    await change(current, { paid: true });
    const events = await allEvents(current);
    expect((await current.get()).data()!.contractHistoryId).toBe(historyId);
    expect(events).toHaveLength(55); // Original creation, name edit, 52 transfers, paid.
    expect(new Set(events.map(event => event.id)).size).toBe(55);
    expect(events.filter(event => event.kind === "transfer")).toHaveLength(52);
    expect(events.some(event => event.changes.some(c => c.before === "Jan Novák" && c.after === "Jan Novotný"))).toBe(true);
    expect(JSON.stringify(events)).not.toContain("33333");
    expect((await ref("owner0", "history-transfer").get()).exists).toBe(false);
  }, 60_000);

  it("rejects a stale batch and rolls back its event as well as the contract change", async () => {
    const source = ref("race", "history-race");
    await source.set({ clientName: "Jan", paid: false });
    const old = await source.get();
    const losingBatch = db.batch();
    losingBatch.update(source, withContractHistory(losingBatch, source, old.data()!, { clientName: "Stale name" }, { actorEmail: "race@example.test" }), { lastUpdateTime: old.updateTime! });
    await change(source, { paid: true });
    await expect(losingBatch.commit()).rejects.toThrow();
    expect((await source.get()).data()).toMatchObject({ clientName: "Jan", paid: true });
    const events = await allEvents(source);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("Stale name");
    // Even the abandoned branch's event was not committed to a separate history.
    const all = await db.collectionGroup("events").where("actorEmail", "==", "race@example.test").get();
    expect(all.size).toBe(1);
  });

  it("does not append a transfer if its destination is occupied", async () => {
    const source = ref("from", "history-conflict"); const target = ref("to", "history-conflict");
    await source.set({ clientName: "Jan" }); await target.set({ clientName: "Someone else" });
    await change(source, { paid: true });
    await expect(transfer(source, target)).rejects.toThrow();
    expect((await source.get()).exists).toBe(true);
    expect((await target.get()).data()!.clientName).toBe("Someone else");
    expect(await allEvents(source)).toHaveLength(1);
  });

  it("retries simultaneous edits under one stable history pointer", async () => {
    const source = ref("simultaneous", "history-simultaneous");
    await source.set({ clientName: "Jan", paid: false });
    await Promise.all([change(source, { clientName: "Josef" }), change(source, { paid: true })]);
    expect((await source.get()).data()).toMatchObject({ clientName: "Josef", paid: true });
    expect(await allEvents(source)).toHaveLength(2);
  });

  it("retains notes and routes an existing reminder to the current owner after repeated transfers", async () => {
    const source = ref("notes-original", "history-notes");
    const next = ref("notes-next", "history-notes");
    const final = ref("notes-final", "history-notes");
    const now = new Date();
    await source.set({ userEmail: "notes-original@example.test", clientName: "Jan" });
    await source.collection("contractNotes").doc("note-1").set({
      ownerEmail: "notes-original@example.test", entryId: source.id, text: "Zavolat klientovi",
      createdByEmail: "notes-original@example.test", reminderRecipientEmail: "notes-original@example.test",
      reminderEnabled: true, reminderAtMs: now.getTime() - 1000,
    });
    await transfer(source, next); await transfer(next, final);
    const current = (await final.get()).data()!;
    expect(current.contractNotesPath).toBe(source.path);
    expect((await db.doc(current.contractNotesPath).collection("contractNotes").doc("note-1").get()).data()!.text).toBe("Zavolat klientovi");
    mocks.mailbox.mockResolvedValue({ written: true });
    const result = await runContractNoteReminders(new NextRequest("http://localhost/api/cron/contract-note-reminders"), now);
    expect(result).toMatchObject({ claimed: 1, mailboxWritten: 1, failed: 0 });
    expect(mocks.mailbox).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: "notes-final@example.test",
      deepLink: expect.stringContaining("notes-final%40example.test"),
    }));
    // Delivery is mocked; no mailbox or push message leaves the local test.
  });
});
