import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getStorage: vi.fn(),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: storageMocks.getStorage,
}));

import {
  deleteMailboxStorageObjects,
  isSafeMailboxStoragePath,
  parseMailboxAttachmentCleanupCandidate,
} from "./mailboxAttachmentStorage";

const MESSAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const OBJECT_PATH = `mailbox/${MESSAGE_ID}/1700000000000-0-dokument.pdf`;

describe("mailbox attachment storage cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FIREBASE_STORAGE_BUCKET", "demo.firebasestorage.app");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "");
    vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("načte jen přílohy zprávy vlastněné jedním z účastníků", () => {
    const candidate = parseMailboxAttachmentCleanupCandidate(
      {
        messageId: MESSAGE_ID,
        senderEmail: "sender@example.com",
        recipientEmail: "recipient@example.com",
        attachments: [
          {
            path: OBJECT_PATH,
            bucketName: "demo.firebasestorage.app",
          },
        ],
      },
      "recipient@example.com"
    );

    expect(candidate).toEqual({
      messageId: MESSAGE_ID,
      participantEmails: ["sender@example.com", "recipient@example.com"],
      storageObjects: [
        {
          messageId: MESSAGE_ID,
          path: OBJECT_PATH,
          bucketName: "demo.firebasestorage.app",
        },
      ],
    });
  });

  it("odmítne cizího vlastníka a cestu patřící jiné zprávě", () => {
    expect(
      parseMailboxAttachmentCleanupCandidate(
        {
          messageId: MESSAGE_ID,
          senderEmail: "sender@example.com",
          recipientEmail: "recipient@example.com",
          attachments: [{ path: OBJECT_PATH }],
        },
        "attacker@example.com"
      )
    ).toBeNull();

    expect(isSafeMailboxStoragePath("mailbox/other-id/file.pdf", MESSAGE_ID)).toBe(false);
    expect(
      isSafeMailboxStoragePath(`mailbox/${MESSAGE_ID}/../other/file.pdf`, MESSAGE_ID)
    ).toBe(false);
  });

  it("podporuje bezpečný úklid příloh skupinové zprávy", () => {
    const candidate = parseMailboxAttachmentCleanupCandidate(
      {
        messageId: MESSAGE_ID,
        participantEmails: [
          "sender@example.com",
          "first@example.com",
          "second@example.com",
        ],
        attachments: [{ path: OBJECT_PATH }],
      },
      "second@example.com"
    );

    expect(candidate?.participantEmails).toEqual([
      "sender@example.com",
      "first@example.com",
      "second@example.com",
    ]);
    expect(candidate?.storageObjects).toHaveLength(1);
  });

  it("maže pouze deduplikované objekty z povoleného bucketu", async () => {
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    const file = vi.fn(() => ({ delete: deleteFile }));
    const bucket = vi.fn(() => ({ file }));
    storageMocks.getStorage.mockReturnValue({ bucket });

    const result = await deleteMailboxStorageObjects([
      {
        messageId: MESSAGE_ID,
        path: OBJECT_PATH,
        bucketName: "demo.firebasestorage.app",
      },
      {
        messageId: MESSAGE_ID,
        path: OBJECT_PATH,
        bucketName: "demo.firebasestorage.app",
      },
      {
        messageId: MESSAGE_ID,
        path: `mailbox/${MESSAGE_ID}/evil.pdf`,
        bucketName: "foreign-project.appspot.com",
      },
      {
        messageId: "not-a-message-id",
        path: "mailbox/not-a-message-id/file.pdf",
        bucketName: "demo.firebasestorage.app",
      },
    ]);

    expect(result).toEqual({ requested: 4, attempted: 1, failed: 0 });
    expect(bucket).toHaveBeenCalledWith("demo.firebasestorage.app");
    expect(file).toHaveBeenCalledWith(OBJECT_PATH);
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
