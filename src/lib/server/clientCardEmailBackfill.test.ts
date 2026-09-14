import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { createEmptyClientCard } from "@/app/_klienti/clientCardData";
import { planClientCardEmail, saveClientCardEmail, type ClientEmailSource } from "./clientCardEmailBackfill";

const adviser = { email: "advisor@example.test", uid: "own-uid" };
const data = { clientName: "Bc. Petr Novák", productKey: "neon", contractPdfAttachment: { sha256: "hash" } };
const source = (patch = {}, result: ClientEmailSource["result"] = { status: "found", email: "petr@example.test" }): ClientEmailSource => ({
  snapshot: { id: "contract", exists: true, updateTime: { isEqual: (value: unknown) => value === "original" }, data: () => ({ ...data, ...patch }), ref: { path: `users/${adviser.email}/entries/contract`, parent: { parent: { id: adviser.email } } } } as unknown as DocumentSnapshot,
  result,
});
const set = vi.fn(), get = vi.fn(), getAll = vi.fn();
const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: (slug: string) => ({ path: `clientCardsPrivate/${adviser.uid}/cards/${slug}` }) }) }) }), runTransaction: async (work: (tx: unknown) => unknown) => work({ get, getAll, set }) } as unknown as Firestore;
const readyPlan = () => {
  const sources = [source()];
  sources[0].snapshot = { ...sources[0].snapshot, updateTime: "original" } as unknown as DocumentSnapshot;
  const decision = planClientCardEmail(sources, adviser.email);
  if (decision.status !== "ready") throw new Error("Fixture should be eligible");
  return decision.plan;
};
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue({ data: () => undefined }); getAll.mockResolvedValue([source().snapshot]); });

describe("permanent PDF email backfill", () => {
  it("will not choose between different emails or conflicting phone identities", () => {
    expect(planClientCardEmail([source({ clientEmail: "other@example.test" })], adviser.email).status).toBe("conflict");
    expect(planClientCardEmail([source({}, { status: "ambiguous", email: null })], adviser.email).status).toBe("conflict");
    const other = source({ clientPhone: "777999888" });
    other.snapshot = { ...other.snapshot, id: "other" } as DocumentSnapshot;
    expect(planClientCardEmail([source({ clientPhone: "777111222" }), other], adviser.email).status).toBe("conflict");
  });
  it("creates a persistent private card and records PDF provenance", async () => {
    expect(await saveClientCardEmail(db, adviser, readyPlan())).toBe("saved");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("/own-uid/cards/") }), expect.objectContaining({ ownerUid: adviser.uid, revision: 1, card: expect.objectContaining({ clientName: "Petr Novák", email: "petr@example.test" }), emailSource: expect.objectContaining({ contracts: [{ path: `users/${adviser.email}/entries/contract`, pdfSha256: "hash" }] }) }), { merge: true });
  });
  it("keeps existing personal data while only filling a blank email", async () => {
    const card = { ...createEmptyClientCard("Petr Novák"), phone: "777 888 999", occupation: "Test" };
    get.mockResolvedValue({ data: () => ({ ownerUid: adviser.uid, card, revision: 4 }) });
    expect(await saveClientCardEmail(db, adviser, readyPlan())).toBe("saved");
    expect(set.mock.calls[0][1]).toMatchObject({ card: { ...card, email: "petr@example.test" }, revision: 5 });
  });
  it("preserves an email entered manually during the extraction", async () => {
    get.mockResolvedValue({ data: () => ({ ownerUid: adviser.uid, card: { ...createEmptyClientCard("Petr Novák"), email: "manual@example.test" }, revision: 1 }) });
    expect(await saveClientCardEmail(db, adviser, readyPlan())).toBe("existing");
    expect(set).not.toHaveBeenCalled();
  });
  it("refuses to save after source deletion, PDF replacement or transfer", async () => {
    for (const snapshot of [
      { ...source().snapshot, exists: false },
      { ...source().snapshot, updateTime: { isEqual: () => false } },
      source({ originalAdviserEmail: "other@example.test" }).snapshot,
      source({ clientName: "Jana Nová" }).snapshot,
    ]) {
      getAll.mockResolvedValue([snapshot]);
      expect(await saveClientCardEmail(db, adviser, readyPlan())).toBe("stale");
      expect(set).not.toHaveBeenCalled();
    }
  });
  it("fails closed on invalid stored cards or a different UID", async () => {
    get.mockResolvedValue({ data: () => ({ ownerUid: "other", card: createEmptyClientCard("Petr Novák"), revision: 1 }) });
    await expect(saveClientCardEmail(db, adviser, readyPlan())).rejects.toThrow("Invalid saved");
    expect(set).not.toHaveBeenCalled();
  });
  it("preserves a manual rename identifying a different client", async () => {
    get.mockResolvedValue({ data: () => ({ ownerUid: adviser.uid, card: createEmptyClientCard("Jana Nová"), revision: 2 }) });
    expect(await saveClientCardEmail(db, adviser, readyPlan())).toBe("stale");
    expect(set).not.toHaveBeenCalled();
  });
});
