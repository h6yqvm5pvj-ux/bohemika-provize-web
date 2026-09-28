import "../../../tests/helpers/privateEncryptionTestKey";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { privateFirestore } from "../../../tests/helpers/privateFirestore";
const mocks = vi.hoisted(() => ({ db: null as Firestore | null, push: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({ get adminDb() { return mocks.db; }, adminMessaging: { sendEachForMulticast: mocks.push } }));
import { runDueMailboxSnoozeReminders } from "./mailboxSnoozeReminders";
import { sealPrivateRecord } from "./privateRecords";

let store: ReturnType<typeof privateFirestore>;
const owner = "owner@example.test", base = `usersPrivate/${owner}/mailbox`;
const run = () => runDueMailboxSnoozeReminders(new NextRequest("https://example.test/api/cron/mailbox-snooze-reminders"));
beforeEach(() => {
  vi.clearAllMocks(); store = privateFirestore(); mocks.db = store.db;
  store.records.set(`usersPrivate/${owner}`, { fcmToken: "synthetic-device" });
  mocks.push.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
});
describe("mailbox reminder privacy", () => {
  it("never puts legacy message content or recipient names in snooze or reply notifications", async () => {
    store.records.set(`${base}/legacy`, { type: "direct_message", title: "Sensitive subject", body: "Sensitive client details", snoozedUntilMs: Date.now() - 1000 });
    store.records.set(`${base}/reply`, { type: "direct_message", title: "Sensitive subject", body: "Sensitive client details", replyReminderAtMs: Date.now() - 1000, metadata: { mailboxDirection: "sent", recipientName: "Sensitive recipient" } });
    expect(await run()).toMatchObject({ sent: 2, failed: 0 });
    expect(JSON.stringify(mocks.push.mock.calls)).not.toContain("Sensitive");
    expect(await run()).toMatchObject({ sent: 0, failed: 0 });
    expect(mocks.push).toHaveBeenCalledTimes(2);
  });
  it("opens encrypted routing without persisting plaintext and skips sent copies", async () => {
    for (const direction of ["received", "sent"]) {
      const path = `${base}/${direction}`;
      store.records.set(path, sealPrivateRecord(path, { type: "production_plan_share", title: "Sensitive title", body: "Sensitive body", snoozedUntilMs: Date.now() - 1000, metadata: { mailboxDirection: direction, noteText: "Sensitive plan" } }));
    }
    vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
    expect(await run()).toMatchObject({ sent: 1, failed: 0 });
    expect(JSON.stringify(mocks.push.mock.calls)).not.toContain("Sensitive");
    expect(JSON.stringify([...store.records])).not.toContain("Sensitive");
  });
  it("isolates damaged encrypted reminders so other reminders still run", async () => {
    store.records.set(`${base}/broken`, { type: "production_plan_share", metadata: { privateEncryption: 1, payload: {} }, snoozedUntilMs: Date.now() - 1000 });
    store.records.set(`${base}/valid`, { type: "generic", title: "Sensitive", snoozedUntilMs: Date.now() - 1000 });
    expect(await run()).toMatchObject({ sent: 1, failed: 1 });
  });
});
