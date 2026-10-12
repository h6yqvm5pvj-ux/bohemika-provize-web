import { describe, expect, it } from "vitest";
import { calendarDate, hasDateCalendar } from "@/app/lib/calendarDates";
import { toDate } from "@/app/lib/formatters";
import { createCashflowModel } from "@/app/cashflow/cashflowModel";
import { cashflowCanonicalJson } from "@/app/cashflow/shadowProtocol";
import { cashflowCalendarDate, isCashflowCalendarCurrent } from "./cashflowCalendar";
import { WORKER_FILTER_CASES } from "../../../scripts/cashflow-worker/fixtures";

const ms = Date.parse("2026-10-08T14:23:00Z");
const root = (zone = "Europe/Prague") => cashflowCalendarDate(ms, zone)!;

describe("isolated cashflow calendar", () => {
  it.each(["", "different/zone", "../../Europe/Prague", "+03:00", "x".repeat(101)])("rejects unsupported zone %s", zone => {
    expect(cashflowCalendarDate(ms, zone)).toBeNull();
  });
  it("does not change the environment or native date/calendar", () => {
    const before = { env: process.env.TZ, zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      date: new Date(2026, 11, 25).toISOString() };
    calendarDate(root(), 2026, 11, 25);
    expect({ env: process.env.TZ, zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      date: new Date(2026, 11, 25).toISOString() }).toEqual(before);
  });
  it.each([
    ["Europe/Prague", 11, "2026-12-24T23:00:00.000Z"],
    ["Europe/Prague", 5, "2026-06-24T22:00:00.000Z"],
    ["America/New_York", 11, "2026-12-25T05:00:00.000Z"],
    ["America/New_York", 5, "2026-06-25T04:00:00.000Z"],
    ["Pacific/Kiritimati", 11, "2026-12-24T10:00:00.000Z"],
  ])("creates payout dates with the correct seasonal offset in %s, month %s", (zone, month, expected) => {
    const date = calendarDate(root(zone), 2026, Number(month), 25);
    expect(date.toISOString()).toBe(expected);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, month, 25]);
    expect(JSON.parse(cashflowCanonicalJson(date))).toBe(expected);
  });
  it("retains exact instants and source object identity without mutating source dates", () => {
    const value = new Date("2026-11-30T23:30:00Z");
    expect(toDate(value)).toBe(value);
    const parsed = toDate(value, { calendar: root() })!;
    expect(parsed.getTime()).toBe(value.getTime());
    expect([parsed.getMonth(), parsed.getDate()]).toEqual([11, 1]);
    expect(value.toISOString()).toBe("2026-11-30T23:30:00.000Z");
  });
  it("preserves date-only ISO UTC semantics and local Czech/ISO datetime semantics", () => {
    const reference = root();
    expect(toDate("2026-12-01", { calendar: reference })!.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(toDate("1.12.2026", { calendar: reference })!.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(toDate("2026-12-01T00:00:00.125", { calendar: reference })!.toISOString()).toBe("2026-11-30T23:00:00.125Z");
    expect(toDate("2026-12-01T00:00:00+01:00", { calendar: reference })!.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(toDate({ seconds: 1796081400 }, { calendar: reference })!.getTime()).toBe(1796081400000);
  });
  it("rejects invalid date-time values instead of normalizing invalid months", () => {
    expect(toDate("2026-13-01T00:00:00", { calendar: root() })).toBeNull();
  });
  it("uses the earlier DST fold for constructed local times and preserves real later instants", () => {
    const reference = root();
    expect(calendarDate(reference, 2026, 9, 25, 2, 30).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(toDate("2026-10-25T02:30:00", { calendar: reference })!.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    const later = toDate("2026-10-25T02:30:00+01:00", { calendar: reference })!;
    expect(later.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    const shifted = calendarDate(reference, 2026, 9, 24, 2, 30);
    shifted.setDate(25);
    expect(shifted.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
  it("copies calendar context through date arithmetic and garbage-collectable model dates", () => {
    const reference = root("Pacific/Kiritimati");
    const day = calendarDate(reference, 2026, 11, 31);
    const next = calendarDate(day, day);
    next.setDate(next.getDate() + 1);
    expect(next.toISOString()).toBe("2026-12-31T10:00:00.000Z");
    expect(day.toISOString()).toBe("2026-12-30T10:00:00.000Z");
    if (Intl.DateTimeFormat().resolvedOptions().timeZone !== "Pacific/Kiritimati") expect(hasDateCalendar(next)).toBe(true);
  });
  it("checks freshness at the client's midnight even while the host is still on the same day", () => {
    const before = cashflowCalendarDate(Date.parse("2026-12-31T22:59:00Z"), "Europe/Prague")!;
    expect(isCashflowCalendarCurrent(before, Date.parse("2026-12-31T23:01:00Z"))).toBe(false);
    const after = cashflowCalendarDate(Date.parse("2026-12-31T23:00:30Z"), "Europe/Prague")!;
    expect(isCashflowCalendarCurrent(after, Date.parse("2026-12-31T23:01:00Z"))).toBe(true);
    expect(isCashflowCalendarCurrent(after, after.getTime() + 300001)).toBe(false);
  });
  it("keeps interleaved and concurrently scheduled models in their own calendars", async () => {
    const snapshot = { email: "advisor@example.test", myPosition: null, myCommissionMode: null, hasAnyTeam: false,
      ownEntries: [{ id: "synthetic-life", userEmail: "advisor@example.test", productKey: "neon" as const,
        contractSignedDate: "8.10.2026", policyStartDate: "1.12.2026",
        items: [{ code: "A101", title: "Okamžitá provize", amount: 1000 }] }],
      teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] };
    const before = cashflowCanonicalJson(snapshot);
    const zones = ["Europe/Prague", "America/New_York", "UTC", "Pacific/Kiritimati"];
    const models = zones.map(zone => createCashflowModel({ snapshot, statements: [], asOf: root(zone) }));
    try {
      const results = await Promise.all(models.map(async model => {
        await Promise.resolve();
        model.view(WORKER_FILTER_CASES[0].options);
        expect(model.month("2027-1")).toBeNull();
        return model.month("2026-12")!.items[0].date.toISOString();
      }));
      expect(results).toEqual(["2026-12-24T23:00:00.000Z", "2026-12-25T05:00:00.000Z",
        "2026-12-25T00:00:00.000Z", "2026-12-24T10:00:00.000Z"]);
      expect(cashflowCanonicalJson(snapshot)).toBe(before);
    } finally { models.forEach(model => model.dispose()); }
  });
});
