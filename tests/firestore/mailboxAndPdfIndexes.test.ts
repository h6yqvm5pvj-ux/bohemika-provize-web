import { Firestore, Query } from "firebase-admin/firestore";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mailboxUnreadCount, newMailboxVisibility } from "../../src/lib/server/mailboxUnreadCount";
import { withBusinessDataEncryption } from "../../src/lib/server/businessDataFirestore";
import { withContractHistory } from "../../src/lib/server/contractHistory";
import { readFilteredContractPage } from "../../src/app/api/contracts/_lib/contractsApi.filteredPage";
import { parseContractListFilters } from "../../src/app/api/contracts/_lib/contractsApi.listFilters";

let db: Firestore;
let raw: Firestore;
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local demo emulator required");
  raw = new Firestore({ projectId: "demo-bohemika-rules" });
  db = withBusinessDataEncryption(raw);
});
afterAll(async () => { await raw?.terminate(); });

it("counts legacy, archived and snoozed messages and performs no message scan on the next poll", async () => {
  const mailbox = db.collection("usersPrivate").doc("index-owner@example.test").collection("mailbox");
  const outside = db.collection("usersPrivate").doc("other-index@example.test").collection("mailbox");
  const now = Date.now();
  const legacyDate = (value: unknown) => (value as { toMillis?(): number } | null)?.toMillis?.() ?? null;
  const count = (at = now) => mailboxUnreadCount(db, mailbox, legacyDate, at);
  const batch = db.batch();
  batch.set(mailbox.doc("legacy"), { read: false });
  batch.set(mailbox.doc("archive"), { read: false, archivedAt: new Date(now) });
  batch.set(mailbox.doc("snooze"), { read: false, snoozedUntilMs: now + 3600000 });
  batch.set(mailbox.doc("modern"), { read: false, ...newMailboxVisibility });
  batch.set(outside.doc("foreign"), { read: false, ...newMailboxVisibility });
  await batch.commit();
  expect(await count()).toBe(2);
  expect((await mailbox.doc("archive").get()).data()?.inboxArchived).toBe(true);
  const scans = vi.spyOn(Query.prototype, "get");
  try {
    expect(await count()).toBe(2);
    await mailbox.doc("modern").update({ read: true });
    expect(await count()).toBe(1);
    expect(await count(now + 3600001)).toBe(2);
    expect(scans).not.toHaveBeenCalled();
  } finally { scans.mockRestore(); }
});

it("reuses the PDF family index on page two and invalidates it when an endorsement receives a PDF", async () => {
  const owner = "pdf-index@example.test";
  const entries = db.collection("users").doc(owner).collection("entries");
  const signed = new Date("2026-11-01");
  const base = { userEmail: owner, productKey: "cppAuto", contractSignedDate: signed };
  const batch = db.batch();
  for (let i = 0; i < 120; i++) batch.set(entries.doc(String(i).padStart(3, "0")), base);
  const endorsement = entries.doc("endorsement");
  const before = { ...base, entryType: "endorsement", rootContractEntryId: "119" };
  batch.set(endorsement, before);
  await batch.commit();
  const options = { db, owners: [owner], filters: parseContractListFilters(new URLSearchParams({ withoutPdfOnly: "1" })),
    viewer: { viewerEmail: owner, teamEmails: [] }, pageSize: 1 };
  const first = await readFilteredContractPage({ ...options, cursor: null });
  expect(first.matches.map(row => row.doc.id)).toEqual(["endorsement", "119"]);
  const projections = vi.spyOn(Query.prototype, "select");
  try {
    const second = await readFilteredContractPage({ ...options, cursor: { ts: +signed, key: `${owner}___endorsement` } });
    expect(second.matches.map(row => row.doc.id)).toEqual(["119", "118"]);
    expect(projections).not.toHaveBeenCalled();
    const change = db.batch();
    change.update(endorsement, withContractHistory(change, endorsement, before, {
      contractPdfAttachment: { contentType: "application/pdf", storagePath: "synthetic/document.pdf" },
    }, { actorEmail: owner }));
    await change.commit();
    const after = await readFilteredContractPage({ ...options, cursor: null });
    expect(after.matches.map(row => row.doc.id)).toEqual(["118", "117"]);
  } finally { projections.mockRestore(); }
});
