// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WallFeedFilters } from "./WallPersonalControls";
import type { WallView } from "./wallPersonal";

const onViewChange = vi.fn();
const onSearchChange = vi.fn();
let container: HTMLDivElement;
let root: Root;

function Filters({ initialSearch = "" }: { initialSearch?: string }) {
  const [view, setView] = useState<WallView>("all");
  const [search, setSearch] = useState(initialSearch);
  return <WallFeedFilters view={view} search={search} sectionLabel="v sekci Auto"
    onViewChange={next => { onViewChange(next); setView(next); }}
    onSearchChange={next => { onSearchChange(next); setSearch(next); }} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("intranet feed filter interactions", () => {
  it("changes the view independently while retaining the current search", async () => {
    await act(async () => root.render(<Filters initialSearch="synthetic query" />));
    const options = container.querySelector('[aria-label="Zobrazení příspěvků"]')!;
    const button = [...options.querySelectorAll<HTMLButtonElement>("button")]
      .find(element => element.textContent?.trim() === "Nepřečtené")!;
    await act(async () => button.click());
    expect(onViewChange).toHaveBeenCalledExactlyOnceWith("unread");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(options.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("synthetic query");
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("forwards typed text to its controlling parent without changing the selected view", async () => {
    await act(async () => root.render(<Filters />));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "synthetic author");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith("synthetic author");
    expect(input.value).toBe("synthetic author");
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("clears the controlled search and restores focus to the search field", async () => {
    await act(async () => root.render(<Filters initialSearch="synthetic query" />));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Vymazat hledání"]')!;
    clear.focus();
    await act(async () => clear.click());
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith("");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('button[aria-label="Vymazat hledání"]')).toBeNull();
    expect(onViewChange).not.toHaveBeenCalled();
  });
});
