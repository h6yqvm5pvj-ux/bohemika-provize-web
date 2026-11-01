import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), access: vi.fn(), get: vi.fn(), normalize: vi.fn(), upload: vi.fn(), fill: vi.fn(), fillCompanyId: vi.fn(), commit: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const db = vi.hoisted(() => ({
  batch: () => ({ update: mocks.update, commit: mocks.commit }),
  collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: mocks.get, get firestore() { return db; } }) }) }) }),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: db }));
vi.mock("@/lib/server/clientCardEmailImport", () => ({ fillClientCardEmailFromUploadedPdf: mocks.fill }));
vi.mock("@/lib/server/clientCardCompanyIdImport", () => ({ fillClientCardCompanyIdFromUploadedPdf: mocks.fillCompanyId }));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: (_writer: unknown, _ref: unknown, _before: unknown, patch: unknown) => patch }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_name: string, work: () => unknown) => work(), trackCashflowWrite: (work: () => unknown) => work() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard, hasContractAccess: mocks.access, CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL: "override@example.test" }));
vi.mock("@/lib/server/contractPdfStorage", () => ({
  normalizeStoredContractPdfAttachment: mocks.normalize,
  uploadContractPdfAttachment: mocks.upload,
  deleteContractPdfAttachment: mocks.remove,
  buildContractPdfStoredFileName: () => "stored.pdf",
  toPublicContractPdfAttachment: () => ({ hasFile: true }),
}));
import { GET, POST } from "./route";

const owner = "owner@example.test";
const ctx = { email: owner, uid: "owner-uid", accountType: "advisor", actorEmail: owner, contractAccessEmails: [], isImpersonating: false };
const request = (entryId = "entry", onlyIfMissing?: string | File) => {
  const form = new FormData();
  form.set("file", new File(["%PDF-fixture"], "contract.pdf", { type: "application/pdf" }));
  form.set("ownerEmail", owner); form.set("entryId", entryId);
  if (onlyIfMissing !== undefined) form.set("onlyIfMissing", onlyIfMissing);
  return new NextRequest("http://localhost/api/contracts/attachment", { method: "POST", body: form });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx, withRateLimit: (response: NextResponse) => response });
  mocks.access.mockReturnValue(true);
  mocks.normalize.mockReturnValue(null);
  mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppAuto" }), updateTime: "version" });
  mocks.upload.mockResolvedValue({ sha256: "verified-hash", storagePath: "file.pdf", originalName: "file.pdf" });
  mocks.commit.mockResolvedValue(undefined); mocks.fill.mockResolvedValue("saved");
});

