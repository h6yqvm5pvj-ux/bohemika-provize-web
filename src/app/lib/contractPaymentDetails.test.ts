import { describe, expect, it } from "vitest";
import { buildContractPaymentQrPayload, normalizeContractPaymentDetails } from "./contractPaymentDetails";

// Public format examples from the Czech National Bank and QR Platba specification.
const payment = { amount: 480.55, accountNumber: "19-2000145399/0800", variableSymbol: "0012345678", dueDate: "2028-02-29" };

describe("contract payment details", () => {
  it("normalizes whitespace without losing the variable symbol's leading zeros", () => {
    expect(normalizeContractPaymentDetails({ ...payment, accountNumber: "19 - 2000145399 / 0800", variableSymbol: " 0012345678 ", ignored: "not retained" })).toEqual(payment);
  });

  it.each([undefined, null, ""])("accepts an absent optional due date: %j", dueDate => {
    expect(normalizeContractPaymentDetails({ ...payment, dueDate })).toEqual({ ...payment, dueDate: null });
    expect(buildContractPaymentQrPayload({ ...payment, dueDate })).not.toContain("*DT:");
  });

  it.each([null, undefined, [], "payment", 123, true])("rejects a non-object input: %j", value => {
    expect(normalizeContractPaymentDetails(value)).toBeNull();
    expect(buildContractPaymentQrPayload(value)).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, "480.55", 0.001, 1.005, 10_000_000, 9_999_999.991])("rejects an invalid payment amount: %j", amount => {
    expect(normalizeContractPaymentDetails({ ...payment, amount })).toBeNull();
  });

  it.each([0.01, 0.29, 1.1, 9_999_999.99])("retains a valid amount including cents and the format limit: %j", amount => {
    expect(normalizeContractPaymentDetails({ ...payment, amount })?.amount).toBe(amount);
    expect(buildContractPaymentQrPayload({ ...payment, amount })).toContain(`*AM:${amount.toFixed(2)}*`);
  });

  it.each([
    "19-2000145398/0800", "18-2000145399/0800", "123/0000", "1/0600", "0000000000/0600",
    "0000000001/0600", "1234567-123/0600", "12345678901/0600", "123/600", "123/06000",
    "CZ6508000000192000145399", "https://example.test/123", "123/0600*AM:1", "123/0600\u0000", 123,
  ])("rejects a malformed or checksum-invalid domestic account: %j", accountNumber => {
    expect(normalizeContractPaymentDetails({ ...payment, accountNumber })).toBeNull();
    expect(buildContractPaymentQrPayload({ ...payment, accountNumber })).toBeNull();
  });

  it.each([null, 1234567890, "", "12345678901", "12 34", "123*AM:1", "<script>", "https://example.test"])("rejects a malformed variable symbol: %j", variableSymbol => {
    expect(normalizeContractPaymentDetails({ ...payment, variableSymbol })).toBeNull();
  });

  it.each(["2027-02-29", "2028-02-30", "2028-13-01", "28-02-29", "1999-12-31", "2101-01-01", "2028-02-29*AM:1", 20280229])("rejects invalid or injected due dates: %j", dueDate => {
    expect(normalizeContractPaymentDetails({ ...payment, dueDate })).toBeNull();
  });

  it("rejects an explicit foreign currency instead of labeling it CZK", () => {
    expect(normalizeContractPaymentDetails({ ...payment, currency: "EUR" })).toBeNull();
    expect(normalizeContractPaymentDetails({ ...payment, currency: "CZK" })).toEqual(payment);
  });
});

describe("Czech QR payment payload", () => {
  it("matches the ČNB example with an account prefix and includes exact cents, VS and due date", () => {
    expect(buildContractPaymentQrPayload(payment)).toBe("SPD*1.0*ACC:CZ6508000000192000145399*AM:480.55*CC:CZK*X-VS:0012345678*DT:20280229");
  });

  it("matches the second ČNB example, including a full six-digit prefix", () => {
    expect(buildContractPaymentQrPayload({ ...payment, accountNumber: "178124-4159/0710", dueDate: null })).toBe("SPD*1.0*ACC:CZ6907101781240000004159*AM:480.55*CC:CZK*X-VS:0012345678");
  });

  it("matches the QR Platba example without an account prefix", () => {
    expect(buildContractPaymentQrPayload({ amount: 450, accountNumber: "123/0600", variableSymbol: "1234567890" })).toBe("SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*X-VS:1234567890");
  });

  it("does not forward extra instructions, URLs, names or account alternatives", () => {
    const payload = buildContractPaymentQrPayload({ ...payment, message: "private", url: "https://example.test", iban: "injected", alternateAccount: "123/0600" });
    expect(payload).toBe(buildContractPaymentQrPayload(payment));
    expect(payload).not.toMatch(/private|https|injected|ALT-ACC|MSG|RN|X-URL/);
  });
});
