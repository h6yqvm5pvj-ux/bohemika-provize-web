import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAdvisorAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: NextResponse) => response }));
vi.mock("@/lib/server/autokuk", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/server/autokuk")>(), lookupAutokukVehicle: mocks.lookup }));
import { POST } from "./route";
import { AutokukError } from "@/lib/server/autokuk";
const request = (body: unknown) => new NextRequest("https://example.test/api/autokuk/vehicle", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ ok: true, ctx: {} }); mocks.lookup.mockResolvedValue({ ok: true }); });

describe("vehicle lookup boundary", () => {
  it("requires an authenticated adviser before querying the paid service", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await POST(request({ query: "5K15233" }))).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("accepts only the supported optional check", async () => {
    expect((await POST(request({ query: "5K15233", check: "theft" }))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect((await POST(request({ query: "5K15233", check: "vignette" }))).status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("5K15233", "vignette");
  });
  it("normalizes the query and ignores client attempts to override provider credentials", async () => {
    const response = await POST(request({ query: "5k1 5233", apiKey: "forged", url: "https://other.example" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("5K15233");
  });
  it.each([null, {}, { query: "invalid" }, { query: 12345 }])("rejects invalid input without spending a request: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("keeps actionable errors and their retry time", async () => {
    mocks.lookup.mockRejectedValue(new AutokukError("Limit vyčerpán", 429, 30));
    const response = await POST(request({ query: "5K15233" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });
});
