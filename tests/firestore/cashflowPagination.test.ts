import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../scripts/cashflow-worker/fixtures";

const state = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return state.db; }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
// Real endpoint/Firestore queries; only the authenticated synthetic identity is injected.
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: async (req: NextRequest) => {
    const email = req.headers.get("x-test-viewer");
    if (!email?.startsWith("cashflow-page-") || !email.endsWith("@example.test")) {
      return { ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) };
    }
    return { ok: true, ctx: { email, uid: email, decoded: { email }, actorEmail: email,
      actorUid: email, isImpersonating: false, impersonation: null } };
  },
  withRateLimitHeaders: (response: Response) => response,
}));

import { handleContractsList } from "../../src/app/api/contracts/_lib/contractsApi";

const own = "cashflow-page-own@example.test";
const manager = "cashflow-page-manager@example.test";
const tied = "cashflow-page-tied@example.test";
const tiedManager = "cashflow-page-tied-manager@example.test";
const outside = "cashflow-page-outside@example.test";
const members = Array.from({ length: 8 }, (_, i) => `cashflow-page-member-${i}@example.test`);
const tiedMembers = Array.from({ length: 12 }, (_, i) => `cashflow-page-tied-member-${i}@example.test`);
const owners = [own, manager, tied, tiedManager, outside, ...members, ...tiedMembers];
const expectedKeys = { my: [] as string[], team: [] as string[], tied: [] as string[], tiedTeam: [] as string[] };
const asOf = new Date("2026-09-18T12:00:00Z");
let app: App;

beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.GCLOUD_PROJECT !== "demo-bohemika-rules") {
    throw new Error("Cashflow pagination checks require the local demo-bohemika-rules emulator.");
  }
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "cashflow-pagination");
  const db = state.db = getFirestore(app);
  const writes: Array<[string, Record<string, unknown>]> = [];
  for (const email of owners) {
    writes.push([`users/${email}`, { email, name: "Testovací poradce", position: "manazer8", commissionMode: "standard",
      accountType: "advisor", ...(members.includes(email) ? { managerEmail: manager } : {}),
      ...(tiedMembers.includes(email) ? { managerEmail: tiedManager } : {}) }]);
    writes.push([`usersPrivate/${email}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }]);
  }
  const fixture = makeWorkerFixture(1000, asOf).snapshot;
  const source = [...fixture.ownEntries, ...fixture.teamEntriesRaw].sort((a, b) => a.id.localeCompare(b.id));
  for (const scenario of ["my", "team", "tied", "tiedTeam"] as const) {
    const sameDate = scenario === "tied" || scenario === "tiedTeam";
    const count = sameDate ? 1005 : 1000;
    for (let index = 0; index < count; index++) {
      const email = scenario === "my" ? own : scenario === "tied" ? tied : scenario === "tiedTeam"
        ? tiedMembers[index % tiedMembers.length] : members[index % members.length];
      const original = source[index % source.length];
      const id = `contract-${String(index).padStart(5, "0")}`;
      const signed = sameDate ? asOf : new Date(asOf.getTime() - Math.floor(index / 20) * 86400_000);
      const data = { ...original, id, userEmail: email, contractSignedDate: signed,
        // Include late imports, records without a signing date and commission history.
        createdAt: index % 37 === 0 ? asOf : signed,
        commissionPayouts: Array.from({ length: index % 10 === 0 ? 36 : 4 }, (_, payment) => ({
          id: `payout-${payment}`, code: "A101", amount: 100 + payment, date: "2026-08-25", recipientEmail: scenario === "team" ? manager : email,
        })),
        managerOverrides: scenario === "team" ? [{ email: manager, position: "manazer8", commissionMode: "standard", items: original.items, total: original.total }] : [],
      };
      if (!sameDate && index % 43 === 0) delete (data as Record<string, unknown>).contractSignedDate;
      writes.push([`users/${email}/entries/${id}`, data]);
      expectedKeys[scenario].push(`${email}___${id}`);
    }
  }
  writes.push([`users/${outside}/entries/not-authorized`, { productKey: "neon", contractSignedDate: asOf, createdAt: asOf, inputAmount: 999999, userEmail: outside }]);
  for (let offset = 0; offset < writes.length; offset += 300) {
    const batch = db.batch();
    for (const [path, data] of writes.slice(offset, offset + 300)) batch.set(db.doc(path), data);
    await batch.commit();
  }
}, 60_000);

afterAll(async () => {
  if (state.db) {
    for (const email of owners) {
      await state.db.recursiveDelete(state.db.doc(`users/${email}`));
      await state.db.doc(`usersPrivate/${email}`).delete();
    }
    await state.db.terminate();
  }
  if (app) await deleteApp(app);
});

const request = (email: string, params: URLSearchParams) => new NextRequest(`https://example.test/api/contracts/list?${params}`, {
  headers: { "x-test-viewer": email },
});

async function collect(email: string, scope: "my" | "team", limit: number, shape = "cashflow") {
  const contracts: Array<Record<string, unknown>> = [];
  const bodies: string[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let firstResponseMs = 0;
  const started = performance.now();
  do {
    const params = new URLSearchParams({ scope, shape, limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    const response = await handleContractsList(request(email, params));
    const body = await response.text();
    expect(response.status, body.slice(0, 200)).toBe(200);
    const payload = JSON.parse(body);
    if (!bodies.length) firstResponseMs = performance.now() - started;
    bodies.push(body);
    contracts.push(...payload.contracts);
    cursor = payload.hasMore ? payload.nextCursorToken : null;
    if (payload.hasMore) {
      expect(typeof cursor).toBe("string");
      expect(cursors.has(cursor!)).toBe(false);
      cursors.add(cursor!);
    }
    expect(bodies.length).toBeLessThan(30);
  } while (cursor);
  const totalMs = performance.now() - started;
  const keys = contracts.map(item => `${item.adviserEmail}___${item.id}`);
  expect(new Set(keys).size).toBe(keys.length);
  const expected = email === own ? expectedKeys.my : email === tied ? expectedKeys.tied
    : email === tiedManager ? expectedKeys.tiedTeam : expectedKeys.team;
  expect([...keys].sort()).toEqual([...expected].sort());
  const ordered = [...contracts].sort((a, b) => `${a.adviserEmail}___${a.id}`.localeCompare(`${b.adviserEmail}___${b.id}`));
  const bytes = bodies.map(body => Buffer.byteLength(body));
  return { requests: bodies.length, contracts: contracts.length, totalMs, firstResponseMs,
    rawBytes: bytes.reduce((sum, value) => sum + value, 0), maxResponseBytes: Math.max(...bytes),
    gzipBytes: bodies.reduce((sum, body) => sum + gzipSync(body).length, 0),
    hash: createHash("sha256").update(JSON.stringify(ordered)).digest("hex") };
}

describe("cashflow larger pages against real Firestore queries", () => {
  it.each([100, 300, 500])("preserves all own and team contracts with page size %s", async limit => {
    const ownResult = await collect(own, "my", limit);
    const teamResult = await collect(manager, "team", limit);
    expect(ownResult.requests).toBe(Math.ceil(1000 / limit));
    expect(teamResult.requests).toBe(Math.ceil(1000 / limit));
  });
  it("continues across more than two full pages with the exact same signing timestamp", async () => {
    expect((await collect(tied, "my", 500)).requests).toBe(3);
  });
  it("preserves tied timestamps across pages and more than ten team owners", async () => {
    expect((await collect(tiedManager, "team", 500)).requests).toBe(3);
  });
  it("keeps all team contracts when the collection-group query needs a per-owner fallback", async () => {
    const groupQuery = vi.spyOn(state.db!, "collectionGroup").mockImplementation(() => {
      throw new Error("Synthetic missing collection-group index");
    });
    try {
      expect((await collect(manager, "team", 500)).requests).toBe(2);
    } finally {
      groupQuery.mockRestore();
    }
  });
  it.each(["full", "contractList"])("preserves undated contracts between late imports for shape %s", async shape => {
    expect((await collect(own, "my", 50, shape)).requests).toBe(20);
  });
  it.each(["full", "contractList", "cashflow"])("keeps the server cap for shape %s", async shape => {
    const response = await handleContractsList(request(own, new URLSearchParams({ scope: "my", shape, limit: "99999" })));
    expect(response.status).toBe(200);
    expect((await response.json()).contracts).toHaveLength(shape === "cashflow" ? 500 : 50);
  });
  it("still rejects unauthenticated callers and a viewer with no team", async () => {
    expect((await handleContractsList(new NextRequest("https://example.test/api/contracts/list?shape=cashflow&limit=500"))).status).toBe(401);
    expect((await handleContractsList(request(outside, new URLSearchParams({ scope: "team", shape: "cashflow", limit: "500" })))).status).toBe(403);
  });
});

it.skipIf(process.env.CASHFLOW_PAGINATION_BENCHMARK !== "1")("measures the three batch sizes on identical portfolios", async () => {
  const results = [];
  for (const [scenario, email, scope] of [["own-1000", own, "my"], ["team-1000", manager, "team"]] as const) {
    const reference = await collect(email, scope, 100);
    const samples: Array<Awaited<ReturnType<typeof collect>> & { limit: number }> = [];
    for (let repeat = 0; repeat < 5; repeat++) {
      const sizes = [100, 300, 500];
      const order = [...sizes.slice(repeat % 3), ...sizes.slice(0, repeat % 3)];
      for (const limit of order) {
        const result = await collect(email, scope, limit);
        expect(result.hash).toBe(reference.hash);
        samples.push({ limit, ...result });
      }
    }
    results.push({ scenario, samples });
  }
  const output = process.env.CASHFLOW_PAGINATION_OUTPUT;
  if (!output) throw new Error("Set a local benchmark output path.");
  writeFileSync(output, JSON.stringify({ date: new Date().toISOString(), environment: "local Firestore emulator",
    scope: "Real contract-list handler, Firestore SDK queries, serializer and cursor loop with synthetic portfolios. Authentication identity is mocked. Warm process after fixture seeding; no production network, browser rendering or rate-limit service. Gzip measured after timing, not actual wire bytes.",
    results }, null, 2) + "\n");
}, 120_000);
