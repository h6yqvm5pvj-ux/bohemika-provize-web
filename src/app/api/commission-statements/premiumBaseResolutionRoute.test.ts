import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), save: vi.fn() }));
vi.mock("@/app/api/contracts/_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard, hasContractAccess: () => true }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {}, adminAuth: null }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_name: string, work: () => Promise<unknown>) => work() }));
vi.mock("@/lib/server/premiumBaseResolution", () => ({ savePremiumBaseResolution: mocks.save,
  PremiumBaseResolutionError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
import { POST } from "./route";
import { PremiumBaseResolutionError } from "@/lib/server/premiumBaseResolution";
import { StatementRebuildCapacityError } from "./statementRebuildScope";
import { StatementHtmlError } from "./statementHtml";
const ctx = { email: "owner@example.test", actorEmail: "owner@example.test", teamEmails: [], accountType: "advisor", canManageContractsAsAdmin: false };
const body = { action: "resolve-premium-base", period: "payment", basePremium: 2536 };
const request = () => new NextRequest("http://localhost/api/commission-statements", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.guard.mockResolvedValue({ ok: true, ctx, withRateLimit: (response: Response) => response });
  mocks.save.mockResolvedValue({ ok: true, period: "payment" });
});
describe("statement base confirmation endpoint", () => {
  it("requires authentication before confirmation", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects tipster accounts", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { ...ctx, accountType: "tipster" }, withRateLimit: (r: Response) => r });
    expect((await POST(request())).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses authenticated identity and passes the saved HTML parser", async () => {
    expect(await (await POST(request())).json()).toEqual({ ok: true, period: "payment" });
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ body, viewerEmail: ctx.email, actorEmail: ctx.actorEmail, parseRows: expect.any(Function) });
  });
  it("preserves a source conflict response", async () => {
    mocks.save.mockRejectedValue(new PremiumBaseResolutionError("Řádek se změnil.", 409));
    const response = await POST(request()); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "Řádek se změnil." });
  });
  it("returns a safe conflict when protected premium history fills capacity", async () => {
    mocks.save.mockRejectedValue(new StatementRebuildCapacityError());
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("historii zaplňují") });
  });
  it("bounds the direct saved-source parser used by premium confirmation", async () => {
    await POST(request());
    const parseRows = mocks.save.mock.calls[0][1].parseRows;
    expect(() => parseRows("x".repeat(850001))).toThrow(StatementHtmlError);
    expect(() => parseRows(`<div id="provize">${"<tr>".repeat(1000)}</div>`)).toThrow(StatementHtmlError);
  });
  it("does not expose database errors", async () => {
    mocks.save.mockRejectedValue(new Error("private database details"));
    const response = await POST(request()); expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private database");
  });
});
