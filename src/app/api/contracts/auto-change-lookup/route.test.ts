import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), query: vi.fn(), get: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ where: (...args: unknown[]) => { mocks.query(...args); return { limit: () => ({ get: mocks.get }) }; } }) }) }) } }));
import { POST } from "./route";
const owner = "advisor@example.test";
const request = (patch = {}) => new NextRequest("https://example.test/api/contracts/auto-change-lookup", { method: "POST", body: JSON.stringify({ ownerEmail: owner, contractNumber: "SYNTHETIC", productKey: "cppAuto", ...patch }) });
const doc = (id: string, patch = {}) => ({ id, data: () => ({ userEmail: owner, productKey: "cppAuto", entryType: "contract", ...patch }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, actorEmail: owner, accountType: "advisor", contractAccessEmails: [] }, withRateLimit: (response: Response) => response });
  mocks.get.mockResolvedValue({ size: 1, docs: [doc("root")] });
});
describe("authorized auto amendment lookup", () => {
  it("returns only the root identifier", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, entryId: "root" });
    expect(mocks.query).toHaveBeenCalledWith("contractNumber", "in", ["SYNTHETIC"]);
  });
  it.each([401, 403, 429])("honors the guard %i", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status }) });
    expect((await POST(request())).status).toBe(status); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("denies access to another owner before reading", async () => {
    expect((await POST(request({ ownerEmail: "other@example.test" }))).status).toBe(403); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("denies tipsters", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, accountType: "tipster", contractAccessEmails: [] }, withRateLimit: (response: Response) => response });
    expect((await POST(request())).status).toBe(403); expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([{ ownerEmail: "../bad" }, { productKey: "neon" }, { productKey: {} }, { contractNumber: [] }, { contractNumber: "" }, { role: "admin" }])("rejects manipulated input %j", async patch => {
    expect((await POST(request(patch))).status).toBe(400); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("ignores amendments, mismatched products, and transferred records", async () => {
    mocks.get.mockResolvedValue({ size: 4, docs: [doc("root"), doc("amendment", { entryType: "endorsement" }), doc("different", { productKey: "neon" }), doc("moved", { userEmail: "other@example.test" })] });
    expect(await (await POST(request())).json()).toEqual({ ok: true, entryId: "root" });
  });
  it("rejects ambiguity instead of choosing another client's contract", async () => {
    mocks.get.mockResolvedValue({ size: 2, docs: [doc("one"), doc("two")] }); expect((await POST(request())).status).toBe(409);
  });
});
