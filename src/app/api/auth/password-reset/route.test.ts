import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(), getUserByEmail: vi.fn(), send: vi.fn(), config: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: { getUserByEmail: mocks.getUserByEmail } }));
vi.mock("@/lib/server/firebaseAuthEmail", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/firebaseAuthEmail")>(),
  sendFirebaseAuthEmail: mocks.send, requireAuthEmailConfig: mocks.config,
}));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.rateLimit, getRequestIp: () => "192.0.2.1", applyRateLimitHeaders: vi.fn() }));
import { POST } from "./route";

const allowed = { allowed: true, store: "firestore" };
const user = { disabled: false, providerData: [{ providerId: "password" }] };
const request = (body: unknown = { email: "synthetic@example.test" }, headers: Record<string, string> = {}) => new Request("https://example.test/api/auth/password-reset", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const deliver = async () => { for (const [callback] of mocks.after.mock.calls) await callback(); };

describe("public password reset privacy and abuse limits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rateLimit.mockResolvedValue(allowed);
    mocks.getUserByEmail.mockResolvedValue(user);
    mocks.send.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("accepts before account lookup or delivery and ignores injected redirects and recipients", async () => {
    const result = await POST(request({ email: " Synthetic@Example.Test ", to: "other@example.test", continueUrl: "https://evil.test" }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ ok: true });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    await deliver();
    expect(mocks.getUserByEmail).toHaveBeenCalledExactlyOnceWith("synthetic@example.test");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ requestType: "PASSWORD_RESET", email: "synthetic@example.test" });
  });
  it.each(["missing", "disabled", "federated", "delivery-failure"])("returns the same acceptance for %s as for an active account", async (scenario) => {
    const expected = await (await POST(request())).text();
    mocks.after.mockClear();
    if (scenario === "missing") mocks.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    if (scenario === "disabled") mocks.getUserByEmail.mockResolvedValue({ ...user, disabled: true });
    if (scenario === "federated") mocks.getUserByEmail.mockResolvedValue({ ...user, providerData: [{ providerId: "google.com" }] });
    if (scenario === "delivery-failure") mocks.send.mockRejectedValue(new Error("synthetic@example.test private-action-link"));
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.text()).toBe(expected);
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    await deliver();
    if (scenario !== "delivery-failure") expect(mocks.send).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/synthetic@|private-action/);
  });
  it("enforces a shared IP limit before body parsing and account access", async () => {
    mocks.rateLimit.mockResolvedValue({ ...allowed, allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: "192.0.2.1", limit: 10 }));
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("silently suppresses a rate-limited recipient without revealing request history", async () => {
    const expected = await (await POST(request())).text();
    mocks.after.mockClear();
    mocks.rateLimit.mockResolvedValueOnce(allowed).mockResolvedValueOnce({ ...allowed, allowed: false });
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.text()).toBe(expected);
    expect(result.headers.has("X-RateLimit-Remaining")).toBe(false);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("fails closed when shared limits are unavailable", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, store: "unavailable" });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("reports missing configuration for all recipients before accepting", async () => {
    mocks.config.mockImplementation(() => { throw { code: "auth/configuration-not-found", message: "private-secret" }; });
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private-secret");
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it.each([null, {}, { email: ["one@example.test", "two@example.test"] }, { email: "one@example.test,two@example.test" }, { email: "x".repeat(3000) }])("rejects an invalid or oversized body without generating a link", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it.each([
    [{ origin: "https://evil.test" }, 403],
    [{ "sec-fetch-site": "cross-site" }, 403],
    [{ "Content-Type": "text/plain" }, 415],
  ] as const)("blocks cross-site or form requests", async (headers, status) => {
    expect((await POST(request(undefined, headers))).status).toBe(status);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
