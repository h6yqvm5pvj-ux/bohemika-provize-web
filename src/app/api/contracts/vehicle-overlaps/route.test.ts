import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("../_lib/contractsApi.vehicleOverlap", () => ({ readVehicleOverlaps: mocks.read }));

const viewer = "viewer@example.test";
const team = "team@example.test";
const request = (fields: Record<string, string> = { ownerEmail: viewer, entryId: "new-contract" }) =>
  new NextRequest("https://example.test/api/contracts/vehicle-overlaps", {
    method: "POST", body: new URLSearchParams(fields),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({
    ok: true, ctx: { email: viewer, contractAccessEmails: [team] }, withRateLimit: (response: Response) => response,
  });
  mocks.read.mockResolvedValue({ matches: [], truncated: false });
});

describe("vehicle overlap API", () => {
  it.each([401, 403])("enforces the authentication and role guard before reading the body (%s)", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: new Response(null, { status }) });
    const req = request();
    expect((await POST(req)).status).toBe(status);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects an unrelated owner before looking up the given entry", async () => {
    expect((await POST(request({ ownerEmail: "stranger@example.test", entryId: "foreign-contract" }))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each([
    { ownerEmail: viewer, entryId: "../other" },
    { ownerEmail: viewer, entryId: "new-contract", role: "admin" },
    { ownerEmail: viewer, entryId: "new-contract", carPlate: "5AA1234" },
    { ownerEmail: "viewer/other@example.test", entryId: "new-contract" },
  ])("rejects malformed input and client-driven lookup fields", async fields => {
    const req = request(Object.fromEntries(Object.entries(fields) as [string, string][]));
    expect((await POST(req)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("constrains a valid team lookup to the owners returned by the server guard", async () => {
    const req = request({ ownerEmail: team, entryId: "saved-contract" });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, matches: [], truncated: false });
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({
      ownerEmail: team, entryIds: ["saved-contract"], viewerEmail: viewer, accessibleOwners: [team],
    }));
  });
});
