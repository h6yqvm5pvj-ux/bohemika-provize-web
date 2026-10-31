// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalculatorCoefficients } from "./useCalculatorCoefficients";

type Options = Parameters<typeof useCalculatorCoefficients>[0];
type Result = ReturnType<typeof useCalculatorCoefficients>;
const defaults: Options = {
  product: "cppAuto", position: "poradce1", documentPosition: "poradce1",
  mode: "standard", frequency: "monthly", contractSignedDate: "2026-04-01",
  neonCoefficientView: "current", maxCizinKomplexVariant: "exclusiveStandard",
};
const periods: Array<{ product: Options["product"]; flag: keyof Result; from: string; until: string }> = [
  { product: "neon", flag: "isNeonHistoricalBySignedDate", from: "2019-10-01", until: "2024-07-01" },
  { product: "cppAuto", flag: "isCppAutoHistoricalBySignedDate", from: "2018-01-01", until: "2026-04-01" },
  { product: "allianzAuto", flag: "isAllianzAutoHistoricalBySignedDate", from: "2019-08-01", until: "2026-04-01" },
  { product: "csobAuto", flag: "isCsobAutoHistoricalBySignedDate", from: "2024-05-01", until: "2026-04-01" },
  { product: "uniqaAuto", flag: "isUniqaAutoHistoricalBySignedDate", from: "2023-02-01", until: "2026-04-01" },
  { product: "uniqaAuto", flag: "isUniqaAutoEarlyHistoricalBySignedDate", from: "2023-02-01", until: "2024-05-01" },
  { product: "uniqaflotila", flag: "isUniqaFlotilaHistoricalBySignedDate", from: "2024-05-01", until: "2026-04-01" },
  { product: "pillowAuto", flag: "isPillowAutoHistoricalBySignedDate", from: "2023-10-01", until: "2026-04-01" },
  { product: "kooperativaAuto", flag: "isKooperativaAutoHistoricalBySignedDate", from: "2021-07-01", until: "2026-04-01" },
  { product: "maximaMaxEfekt", flag: "isMaxEfekt5BySignedDate", from: "2023-04-21", until: "2026-04-23" },
  { product: "domex", flag: "isDomexEarlyHistoricalBySignedDate", from: "2017-06-01", until: "2023-06-01" },
  { product: "domex", flag: "isDomexHistoricalBySignedDate", from: "2017-06-01", until: "2024-09-01" },
];
const previousDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

