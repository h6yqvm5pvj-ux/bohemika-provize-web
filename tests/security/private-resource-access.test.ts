import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  email: "advisor@example.test", claims: {} as Record<string, unknown>,
  records: new Map<string, Record<string, unknown>>(), reads: [] as string[],
  download: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const collection = (path: string) => ({
    doc: (id: string) => ({
      get: async () => {
        const key = `${path}/${id}`;
        state.reads.push(key);
        return { exists: state.records.has(key), data: () => state.records.get(key) };
      },
      collection: (child: string) => collection(`${path}/${id}/${child}`),
    }),
    where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
  });
  return { adminDb: { collection }, adminAuth: null };
});
vi.mock("@/lib/server/apiEntryGuard", () => {
  const guard = async () => ({ ok: true, ctx: { email: state.email, uid: "advisor-uid", decoded: state.claims } });
  return {
    requireAuthedRateLimited: guard, requireAdvisorAuthedRateLimited: guard,
    withRateLimitHeaders: (response: NextResponse) => response,
  };
});
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({ bucket: () => ({ file: () => ({ download: state.download }) }) }),
}));

import { GET as attachment } from "@/app/api/mailbox/attachment/route";
import { GET as preview } from "@/app/api/mailbox/shared-preview/route";
import { GET as screenshot } from "@/app/api/user-requests/attachment/route";
import { GET as conversation } from "@/app/api/mailbox/conversation/route";

const victim = "victim@example.test";
const query = (path: string) => new NextRequest(`https://bohemka.app/api/${path}`);
const message = { metadata: { attachments: [{
  id: "attachment-1", name: "synthetic.pdf", contentType: "application/pdf",
  path: "mailbox/message-1/synthetic.pdf", bucketName: "demo.firebasestorage.app",
}] } };

beforeEach(() => {
  vi.clearAllMocks(); state.records.clear(); state.reads.length = 0; state.claims = {};
  state.download.mockResolvedValue([Buffer.from("%PDF-1.7 synthetic private file")]);
  vi.stubEnv("FIREBASE_STORAGE_BUCKET", "demo.firebasestorage.app");
});
afterEach(() => vi.unstubAllEnvs());

// Authentication is stubbed as a valid ordinary user so these tests exercise
// resource authorization independently of the unauthenticated API matrix.
describe("private resources are bound to the authenticated account", () => {
  it("does not load another user's mailbox attachment even with a guessed ID and owner query", async () => {
    state.records.set(`usersPrivate/${victim}/mailbox/message-1`, message);
    const response = await attachment(query(`mailbox/attachment?messageId=message-1&attachmentId=attachment-1&email=${victim}&ownerEmail=${victim}`));
    expect(response.status).toBe(404);
    expect(state.reads).toEqual([`usersPrivate/${state.email}/mailbox/message-1`]);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("serves the same attachment to its actual mailbox owner with private cache and sandbox headers", async () => {
    state.records.set(`usersPrivate/${state.email}/mailbox/message-1`, message);
    const response = await attachment(query("mailbox/attachment?messageId=message-1&attachmentId=attachment-1"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-1.7 synthetic private file");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("rejects a shared production preview outside its sender and recipient", async () => {
    state.records.set("mailboxSharedPayloads/payload-1234", {
      type: "production_export_share", senderEmail: victim, recipientEmail: "recipient@example.test",
      snapshot: { scopeLabel: "private synthetic production" },
    });
    const response = await preview(query("mailbox/shared-preview?payloadId=payload-1234"));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private synthetic production");
  });
  it.each([{}, { admin: true, adminRole: "support" }, { admin: true, adminRole: "invalid" }])(
    "does not download another account's screenshot for claims %j", async claims => {
      state.claims = claims;
      state.records.set("userRequests/request-1", { requesterEmail: victim, screenshots: [] });
      const response = await screenshot(query("user-requests/attachment?requestId=request-1&screenshotId=file-1"));
      expect(response.status).toBe(403);
      expect(state.download).not.toHaveBeenCalled();
    },
  );
  it("does not switch the mailbox owner through a conversation query", async () => {
    state.records.set(`usersPrivate/${victim}/mailboxConversations/group_synthetic1`, {
      groupConversation: true, groupName: "private synthetic group", participants: [],
    });
    const response = await conversation(query(`mailbox/conversation?conversationId=group_synthetic1&email=${victim}`));
    expect(response.status).toBe(404);
    expect(state.reads).toEqual([`usersPrivate/${state.email}/mailboxConversations/group_synthetic1`]);
  });
});
