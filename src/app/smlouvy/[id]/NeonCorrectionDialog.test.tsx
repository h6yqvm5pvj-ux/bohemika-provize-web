// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NeonCorrectionDialog } from "./NeonCorrectionDialog";

it("previews both annual bases and submits the monthly premium and annual surcharge separately", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const save = vi.fn().mockResolvedValue(undefined);
  try {
    await act(async () => root.render(<NeonCorrectionDialog contract={{ id: "synthetic-neon", inputAmount: 430 }} onSave={save} onClose={() => {}} />));
    expect(host.querySelector("h2")?.textContent).toBe("Přidat ČPP korekci");
    expect(host.textContent).toContain("Plná základna výpisů od ledna 2022");
    const fields = host.querySelectorAll<HTMLInputElement>("input");
    expect(fields).toHaveLength(2);
    expect(fields[0].value).toBe("430");
    const update = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      ["500", "840"].forEach((value, index) => {
        update.call(fields[index], value);
        fields[index].dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    const bases = Array.from(host.querySelectorAll("dd"), element => element.textContent?.replace(/[\s.]+/g, ""));
    expect(bases).toEqual(["5160,00Kč/rok", "6000,00Kč/rok"]);
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledExactlyOnceWith(500, 840);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
