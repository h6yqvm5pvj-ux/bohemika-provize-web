import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), collection: vi.fn(), fullRead: vi.fn(), projected: vi.fn(), indexedRead: vi.fn(), production: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("./contractsApi.projectedSearch", () => ({ readProjectedContractSearchPage: mocks.projected }));

vi.mock("@/lib/server/homeProduction", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/homeProduction")>(), loadHomeProductionOwners: mocks.production,
}));

const email = "owner@example.test";
const ts = Date.parse("2026-09-10");
const doc = (id: string) => ({ id, ref: { path: `users/${email}/entries/${id}` }, data: () => ({
  clientName: "X test", productKey: "neon", contractSignedDate: new Date(ts), total: 42, items: [],
  clientPhone: "777123456", clientEmail: "client@example.test", clientAddress: "Praha 1", note: "Private note",
}) });

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email, uid: "uid", decoded: { email }, isImpersonating: false,
    actorEmail: email, actorUid: "uid", impersonation: null,
  } });
  mocks.fullRead.mockResolvedValue({ docs: [doc("a")] });
  mocks.indexedRead.mockResolvedValue({ docs: [doc("a")], size: 1 });
  mocks.collection.mockImplementation((name: string) => {
    if (name === "usersPrivate") return { doc: () => ({ get: async () => ({
      exists: true, data: () => ({ subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }),
    }) }) };
    if (name === "users") return {
      get: async () => {
        const docs = [{ id: email, data: () => ({ email, position: "poradce3", commissionMode: "standard", accountType: "advisor" }) }];
        return { docs, forEach: (visit: (doc: typeof docs[number]) => void) => docs.forEach(visit) };
      },
      doc: (owner: string) => {
        expect(owner).toBe(email);
        return { collection: (nested: string) => {
          expect(nested).toBe("entries");
          return { get: mocks.fullRead, where: () => ({ limit: () => ({ get: mocks.indexedRead }) }) };
        } };
      },
    };
    throw new Error(`Unexpected collection ${name}`);
  });
});

describe("home monthly summary authorization", () => {
  const summaryRequest = (extra = "") => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const split = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return new NextRequest(`https://example.test/api/contracts/list?shape=home&homeSummary=1&signedFrom=${from}&summarySplit=${split}&summaryTo=${to}${extra}`);
  };
  it("checks authorization before touching cached financial sums", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const { handleContractsList } = await import("./contractsApi");
    expect((await handleContractsList(summaryRequest())).status).toBe(401);
    expect(mocks.production).not.toHaveBeenCalled();
  });
  it("rejects team summaries for advisers without team access", async () => {
    const { handleContractsList } = await import("./contractsApi");
    expect((await handleContractsList(summaryRequest("&scope=team"))).status).toBe(403);
    expect(mocks.production).not.toHaveBeenCalled();
  });
  it("rejects unbounded periods and unsupported filters", async () => {
    const { handleContractsList } = await import("./contractsApi");
    const request = summaryRequest(); request.nextUrl.searchParams.set("signedFrom", "1");
    expect((await handleContractsList(request)).status).toBe(400);
    expect((await handleContractsList(summaryRequest("&q=anything"))).status).toBe(400);
    expect(mocks.production).not.toHaveBeenCalled();
  });
  it("returns only the authorized owner's totals and never serializes other manager snapshots", async () => {
    const month = { count: 3, immediate: 120, premiums: { lifeMonthly: 50, otherAnnual: 200 }, managers: { "private@example.test": 900 }, leaderboard: { life: 50, other: 200 } };
    mocks.production.mockResolvedValue(new Map([[email, { current: month, previous: { ...month, count: 1 } }]]));
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(summaryRequest("&scope=my&email=stranger@example.test"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ ok: true, hasMore: false, contracts: [], summary: { current: { count: 3, immediate: 120 }, previous: { count: 1 } } });
    expect(mocks.production.mock.calls[0][1]).toEqual([email]);
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Server-Timing")).toContain("home_production");
  });
  it("does not turn failed or concurrent reads into a successful zero", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.production.mockRejectedValue(new Error("concurrent mutation"));
    const { handleContractsList } = await import("./contractsApi");
    expect((await handleContractsList(summaryRequest())).status).toBe(503);
    warning.mockRestore();
  });
});
