// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractFinancialOverview } from "./ContractFinancialOverviewSection";
import type { ContractFinancialOverviewModel } from "./contractFinancialOverviewModel";

const model: ContractFinancialOverviewModel = {
  recipient: "own", paidAmount: 1250, payoutCount: 2, expectedAmount: 750,
  nextPayout: { date: new Date("2026-11-24T23:00:00Z"), amount: 250, count: 2 },
  periodFrom: "2026-10-31", periodUntil: "2027-10-31", entriesCount: 3,
};

function render(overview = model) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ContractFinancialOverview overview={overview} />);
  return container;
}

afterEach(() => vi.unstubAllGlobals());

describe("whole-contract financial overview", () => {
  it("separates recorded receipts from expected money and shows the precise forecast period", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const container = render();
    expect(container.querySelector("h2")?.textContent).toBe("Moje provize za celou smlouvu");
    expect(container.textContent).toContain("Smlouva + 2 dodatky");
    const paid = container.querySelector('[data-overview-metric="recorded"]');
    expect(paid?.textContent).toContain("1.250,00 Kč");
    expect(paid?.textContent).toContain("2 záznamy z výpisů");
    expect(paid?.textContent).toContain("oprav a storen");
    const expected = container.querySelector('[data-overview-metric="expected"]');
    expect(expected?.textContent).toContain("750,00 Kč");
    expect(expected?.textContent).toContain("31. 10. 2026 – 30. 10. 2027");
    expect(expected?.textContent).toContain("Odhad nevyplacených provizí");
    expect(container.textContent).toContain("Částky před odpočtem stornofondu.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the Czech insured calendar for the nearest payday and groups the day's commissions", () => {
    const next = render().querySelector('[data-overview-metric="next"]');
    expect(next?.textContent).toContain("250,00 Kč");
    expect(next?.textContent).toContain("25. 11. 2026");
    expect(next?.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-25");
    expect(next?.textContent).toContain("2 položky plánu");
  });

  it("distinguishes a known empty forecast from unavailable calculation", () => {
    const known = render({ ...model, paidAmount: 0, payoutCount: 0, expectedAmount: 0, nextPayout: null, entriesCount: 1 });
    expect(known.textContent).toContain("Původní smlouva");
    expect(known.textContent).toContain("Zatím bez zapsaných výplat.");
    expect(known.querySelector('[data-overview-metric="expected"]')?.textContent).toContain("0,00 Kč");
    expect(known.querySelector('[data-overview-metric="next"]')?.textContent).toContain("V příštích 10 letech nejsou v plánu další výplaty.");
    const unknown = render({ ...model, expectedAmount: null, nextPayout: null });
    expect(unknown.querySelector('[data-overview-metric="recorded"]')?.textContent).toContain("1.250,00 Kč");
    expect(unknown.querySelector('[data-overview-metric="expected"]')?.textContent).toContain("Plán není k dispozici.");
    expect(unknown.querySelector('[data-overview-metric="next"]')?.textContent).toContain("Plán není k dispozici.");
  });

  it("identifies manager income and never presents unavailable recipient data as the user's own amounts", () => {
    expect(render({ ...model, recipient: "manager" }).textContent).toContain("Tvoje meziprovize z týmové smlouvy");
    const unavailable = render({ ...model, recipient: "unavailable", paidAmount: 99999, expectedAmount: 88888 });
    expect(unavailable.textContent).toContain("Pro přihlášeného uživatele není dostupný provizní přehled.");
    expect(unavailable.textContent).not.toContain("99.999");
    expect(unavailable.textContent).not.toContain("88.888");
    expect(unavailable.querySelector('[data-overview-metric="next"] time')).toBeNull();
  });

  it("keeps actual corrections negative and labels an expected deduction explicitly", () => {
    const container = render({ ...model, paidAmount: -100, expectedAmount: -50,
      nextPayout: { ...model.nextPayout!, amount: -50, count: 1 } });
    expect(container.querySelector('[data-overview-metric="recorded"]')?.textContent).toContain("-100,00 Kč");
    const next = container.querySelector('[data-overview-metric="next"]');
    expect(next?.textContent).toContain("Nejbližší očekávaná srážka");
    expect(next?.textContent).toContain("-50,00 Kč");
    expect(next?.textContent).not.toContain("položek plánu");
  });
});
