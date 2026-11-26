import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: () => ({ select: () => ({ get: mocks.read }) }) },
}));

const ownEmail = "own@example.test";
const otherEmail = "other@example.test";
const request = (body: string, suffix = "") =>
  new NextRequest(`https://example.test/api/user/search${suffix}`, { method: "POST", body });

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: ownEmail } });
  mocks.read.mockResolvedValue({
    docs: [
      { id: ownEmail, data: () => ({ email: ownEmail, fullName: "Advisor Own" }) },
      { id: otherEmail, data: () => ({ email: otherEmail, fullName: "Advisor Other", managerEmail: "manager@example.test" }) },
    ],
  });
});

describe("global colleague search", () => {
  it.each([401, 403])("checks %s before reading the query", async status => {
    mocks.guard.mockResolvedValueOnce({ ok: false, response: new Response(null, { status }) });
    const { POST } = await import("./route");
    const req = request("advisor");
    expect((await POST(req)).status).toBe(status);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects oversized text bodies before reading the directory", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("x".repeat(600)))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns the fields needed for search and ignores URL parameters on POST", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("advisor", "?includeSelf=1&q=ignored"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, users: [{ email: otherEmail, name: "Advisor Other" }] });
  });
});
