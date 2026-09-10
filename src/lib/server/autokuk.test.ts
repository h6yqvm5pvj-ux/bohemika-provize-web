import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import sample from "@/app/lib/__fixtures__/autokuk.sample.json";
const mocks = vi.hoisted(() => ({ rate: vi.fn(), fetch: vi.fn() }));
vi.mock("./rateLimit", () => ({ consumeRateLimit: mocks.rate }));
import { lookupAutokukVehicle } from "./autokuk";
let sequence = 0;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTOKUK_API_KEY", `test-secret-${sequence++}`);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.fetch.mockResolvedValue(Response.json(sample));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Autokuk service", () => {
  it("calls only the official endpoint with server credentials and caches repeated lookups", async () => {
    const results = await Promise.all([lookupAutokukVehicle("1AB2345"), lookupAutokukVehicle("1AB2345")]);
    const [url, request] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://autokuk.cz/api/v1/search");
    expect(request).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: `Bearer ${process.env.AUTOKUK_API_KEY}` } });
    expect(JSON.parse(request.body)).toEqual({ query: "1AB2345" });
    expect(results[0]).toEqual(results[1]);
    expect(await lookupAutokukVehicle("1AB2345")).toEqual(results[0]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.rate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(results)).not.toContain("test-secret");
  });

  it("requests only the vignette bonus on demand and caches it separately from the main report", async () => {
    await lookupAutokukVehicle("1AB2345");
    mocks.fetch.mockResolvedValue(Response.json(sample));
    const bonus = await lookupAutokukVehicle("1AB2345", "vignette");
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ query: "1AB2345", include: ["vignette"] });
    expect(Object.keys(bonus)).toEqual(["ok", "vignette"]);
    expect(await lookupAutokukVehicle("1AB2345", "vignette")).toEqual(bonus);
    expect(await lookupAutokukVehicle("1AB2345")).toHaveProperty("report");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not call the provider without a configured key", async () => {
    vi.stubEnv("AUTOKUK_API_KEY", "");
    await expect(lookupAutokukVehicle("1AB2345")).rejects.toMatchObject({ status: 503 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("enforces an account-wide quota before spending provider requests", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    await expect(lookupAutokukVehicle("1AB2345")).rejects.toMatchObject({ status: 429, retryAfter: 42 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([[401, 503], [403, 503], [404, 404], [422, 400], [500, 502]])("maps upstream status %s to %s without exposing its body", async (status, mappedStatus) => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { message: "sensitive upstream debug" } }, { status }));
    await expect(lookupAutokukVehicle("1AB2345")).rejects.toMatchObject({ status: mappedStatus });
    await expect(lookupAutokukVehicle("1AB2345")).rejects.not.toHaveProperty("message", "sensitive upstream debug");
  });

  it("distinguishes the exhausted daily allowance and propagates retry timing", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { code: "RATE_LIMIT_DAILY" } }, { status: 429, headers: { "Retry-After": "3600" } }));
    await expect(lookupAutokukVehicle("1AB2345")).rejects.toMatchObject({ status: 429, retryAfter: 3600, message: expect.stringContaining("Dnešní limit") });
  });

  it("does not cache malformed responses and allows a corrected retry", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("not json"));
    await expect(lookupAutokukVehicle("1AB2345")).rejects.toMatchObject({ status: 502 });
    expect((await lookupAutokukVehicle("1AB2345")).ok).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts slow provider checks", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(new Error("abort")));
    }));
    const pending = expect(lookupAutokukVehicle("1AB2345")).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(35_000);
    await pending;
  });
});
