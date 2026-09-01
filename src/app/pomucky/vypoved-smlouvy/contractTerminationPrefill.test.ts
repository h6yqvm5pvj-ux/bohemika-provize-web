import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeContractTerminationPrefill,
  getContractTerminationPdfFieldDefaults,
  isCppSusUploadNoticeProduct,
  normalizeContractTerminationPrefill,
  normalizeTerminationPrefillInsurer,
  resolveContractTerminationProductDefaults,
  storeContractTerminationPrefill,
} from "./contractTerminationPrefill";

describe("contractTerminationPrefill", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizuje podporované názvy pojišťoven", () => {
    expect(normalizeTerminationPrefillInsurer("ČPP")).toBe("ČPP");
    expect(normalizeTerminationPrefillInsurer("csob")).toBe("ČSOB");
    expect(normalizeTerminationPrefillInsurer("MAXIMA")).toBe("Maxima");
    expect(normalizeTerminationPrefillInsurer("Slavia")).toBe("Slavia");
    expect(normalizeTerminationPrefillInsurer("DIRECT")).toBe("Direct");
    expect(normalizeTerminationPrefillInsurer("Comfort Commodity")).toBeNull();
  });

  it("ponechá pouze bezpečná a podporovaná data smlouvy", () => {
    expect(
      normalizeContractTerminationPrefill({
        sourcePath: "/smlouvy/abc-123",
        sourceProduct: "allianzAuto",
        contractNumber: " 2026-001 ",
        policyholderName: " Petra Nováková ",
        personalId: "850101/1234",
        address: "Praha 1",
        phone: "+420 777 123 456",
        email: "petra@example.cz",
        policyStartDate: "2026-03-25",
        contractSignedDate: "neplatné",
        insurer: "Allianz",
        insuranceType: "nonLife",
        reason: "periodEnd",
      }),
    ).toEqual({
      sourcePath: "/smlouvy/abc-123",
      sourceProduct: "allianzAuto",
      contractNumber: "2026-001",
      policyholderName: "Petra Nováková",
      personalId: "850101/1234",
      address: "Praha 1",
      phone: "+420 777 123 456",
      email: "petra@example.cz",
      policyStartDate: "2026-03-25",
      contractSignedDate: "",
      insurer: "Allianz",
      insuranceType: "nonLife",
      reason: "periodEnd",
    });
  });

  it("odvodí pojišťovnu a typ pojištění z produktu", () => {
    expect(resolveContractTerminationProductDefaults("slaviaauto")).toEqual({
      insurer: "Slavia",
      insuranceType: "nonLife",
    });
    expect(resolveContractTerminationProductDefaults("neon")).toEqual({
      insurer: "ČPP",
      insuranceType: "life",
    });
  });

  it("nepovolí u Directu životní pojištění", () => {
    expect(
      normalizeContractTerminationPrefill({
        insurer: "Direct",
        insuranceType: "life",
      })?.insuranceType,
    ).toBeNull();
    expect(
      normalizeContractTerminationPrefill({
        insurer: "Direct",
        insuranceType: "nonLife",
      })?.insuranceType,
    ).toBe("nonLife");
  });

  it.each(["domex", "cpphafan", "zamex", "cppsimplex"] as const)(
    "zobrazí instrukci pro nahrání do SUS u produktu %s",
    (product) => {
      expect(isCppSusUploadNoticeProduct(product)).toBe(true);
    },
  );

  it("nezobrazí instrukci pro nahrání do SUS u jiných produktů", () => {
    expect(isCppSusUploadNoticeProduct("allianzAuto")).toBe(false);
    expect(isCppSusUploadNoticeProduct(null)).toBe(false);
  });

  it("předvyplní rodné číslo i do identifikační části formuláře ČPP", () => {
    const prefill = normalizeContractTerminationPrefill({
      sourcePath: "/smlouvy/abc-123",
      contractNumber: "2026-001",
      policyholderName: "Petra Nováková",
      personalId: "900101/1234",
      address: "Praha 1",
      insurer: "ČPP",
      insuranceType: "life",
      reason: "agreement",
    });

    expect(prefill).not.toBeNull();
    expect(getContractTerminationPdfFieldDefaults(prefill!)).toMatchObject({
      personalId: "900101/1234",
      policyholderBirthNumber: "900101/1234",
      identifiedBirthNumber: "900101/1234",
    });
  });

  it("předá IČO Allianz Auto do univerzální výpovědi bez mezer", () => {
    const prefill = normalizeContractTerminationPrefill({
      sourcePath: "/smlouvy/abc-123",
      sourceProduct: "allianzAuto",
      contractNumber: "2026-001",
      policyholderName: "Testovací firma",
      personalId: "12 34 56 78",
      insurer: "Allianz",
      insuranceType: "nonLife",
      reason: "periodEnd",
    });

    expect(prefill?.personalId).toBe("12345678");
  });

  it("zahodí neznámý důvod výpovědi", () => {
    expect(
      normalizeContractTerminationPrefill({
        insurer: "Allianz",
        insuranceType: "nonLife",
        reason: "neplatny-duvod",
      })?.reason,
    ).toBeNull();
  });

  it("přenese předvyplnění jednorázově přes session storage", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("window", {
      crypto: {
        randomUUID: () => "123e4567-e89b-12d3-a456-426614174000",
      },
      sessionStorage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key),
      },
    });

    const payload = normalizeContractTerminationPrefill({
      sourcePath: "/smlouvy/abc-123",
      contractNumber: "2026-001",
      policyholderName: "Petra Nováková",
      personalId: "850101/1234",
      insurer: "Allianz",
      insuranceType: "nonLife",
      reason: "periodEnd",
    });
    expect(payload).not.toBeNull();

    const key = storeContractTerminationPrefill(payload!);
    expect(key).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(consumeContractTerminationPrefill(key)).toEqual(payload);
    expect(consumeContractTerminationPrefill(key)).toBeNull();
  });
});
