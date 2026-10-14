// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CareerTimelinePanel } from "./CareerTimelinePanel";

type PanelProps = ComponentProps<typeof CareerTimelinePanel>;

describe("career settings timeline", () => {
  let root: Root;
  let container: HTMLDivElement;
  let props: PanelProps;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = {
      positions: [{ id: "poradce5", label: "Poradce 5" }, { id: "manazer6", label: "Manažer 6" }],
      rows: [
        { id: "synthetic-previous", position: "poradce5", validFrom: "2020-01-01", validTo: "2025-01-01" },
        { id: "synthetic-current", position: "manazer6", validFrom: "2025-01-01", validTo: "" },
      ],
      fieldClass: "",
      locked: false,
      saving: false,
      saved: false,
      error: null,
      helpOpen: false,
      onHelpOpen: vi.fn(),
      onHelpClose: vi.fn(),
      onAddRow: vi.fn(),
      onPrependRow: vi.fn(),
      onUnlock: vi.fn(),
      onUpdateRow: vi.fn(),
      onRemoveRow: vi.fn(),
      onImport: vi.fn(),
      onSave: vi.fn(),
    };
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const render = async (overrides: Partial<PanelProps> = {}) => {
    await act(async () => root.render(<CareerTimelinePanel {...props} {...overrides} />));
  };

  const button = (text: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.includes(text))!;

  it("shows saved periods as read-only and requires unlocking before editing", async () => {
    await render({ locked: true });
    const periods = [...container.querySelectorAll("ol > li")];
    expect(periods).toHaveLength(2);
    expect(periods[0].textContent).toContain("Poradce 5");
    expect(periods[0].textContent).toContain("01.01.2020");
    expect(periods[0].textContent).toContain("01.01.2025");
    expect(periods[1].textContent).toContain("Manažer 6");
    expect(periods[1].textContent).toContain("Současná pozice");
    expect(periods[1].textContent).toContain("současnost");
    expect(container.querySelector("input, select, textarea")).toBeNull();
    expect(container.querySelector('[aria-label^="Smazat období"]')).toBeNull();
    expect(container.querySelector("details")).toBeNull();

    await act(async () => button("Upravit").click());
    expect(props.onUnlock).toHaveBeenCalledOnce();
    expect(props.onUpdateRow).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("routes position, date and ongoing-period edits to the selected row before saving", async () => {
    await render();
    const position = container.querySelector<HTMLSelectElement>("#career-position-synthetic-current")!;
    await act(async () => {
      position.value = "poradce5";
      position.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onUpdateRow).toHaveBeenLastCalledWith("synthetic-current", { position: "poradce5" });

    const from = container.querySelector<HTMLInputElement>("#career-from-synthetic-previous")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(from, "2021-02-03");
      from.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(props.onUpdateRow).toHaveBeenLastCalledWith("synthetic-previous", { validFrom: "2021-02-03" });

    const to = container.querySelector<HTMLInputElement>("#career-to-synthetic-current")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(to, "2026-10-01");
      to.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(props.onUpdateRow).toHaveBeenLastCalledWith("synthetic-current", { validTo: "2026-10-01" });

    await act(async () => button("Do současnosti").click());
    expect(props.onUpdateRow).toHaveBeenLastCalledWith("synthetic-current", { validTo: "" });
    expect(props.onSave).not.toHaveBeenCalled();
    await act(async () => button("Uložit historii").click());
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("disables import, editing and repeated saves while a save is in progress", async () => {
    await render({ saving: true });
    const fields = [...container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")];
    expect(fields).toHaveLength(7);
    expect(fields.every(field => field.disabled)).toBe(true);
    const mutationButtons = [...container.querySelectorAll("button")].filter(item => !item.textContent?.includes("Nápověda") && !item.textContent?.includes("Jak zkopírovat"));
    expect(mutationButtons).toHaveLength(7);
    expect(mutationButtons.every(item => item.disabled)).toBe(true);
    expect(button("Ukládám…").disabled).toBe(true);
    await act(async () => mutationButtons.forEach(item => item.click()));
    expect(props.onImport).not.toHaveBeenCalled();
    expect(props.onAddRow).not.toHaveBeenCalled();
    expect(props.onPrependRow).not.toHaveBeenCalled();
    expect(props.onUpdateRow).not.toHaveBeenCalled();
    expect(props.onRemoveRow).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
