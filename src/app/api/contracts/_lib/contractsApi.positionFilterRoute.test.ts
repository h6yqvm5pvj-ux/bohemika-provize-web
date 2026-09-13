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
  mocks.filtered.mockResolvedValue([]);
  mocks.collection.mockImplementation((name: string) => {
    if (name === "usersPrivate") return { doc: () => ({ get: async () => ({
      exists: true, data: () => ({ subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }),
    }) }) };
    if (name === "users") return { get: async () => {
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
    mocks.filtered.mockResolvedValue(["b", "a"].map(id => ({ ownerEmail: email, doc: {
      id, data: () => ({ productKey: "cppAuto", position: "poradce2", contractSignedDate: new Date(ts), items: [] }),
    } })));
    const { handleContractsList } = await import("./contractsApi");
    const result = await (await handleContractsList(request())).json();
    expect(result).toMatchObject({ contracts: [{ id: "b", position: "poradce2" }], hasMore: true, nextCursor: ts });
    expect(result.contracts).toHaveLength(1);
  });
});
