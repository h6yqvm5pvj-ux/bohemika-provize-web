import { describe, expect, it } from "vitest";

import type { ContractDoc } from "./contractsApi.types";
import { validateContractCoreInvariants } from "./contractsApi.validation";

const baseContract: ContractDoc = {
  clientName: "Jan Novak",
  contractNumber: "ABC123",
  productKey: "neon",
  contractSignedDate: new Date("2026-01-01T00:00:00.000Z"),
  policyStartDate: new Date("2026-02-01T00:00:00.000Z"),
  status: "active",
  stornoDate: null,
};

describe("contracts API validation", () => {
  const inheritedCpp: ContractDoc = {
    ...baseContract, productKey: "cppAuto", acquisitionType: "inherited",
    contractSignedDate: new Date("2015-01-01"), policyStartDate: new Date("2015-02-01"),
  };

  it("allows editing an inherited ČPP Auto contract from 2015", () => {
    expect(validateContractCoreInvariants(inheritedCpp, { clientName: "Petr Novak" })).toEqual({ ok: true });
    expect(validateContractCoreInvariants(inheritedCpp, { contractSignedDate: new Date("2015-01-31") })).toEqual({ ok: true });
  });

  it("rejects moving an inherited ČPP Auto contract before 2015", () => {
    expect(validateContractCoreInvariants(inheritedCpp, { contractSignedDate: new Date("2014-12-31") }))
      .toMatchObject({ ok: false, error: expect.stringContaining("01. 01. 2015") });
  });

  it("uses the stored acquisition type when validating a date edit", () => {
    expect(validateContractCoreInvariants({ ...inheritedCpp, acquisitionType: null }, {
      acquisitionType: "inherited", contractSignedDate: new Date("2015-01-01"),
    })).toMatchObject({ ok: false, error: expect.stringContaining("01. 01. 2018") });
  });

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

  it("rejects core updates before the first known product coefficients", () => {
    const result = validateContractCoreInvariants(baseContract, {
      contractSignedDate: new Date("2019-09-30T00:00:00.000Z"),
      policyStartDate: new Date("2019-10-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Smlouvu nelze uložit, protože pro datum sjednání 30. 09. 2019 nemáme v systému bohemka.app koeficienty pro tento produkt. Nejstarší dostupné koeficienty platí od 01. 10. 2019. Tohle pravidlo má zabránit uložení smlouvy se špatně zadaným datem sjednání.",
    });
  });
});
