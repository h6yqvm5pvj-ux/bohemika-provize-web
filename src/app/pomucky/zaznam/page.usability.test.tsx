// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingRecordContext, readMeetingRecord, setMeetingRecordIdentity } from "@/app/lib/meetingRecordPrivacy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/lib/secureDocuments", () => ({ SECURE_DOCUMENT_FILE_NAMES: {}, useSecureDocumentBlob: () => ({ blob: null, url: null, loading: false, error: null }) }));
import RecordPage from "./page";

let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setMeetingRecordIdentity(null);
  setMeetingRecordIdentity("synthetic-advisor");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RecordPage />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMeetingRecordIdentity(null);
  vi.unstubAllGlobals();
});

const visibleCards = () => [...container.querySelectorAll<HTMLElement>("[data-benefit-card]")].filter(card => !card.hidden);
const input = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
async function enter(label: string, value: string) {
  await act(async () => {
    const field = input(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(selector: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
}

describe("meeting record benefit navigation", () => {
  it("finds coverages without accents, clears search and handles no matches", async () => {
    expect(visibleCards()).toHaveLength(28);
    await enter("Hledat krytí", "zAVazn");
    expect(visibleCards()).toHaveLength(3);
    expect(visibleCards().every(card => card.textContent?.startsWith("Závažn"))).toBe(true);
    await enter("Hledat krytí", "neexistující krytí");
    expect(visibleCards()).toHaveLength(0);
    await click('button[aria-label="Vymazat hledání"]');
    expect(visibleCards()).toHaveLength(28);
  });

  it("preserves selected amounts while filtering and includes hidden coverages in the result", async () => {
    await click('button[aria-label="Smrt nebo dožití"]');
    await enter("Pojistná částka při smrti / dožití (Kč)", "700000");
    await enter("Hledat krytí", "cukrovka");
    expect(visibleCards()).toHaveLength(1);
    expect(input("Pojistná částka při smrti / dožití (Kč)").value).toBe("700000");
    const results = [...container.querySelectorAll("button")].find(button => button.textContent === "Výsledky")!;
    await act(async () => results.click());
    expect(readMeetingRecord("lifeResults", getMeetingRecordContext()!)).toMatchObject({ selectedBenefits: [{ key: "death", amount: 700000 }] });
    await click('button[aria-label="Vymazat hledání"]');
    expect(input("Pojistná částka při smrti / dožití (Kč)").value).toBe("700000");
  });

  it("filters selected coverages, updates counts and offers a way back from an empty selection", async () => {
    const filter = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Jen vybraná"))!;
    await act(async () => filter.click());
    expect(filter.getAttribute("aria-pressed")).toBe("true");
    expect(visibleCards()).toHaveLength(0);
    const reset = [...container.querySelectorAll("button")].find(button => button.textContent === "Zobrazit všechna krytí")!;
    await act(async () => reset.click());
    await click('button[aria-label="Smrt nebo dožití"]');
    await act(async () => filter.click());
    expect(visibleCards()).toHaveLength(1);
    expect(filter.querySelector("b")?.textContent).toBe("1");
    await click('button[aria-label="Smrt nebo dožití"]');
    expect(visibleCards()).toHaveLength(0);
    expect(filter.querySelector("b")?.textContent).toBe("0");
  });

  it("clears entered amounts and filter state when the signed-in account changes", async () => {
    await click('button[aria-label="Smrt nebo dožití"]');
    await enter("Pojistná částka při smrti / dožití (Kč)", "700000");
    await enter("Hledat krytí", "invalidita");
    await act(async () => setMeetingRecordIdentity("another-synthetic-advisor"));
    expect(input("Hledat krytí").value).toBe("");
    expect(input("Pojistná částka při smrti / dožití (Kč)")).toBeNull();
    expect(visibleCards()).toHaveLength(28);
  });
});
