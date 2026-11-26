import "../../../../../tests/helpers/privateEncryptionTestKey";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lifeCommissionReminderId } from "@/lib/server/lifeCommissionReminderId";
import { sealPrivateRecord } from "@/lib/server/privateRecords";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), ref: vi.fn(), data: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAdvisorAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: NextResponse) => response }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {
  collection: (collection: string) => ({ doc: (email: string) => ({ collection: (mailbox: string) => ({ doc: (id: string) => {
    const path = `${collection}/${email}/${mailbox}/${id}`;
    mocks.ref(path);
    return { path, get: async () => ({ data: () => mocks.data(path) }) };
  } }) }) }),
  runTransaction: (work: (transaction: unknown) => unknown) => work({ get: (ref: { get: () => unknown }) => ref.get(), update: mocks.update }),
} }));
import { GET, PATCH } from "./route";

const email = "advisor@example.test";
const uid = "advisor-uid";
const id = lifeCommissionReminderId(uid, "2026-12");
const path = `usersPrivate/${email}/mailbox/${id}`;
const url = "https://example.test/api/mailbox/life-commission-reminder";
const get = () => new NextRequest(url);
const patch = (body: unknown) => new NextRequest(url, { method: "PATCH", body: JSON.stringify(body) });
const contracts = [{ entryId: "entry-1", contractNumber: "SYNTHETIC", productLabel: "ČPP", code: "B036", payoutDay: "2026-12-25" }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email, uid, isImpersonating: false } });
  let data = sealPrivateRecord(path, { recipientEmail: email, type: "life_commission_reminder", title: "Provize", body: "Následný servis",
    metadata: { lifeCommissionContracts: contracts, unrelated: "private" }, read: false });
  mocks.data.mockImplementation(refPath => refPath === path ? data : undefined);
  mocks.update.mockImplementation((_ref, update) => { data = { ...data, ...update }; });
});
afterEach(() => vi.useRealTimers());

describe("life commission reminder acknowledgement", () => {
  it.each([401, 403])("returns %s before looking up a message when the guard denies access", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await GET(get())).status).toBe(status);
    expect((await PATCH(patch({ id }))).status).toBe(status);
    expect(mocks.ref).not.toHaveBeenCalled();
  });

  it("rejects an impersonating session and an ID belonging to another account", async () => {
    mocks.guard.mockResolvedValueOnce({ ok: true, ctx: { email, uid, isImpersonating: true } });
    expect((await PATCH(patch({ id }))).status).toBe(403);
    expect((await PATCH(patch({ id: lifeCommissionReminderId("other-uid", "2026-12") }))).status).toBe(400);
    expect((await PATCH(patch({ id: "../other" }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not disclose data if the current mailbox document claims a different recipient", async () => {
    mocks.data.mockReturnValue({ type: "life_commission_reminder", recipientEmail: "other@example.test", title: "other" });
    expect(await (await GET(get())).json()).toEqual({ ok: true, reminder: null });
    expect((await PATCH(patch({ id }))).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns the private reminder, acknowledges it once, and retains the mailbox document", async () => {
    const response = await GET(get());
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, reminder: { id, title: "Provize", body: "Následný servis", contracts } });
    expect((await PATCH(patch({ id }))).status).toBe(200);
    expect((await PATCH(patch({ id }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ path }), expect.objectContaining({ read: true, lifeCommissionAcknowledgedAtMs: Date.now() }));
    expect(await (await GET(get())).json()).toEqual({ ok: true, reminder: null });
    expect(mocks.data(path)).toHaveProperty("metadata");
  });
});
