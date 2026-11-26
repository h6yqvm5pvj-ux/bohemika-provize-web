import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), collection: vi.fn(), filtered: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("./contractsApi.filteredPage", () => ({ readFilteredContractPage: mocks.filtered }));

const email = "owner@example.test";
const request = (scope = "my") => new NextRequest(`https://example.test/api/contracts/list?shape=contractList&scope=${scope}&positions=poradce2,manazer4&limit=1`);
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email, uid: "uid", decoded: { email }, isImpersonating: false,
    actorEmail: email, actorUid: "uid", impersonation: null,
  } });
  mocks.filtered.mockResolvedValue({ matches: [] });
  mocks.collection.mockImplementation((name: string) => {
    if (name === "usersPrivate") return { doc: () => ({ get: async () => ({
      exists: true, data: () => ({ subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }),
    }) }) };
    if (name === "users") return { select() { return this; }, get: async () => {
      const docs = [
        { id: email, data: () => ({ email, position: "manazer4", commissionMode: "standard", accountType: "advisor", positionTimeline: [
          { position: "poradce2", validFrom: "2020-01-01", validTo: "2023-01-01" },
          { position: "poradce5", validFrom: "2023-01-01", validTo: "2025-01-01" },
          { position: "manazer4", validFrom: "2025-01-01" },
          { position: "manazer5", validFrom: "2027-01-01" },
        ] }) },
        { id: "team@example.test", data: () => ({ position: "poradce7", managerEmail: email }) },
        { id: "unrelated@example.test", data: () => ({ position: "manazer10" }) },
      ];
      return { docs, forEach: (visit: (doc: typeof docs[number]) => void) => docs.forEach(visit) };
    } };
    throw new Error(`Unexpected collection ${name}`);
  });
});
afterEach(() => vi.useRealTimers());

describe("signing position filter API integration", () => {
  it("routes a team text search through complete projected filtering for authorized owners only", async () => {
    const originalCollection = mocks.collection.getMockImplementation()!;
    mocks.collection.mockImplementation((name: string) => {
      const collection = originalCollection(name);
      if (name !== "users") return collection;
      return { ...collection, get: async () => {
        const snapshot = await collection.get();
        snapshot.docs.push({ id: "second-team@example.test", data: () => ({ position: "poradce6", managerEmail: email }) });
        return snapshot;
      } };
    });
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?shape=contractList&scope=team&q=novak%20jan"));
    expect(response.status).toBe(200);
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({
      owners: expect.arrayContaining(["team@example.test", "second-team@example.test"]),
      filters: expect.objectContaining({ query: "novak jan", positions: new Set() }),
    }));
    const owners = mocks.filtered.mock.calls[0][0].owners;
    expect(owners).toHaveLength(2);
    expect(owners).not.toContain("unrelated@example.test");
    expect(owners).not.toContain(email);
  });

  it.each(["my", "team"])("offers only the viewer's held positions in %s scope, even with zero matching contracts", async scope => {
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(request(scope));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ availablePositions: ["poradce2", "poradce5", "manazer4"], contracts: [], hasMore: false });
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({
      owners: scope === "my" ? [email] : ["team@example.test"],
      filters: expect.objectContaining({ positions: new Set(["poradce2", "manazer4"]) }),
    }));
  });

  it("returns the matching contract with its saved signing position and normal cursor", async () => {
    const ts = Date.parse("2020-01-01");
    mocks.filtered.mockResolvedValue({ matches: ["b", "a"].map(id => ({ ownerEmail: email, doc: {
      id, data: () => ({ productKey: "cppAuto", position: "poradce2", contractSignedDate: new Date(ts), items: [] }),
    } })) });
    const { handleContractsList } = await import("./contractsApi");
    const result = await (await handleContractsList(request())).json();
    expect(result).toMatchObject({ contracts: [{ id: "b", position: "poradce2" }], hasMore: true, nextCursor: ts });
    expect(result.contracts).toHaveLength(1);
  });
});

