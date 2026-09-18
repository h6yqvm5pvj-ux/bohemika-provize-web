import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/server/passwordReset", async original => ({ ...await original<typeof import("@/lib/server/passwordReset")>(), confirmPasswordResetWithRevocation: mocks.confirm }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminAuth: null, adminDb: null }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.limit, getRequestIp: () => "192.0.2.1", applyRateLimitHeaders: vi.fn() }));
import { POST } from "./route";
import { PasswordResetError } from "@/lib/server/passwordReset";
const body = { code: "synthetic-code", password: "Synthetic-password-123!" };
const req = (data: unknown = body, headers = {}) => new Request("https://bohemka.app/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });
beforeEach(() => { vi.resetAllMocks(); mocks.limit.mockResolvedValue({ allowed: true, store: "firestore" }); });
afterEach(() => vi.restoreAllMocks());
describe("reset confirmation boundary", () => {
  it("confirms only a code and password, without leaking either in the response", async () => {
    const response = await POST(req());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(body.code, body.password);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each([{ origin: "https://foreign.test" }, { "sec-fetch-site": "cross-site" }])("rejects cross-origin confirmation %j", async headers => {
    expect((await POST(req(body, headers))).status).toBe(403); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...body, email: "victim@example.test" }, { ...body, uid: "victim" }, { ...body, code: "invalid code" }, { ...body, password: "short" }, { ...body, password: "a".repeat(4097) }, { ...body, extra: "a".repeat(33_000) }])("rejects malformed or oversized input", async input => {
    expect((await POST(req(input))).status).toBe(400); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("rejects non-JSON and malformed streaming bodies", async () => {
    expect((await POST(req(body, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(new Request("https://bohemka.app/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it.each(["firestore", "unavailable"])("fails closed on rate-limit denial %s", async store => {
    mocks.limit.mockResolvedValue({ allowed: store === "unavailable", store });
    expect((await POST(req())).status).toBe(store === "unavailable" ? 503 : 429); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("returns only mapped errors and suppresses provider internals", async () => {
    mocks.confirm.mockRejectedValueOnce(new PasswordResetError("auth/expired-action-code"));
    expect(await (await POST(req())).json()).toEqual({ ok: false, code: "auth/expired-action-code" });
    mocks.confirm.mockRejectedValueOnce(new Error("secret token password account"));
    const response = await POST(req()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "auth/reset-unavailable" });
  });
});
