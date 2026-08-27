import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guardMocks = vi.hoisted(() => ({
  requireAuthedRateLimited: vi.fn(),
  withRateLimitHeaders: vi.fn((response: NextResponse) => response),
}));

vi.mock("@/lib/server/apiEntryGuard", () => guardMocks);

const request = () => new NextRequest("https://bohemka.app/api/comfort-prices");

describe("GET /api/comfort-prices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("COMFORT_ESHOP_TOKEN", "");
    vi.stubEnv("COMFORT_ESHOP_USERNAME", "");
    vi.stubEnv("COMFORT_ESHOP_PASSWORD", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("bez přihlášení skončí před voláním Comfort integrace", async () => {
    const unauthorized = NextResponse.json(
      { ok: false, error: "Missing bearer token" },
      { status: 401 }
    );
    guardMocks.requireAuthedRateLimited.mockResolvedValue({
      ok: false,
      response: unauthorized,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const response = await GET(request());
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Pro načtení ceníku je nutné platné přihlášení.");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(JSON.stringify(payload)).not.toContain("Missing bearer token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nezveřejní detail chybějící konfigurace", async () => {
    guardMocks.requireAuthedRateLimited.mockResolvedValue({
      ok: true,
      ctx: { rateLimit: {} },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { GET } = await import("./route");
    const response = await GET(request());
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      ok: false,
      error: "Ceník Comfort Commodity se momentálně nepodařilo načíst.",
    });
    expect(JSON.stringify(payload)).not.toContain("COMFORT_ESHOP_USERNAME");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("nezveřejní detail upstream chyby ani při použití cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T10:00:00Z"));
    vi.stubEnv("COMFORT_ESHOP_TOKEN", "test-token");
    guardMocks.requireAuthedRateLimited.mockResolvedValue({
      ok: true,
      ctx: { rateLimit: {} },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ prodejni_cena: 100_000, vykupni_cena: 95_000 }),
          { status: 200 }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const liveResponse = await GET(request());
    expect(liveResponse.status).toBe(200);
    expect(consoleError).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-08-27T10:01:01Z"));
    fetchMock.mockRejectedValue(new Error("internal-upstream-host failed"));
    const fallbackResponse = await GET(request());
    const payload = (await fallbackResponse.json()) as {
      source?: string;
      message?: string;
    };

    expect(payload.source).toBe("fallback");
    expect(payload.message).toBe(
      "Aktuální ceny se nepodařilo obnovit; používá se poslední dostupný ceník."
    );
    expect(JSON.stringify(payload)).not.toContain("internal-upstream-host");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
