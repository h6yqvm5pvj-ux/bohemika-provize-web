import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadContractPaymentDetailsFromPdf } from "./contractPaymentDetailsLoader";
import { contractPaymentDetailsErrorMessage } from "./contractPaymentDetailsErrors";

const mocks = vi.hoisted(() => ({ parseDomex: vi.fn(), parseKoop: vi.fn(), parseKoopOdzam: vi.fn() }));
vi.mock("@/app/lib/parseDomexPdf", () => ({ parseDomexPdf: mocks.parseDomex }));
vi.mock("@/app/lib/parseKoopMajetekObcanPdf", () => ({ parseKoopMajetekObcanPdf: mocks.parseKoop }));
vi.mock("@/app/lib/parseKoopOdzamPdf", () => ({ parseKoopOdzamPdf: mocks.parseKoopOdzam }));

const payment = { amount: 1250, accountNumber: "19-2000145399/0800", variableSymbol: "0012345678", dueDate: "2026-11-05" };
function options() {
  return { product: "domexneuron" as const, contractNumber: "0012345678", fileName: "synthetic.pdf", downloadPdf: vi.fn(async () => new Blob(["%PDF synthetic"])), signal: new AbortController().signal };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseDomex.mockResolvedValue({ contractNumber: "0012345678", paymentDetails: payment });
  mocks.parseKoop.mockResolvedValue({ contractNumber: "0012345678", paymentDetails: payment, insuredItems: ["Pojištěná domácnost"] });
  mocks.parseKoopOdzam.mockResolvedValue({ contractNumber: "0012345678", paymentDetails: payment });
});

describe("payment details from authorized PDF", () => {
  it("loads the contract PDF and preserves the amount, recipient and leading zeroes", async () => {
    const input = options();
    await expect(loadContractPaymentDetailsFromPdf(input)).resolves.toEqual(payment);
    expect(input.downloadPdf).toHaveBeenCalledExactlyOnceWith(input.signal);
    expect(mocks.parseDomex).toHaveBeenCalledWith(expect.any(File), { signal: input.signal, allowOcr: true });
  });

  it("uses the Kooperativa property parser when the contract product is selected", async () => {
    const input = { ...options(), product: "koopmajetekobcan" as const };
    await expect(loadContractPaymentDetailsFromPdf(input)).resolves.toEqual({ ...payment, insuredItems: ["Pojištěná domácnost"] });
    expect(mocks.parseKoop).toHaveBeenCalledExactlyOnceWith(expect.any(File), { signal: input.signal, allowOcr: true });
    expect(mocks.parseDomex).not.toHaveBeenCalled();
  });

  it("uses the employee liability parser when the Kooperativa employee product is selected", async () => {
    const input = { ...options(), product: "koopodzam" as const };
    await expect(loadContractPaymentDetailsFromPdf(input)).resolves.toEqual(payment);
    expect(mocks.parseKoopOdzam).toHaveBeenCalledExactlyOnceWith(expect.any(File), { signal: input.signal, allowOcr: true });
    expect(mocks.parseDomex).not.toHaveBeenCalled();
    expect(mocks.parseKoop).not.toHaveBeenCalled();
  });

  it.each([
    [{ contractNumber: "0099999999", paymentDetails: payment }, "contractMismatch"],
    [{ contractNumber: "0012345678", paymentDetails: { ...payment, variableSymbol: "0099999999" } }, "contractMismatch"],
    [{ contractNumber: "0012345678", paymentDetails: { ...payment, accountNumber: "invalid" } }, "paymentMissing"],
    [{ contractNumber: "0012345678" }, "paymentMissing"],
  ])("distinguishes missing instructions from a different contract without exposing values", async (parsed, code) => {
    mocks.parseDomex.mockResolvedValue(parsed);
    await expect(loadContractPaymentDetailsFromPdf(options())).rejects.toMatchObject({ name: "ContractPaymentDetailsError", code });
  });

  it("does not read or parse PDF after an access failure", async () => {
    const input = options();
    input.downloadPdf.mockRejectedValue(new Error("Nemáš oprávnění pro tuto smlouvu."));
    await expect(loadContractPaymentDetailsFromPdf(input)).rejects.toMatchObject({ code: "pdfDownload" });
    expect(mocks.parseDomex).not.toHaveBeenCalled();
  });

  it("does not download after cancellation or invalid contract input", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = options();
    await expect(loadContractPaymentDetailsFromPdf({ ...input, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await expect(loadContractPaymentDetailsFromPdf({ ...input, contractNumber: "123*X-VS:9" })).rejects.toMatchObject({ code: "invalidContractNumber" });
    expect(input.downloadPdf).not.toHaveBeenCalled();
  });

  it("discards a late PDF result after cancellation", async () => {
    const input = options();
    const controller = new AbortController();
    input.downloadPdf.mockImplementation(async () => { controller.abort(); return new Blob(["%PDF synthetic"]); });
    await expect(loadContractPaymentDetailsFromPdf({ ...input, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.parseDomex).not.toHaveBeenCalled();
  });

  it("identifies a PDF reading failure without propagating its internal diagnostics", async () => {
    mocks.parseDomex.mockRejectedValue(new Error("Synthetic internal PDF content and path"));
    await expect(loadContractPaymentDetailsFromPdf(options())).rejects.toMatchObject({ code: "pdfRead" });
    try {
      await loadContractPaymentDetailsFromPdf(options());
    } catch (error) {
      expect(contractPaymentDetailsErrorMessage(error)).toContain("Text přiloženého PDF");
      expect(contractPaymentDetailsErrorMessage(error)).not.toContain("Synthetic");
    }
    expect(contractPaymentDetailsErrorMessage(new Error("Synthetic private bank content"))).not.toContain("Synthetic");
  });
});
