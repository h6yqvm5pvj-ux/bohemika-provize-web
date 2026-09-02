import { describe, expect, it } from "vitest";

import {
  isSubscriptionExpiryCandidate,
  isSubscriptionExpiryPushEnabled,
  isSubscriptionExpiryTypeEnabled,
  subscriptionExpiryTargetDate,
} from "./subscriptionExpiryNotifications";

describe("subscription expiry notifications", () => {
  it("uses the Prague calendar day and targets exactly seven days ahead", () => {
    const justAfterPragueMidnight = new Date("2026-09-01T22:30:00.000Z");
    expect(subscriptionExpiryTargetDate(justAfterPragueMidnight)).toBe("2026-09-09");
  });

  it("accepts only an active finite subscription ending on the target date", () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    expect(
      isSubscriptionExpiryCandidate({
        profile: {
          subscriptionStatus: "active",
          subscriptionPlan: "monthly",
          subscriptionPaidFrom: "2026-08-10",
          subscriptionPaidUntil: "2026-09-09",
        },
        targetPaidUntil: "2026-09-09",
        now,
      })
    ).toBe(true);

    expect(
      isSubscriptionExpiryCandidate({
        profile: {
          subscriptionStatus: "active",
          subscriptionPlan: "unlimited",
          subscriptionPaidUntil: "2026-09-09",
        },
        targetPaidUntil: "2026-09-09",
        now,
      })
    ).toBe(false);

    expect(
      isSubscriptionExpiryCandidate({
        profile: {
          subscriptionStatus: "active",
          subscriptionPlan: "monthly",
          subscriptionPaidUntil: "2026-09-10",
        },
        targetPaidUntil: "2026-09-09",
        now,
      })
    ).toBe(false);
  });

  it("respects the unpaid notification type and push channel preferences", () => {
    expect(isSubscriptionExpiryTypeEnabled({})).toBe(true);
    expect(isSubscriptionExpiryPushEnabled({})).toBe(true);

    const typeDisabled = {
      notificationSettings: { types: { unpaid: false }, channels: { push: true } },
    };
    expect(isSubscriptionExpiryTypeEnabled(typeDisabled)).toBe(false);
    expect(isSubscriptionExpiryPushEnabled(typeDisabled)).toBe(false);

    const pushDisabled = {
      notificationSettings: { types: { unpaid: true }, channels: { push: false } },
    };
    expect(isSubscriptionExpiryTypeEnabled(pushDisabled)).toBe(true);
    expect(isSubscriptionExpiryPushEnabled(pushDisabled)).toBe(false);
  });
});
