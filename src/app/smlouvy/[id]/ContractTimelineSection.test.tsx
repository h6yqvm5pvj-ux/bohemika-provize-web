// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractTimelineSection } from "./ContractTimelineSection";
import type { ContractDoc } from "./contractDetailTypes";

const owner = "owner@example.test";
const original: ContractDoc = {
  id: "root", userEmail: owner, productKey: "neon", entryType: "contract", inputAmount: 2000,
  policyStartDate: "2022-02-01", contractSignedDate: "2022-01-01", position: "poradce1", commissionMode: "standard",
  items: [{ title: "Provize po 3 letech", code: "B3601", amount: 1000 }],
};
const amendment: ContractDoc = {
  id: "change", userEmail: owner, productKey: "neon", entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root",
  policyStartDate: "2024-02-01", contractSignedDate: "2024-01-01", previousInputAmount: 2000, newInputAmount: 1500,
  premiumDelta: -500, changeType: "decrease", frequencyRaw: "monthly", items: [],
};
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  window.history.replaceState(null, "", "/");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(entries = [original, amendment], selectedEntryId: string | null = null, viewerEmail = owner) {
  await act(async () => root.render(<ContractTimelineSection entries={entries} ownerEmail={owner} viewerEmail={viewerEmail}
    selectedEntryId={selectedEntryId} onOpenNeonImmediateBreakdown={() => {}} />));
}

async function toggle(id: string, open: boolean) {
  const panel = container.querySelector<HTMLDetailsElement>(`#contract-entry-${id}`)!;
  await act(async () => {
    panel.open = open;
    panel.dispatchEvent(new Event("toggle"));
  });
  return panel;
}

