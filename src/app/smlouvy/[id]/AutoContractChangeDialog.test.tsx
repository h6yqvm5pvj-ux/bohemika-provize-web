// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoContractChangeDialog } from "./AutoContractChangeDialog";
const contract = { id: "root", contractNumber: "SYNTHETIC", clientName: "Test Klient", productKey: "cppAuto" as const, policyStartDate: "2023-09-01", frequencyRaw: "annual" as const, inputAmount: 10000 };
afterEach(() => vi.unstubAllGlobals());
async function input(host: HTMLElement, selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
describe("auto contract change workflow", () => {
  it.each(["cppPPRs", "domex"] as const)("saves the %s change from detail and attaches the PDF to the new amendment", async productKey => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const propertyContract = { ...contract, productKey };
    const request = vi.fn().mockResolvedValueOnce({ endorsementId: "property-change" }).mockResolvedValueOnce({ ok: true });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    try {
      await act(async () => root.render(<AutoContractChangeDialog ownerEmail="advisor@example.test" contract={propertyContract} entryId="root"
        request={request} onClose={() => {}} onSaved={onSaved} />));
      expect([...host.querySelectorAll("select option")].map(option => (option as HTMLOptionElement).value)).toEqual(["quarterly", "semiannual", "annual"]);
      await input(host, 'input[type="date"]', "2024-09-01");
      await input(host, 'input[type="number"]', "12000");
      const dropZone = host.querySelector('input[type="file"]')!.closest("div")!;
      const drop = async (file: File) => {
        const event = new Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
        await act(async () => { dropZone.dispatchEvent(event); });
      };
      await drop(new File(["text"], "invalid.txt", { type: "text/plain" }));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("Vyber PDF");
      expect(request).not.toHaveBeenCalled();
      await drop(new File(["%PDF-1.7"], "dodatek.pdf", { type: "application/pdf" }));
      expect(host.textContent).toContain("dodatek.pdf");
      await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(request.mock.calls[0][0]).toBe("/api/contracts/payment-frequency");
      expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ entryId: "root", annualPremium: 12000, effectiveDate: "2024-09-01" });
      const [uploadUrl, uploadOptions] = request.mock.calls[1];
      expect(uploadUrl).toBe("/api/contracts/attachment");
      expect(uploadOptions.body.get("entryId")).toBe("property-change");
      expect(uploadOptions.body.get("file").name).toBe("dodatek.pdf");
      expect(onSaved).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it("loads the client from an authorized root lookup without putting the policy number in a URL", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const request = vi.fn().mockResolvedValueOnce({ entryId: "root" }).mockResolvedValueOnce({ contract, canManageContract: true });
    const loaded = vi.fn();
    try {
      await act(async () => root.render(<AutoContractChangeDialog ownerEmail="advisor@example.test" product="cppAuto" request={request} onClose={() => {}} onSaved={async () => {}} onClientLoaded={loaded} />));
      await input(host, "input", "SYNTHETIC");
      await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(loaded).toHaveBeenCalledWith("Test Klient"); expect(host.textContent).toContain("Test Klient");
      expect(request.mock.calls[0][0]).toBe("/api/contracts/auto-change-lookup"); expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ contractNumber: "SYNTHETIC" });
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it("accepts the premium per payment and sends the annual premium for the selected frequency", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const request = vi.fn().mockResolvedValue({ endorsementId: "change-one" });
    const quarterlyContract = { ...contract, productKey: "kooperativaAuto" as const, frequencyRaw: "quarterly" as const, inputAmount: 2500 };
    try {
      await act(async () => root.render(<AutoContractChangeDialog ownerEmail="advisor@example.test" contract={quarterlyContract} entryId="root" request={request} onClose={() => {}} onSaved={async () => {}} />));
      expect(host.textContent).toContain("Nové frekvenční pojistné (Kč)");
      const premium = host.querySelector<HTMLInputElement>('input[type="number"]')!;
      expect(premium.value).toBe("2500");

      const select = host.querySelector("select")!;
      await act(async () => { select.value = "monthly"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(premium.value).toBe("");
      await input(host, 'input[type="number"]', "1024.55");
      expect(host.textContent).toContain(`Roční pojistné vychází na ${(12294.6).toLocaleString("cs-CZ")} Kč.`);

      await input(host, 'input[type="date"]', "2024-09-01");
      await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0][0]).toBe("/api/contracts/payment-frequency");
      expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ frequency: "monthly", annualPremium: 12294.6 });
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it("retries a failed PDF upload on the same saved amendment, locking its financial values", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const request = vi.fn().mockResolvedValueOnce({ endorsementId: "change-one" }).mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValueOnce({ ok: true });
    const saved = vi.fn().mockResolvedValue(undefined);
    try {
      await act(async () => root.render(<AutoContractChangeDialog ownerEmail="advisor@example.test" contract={contract} entryId="root" request={request} onClose={() => {}} onSaved={saved} />));
      await input(host, 'input[type="date"]', "2024-09-01"); await input(host, 'input[type="number"]', "3000");
      const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["%PDF-1.7"], "synthetic.pdf", { type: "application/pdf" })] });
      await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
      const submit = () => act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      await submit(); expect(host.textContent).toContain("Dodatek a změna výpočtu jsou uložené");
      expect(host.querySelector<HTMLInputElement>('input[type="number"]')!.disabled).toBe(true);
      await submit(); expect(saved).toHaveBeenCalledOnce();
      expect(request.mock.calls.filter(call => call[0] === "/api/contracts/payment-frequency")).toHaveLength(1);
      for (const call of request.mock.calls.filter(call => call[0] === "/api/contracts/attachment")) expect(call[1].body.get("entryId")).toBe("change-one");
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
