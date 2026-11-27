import { describe, expect, it } from "vitest";
import { groupByRadarClient } from "./radarClientGroups";
import { meetingCalendar } from "./meetingCalendar";

const person = { clientName: "Modelová klientka", clientEmail: "klient@example.test", ownerEmail: "owner@example.test", clientPhone: "+420 777 123 456" };
const item = (key: string, changes: Partial<typeof person> = {}) => ({ ...person, key, ...changes });

describe("contract grouping", () => {
  it("groups matching verified contacts, keeping lookalikes and other owners separate", () => {
    const groups = groupByRadarClient([
      item("a"), item("b", { clientName: "Ing. Modelová klientka", clientPhone: "777123456", clientEmail: "" }),
      item("c", { clientEmail: "", clientPhone: "" }), item("d", { ownerEmail: "other@example.test" }),
      item("e", { clientEmail: "different@example.test", clientPhone: "777234567" }),
    ]);
    expect(groups.map(g => g.items.map(c => c.key))).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
  });
  it("never joins groups transitively through shared contact details", () => {
    const groups = groupByRadarClient([item("a", { clientEmail: "" }), item("b"), item("c", { clientPhone: "" })]);
    expect(groups.map(g => g.items.map(c => c.key))).toEqual([["a", "b"], ["c"]]);
  });
});

describe("meeting calendar", () => {
  const record = { ...person, entryId: "private-entry", occurrenceKey: "2026-12-03", clientName: "Test, Firma; " + "Ž".repeat(80) + "\r\nATTENDEE:abc" };
  it.each([["2026-07-07T10:00", "080000Z"], ["2026-12-07T10:00", "090000Z"]])("exports Prague civil time %s as UTC", async (time, expected) => {
    const content = await meetingCalendar(record, time);
    expect(content).toContain("T" + expected + "\r\n");
    expect(content).toContain("CLASS:PRIVATE");
    expect(content).toContain("Test\\, Firma\\;");
    expect(content).not.toContain("\r\nATTENDEE");
    expect(content).not.toContain(record.entryId);
    expect(content).not.toContain(record.ownerEmail);
    for (const line of content.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const uid = (s: string) => s.replace(/\r\n /g, "").match(/UID:[^\r]+/)?.[0];
    expect(uid(await meetingCalendar(record, time))).toBe(uid(content));
  });
  it.each(["2026-03-29T02:30", "2026-02-30T11:20", "2026-12-01T25:00", "invalid"])("rejects invalid date or nonexistent local time %s", async value => {
    await expect(meetingCalendar(record, value)).rejects.toThrow();
  });
});
