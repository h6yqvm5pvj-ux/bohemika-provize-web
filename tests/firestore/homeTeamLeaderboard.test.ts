import { Firestore, Query } from "firebase-admin/firestore";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { leaderboardWindow, loadTeamLeaderboard } from "../../src/lib/server/homeTeamLeaderboard";
import { withBusinessDataEncryption } from "../../src/lib/server/businessDataFirestore";
import { markHallOwnerDirty } from "../../src/lib/server/hallOfFameProjection";

let db: Firestore;
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local demo emulator required");
  db = new Firestore({ projectId: "demo-bohemika-rules" });
});
afterAll(async () => { await db?.terminate(); });

it("counts beyond 3000 contracts, respects rolling dates, and reuses only current owner totals", async () => {
  const owner = "leaderboard@example.test";
  const protectedDb = withBusinessDataEncryption(db);
  const entries = protectedDb.collection("users").doc(owner).collection("entries");
  const now = Date.parse("2026-05-31T22:30:00Z");
  const window = leaderboardWindow("6", "Europe/Prague", now)!;
  expect(window.from).toBe(Date.parse("2025-11-30T23:00:00Z"));
  expect(window.to).toBe(Date.parse("2026-06-30T22:00:00Z"));
  const read = (months = "6") => loadTeamLeaderboard(protectedDb, [owner], new Map([[owner, "Poradce"]]),
    leaderboardWindow(months, "Europe/Prague", now)!, false);
  const base = { contractSignedDate: new Date(window.from), createdAt: new Date(window.from), productKey: "neon", inputAmount: 1 };
  for (let i = 0; i < 3001; i += 400) {
    const batch = protectedDb.batch();
    for (let j = i; j < Math.min(i + 400, 3001); j++) batch.set(entries.doc(String(j)), base);
    await batch.commit();
  }
  const add = protectedDb.batch();
  for (const [id, patch] of Object.entries({
    inherited: { acquisitionType: "inherited" }, retired: { productKey: "comfortcc" },
    older: { contractSignedDate: new Date(window.from - 1) }, future: { contractSignedDate: new Date(window.to) },
    numeric: { contractSignedDate: window.from }, fallback: { contractSignedDate: null },
    serialized: { contractSignedDate: { seconds: window.from / 1000 } },
    legacy: { contractSignedDate: new Date(window.from).toISOString(), productKey: "cppAuto", frequencyRaw: "quarterly", inputAmount: 25 },
  })) add.set(entries.doc(id), { ...base, ...patch });
  markHallOwnerDirty(add, protectedDb, owner);
  await add.commit();
  const rows = await read();
  expect(rows).toEqual([{ email: owner, name: "Poradce", hasLife: true, hasOther: true, life: 3004, other: 100 }]);
  const reads = vi.spyOn(Query.prototype, "get");
  try {
    expect(await read()).toEqual(rows);
    expect(reads).not.toHaveBeenCalled();
    expect((await read("12"))[0].life).toBe(3005);
    const update = protectedDb.batch();
    update.update(entries.doc("numeric"), { inputAmount: 5 });
    markHallOwnerDirty(update, protectedDb, owner);
    await update.commit();
    expect((await read())[0].life).toBe(3008);
  } finally { reads.mockRestore(); }
}, 60_000);
