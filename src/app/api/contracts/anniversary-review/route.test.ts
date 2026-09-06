import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), where: vi.fn(), get: vi.fn(), append: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: () => ({ where: mocks.where }) } }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("./history", async importOriginal => ({
  ...await importOriginal<typeof import("./history")>(), appendReviewHistory: mocks.append, readReviewHistory: mocks.history,
}));
import { GET, POST } from "./route";
import { ReviewMutationError } from "./history";

const team = Array.from({ length: 65 }, (_, i) => `team${i}@example.test`);
const request = (query = "") => new NextRequest(`https://example.test/api/contracts/anniversary-review${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "own@example.test", actorEmail: "actor@example.test", contractAccessEmails: team, accountType: "advisor" }, withRateLimit: (response: NextResponse) => response });
  mocks.where.mockImplementation((_field, _operator, owners: string[]) => ({ get: () => mocks.get(owners) }));
  mocks.get.mockImplementation(async (owners: string[]) => ({ docs: owners.map(owner => ({ data: () => ({ ownerEmail: owner, entryId: "same-id", occurrenceKey: "2026-09-10", contactOutcome: "meeting", note: "Test note" }) })) }));
  mocks.history.mockResolvedValue({ history: [], hasMore: false, nextCursor: null });
  mocks.append.mockResolvedValue({ ownerEmail: "own@example.test", entryId: "contract-1", historyCount: 1, handled: true });
});

const post = (overrides: Record<string, unknown> = {}) => new NextRequest("https://example.test/api/contracts/anniversary-review", {
  method: "POST", body: JSON.stringify({ action: "mark", ownerEmail: "own@example.test", entryId: "contract-1", occurrenceKey: "2026-09-10", contactOutcome: "meeting", note: "Domluveno", meetingAt: "2026-09-11T14:00", requestId: "request-00000001", ...overrides }),
});

describe("anniversary contact history API", () => {
  it.each(["complete", "reopen"])("authorizes %s and uses the authenticated actor", async action => {
    const payload = { action, contactOutcome: undefined, note: undefined, meetingAt: undefined, completedBy: "forged@example.test", completedAtMs: 1 };
    expect((await POST(post({ ...payload, ownerEmail: "other@example.test" }))).status).toBe(403);
    expect(mocks.append).not.toHaveBeenCalled();
    const response = await POST(post(payload));
    expect(response.status).toBe(200);
    expect(mocks.append.mock.calls[0][1]).toMatchObject({ action, occurrenceKey: "2026-09-10" });
    expect(mocks.append.mock.calls[0][1]).not.toHaveProperty("completedBy");
    expect(mocks.append.mock.calls[0][1]).not.toHaveProperty("completedAtMs");
    expect(mocks.append.mock.calls[0][2]).toBe("actor@example.test");
  });

  it.each(["complete", "reopen"])("requires a specific anniversary and separate payload for %s", async action => {
    const payload = { action, contactOutcome: undefined, note: undefined, meetingAt: undefined };
    expect((await POST(post({ ...payload, occurrenceKey: undefined }))).status).toBe(400);
    expect((await POST(post({ ...payload, note: "Unsaved contact" }))).status).toBe(400);
    expect((await POST(post({ ...payload, contactOutcome: "meeting" }))).status).toBe(400);
    expect(mocks.append).not.toHaveBeenCalled();
  });

  it("appends an authorized contact using the authenticated actor and returns the saved summary", async () => {
    const response = await POST(post({ actorEmail: "forged@example.test", createdAtMs: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, review: { historyCount: 1 } });
    expect(mocks.append.mock.calls[0][1]).toMatchObject({ requestId: "request-00000001", contactOutcome: "meeting", note: "Domluveno" });
    expect(mocks.append.mock.calls[0][1]).not.toHaveProperty("createdAtMs");
    expect(mocks.append.mock.calls[0][2]).toBe("actor@example.test");
  });

  it.each([
    { entryId: "../outside" }, { requestId: "../outside" }, { occurrenceKey: "invalid" },
    { contactOutcome: "unknown" }, { meetingAt: "bad-date" }, { action: "eraseHistory" },
    { occurrenceKey: "2026-02-30" }, { meetingAt: "2026-02-30T14:00" }, { meetingAt: "2026-09-11T25:00" },
  ])("rejects invalid contact mutations: %j", async change => {
    expect((await POST(post(change))).status).toBe(400); expect(mocks.append).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and unauthorized reads/writes", async () => {
    expect((await POST(post({ ownerEmail: "other@example.test" }))).status).toBe(403);
    expect((await GET(request("?history=1&ownerEmail=other@example.test&entryId=contract-1"))).status).toBe(403);
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await POST(post())).status).toBe(401);
    expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
  });

  it("loads authorized history and validates pagination before querying", async () => {
    expect((await GET(request("?history=1&entryId=contract-1"))).status).toBe(400);
    expect((await GET(request("?history=1&ownerEmail=own@example.test&entryId=contract-1&before=-1"))).status).toBe(400);
    const response = await GET(request("?history=1&ownerEmail=own@example.test&entryId=contract-1&before=21"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.history.mock.calls[0].slice(1)).toEqual(["own@example.test", "contract-1", 21]);
  });

  it("reports failed transactions and conflicting retries as errors, not success", async () => {
    mocks.append.mockRejectedValueOnce(new ReviewMutationError("Conflict", 409));
    expect((await POST(post())).status).toBe(409);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.append.mockRejectedValueOnce(new Error("Unavailable"));
      expect((await POST(post())).status).toBe(503);
    } finally { log.mockRestore(); }
  });
});

describe("anniversary reviews for complete teams", () => {
  it("loads saved states and notes beyond the first 30 owners", async () => {
    const response = await GET(request());
    const data = await response.json();
    expect(data.reviews).toHaveLength(66);
    expect(data.reviews.at(-1)).toMatchObject({ ownerEmail: team.at(-1), note: "Test note", handled: true });
    expect(mocks.get.mock.calls.map(([owners]) => owners.length)).toEqual([30, 30, 6]);
  });

  it("limits explicitly requested reviews to an authorized owner", async () => {
    const data = await (await GET(request(`?ownerEmail=${team[64]}`))).json();
    expect(data.reviews).toHaveLength(1);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith([team[64]]);
  });

  it("does not read reviews belonging to an unauthorized owner", async () => {
    expect((await GET(request("?ownerEmail=other@example.test"))).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("does not return partial states when a later owner batch fails", async () => {
    mocks.get.mockResolvedValueOnce({ docs: [] }).mockRejectedValueOnce(new Error("unavailable"));
    await expect(GET(request())).rejects.toThrow("unavailable");
  });
});
