// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./AnimatedNumbers", () => ({
  AnimatedMoney: ({ value }: { value: number }) => <span data-money={value}>{value}</span>,
  AnimatedNumber: ({ value }: { value: number }) => <span data-count={value}>{value}</span>,
}));
vi.mock("./ProductionIllustration", () => ({ ProductionIllustration: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
import { ProductionSummarySection } from "./ProductionSummarySection";
import { MonthlyGoalSection } from "./MonthlyGoalSection";

const production = {
  language: "cs" as const, loading: false, showTeamBox: true,
  myPremiums: { lifeMonthly: 10, otherAnnual: 20 }, teamPremiums: { lifeMonthly: 30, otherAnnual: 40 },
  myContractsCount: 1, myImmediateSum: 111, myImmediatePrevSum: 100,
  myTipContractsCount: 2, myTipImmediateSum: 333, myTipImmediatePrevSum: 300,
  teamContractsCount: 3, teamImmediateSum: 222, teamImmediatePrevSum: 200,
  totalContractsCount: 4, totalWithTeam: 666, totalPrevWithTeam: 600, isLiteUI: true,
};
const goal = { language: "cs" as const, monthlyGoal: 1000, progress: 66.6, progressTone: "", loading: false, isLiteUI: true, onSaveGoal: async () => {} };

describe("production UI with an unfinished TIP summary", () => {
  let root: Root;
  let container: HTMLDivElement;
  const cards = (tone: string) => Array.from(container.querySelectorAll(`article[data-tone="${tone}"]`));
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("shows finished own/team amounts while hiding pending TIP/combined amounts and trends", async () => {
    await act(async () => root.render(<ProductionSummarySection {...production} tipSummaryLoading />));
    expect(cards("own").every(card => card.querySelector('[data-money="111"]'))).toBe(true);
    expect(cards("team").every(card => card.querySelector('[data-money="222"]'))).toBe(true);
    for (const tone of ["tip", "total"]) {
      expect(cards(tone).length).toBeGreaterThan(0);
      expect(cards(tone).every(card => card.textContent?.includes("Načítám TIP produkci"))).toBe(true);
      expect(cards(tone).every(card => !card.querySelector('[data-money="333"], [data-money="666"]'))).toBe(true);
      expect(cards(tone).every(card => !card.textContent?.includes("vs. min. měsíc"))).toBe(true);
    }
    expect(cards("tip").every(card => !card.querySelector("[data-count]"))).toBe(true);
    expect(cards("total").every(card => card.querySelector('[data-count="4"]'))).toBe(true);
  });

  it("shows an unavailable TIP/combined result without hiding completed regular production", async () => {
    await act(async () => root.render(<ProductionSummarySection {...production} tipSummaryError="TIP není dostupný. Obnovte stránku." />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("TIP není dostupný");
    expect(cards("own")[0].querySelector('[data-money="111"]')).not.toBeNull();
    expect(cards("team")[0].querySelector('[data-money="222"]')).not.toBeNull();
    expect(cards("tip")[0].querySelector('[data-money="333"]')).toBeNull();
    expect(cards("total")[0].querySelector('[data-money="666"]')).toBeNull();
    expect(cards("total")[0].textContent).toContain("TIP produkce není k dispozici");
  });

  it("returns the exact final amounts and trends when TIP completes", async () => {
    await act(async () => root.render(<ProductionSummarySection {...production} />));
    expect(cards("tip")[0].querySelector('[data-money="333"]')).not.toBeNull();
    expect(cards("total")[0].querySelector('[data-money="666"]')).not.toBeNull();
    expect(cards("total")[0].textContent).toContain("vs. min. měsíc");
  });

  it("shows pending TIP existence for a solo advisor, then removes the card after a confirmed empty result", async () => {
    await act(async () => root.render(<ProductionSummarySection {...production} showTeamBox={false} myTipContractsCount={0} tipSummaryLoading />));
    expect(cards("tip").length).toBeGreaterThan(0);
    expect(cards("own")[0].querySelector('[data-money="111"]')).not.toBeNull();
    await act(async () => root.render(<ProductionSummarySection {...production} showTeamBox={false} myTipContractsCount={0} />));
    expect(cards("tip")).toHaveLength(0);
    expect(cards("total")).toHaveLength(0);
  });

  it("leaves a team-only card fully usable while TIP is pending", async () => {
    await act(async () => root.render(<ProductionSummarySection {...production} showOnlyTeamProduction tipSummaryLoading />));
    expect(cards("team")[0].querySelector('[data-money="222"]')).not.toBeNull();
    expect(cards("tip")).toHaveLength(0);
    expect(cards("total")).toHaveLength(0);
    expect(container.textContent).not.toContain("Načítám TIP");
  });

  it.each(["pending", "unavailable"])("does not expose a final percentage or progress value while %s", async state => {
    await act(async () => root.render(<MonthlyGoalSection {...goal} loading={state === "pending"} unavailable={state === "unavailable"} />));
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("data-complete")).toBe("false");
    expect(container.textContent).not.toContain("66,6 %");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => root.render(<MonthlyGoalSection {...goal} />));
    expect(bar.getAttribute("aria-valuenow")).toBe("66.6");
    expect(container.textContent).toContain("66,6 %");
  });
});
