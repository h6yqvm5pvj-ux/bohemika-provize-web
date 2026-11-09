// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildContractPaymentQrPayload, type ContractPaymentDetails } from "@/app/lib/contractPaymentDetails";
import { ContractPaymentDetailsDialog } from "./ContractPaymentDetailsDialog";
import { ContractPaymentDetailsError, contractPaymentDetailsErrorMessage } from "./contractPaymentDetailsErrors";

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock("qrcode", () => ({ default: qr }));

type Props = ComponentProps<typeof ContractPaymentDetailsDialog>;
const png = "data:image/png;base64,c3ludGhldGlj";
const payment: ContractPaymentDetails = {
  amount: 1234.5, accountNumber: "19-2000145399/0800", variableSymbol: "0001234567", dueDate: "2026-11-05",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("contract payment details dialog", () => {
  let root: Root;
  let container: HTMLDivElement;
  let mounted: boolean;
  const close = vi.fn();
  const load = vi.fn<Props["loadPaymentDetails"]>();
  const render = async (overrides: Partial<Props> = {}) => act(async () => {
    root.render(<ContractPaymentDetailsDialog open contractNumber="0012345678" productName="Pillow Auto" advisorName="Jana Poradenská" onClose={close} loadPaymentDetails={load} {...overrides} />);
  });

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled for synthetic payment tests"); }));
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
    qr.toDataURL.mockReset().mockResolvedValue(png);
    close.mockClear();
    load.mockReset().mockResolvedValue(payment);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mounted = true;
  });
  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    expect(fetch).not.toHaveBeenCalled();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not read the PDF or render payment data before the user opens the dialog", async () => {
    await render({ open: false });
    expect(container.querySelector("dialog")).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it("opens a labelled modal and displays the PDF fields and a locally encoded QR payment", async () => {
    await render();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(container.querySelector("h2")?.id).toBe(dialog.getAttribute("aria-labelledby"));
    expect(container.querySelector("h2")?.textContent).toBe("Platební údaje");
    expect(container.textContent).toContain("Platební údaje a pojištěná rizika uvedená ve smlouvě.");
    expect(container.textContent?.replace(/\s/g, " ")).toContain("1 234,5 Kč");
    expect(container.textContent).toContain(payment.accountNumber);
    expect(container.textContent).toContain("0001234567");
    expect(container.textContent).toContain("5. 11. 2026");
    expect(qr.toDataURL).toHaveBeenCalledExactlyOnceWith(buildContractPaymentQrPayload(payment), expect.objectContaining({
      errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" },
    }));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(png);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("QR platba podle smlouvy");
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows the ČPP Auto first year premium note returned by the PDF loader", async () => {
    load.mockResolvedValue({ ...payment, frequency: "annual", paymentNote: "Částka k úhradě je platná pouze pro 1. rok pojištění." });
    await render();
    expect(container.textContent).toContain("Částka k úhradě je platná pouze pro 1. rok pojištění.");
    expect(container.textContent).toContain("Frekvence platbyRočně");
  });

  it("shows insured items parsed from the Kooperativa policy", async () => {
    load.mockResolvedValue({ ...payment, insuredItems: ["Trvale obývaná domácnost", "Odpovědnost v běžném občanském životě"] });
    await render();
    expect(container.querySelector('[aria-label="Co je pojištěno"]')?.textContent)
      .toContain("Trvale obývaná domácnost");
    expect(container.textContent).toContain("Odpovědnost v běžném občanském životě");
  });

  it("opens native sharing with the payment summary", async () => {
    const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
    const canShareDescriptor = Object.getOwnPropertyDescriptor(navigator, "canShare");
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
    try {
      await render();
      const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes("Sdílet"))!;
      await act(async () => button.click());
      expect(share).toHaveBeenCalledTimes(1);
      expect(share.mock.calls[0][0]).toMatchObject({
        title: "Platební údaje",
        text: expect.stringContaining("Zdravím, zasílám platební údaje ke smlouvě č. 0012345678 (Pillow Auto)."),
        files: [expect.objectContaining({ name: "qr-platba-0012345678.png", type: "image/png" })],
      });
      expect(share.mock.calls[0][0].text).toContain("Variabilní symbol: 0001234567");
      expect(share.mock.calls[0][0].text).toContain("S pozdravem\nJana Poradenská");
      expect(container.textContent).toContain("včetně QR kódu");
    } finally {
      if (shareDescriptor) Object.defineProperty(navigator, "share", shareDescriptor);
      else Reflect.deleteProperty(navigator, "share");
      if (canShareDescriptor) Object.defineProperty(navigator, "canShare", canShareDescriptor);
      else Reflect.deleteProperty(navigator, "canShare");
    }
  });

  it("copies a payment summary when native sharing is unavailable", async () => {
    const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      await render();
      const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes("Sdílet"))!;
      await act(async () => button.click());
      expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Číslo účtu: 19-2000145399/0800"));
      expect(container.textContent).toContain("Můžeš je vložit do zprávy.");
    } finally {
      if (shareDescriptor) Object.defineProperty(navigator, "share", shareDescriptor);
      else Reflect.deleteProperty(navigator, "share");
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("shows a loading state and never inserts values from an invalid payment block", async () => {
    const pending = deferred<ContractPaymentDetails>();
    load.mockReturnValue(pending.promise);
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Načítám platební údaje");
    expect(container.querySelector("dl")).toBeNull();
    await act(async () => pending.resolve({ ...payment, accountNumber: "<img src=x onerror=alert(1)>" }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Platební údaje se v PDF nepodařilo načíst.");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("onerror");
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it("reports a PDF loading failure without displaying diagnostic contents", async () => {
    load.mockRejectedValue(new Error("Synthetic private bank data and internal path"));
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("private bank");
    expect(container.textContent).not.toContain(payment.accountNumber);
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it("shows an allowlisted stage error and retries the PDF read with a fresh signal", async () => {
    const error = new ContractPaymentDetailsError("pdfDownload");
    load.mockRejectedValueOnce(error);
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(contractPaymentDetailsErrorMessage(error));
    const previousSignal = load.mock.calls[0][0];
    const next = deferred<ContractPaymentDetails>();
    load.mockReturnValueOnce(next.promise);
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Zkusit znovu")!;
    await act(async () => retry.click());
    expect(previousSignal.aborted).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0]).not.toBe(previousSignal);
    expect(load.mock.calls[1][0].aborted).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Načítám platební údaje");
    await act(async () => next.resolve(payment));
    expect(container.textContent).toContain(payment.accountNumber);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(png);
  });

  it("keeps the readable payment fields if QR generation fails and never shows a placeholder QR", async () => {
    qr.toDataURL.mockRejectedValue(new Error("Synthetic private encoding diagnostic"));
    await render();
    expect(container.textContent).toContain(payment.accountNumber);
    expect(container.textContent).toContain("0001234567");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("QR kód se nepodařilo vytvořit.");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("private encoding");
  });

  it("rejects any QR image source outside the expected local PNG data URL", async () => {
    qr.toDataURL.mockResolvedValue("https://example.invalid/qr?private=data");
    await render();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("QR kód se nepodařilo vytvořit.");
  });

  it("aborts a pending PDF read on native cancellation and ignores its later result", async () => {
    const pending = deferred<ContractPaymentDetails>();
    load.mockReturnValue(pending.promise);
    await render();
    const signal = load.mock.calls[0][0];
    const cancel = new Event("cancel", { cancelable: true });
    await act(async () => container.querySelector("dialog")!.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    await render({ open: false });
    await act(async () => pending.resolve(payment));
    expect(container.querySelector("dialog")).toBeNull();
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it("hides old document values immediately on a loader change and ignores its pending QR", async () => {
    const oldQr = deferred<string>();
    qr.toDataURL.mockReturnValueOnce(oldQr.promise);
    await render();
    expect(container.textContent).toContain("0001234567");
    const next = deferred<ContractPaymentDetails>();
    const newLoad = vi.fn(async () => next.promise);
    await render({ loadPaymentDetails: newLoad });
    expect(load.mock.calls[0][0].aborted).toBe(true);
    expect(container.textContent).not.toContain("0001234567");
    expect(container.querySelector("dl")).toBeNull();
    await act(async () => oldQr.resolve(png));
    expect(container.querySelector("img")).toBeNull();
    await act(async () => next.resolve({ ...payment, variableSymbol: "0007654321", dueDate: null }));
    expect(container.textContent).toContain("0007654321");
    expect(container.textContent).not.toContain("0001234567");
    expect(container.textContent).not.toContain("Datum splatnosti");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(png);
  });

  it("closes with Escape, aborts work and restores focus and scrolling", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const beforeOverflow = document.body.style.overflow;
    try {
      await render();
      const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="Zavřít platební údaje"]')!;
      expect(document.activeElement).toBe(closeButton);
      expect(document.body.style.overflow).toBe("hidden");
      await act(async () => closeButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
      expect(close).toHaveBeenCalledOnce();
      expect(load.mock.calls[0][0].aborted).toBe(true);
      await render({ open: false });
      expect(document.activeElement).toBe(trigger);
      expect(document.body.style.overflow).toBe(beforeOverflow);
    } finally { trigger.remove(); }
  });

  it("aborts on unmount and performs a fresh read when reopened", async () => {
    await render();
    const previousSignal = load.mock.calls[0][0];
    await render({ open: false });
    expect(previousSignal.aborted).toBe(true);
    const next = deferred<ContractPaymentDetails>();
    load.mockReturnValue(next.promise);
    await render();
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.querySelector("dl")).toBeNull();
    const signal = load.mock.calls[1][0];
    await act(async () => root.unmount());
    mounted = false;
    expect(signal.aborted).toBe(true);
    await act(async () => next.resolve(payment));
    expect(qr.toDataURL).toHaveBeenCalledTimes(1);
  });
});
