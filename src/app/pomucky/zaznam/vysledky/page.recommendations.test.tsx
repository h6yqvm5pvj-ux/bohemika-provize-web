// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingRecordContext, readMeetingRecord, setMeetingRecordIdentity, writeMeetingRecord } from "@/app/lib/meetingRecordPrivacy";
import type { DailyProgress, DailyStart } from "../productCapabilities";

const mocks = vi.hoisted(() => ({ router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/lib/secureDocuments", () => ({ useSecureDocumentBlob: vi.fn() }));
import RecordResultsPage from "./page";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear(); setMeetingRecordIdentity(null); setMeetingRecordIdentity("synthetic-advisor");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); setMeetingRecordIdentity(null);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

async function showRecommendation(from: DailyStart, progress: DailyProgress) {
  const selectedBenefits = [{ key: "dailyAllowance", from, progress, amount: 500 }];
  return showBenefits(selectedBenefits);
}
async function showBenefits(selectedBenefits: object[]) {
  writeMeetingRecord("lifeResults", { hasInvalidity: false, totalInvalidity: 0, selectedBenefits }, getMeetingRecordContext()!);
  await act(async () => root.render(<RecordResultsPage />));
  return selectedBenefits;
}
function productCard(name: string) {
  const heading = [...container.querySelectorAll("h3")].find(node => node.textContent?.startsWith(name));
  expect(heading).toBeTruthy();
  return heading!.closest("section")!;
}

describe("daily allowance recommendations", () => {
  it.each([
    { from: "from1", progress: "with", cpp: "od 1. dne, s progresí", koop: "od 1. dne, bez progrese" },
    { from: "from1", progress: "none", cpp: "od 1. dne, bez progrese", koop: "od 1. dne, bez progrese" },
    { from: "from22", progress: "with", cpp: "od 22. dne, s progresí", koop: null },
    { from: "from22", progress: "none", cpp: "od 22. dne, bez progrese", koop: null },
    { from: "from29", progress: "with", cpp: null, koop: "od 29. dne, bez progrese" },
    { from: "from29", progress: "none", cpp: null, koop: "od 29. dne, bez progrese" },
  ] as const)("shows available coverage for $from / $progress without changing its start day", async ({ from, progress, cpp, koop }) => {
    await showRecommendation(from, progress);
    for (const [name, expected] of [["ČPP", cpp], ["Kooperativa", koop]] as const) {
      const card = productCard(name);
      if (expected) {
        expect(card.querySelector("p")?.textContent).toContain(`Denní odškodné po úrazu ${expected}`);
        expect(card.querySelector("button")?.textContent).toBe("Kopírovat");
      } else {
        expect(card.textContent).not.toContain("Denní odškodné po úrazu");
        expect(card.querySelector("button")).toBeNull();
      }
    }
  });

  it("copies the actual nonprogressive alternative and preserves the client's original request", async () => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const original = await showRecommendation("from1", "with");
    const card = productCard("Kooperativa");
    const expected = "Pojišťovna umožňuje pojistit rizika: Denní odškodné po úrazu od 1. dne, bez progrese.";
    expect(card.querySelector("p")?.textContent).toBe(expected);
    await act(async () => card.querySelector("button")!.click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(expected);
    expect(readMeetingRecord("lifeResults", getMeetingRecordContext()!)).toMatchObject({ selectedBenefits: original });
  });
});

const cppProgressionNote = "Progrese trvalých následků začíná nad 10 % rozsahu poškození.";
describe.each([
  { progress: "none", cpp: "bez progrese", koop: "4× progrese" },
  { progress: "x4", cpp: "5× progrese", koop: "4× progrese" },
  { progress: "x5", cpp: "5× progrese", koop: "4× progrese" },
  { progress: "x10", cpp: "10× progrese", koop: "10× progrese" },
] as const)("permanent injury comparison for $progress", ({ progress, cpp, koop }) => {
  it.each([
    { from: "from0", cppStart: "0,001", koopStart: "0" },
    { from: "from0001", cppStart: "0,001", koopStart: "0" },
    { from: "from05", cppStart: "0,001", koopStart: "0" },
    { from: "from10", cppStart: "10", koopStart: "10" },
  ] as const)("shows each insurer's actual closest variant for $from", async ({ from, cppStart, koopStart }) => {
    const original = await showBenefits([{ key: "permanentInjury", from, progress, amount: 500_000 }]);
    const cppText = productCard("ČPP").querySelector("p")?.textContent;
    const koopText = productCard("Kooperativa").querySelector("p")?.textContent;
    expect(cppText).toContain(`Trvalé následky úrazu ${cpp}, plnění od ${cppStart} %`);
    expect(koopText).toBe(`Pojišťovna umožňuje pojistit rizika: Trvalé následky úrazu ${koop}, plnění od ${koopStart} %.`);
    if (progress === "x10") expect(cppText).toContain(cppProgressionNote);
    else expect(cppText).not.toContain(cppProgressionNote);
    expect(readMeetingRecord("lifeResults", getMeetingRecordContext()!)).toMatchObject({ selectedBenefits: original });
  });
});

describe("permanent injury recommendation details", () => {
  it("copies the 10x explanation once even for two selected permanent-injury benefits", async () => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await showBenefits([
      { key: "permanentInjury", from: "from0", progress: "x10", amount: 500_000 },
      { key: "permanentInjury", from: "from10", progress: "x10", amount: 1_000_000 },
      { key: "dailyAllowance", from: "from1", progress: "with", amount: 500 },
    ]);
    const card = productCard("ČPP"), text = card.querySelector("p")!.textContent!;
    expect(text).toContain("10× progrese, plnění od 0,001 %");
    expect(text).toContain("10× progrese, plnění od 10 %");
    expect(text).toContain("Denní odškodné po úrazu od 1. dne, s progresí");
    expect(text.split(cppProgressionNote)).toHaveLength(2);
    await act(async () => card.querySelector("button")!.click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(text);
    expect(productCard("Kooperativa").textContent).not.toContain(cppProgressionNote);
  });

  it("does not add permanent injury coverage or its explanation without a request", async () => {
    await showBenefits([{ key: "death", amount: 500_000 }]);
    for (const name of ["ČPP", "Kooperativa"]) {
      expect(productCard(name).querySelector("p")?.textContent).toBe("Pojišťovna umožňuje pojistit rizika: Smrt.");
    }
  });
});
