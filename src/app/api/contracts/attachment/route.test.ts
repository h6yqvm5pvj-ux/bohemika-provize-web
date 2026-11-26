import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), access: vi.fn(), get: vi.fn(), normalize: vi.fn(), bindingStatus: vi.fn(), numberFingerprint: vi.fn(), strengthen: vi.fn(), download: vi.fn(), upload: vi.fn(), fill: vi.fn(), fillCompanyId: vi.fn(), commit: vi.fn(), update: vi.fn(), remove: vi.fn(), validateAmendment: vi.fn() }));
const db = vi.hoisted(() => ({
  batch: () => ({ update: mocks.update, commit: mocks.commit }),
  collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: mocks.get, get firestore() { return db; } }) }) }) }),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: db }));
vi.mock("@/lib/server/autoAmendmentPdf", () => ({ validateAutoAmendmentPdf: mocks.validateAmendment }));
vi.mock("@/lib/server/clientCardEmailImport", () => ({ fillClientCardEmailFromUploadedPdf: mocks.fill }));
vi.mock("@/lib/server/clientCardCompanyIdImport", () => ({ fillClientCardCompanyIdFromUploadedPdf: mocks.fillCompanyId }));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: (_writer: unknown, _ref: unknown, _before: unknown, patch: unknown) => patch }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_name: string, work: () => unknown) => work(), trackCashflowWrite: (work: () => unknown) => work() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard, hasContractAccess: mocks.access, CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL: "override@example.test" }));
vi.mock("@/lib/server/contractPdfStorage", () => ({
  normalizeStoredContractPdfAttachment: mocks.normalize,
  contractPdfNumberBindingStatus: mocks.bindingStatus,
  contractPdfNumberFingerprint: mocks.numberFingerprint,
  strengthenExistingContractPdfBinding: mocks.strengthen,
  createContractPdfAttachmentReadStream: mocks.download,
  uploadContractPdfAttachment: mocks.upload,
  deleteContractPdfAttachment: mocks.remove,
  buildContractPdfStoredFileName: () => "stored.pdf",
  toPublicContractPdfAttachment: () => ({ hasFile: true, contractNumberBindingStatus: "verified" }),
}));
import { GET, POST } from "./route";

const owner = "owner@example.test";
const fingerprint = "a".repeat(64);
const ctx = { email: owner, uid: "owner-uid", accountType: "advisor", actorEmail: owner, contractAccessEmails: [], isImpersonating: false };
const request = (entryId = "entry", onlyIfMissing?: string | File) => {
  const form = new FormData();
  form.set("file", new File(["%PDF-fixture"], "contract.pdf", { type: "application/pdf" }));
  form.set("ownerEmail", owner); form.set("entryId", entryId);
  if (onlyIfMissing !== undefined) form.set("onlyIfMissing", onlyIfMissing);
  return new NextRequest("http://localhost/api/contracts/attachment", { method: "POST", body: form });
};
const bindRequest = (withFile = false) => {
  const form = new FormData();
  if (withFile) form.set("file", new File(["%PDF-fixture"], "contract.pdf", { type: "application/pdf" }));
  form.set("ownerEmail", owner); form.set("entryId", "entry"); form.set("bindExisting", "1");
  return new NextRequest("http://localhost/api/contracts/attachment", { method: "POST", body: form });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx, withRateLimit: (response: NextResponse) => response });
  mocks.access.mockReturnValue(true);
  mocks.normalize.mockReturnValue(null);
  mocks.numberFingerprint.mockReturnValue(fingerprint);
  mocks.bindingStatus.mockImplementation((attachment) => attachment?.contractNumberFingerprint ? "mismatch" : attachment ? "legacy" : "unverified");
  mocks.strengthen.mockImplementation(async ({ attachment }) => ({ ...attachment, contractNumberFingerprint: fingerprint, contractNumberBindingVersion: 1 }));
  mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey: "cppAuto", contractNumber: "POLICY-123" }), updateTime: "version" });
  mocks.upload.mockResolvedValue({ sha256: "verified-hash", storagePath: `contract-pdfs/owner/contract-${fingerprint}/entry/file.pdf`, originalName: "file.pdf", contractNumberFingerprint: fingerprint });
  mocks.commit.mockResolvedValue(undefined); mocks.fill.mockResolvedValue("saved");
});

