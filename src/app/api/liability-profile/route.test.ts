import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({
  requireAdvisorAuthedRateLimited: vi.fn(),
  withRateLimitHeaders: vi.fn((response: NextResponse) => response),
}));
vi.mock("@/lib/server/apiEntryGuard", () => guard);
import { POST } from "./route";

const request = (query: unknown) => new NextRequest("https://bohemka.app/api/liability-profile", { method: "POST", body: JSON.stringify({ query }) });
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAdvisorAuthedRateLimited.mockResolvedValue({ ok: true, ctx: { token: "test-token" } });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("POST /api/liability-profile", () => {
  it("ověří přístup a limit před voláním AI", async () => {
    guard.requireAdvisorAuthedRateLimited.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await POST(request("Má psa"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(guard.requireAdvisorAuthedRateLimited).toHaveBeenCalledWith(expect.anything(), { namespace: "api:liability-profile:post", limit: 20, windowMs: 60_000 });
  });

  it.each([null, "", " ", "a".repeat(601), { prompt: "data" }])("odmítne neplatné zadání %j", async query => {
    expect((await POST(request(query))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("vrátí krátký ověřený profil bez volné odpovědi a údajů o pojistkách", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, reply: JSON.stringify({ needs: [{ id: "tenant", evidence: "pronajatém bytě", rating: "best" }] }) })));
    const response = await POST(request("Žije v pronajatém bytě."));
    expect(await response.json()).toEqual({ ok: true, source: "ai", needs: [{ id: "tenant", evidence: "pronajatém bytě" }] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
  });

  it.each(["neplatný JSON", '{"needs":[{"id":"unknown","evidence":"psa"}]}'])("při neplatné AI odpovědi ponechá rychlý profil", async reply => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ reply })));
    expect(await (await POST(request("Má psa."))).json()).toEqual({ ok: true, source: "local", needs: [{ id: "dog", evidence: "psa" }] });
  });

  it("při výpadku neprozradí interní chybu a vrátí lokální profil", async () => {
    fetchMock.mockRejectedValue(new Error("private provider error"));
    const response = await POST(request("Má dvě děti."));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, source: "local", needs: [{ id: "children", evidence: "deti" }] });
  });

  it("ukončí čekání po třech sekundách i pokud upstream ignoruje abort", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = POST(request("Bydlí v nájmu."));
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await (await pending).json()).source).toBe("local");
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
