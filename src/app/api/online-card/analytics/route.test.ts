import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), collection: vi.fn(), doc: vi.fn(), where: vi.fn(), guard: vi.fn(), limit: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = { collection: mocks.collection, doc: mocks.doc, where: mocks.where, limit: vi.fn(), orderBy: vi.fn(), get: mocks.get };
  for (const key of ["collection", "doc", "where", "limit", "orderBy"] as const) query[key].mockReturnValue(query);
  return { adminDb: query };
});
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.guard }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.limit, getRequestIp: () => "192.0.2.1" }));
vi.mock("@/lib/server/onlineCardAnalytics", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/onlineCardAnalytics")>(),
  recordOnlineCardAnalyticsEvent: mocks.record,
}));

import { GET, POST } from "./route";

const request = (event = "visit") => new NextRequest("https://bohemka.app/api/online-card/analytics", {
  method: "POST", body: JSON.stringify({ slug: "advisor", event }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Still September 5 in UTC, already September 6 in Prague.
  vi.setSystemTime(new Date("2026-09-05T22:30:00Z"));
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "owner@example.test" } });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.record.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue({ docs: [] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("online card analytics API", () => {
  it("uses account ownership when the public contact email differs", async () => {
    mocks.get.mockResolvedValue({ docs: [{ id: "uid", data: () => ({
      email: "owner@example.test", onlineCard: { enabled: true, slug: "advisor", email: "contact@example.test" },
    }) }] });
    expect((await POST(request())).status).toBe(204);
    expect(mocks.record).toHaveBeenCalledWith({ ownerEmail: "owner@example.test", slug: "advisor", event: "visit" });
  });

  it("does not acknowledge events for absent or disabled public cards", async () => {
    expect((await POST(request())).status).toBe(404);
    mocks.get.mockResolvedValue({ docs: [{ id: "owner@example.test", data: () => ({ onlineCard: { enabled: false, slug: "advisor" } }) }] });
    expect((await POST(request())).status).toBe(404);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each(["meeting_submitted", "travel_submitted"])("does not let the browser forge a submitted request: %s", async event => {
    expect((await POST(request(event))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("does not acknowledge rate-limited or failed writes", async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    mocks.get.mockResolvedValue({ docs: [{ id: "owner@example.test", data: () => ({ onlineCard: { enabled: true, slug: "advisor" } }) }] });
    mocks.record.mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(request())).status).toBe(503);
  });

  it.each([7, 30, 90])("returns all %i days and combines historical and current counters", async range => {
    mocks.get.mockResolvedValue({ docs: [
      { data: () => ({ day: "2026-09-05", "events.visit": 10, "events.phone_click": 2, events: { visit: 3, meeting_submitted: 1 } }) },
      { data: () => ({ day: "2026-09-06", events: { visit: 4 } }) },
      { data: () => ({ day: "2026-09-07", events: { visit: 999 } }) },
    ] });
    const response = await GET(new NextRequest(`https://bohemka.app/api/online-card/analytics?days=${range}&email=another@example.test`));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(data.days).toHaveLength(range);
    expect(data.days.at(-1).day).toBe("2026-09-06");
    expect(data.days[0].events.visit).toBe(0);
    expect(data.totals).toMatchObject({ visit: 17, phone_click: 2, meeting_submitted: 1 });
    expect(mocks.doc).toHaveBeenCalledExactlyOnceWith("owner@example.test");
  });

  it("denies unauthenticated access before reading any analytics", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
    expect((await GET(new NextRequest("https://bohemka.app/api/online-card/analytics"))).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
