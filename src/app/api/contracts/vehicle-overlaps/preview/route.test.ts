import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn() }));
vi.mock("../../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("../../_lib/contractsApi.vehicleOverlap", () => ({ readVehicleOverlapPreview: mocks.read }));

const viewer = "viewer@example.test";
const team = "team@example.test";
const draft = { ownerEmail: team, productKey: "cppAuto", plate: "7Z91234", vin: "TEST1234567890123",
  contractNumber: "NEW-1", policyStart: "2026-12-01", policyEnd: "" };
const request = (body = new URLSearchParams(draft)) => new NextRequest(
  "https://example.test/api/contracts/vehicle-overlaps/preview", { method: "POST", body },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: viewer, contractAccessEmails: [team] }, withRateLimit: (r: Response) => r });
  mocks.read.mockResolvedValue({ matches: [], truncated: false });
});

describe("preview of vehicle overlaps", () => {
  it.each([401, 403, 429])("enforces the API guard before reading identifiers (%s)", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: new Response(null, { status }) });
    const req = request();
    expect((await POST(req)).status).toBe(status);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects another user's owner scope", async () => {
    expect((await POST(request(new URLSearchParams({ ...draft, ownerEmail: "outside@example.test" })))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each([{ role: "admin" }, { ownerEmail: "x/y@example.test" }, { plate: "7Z%" }, { plate: "", vin: "" },
    { vin: "not-a-vin" }, { productKey: "neon" }, { policyStart: "2026-11-31" }, { policyEnd: "2026-11-30" },
  ])("rejects manipulated fields %j", async fields => {
    const body = new URLSearchParams(draft);
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects repeated inputs and limits request size", async () => {
    const body = new URLSearchParams(draft);
    body.append("plate", "7Z98765");
    expect((await POST(request(body))).status).toBe(400);
    body.set("plate", "1".repeat(4100));
    expect((await POST(request(body))).status).toBe(413);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("checks an authorized draft without a saved entry and disables response caching", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, matches: [], truncated: false });
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ draft, viewerEmail: viewer, accessibleOwners: [team] }));
  });
});
