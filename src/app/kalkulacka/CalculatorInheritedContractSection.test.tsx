// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { CommissionMode, Position } from "@/app/types/domain";
import { CalculatorInheritedContractSection } from "./CalculatorInheritedContractSection";

describe("inherited contract form", () => {
  let container: HTMLDivElement;
  let root: Root;
  function Harness() {
    const [position, setPosition] = useState<Position | "">("");
    const [name, setName] = useState("");
    const [date, setDate] = useState("2026-09-10");
    const [mode, setMode] = useState<CommissionMode>("standard");
    return <CalculatorInheritedContractSection originalPosition={position} originalAdviserName={name}
      effectiveDate={date} mode={mode} canChooseMode onPositionChange={setPosition}
      onNameChange={setName} onDateChange={setDate} onModeChange={setMode} />;
  }
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("requires an explicit original career position and acquisition date, with an optional adviser name", async () => {
    const position = container.querySelector<HTMLSelectElement>("#inherited-position")!;
    const date = container.querySelector<HTMLInputElement>("#inherited-date")!;
    const name = container.querySelector<HTMLInputElement>("#inherited-adviser")!;
    expect(position.value).toBe("");
    expect(position.required).toBe(true);
    expect(position.checkValidity()).toBe(false);
    expect(date.required).toBe(true);
    expect(name.required).toBe(false);
    await act(async () => {
      position.value = "poradce4";
      position.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(position.value).toBe("poradce4");
    expect(position.checkValidity()).toBe(true);
    expect(container.querySelector('label[for="inherited-position"]')?.textContent).toContain("původním sjednání");
  });

  it("keeps manually entered adviser details and original commission mode", async () => {
    const name = container.querySelector<HTMLInputElement>("#inherited-adviser")!;
    const date = container.querySelector<HTMLInputElement>("#inherited-date")!;
    const mode = container.querySelector<HTMLSelectElement>("#inherited-mode")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Petr Novák");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(date, "2026-08-01");
      date.dispatchEvent(new Event("input", { bubbles: true }));
      mode.value = "accelerated";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(name.value).toBe("Petr Novák");
    expect(date.value).toBe("2026-08-01");
    expect(mode.value).toBe("accelerated");
  });
});
