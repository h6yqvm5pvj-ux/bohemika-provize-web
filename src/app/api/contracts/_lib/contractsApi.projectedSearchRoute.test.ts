import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), collection: vi.fn(), fullRead: vi.fn(), projected: vi.fn(), indexedRead: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("./contractsApi.projectedSearch", () => ({ readProjectedContractSearchPage: mocks.projected }));

const email = "owner@example.test";
const ts = Date.parse("2026-09-10");
const doc = (id: string) => ({ id, ref: { path: `users/${email}/entries/${id}` }, data: () => ({
  clientName: "X test", productKey: "neon", contractSignedDate: new Date(ts), total: 42, items: [],
  clientPhone: "777123456", clientEmail: "client@example.test", clientAddress: "Praha 1", note: "Private note",
}) });
const request = () => new NextRequest("https://example.test/api/contracts/list?scope=own&q=x&limit=1");

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

describe("contract search projection integration", () => {
  it("does not lose legacy matches when only some entries have stored search keys", async () => {
    mocks.projected.mockResolvedValue([doc("b"), doc("a")]);
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=own&q=test&limit=10"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.contracts.map((item: { id: string }) => item.id)).toEqual(["b", "a"]);
    expect(payload.hasMore).toBe(false);
    expect(mocks.indexedRead).not.toHaveBeenCalled();
    expect(mocks.fullRead).not.toHaveBeenCalled();
  });

  it("authenticates before projected or full contract reads", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const { handleContractsList } = await import("./contractsApi");
    expect((await handleContractsList(request())).status).toBe(401);
    expect(mocks.projected).not.toHaveBeenCalled();
    expect(mocks.fullRead).not.toHaveBeenCalled();
  });

  it("uses the same serializer and next cursor for a projected page plus one", async () => {
    mocks.projected.mockResolvedValue([doc("b"), doc("a")]);
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, hasMore: true, nextCursor: ts,
      nextCursorToken: `${ts}::${encodeURIComponent(`${email}___b`)}`,
      contracts: [{ id: "b", total: 42, adviserEmail: email }],
    });
    expect(mocks.projected).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: email, pageSize: 1, cursor: null }));
    expect(mocks.fullRead).not.toHaveBeenCalled();
  });

  it("accepts a complete zero-match scan without rereading full documents", async () => {
    mocks.projected.mockResolvedValue([]);
    const { handleContractsList } = await import("./contractsApi");
    expect(await (await handleContractsList(request())).json()).toMatchObject({
      ok: true, contracts: [], hasMore: false, nextCursor: null, nextCursorToken: null,
    });
    expect(mocks.fullRead).not.toHaveBeenCalled();
  });

  it("provides a slim client directory shape with contacts and lifecycle data", async () => {
    mocks.projected.mockResolvedValue([doc("a")]);
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest(`${request().url}&shape=clientDirectory`));
    const payload = await response.json();
    expect(payload.contracts[0]).toMatchObject({ id: "a", clientName: "X test", clientPhone: "777123456", clientEmail: "client@example.test", clientAddress: "Praha 1", productKey: "neon", contractSignedDate: ts });
    expect(payload.contracts[0]).not.toHaveProperty("note");
    expect(payload.contracts[0]).not.toHaveProperty("total");
    expect(payload.contracts[0]).not.toHaveProperty("items");
    expect(payload.contracts[0].originalAdviserEmail).toBe(email);
    expect(payload.teamAdvisers).toEqual([]);
  });

  it.each(["expired-read-time", "unsupported-filter"])("keeps the original complete fallback on %s", async failure => {
    if (failure === "expired-read-time") mocks.projected.mockRejectedValue(new Error("read time is too old"));
    else mocks.projected.mockResolvedValue(null);
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, contracts: [{ id: "a", total: 42 }], hasMore: false });
    expect(mocks.fullRead).toHaveBeenCalledOnce();
  });
});
