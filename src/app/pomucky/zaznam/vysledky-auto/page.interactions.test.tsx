// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingRecordContext, setMeetingRecordIdentity, writeMeetingRecord } from "@/app/lib/meetingRecordPrivacy";

vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
import CarResultsPage from "./page";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setMeetingRecordIdentity(null);
  setMeetingRecordIdentity("synthetic-advisor");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMeetingRecordIdentity(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function showResults() {
  writeMeetingRecord("carResults", {
    hasLiability: true, liabilityLimit: "50 / 50 mil. Kč", assistance: true,
    assistanceLevel: "Základní", annualMileage: "10 000 km", glass: true,
    collisionAnimal: true, naturalHazard: false, vandalism: false,
    animalDamage: false, theft: false, discountCppProfi: false,
    discountUniqaNonOemGlass: false,
  }, getMeetingRecordContext()!);
  await act(async () => root.render(<CarResultsPage />));
}

async function choose(group: string, label: string) {
  const picker = container.querySelector(`[role="group"][aria-label="${group}"]`)!;
  const button = [...picker.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => button.click());
}

describe("car meeting record result interactions", () => {
  it("copies all current impact texts without including the explanatory reasons", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await showResults();
    await choose("Sjednávaná pojišťovna", "Allianz");
    const section = container.querySelector("#dopady")!;
    const expected = [...section.querySelectorAll("article p")].map((item) => item.textContent).join("\n");
    expect(expected).toContain("Klient si zvolil roční nájezd 10 000 km");
    expect(expected).toContain("u produktu Allianz");
    const copyAll = [...section.querySelectorAll("button")].find((button) => button.textContent === "Kopírovat vše")!;
    await act(async () => copyAll.click());
    expect(write).toHaveBeenLastCalledWith(expected);
    expect(write.mock.calls.at(-1)![0]).not.toContain("Chybí krytí:");
    await choose("Sjednávaná pojišťovna", "UNIQA");
    expect(section.textContent).not.toContain("Klient si zvolil roční nájezd");
    expect(section.textContent).not.toContain("u produktu Allianz");
  });

  it("keeps the recommended insurer separate and makes its product notes copyable", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await showResults();
    await choose("Sjednávaná pojišťovna", "UNIQA");
    await choose("Doporučovaná pojišťovna", "Allianz");
    const products = container.querySelector("#produkty")!;
    const expected = [...products.querySelectorAll("article p")].map((item) => item.textContent).join("\n");
    expect(expected).toContain("Málo jezdím, málo platím.");
    const copyAll = [...products.querySelectorAll("button")].find((button) => button.textContent === "Kopírovat vše")!;
    await act(async () => copyAll.click());
    expect(write).toHaveBeenLastCalledWith(expected);
    expect(container.querySelector('#pojistovna button[aria-pressed="true"]')?.textContent).toBe("UNIQA");
    expect(container.querySelector("#dopady")?.textContent).not.toContain("u produktu Allianz");
  });

  it("provides a return path and no copy actions when no input is available", async () => {
    await act(async () => root.render(<CarResultsPage />));
    expect(container.textContent).toContain("Nejprve vyplň pojištění vozidla");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('a[href="/pomucky/zaznam"]')).toBeTruthy();
  });
});
