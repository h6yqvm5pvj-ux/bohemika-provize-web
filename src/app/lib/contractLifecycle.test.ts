import { describe, expect, it } from "vitest";

import { contractLifecycleStatus } from "./contractLifecycle";

describe("contract lifecycle status", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("recognizes storno statuses with and without Czech diacritics", () => {
    expect(contractLifecycleStatus({ status: "storno" }, now)).toBe("storno");
    expect(contractLifecycleStatus({ status: "stornována" }, now)).toBe(
      "storno"
    );
  });

  it("recognizes dožitá statuses with and without Czech diacritics", () => {
    expect(contractLifecycleStatus({ status: "dozita" }, now)).toBe("dozita");
    expect(contractLifecycleStatus({ status: "dožitá" }, now)).toBe("dozita");
    expect(contractLifecycleStatus({ status: "dožité" }, now)).toBe("dozita");
  });

  it("treats a contract as dožitá after the policy end day has passed", () => {
    expect(
      contractLifecycleStatus({ status: "active", policyEndDate: "2026-07-22" }, now)
    ).toBe("dozita");
  });

  it("keeps a contract active on its policy end day", () => {
    expect(
      contractLifecycleStatus({ status: "active", policyEndDate: "2026-07-23" }, now)
    ).toBe("active");
  });

  it("marks CONSEQ Zenit mature on the target birthday itself", () => {
    const contract = { productKey: "conseqzenit" as const, status: "active", policyEndDate: "2035-03-31" };
    expect(contractLifecycleStatus(contract, new Date(2035, 2, 30))).toBe("active");
    expect(contractLifecycleStatus(contract, new Date(2035, 2, 31))).toBe("dozita");
  });
});
