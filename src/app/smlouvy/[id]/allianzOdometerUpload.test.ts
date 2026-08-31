import { describe, expect, it } from "vitest";

import { resolveAllianzOdometerIdentity } from "./allianzOdometerUpload";

describe("resolveAllianzOdometerIdentity", () => {
  it("odvodí datum narození z rodného čísla fyzické osoby", () => {
    expect(resolveAllianzOdometerIdentity("900101/1234")).toEqual({
      kind: "birthDate",
      label: "Datum narození",
      value: "01.01.1990",
    });
  });

  it("zohlední ženský měsíc v rodném čísle", () => {
    expect(resolveAllianzOdometerIdentity("905101/1234")).toMatchObject({
      kind: "birthDate",
      value: "01.01.1990",
    });
  });

  it("vrátí IČO právnické osoby", () => {
    expect(resolveAllianzOdometerIdentity("12345678")).toEqual({
      kind: "companyId",
      label: "IČO",
      value: "12345678",
    });
  });

  it("odmítne chybějící nebo neplatný identifikátor", () => {
    expect(resolveAllianzOdometerIdentity(null)).toBeNull();
    expect(resolveAllianzOdometerIdentity("nenalezeno")).toBeNull();
  });
});
