import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { createEmptyClientCard } from "@/app/_klienti/clientCardData";

const mocks = vi.hoisted(() => ({ get: vi.fn(), links: vi.fn(), readPdf: vi.fn(), save: vi.fn(), getAll: vi.fn() }));
vi.mock("./clientContractIndex", () => ({ readClientContractLinks: mocks.links }));
vi.mock("./clientEmailPdf", () => ({ readClientEmailFromStoredPdf: mocks.readPdf }));
vi.mock("./clientCardEmailBackfill", async importOriginal => ({ ...await importOriginal<typeof import("./clientCardEmailBackfill")>(), saveClientCardEmail: mocks.save }));
import { fillClientCardEmailFromUploadedPdf } from "./clientCardEmailImport";

const adviser = { email: "own@example.test", uid: "uid" };
const attachment = { kind: "contractPdf", bucketName: "bucket", storagePath: "file.pdf", originalName: "file.pdf", contentType: "application/pdf", sizeBytes: 10, sha256: "a".repeat(64), uploadedAtMs: 1000, uploadedBy: adviser.email };
const contract = { clientName: "Petr Novák", productKey: "cppAuto", contractPdfAttachment: attachment };
const ref = (path: string): object => ({ path, collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`), parent: { doc: (id: string) => ref(`users/${adviser.email}/entries/${id}`) }, get: () => mocks.get(path) });
const db = { collection: ref, getAll: mocks.getAll } as unknown as Firestore;
const snap = (data = contract, id = "entry") => ({ id, exists: true, data: () => data, ref: ref(`users/${adviser.email}/entries/${id}`) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockImplementation(async path => path.startsWith("users/") ? snap() : { data: () => undefined });
  mocks.links.mockResolvedValue([]); mocks.readPdf.mockResolvedValue({ status: "found", email: "petr@example.test" }); mocks.save.mockResolvedValue("saved");
});

describe("client email after a CPP Auto PDF upload", () => {
  it("fills the private card using a verified stored PDF", async () => {
    expect(await fillClientCardEmailFromUploadedPdf(db, adviser, "entry", attachment.sha256)).toBe("saved");
    expect(mocks.readPdf).toHaveBeenCalledWith(attachment, contract.clientName);
    expect(mocks.save).toHaveBeenCalledWith(db, adviser, expect.objectContaining({ email: "petr@example.test" }));
  });
  it("skips an existing email before downloading or parsing any PDF", async () => {
    mocks.get.mockImplementation(async path => path.startsWith("users/") ? snap() : { data: () => ({ card: { ...createEmptyClientCard("Petr Novák"), email: "existing@example.test" } }) });
    expect(await fillClientCardEmailFromUploadedPdf(db, adviser, "entry", attachment.sha256)).toBe("existing");
    expect(mocks.readPdf).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.links).not.toHaveBeenCalled();
  });
  it.each([{ productKey: "neon" }, { entryType: "endorsement" }, { originalAdviserEmail: "other@example.test" }])("does not import outside the personally concluded CPP Auto scope: %j", patch => {
    mocks.get.mockResolvedValue(snap({ ...contract, ...patch }));
    return expect(fillClientCardEmailFromUploadedPdf(db, adviser, "entry", attachment.sha256)).resolves.toBe("skipped");
  });
  it("does not read a replaced attachment", async () => {
    expect(await fillClientCardEmailFromUploadedPdf(db, adviser, "entry", "different-hash")).toBe("stale");
    expect(mocks.readPdf).not.toHaveBeenCalled();
  });
  it("preserves existing phone/address and rejects different known emails", async () => {
    mocks.links.mockResolvedValue([{ id: "other" }]);
    mocks.getAll.mockResolvedValue([snap({ ...contract, clientPhone: "777123456", clientAddress: "Test 1", clientEmail: "different@example.test" } as typeof contract, "other")]);
    expect(await fillClientCardEmailFromUploadedPdf(db, adviser, "entry", attachment.sha256)).toBe("conflict");
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.getAll.mockResolvedValue([snap({ ...contract, clientPhone: "777123456", clientAddress: "Test 1" } as typeof contract, "other")]);
    expect(await fillClientCardEmailFromUploadedPdf(db, adviser, "entry", attachment.sha256)).toBe("saved");
    expect(mocks.save.mock.calls[0][2].directory).toMatchObject({ phone: "777123456", address: "Test 1" });
  });
  it.each(["not-found", "name-mismatch", "ambiguous"])("does not persist an unreliable PDF result: %s", async status => {
    mocks.readPdf.mockResolvedValue({ status, email: null });
    expect(await fillClientCardEmailFromUploadedPdf(db, adviser, "entry", attachment.sha256)).toBe(status === "ambiguous" ? "conflict" : "missing");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
