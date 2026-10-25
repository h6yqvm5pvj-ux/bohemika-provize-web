import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("./firebaseAdmin", () => ({ get adminDb() { return mocks.db; } }));
import { cleanupExpiredSystemMailbox, isExpiredSystemMailboxEntry } from "./mailboxRetention";

type Data = Record<string, unknown>;
const now = Date.parse("2026-10-25T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const cutoff = now - 10 * day;
const base = "usersPrivate/advisor@example.test/mailbox";
let records: Map<string, Data>;
let projections: string[][];
let beforeCommit: (() => void) | undefined;
const ms = (value: unknown): number => value instanceof Timestamp ? value.toMillis() : value instanceof Date ? value.getTime() : Number(value);
const project = (data: Data | undefined, fields?: string[]) => !data ? undefined : fields
  ? Object.fromEntries(fields.filter(field => Object.hasOwn(data, field)).map(field => [field, data[field]])) : data;
function snapshot(path: string, fields?: string[]) {
  const data = project(records.get(path), fields);
  return { id: path.split("/").at(-1)!, ref: ref(path), exists: records.has(path), data: () => data };
}
function ref(path: string) {
  return { path, get: async () => snapshot(path), set: async (data: Data) => { records.set(path, data); } };
}
function query(filters: Array<[string, string, unknown]> = [], fields: string[] = [], field = "createdAtMs", limit = Infinity, cursor?: [unknown, { path: string }]) {
  return {
    where: (key: string, operation: string, value: unknown) => query([...filters, [key, operation, value]], fields, field, limit, cursor),
    orderBy: (key: string | FieldPath) => query(filters, fields, typeof key === "string" ? key : field, limit, cursor),
    select: (...selected: string[]) => { projections.push(selected); return query(filters, selected, field, limit, cursor); },
    limit: (size: number) => query(filters, fields, field, size, cursor),
    startAfter: (value: unknown, document: { path: string }) => query(filters, fields, field, limit, [value, document]),
    get: async () => {
      const paths = [...records.keys()].filter(path => path.split("/").at(-2) === "mailbox" && filters.every(([key, operation, value]) =>
        operation === "in" ? (value as unknown[]).includes(records.get(path)![key]) : records.get(path)![key] != null && ms(records.get(path)![key]) <= ms(value)))
        .sort((a, b) => ms(records.get(a)![field]) - ms(records.get(b)![field]) || a.localeCompare(b))
        .filter(path => !cursor || ms(records.get(path)![field]) > ms(cursor[0]) || (ms(records.get(path)![field]) === ms(cursor[0]) && path.localeCompare(cursor[1].path) > 0))
        .slice(0, limit);
      return { size: paths.length, docs: paths.map(path => snapshot(path, fields)) };
    },
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  records = new Map(); projections = []; beforeCommit = undefined;
  mocks.db = {
    doc: ref, collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    collectionGroup: () => query(),
    runTransaction: async (work: (tx: object) => Promise<unknown>) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, Data | undefined>();
        const pending: string[] = [];
        const result = await work({
          getAll: async (...args: Array<{ path: string } | { fieldMask: string[] }>) => {
            const fields = (args.at(-1) as { fieldMask: string[] }).fieldMask;
            projections.push(fields);
            return args.slice(0, -1).map(value => {
              const path = (value as { path: string }).path;
              reads.set(path, records.get(path));
              return snapshot(path, fields);
            });
          },
          delete: (document: { path: string }) => pending.push(document.path),
        });
        beforeCommit?.();
        if ([...reads].some(([path, data]) => records.get(path) !== data)) continue;
        pending.forEach(path => records.delete(path));
        return result;
      }
      throw new Error("Transaction retries exhausted");
    },
  } as unknown as Firestore;
});
afterEach(() => vi.restoreAllMocks());