describe("contract list request body", () => {
  const post = (params: Record<string, string>) => new NextRequest(
    "https://example.test/api/contracts/list?scope=team&shape=full&q=ignored",
    { method: "POST", body: new URLSearchParams(params) },
  );

  it("authenticates before parsing the request or reading contracts", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const { POST } = await import("../list/route");
    const req = post({ scope: "my", q: "Novák", commissionAudit: "missing_storno_estimate" });
    expect((await POST(req)).status).toBe(401);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it("returns the count and reason without statement rows, using only the authorized owner scope", async () => {
    mocks.filtered.mockResolvedValue({ totalCount: 2, matches: [{ ownerEmail: email, ts: 0, stornoEstimateIssue: "payout_date", doc: {
      id: "contract", data: () => ({ productKey: "flexi", status: "storno", commissionPayouts: [{ code: "A101", writtenBy: email, amount: 1000 }] }),
    } }] });
    const { POST } = await import("../list/route");
    const response = await POST(post({ scope: "my", commissionAudit: "missing_storno_estimate", ownerEmail: "unrelated@example.test", role: "admin" }));
    expect(response.status).toBe(200);
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({ owners: [email],
      viewer: expect.objectContaining({ viewerEmail: email, canViewAllStatementDerivedRecords: false }),
      filters: expect.objectContaining({ commissionAuditMode: "missing_storno_estimate" }) }));
    expect(await response.json()).toMatchObject({ totalCount: 2,
      contracts: [{ id: "contract", stornoEstimateIssue: "payout_date", commissionPayouts: [] }] });
  });

  it("uses authorized owners and returns only the contract-list shape", async () => {
    mocks.filtered.mockResolvedValue({ matches: [{ ownerEmail: email, doc: {
      id: "b", data: () => ({ productKey: "cppAuto", clientName: "Jan Novák", note: "private" }),
    } }] });
    const { POST } = await import("../list/route");
    const response = await POST(post({
      scope: "my", q: "Novák", positions: "poradce2", role: "admin", shape: "full",
      ownerEmail: "unrelated@example.test", includeTeam: "1",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({
      owners: [email], filters: expect.objectContaining({ query: "Novák" }),
    }));
    const payload = await response.json();
    expect(payload.contracts[0]).toMatchObject({ id: "b", clientName: "Jan Novák" });
    expect(payload.contracts[0]).not.toHaveProperty("note");
    expect(payload).not.toHaveProperty("teamContracts");
  });

  it("returns just the fields used by global exact search and ignores a forged owner", async () => {
    mocks.filtered.mockResolvedValue({ matches: [{ ownerEmail: email, doc: {
      id: "match", data: () => ({ clientName: "Test Client", contractNumber: "TEST-9", clientPhone: "private detail", note: "private note" }),
    } }] });
    const { POST } = await import("../list/route");
    const response = await POST(post({ scope: "my", shape: "search", q: "=TEST-9",
      ownerEmail: "unrelated@example.test", role: "admin", commissionAudit: "missing_storno_estimate" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({
      owners: [email], pageSize: 6, hydrate: false,
      filters: expect.objectContaining({ query: "=TEST-9", commissionAuditMode: "off" }),
    }));
    expect(await response.json()).toEqual({ ok: true, contracts: [
      { id: "match", clientName: "Test Client", contractNumber: "TEST-9" },
    ] });
  });

  it("rejects global search with another scope or no usable query", async () => {
    const { POST } = await import("../list/route");
    expect((await POST(post({ scope: "team", shape: "search", q: "=TEST-9" }))).status).toBe(400);
    expect((await POST(post({ scope: "my", shape: "search", q: " " }))).status).toBe(400);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it("excludes unrelated advisers from manipulated team selections", async () => {
    const { POST } = await import("../list/route");
    const response = await POST(post({
      scope: "team", positions: "poradce2", subordinates: "team@example.test,unrelated@example.test",
    }));
    expect(response.status).toBe(200);
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({ owners: ["team@example.test"] }));
  });

  it("returns 403 for team access requested by an adviser without a team", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: {
      email: "unrelated@example.test", uid: "other", decoded: { email: "unrelated@example.test" },
      isImpersonating: false, actorEmail: "unrelated@example.test", actorUid: "other", impersonation: null,
    } });
    const { POST } = await import("../list/route");
    expect((await POST(post({ scope: "team", q: "Novák", role: "admin" }))).status).toBe(403);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it.each([
    [{ scope: "invalid", q: "Novák" }, 400],
    [{ scope: "my", q: "x".repeat(121) }, 400],
    [{ scope: "my", q: "x", subordinates: "x".repeat(33_000) }, 413],
  ])("rejects invalid and oversized parameters before querying contracts", async (params, status) => {
    const { POST } = await import("../list/route");
    expect((await POST(post(params))).status).toBe(status);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });
});


describe("commission-ended filter authorization", () => {
  const commissionRequest = (scope = "my") => new NextRequest(`https://example.test/api/contracts/list?shape=contractList&scope=${scope}&commissionEndedOnly=1&userEmail=unrelated@example.test&role=admin`);

  it.each(["my", "team"])("uses the authenticated %s scope despite manipulated owner and role parameters", async scope => {
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(commissionRequest(scope));
    expect(response.status).toBe(200);
    expect(mocks.filtered).toHaveBeenCalledWith(expect.objectContaining({
      owners: scope === "my" ? [email] : ["team@example.test"],
      filters: expect.objectContaining({ commissionEndedOnly: true }),
    }));
  });

  it.each([401, 403])("keeps the %s guard response and does not read contracts", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: new Response(null, { status }) });
    const { handleContractsList } = await import("./contractsApi");
    expect((await handleContractsList(commissionRequest())).status).toBe(status);
    expect(mocks.filtered).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});
