import { describe, expect, it } from "vitest";
import { propertyMetrics, propertyNumber, propertyText } from "./cuzkResultData";

describe("property result measurements", () => {
  it("uses the independent recorded measurements and their correct units", () => {
    const metrics = propertyMetrics({ zastavenaplocha: 166, podlahovaplocha: 240, obestavenyprostor: 890, pocetpodlazi: 2, pocetbytu: 3 }, [{ parcela: "127/1", vymeraM2: 580 }]);
    expect(metrics.map(({ value, unit }) => [value, unit])).toEqual([[166, "m²"], [580, "m²"], [2, ""], [3, ""]]);
  });
  it("does not infer missing apartment count from other measurements", () => {
    const metrics = propertyMetrics({ zastavenaplocha: 166, pocetpodlazi: 2, pocetbytu: null }, []);
    expect(metrics.find(metric => metric.kind === "apartments")?.value).toBeUndefined();
  });
  it("keeps absent data separate from recorded zero", () => {
    expect(propertyMetrics(null, []).every(metric => metric.value === undefined)).toBe(true);
    const metrics = propertyMetrics({ zastavenaplocha: 0, pocetbytu: 0 }, [{ vymeraM2: 0 }]);
    expect(metrics.find(metric => metric.kind === "footprint")?.value).toBe(0);
    expect(metrics.find(metric => metric.kind === "land")?.value).toBe(0);
    expect(metrics.find(metric => metric.kind === "apartments")?.value).toBe(0);
  });
  it("sums all available parcel areas", () => {
    expect(propertyMetrics(null, [{ vymeraM2: 166 }, { vymeraM2: 414.5 }]).find(metric => metric.kind === "land")?.value).toBe(580.5);
  });
  it("does not present a partial parcel sum as the total", () => {
    const metrics = propertyMetrics(null, [{ vymeraM2: 166 }, { parcela: "127/2" }]);
    expect(metrics.find(metric => metric.kind === "land")?.value).toBeUndefined();
  });
  it("accepts numeric values without turning blanks or booleans into zero", () => {
    expect(propertyNumber("166.5")).toBe(166.5);
    for (const value of [null, undefined, "", "  ", true, false, {}, Infinity, -1, "bad"]) expect(propertyNumber(value)).toBeUndefined();
  });
  it("does not display fractional floor or apartment counts", () => {
    const metrics = propertyMetrics({ pocetpodlazi: 2.5, pocetbytu: 1.4 }, []);
    expect(metrics.find(metric => metric.kind === "floors")?.value).toBeUndefined();
    expect(metrics.find(metric => metric.kind === "apartments")?.value).toBeUndefined();
  });
  it("renders registry labels and missing data without object placeholders", () => {
    expect(propertyText({ nazev: "Rodinný dům" })).toBe("Rodinný dům");
    expect(propertyText(0)).toBe("0");
    for (const value of [null, undefined, " ", {}, { kod: 12 }]) expect(propertyText(value)).toBe("Neuvedeno");
  });
});
