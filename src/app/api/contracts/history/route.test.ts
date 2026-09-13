import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), get: vi.fn(), read: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: (id: string) => ({ id, get: mocks.get }) }) }) }) } }));
vi.mock("@/lib/server/contractHistory", () => ({ readContractHistory: mocks.read }));
import { GET } from "./route";
const request = (owner = "new@example.test", extra = "") => new NextRequest(`http://localhost/api/contracts/history?ownerEmail=${owner}&entryId=contract-1${extra}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "new@example.test", contractAccessEmails: [] }, withRateLimit: (response: NextResponse) => response });
  mocks.get.mockResolvedValue({ exists: true, data: () => ({ userEmail: "new@example.test", originalAdviserEmail: "old@example.test", contractHistoryId: "stable-history" }) });
  mocks.read.mockResolvedValue({ events: [{ id: "before-transfer", title: "Úprava smlouvy" }], nextCursor: null });
});

describe("contract history access after transfer", () => {
  it("lets the new owner read the original history using the current contract pointer", async () => {
    const response = await GET(request("new@example.test", "&historyId=someone-elses-history"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).events[0].id).toBe("before-transfer");
    expect(mocks.read.mock.calls[0][1].contractHistoryId).toBe("stable-history");
  });
  it("denies a former owner without current access and arbitrary known history IDs", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "old@example.test", contractAccessEmails: [] }, withRateLimit: (r: NextResponse) => r });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("allows the current owner's manager through the existing contract access policy", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "manager@example.test", contractAccessEmails: ["new@example.test"] }, withRateLimit: (r: NextResponse) => r });
    expect((await GET(request())).status).toBe(200);
  });
  it("requires authentication and an existing contract", async () => {
    mocks.get.mockResolvedValue({ exists: false });
    expect((await GET(request("old@example.test"))).status).toBe(404);
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["&entryId=../another", "&cursor=" + "x".repeat(301)])("rejects invalid input before reading history: %s", async suffix => {
    const url = request().url.replace("entryId=contract-1", "entryId=..%2Foutside");
    expect((await GET(suffix.startsWith("&entryId") ? new NextRequest(url) : request("new@example.test", suffix))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
