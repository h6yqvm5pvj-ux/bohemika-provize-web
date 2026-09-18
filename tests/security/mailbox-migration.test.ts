import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ db: {} as Record<string, unknown>, storage: {} as Record<string, unknown>, backups: [] as string[], commit: vi.fn(), deleted: [] as string[] }));
vi.mock("@next/env", () => ({ default: { loadEnvConfig() {} } }));
vi.mock("firebase-admin/app", () => ({ cert: vi.fn(), getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock("firebase-admin/firestore", async importOriginal => ({ ...await importOriginal<typeof import("firebase-admin/firestore")>(), getFirestore: () => mock.db, FieldValue: { serverTimestamp: () => "server-time", delete: () => "deleted-field" } }));
vi.mock("firebase-admin/storage", () => ({ getStorage: () => mock.storage }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), writeFile: async (_path: string, value: string, options: { mode: number; flag: string }) => {
  expect(options).toEqual({ mode: 0o600, flag: "wx" }); mock.backups.push(value);
} }));
// This import has no side effects; production execution is guarded by entrypoint.
import { main } from "../../scripts/migrate-mailbox-encryption.mjs";
import { decryptMailboxBytes, decryptMailboxJson } from "@/lib/server/mailboxEncryption";
import { Timestamp } from "firebase-admin/firestore";

const messageId = "12345678-1234-4234-9234-123456789abc";
const oldPath = `mailbox/${messageId}/legacy.png`;
const originalBytes = Buffer.from("synthetic private attachment");
let files: Map<string, { bytes: Buffer; generation: string }>;
let updates: { ref: unknown; data: Record<string, any>; precondition: unknown }[];
const savedArgs = [...process.argv];
// The Admin SDK Timestamp has no toJSON method (unlike the browser SDK).
const version = new Timestamp(100, 123456789);
const data = { type: "direct_message", title: "Private subject", body: "Private text", metadata: {
  messageId, senderEmail: "sender@example.test", recipientEmail: "recipient@example.test", messageText: "Private text",
  attachments: [{ id: "attachment-1", name: "legacy.png", path: oldPath, contentType: "image/png", bucketName: "demo.firebasestorage.app" }],
} };

beforeEach(() => {
  vi.clearAllMocks(); mock.backups.length = 0; mock.deleted.length = 0; updates = [];
  process.argv = ["node", "test-runner", "--apply", "--backup-dir=/tmp/synthetic-mailbox-backup"];
  process.exitCode = 0;
  vi.stubEnv("MAILBOX_ENCRYPTION_KEY", Buffer.alloc(32, 19).toString("base64"));
  vi.stubEnv("MAILBOX_ENCRYPTION_KEY_ID", "test-key");
  vi.stubEnv("MAILBOX_ENCRYPTION_PREVIOUS_KEYS", "");
  vi.stubEnv("FIREBASE_ADMIN_CREDENTIALS", "{}");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "demo.firebasestorage.app");
  vi.stubEnv("FIREBASE_STORAGE_BUCKET", "demo.firebasestorage.app");
  files = new Map([[oldPath, { bytes: originalBytes, generation: "1" }]]);
  mock.commit.mockResolvedValue(undefined);
  mock.db.collectionGroup = () => ({ get: async () => ({ size: 1, docs: [{ id: "mailbox-doc", ref: { path: "usersPrivate/sender@example.test/mailbox/mailbox-doc" }, updateTime: version, data: () => structuredClone(data) }] }) });
  mock.db.batch = () => ({ update: (ref: unknown, data: Record<string, any>, precondition: unknown) => updates.push({ ref, data, precondition }), commit: mock.commit });
  mock.db.terminate = vi.fn();
  mock.storage.bucket = () => ({ file: (path: string) => ({
    getMetadata: async () => { if (!files.has(path)) throw new Error("missing synthetic source"); return [{ generation: files.get(path)!.generation }]; },
    download: async () => { if (!files.has(path)) throw new Error("missing synthetic source"); return [files.get(path)!.bytes]; },
    save: async (bytes: Buffer, options: { preconditionOpts: { ifGenerationMatch: number } }) => {
      expect(options.preconditionOpts.ifGenerationMatch).toBe(0); if (files.has(path)) throw new Error("generation conflict");
      files.set(path, { bytes, generation: "2" });
    },
    delete: async (options: { ifGenerationMatch?: string }) => {
      if (path === oldPath) expect(options.ifGenerationMatch).toBe("1");
      mock.deleted.push(path); files.delete(path);
    },
    exists: async () => [files.has(path)],
  }) });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { process.argv = savedArgs; process.exitCode = 0; vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("legacy mailbox migration data safety", () => {
  it("backs up before writes, verifies encrypted content, and conditionally updates the unchanged source", async () => {
    await main();
    expect(mock.backups).toHaveLength(1);
    expect(mock.backups[0]).not.toMatch(/Private subject|Private text|sender@example|legacy.png/);
    const backup = JSON.parse(mock.backups[0]);
    expect(decryptMailboxJson<{ documents: { updateTime: unknown }[] }>(backup.payload, backup.context).documents[0].updateTime).toEqual({ seconds: 100, nanoseconds: 123456789 });
    expect(decryptMailboxJson<{ documents: { data: unknown }[] }>(backup.payload, backup.context).documents[0].data).toEqual(data);
    expect(updates).toHaveLength(1);
    expect(updates[0].precondition).toEqual({ lastUpdateTime: version });
    expect(decryptMailboxJson(updates[0].data.encryptedContent, `message:${messageId}`)).toEqual({ subject: "Private subject", messageText: "Private text" });
    const attachment = updates[0].data["metadata.attachments"][0];
    expect(decryptMailboxBytes(files.get(attachment.path)!.bytes, attachment.encryption, `attachment:${messageId}:attachment-1`)).toEqual(originalBytes);
    expect(files.has(oldPath)).toBe(false);
    expect(mock.commit).toHaveBeenCalledOnce();
  });
  it("performs no writes without an explicit backup directory", async () => {
    process.argv = ["node", "test-runner", "--apply"];
    await expect(main()).rejects.toThrow("backup-dir");
    expect(mock.commit).not.toHaveBeenCalled(); expect(files.get(oldPath)!.bytes).toEqual(originalBytes);
  });
  it("stops before any writes if source content is unavailable", async () => {
    files.delete(oldPath);
    await expect(main()).rejects.toThrow();
    expect(mock.commit).not.toHaveBeenCalled(); expect(mock.deleted).toEqual([]);
  });
  it("preserves the source file when a concurrent document edit prevents commit", async () => {
    mock.commit.mockRejectedValueOnce(new Error("lastUpdateTime mismatch"));
    await main();
    expect(process.exitCode).toBe(1);
    expect(files.get(oldPath)!.bytes).toEqual(originalBytes);
    expect(mock.deleted).not.toContain(oldPath);
    expect(files.size).toBe(1);
  });
});
