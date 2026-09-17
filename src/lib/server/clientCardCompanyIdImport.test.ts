import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { createEmptyClientCard } from "@/app/_klienti/clientCardData";

const mocks = vi.hoisted(() => ({ get: vi.fn(), readPdf: vi.fn(), links: vi.fn(), getAll: vi.fn(), txGet: vi.fn(), txGetAll: vi.fn(), set: vi.fn() }));
vi.mock("./clientEmailPdf", () => ({ readClientEmailPdfLines: mocks.readPdf }));
vi.mock("./clientContractIndex", () => ({ readClientContractLinks: mocks.links }));
import { fillClientCardCompanyIdFromUploadedPdf } from "./clientCardCompanyIdImport";

const adviser = { email: "owner@example.test", uid: "own-uid" };
const attachment = { kind: "contractPdf", bucketName: "bucket", storagePath: "file.pdf", originalName: "file.pdf", contentType: "application/pdf", sizeBytes: 10, sha256: "a".repeat(64), uploadedAtMs: 1000, uploadedBy: adviser.email };
const contract = { clientName: "Test servis s.r.o.", productKey: "cppPPRbez", contractPdfAttachment: attachment };
const ref = (path: string): object => ({ path, collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`), parent: { doc: (id: string) => ref(`users/${adviser.email}/entries/${id}`) }, get: () => mocks.get(path) });
const snapshot = (patch = {}) => ({ id: "entry", exists: true, updateTime: { isEqual: () => true }, data: () => ({ ...contract, ...patch }), ref: ref(`users/${adviser.email}/entries/entry`) });
const db = {
  collection: ref, getAll: mocks.getAll,
  runTransaction: async (work: (tx: unknown) => unknown) => work({ get: mocks.txGet, getAll: mocks.txGetAll, set: mocks.set }),
} as unknown as Firestore;
const lines = ["Česká podnikatelská pojišťovna KOMPLEX", "IČO: 63998530", "Pojistník: Test servis s.r.o.", "IČO: 00123456", "Článek I.", "DISTRIBUTOR POJIŠTĚNÍ", "IČO: 28506405"];
const run = () => fillClientCardCompanyIdFromUploadedPdf(db, adviser, "entry", attachment.sha256);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockImplementation(async path => path.startsWith("users/") ? snapshot() : { data: () => undefined });
  mocks.readPdf.mockResolvedValue(lines);
  mocks.links.mockResolvedValue([]);
  mocks.txGet.mockResolvedValue({ data: () => undefined });
  mocks.txGetAll.mockResolvedValue([snapshot()]);
});

describe("KOMPLEX company ID after PDF upload", () => {
  it.each(["cppPPRbez", "cppPPRs"])("fills a private client card from the stored PDF for %s", async productKey => {
    mocks.get.mockImplementation(async path => path.startsWith("users/") ? snapshot({ productKey }) : { data: () => undefined });
    expect(await run()).toBe("saved");
    expect(mocks.readPdf).toHaveBeenCalledWith(attachment);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("/own-uid/cards/") }), expect.objectContaining({
      ownerUid: adviser.uid, revision: 1, card: expect.objectContaining({ clientName: contract.clientName, companyId: "00123456", birthNumber: "" }),
      companyIdSource: expect.objectContaining({ pdfSha256: attachment.sha256 }),
    }), { merge: true });
  });
  it("preserves manually entered personal data and birth number", async () => {
    const card = { ...createEmptyClientCard(contract.clientName), birthNumber: "850101/1234", phone: "777123456", occupation: "Podnikatel" };
    mocks.txGet.mockResolvedValue({ data: () => ({ ownerUid: adviser.uid, revision: 4, card }) });
    expect(await run()).toBe("saved");
    expect(mocks.set.mock.calls[0][1]).toMatchObject({ card: { ...card, companyId: "00123456" }, revision: 5 });
  });
  it("does not overwrite an IČO entered while the PDF was being read", async () => {
    mocks.txGet.mockResolvedValue({ data: () => ({ ownerUid: adviser.uid, revision: 2, card: { ...createEmptyClientCard(contract.clientName), companyId: "87654321" } }) });
    expect(await run()).toBe("existing");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("skips parsing when the card already has an IČO", async () => {
    mocks.get.mockImplementation(async path => path.startsWith("users/") ? snapshot() : { data: () => ({ card: { companyId: "87654321" } }) });
    expect(await run()).toBe("existing");
    expect(mocks.readPdf).not.toHaveBeenCalled();
  });
  it.each([{ productKey: "cppAuto" }, { entryType: "endorsement" }, { originalAdviserEmail: "other@example.test" }])("skips contracts outside its scope: %j", async patch => {
    mocks.get.mockResolvedValue(snapshot(patch));
    expect(await run()).toBe("skipped");
    expect(mocks.readPdf).not.toHaveBeenCalled();
  });
  it("does not import an insurer IČO if the policyholder IČO is missing", async () => {
    mocks.readPdf.mockResolvedValue(lines.filter(line => !line.includes("00123456")));
    expect(await run()).toBe("missing");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not import from a PDF for a different client", async () => {
    mocks.readPdf.mockResolvedValue(lines.map(line => line.replace("Test servis", "Jiná firma")));
    expect(await run()).toBe("conflict");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not read a PDF that has already been replaced", async () => {
    expect(await fillClientCardCompanyIdFromUploadedPdf(db, adviser, "entry", "old-hash")).toBe("stale");
    expect(mocks.readPdf).not.toHaveBeenCalled();
  });
  it.each([false, true])("refuses a source deleted or modified during parsing (modified=%s)", async exists => {
    mocks.txGetAll.mockResolvedValue([{ ...snapshot(), exists, updateTime: { isEqual: () => false } }]);
    expect(await run()).toBe("stale");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("preserves an explicitly renamed card and rejects another owner's card", async () => {
    mocks.txGet.mockResolvedValue({ data: () => ({ ownerUid: adviser.uid, revision: 1, card: createEmptyClientCard("Jiná firma s.r.o.") }) });
    expect(await run()).toBe("stale");
    mocks.txGet.mockResolvedValue({ data: () => ({ ownerUid: "other", revision: 1, card: createEmptyClientCard(contract.clientName) }) });
    await expect(run()).rejects.toThrow("Invalid saved client card");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("preserves contact details from the directory when making a new card", async () => {
    mocks.get.mockImplementation(async path => path.startsWith("users/") ? snapshot({ clientPhone: "777123456", clientEmail: "client@example.test", clientAddress: "Testovací 10" }) : { data: () => undefined });
    expect(await run()).toBe("saved");
    expect(mocks.set.mock.calls[0][1].card).toMatchObject({ phone: "777123456", email: "client@example.test", permanentAddress: "Testovací 10" });
  });
});
