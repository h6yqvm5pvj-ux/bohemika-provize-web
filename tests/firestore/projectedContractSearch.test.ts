import { Firestore } from "firebase-admin/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseContractListFilters } from "../../src/app/api/contracts/_lib/contractsApi.listFilters";
import {
  CONTRACT_SEARCH_PROJECTION, readProjectedContractSearchPage,
} from "../../src/app/api/contracts/_lib/contractsApi.projectedSearch";

const ownerEmail = "projected-search-sdk@example.test";
let db: Firestore;
beforeAll(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("This test requires a local Firestore emulator");
  }
  db = new Firestore({ projectId: "demo-bohemika-rules" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (db) await db.recursiveDelete(db.collection("users").doc(ownerEmail));
});
afterAll(async () => { if (db) await db.terminate(); });

describe("projected contract search with the real Firestore SDK", () => {
  it("omits bulky fields from the scan and keeps legacy matches and exact page order", async () => {
    const entries = db.collection("users").doc(ownerEmail).collection("entries");
    const data = {
      clientName: "Žaneta Nováková", productKey: "neon", contractSignedDate: new Date("2026-09-10"),
      total: 1234.56, note: "x".repeat(100_000),
    };
    await Promise.all([entries.doc("a").set(data), entries.doc("b").set(data), entries.doc("other").set({ ...data, clientName: "Other" })]);
    const projected = await entries.select(...CONTRACT_SEARCH_PROJECTION).get();
    expect(projected.docs).toHaveLength(3);
    expect(projected.docs.every(doc => !Object.hasOwn(doc.data(), "note") && !Object.hasOwn(doc.data(), "total"))).toBe(true);
    const page = await readProjectedContractSearchPage({
      db, ownerEmail, filters: parseContractListFilters(new URLSearchParams({ q: "novak" })), cursor: null, pageSize: 1,
    });
    expect(page?.map(doc => doc.id)).toEqual(["b", "a"]);
    expect(page?.[0].data()).toMatchObject({ total: 1234.56, note: data.note });
  });

  it("hydrates the original snapshot when a contract changes after the projected query", async () => {
    const ref = db.collection("users").doc(ownerEmail).collection("entries").doc("changed");
    await ref.set({ clientName: "Jan Novák", productKey: "neon", contractSignedDate: new Date("2026-09-10"), total: 10 });
    const original = db.runTransaction.bind(db);
    vi.spyOn(db, "runTransaction").mockImplementationOnce(async (work, options) => {
      expect(options).toMatchObject({ readOnly: true, readTime: expect.anything() });
      await ref.update({ clientName: "Other", total: 99 });
      return original(work, options);
    });
    const page = await readProjectedContractSearchPage({
      db, ownerEmail, filters: parseContractListFilters(new URLSearchParams({ q: "novak" })), cursor: null, pageSize: 30,
    });
    expect(page?.[0].data()).toMatchObject({ clientName: "Jan Novák", total: 10 });
    expect((await ref.get()).data()).toMatchObject({ clientName: "Other", total: 99 });
  });
});
