import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), canManage: vi.fn(), members: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: mocks.headers,
}));
vi.mock("@/lib/server/toolDocuments", () => ({ canManageToolDocuments: mocks.canManage }));
vi.mock("@/lib/server/contactDirectoryMembers", () => ({ loadContactDirectoryMembers: mocks.members }));

import { POST } from "./route";

const context = { email: "specialist@example.test", uid: "specialist-uid", decoded: { uid: "specialist-uid" }, rateLimit: {} };
const contentLengthOverrides: Record<string, string>[] = [{}, { "Content-Length": "1" }];
const request = (body: unknown = { query: "Novák" }, headers: Record<string, string> = {}) => new NextRequest("https://app.example.test/api/contacts/members", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: context });
  mocks.canManage.mockResolvedValue(true);
  mocks.members.mockResolvedValue([]);
  mocks.headers.mockImplementation((response: NextResponse) => {
    response.headers.set("X-RateLimit-Limit", "60");
    return response;
  });
});

describe("POST /api/contacts/members", () => {
  it("rejects an unauthenticated request before roles or the directory are read", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.canManage).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("rejects an ordinary user even when their body forges an administrator role or another UID", async () => {
    mocks.canManage.mockResolvedValue(false);
    const response = await POST(request({ query: "Novák", uid: "administrator-uid", role: "admin", specialist: true }));
    expect(response.status).toBe(403);
    expect(mocks.canManage).toHaveBeenCalledExactlyOnceWith({ email: context.email, uid: context.uid, decoded: context.decoded });
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("uses the guarded 60-per-minute limit and preserves its rejected response", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": "60" } }) });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(NextRequest), { namespace: "api:contacts:members", limit: 60, windowMs: 60_000 });
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("finds names without diacritics using all query terms and returns only the minimal DTO", async () => {
    mocks.members.mockResolvedValue([
      { uid: "advisor-a", name: "Jana Nováková", email: "jana@example.test", phone: "synthetic-private-phone", role: "admin" },
      { uid: "advisor-b", name: "Petr Novák", email: "petr@example.test" },
    ]);
    const response = await POST(request({ query: "  JANA nova  " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, users: [{ uid: "advisor-a", name: "Jana Nováková", email: "jana@example.test" }] });
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(response.headers.get("x-ratelimit-limit")).toBe("60");
  });

  it("also matches canonical email and limits broad results to twelve", async () => {
    mocks.members.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({ uid: `advisor-${index}`, name: `Poradce ${index}`, email: `advisor${index}@example.test` })));
    const response = await POST(request({ query: "@example.test" }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(12);
  });

  it.each([null, [], 4, {}, { query: 4 }, { query: "x" }, { query: "  " }, { query: "\u0301\u0301" }, { query: "x".repeat(81) }, { query: "ab\ncd" }, { query: "Novák", role: "admin" }, "{"])(
    "rejects invalid input before loading member data: %j", async body => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.members).not.toHaveBeenCalled();
    },
  );

  it("accepts the maximum query length without truncating it", async () => {
    const response = await POST(request({ query: "x".repeat(80) }));
    expect(response.status).toBe(200);
    expect(mocks.members).toHaveBeenCalledOnce();
  });

  it.each([{ "Content-Length": "2049" }, { "Content-Length": "9999999999999999999999999" }])("rejects oversized declared body lengths: %j", async headers => {
    expect((await POST(request({ query: "Novák" }, headers))).status).toBe(413);
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it.each(contentLengthOverrides)("bounds actual UTF-8 bytes even with a missing or forged Content-Length: %j", async headers => {
    expect((await POST(request({ query: "é".repeat(1100) }, headers))).status).toBe(413);
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it.each(["-1", "not-a-number", "1.5"])("rejects an invalid Content-Length: %s", async length => {
    expect((await POST(request({ query: "Novák" }, { "Content-Length": length }))).status).toBe(400);
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("does not accept another body format", async () => {
    expect((await POST(request({ query: "Novák" }, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("returns a generic failure without exposing or logging a directory provider error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mocks.members.mockRejectedValue(new Error("synthetic-private-provider-detail"));
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("synthetic-private-provider-detail");
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); error.mockRestore(); }
  });
});
