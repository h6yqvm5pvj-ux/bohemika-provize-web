import "../../../../tests/helpers/privateEncryptionTestKey";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), collection: vi.fn(), batch: vi.fn(), setup: vi.fn(), push: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: mocks.collection, batch: mocks.batch }, adminMessaging: { sendEachForMulticast: mocks.push } }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.guard, requireAdvisorAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: NextResponse) => response }));
vi.mock("@/lib/server/advisorSetupGuard", () => ({ checkAdvisorSetup: mocks.setup }));
vi.mock("@/lib/server/pushTokens", () => ({ collectPushTokens: () => ["synthetic-device"] }));
import { POST } from "./compose/route";
import { GET as listAuthor } from "../tipster-tips/route";
import { GET as listAdvisor } from "../advisor-tips/route";
import { GET as detail } from "../tips/detail/route";

type Data = Record<string, unknown>;
const records = new Map<string, Data>();
let sequence = 0;
const author = "author@example.test", advisor = "advisor@example.test";
type TestNode = { path: string; id: string; collection: (name: string) => TestNode; doc: (id?: string) => TestNode; orderBy: () => TestNode; limit: () => TestNode; get: () => Promise<unknown> };
function node(path: string): TestNode {
  const ref: TestNode = {
    path, id: path.split("/").at(-1)!,
    collection: (name: string): ReturnType<typeof node> => node(`${path}/${name}`),
    doc: (id = `auto-${++sequence}`): ReturnType<typeof node> => node(`${path}/${id}`),
    orderBy: (): ReturnType<typeof node> => ref,
    limit: (): ReturnType<typeof node> => ref,
    get: async (): Promise<unknown> => {
      if (path.split("/").length % 2 === 0) return { id: ref.id, ref, exists: records.has(path), data: () => records.get(path) };
      const docs = [...records].filter(([key]) => key.slice(0, key.lastIndexOf("/")) === path).map(([key, data]) => ({ id: key.split("/").at(-1), ref: node(key), data: () => data, exists: true }));
      return { docs, size: docs.length, empty: !docs.length };
    },
  };
  return ref;
}
const asUser = (email: string) => mocks.guard.mockResolvedValue({ ok: true, ctx: { email, uid: email, actorEmail: email, actorUid: email } });
const request = () => {
  const form = new FormData();
  form.set("recipientEmail", advisor);
  form.set("subject", "Private client subject");
  form.set("text", "Private client phone 123456");
  form.set("metadataJson", JSON.stringify({ tipsterTip: true, tipProduct: "life", tipProductLabel: "Život" }));
  form.set("tipSnapshotJson", JSON.stringify({ fields: [{ label: "Telefon", value: "123456" }] }));
  return new NextRequest("https://example.test/api/mailbox/compose", { method: "POST", body: form });
};
beforeEach(() => {
  vi.clearAllMocks(); records.clear(); sequence = 0;
  records.set(`users/${author}`, { accountType: "tipster", name: "Author" });
  records.set(`users/${advisor}`, { accountType: "advisor", name: "Advisor" });
  mocks.collection.mockImplementation(node);
  mocks.batch.mockImplementation(() => {
    const writes: [string, Data][] = [];
    return { set: (ref: { path: string }, data: Data) => writes.push([ref.path, data]), commit: async () => writes.forEach(([path, data]) => records.set(path, data)) };
  });
  mocks.setup.mockResolvedValue({ accountType: "tipster", profile: { tipRecipientEmail: advisor } });
  mocks.push.mockResolvedValue({}); asUser(author);
});
describe("encrypted client tips across compose, lists and detail", () => {
  it("stores no plaintext content in any copy and reads it only in the authorized accounts", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const saved = await response.json();
    const storage = JSON.stringify([...records]);
    expect(storage).not.toContain("Private client");
    expect(storage).not.toContain('"123456"');
    expect(JSON.stringify(mocks.push.mock.calls)).not.toContain("Private client");
    const own = await (await listAuthor(new NextRequest("https://example.test/api/tipster-tips"))).json();
    expect(own.items[0]).toMatchObject({ title: "Private client subject", messageText: "Private client phone 123456", fields: [{ label: "Telefon", value: "123456" }] });
    asUser(advisor);
    const received = await (await listAdvisor(new NextRequest("https://example.test/api/advisor-tips"))).json();
    expect(received.items[0]).toMatchObject({ title: "Private client subject", messageText: "Private client phone 123456" });
    const details = await (await detail(new NextRequest(`https://example.test/api/tips/detail?id=${saved.recipientMailboxId}`))).json();
    expect(JSON.stringify(details)).toContain("Private client phone 123456");
    asUser("stranger@example.test");
    expect((await detail(new NextRequest(`https://example.test/api/tips/detail?id=${saved.recipientMailboxId}`))).status).toBe(404);
  });
  it("does not write unencrypted tips when the key is unavailable", async () => {
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request())).status).toBeGreaterThanOrEqual(400);
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(records.size).toBe(2);
    log.mockRestore();
  });
});
