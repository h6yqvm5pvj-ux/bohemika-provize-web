// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDomexNeuronConfirmation } from "./useDomexNeuronConfirmation";

describe("DOMEX Neuron confirmation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted: boolean;
  let confirmation: ReturnType<typeof useDomexNeuronConfirmation>;

  function Harness() {
    const value = useDomexNeuronConfirmation();
    useEffect(() => { confirmation = value; }, [value]);
    return value.domexNeuronConfirmation;
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mounted = true;
    await act(async () => root.render(<Harness />));
  });

  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function ask(controller = new AbortController()) {
    let result!: Promise<boolean | null>;
    await act(async () => { result = confirmation.confirmDomexNeuron(controller.signal); });
    return { result, controller };
  }

  const button = (text: string) => Array.from(container.querySelectorAll("button"))
    .find(element => element.textContent === text)!;

  it.each([["ANO", true], ["NE", false]] as const)("returns the explicit answer %s", async (text, expected) => {
    const { result } = await ask();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(container.querySelector("h2")?.textContent).toBe("Jedná se o DOMEX Neuron?");
    expect(document.activeElement).toBe(button("Zrušit import"));
    await act(async () => button(text).click());
    await expect(result).resolves.toBe(expected);
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("returns null when import is cancelled", async () => {
    const { result } = await ask();
    await act(async () => button("Zrušit import").click());
    await expect(result).resolves.toBeNull();
  });

  it("treats the native Escape cancel event as cancellation", async () => {
    const { result } = await ask();
    const event = new Event("cancel", { cancelable: true });
    await act(async () => { container.querySelector("dialog")!.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await expect(result).resolves.toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("closes pending confirmation when its import is aborted", async () => {
    const { result, controller } = await ask();
    await act(async () => controller.abort());
    await expect(result).resolves.toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("does not open for an already aborted import", async () => {
    const controller = new AbortController();
    controller.abort();
    const { result } = await ask(controller);
    await expect(result).resolves.toBeNull();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it("supersedes an older request and ignores its later abort", async () => {
    const first = await ask();
    const second = await ask();
    const settled = vi.fn();
    void second.result.then(settled);
    await expect(first.result).resolves.toBeNull();
    await act(async () => first.controller.abort());
    expect(settled).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")?.open).toBe(true);
    await act(async () => button("NE").click());
    await expect(second.result).resolves.toBe(false);
  });

  it("settles on unmount, removes abort listeners and ignores later requests", async () => {
    const { result, controller } = await ask();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const confirmAfterUnmount = confirmation.confirmDomexNeuron;
    await act(async () => root.unmount());
    mounted = false;
    await expect(result).resolves.toBeNull();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    await expect(confirmAfterUnmount(new AbortController().signal)).resolves.toBeNull();
    expect(container.childNodes.length).toBe(0);
  });

  it("restores focus and document scrolling after an answer", async () => {
    const previous = document.createElement("button");
    document.body.append(previous);
    previous.focus();
    const { result } = await ask();
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => button("ANO").click());
    await expect(result).resolves.toBe(true);
    expect(document.activeElement).toBe(previous);
    expect(document.body.style.overflow).toBe("");
    previous.remove();
  });
});
