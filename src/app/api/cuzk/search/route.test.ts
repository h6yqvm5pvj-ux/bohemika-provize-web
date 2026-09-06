import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), verifyIdToken: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ getAdvisorAccessError: async () => null }));
vi.mock("@/lib/server/loginAttemptLockout", () => ({ getLoginAttemptLockoutError: async () => null }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }), applyRateLimitHeaders: () => {} }));

const request = (action: string, values: Record<string, string> = {}) => new NextRequest(
  `https://bohemka.app/api/cuzk/search?${new URLSearchParams({ action, ...values })}`,
  { headers: { Authorization: "Bearer test-token" } }
);
const correct = { kod: 101, adresa: "Tyršova 133, 43201 Kadaň", psc: 43201, cislodomovni: 133 };
const alternatives = [
  { kod: 102, adresa: "Tyršova 2133, 43201 Kadaň", psc: 43201, cislodomovni: 2133 },
  { kod: 103, adresa: "Tyršova 133, Děčín", cislodomovni: 133 },
  correct,
  correct,
];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("CUZK_FN_URL", "https://cuzk.test/detail");
  vi.stubEnv("CUZK_FN_ADDRESS_URL", "https://cuzk.test/address");
  vi.stubEnv("CUZK_FN_SUGGEST_URL", "https://cuzk.test/suggest");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.verifyIdToken.mockResolvedValue({ uid: "test-user", email: "test@example.invalid" });
  (Reflect.get(globalThis, Symbol.for("bohemika.cuzk.cache")) as Map<string, unknown> | undefined)?.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("cadastral address search", () => {
  it("uses the complete address first and disables upstream first-match selection", async () => {
    const data = { ok: true, match: correct, stavba: { id: 300 } };
    mocks.fetch.mockResolvedValue(Response.json(data));
    const { GET } = await import("./route");
    const response = await GET(request("search", { q: "Tyršova 133, 432 01 Kadaň" }));
    expect(await response.json()).toMatchObject({ ok: true, data, resolvedAddress: correct.adresa });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/address");
    expect(url.searchParams.get("q")).toBe("Tyršova 133, 432 01 Kadaň");
    expect(url.searchParams.get("pickFirst")).toBe("0");
  });

  it("offers ambiguous addresses instead of loading an arbitrary property", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: true, mode: "MULTI_MATCH", matches: alternatives }));
    const { GET } = await import("./route");
    const response = await GET(request("search", { q: "tyrsova 133, kadan" }));
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.matches).toHaveLength(3);
    expect(body.matches[0].kod).toBe(101);
    expect(body.resolvedAddress).toBeUndefined();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves street, municipality and house number in the first structured fallback", async () => {
    mocks.fetch.mockImplementation(async (input: string) => new URL(input).searchParams.has("q")
      ? Response.json({ error: "No match" }, { status: 404 })
      : Response.json({ ok: true, mode: "MULTI_MATCH", matches: [correct] }));
    const { GET } = await import("./route");
    const response = await GET(request("search", { q: "Tyršova 133, Kadaň" }));
    expect((await response.json()).matches[0].kod).toBe(101);
    const url = new URL(mocks.fetch.mock.calls[1][0]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ ulice: "Tyršova", obec: "Kadaň", cisloDomovni: "133", pickFirst: "0" });
  });

  it("asks the user to choose when only broader suggestion fallbacks return addresses", async () => {
    mocks.fetch.mockImplementation(async (input: string) => new URL(input).pathname === "/suggest"
      ? Response.json({ suggestions: alternatives })
      : Response.json({ error: "No match" }, { status: 404 }));
    const { GET } = await import("./route");
    const response = await GET(request("search", { q: "tyrsova 133, kadan" }));
    expect((await response.json()).matches[0].kod).toBe(101);
    expect(mocks.fetch.mock.calls.every(([input]) => new URL(input).pathname !== "/detail")).toBe(true);
  });

  it("ranks and deduplicates suggestions using house number and accent-insensitive locality", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ suggestions: alternatives }));
    const { GET } = await import("./route");
    const response = await GET(request("suggest", { q: "tyrsova 133, kadan" }));
    const body = await response.json();
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0]).toMatchObject(correct);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("loads the selected address by its code and preserves the requested unit setting", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ match: correct }));
    const { GET } = await import("./route");
    const response = await GET(request("detail", { kod: "101", includeUnits: "0" }));
    expect(response.status).toBe(200);
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/detail");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ kod: "101", includeUnits: "0" });
  });

  it("reports an unavailable suggestion service separately from zero results", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ error: "Dočasně nedostupné" }, { status: 503 }));
    const { GET } = await import("./route");
    const response = await GET(request("suggest", { q: "tyrsova 133, kadan" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "Dočasně nedostupné" });
    expect(mocks.fetch.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("returns a successful empty result when the provider finds no suggestions", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ suggestions: [] }));
    const { GET } = await import("./route");
    const response = await GET(request("suggest", { q: "neznamamalaulice" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, suggestions: [] });
  });

  it("stops slow suggestion attempts within six seconds", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation((_input: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const { GET } = await import("./route");
    const pending = GET(request("suggest", { q: "tyrsova 133, kadan" }));
    await vi.advanceTimersByTimeAsync(6000);
    expect((await pending).status).toBe(504);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("requires a signed-in user before searching", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://bohemka.app/api/cuzk/search?action=suggest&q=Kadan"));
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
