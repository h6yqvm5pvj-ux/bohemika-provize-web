import { describe, expect, it } from "vitest";

import {
  buildContractActivityNotificationContent,
  resolveContractActivityNotificationKind,
  resolveEndorsementPremiumIncrease,
} from "./contractsApi.notifications";

describe("contract activity notifications", () => {
  it("keeps the existing new-contract notification", () => {
    expect(
      buildContractActivityNotificationContent({
        ownerDisplayName: "Jakub Pokorný",
        entryType: "contract",
        productKey: "neon",
        inputAmount: 2_013,
        frequencyRaw: "monthly",
      })
    ).toEqual({
      kind: "new_contract",
      mailboxTitle: "Nová smlouva v týmu",
      message: "🎉 Jakub Pokorný sepsal právě ČPP ŽP NEON za 2 013 Kč ❤️",
      premiumIncreaseAmount: null,
    });
  });

  it("builds a monthly life-insurance increase notification", () => {
    expect(
      buildContractActivityNotificationContent({
        ownerDisplayName: "Jakub Pokorný",
        entryType: "endorsement",
        productKey: "neon",
        inputAmount: 326,
        frequencyRaw: "monthly",
        previousInputAmount: 1_673,
        newInputAmount: 1_999,
        premiumDelta: 326,
        premiumIncreaseAmount: 326,
      })
    ).toEqual({
      kind: "contract_increase",
      mailboxTitle: "Navýšení smlouvy v týmu",
      message:
        "📈 Jakub Pokorný navýšil pojistné o 326 Kč měsíčně – ČPP ŽP NEON ❤️",
      premiumIncreaseAmount: 326,
    });
  });

  it("derives an increase from previous and new premiums", () => {
    expect(
      resolveEndorsementPremiumIncrease({
        previousInputAmount: 1_000,
        newInputAmount: 1_200,
      })
    ).toBe(200);
  });

  it("does not notify about a decrease or unchanged premium", () => {
    expect(
      resolveContractActivityNotificationKind({
        entryType: "endorsement",
        productKey: "neon",
        inputAmount: -200,
        frequencyRaw: "monthly",
        premiumDelta: -200,
        premiumIncreaseAmount: 0,
        previousInputAmount: 1_200,
        newInputAmount: 1_000,
      })
    ).toBeNull();
    expect(
      resolveContractActivityNotificationKind({
        entryType: "endorsement",
        productKey: "neon",
        inputAmount: 0,
        frequencyRaw: "monthly",
        premiumDelta: 0,
        previousInputAmount: 1_000,
        newInputAmount: 1_000,
      })
    ).toBeNull();
  });

  it("does not invent an increase when the previous premium is missing", () => {
    expect(
      resolveEndorsementPremiumIncrease({
        previousInputAmount: null,
        newInputAmount: 1_999,
      })
    ).toBeNull();
  });
});