describe("system mailbox retention", () => {
  it("deletes only expired notifications, including unread and archived, across users", async () => {
    for (const [id, data] of Object.entries({
      old: { type: "new_contract", createdAtMs: cutoff - 1, read: false },
      boundary: { type: "intranet_post", createdAtMs: cutoff, archivedAtMs: now, read: true },
      fresh: { type: "new_contract", createdAtMs: cutoff + 1 },
      support: { type: "direct_message", createdAtMs: cutoff - day },
      encrypted: { type: "generic", createdAtMs: cutoff - day, encryptedContent: {} },
      tip: { type: "tipster_tip", createdAtMs: cutoff - day },
      legacyTip: { type: "generic", createdAtMs: cutoff - day, metadata: { tipsterTip: true } },
      legacyTitleTip: { type: "generic", createdAtMs: cutoff - day, title: "Nový tip - pojištění" },
      conversation: { type: "generic", createdAtMs: cutoff - day, metadata: { conversationId: "dm_private" } },
      unknown: { type: "future_message_type", createdAtMs: cutoff - day },
    })) records.set(`${base}/${id}`, data);
    records.set("usersPrivate/other@example.test/mailbox/old", { type: "weekly_team_report", createdAtMs: cutoff - 1 });
    records.set("other/root/mailbox/outside", { type: "new_contract", createdAtMs: cutoff - 1 });
    expect(await cleanupExpiredSystemMailbox()).toMatchObject({ deleted: 3, retentionDays: 10, hasMore: false });
    for (const id of ["fresh", "support", "encrypted", "tip", "legacyTip", "legacyTitleTip", "conversation", "unknown"]) expect(records.has(`${base}/${id}`)).toBe(true);
    expect(records.has("other/root/mailbox/outside")).toBe(true);
    expect(projections.every(fields => !fields.includes("body"))).toBe(true);
  });

  it("handles legacy timestamps and never deletes missing, invalid or conflicting creation dates", async () => {
    records.set(`${base}/legacy`, { type: "generic", createdAt: Timestamp.fromMillis(cutoff - 1) });
    records.set(`${base}/date`, { type: "generic", createdAt: new Date(cutoff - 1) });
    records.set(`${base}/both`, { type: "generic", createdAt: Timestamp.fromMillis(cutoff), createdAtMs: cutoff });
    records.set(`${base}/conflict`, { type: "generic", createdAt: Timestamp.fromMillis(now), createdAtMs: cutoff });
    records.set(`${base}/missing`, { type: "generic" });
    records.set(`${base}/invalid`, { type: "generic", createdAtMs: -1 });
    expect(await cleanupExpiredSystemMailbox({ dryRun: true })).toMatchObject({ eligible: 3, deleted: 0 });
    expect(await cleanupExpiredSystemMailbox()).toMatchObject({ deleted: 3 });
    expect(records.has(`${base}/conflict`)).toBe(true);
    expect(records.has(`${base}/missing`)).toBe(true);
    expect(records.has(`${base}/invalid`)).toBe(true);
  });

  it("starts a new retention window for postponed and delivered reminders", () => {
    const old = { type: "contract_note_reminder", createdAtMs: cutoff - day };
    expect(isExpiredSystemMailboxEntry(`${base}/future`, { ...old, snoozedUntilMs: now + day }, now)).toBe(false);
    expect(isExpiredSystemMailboxEntry(`${base}/recent`, { ...old, snoozeReminderSentAt: Timestamp.fromMillis(now - day) }, now)).toBe(false);
    expect(isExpiredSystemMailboxEntry(`${base}/expired`, { ...old, snoozeReminderSentAtMs: cutoff }, now)).toBe(true);
  });

  it.each([
    { label: "conversation", patch: { type: "direct_message" } },
    { label: "postponed reminder", patch: { snoozedUntilMs: now + day } },
    { label: "new creation time", patch: { createdAtMs: now } },
  ])("revalidates after a concurrent $label change", async ({ patch }) => {
    records.set(`${base}/changed`, { type: "generic", createdAtMs: cutoff - day });
    beforeCommit = () => {
      beforeCommit = undefined;
      records.set(`${base}/changed`, { type: "generic", createdAtMs: cutoff - day, ...patch });
    };
    expect(await cleanupExpiredSystemMailbox()).toMatchObject({ eligible: 1, deleted: 0 });
    expect(records.get(`${base}/changed`)).toMatchObject(patch);
  });

  it("paginates past deleted cursor documents when many notifications have the same creation time", async () => {
    for (let i = 0; i < 501; i++) records.set(`${base}/${String(i).padStart(4, "0")}`, { type: "new_contract", createdAtMs: cutoff });
    expect(await cleanupExpiredSystemMailbox()).toMatchObject({ deleted: 501, hasMore: false });
    expect([...records.keys()].filter(path => path.startsWith(base))).toEqual([]);
  });

  it("supports a nonmutating preview and resumes beyond a full page of deferred reminders", async () => {
    for (let i = 0; i < 250; i++) records.set(`${base}/${String(i).padStart(4, "0")}`, { type: "generic", createdAtMs: cutoff - day, snoozedUntilMs: now + day });
    records.set(`${base}/zz-expired`, { type: "generic", createdAtMs: cutoff - day });
    const before = new Map(records);
    expect(await cleanupExpiredSystemMailbox({ dryRun: true })).toMatchObject({ eligible: 1, deleted: 0 });
    expect(records).toEqual(before);
    vi.mocked(Date.now).mockReturnValueOnce(now).mockReturnValueOnce(now).mockReturnValue(now + 45_001);
    expect(await cleanupExpiredSystemMailbox()).toMatchObject({ hasMore: true, deleted: 0 });
    expect(records.get("maintenanceState/mailboxRetention")?.cursorPath).toBe(`${base}/0249`);
    vi.mocked(Date.now).mockReturnValue(now);
    expect(await cleanupExpiredSystemMailbox()).toMatchObject({ hasMore: false, deleted: 1 });
    expect(records.has(`${base}/zz-expired`)).toBe(false);
    expect(records.has(`${base}/0000`)).toBe(true);
  });

  it("fails explicitly if the database is unavailable", async () => {
    mocks.db = null;
    await expect(cleanupExpiredSystemMailbox()).rejects.toThrow("Mailbox database unavailable");
  });
});
