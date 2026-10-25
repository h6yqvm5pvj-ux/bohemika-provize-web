import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), collection: vi.fn(), users: vi.fn(), subscription: vi.fn(), filtered: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("./contractsApi.filteredPage", () => ({ readFilteredContractPage: mocks.filtered }));

const email = "viewer@example.test", team = "team@example.test";
const headers = { authorization: "Bearer synthetic-token" };
const rateLimit = { namespace: "test:contracts:authorized-context", limit: 100, windowMs: 60_000 };
const origin = (signal?: AbortSignal) => new NextRequest("https://example.test/api/contracts/expected-payout", { method: "POST", headers, signal });
const page = (scope = "my", extraHeaders = {}) => new NextRequest(`https://example.test/api/contracts/list?shape=contractList&positions=poradce3&scope=${scope}&userEmail=foreign@example.test&role=admin`, {
  headers: { ...headers, ...extraHeaders },
});

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email, uid: "synthetic-uid", decoded: { email }, isImpersonating: false,
    actorEmail: email, actorUid: "synthetic-uid", impersonation: null,
  } });
  mocks.users.mockImplementation(async () => {
    const docs = [
      { id: email, data: () => ({ position: "manazer4", accountType: "advisor" }) },
      { id: team, data: () => ({ position: "poradce3", accountType: "advisor", managerEmail: email }) },
      { id: "foreign@example.test", data: () => ({ position: "manazer10", accountType: "advisor" }) },
    ];
    return { docs, forEach: (visit: (doc: typeof docs[number]) => void) => docs.forEach(visit) };
  });
  mocks.subscription.mockResolvedValue({ exists: true, data: () => ({ subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }) });
  mocks.collection.mockImplementation((name: string) => {
    if (name === "users") return { select: () => ({ get: mocks.users }) };
    if (name === "usersPrivate") return { doc: () => ({ get: mocks.subscription }) };
    throw new Error(`Unexpected collection ${name}`);
  });
  mocks.filtered.mockResolvedValue([]);
});

describe("request-scoped contracts authorization", () => {
  it("uses one fresh verified context for own and team reads while preserving server-selected owners", async () => {
    const { requireContractsEntryGuard, handleContractsList } = await import("./contractsApi");
    const verified = await requireContractsEntryGuard(origin(), rateLimit, { freshCashflowContext: true });
    if (!verified.ok) throw new Error("Expected an authorized context");
    for (const scope of ["my", "team"]) {
      expect((await handleContractsList(page(scope), { authorizedContext: verified, freshCashflowContext: true })).status).toBe(200);
    }
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(mocks.users).toHaveBeenCalledOnce();
    expect(mocks.subscription).toHaveBeenCalledOnce();
    expect(mocks.filtered.mock.calls.map(([input]) => input.owners)).toEqual([[email], [team]]);
  });

  it("does not accept copied context objects as a verified capability", async () => {
    const { requireContractsEntryGuard, handleContractsList } = await import("./contractsApi");
    const verified = await requireContractsEntryGuard(origin(), rateLimit, { freshCashflowContext: true });
    if (!verified.ok) throw new Error("Expected an authorized context");
    const response = await handleContractsList(page(), { authorizedContext: { ...verified } });
    expect(response.status).toBe(403);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it.each([
    { authorization: "Bearer foreign-token" },
    { authorization: "" },
    { "x-bohemika-impersonate-email": "foreign@example.test" },
  ])("rejects a capability under changed identity headers: %j", async changed => {
    const { requireContractsEntryGuard, handleContractsList } = await import("./contractsApi");
    const verified = await requireContractsEntryGuard(origin(), rateLimit, { freshCashflowContext: true });
    if (!verified.ok) throw new Error("Expected an authorized context");
    expect((await handleContractsList(page("my", changed), { authorizedContext: verified })).status).toBe(403);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it("rejects context after its originating request is cancelled", async () => {
    const { requireContractsEntryGuard, handleContractsList } = await import("./contractsApi");
    const controller = new AbortController();
    const verified = await requireContractsEntryGuard(origin(controller.signal), rateLimit, { freshCashflowContext: true });
    if (!verified.ok) throw new Error("Expected an authorized context");
    controller.abort();
    expect((await handleContractsList(page(), { authorizedContext: verified })).status).toBe(403);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it("keeps ordinary HTTP pages independently guarded despite spoofed parameters", async () => {
    const { handleContractsList } = await import("./contractsApi");
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const supplied = page();
    supplied.nextUrl.searchParams.set("authorizedContext", JSON.stringify({ ok: true, ctx: { email, role: "admin" } }));
    supplied.headers.set("x-authorized-context", "true");
    expect((await handleContractsList(supplied)).status).toBe(401);
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.filtered).not.toHaveBeenCalled();
  });
});
