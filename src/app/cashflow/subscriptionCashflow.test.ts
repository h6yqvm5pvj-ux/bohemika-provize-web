import { describe, expect, it } from "vitest";

import {
  addSubscriptionMonths,
  formatSubscriptionIsoDay,
  parseSubscriptionIsoDay,
  subscriptionIntervalMonths,
  subscriptionPeriodUntilIso,
} from "./subscriptionCashflow";

describe("subscription cashflow recurrence", () => {
  it("uses the business renewal interval for each paid plan", () => {
    expect(subscriptionIntervalMonths("monthly")).toBe(3);
    expect(subscriptionIntervalMonths("semiannual")).toBe(6);
    expect(subscriptionIntervalMonths("yearly")).toBe(12);
  });

  it("keeps renewals in the same month cadence from the subscription start", () => {
    const start = parseSubscriptionIsoDay("2026-07-01");

    expect(start).not.toBeNull();
    expect(formatSubscriptionIsoDay(addSubscriptionMonths(start!, 3))).toBe("2026-10-01");
    expect(formatSubscriptionIsoDay(addSubscriptionMonths(start!, 6))).toBe("2027-01-01");
    expect(formatSubscriptionIsoDay(addSubscriptionMonths(start!, 12))).toBe("2027-07-01");
  });

  it("calculates the predicted paid period end from the selected plan", () => {
    const start = parseSubscriptionIsoDay("2026-07-01");

    expect(start).not.toBeNull();
    expect(subscriptionPeriodUntilIso(start!, "monthly")).toBe("2026-09-30");
    expect(subscriptionPeriodUntilIso(start!, "semiannual")).toBe("2026-12-31");
    expect(subscriptionPeriodUntilIso(start!, "yearly")).toBe("2027-06-30");
  });
});
