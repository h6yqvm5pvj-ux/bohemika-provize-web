import "../../../../tests/helpers/privateEncryptionTestKey";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { privateFirestore } from "../../../../tests/helpers/privateFirestore";
const mocks = vi.hoisted(() => ({ db: null as Firestore | null, guard: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; } }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.guard, requireAdvisorAuthedRateLimited: mocks.guard, withRateLimitHeaders: (r: NextResponse) => r }));
vi.mock("@/lib/server/userProfileAvatars", () => ({ loadProfileAvatarsByEmail: async () => ({}) }));
import { POST as shareExport } from "../export-produkce/share/route";
import { POST as sharePlan } from "../plan-produkce/share/route";
import { GET as readMailbox } from "./route";
import { GET as preview } from "./shared-preview/route";

const author = "author@example.test", recipient = "recipient@example.test";
let store: ReturnType<typeof privateFirestore>;
const asUser = (email: string) => mocks.guard.mockResolvedValue({ ok: true, ctx: { email, uid: email } });
const request = (path: string, body?: object) => new NextRequest(`https://example.test/api/${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
beforeEach(() => {
  vi.clearAllMocks(); store = privateFirestore(); mocks.db = store.db; asUser(author);
  store.records.set(`users/${author}`, { name: "Author" }); store.records.set(`users/${recipient}`, { name: "Recipient" });
  vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
});
describe("private shared plans and export copies", () => {
  it("encrypts both mailbox copies and export payload, while keeping authorized previews", async () => {
    const shared = await shareExport(request("export-produkce/share", { recipientEmail: recipient, noteText: "Sensitive export note", snapshot: { scopeLabel: "Sensitive scope", totalAnnual: 54321, totalContracts: 2 } }));
    expect(shared.status).toBe(200);
    const path = [...store.records.keys()].find(key => key.startsWith("mailboxSharedPayloads/"))!;
    const payloadId = path.split("/").at(-1);
    expect(JSON.stringify([...store.records])).not.toContain("Sensitive");
    for (const email of [author, recipient]) {
      asUser(email);
      const messages = await (await readMailbox(request("mailbox"))).json();
      expect(messages.items[0].metadata).toMatchObject({ noteText: "Sensitive export note", totalAnnual: 54321 });
      const response = await preview(request(`mailbox/shared-preview?payloadId=${payloadId}`));
      expect(response.status).toBe(200); expect((await response.json()).html).toContain("Sensitive scope");
    }
    asUser("stranger@example.test");
    expect((await preview(request(`mailbox/shared-preview?payloadId=${payloadId}`))).status).toBe(403);
    expect((await (await readMailbox(request("mailbox"))).json()).items).toEqual([]);
    // Corruption must not turn an unauthorized request into a decrypt attempt.
    store.records.set(path, { ...store.records.get(path), snapshot: { privateEncryption: 1, payload: {} } });
    expect((await preview(request(`mailbox/shared-preview?payloadId=${payloadId}`))).status).toBe(403);
  });
  it("keeps plan fields available only through the recipient's decrypted mailbox", async () => {
    expect((await sharePlan(request("plan-produkce/share", { recipientEmail: recipient, noteText: "Sensitive plan note", plan: { lifeContracts: 3, lifePremium: 15000, totalImmediate: 42000 } }))).status).toBe(200);
    expect(JSON.stringify([...store.records])).not.toContain("Sensitive");
    asUser(recipient);
    const items = (await (await readMailbox(request("mailbox"))).json()).items;
    expect(items[0].metadata).toMatchObject({ noteText: "Sensitive plan note", lifeContracts: 3, totalImmediate: 42000 });
  });
});
