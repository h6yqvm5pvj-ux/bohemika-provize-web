import { describe, expect, it } from "vitest";
import { formatSlaviaVerificationIdentity } from "./slaviaContractVerification";

describe("formatSlaviaVerificationIdentity", () => {
  it("converts a male birth number to DD.MM.YYYY", () => {
    expect(formatSlaviaVerificationIdentity({ personalId: "900101/1234", personalIdType: "birthNumber" }))
      .toEqual({ label: "Datum narození", value: "01.01.1990" });
  });

  it("handles the female birth-month offset after 2004", () => {
    expect(formatSlaviaVerificationIdentity({ personalId: "047205/1234", personalIdType: "birthNumber" }))
      .toEqual({ label: "Datum narození", value: "05.02.2004" });
  });

  it("uses an eight-digit company ID without converting it", () => {
    expect(formatSlaviaVerificationIdentity({ personalId: "01234567", personalIdType: "companyId" }))
      .toEqual({ label: "IČO", value: "01234567" });
  });

  it.each(["900231/1234", "900132/1234", "123", "123456789"]) ("rejects an invalid birth number date: %s", personalId => {
    expect(formatSlaviaVerificationIdentity({ personalId, personalIdType: "birthNumber" })).toBeNull();
  });
});
