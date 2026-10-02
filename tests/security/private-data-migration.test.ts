import { createHash } from "node:crypto";
import "../helpers/privateEncryptionTestKey";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as encryption from "@/lib/server/privateEncryption";
import * as storage from "@/lib/server/privateStorage";
import * as migration from "@/lib/server/privateDataMigration";
import * as business from "@/lib/server/businessDataEncryption";

const mocks = vi.hoisted(() => ({ db: {} as Record<string, unknown>, bucket: {} as Record<string, unknown>, load: vi.fn() }));
vi.mock("@next/env", () => ({ default: { loadEnvConfig: () => {} } }));
vi.mock("jiti", () => ({ createJiti: () => mocks.load }));
vi.mock("firebase-admin/storage", () => ({ getStorage: () => ({ bucket: () => mocks.bucket }) }));
import { main } from "../../scripts/migrate-private-data-encryption.mjs";
type Data = Record<string, unknown>;
const records = new Map<string, Data>();
const cardPath = "clientCardsPrivate/owner/cards/client";
const pdfPath = "contract-pdfs/owner/entry/file.pdf";
let bytes: Buffer;
let generation: number;
let writes: number;
let concurrentFileChange: boolean;
const argv = process.argv;
const snapshot = (path: string) => ({ ref: { path }, id: path.split("/").at(-1), exists: records.has(path), data: () => records.get(path) });
const query = (group: string) => {
  const result = {
    orderBy: () => result, limit: () => result,
    get: async () => {
      const docs = [...records.keys()].filter(path => path.split("/").at(-2) === group).map(snapshot);
      return { docs, size: docs.length };
    },
  };
  return result;
};
beforeEach(() => {
  vi.clearAllMocks(); records.clear(); writes = 0; generation = 1; concurrentFileChange = false;
  bytes = Buffer.from("%PDF-1.7\nsynthetic-sensitive-pdf");
  records.set(cardPath, { ownerUid: "owner", revision: 1, card: { birthNumber: "synthetic-private-number" } });
  mocks.db = {
    projectId: "demo-private-encryption", collection: query, collectionGroup: query,
    doc: (path: string) => ({ path }),
    runTransaction: async (work: (tx: object) => Promise<boolean>) => {
      // A newer edit must be preserved by the migration's transaction re-read.
      const original = records.get(cardPath)!;
      if (original.revision === 1) records.set(cardPath, { ...original, revision: 2, card: { birthNumber: "newer-private-number" } });
      return work({ get: async (ref: { path: string }) => snapshot(ref.path),
        set: (ref: { path: string }, data: Data) => { writes++; records.set(ref.path, data); },
        create: (ref: { path: string }, data: Data) => { if (records.has(ref.path)) throw new Error("Already exists"); writes++; records.set(ref.path, data); },
        delete: (ref: { path: string }) => { writes++; records.delete(ref.path); },
      });
    },
  };
  const file = {
    name: pdfPath,
    getMetadata: async () => [{ generation: String(generation), size: String(bytes.length), metadata: { firebaseStorageDownloadTokens: "obsolete-token" } }],
    download: async () => [bytes],
    save: async (next: Buffer, options: { preconditionOpts: { ifGenerationMatch: string }; metadata: { metadata: Data } }) => {
      if (concurrentFileChange) { generation++; bytes = Buffer.from("newer-file"); }
      if (options.preconditionOpts.ifGenerationMatch !== String(generation)) throw new Error("Precondition failed");
      expect(options.metadata.metadata).not.toHaveProperty("firebaseStorageDownloadTokens");
      writes++; bytes = next; generation++;
    },
  };
  mocks.bucket = {
    exists: async () => [true], file: () => file,
    getFilesStream: async function* ({ prefix }: { prefix: string }) { if (pdfPath.startsWith(prefix)) yield file; },
  };
  mocks.load.mockImplementation((path: string) => {
    if (path.endsWith("businessDataFirestore.ts")) return { rawBusinessMigrationDatabase: (db: unknown) => db };
    if (path.endsWith("firebaseAdmin.ts")) return { adminDb: mocks.db };
    if (path.endsWith("privateDataMigration.ts")) return migration;
    if (path.endsWith("businessDataEncryption.ts")) return business;
    if (path.endsWith("privateStorage.ts")) return storage;
    if (path.endsWith("privateEncryption.ts")) return encryption;
    if (path.endsWith("contractPdfStorage.ts")) return { resolveStorageBucketCandidates: () => ["synthetic-bucket"] };
    throw new Error("Unexpected import");
  });
  process.argv = ["node", "migration", "--project=demo-private-encryption", `--key-fingerprint=${createHash("sha256").update(Buffer.alloc(32, 71)).digest("hex")}`, `--index-key-fingerprint=${createHash("sha256").update(Buffer.alloc(32, 83)).digest("hex")}`];
  process.exitCode = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { process.argv = argv; process.exitCode = 0; vi.restoreAllMocks(); });
describe("private data migration executor", () => {
  it("defaults to a read-only preview and logs counts without customer data", async () => {
    const before = Buffer.from(bytes);
    expect(await main()).toMatchObject({ mode: "preview", documentsPending: 1, filesPending: 1, failed: 0 });
    expect(writes).toBe(0); expect(bytes.equals(before)).toBe(true);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("synthetic-private-number");
  });
  it("requires an explicit compatible deployment and exact target project before writes", async () => {
    process.argv.push("--apply");
    await expect(main()).rejects.toThrow("compatible");
    process.argv = ["node", "migration", "--project=wrong", "--apply", "--compatible-code-deployed"];
    await expect(main()).rejects.toThrow("exact target");
    process.argv = ["node", "migration", "--project=demo-private-encryption", "--apply", "--compatible-code-deployed", "--key-fingerprint=wrong"];
    await expect(main()).rejects.toThrow("key-fingerprint");
    expect(writes).toBe(0);
  });
  it("preserves concurrent document edits, verifies files, and safely reruns", async () => {
    process.argv.push("--apply", "--compatible-code-deployed");
    const original = Buffer.from(bytes);
    expect(await main()).toMatchObject({ documentsWritten: 1, filesWritten: 1, failed: 0 });
    expect(records.get(cardPath)?.revision).toBe(2);
    expect(encryption.openPrivateValue(records.get(cardPath)?.card, `${cardPath}:card`)).toEqual({ birthNumber: "newer-private-number" });
    expect(storage.decryptPrivateFile(bytes, "synthetic-bucket", pdfPath).equals(original)).toBe(true);
    expect(await main()).toMatchObject({ documentsPending: 0, filesPending: 0, failed: 0 });
    expect(writes).toBe(2);
  });
  it("never overwrites a storage object that changes during migration", async () => {
    process.argv.push("--apply", "--compatible-code-deployed"); concurrentFileChange = true;
    expect(await main()).toMatchObject({ filesWritten: 0, failed: 1 });
    expect(bytes.toString()).toBe("newer-file");
  });
  it("moves legacy claim identifiers and refuses to overwrite a conflicting destination", async () => {
    const oldPath = "contractNumberClaims/synthetic-contract";
    const claim = { contractNumberNormalized: "synthetic-contract", entryPath: "users/owner/entries/one" };
    records.set(oldPath, claim);
    const move = business.planLegacyClaimMigration(oldPath, claim)!;
    records.set(move.path, { ...move.data, entryPath: "users/other/entries/two" });
    process.argv.push("--apply", "--compatible-code-deployed");
    expect(await main()).toMatchObject({ failed: 1 });
    expect(records.has(oldPath)).toBe(true);
    records.delete(move.path);
    expect(await main()).toMatchObject({ failed: 0 });
    expect(records.has(oldPath)).toBe(false);
    expect(business.openBusinessRecord(move.path, records.get(move.path)!)).toEqual(claim);
    expect(await main()).toMatchObject({ documentsPending: 0, failed: 0 });
  });
  it("requires the deployed index key fingerprint and validates keys even for preview", async () => {
    process.argv.push("--apply", "--compatible-code-deployed");
    process.argv = process.argv.filter(arg => !arg.startsWith("--index-key-fingerprint="));
    await expect(main()).rejects.toThrow("--index-key-fingerprint");
    process.argv = ["node", "migration", "--project=demo-private-encryption"];
    vi.stubEnv("BUSINESS_DATA_INDEX_KEY", "invalid");
    await expect(main()).rejects.toThrow("index key");
    expect(writes).toBe(0);
  });
  it.each([4, 8])("bounds file concurrency to %i and finishes other files after one failure", async concurrency => {
    let active = 0, peak = 0;
    const contents = new Map<string, Buffer>(Array.from({ length: 6 }, (_, i) => [`contract-pdfs/synthetic/${i}.pdf`, Buffer.from(`%PDF-1.7 synthetic ${i}`)]));
    const files = [...contents.keys()].map((name, i) => ({
      name,
      getMetadata: async () => [{ generation: "1", size: String(contents.get(name)!.length) }],
      download: async () => {
        active++; peak = Math.max(peak, active);
        try {
          await new Promise<void>(resolve => setImmediate(resolve));
          if (i === 1) throw new Error("Synthetic storage failure");
          return [contents.get(name)!];
        } finally { active--; }
      },
      save: async (next: Buffer) => { contents.set(name, next); },
    }));
    mocks.bucket = {
      exists: async () => [true],
      file: (name: string) => files.find(file => file.name === name),
      getFilesStream: async function* ({ prefix }: { prefix: string }) {
        for (const file of files) if (file.name.startsWith(prefix)) yield file;
      },
    };
    process.argv.push("--apply", "--compatible-code-deployed", `--file-concurrency=${concurrency}`);
    expect(await main()).toMatchObject({ filesChecked: 6, filesWritten: 5, failed: 1 });
    expect(peak).toBe(Math.min(concurrency, files.length));
    for (const [name, content] of contents) {
      expect(storage.isPrivateFile(content)).toBe(!name.endsWith("/1.pdf"));
    }
  });
  it("visits all new private collections, preserves history and is idempotent", async () => {
    const added = [
      ["users/owner@example.test/entries/entry", { note: "Sensitive legacy" }],
      ["users/owner@example.test/entries/entry/contractNotes/note", { text: "Sensitive note" }],
      ["contractHistories/h/events/event", { title: "Sensitive title", changes: [{ after: "Sensitive change" }] }],
      ["anniversaryReviews/review", { note: "Sensitive review" }],
      ["anniversaryReviewHistories/h/events/event", { note: "Sensitive review history" }],
      ["userRequests/request", { message: "Sensitive request" }],
      ["mailboxSharedPayloads/payload", { snapshot: { name: "Sensitive export" } }],
      ["usersPrivate/owner@example.test/mailbox/message", { type: "production_plan_share", title: "Sensitive plan", body: "Sensitive body", metadata: { noteText: "Sensitive metadata" } }],
      ["onlineCardMeetingRequests/request", { requester: { fullName: "Sensitive enquiry" }, travel: { note: "Sensitive travel" } }],
      ["usersPrivate/owner@example.test/mailbox/enquiry", { type: "online_card_meeting_request", title: "Sensitive enquiry", metadata: { requesterName: "Sensitive name" } }],
      ["usersPrivate/owner@example.test/commissionStatements/statement", { html: "Sensitive HTML", autoPremiumRows: [{ contractNumber: "Sensitive number" }] }],
      ["users/owner@example.test/entries/business", { clientName: "Sensitive client", contractNumber: "Sensitive number" }],
    ] as const;
    for (const [path, data] of added) records.set(path, data);
    process.argv.push("--apply", "--compatible-code-deployed");
    expect(await main()).toMatchObject({ documentsWritten: 13, failed: 0 });
    expect(JSON.stringify([...records])).not.toContain("Sensitive");
    expect(await main()).toMatchObject({ documentsPending: 0, filesPending: 0, failed: 0 });
  });
});
