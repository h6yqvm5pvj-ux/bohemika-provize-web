import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAnniversaryPortfolio } from "./anniversaryPortfolio";

const user = { getIdToken: vi.fn().mockResolvedValue("test-token") } as unknown as User;
const contract = (id: string, owner = "owner@example.test") => ({ id, adviserEmail: owner });
const page = (contracts = [contract("first")], nextCursor: string | null = null) => new Response(JSON.stringify({
  ok: true, position: "manazer4", contracts, hasMore: nextCursor !== null, nextCursor,
}), { status: 200 });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("complete Radar portfolio loading", () => {
  it("follows every cursor including empty anniversary pages and keeps own/team IDs distinct", async () => {
    fetchMock.mockResolvedValueOnce(page([], "page+2/="))
      .mockResolvedValueOnce(page([contract("same"), contract("same", "team@example.test")], "page3"))
      .mockResolvedValueOnce(page([contract("same"), contract("older")]));
    const controller = new AbortController();
    const result = await loadAnniversaryPortfolio(user, controller.signal);
    expect(result.contracts).toEqual([contract("same"), contract("same", "team@example.test"), contract("older")]);
    expect(result.position).toBe("manazer4");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/contracts/anniversary-portfolio",
      "/api/contracts/anniversary-portfolio?cursor=page%2B2%2F%3D",
      "/api/contracts/anniversary-portfolio?cursor=page3",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.signal).toBe(controller.signal);
      expect(init?.cache).toBe("no-store");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
    }
  });

  it("does not return partial results when a later request fails", async () => {
    fetchMock.mockResolvedValueOnce(page([contract("first")], "page2"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Database unavailable" }), { status: 503 }));
    await expect(loadAnniversaryPortfolio(user, new AbortController().signal)).rejects.toThrow("Database unavailable");
  });

  it.each([null, "same-cursor"])("rejects a missing or repeated continuation token: %s", async nextCursor => {
    fetchMock.mockResolvedValueOnce(page([], "same-cursor"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, contracts: [], hasMore: true, nextCursor })));
    await expect(loadAnniversaryPortfolio(user, new AbortController().signal)).rejects.toThrow("přerušilo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([null, { ok: false }, { ok: true, contracts: [] }])("rejects an invalid success response", async body => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    await expect(loadAnniversaryPortfolio(user, new AbortController().signal)).rejects.toThrow("celé portfolio");
  });

  it("stops after cancellation even if an in-flight fetch resolves", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      return page([contract("stale")], "page2");
    });
    await expect(loadAnniversaryPortfolio(user, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a genuinely empty, fully scanned portfolio", async () => {
    fetchMock.mockResolvedValueOnce(page([]));
    expect((await loadAnniversaryPortfolio(user, new AbortController().signal)).contracts).toEqual([]);
  });
});
