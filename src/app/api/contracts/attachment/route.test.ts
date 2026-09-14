import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), get: vi.fn(), upload: vi.fn(), fill: vi.fn(), commit: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const db = vi.hoisted(() => ({
  batch: () => ({ update: mocks.update, commit: mocks.commit }),
  collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: mocks.get, get firestore() { return db; } }) }) }) }),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: db }));
vi.mock("@/lib/server/clientCardEmailImport", () => ({ fillClientCardEmailFromUploadedPdf: mocks.fill }));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: (_writer: unknown, _ref: unknown, _before: unknown, patch: unknown) => patch }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_name: string, work: () => unknown) => work(), trackCashflowWrite: (work: () => unknown) => work() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard, hasContractAccess: () => true, CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL: "override@example.test" }));
vi.mock("@/lib/server/contractPdfStorage", () => ({
  normalizeStoredContractPdfAttachment: () => null,
  uploadContractPdfAttachment: mocks.upload,
  deleteContractPdfAttachment: mocks.remove,
  buildContractPdfStoredFileName: () => "stored.pdf",
  toPublicContractPdfAttachment: () => ({ hasFile: true }),
}));
import { POST } from "./route";

const owner = "owner@example.test";
const ctx = { email: owner, uid: "owner-uid", accountType: "advisor", actorEmail: owner, contractAccessEmails: [], isImpersonating: false };
const request = () => {
  const form = new FormData();
  form.set("file", new File(["%PDF-fixture"], "contract.pdf", { type: "application/pdf" }));
  form.set("ownerEmail", owner); form.set("entryId", "entry");
  return new NextRequest("http://localhost/api/contracts/attachment", { method: "POST", body: form });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx, withRateLimit: (response: NextResponse) => response });
  mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppAuto" }), updateTime: "version" });
  mocks.upload.mockResolvedValue({ sha256: "verified-hash", storagePath: "file.pdf", originalName: "file.pdf" });
  mocks.commit.mockResolvedValue(undefined); mocks.fill.mockResolvedValue("saved");
});

describe("CPP Auto attachment contact import", () => {
  it("imports into the authenticated owner's card after the PDF is committed", async () => {
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ ok: true, clientCardEmail: "saved" });
    expect(mocks.fill).toHaveBeenCalledWith(db, { email: owner, uid: "owner-uid" }, "entry", "verified-hash");
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(mocks.fill.mock.invocationCallOrder[0]);
  });
  it("keeps the successful upload if email enrichment fails", async () => {
    mocks.fill.mockRejectedValue(new Error("private PDF details"));
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, attachment: { hasFile: true }, clientCardEmail: "unavailable" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([
    { ...ctx, isImpersonating: true, impersonation: { actorRole: "admin" } },
    { ...ctx, email: "override@example.test", contractAccessEmails: [owner] },
  ])("does not create cards while impersonating or uploading for someone else", async context => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: context, withRateLimit: (response: NextResponse) => response });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.fill).not.toHaveBeenCalled();
  });
  it("does not parse unrelated products", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "neon" }) });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.fill).not.toHaveBeenCalled();
  });
  it("never enriches after a rejected upload or failed commit", async () => {
    mocks.commit.mockRejectedValue(new Error("failed"));
    expect((await POST(request())).status).toBe(400);
    expect(mocks.fill).not.toHaveBeenCalled();
  });
  it("preserves authentication rejection", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.fill).not.toHaveBeenCalled();
  });
});
