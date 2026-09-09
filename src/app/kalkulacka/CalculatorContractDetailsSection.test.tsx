// @vitest-environment happy-dom

import { act, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorContractDetailsSection } from "./CalculatorContractDetailsSection";
import { createClientNameIndex, matchClientName } from "./clientNameMatching";
import type { ClientNameLookupStatus } from "./useClientNameLookup";

type Props = ComponentProps<typeof CalculatorContractDetailsSection>;
const noop = () => {};
const fixedProps = {
  isVisible: true, missingFields: [], contractSignedDate: "", contractNumber: "",
  contractNumberLiveCheckStatus: "idle", contractNumberLiveCheckCount: null,
  contractNumberLiveCheckMode: "newContract", policyStartDate: "", contractDateErrorText: null,
  contractDateWarningText: null, showPolicyEndDateField: false, policyEndDate: "", stornoDate: "",
  onContractSignedDateChange: noop, onContractNumberChange: noop, onPolicyStartDateChange: noop,
  onPolicyEndDateChange: noop, onStornoDateChange: noop,
} satisfies Partial<Props>;
const directory = createClientNameIndex(["Jan Buček", "Jan Bůček", "Ivan Buček", "Jana Bučková"]);

describe("client name field", () => {
  let root: Root;
  let container: HTMLDivElement;
  const selected = vi.fn();
  const retry = vi.fn();
  function Harness({ initialName = "Jan Buček", source = "pdf", status = "ready" }: {
    initialName?: string; source?: Props["clientNameSource"]; status?: ClientNameLookupStatus;
  }) {
    const [name, setName] = useState(initialName);
    const [currentSource, setSource] = useState(source);
    const [open, setOpen] = useState(true);
    return <CalculatorContractDetailsSection {...fixedProps}
      clientName={name} clientNameSource={currentSource} clientLookupStatus={status}
      clientNameMatches={status === "ready" ? matchClientName(name, directory) : []}
      clientSuggestionsOpen={open} onRetryClientLookup={retry}
      onClientNameChange={(value) => { setName(value); setSource(null); setOpen(true); }}
      onClientNameFocus={() => setOpen(true)} onClientNameBlur={() => setOpen(false)}
      onSelectClientSuggestion={(value) => { selected(value); setName(value); setSource(null); setOpen(false); }}
    />;
  }
  const input = () => container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  const typeName = async (value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  const key = async (value: string) => act(async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
  });
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(["pdf", "statement", null] as const)("shows an exact match without a redundant possible-match dropdown (%s)", async (source) => {
    await act(async () => root.render(<Harness source={source} />));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Přesná shoda jména v systému.");
    expect(input().className).toContain("border-emerald-400");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(selected).not.toHaveBeenCalled();
    if (source === "statement") {
      expect(container.textContent).toContain("Jméno načteno z výpisu.");
      expect(container.textContent).not.toContain("PDF");
    }
  });

  it("requires a choice between accent variants and supports arrow keys and Enter", async () => {
    await act(async () => root.render(<Harness initialName="Bucek Jan" />));
    expect(input().value).toBe("Bucek Jan");
    expect(input().className).not.toContain("border-emerald-400");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(container.textContent).toContain("Jiné pořadí jména");
    await key("ArrowDown");
    expect(input().getAttribute("aria-activedescendant")).toBeTruthy();
    const chosen = container.querySelector('[aria-selected="true"]')!.getAttribute("aria-label")!.replace("Vložit klienta ", "");
    await key("Enter");
    expect(selected).toHaveBeenCalledExactlyOnceWith(chosen);
    expect(input().value).toBe(chosen);
    expect(container.textContent).toContain("Přesná shoda jména v systému.");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("inserts a pointer-selected suggestion once and removes the old PDF status", async () => {
    await act(async () => root.render(<Harness initialName="Jan Bucekk" />));
    expect(container.textContent).toContain("Možný překlep");
    const option = container.querySelector<HTMLButtonElement>('[role="option"]')!;
    await act(async () => {
      option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      option.click();
    });
    expect(selected).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("PDF");
    expect(container.textContent).toContain("Přesná shoda jména v systému.");
  });

  it("rechecks after editing an exact name and closes suggestions on Escape", async () => {
    await act(async () => root.render(<Harness />));
    await typeName("Jan Bu");
    expect(input().className).not.toContain("border-emerald-400");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Jméno načteno z PDF.");
    await key("Escape");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(selected).not.toHaveBeenCalled();
  });

  it("distinguishes loading, failure and a completed search with no match", async () => {
    await act(async () => root.render(<Harness initialName="Petr Novotný" status="loading" />));
    expect(container.textContent).toContain("Hledám shodu v systému…");
    expect(container.textContent).not.toContain("nenalezena");
    await act(async () => root.render(<Harness initialName="Petr Novotný" status="error" />));
    expect(container.textContent).toContain("Vyhledávání se nepodařilo dokončit.");
    expect(container.textContent).not.toContain("nenalezena");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="status"] button')!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Harness initialName="Petr Novotný" status="ready" />));
    expect(container.textContent).toContain("Přesná shoda jména v systému nenalezena.");
  });
});
