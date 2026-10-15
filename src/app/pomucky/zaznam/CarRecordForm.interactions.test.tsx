// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingRecordContext, readMeetingRecord, setMeetingRecordIdentity } from "@/app/lib/meetingRecordPrivacy";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { CarRecordForm } from "./CarRecordForm";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  push.mockReset();
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
  vi.unstubAllGlobals();
});

function button(label: string) {
  const found = [...container.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function showForm() {
  await act(async () => root.render(<CarRecordForm owner={getMeetingRecordContext()!} />));
}

function field(label: string) {
  const found = [...container.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label);
  if (!found) throw new Error(`Missing field: ${label}`);
  return found.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
}

async function change(input: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = input.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event(input.tagName === "INPUT" ? "input" : "change", { bubbles: true }));
  });
}

async function results() {
  await click("Výsledky");
  expect(push).toHaveBeenLastCalledWith("/pomucky/zaznam/vysledky-auto");
  return readMeetingRecord<Record<string, unknown>>("carResults", getMeetingRecordContext()!)!;
}

describe("car meeting record form interactions", () => {
  it("maps each coverage to its own result flag and keeps the other coverages unselected", async () => {
    await showForm();
    const coverages = [
      ["Střet se zvěří", "collisionAnimal"], ["Poškození zvířetem", "animalDamage"],
      ["Živel", "naturalHazard"], ["Skla", "glass"], ["Odcizení", "theft"],
      ["Vandalismus", "vandalism"], ["Asistence", "assistance"],
      ["Poškození vlastního vozidla", "ownDamage"],
    ] as const;
    const noCoverages = Object.fromEntries(coverages.map(([, key]) => [key, false]));

    for (const [label, key] of coverages) {
      await click(label);
      expect(button(label).getAttribute("aria-pressed")).toBe("true");
      expect(await results()).toMatchObject({ ...noCoverages, [key]: true });
      await click(label);
      expect(button(label).getAttribute("aria-pressed")).toBe("false");
    }
    expect(await results()).toMatchObject(noCoverages);
    expect(container.textContent).toContain("Krytí: 0");
  });

  it("only toggles supplementary coverages and preserves the separate casco settings", async () => {
    await showForm();
    const coverages = ["Střet se zvěří", "Poškození zvířetem", "Živel", "Skla", "Odcizení", "Vandalismus", "Zavazadla", "Asistence", "Poškození vlastního vozidla", "Náhradní vozidlo"];
    const coverageSection = container.querySelector('section[aria-labelledby$="-covers-heading"]')!;
    for (const label of coverages) {
      await click(label);
      expect(button(label).getAttribute("aria-pressed")).toBe("true");
    }
    expect(container.textContent).toContain("Krytí: 10");
    expect(coverageSection.querySelectorAll("input,select,textarea")).toHaveLength(0);
    expect(coverageSection.querySelectorAll("button")).toHaveLength(10);
    await click("Sjednávám havarijní pojištění");
    await change(field("Pojistná částka (Kč)"), "350 000");
    await click("Bez DPH");
    await change(field("Spoluúčast"), "5 % min. 5 000 Kč");

    for (const label of [...coverages, "Sjednávám havarijní pojištění"]) {
      await click(label);
      await click(label);
      expect(button(label).getAttribute("aria-pressed")).toBe("true");
    }

    expect(coverageSection.querySelectorAll("input,select,textarea")).toHaveLength(0);
    expect(button("Bez DPH").getAttribute("aria-pressed")).toBe("true");
    expect(field("Pojistná částka (Kč)").value).toBe("350 000");
    expect(field("Spoluúčast").value).toBe("5 % min. 5 000 Kč");
    expect(await results()).toMatchObject({ assistance: true, assistanceLevel: null, hasCasco: true, cascoDeductible: "5 % min. 5 000 Kč" });
  });

  it("adds the selected client gender to the result contract, selects seven discounts, and omits removed discounts", async () => {
    await showForm();
    expect(container.textContent).not.toMatch(/Cross.?sell|Držitelem déle než rok|Držitel ZTP/i);
    const discounts = ["Extrabenefit Profi", "Mimořádné zvýhodnění – podpora prodeje", "Vozidlo provozováno jen v ČR", "BA score", "Akceptace elektronické komunikace", "Garážované vozidlo", "Sleva za neoriginální sklo"];
    for (const label of discounts) {
      await click(label);
      expect(button(label).getAttribute("aria-pressed")).toBe("true");
    }
    expect(container.textContent).toContain("Slevy: 7");
    await change(field("Limit plnění (zdraví / majetek)"), "250 / 250 mil. Kč");
    await change(field("Předpokládaný nájezd (km)"), "15 000");
    await click("Sjednávám povinné ručení");
    await click("Sjednávám povinné ručení");
    expect(field("Limit plnění (zdraví / majetek)").value).toBe("250 / 250 mil. Kč");
    expect(await results()).toEqual({
      clientGender: "male",
      hasLiability: true, liabilityLimit: "250 / 250 mil. Kč", hasCasco: false,
      cascoDeductible: null, assistance: false, assistanceLevel: null,
      annualMileage: "15 000", glass: false, collisionAnimal: false,
      naturalHazard: false, vandalism: false, animalDamage: false,
      theft: false, ownDamage: false, discountCppProfi: true, discountUniqaNonOemGlass: true,
    });
    await click("Extrabenefit Profi");
    await click("Sleva za neoriginální sklo");
    expect(await results()).toMatchObject({ discountCppProfi: false, discountUniqaNonOemGlass: false });
    expect(container.textContent).toContain("Slevy: 5");
  });
});
