import { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withBusinessDataEncryption } from "../../src/lib/server/businessDataFirestore";
import { readVehicleOverlapPreview, readVehicleOverlaps } from "../../src/app/api/contracts/_lib/contractsApi.vehicleOverlap";

const owner = "plate-owner@example.test";
const team = "plate-team@example.test";
const outside = "plate-outside@example.test";
const now = new Date("2026-11-26T10:30:00+01:00");
let db: Firestore;

beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local demo emulator required");
  db = new Firestore({ projectId: "demo-bohemika-rules" });
});
afterAll(async () => {
  if (db) await db.terminate();
});

describe("vehicle overlap lookup with the Firestore encryption adapter", () => {
  it("matches authorized active policies across plate formatting, respects their dates and reports a different VIN", async () => {
    const protectedDb = withBusinessDataEncryption(db);
    const plate = "7Z9 1234";
    const vin = "TEST1234567890123";
    const base = { carPlate: plate, carVin: vin, productKey: "pillowAuto", clientName: "Synthetic Client",
      phone: "unused private field", policyStartDate: "2026-06-01" };
    const fixtures = [
      [owner, "new", { ...base, productKey: "cppAuto", carPlate: "7z9-1234", contractNumber: "NEW-1", policyStartDate: "2026-12-01" }],
      [owner, "same-vehicle", { ...base, contractNumber: "OLD-1", policyEndDate: "2026-12-10" }],
      [team, "different-vin", { ...base, contractNumber: "TEAM-1", carVin: "TEST1234567890124" }],
      [owner, "storno", { ...base, status: "Stornovaná" }],
      [owner, "expired", { ...base, policyEndDate: "2026-11-25" }],
      [owner, "ends-before-start", { ...base, policyEndDate: "2026-11-30" }],
      [owner, "endorsement", { ...base, entryType: "endorsement" }],
      [owner, "same-contract", { ...base, productKey: "cppAuto", contractNumber: "NEW-1" }],
      [owner, "other-plate", { ...base, carPlate: "7Z9 1235" }],
      [owner, "without-vin", { ...base, carVin: null, contractNumber: "NO-VIN" }],
      [owner, "unrelated-vehicle", { ...base, carPlate: "7Z9 4567", carVin: "TEST1234567890125" }],
      [outside, "foreign", { ...base, contractNumber: "FOREIGN-1" }],
    ] as const;
    await Promise.all(fixtures.slice(1).map(([email, id, data]) => protectedDb.doc(`users/${email}/entries/${id}`).set(data)));
    const legacy = db.doc(`users/${owner}/entries/legacy`);
    await legacy.set({ ...base, carPlate: "7Z91234", contractNumber: "LEGACY-1" });

    const preview = await readVehicleOverlapPreview({ db: protectedDb, now, viewerEmail: owner, accessibleOwners: [team],
      draft: { ownerEmail: owner, productKey: "cppAuto", plate: "7Z91234", vin, contractNumber: "NEW-1",
        policyStart: "2026-12-01", policyEnd: "" },
    });
    const [newOwner, newId, newPolicy] = fixtures[0];
    await protectedDb.doc(`users/${newOwner}/entries/${newId}`).set(newPolicy);
    const { matches, truncated } = await readVehicleOverlaps({
      db: protectedDb, now, ownerEmail: owner, entryIds: ["new"], viewerEmail: owner, accessibleOwners: [team],
    });
    expect(preview).toEqual({ matches, truncated });
    expect(truncated).toBe(false);
    expect(matches.map(({ entryId, matchedBy, vinMismatch }) => [entryId, matchedBy, vinMismatch])).toEqual([
      ["legacy", "plate-and-vin", false], ["same-vehicle", "plate-and-vin", false],
      ["without-vin", "plate", false], ["other-plate", "vin", false], ["different-vin", "plate", true],
    ]);
    expect(matches[1]).toEqual({
      entryId: "same-vehicle", ownerEmail: owner, plate: "7Z91234", productKey: "pillowAuto", matchedBy: "plate-and-vin",
      contractNumber: "OLD-1", policyStart: "2026-06-01", policyEnd: "2026-12-10", vinMismatch: false,
    });
    expect(JSON.stringify(matches)).not.toContain(vin);
    expect(JSON.stringify(matches)).not.toContain("Synthetic Client");
    expect(JSON.stringify((await db.doc(`users/${owner}/entries/new`).get()).data())).not.toContain("7z9-1234");
  });

  it("uses VIN when either policy has no plate and omits the actual VIN from the result", async () => {
    const protectedDb = withBusinessDataEncryption(db);
    const vin = "TEST9876543210123";
    const policies = protectedDb.collection("users").doc(owner).collection("entries");
    await Promise.all([
      policies.doc("saved-without-plate").set({ productKey: "cppAuto", carVin: vin.toLowerCase() }),
      policies.doc("existing-without-plate").set({ productKey: "pillowAuto", carVin: vin, contractNumber: "OLD-VIN" }),
      policies.doc("existing-with-plate").set({ productKey: "pillowAuto", carPlate: "7Z90001", carVin: vin, contractNumber: "OLD-PLATE" }),
    ]);
    const result = await readVehicleOverlaps({
      db: protectedDb, now, ownerEmail: owner, entryIds: ["saved-without-plate"], viewerEmail: owner, accessibleOwners: [],
    });
    expect(result.matches.map(({ entryId, matchedBy, plate }) => [entryId, matchedBy, plate])).toEqual([
      ["existing-without-plate", "vin", null], ["existing-with-plate", "vin", "7Z90001"],
    ]);
    expect(JSON.stringify(result)).not.toContain(vin);
  });
});
