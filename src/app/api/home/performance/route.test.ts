import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response }));
import { POST } from "./route";
const sample = { stage: "production", durationMs: 321, outcome: "success", device: "desktop" };
const request = (body: unknown) => new NextRequest("https://example.test/api/home/performance", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { mocks.guard.mockReset().mockResolvedValue({ ok: true, ctx: {} }); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
describe("bounded authenticated home performance reporting", () => {
  it("logs only allowlisted timings and keeps responses private", async () => {
    const response = await POST(request({ version: 1, samples: [sample], ignored: "private@example.test" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(console.info).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "home.performance", version: 1, samples: [sample] }));
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 20, windowMs: 60_000 }));
  });
  it.each([401, 403, 429])("honors the authentication and rate limit guard (%s) before accepting metrics", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status }) });
    expect((await POST(request({ version: 1, samples: [sample] }))).status).toBe(status);
    expect(console.info).not.toHaveBeenCalled();
  });
  it.each([
    { ...sample, amount: 12345 }, { ...sample, email: "a@example.test" }, { ...sample, durationMs: -1 },
    { ...sample, durationMs: 180001 }, { ...sample, durationMs: 1.5 }, { ...sample, stage: "arbitrary" },
    { ...sample, outcome: "private error" }, { ...sample, device: "unknown" }, null,
  ])("rejects invalid or sensitive sample fields (%j)", async row => {
    expect((await POST(request({ version: 1, samples: [row] }))).status).toBe(400); expect(console.info).not.toHaveBeenCalled();
  });
  it.each([[], Array(21).fill(sample)])("bounds batch size", async samples => {
    expect((await POST(request({ version: 1, samples }))).status).toBe(400);
  });
  it("bounds streamed data even with no Content-Length", async () => {
    const req = new NextRequest("https://example.test/api/home/performance", { method: "POST", body: JSON.stringify({ padding: "x".repeat(8200) }) });
    expect(req.headers.has("content-length")).toBe(false);
    expect((await POST(req)).status).toBe(413); expect(console.info).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    expect((await POST(new NextRequest("https://example.test/api/home/performance", { method: "POST", body: "{" }))).status).toBe(400);
  });
});