describe("calculator coefficient selection", () => {
  let root: Root;
  let container: HTMLDivElement;
  let result: Result;

  function Probe({ options }: { options: Options }) {
    const coefficients = useCalculatorCoefficients(options);
    useEffect(() => { result = coefficients; }, [coefficients]);
    return null;
  }
  const render = async (options: Partial<Options> = {}) => {
    await act(async () => root.render(<Probe options={{ ...defaults, ...options }} />));
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each(periods)("keeps both period boundaries for $flag and clears it on product change", async ({ product, flag, from, until }) => {
    for (const [date, expected] of [[previousDay(from), false], [from, true], [previousDay(until), true], [until, false]] as const) {
      await render({ product, contractSignedDate: date });
      expect(result[flag], `${product} on ${date}`).toBe(expected);
    }
    await render({ product: "flexi", contractSignedDate: from });
    expect(result[flag]).toBe(false);
  });

  it.each(["", "   ", "not-a-date", "2026-99-99"])("does not select a signed-date period for an invalid date: %s", async (contractSignedDate) => {
    await render({ product: "neon", contractSignedDate });
    expect(result.contractSignedDateForNeon).toBeNull();
    expect(result.isNeonHistoricalBySignedDate).toBe(false);
  });

  it("normalizes a padded date while keeping the user's modal view independent of it", async () => {
    await render({ contractSignedDate: " 2026-03-31 ", neonCoefficientView: "current" });
    expect(result.contractSignedDateForNeon).toBe("2026-03-31");
    expect(result.isCppAutoHistoricalBySignedDate).toBe(true);
    expect(result.isCppAutoHistoricalInCoefModal).toBe(false);
    await render({ contractSignedDate: "2026-04-01", neonCoefficientView: "historical" });
    expect(result.isCppAutoHistoricalBySignedDate).toBe(false);
    expect(result.isCppAutoHistoricalInCoefModal).toBe(true);
  });

  it.each([
    ["cppAuto", "/provize/cppauto.jpg", "/provize/cpphistorickeauto.jpg"],
    ["allianzAuto", "/provize/allianzauto.jpg", "/provize/AlliHistoricke.jpg"],
    ["csobAuto", "/provize/csobauto.jpg", "/provize/csobhistoricke.jpg"],
    ["uniqaAuto", "/provize/uniqaauto.jpg", "/provize/uniqahistoricke.jpg"],
    ["uniqaflotila", "/provize/uniqaflotila.jpg", "/provize/uniqaflotilahis.pdf"],
    ["pillowAuto", "/provize/pillowauto.jpg", "/provize/pillowhistoricke.jpg"],
    ["kooperativaAuto", "/provize/koopauto.jpg", "/provize/koophistoricke.jpg"],
    ["domex", "/provize/domex2024.pdf", "/provize/domex2023.pdf"],
    ["maximaMaxEfekt", "/provize/maxefekt7.pdf", "/provize/maxefekt5.pdf"],
  ] as const)("switches the terms document when the %s view changes", async (product, currentUrl, historicalUrl) => {
    await render({ product });
    expect(result.autoTermsPreviewUrl).toBe(currentUrl);
    expect(result.showAutoTermsPreview).toBe(true);
    await render({ product, neonCoefficientView: "historical" });
    expect(result.autoTermsPreviewUrl).toBe(historicalUrl);
    await render({ product, neonCoefficientView: "current" });
    expect(result.autoTermsPreviewUrl).toBe(currentUrl);
  });

  it("keeps all three UNIQA periods distinct when switching views", async () => {
    await render({ product: "uniqaAuto", neonCoefficientView: "olderHistorical" });
    expect(result.isUniqaAutoEarlyHistoricalInCoefModal).toBe(true);
    expect(result.isUniqaAutoHistoricalInCoefModal).toBe(true);
    expect(result.autoTermsPreviewUrl).toBe("/provize/BHMK-UNIQA-AUTO-230101-01_page-0001.jpg");
    expect(result.coefExplanation).toContain("od 1. výročí");
    const earlyCoefficients = result.coefList;
    await render({ product: "uniqaAuto", neonCoefficientView: "historical" });
    expect(result.isUniqaAutoEarlyHistoricalInCoefModal).toBe(false);
    expect(result.coefList).not.toEqual(earlyCoefficients);
    await render({ product: "uniqaAuto" });
    expect(result.isUniqaAutoHistoricalInCoefModal).toBe(false);
  });

  it("keeps the oldest DOMEX coefficients and changes the payout explanation for current terms", async () => {
    await render({ product: "domex", neonCoefficientView: "olderHistorical" });
    expect(result.autoTermsPreviewUrl).toBe("/provize/domexPLUS.pdf");
    expect(result.isDomexEarlyHistoricalInCoefModal).toBe(true);
    expect(result.coefList[0].value).toBe(0.16);
    expect(result.coefExplanation).toContain("maximálně 4 roky");
    await render({ product: "domex" });
    expect(result.coefList[0].value).toBe(0.1108);
    expect(result.isDomexEarlyHistoricalInCoefModal).toBe(false);
    expect(result.coefExplanation).toContain("po dobu aktivní smlouvy");
  });

  it("updates coefficients when the commission position changes", async () => {
    await render();
    expect(result.coefList.map(item => item.value)).toEqual([0.08, 0.08]);
    await render({ position: "manazer7" });
    expect(result.coefList.map(item => item.value)).toEqual([0.127, 0.127]);
  });

  it("updates both the FLEXI table and its explanation when accelerated mode is toggled", async () => {
    await render({ product: "flexi" });
    expect(result.coefList.some(item => item.label.includes("50%"))).toBe(false);
    expect(result.immediatePayoutInfo).not.toContain("50 %");
    await render({ product: "flexi", mode: "accelerated" });
    expect(result.coefList.some(item => item.label === "Provize 50% z B36")).toBe(true);
    expect(result.immediatePayoutInfo).toContain("50 %");
    await render({ product: "flexi" });
    expect(result.coefList.some(item => item.label.includes("50%"))).toBe(false);
  });

  it("updates the KOMPLEX variant and commission position together with the displayed explanation", async () => {
    await render({ product: "maxcizinkomplex" });
    expect(result.coefList[0].value).toBe(0.0693);
    expect(result.coefExplanation).toContain("EXCLUSIVE / STANDARD");
    await render({ product: "maxcizinkomplex", maxCizinKomplexVariant: "premium" });
    expect(result.coefList[0].value).toBe(0.0231);
    expect(result.coefExplanation).toContain("PREMIUM");
    await render({ product: "maxcizinkomplex", maxCizinKomplexVariant: "premium", position: "manazer7" });
    expect(result.coefList[0].value).toBe(0.056);
  });

  it.each([["monthly", "měsíční", "12"], ["quarterly", "čtvrtletní", "4"], ["semiannual", "pololetní", "2"], ["annual", "roční", "1"]] as const)(
    "uses the selected %s frequency in the explanation", async (frequency, label, count) => {
      await render({ product: "domex", frequency });
      expect(result.coefExplanation).toContain(`platba (${label})`);
      expect(result.coefExplanation).toContain(`počet plateb/rok (${count})`);
    }
  );

  it("switches protected NEON preview URLs by period and document role", async () => {
    await render({ product: "neon", documentPosition: "poradce3" });
    expect(result.neonTermsPreviewUrl).toBe("/api/documents/neon?type=pdf&period=2024");
    expect(result.neonPreviewImageUrl).toBe("/api/documents/neon?type=preview&period=2024&role=poradce");
    await render({ product: "neon", neonCoefficientView: "historical", documentPosition: "manazer7" });
    expect(result.neonTermsPreviewUrl).toBe("/api/documents/neon?type=pdf&period=2019");
    expect(result.neonPreviewImageUrl).toBe("/api/documents/neon?type=preview&period=2019&role=manazer");
    await render({ product: "flexi" });
    expect(result.showNeonTermsPreview).toBe(false);
    expect(result.neonTermsPreviewUrl).toBeNull();
    expect(result.neonPreviewImageUrl).toBeNull();
    expect(result.showAutoTermsPreview).toBe(false);
    expect(result.autoTermsPreviewUrl).toBeNull();
  });
});