describe("attachment contract boundary", () => {
  it.each(["old-id/contractNotes/note-id", "../entries/other", "x".repeat(161)])(
    "rejects manipulated IDs before database or storage access: %s", async entryId => {
      // A retained note can still exist under the former owner's entry path.
      mocks.get.mockResolvedValue({ exists: true, data: () => ({ text: "private transferred note" }), updateTime: "version" });
      expect((await POST(request(entryId))).status).toBe(400);
      const url = new URL("http://localhost/api/contracts/attachment");
      url.searchParams.set("ownerEmail", owner);
      url.searchParams.set("entryId", entryId);
      expect((await GET(new NextRequest(url))).status).toBe(400);
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.commit).not.toHaveBeenCalled();
    }
  );

  it("denies another user's contract before uploading or writing", async () => {
    mocks.access.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not let a tipster upload a contract attachment", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { ...ctx, accountType: "tipster" }, withRateLimit: (response: NextResponse) => response });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("first PDF attachment from contract detail", () => {
  it("allows the owner to attach a missing PDF and protects the source version", async () => {
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, attachment: { hasFile: true } });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      contractPdfAttachment: expect.objectContaining({ storagePath: "file.pdf" }),
    }), { lastUpdateTime: "version" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([{ storagePath: "existing.pdf" }, {}, "legacy-invalid-metadata"])(
    "does not replace a previously attached file or malformed metadata: %j", async attachment => {
      mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppAuto", contractPdfAttachment: attachment }), updateTime: "version" });
      const response = await POST(request("entry", "1"));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("už má") });
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.commit).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
    }
  );

  it("checks authorization before disclosing that a PDF is already attached", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ contractPdfAttachment: {} }), updateTime: "version" });
    mocks.access.mockReturnValue(false);
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Nemáš oprávnění pro tuto smlouvu." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not grant upload permission to a manager with read access", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { ...ctx, email: "manager@example.test", contractAccessEmails: [owner] }, withRateLimit: (response: NextResponse) => response });
    expect((await POST(request("entry", "1"))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it.each(["0", "true", "", "replace", new File(["1"], "mode.txt")])("rejects an invalid upload mode before database access", async mode => {
    expect((await POST(request("entry", mode))).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects duplicate upload modes", async () => {
    const form = await request("entry", "1").formData();
    form.append("onlyIfMissing", "1");
    const response = await POST(new NextRequest("http://localhost/api/contracts/attachment", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([9, 10])("returns a safe conflict and preserves files after an unconfirmed concurrent update %s", async code => {
    const previous = { storagePath: "existing.pdf", originalName: "existing.pdf" };
    const uploaded = { sha256: "new-hash", storagePath: "new.pdf", originalName: "new.pdf" };
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppAuto", contractPdfAttachment: previous }), updateTime: "version" });
    mocks.normalize.mockReturnValue(previous);
    mocks.upload.mockResolvedValue(uploaded);
    mocks.commit.mockRejectedValue(Object.assign(new Error("private document path"), { code }));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("mezitím změnila") });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.fill).not.toHaveBeenCalled();
  });

  it("keeps legacy authorized replacement available and retains the previous encrypted PDF", async () => {
    const previous = { storagePath: "existing.pdf", originalName: "existing.pdf" };
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppAuto", contractPdfAttachment: previous }), updateTime: "version" });
    mocks.normalize.mockReturnValue(previous);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not expose unexpected storage errors in the response or cleanup logs", async () => {
    mocks.upload.mockRejectedValue(new Error("private customer name /bucket/secret-storage-path"));
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "PDF se nepodařilo uložit. Zkus nahrání znovu." });
  });

  it.each([
    "PDF soubor je prázdný.", "PDF je příliš velké. Maximální velikost je 12 MB.",
    "Příloha musí být PDF soubor.", "Příloha musí mít příponu .pdf.", "Soubor nevypadá jako platné PDF.",
  ])("preserves safe PDF validation feedback: %s", async message => {
    mocks.upload.mockRejectedValue(new Error(message));
    expect(await (await POST(request("entry", "1"))).json()).toEqual({ ok: false, error: message });
  });
});

describe("CPP Auto attachment contact import", () => {
  it.each(["cppPPRbez", "cppPPRs"])("fills IČO only after committing a KOMPLEX PDF: %s", async productKey => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey }), updateTime: "version" });
    mocks.fillCompanyId.mockResolvedValue("saved");
    expect(await (await POST(request())).json()).toMatchObject({ ok: true, clientCardCompanyId: "saved" });
    expect(mocks.fillCompanyId).toHaveBeenCalledWith(db, { email: owner, uid: "owner-uid" }, "entry", "verified-hash");
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(mocks.fillCompanyId.mock.invocationCallOrder[0]);
    expect(mocks.fill).not.toHaveBeenCalled();
  });
  it("keeps an uploaded KOMPLEX PDF if IČO enrichment fails", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppPPRbez" }), updateTime: "version" });
    mocks.fillCompanyId.mockRejectedValue(new Error("private details"));
    expect(await (await POST(request())).json()).toMatchObject({ ok: true, clientCardCompanyId: "unavailable" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not write private IČO data during impersonation", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppPPRbez" }), updateTime: "version" });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { ...ctx, isImpersonating: true, impersonation: { actorRole: "admin" } }, withRateLimit: (response: NextResponse) => response });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.fillCompanyId).not.toHaveBeenCalled();
  });
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
    expect((await POST(request())).status).toBe(503);
    expect(mocks.fill).not.toHaveBeenCalled();
  });
  it("preserves authentication rejection", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.fill).not.toHaveBeenCalled();
  });
});
