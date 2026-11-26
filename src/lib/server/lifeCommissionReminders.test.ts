import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryDoc } from "@/app/cashflow/types";
import { cashflowCalendarDate } from "./cashflowCalendar";

const mocks = vi.hoisted(() => ({ entries: vi.fn(), getAll: vi.fn(), account: vi.fn(), profile: vi.fn(), write: vi.fn(), push: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({
  adminDb: {
    collectionGroup: () => ({ where: () => ({ select: () => ({ get: mocks.entries }) }) }),
    collection: () => ({ doc: (owner: string) => ({ collection: () => ({ doc: (id: string) => ({ id, owner }) }) }) }),
    getAll: mocks.getAll,
  },
  adminAuth: { getUserByEmail: mocks.account },
  adminMessaging: { sendEachForMulticast: mocks.push },
}));
vi.mock("./intranetNotificationAudience", () => ({ loadIntranetNotificationProfile: mocks.profile }));
vi.mock("./mailbox", () => ({ writeMailboxEntryOnce: mocks.write }));

import { runLifeCommissionReminders, upcomingLifeCommissionContracts } from "./lifeCommissionReminders";

const owner = "advisor@example.test";
const other = "other@example.test";
const now = new Date("2026-12-01T07:45:00Z");
const asOf = cashflowCalendarDate(now.getTime(), "Europe/Prague")!;
const policy = (id: string, patch: Partial<EntryDoc> = {}): EntryDoc => ({
  id, productKey: "neon", userEmail: owner, source: "own", contractNumber: `TEST-${id}`,
  policyStartDate: "2023-11-10", items: [{ title: "Provize po 3 letech", code: "B036", amount: 500 }], ...patch,
});
const snapshot = (pathOwner: string, entry: EntryDoc) => ({ id: entry.id, ref: { path: `users/${pathOwner}/entries/${entry.id}` }, data: () => entry });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.entries.mockResolvedValue({ docs: [] });
  mocks.account.mockImplementation(async email => ({ uid: `uid-${email}`, email }));
  mocks.profile.mockResolvedValue({ pushTokens: ["fixture-token"] });
  mocks.getAll.mockImplementation(async (...args) => args.slice(0, -1).map(({ id, owner }) => ({ id, exists: true, data: () => ({ userEmail: owner }) })));
  const mail = new Set<string>();
  mocks.write.mockImplementation(async ({ entryId }) => {
    const written = !mail.has(entryId);
    mail.add(entryId);
    return { written };
  });
  mocks.push.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
});

describe("monthly reminder for life commissions", () => {
  it("includes the current Cashflow payday for all full legacy B036 and B048 rows", () => {
    const input = [policy("third"), policy("fourth", {
      productKey: "flexi", policyStartDate: "2022-10-31", items: [{ title: "Provize po 4 letech", code: "B48", amount: 600 }],
    }), policy("legacy", { items: [{ title: "Provize po 3 letech", amount: 100 }] }),
    policy("next-month", { policyStartDate: "2023-11-28" }),
    policy("paid", { commissionPayouts: [{ code: "B3601", amount: 500, status: "paid", payoutMonthKey: "2026-12", writtenBy: owner }] }),
    policy("cancelled", { status: "storno", stornoDate: "2026-11-01" }),
    policy("zero", { items: [{ title: "Provize po 3 letech", code: "B036", amount: 0 }] }),
    policy("half", { items: [{ title: "Provize 50% z B036", code: "B036_HALF", amount: 100 }] }),
    policy("amendment", { entryType: "endorsement" }), policy("no-start", { policyStartDate: null })];
    expect(upcomingLifeCommissionContracts(input, owner, asOf).map(({ entryId, code, payoutDay }) => [entryId, code, payoutDay])).toEqual([
      ["fourth", "B048", "2026-12-25"], ["legacy", "B036", "2026-12-25"], ["third", "B036", "2026-12-25"],
    ]);
  });

  it("runs on the first Prague calendar day and rejects writes on the second", async () => {
    expect((await runLifeCommissionReminders(new Date("2026-12-01T23:30:00Z"))).skippedDay).toBe(true);
    expect(mocks.entries).not.toHaveBeenCalled();
    expect((await runLifeCommissionReminders(new Date("2026-11-30T23:30:00Z"))).skippedDay).toBe(false);
    expect(mocks.entries).toHaveBeenCalledOnce();
  });

  it("writes one private message per owner with only owned contracts, then sends a generic push once", async () => {
    mocks.entries.mockResolvedValue({ docs: [snapshot(owner, policy("own")), snapshot(owner, policy("transferred")),
      snapshot(owner, policy("wrong-scope", { userEmail: other })), snapshot(other, policy("other", { userEmail: other }))] });
    mocks.profile.mockImplementation(async email => email === other ? null : { pushTokens: ["fixture-token"] });
    mocks.getAll.mockImplementation(async (...args) => args.slice(0, -1).map(({ id }) => ({ id, exists: id !== "transferred", data: () => ({ userEmail: owner }) })));
    expect(await runLifeCommissionReminders(now)).toMatchObject({ mailboxWritten: 1, pushSuccessCount: 1, failed: 0 });
    const reminder = mocks.write.mock.calls[0][0];
    expect(reminder.recipientEmail).toBe(owner);
    expect(reminder.lifeCommissionContracts.map(({ entryId }: { entryId: string }) => entryId)).toEqual(["own"]);
    expect(reminder.body).toContain("autorizuj kartu klienta");
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ data: { type: "life_commission_reminder", deepLink: `/posta?messageId=${reminder.entryId}` } }));
    expect(JSON.stringify(mocks.push.mock.calls)).not.toContain("TEST-own");
    expect(await runLifeCommissionReminders(now)).toMatchObject({ mailboxWritten: 0, duplicates: 1 });
    expect(mocks.push).toHaveBeenCalledOnce();
  });

  it("keeps a mailbox reminder even when mobile push is disabled", async () => {
    mocks.entries.mockResolvedValue({ docs: [snapshot(owner, policy("own"))] });
    mocks.profile.mockResolvedValue({ notificationSettings: { channels: { push: false } }, pushTokens: ["fixture-token"] });
    expect(await runLifeCommissionReminders(now)).toMatchObject({ mailboxWritten: 1, failed: 0 });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