describe("attachment contract boundary", () => {
  it.each([
    { productKey: "neon" },
    { productKey: "cppPPRs", autoPremiumAmendment: true },
  ])("validates a $productKey endorsement PDF before writing it to storage", async product => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ ...product, entryType: "endorsement", contractNumber: "9400001234" }), updateTime: "version" });
    mocks.validateAmendment.mockRejectedValueOnce(new Error("Unsafe PDF"));
    expect((await POST(request("amendment", "1"))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();

    mocks.validateAmendment.mockResolvedValueOnce(undefined);
    expect((await POST(request("amendment", "1"))).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ entryId: "amendment", ownerEmail: owner }));
    expect(mocks.fillCompanyId).not.toHaveBeenCalled();
  });

  it.each([401, 403])("denies payment PDF reads when the entry guard returns %s", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Přístup zamítnut." }, { status }) });
    const response = await GET(new NextRequest(`http://localhost/api/contracts/attachment?ownerEmail=${owner}&entryId=entry`));
    expect(response.status).toBe(status);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.normalize).not.toHaveBeenCalled();
  });

  it("denies payment PDF reads for another user's contract before accessing the file", async () => {
    mocks.access.mockReturnValue(false);
    const response = await GET(new NextRequest(`http://localhost/api/contracts/attachment?ownerEmail=${owner}&entryId=entry`));
    expect(response.status).toBe(403);
    expect(mocks.normalize).not.toHaveBeenCalled();
  });

  it("fails closed when the stored PDF binding does not match the current policy number", async () => {
    const stale = { storagePath: "contract-pdfs/owner/contract-old/entry/file.pdf", contractNumberFingerprint: "b".repeat(64) };
    mocks.normalize.mockReturnValue(stale);
    mocks.bindingStatus.mockReturnValue("mismatch");
    const response = await GET(new NextRequest(`http://localhost/api/contracts/attachment?ownerEmail=${owner}&entryId=entry`));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("neodpovídá") });
    expect(mocks.download).not.toHaveBeenCalled();
  });

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

  it("requires owner authorization before strengthening an existing PDF binding", async () => {
    mocks.access.mockReturnValue(false);
    expect((await POST(bindRequest())).status).toBe(403);
    expect(mocks.strengthen).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a binding-only request that also sends a file", async () => {
    expect((await POST(bindRequest(true))).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.strengthen).not.toHaveBeenCalled();
  });
});

