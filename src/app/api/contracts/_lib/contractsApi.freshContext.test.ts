import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  users: vi.fn(),
  subscription: vi.fn(),
  collection: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: Response) => response,
}));

const email = "viewer@example.test";
const rateLimit = { namespace: "test:cashflow:fresh", limit: 100, windowMs: 60_000 };
let profiles: Record<string, Record<string, unknown>>;
let subscriptionStatus: string;
const request = () => new NextRequest("https://example.test/api/contracts/list?scope=team&freshCashflowContext=true", {
  headers: { "x-cashflow-fresh-context": "true" },
});

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  profiles = {
    [email]: { position: "manazer4", commissionMode: "standard", accountType: "advisor" },
    "team@example.test": { position: "poradce2", managerEmail: email, accountType: "advisor" },
  };
  subscriptionStatus = "active";
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email, uid: "uid", decoded: { email }, isImpersonating: false,
    actorEmail: email, actorUid: "uid", impersonation: null,
  } });
  mocks.users.mockImplementation(async () => {
    const docs = Object.entries(profiles).map(([id, data]) => ({ id, data: () => ({ ...data }) }));
    return { docs, forEach: (visit: (doc: typeof docs[number]) => void) => docs.forEach(visit) };
  });
  mocks.subscription.mockImplementation(async () => ({
    exists: true, data: () => ({ subscriptionStatus, subscriptionPaidUntil: "2099-01-01" }),
  }));
  mocks.collection.mockImplementation((name: string) => {
    if (name === "users") return { get: mocks.users };
    if (name === "usersPrivate") return { doc: () => ({ get: mocks.subscription }) };
    throw new Error(`Unexpected collection ${name}`);
  });
});

describe("fresh contract context for server cashflow candidates", () => {
  it("rereads current position, mode and team without reusing or extending the shared tree cache", async () => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    const initial = await requireContractsEntryGuard(request(), rateLimit);
    expect(initial.ok && initial.ctx).toMatchObject({
      position: "manazer4", commissionMode: "standard", teamEmails: ["team@example.test"],
    });
    profiles[email] = { position: "manazer8", commissionMode: "accelerated", accountType: "advisor" };
    profiles["team@example.test"].managerEmail = null;
    const cached = await requireContractsEntryGuard(request(), rateLimit);
    expect(cached.ok && cached.ctx.position).toBe("manazer4");
    const fresh = await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    expect(fresh.ok && fresh.ctx).toMatchObject({ position: "manazer8", commissionMode: "accelerated", teamEmails: [] });
    expect(mocks.users).toHaveBeenCalledTimes(2);
    expect(mocks.subscription).toHaveBeenCalledTimes(2);
    const stillCached = await requireContractsEntryGuard(request(), rateLimit);
    expect(stillCached.ok && stillCached.ctx.position).toBe("manazer4");
    expect(mocks.users).toHaveBeenCalledTimes(2);
  });

  it("rechecks subscription denial even when normal requests still hold cached access", async () => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    expect((await requireContractsEntryGuard(request(), rateLimit)).ok).toBe(true);
    subscriptionStatus = "unpaid";
    expect((await requireContractsEntryGuard(request(), rateLimit)).ok).toBe(true);
    const fresh = await requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true });
    expect(fresh.ok).toBe(false);
    if (!fresh.ok) expect(fresh.response.status).toBe(403);
    expect(mocks.subscription).toHaveBeenCalledTimes(2);
  });

  it("propagates the trusted list option through authentication and rejects a removed profile", async () => {
    const { requireContractsEntryGuard, handleContractsList } = await import("./contractsApi");
    await requireContractsEntryGuard(request(), rateLimit);
    delete profiles[email];
    const response = await handleContractsList(request(), { freshCashflowContext: true });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "Uživatel nemá interní profil v systému." });
    expect(mocks.users).toHaveBeenCalledTimes(2);
  });

  it("does not use cached permissions after a fresh database read fails", async () => {
    const { requireContractsEntryGuard } = await import("./contractsApi");
    await requireContractsEntryGuard(request(), rateLimit);
    const failure = new Error("read unavailable");
    mocks.users.mockRejectedValueOnce(failure);
    await expect(requireContractsEntryGuard(request(), rateLimit, { freshCashflowContext: true })).rejects.toBe(failure);
  });

  it("authenticates and rate limits before either fresh database read", async () => {
    const { handleContractsList } = await import("./contractsApi");
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await handleContractsList(request(), { freshCashflowContext: true })).status).toBe(401);
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
});
