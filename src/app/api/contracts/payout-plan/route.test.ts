import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), collection: vi.fn(), transaction: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: mocks.collection, runTransaction: mocks.transaction } }));
import { POST } from "./route";

const owner = "owner@example.test";
const context = (email = owner, contractAccessEmails: string[] = []) => ({
  ok: true, ctx: { email, actorEmail: "actor@example.test", contractAccessEmails },
  withRateLimit: (response: Response) => { response.headers.set("x-test-rate-limit", "applied"); return response; },
});
const request = (body: Record<string, unknown>) => POST(new NextRequest("https://example.test/api/contracts/payout-plan", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerEmail: owner, entryId: "contract", ...body }),
}));

beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue(context()); });

describe("retired manual payout-plan endpoint", () => {
  it.each(["preview", "assign", "remove"])("rejects legacy %s without reading or changing financial data", async operation => {
    const response = await request({ operation, payoutKey: "C102", targetKey: "B103", writtenBy: owner });
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-test-rate-limit")).toBe("applied");
    expect(await response.json()).toEqual({ ok: false, error: expect.stringContaining("automaticky") });
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), expect.anything(), { freshCashflowContext: true });
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("still requires authentication and server-authorized ownership", async () => {
    mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await request({ operation: "assign" })).status).toBe(401);
    mocks.guard.mockResolvedValueOnce(context("stranger@example.test"));
    expect((await request({ operation: "assign", viewerEmail: owner, role: "admin" })).status).toBe(403);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("returns retirement to an authorized manager without exposing the owner's payouts", async () => {
    mocks.guard.mockResolvedValueOnce(context("manager@example.test", [owner]));
    const response = await request({ operation: "preview" });
    expect(response.status).toBe(410);
    expect(await response.json()).not.toHaveProperty("preview");
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "preview", entryId: "../../other" },
    { operation: "escalate" },
    { operation: "preview", entryId: 123 },
  ])("rejects manipulated paths and operations: %j", async body => {
    expect((await request(body)).status).toBe(400);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("rejects malformed request bodies", async () => {
    for (const body of ["{", "null", "[]"]) {
      expect((await POST(new NextRequest("https://example.test/api/contracts/payout-plan", { method: "POST", body }))).status).toBe(400);
    }
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});