describe("inline contract family", () => {
  it("renders original and amendment metadata together and mounts a commission plan only on expansion", async () => {
    await mount();
    expect(container.textContent).toContain("Původní smlouva");
    expect(container.textContent).toContain("Dodatek 1");
    expect(container.textContent).toContain("Původní pojistné");
    expect(container.textContent).toContain("Nové pojistné");
    expect(container.textContent).not.toContain("Výpočet provizí");

    await toggle("root", true);
    expect(container.textContent).toContain("Výpočet provizí");
    expect(container.querySelector('[data-premium-adjustment="true"]')?.textContent).toContain("Původně");
    expect(container.querySelector('a[href="#contract-entry-change"]')).not.toBeNull();
    expect(container.querySelector('a[href^="/smlouvy/"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens amendment provenance inline, including a repeated click after closing the same target", async () => {
    await mount();
    await toggle("root", true);
    const source = container.querySelector<HTMLAnchorElement>('a[href="#contract-entry-change"]')!;
    await act(async () => source.click());
    const amendmentPanel = container.querySelector<HTMLDetailsElement>("#contract-entry-change")!;
    expect(amendmentPanel.open).toBe(true);
    await toggle("change", false);
    await act(async () => source.click());
    expect(amendmentPanel.open).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the requested amendment within the unified view without opening every source", async () => {
    await mount([original, amendment], "change");
    expect(container.querySelector<HTMLDetailsElement>("#contract-entry-change")?.open).toBe(true);
    expect(container.querySelector<HTMLDetailsElement>("#contract-entry-root")?.open).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens a newly requested amendment on the mounted page and preserves a later manual collapse", async () => {
    await mount();
    expect(container.querySelector<HTMLDetailsElement>("#contract-entry-change")?.open).toBe(false);
    await mount([original, amendment], "change");
    expect(container.querySelector<HTMLDetailsElement>("#contract-entry-change")?.open).toBe(true);
    expect(container.querySelector<HTMLDetailsElement>("#contract-entry-root")?.open).toBe(false);
    await toggle("change", false);
    await mount([original, { ...amendment, note: "Aktualizovaná poznámka" }], "change");
    expect(container.querySelector<HTMLDetailsElement>("#contract-entry-change")?.open).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses only the current viewer's manager calculation and statement records", async () => {
    const manager = "manager@example.test";
    const managed = { ...amendment, managerOverrides: [
      { email: manager, position: "manazer4" as const, commissionMode: "standard" as const,
        items: [{ title: "Moje provize", code: "A101", amount: 10 }], total: 10 },
      { email: "other@example.test", position: "manazer5" as const, commissionMode: "standard" as const,
        items: [{ title: "Cizí privátní výpočet", code: "A101", amount: 99999 }], total: 99999 },
    ], commissionPayouts: [
      { code: "A101", amount: 10, writtenBy: manager, detail: "Můj výpis" },
      { code: "A101", amount: 99999, writtenBy: owner, detail: "Cizí privátní výpis" },
    ] };
    await mount([original, managed], "change", manager);
    expect(container.textContent).toContain("Moje provize");
    expect(container.textContent).not.toContain("Cizí privátní výpočet");
    expect(container.textContent).not.toContain("Cizí privátní výpis");
    expect(container.textContent).not.toContain("99.999");
  });

  it("keeps notes out of individual amendments and supports non-life amendment details", async () => {
    const unsafeNote = '<script>alert("test")</script>';
    await mount([{ ...original, productKey: "cppPPRbez" }, { ...amendment, productKey: "cppPPRbez", note: unsafeNote }]);
    expect(container.textContent).not.toContain(unsafeNote);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Dodatek 1");
  });

  it("edits the selected source and imports only that source's attached PDF without navigation or extra reads", async () => {
    const onEditEntry = vi.fn();
    const onRefreshPdf = vi.fn();
    const withPdf: ContractDoc = { ...amendment, contractPdfAttachment: { hasFile: true, contentType: "application/pdf" } };
    const beforeUrl = window.location.href;
    await act(async () => root.render(<ContractTimelineSection entries={[original, withPdf]} ownerEmail={owner} viewerEmail={owner}
      onEditEntry={onEditEntry} onRefreshPdf={onRefreshPdf} onOpenNeonImmediateBreakdown={() => {}} />));
    const rootPanel = container.querySelector<HTMLDetailsElement>("#contract-entry-root")!;
    const amendmentPanel = container.querySelector<HTMLDetailsElement>("#contract-entry-change")!;
    const button = (panel: Element, label: string) => Array.from(panel.querySelectorAll("button")).find(item => item.textContent?.trim() === label)!;
    expect(button(rootPanel, "Doplnit údaje z PDF")).toBeUndefined();
    await act(async () => button(rootPanel, "Upravit smlouvu").click());
    expect(onEditEntry).toHaveBeenLastCalledWith("root");
    await act(async () => button(amendmentPanel, "Upravit dodatek").click());
    expect(onEditEntry).toHaveBeenLastCalledWith("change");
    await act(async () => button(amendmentPanel, "Doplnit údaje z PDF").click());
    expect(onRefreshPdf).toHaveBeenCalledExactlyOnceWith("change");
    expect(window.location.href).toBe(beforeUrl);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables source actions while edits or PDF imports are busy and omits them for read-only views", async () => {
    const onEditEntry = vi.fn();
    const onRefreshPdf = vi.fn();
    const withPdf: ContractDoc = { ...amendment, contractPdfAttachment: { hasFile: true, contentType: "application/pdf" } };
    await act(async () => root.render(<ContractTimelineSection entries={[original, withPdf]} ownerEmail={owner} viewerEmail={owner}
      onEditEntry={onEditEntry} editingDisabled onRefreshPdf={onRefreshPdf} pdfRefreshDisabled onOpenNeonImmediateBreakdown={() => {}} />));
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons).toHaveLength(3);
    expect(buttons.every(button => button.disabled)).toBe(true);
    await act(async () => buttons.forEach(button => button.click()));
    expect(onEditEntry).not.toHaveBeenCalled();
    expect(onRefreshPdf).not.toHaveBeenCalled();
    await mount([original, withPdf]);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
