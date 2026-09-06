import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TRAVEL_DRAFT } from "@/lib/travelInsurance";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), mailbox: vi.fn(), rateLimit: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const query: Record<string, unknown> = { id: "inquiry-123", get: mocks.get, set: mocks.set };
  for (const key of ["collection", "where", "limit", "doc"]) query[key] = vi.fn(() => query);
  return { adminDb: query, adminMessaging: null };
});
vi.mock("@/lib/server/mailbox", () => ({ writeMailboxEntries: mocks.mailbox }));
vi.mock("@/lib/server/rateLimit", () => ({ applyRateLimitHeaders: vi.fn(), consumeRateLimit: mocks.rateLimit, getRequestIp: () => "192.0.2.1" }));
vi.mock("@/lib/server/onlineCardAnalytics", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/server/onlineCardAnalytics")>(), recordOnlineCardAnalyticsEvent: mocks.record }));
import { POST } from "./route";

const body = () => ({ slug: "advisor", fullName: "Test Klient", email: "client@example.test", phone: "+420777000111", locale: "cs", company: "", travel: { trip: { ...EMPTY_TRAVEL_DRAFT, destination: "Itálie", departure: "2026-09-10", returnDate: "2026-09-20", ages: "30, 32", activities: ["hiking", "rental"], ferrata: "D" }, intent: "review", preferredContact: "email", note: "Mám pojištění ke kartě." } });
const request = (payload: unknown) => new NextRequest("https://bohemka.app/api/online-card/meeting-request", { method: "POST", body: JSON.stringify(payload) });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T10:00:00Z"));
  mocks.rateLimit.mockResolvedValue({ allowed: true, store: "memory" });
  mocks.set.mockResolvedValue(undefined); mocks.mailbox.mockResolvedValue({ written: 1 }); mocks.record.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue({ docs: [{ id: "owner@example.test", data: () => ({ email: "owner@example.test", onlineCard: { slug: "advisor", enabled: true, fullName: "Poradce", email: "public-contact@example.test" } }) }] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("travel inquiry delivery", () => {
  it("delivers the canonical plan only to the owner and records a server-side conversion", async () => {
    const response = await POST(request({ ...body(), ownerEmail: "attacker@example.test", topics: ["Fake"], message: "Fake summary" }));
    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: "owner@example.test", travel: body().travel, source: expect.objectContaining({ pagePath: "/vizitka/advisor/cestovni-pojisteni" }) }));
    expect(mocks.mailbox).toHaveBeenCalledWith(expect.objectContaining({ recipientEmails: ["owner@example.test"], title: "Nová poptávka cestovního pojištění", metadata: expect.objectContaining({ requesterMessage: expect.stringContaining("Ferraty: D"), inquiryKind: "travel", preferredContact: "email" }) }));
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith({ ownerEmail: "owner@example.test", slug: "advisor", event: "travel_submitted" });
  });
  it("keeps legacy meeting submissions working", async () => {
    const legacy = { ...body(), travel: undefined };
    expect((await POST(request({ ...legacy, topics: ["Životní pojištění"], message: "Prosím o schůzku." }))).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ event: "meeting_submitted" }));
  });
  it("rejects an invalid plan before saving or notifying", async () => {
    const payload = body(); payload.travel.trip.returnDate = "2026-09-01";
    expect((await POST(request(payload))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.mailbox).not.toHaveBeenCalled();
  });
  it("does not submit to a disabled public card", async () => {
    mocks.get.mockResolvedValue({ docs: [] });
    expect((await POST(request(body()))).status).toBe(404);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("keeps rate limiting and the honeypot in place", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, store: "memory" });
    expect((await POST(request(body()))).status).toBe(429);
    expect((await POST(request({ ...body(), company: "bot" }))).status).toBe(200);
    expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.mailbox).not.toHaveBeenCalled();
  });
  it("does not lose the inquiry if optional analytics fails", async () => {
    mocks.record.mockRejectedValueOnce(new Error("unavailable")); vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(request(body()))).status).toBe(200);
    expect(mocks.mailbox).toHaveBeenCalledTimes(1);
  });
});
