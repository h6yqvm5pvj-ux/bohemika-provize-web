import { describe, expect, it } from "vitest";
import { EMPTY_ONLINE_CARD_ANALYTICS_EVENTS, readOnlineCardAnalyticsCounts } from "./onlineCardAnalytics";

describe("online card analytics historical counters", () => {
  it("recovers literal dotted counters and adds new nested increments", () => {
    expect(readOnlineCardAnalyticsCounts({
      "events.visit": 12,
      "events.phone_click": 3,
      events: { visit: 4, email_click: 2 },
    })).toEqual({ ...EMPTY_ONLINE_CARD_ANALYTICS_EVENTS(), visit: 16, phone_click: 3, email_click: 2 });
  });

  it("reads either historical or current records independently", () => {
    expect(readOnlineCardAnalyticsCounts({ "events.visit": 5 }).visit).toBe(5);
    expect(readOnlineCardAnalyticsCounts({ events: { visit: 7 } }).visit).toBe(7);
  });

  it("ignores missing, negative, malformed and unknown counters", () => {
    expect(readOnlineCardAnalyticsCounts(null)).toEqual(EMPTY_ONLINE_CARD_ANALYTICS_EVENTS());
    expect(readOnlineCardAnalyticsCounts({
      "events.visit": -5,
      events: { visit: "3", phone_click: Infinity, email_click: {}, meeting_open: "bad", unknown: 999 },
    })).toEqual({ ...EMPTY_ONLINE_CARD_ANALYTICS_EVENTS(), visit: 3 });
  });
});
