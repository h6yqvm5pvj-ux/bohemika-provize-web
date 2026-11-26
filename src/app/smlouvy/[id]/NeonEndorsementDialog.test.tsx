// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NeonEndorsementDialog } from "./NeonEndorsementDialog";
import { parseNeonPdf, type NeonPdfResult } from "@/app/lib/parseNeonPdf";

vi.mock("@/app/lib/parseNeonPdf", () => ({ parseNeonPdf: vi.fn() }));

const ownerEmail = "advisor@example.test";
const request = vi.fn();
const onSaved = vi.fn();
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSaved.mockResolvedValue(undefined);
  vi.mocked(parseNeonPdf).mockResolvedValue({});
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function renderForm() {
  await act(async () => root.render(<NeonEndorsementDialog ownerEmail={ownerEmail} entryId="root"
    contractNumber="9400001234" request={request} onSaved={onSaved} onClose={() => {}} />));
}

async function fillForm() {
  await renderForm();
  const fields = host.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="number"]');
  const updateValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    ["2026-04-01", "2026-03-12", "1520.55"].forEach((value, index) => {
      updateValue.call(fields[index], value);
      fields[index].dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

async function drop(file: File) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  await act(async () => host.querySelector('input[type="file"]')!.dispatchEvent(event));
}

const submit = () => act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

const amendment: NeonPdfResult = {
  isEndorsement: true, contractNumber: "9400001234", policyStartDate: "2026-04-01", contractSignedDate: "2026-03-12", amount: 1520.55,
};
const pdfFile = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" });
const formValues = () => Array.from(host.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="number"]'), field => field.value);

it("prefills both dates and the premium on file selection before contacting the backend", async () => {
  const pdf = pdfFile("change.pdf");
  vi.mocked(parseNeonPdf).mockResolvedValue(amendment);
  request.mockResolvedValueOnce({ entryId: "created-amendment" }).mockResolvedValueOnce({ ok: true });

  await renderForm();
  const input = host.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [pdf], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(parseNeonPdf).toHaveBeenCalledExactlyOnceWith(pdf, expect.objectContaining({ endorsementOnly: true }));
  expect(formValues()).toEqual(["2026-04-01", "2026-03-12", "1520.55"]);
  expect(host.textContent).toContain("Zkontroluj je před uložením");
  expect(request).not.toHaveBeenCalled();

  await submit();
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ monthlyPremium: 1520.55 });
  expect(request.mock.calls[1][1].body.get("file").name).toBe(pdf.name);
});

it("rejects a recognized amendment for a different policy before it can be uploaded", async () => {
  vi.mocked(parseNeonPdf).mockResolvedValue({ ...amendment, contractNumber: "9400009999" });
  await fillForm();
  await drop(pdfFile("wrong-policy.pdf"));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("PDF je k jiné smlouvě");
  expect(host.textContent).not.toContain("wrong-policy.pdf");
  expect(formValues()).toEqual(["2026-04-01", "2026-03-12", "1520.55"]);
  await submit();
  expect(request).not.toHaveBeenCalled();
});

it("keeps manual values and ignores a late result after the attachment is replaced", async () => {
  let finishFirst: (value: NeonPdfResult) => void = () => {};
  vi.mocked(parseNeonPdf).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
    .mockResolvedValueOnce({ ...amendment, policyStartDate: "2026-05-01", contractSignedDate: null });
  await renderForm();
  await drop(pdfFile("old.pdf"));
  expect(host.textContent).toContain("Čtu údaje z PDF");
  const premium = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(premium, "1600");
    premium.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await drop(pdfFile("new.pdf"));
  expect(formValues()).toEqual(["2026-05-01", "", "1600"]);
  expect(host.textContent).toContain("Část údajů je načtená");
  await act(async () => finishFirst(amendment));
  expect(formValues()).toEqual(["2026-05-01", "", "1600"]);
  expect(host.textContent).toContain("new.pdf");
});

it("saves both dates and the monthly amount, then retries the dropped PDF on the saved endorsement", async () => {
  const pdf = new File(["%PDF-1.7"], "dodatek.pdf", { type: "application/pdf" });
  request.mockResolvedValueOnce({ entryId: "created-amendment" })
    .mockRejectedValueOnce(new Error("PDF se nepodařilo nahrát."))
    .mockResolvedValueOnce({ ok: true });

  await fillForm();
  await drop(pdf);
  expect(host.textContent).toContain("dodatek.pdf");
  await submit();

  expect(request.mock.calls[0][0]).toBe("/api/contracts/neon-endorsement");
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ ownerEmail, entryId: "root", signedDate: "2026-03-12", effectiveDate: "2026-04-01", monthlyPremium: 1520.55 });
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Dodatek je uložený. PDF se nepodařilo nahrát.");
  expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.disabled).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();

  await submit();
  expect(request.mock.calls.map(([url]) => url)).toEqual(["/api/contracts/neon-endorsement", "/api/contracts/attachment", "/api/contracts/attachment"]);
  for (const [, { body }] of request.mock.calls.slice(1)) {
    expect(body.get("entryId")).toBe("created-amendment");
    expect(body.get("onlyIfMissing")).toBe("1");
    expect(body.get("file").name).toBe(pdf.name);
  }
  expect(onSaved).toHaveBeenCalledOnce();
});

it("saves without an optional PDF and rejects other dropped file types", async () => {
  request.mockResolvedValue({ entryId: "created-amendment" });
  await fillForm();
  await drop(new File(["synthetic"], "dodatek.txt", { type: "text/plain" }));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Vyber soubor ve formátu PDF.");
  await submit();
  expect(request).not.toHaveBeenCalled();

  await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  await submit();
  expect(request).toHaveBeenCalledOnce();
  expect(onSaved).toHaveBeenCalledOnce();
});
