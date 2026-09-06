import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TRAVEL_DRAFT, parseTravelInquiry, pragueToday, travelAges, travelComparisons, travelInquiryMessage, travelPriorities, validateTravelTrip, type TravelInquiry } from "./travelInsurance";

const inquiry = (): TravelInquiry => ({ intent: "offer", preferredContact: "email", note: "Chceme ferratu C.", trip: { ...EMPTY_TRAVEL_DRAFT, destination: "Rakousko", departure: "2026-09-10", returnDate: "2026-09-17", ages: "35, 32, 7", activities: ["hiking"], ferrata: "C", altitude: "Do 3 000 m" } });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T22:30:00Z")); });
afterEach(() => vi.useRealTimers());

describe("travel inquiry validation and advisor handoff", () => {
  it("validates and preserves the travel plan and review intent", () => {
    const value = { ...inquiry(), intent: "review", preferredContact: "phone" };
    expect(parseTravelInquiry(value)).toEqual({ ok: true, value });
  });
  it.each([null, {}, { trip: [] }, { ...inquiry(), trip: { ...inquiry().trip, activities: ["invented"] } }, { ...inquiry(), trip: { ...inquiry().trip, ferrata: "approved" } }, { ...inquiry(), trip: { ...inquiry().trip, tripCost: "9".repeat(20) } }, { ...inquiry(), note: "n".repeat(251) }])("rejects malformed or unbounded public payloads", value => {
    expect(parseTravelInquiry(value).ok).toBe(false);
  });
  it("does not trust arbitrary browser ownership or summary fields", () => {
    const parsed = parseTravelInquiry({ ...inquiry(), ownerEmail: "other@example.test", message: "Guaranteed cover", trip: { ...inquiry().trip, ownerEmail: "other@example.test" } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(JSON.stringify(parsed.value)).not.toContain("other@example.test");
      expect(travelInquiryMessage(parsed.value)).toContain("Ferraty: C; výška: Do 3 000 m");
      expect(travelInquiryMessage(parsed.value)).not.toContain("Guaranteed cover");
    }
  });
  it("uses Prague's calendar day and requires disclosure of an already started trip", () => {
    expect(pragueToday()).toBe("2026-09-06");
    const trip = { ...inquiry().trip, departure: "2026-09-05" };
    expect(validateTravelTrip(trip)).toContain("minulosti");
    expect(validateTravelTrip({ ...trip, alreadyAbroad: true })).toBeNull();
    expect(validateTravelTrip({ ...trip, returnDate: "2026-09-05", alreadyAbroad: true })).not.toBeNull();
  });
  it.each(["2027-02-30", "bad", "2026-9-10"])("rejects impossible or malformed dates: %s", departure => {
    expect(validateTravelTrip({ ...inquiry().trip, departure })).not.toBeNull();
  });
  it("rejects inverted dates, invalid ages and missing activities", () => {
    expect(validateTravelTrip({ ...inquiry().trip, returnDate: "2026-09-09" })).not.toBeNull();
    expect(travelAges("35, dítě")).toEqual([]);
    expect(travelAges("-1")).toEqual([]);
    expect(travelAges("121")).toEqual([]);
    expect(travelAges("35, 32, 0")).toEqual([35, 32, 0]);
    expect(parseTravelInquiry({ ...inquiry(), trip: { ...inquiry().trip, activities: [] } }).ok).toBe(false);
  });
  it("ignores stale details from deselected activities in the advisor message", () => {
    const value = inquiry(); value.trip.activities = ["relax"];
    expect(travelInquiryMessage(value)).not.toContain("Ferraty:");
    expect(travelInquiryMessage(value)).toContain("Věk cestujících: 35, 32, 7");
  });
  it("validates cancellation dates and includes all selected risks", () => {
    const value = inquiry(); value.trip.activities.push("diving", "rental", "storno");
    value.trip.paymentDate = "2026-09-07";
    expect(parseTravelInquiry(value).ok).toBe(false);
    value.trip.paymentDate = "2026-09-01";
    expect(parseTravelInquiry(value).ok).toBe(true);
    const priorities = travelPriorities(value.trip).map(item => item.title).join("|");
    expect(priorities).toContain("Hloubka"); expect(priorities).toContain("trasa"); expect(priorities).toContain("půjčeném vozidle"); expect(priorities).toContain("Storno"); expect(priorities).toContain("dítě");
    expect(travelComparisons(value.trip)[0].title).toContain("60 000");
  });
});