describe("first PDF attachment from contract detail", () => {
  it("strengthens a verified legacy PDF in place without uploading or deleting its object", async () => {
    const previous = { storagePath: "contract-pdfs/owner/entry/old.pdf", originalName: "old.pdf", sha256: "old-hash" };
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ contractNumber: "POLICY-123", contractPdfAttachment: previous }), updateTime: "version" });
    mocks.normalize.mockReturnValue(previous);
    mocks.bindingStatus.mockReturnValue("legacy");
    const response = await POST(bindRequest());
    expect(response.status).toBe(200);
    expect(mocks.strengthen).toHaveBeenCalledWith({ attachment: previous, contractNumber: "POLICY-123" });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      contractPdfAttachment: expect.objectContaining({ contractNumberBindingVersion: 1 }),
    }), { lastUpdateTime: "version" });
  });

  it("allows the owner to attach a missing PDF and protects the source version", async () => {
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, attachment: { hasFile: true } });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ contractNumber: "POLICY-123" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      contractPdfAttachment: expect.objectContaining({
        storagePath: expect.stringContaining(`contract-${fingerprint}`),
        contractNumberFingerprint: fingerprint,
      }),
    }), { lastUpdateTime: "version" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("requires a contract number before creating a bound PDF attachment", async () => {
    mocks.numberFingerprint.mockReturnValue(null);
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("číslo smlouvy") });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows replacing only an attachment bound to a different contract number", async () => {
    const previous = { storagePath: "old.pdf", contractNumberFingerprint: "b".repeat(64) };
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ contractNumber: "POLICY-123", contractPdfAttachment: previous }), updateTime: "version" });
    mocks.normalize.mockReturnValue(previous);
    mocks.bindingStatus.mockReturnValue("mismatch");
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("allows explicit reupload to strengthen a legacy attachment without deleting its old object", async () => {
    const previous = { storagePath: "legacy.pdf", originalName: "legacy.pdf" };
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ contractNumber: "POLICY-123", contractPdfAttachment: previous }), updateTime: "version" });
    mocks.normalize.mockReturnValue(previous);
    mocks.bindingStatus.mockReturnValue("legacy");
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not replace an attachment already verified against this contract number", async () => {
    const current = { storagePath: `contract-pdfs/owner/contract-${fingerprint}/entry/file.pdf`, contractNumberFingerprint: fingerprint };
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ contractNumber: "POLICY-123", contractPdfAttachment: current }), updateTime: "version" });
    mocks.normalize.mockReturnValue(current);
    mocks.bindingStatus.mockReturnValue("verified");
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
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

  it("reports a safe diagnostic code without exposing unexpected storage errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upload.mockRejectedValue(new Error("private customer name /bucket/secret-storage-path"));
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "PDF se nepodařilo uložit. Kód chyby: PDF_STORAGE_WRITE_FAILED. Zkus nahrání znovu." });
    expect(log).toHaveBeenCalledWith("Contract PDF upload failed.", { failureCode: "PDF_STORAGE_WRITE_FAILED" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private customer name");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-storage-path");
    log.mockRestore();
  });

  it("classifies storage permission failures without returning the provider message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upload.mockRejectedValue(Object.assign(new Error("Sensitive provider detail"), { code: 7 }));
    const response = await POST(request("entry", "1"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "PDF se nepodařilo uložit. Kód chyby: PDF_STORAGE_PERMISSION_DENIED. Zkus nahrání znovu." });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Sensitive provider detail");
    log.mockRestore();
  });

  it.each([
    "PDF soubor je prázdný.", "PDF je příliš velké. Maximální velikost je 12 MB.",
    "Příloha musí být PDF soubor.", "Příloha musí mít příponu .pdf.", "Soubor nevypadá jako platné PDF.",
  ])("preserves safe PDF validation feedback: %s", async message => {
    mocks.upload.mockRejectedValue(new Error(message));
    expect(await (await POST(request("entry", "1"))).json()).toEqual({ ok: false, error: message });
  });
});

describe("contract PDF private contact import", () => {
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
  it.each(["cppAuto", "domexneuron"])("imports %s into the authenticated owner's card after the PDF is committed", async productKey => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey }), updateTime: "version" });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ ok: true, clientCardEmail: "saved" });
    expect(mocks.fill).toHaveBeenCalledWith(db, { email: owner, uid: "owner-uid" }, "entry", "verified-hash");
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(mocks.fill.mock.invocationCallOrder[0]);
  });
  it.each(["cppAuto", "domexneuron"])("keeps the successful %s upload if email enrichment fails", async productKey => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey }), updateTime: "version" });
    mocks.fill.mockRejectedValue(new Error("private PDF details"));
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ ok: true, attachment: { hasFile: true, contractNumberBindingStatus: "verified" }, clientCardEmail: "unavailable" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each(["cppAuto", "domexneuron"].flatMap(productKey => [
    { ...ctx, isImpersonating: true, impersonation: { actorRole: "admin" } },
    { ...ctx, email: "override@example.test", contractAccessEmails: [owner] },
  ].map(context => ({ productKey, context }))))("does not create cards while impersonating or uploading for someone else: $productKey", async ({ productKey, context }) => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ productKey }), updateTime: "version" });
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
