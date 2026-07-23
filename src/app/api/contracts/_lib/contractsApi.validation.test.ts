import { describe, expect, it } from "vitest";

import type { ContractDoc } from "./contractsApi.types";
import { validateContractCoreInvariants } from "./contractsApi.validation";

const baseContract: ContractDoc = {
  clientName: "Jan Novak",
  contractNumber: "ABC123",
  contractSignedDate: new Date("2026-01-01T00:00:00.000Z"),
  policyStartDate: new Date("2026-02-01T00:00:00.000Z"),
  status: "active",
  stornoDate: null,
};

describe("contracts API validation", () => {
  it("allows future storno dates after the policy start date", () => {
    const result = validateContractCoreInvariants(baseContract, {
      status: "storno",
      stornoDate: new Date("2027-02-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects storno dates before the policy start date", () => {
    const result = validateContractCoreInvariants(baseContract, {
      status: "storno",
      stornoDate: new Date("2026-01-31T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Datum storna nesmí být před datem počátku smlouvy.",
    });
  });

  it("rejects active contracts with a storno date", () => {
    const result = validateContractCoreInvariants(baseContract, {
      status: "active",
      stornoDate: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Datum storna lze uložit jen ke smlouvě se stavem storno.",
    });
  });
});
