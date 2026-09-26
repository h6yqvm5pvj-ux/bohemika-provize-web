import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), settings: vi.fn(), startAfter: vi.fn(), where: vi.fn(), orderBy: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({ adminDb: {
  collection: () => {
    const query = { where: (...args: unknown[]) => { state.where(...args); return query; }, orderBy: (...args: unknown[]) => { state.orderBy(...args); return query; },
      limit: () => query, startAfter: (...args: unknown[]) => { state.startAfter(...args); return query; }, get: state.get, doc: () => ({ create: state.create }) };
    return query;
  }, doc: () => ({ get: state.settings }),
} }));
import { buildLoginActivity, parseActivityCursor, readLoginActivity, recordLoginFailure, serializeLoginActivity } from "./loginActivity";
import { loginRequestMetadata, maskAuditIp } from "./loginActivityMetadata";
import { filterLoginActivity } from "@/lib/loginActivity";
const now = Date.UTC(2026, 8, 26, 10), day = 86400000;
const req = (headers: Record<string, string> = {}) => new Request("https://bohemka.app/api/auth/session", { headers });
const headers = { "x-vercel-forwarded-for": "198.51.100.42", "x-vercel-ip-country": "HU", "x-vercel-ip-city": "Mosonmagyar%C3%B3v%C3%A1r", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0" };
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("RATE_LIMIT_TRUSTED_IP_HEADERS", "x-vercel-forwarded-for"); state.create.mockResolvedValue(undefined); state.settings.mockResolvedValue({ data: () => ({ startedAtMs: now }) }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("login activity privacy and provenance", () => {
  it("uses the trusted platform location and masks IP without retaining credentials", () => {
    const event = buildLoginActivity(req({ ...headers, authorization: "Bearer private-token", cookie: "session=private-cookie", "x-forwarded-for": "203.0.113.99" }), { outcome: "success", stage: "session", source: "web", email: "USER@example.test", identityVerified: true });
    expect(event).toMatchObject({ country: "HU", city: "Mosonmagyaróvár", ipLabel: "198.51.100.xxx", device: "Chrome · Windows", email: "user@example.test", expiresAt: new Date(now + 90 * day) });
    expect(JSON.stringify(event)).not.toMatch(/private-token|private-cookie|198\.51\.100\.42|203\.0\.113/);
  });
  it("ignores forged geo outside Vercel and when a trusted IP is missing", () => {
    vi.stubEnv("VERCEL", ""); expect(loginRequestMetadata(req(headers)).country).toBe("");
    vi.stubEnv("VERCEL", "1"); expect(loginRequestMetadata(req({ "x-vercel-ip-country": "HU", "x-forwarded-for": "203.0.113.42" }))).toMatchObject({ country: "", ipLabel: "" });
  });
  it("handles malformed location and IPv6 without accepting arbitrary header text", () => {
    expect(loginRequestMetadata(req({ ...headers, "x-vercel-ip-country": "XX", "x-vercel-ip-city": "%broken" }))).toMatchObject({ country: "", city: "" });
    expect(maskAuditIp("2001:db8:1234:5678::1")).toBe("2001:db8:1234:…"); expect(maskAuditIp("untrusted")).toBe("");
  });
  it("returns an allowlisted DTO and keeps unknown location separate from foreign", () => {
    const raw = { ...buildLoginActivity(req(headers), { outcome: "success", source: "web", stage: "session" }), password: "secret", idToken: "private", sessionId: "private" };
    const event = serializeLoginActivity("one", raw)!;
    expect(JSON.stringify(event)).not.toMatch(/password|idToken|sessionId|expiresAt/);
    const unknown = { ...event, id: "two", country: "" }, cz = { ...event, id: "three", country: "CZ" };
    expect(filterLoginActivity([event, unknown, cz], "foreign", "all", "")).toEqual([event]);
    expect(filterLoginActivity([event, unknown, cz], "unknown", "all", "")).toEqual([unknown]);
    expect(filterLoginActivity([event], "all", "all", "Maďarsko")).toEqual([event]);
  });
  it("does not change rejection behavior when audit storage is unavailable", async () => {
    state.create.mockRejectedValueOnce(new Error("sensitive backend detail")); const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordLoginFailure(req(headers), { stage: "password", source: "client_report", outcome: "reported_failure" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("AUTH_ACTIVITY_WRITE_FAILED");
  });
  it("ignores duplicate rejected incidents without overwriting the first event", async () => {
    state.create.mockRejectedValueOnce({ code: 6 }); const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await recordLoginFailure(req(headers), { stage: "session", source: "web" }); expect(warn).not.toHaveBeenCalled();
  });
});
describe("bounded stable audit pagination", () => {
  it.each(["garbage", Buffer.from(JSON.stringify({ at: now, from: now - 100 * day, id: "a" })).toString("base64url"), Buffer.from(JSON.stringify({ at: now, from: now - day, id: "../../secret" })).toString("base64url")])("rejects invalid cursor %s", cursor => expect(() => parseActivityCursor(cursor)).toThrow("INVALID_ACTIVITY_CURSOR"));
  it("paginates tied timestamps by document ID and preserves the original time window", async () => {
    const data = buildLoginActivity(req(), { outcome: "success", source: "web", stage: "session" });
    const docs = Array.from({ length: 501 }, (_, n) => ({ id: `event-${501 - n}`, data: () => data }));
    state.get.mockResolvedValueOnce({ docs, size: docs.length }).mockResolvedValueOnce({ docs: [], size: 0 });
    const page = await readLoginActivity(90, null); expect(page.events).toHaveLength(500); expect(page.nextCursor).toBeTruthy();
    await readLoginActivity(1, page.nextCursor); expect(state.startAfter).toHaveBeenCalledWith(now, "event-2");
    expect(state.where).toHaveBeenLastCalledWith("occurredAtMs", ">=", now - 90 * day);
  });
});
