import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), collection: vi.fn(), select: vi.fn(), subscription: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));

const viewer = "manager@example.test";
const subordinate = "advisor@example.test";
const rateLimit = { namespace: "test:contracts:tree-projection", limit: 100, windowMs: 60_000 };
const request = () => new NextRequest("https://example.test/api/contracts/list?userEmail=other@example.test&role=admin");
type Profile = Record<string, unknown>;
let profiles: Record<string, Profile>;
let transferredBytes: number;

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); transferredBytes = 0;
  profiles = {
    [viewer]: { fullName: "Manager", position: "manazer4", commissionMode: "accelerated", accountType: "advisor",
      positionTimeline: [{ position: "poradce2", validFrom: "2020-01-01" }],
      // Mutable profile identity and privileges must not replace verified identity.
      email: "other@example.test", role: "admin", photoBase64: "x".repeat(64_000), pushTokens: ["synthetic-push-token"],
    },
    [subordinate]: { name: "Advisor", position: "poradce3", managerEmail: viewer, userRole: "advisor", activeCollaboration: true },
    "tipster@example.test": { name: "Tipster", userRole: "tipster", managerEmail: viewer },
    "ended@example.test": { name: "Ended advisor", accountType: "advisor", careerStatus: "ended" },
    "inactive@example.test": { name: "Inactive advisor", accountType: "advisor", activeCollaboration: false },
    "other@example.test": { name: "Other manager", position: "manazer10", accountType: "advisor" },
  };
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email: viewer, uid: "synthetic-uid", decoded: { email: viewer }, isImpersonating: false,
    actorEmail: viewer, actorUid: "synthetic-uid", impersonation: null,
  } });
  mocks.subscription.mockResolvedValue({ exists: true, data: () => ({
    subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01",
  }) });
  mocks.select.mockImplementation((...fields: string[]) => ({ get: async () => {
    const docs = Object.entries(profiles).map(([id, source]) => {
      const data = Object.fromEntries(fields.filter(field => Object.hasOwn(source, field)).map(field => [field, source[field]]));
      transferredBytes += Buffer.byteLength(JSON.stringify(data));
      return { id, data: () => data };
    });
    return { docs, forEach: (visit: (doc: typeof docs[number]) => void) => docs.forEach(visit) };
  } }));
  mocks.collection.mockImplementation((name: string) => {
    if (name === "users") return { select: mocks.select };
    if (name === "usersPrivate") return { doc: () => ({ get: mocks.subscription }) };
    throw new Error(`Unexpected collection ${name}`);
  });
});

describe("contract hierarchy field projection", () => {
  it("loads small hierarchy records while preserving identity, career history and legacy profile fallbacks", async () => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    const result = await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected authorized viewer");
    expect(result.ctx).toMatchObject({
      email: viewer, position: "manazer4", commissionMode: "accelerated", canManageContractsAsAdmin: false,
      teamEmails: [subordinate, "tipster@example.test"], contractAccessEmails: [subordinate, "tipster@example.test"],
    });
    expect(result.ctx.users.find(user => user.email === viewer)).toMatchObject({
      name: "Manager", positionTimeline: profiles[viewer].positionTimeline,
    });
    expect(result.ctx.users.find(user => user.email === subordinate)).toMatchObject({ name: "Advisor", accountType: "advisor" });
    expect(result.ctx.users.find(user => user.email === "tipster@example.test")?.accountType).toBe("tipster");
    expect(result.ctx.users.find(user => user.email === "ended@example.test")?.activeCollaboration).toBe(false);
    expect(result.ctx.users.find(user => user.email === "inactive@example.test")?.activeCollaboration).toBe(false);
    const fields = mocks.select.mock.calls[0] as string[];
    for (const unused of ["email", "role", "photoBase64", "pushTokens"]) expect(fields).not.toContain(unused);
    expect(transferredBytes).toBeLessThan(1_000);
    expect(Buffer.byteLength(JSON.stringify(profiles))).toBeGreaterThan(64_000);
    expect(mocks.subscription).toHaveBeenCalledOnce();
  });

  it("rechecks current hierarchy without granting unrelated or former team access", async () => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    profiles[subordinate].managerEmail = "other@example.test";
    const result = await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    expect(result.ok && result.ctx.teamEmails).toEqual(["tipster@example.test"]);
    expect(result.ok && result.ctx.contractAccessEmails).toEqual(["tipster@example.test"]);
  });

  it.each([401, 403, 429])("keeps identity denial %i ahead of projected profile reads", async status => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    const result = await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    expect(!result.ok && result.response.status).toBe(status);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it.each(["removed-profile", "unpaid", "tipster"])("preserves %s denial with the projected hierarchy", async denial => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    if (denial === "removed-profile") delete profiles[viewer];
    if (denial === "tipster") profiles[viewer].accountType = "tipster";
    if (denial === "unpaid") mocks.subscription.mockResolvedValue({ exists: true, data: () => ({ subscriptionStatus: "unpaid" }) });
    const result = await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    expect(!result.ok && result.response.status).toBe(403);
    if (denial === "removed-profile") expect(mocks.subscription).not.toHaveBeenCalled();
  });
});
