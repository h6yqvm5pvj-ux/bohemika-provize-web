import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KOOPERATIVA_CONTRACT_STATUS_URL, resolveKooperativaStatusIdentity } from "./kooperativaContractStatus";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("Kooperativa contract status identity", () => {
  it("returns only the birth date needed by the portal", () => {
    const result = resolveKooperativaStatusIdentity({ birthNumber: "950714/1234", policyholderType: "natural_person" });
    expect(result).toEqual({ kind: "birthDate", label: "Datum narození", value: "14.07.1995" });
    expect(result).not.toHaveProperty("birthNumber");
  });

  it.each([["045714/1234", "14.07.2004"], ["042714/1234", "14.07.2004"], ["047714/1234", "14.07.2004"], ["495714/123", "14.07.1949"]])(
    "uses the existing Czech RČ date rules for %s", (birthNumber, value) => {
      expect(resolveKooperativaStatusIdentity({ birthNumber })).toMatchObject({ kind: "birthDate", value });
    });

  it("uses a company's IČO and preserves leading zeros", () => {
    expect(resolveKooperativaStatusIdentity({ companyId: "0012 3456", policyholderType: "legal_entity" }))
      .toEqual({ kind: "companyId", label: "IČO", value: "00123456" });
  });

  it("keeps the natural person's birth date for an individual entrepreneur who also has an IČO", () => {
    expect(resolveKooperativaStatusIdentity({ companyId: "00123456", birthNumber: "950714/1234", policyholderType: "natural_person" }))
      .toMatchObject({ kind: "birthDate", value: "14.07.1995" });
  });

  it("does not replace a natural person's missing birth date with their IČO", () => {
    expect(resolveKooperativaStatusIdentity({ companyId: "00123456", policyholderType: "natural_person" })).toBeNull();
  });

  it("does not replace a company's missing IČO with a representative's birth date", () => {
    expect(resolveKooperativaStatusIdentity({ birthNumber: "950714/1234", policyholderType: "legal_entity" })).toBeNull();
  });

  it("can use a valid directly stated date for a foreign policyholder", () => {
    expect(resolveKooperativaStatusIdentity({ policyholderBirthDate: "1990-11-07", policyholderType: "natural_person" }))
      .toMatchObject({ kind: "birthDate", value: "07.11.1990" });
  });

  it("accepts matching RČ and directly stated dates but rejects conflicting dates", () => {
    expect(resolveKooperativaStatusIdentity({ birthNumber: "950714/1234", policyholderBirthDate: "1995-07-14" }))
      .toMatchObject({ value: "14.07.1995" });
    expect(resolveKooperativaStatusIdentity({ birthNumber: "950714/1234", policyholderBirthDate: "1995-07-15" })).toBeNull();
  });

  it.each(["2025-02-29", "2026-11-02", "2026-13-01", "1700-01-01", "01.01.1990", "1990-1-1"])("rejects an invalid or future direct date %s", policyholderBirthDate => {
    expect(resolveKooperativaStatusIdentity({ policyholderBirthDate })).toBeNull();
  });

  it.each(["991332/1234", "261102/1234", "x9507141234", "950714/12"])("rejects invalid or future RČ %s without falling back to a company identifier", birthNumber => {
    expect(resolveKooperativaStatusIdentity({ birthNumber, companyId: "00123456" })).toBeNull();
  });

  it.each(["CZ00123456", "1234567", "123456789", "IČO: 00123456", ""])("rejects a malformed company identifier %s", companyId => {
    expect(resolveKooperativaStatusIdentity({ companyId, policyholderType: "legal_entity" })).toBeNull();
  });

  it("has a fixed portal URL without personal data or a query string", () => {
    expect(KOOPERATIVA_CONTRACT_STATUS_URL).toBe("https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml");
    expect(new URL(KOOPERATIVA_CONTRACT_STATUS_URL).search).toBe("");
  });
});
