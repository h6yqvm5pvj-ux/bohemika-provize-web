import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  records: new Map<string, Record<string, unknown>>(),
  reads: [] as { path: string; unread: boolean; pinned?: boolean; fields?: string[] }[],
  unreadGate: null as Promise<void> | null,
}));
vi.mock("@/lib/server/firebaseAdmin", () => {
  const collection = (path: string) => ({
    doc: (id: string) => ({ collection: (name: string) => collection(`${path}/${id}/${name}`) }),
    ...query(path),
  });
  function query(path: string, unread = false, fields?: string[], limit = 180, pinned = false, cursor?: [number, string]) {
    return {
      where: (key: string, _operator: string, value: unknown) => query(path, key === "read" && value === false, fields, limit, key === "pinnedAtMs", cursor),
      select: (...selected: string[]) => query(path, unread, selected, limit, pinned, cursor),
      orderBy: () => query(path, unread, fields, limit, pinned, cursor),
      limit: (n: number) => query(path, unread, fields, n, pinned, cursor),
      startAfter: (createdAtMs: number, id: string) => query(path, unread, fields, limit, pinned, [createdAtMs, id]),
      get: async () => {
        mocks.reads.push({ path, unread, ...(pinned ? { pinned } : {}), fields });
        if (unread) await mocks.unreadGate;
        const docs = [...mocks.records.entries()]
          .filter(([, data]) => (!unread || data.read === false) && (!pinned || Number(data.pinnedAtMs) > 0))
          .filter(([id, data]) => !cursor || Number(data.createdAtMs) < cursor[0] || (Number(data.createdAtMs) === cursor[0] && id < cursor[1]))
          .sort(([aId, a], [bId, b]) => Number(b.createdAtMs ?? 0) - Number(a.createdAtMs ?? 0) || bId.localeCompare(aId))
          .slice(0, limit)
          .map(([id, data]) => ({
            id,
            data: () => fields ? Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key))) : data,
          }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }
  return { adminDb: { collection } };
});
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/lib/server/userProfileAvatars", () => ({ loadProfileAvatarsByEmail: vi.fn().mockResolvedValue({}) }));

import { GET } from "./route";
import { mailboxConversationId } from "@/lib/server/mailboxConversation";

const now = Date.UTC(2026, 8, 11, 12);
const request = (query = "") => new NextRequest(`https://example.test/api/mailbox?${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.records.clear();
  mocks.reads.length = 0;
  mocks.unreadGate = null;
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "advisor@example.test" } });
});
afterEach(() => vi.restoreAllMocks());

describe("mailbox loading", () => {
  it("counts unread items using only state fields, retaining archive and snooze fallbacks", async () => {
    const rows = [
      { read: false },
      { read: false, archivedAtMs: now - 1000 },
      { read: false, archivedAt: new Date(now - 1000) },
      { read: false, snoozedUntilMs: now + 1000 },
      { read: false, snoozedUntil: new Date(now + 1000) },
      { read: false, snoozedUntilMs: now - 1000 },
      { read: false, snoozedUntil: new Date(now) },
      { read: true },
      { read: false, archivedAtMs: NaN, archivedAt: new Date(now - 1000) },
      { read: false, snoozedUntilMs: NaN, snoozedUntil: new Date(now + 1000) },
    ];
    rows.forEach((data, index) => mocks.records.set(String(index), { ...data, body: "large unused body".repeat(1000) }));
    const response = await GET(request("countOnly=1"));
    expect(await response.json()).toEqual({ ok: true, unreadCount: 3 });
    expect(mocks.reads).toEqual([{
      path: "usersPrivate/advisor@example.test/mailbox", unread: true,
      fields: ["archivedAtMs", "archivedAt", "snoozedUntilMs", "snoozedUntil"],
    }]);
  });

  it("loads the message list while the unread query is still pending", async () => {
    mocks.records.set("message-1", { read: false, title: "Test", body: "Full message", createdAtMs: now });
    let release!: () => void;
    mocks.unreadGate = new Promise(resolve => { release = resolve; });
    const pending = GET(request());
    try {
      await vi.waitFor(() => expect(mocks.reads).toHaveLength(2));
    } finally { release(); }
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, unreadCount: 1, items: [{ id: "message-1", title: "Test", body: "Full message" }],
    });
    expect(mocks.reads[1].fields).toBeUndefined();
  });

  it("omits the unused unread scan for an opted-out history request while retaining legacy messages and pins", async () => {
    const email = "advisor@example.test";
    const conversationId = mailboxConversationId(email, "colleague@example.test");
    const legacyMetadata = { senderEmail: " COLLEAGUE@EXAMPLE.TEST ", recipientEmail: email };
    mocks.records.set("legacy", { type: "direct_message", createdAtMs: now, body: "Legacy body", metadata: legacyMetadata, read: false, pinnedAtMs: now });
    mocks.records.set("stored", { type: "direct_message", createdAtMs: now - 1, body: "Stored body", metadata: { conversationId }, read: false });
    mocks.records.set("unrelated", { type: "generic", createdAtMs: now + 1, read: false, body: "Other unread message" });
    mocks.records.set("old-pin", { type: "direct_message", createdAtMs: now - 2, pinnedAtMs: now, metadata: legacyMetadata });
    const response = await GET(request(`conversationId=${conversationId}&limit=2&includeUnreadCount=0`));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).not.toHaveProperty("unreadCount");
    expect(data.items.map((item: { id: string }) => item.id)).toEqual(["legacy", "stored", "old-pin"]);
    expect(data.items[0]).toMatchObject({ body: "Legacy body", metadata: { conversationId } });
    expect(data.nextCursor).toEqual({ createdAtMs: now - 1, id: "stored" });
    expect(data.hasMore).toBe(true);
    expect(mocks.reads).toHaveLength(2);
    expect(mocks.reads.every(read => !read.unread && read.path === `usersPrivate/${email}/mailbox`)).toBe(true);
    expect(mocks.reads[1].pinned).toBe(true);
  });

  it("preserves exact timestamp and document ID pagination when the count is omitted", async () => {
    const conversationId = mailboxConversationId("advisor@example.test", "colleague@example.test");
    for (const id of ["a", "b", "c", "d"]) {
      mocks.records.set(id, { type: "direct_message", createdAtMs: now, metadata: { conversationId } });
    }
    const response = await GET(request(`conversationId=${conversationId}&limit=2&cursorMs=${now}&cursorId=c&includeUnreadCount=0`));
    const data = await response.json();
    expect(data.items.map((item: { id: string }) => item.id)).toEqual(["b", "a"]);
    expect(data.nextCursor).toEqual({ createdAtMs: now, id: "a" });
    expect(mocks.reads).toHaveLength(1);
    expect(mocks.reads[0]).toMatchObject({ unread: false });
  });

  it.each(["", "&includeUnreadCount=1", "&includeUnreadCount=false"])("retains history count for existing callers (%s)", async suffix => {
    const conversationId = mailboxConversationId("advisor@example.test", "colleague@example.test");
    mocks.records.set("unread", { read: false });
    const response = await GET(request(`conversationId=${conversationId}&limit=2${suffix}`));
    expect(await response.json()).toMatchObject({ ok: true, unreadCount: 1, items: [] });
    expect(mocks.reads.filter(read => read.unread)).toHaveLength(1);
  });

  it.each(["includeUnreadCount=0", "countOnly=1&includeUnreadCount=0"])("retains unread count outside history requests (%s)", async query => {
    mocks.records.set("unread", { read: false });
    expect(await (await GET(request(query))).json()).toMatchObject({ ok: true, unreadCount: 1 });
    expect(mocks.reads.filter(read => read.unread)).toHaveLength(1);
  });

  it("loads history while the unread query is pending for a caller that requires both", async () => {
    const conversationId = mailboxConversationId("advisor@example.test", "colleague@example.test");
    let release!: () => void;
    mocks.unreadGate = new Promise(resolve => { release = resolve; });
    const pending = GET(request(`conversationId=${conversationId}&limit=2`));
    try {
      await vi.waitFor(() => expect(mocks.reads.some(read => !read.unread)).toBe(true));
    } finally { release(); }
    expect((await pending).status).toBe(200);
  });

  it("rejects invalid conversation IDs without querying messages", async () => {
    expect((await GET(request("conversationId=invalid/id"))).status).toBe(400);
    expect(mocks.reads).toEqual([]);
  });

  it("rejects unauthenticated reads before accessing mailbox data", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.reads).toEqual([]);
  });

  it("reports an unread-query failure instead of returning a misleading partial success", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let reject!: (error: Error) => void;
    mocks.unreadGate = new Promise((_, rejectRead) => { reject = rejectRead; });
    const pending = GET(request());
    await vi.waitFor(() => expect(mocks.reads).toHaveLength(2));
    reject(new Error("database unavailable"));
    const response = await pending;
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
    log.mockRestore();
  });
});
