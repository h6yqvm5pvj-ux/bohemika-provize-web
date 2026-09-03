import { describe, expect, it } from "vitest";

import {
  collectPushTokens,
  isPermanentInvalidPushTokenCode,
} from "./pushTokens";

describe("push token maintenance", () => {
  it("recognizes only permanent Firebase token errors", () => {
    expect(
      isPermanentInvalidPushTokenCode(
        "messaging/registration-token-not-registered"
      )
    ).toBe(true);
    expect(
      isPermanentInvalidPushTokenCode("messaging/invalid-registration-token")
    ).toBe(true);
    expect(isPermanentInvalidPushTokenCode("messaging/internal-error")).toBe(false);
    expect(isPermanentInvalidPushTokenCode("messaging/server-unavailable")).toBe(false);
  });

  it("deduplicates tokens collected from legacy and per-device fields", () => {
    expect(
      collectPushTokens({
        fcmToken: "active-token",
        fcmTokens: ["active-token", "stale-token"],
        fcmTokensByDevice: {
          phone: "active-token",
          laptop: "stale-token",
        },
      })
    ).toEqual(["active-token", "stale-token"]);
  });
});
