import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vehicleBrandLogo } from "./vehicleBrandAssets";

describe("vehicle brand logos", () => {
  it.each([["ŠKODA", "skoda"], ["Škoda Auto a.s.", "skoda"], [" VW ", "volkswagen"], ["MERCEDES-BENZ", "mercedes"], ["Citroën", "citroen"], ["Land Rover", "landrover"], ["AUDI", "audi"]])("recognizes registry spelling %s", (brand, file) => {
    const src = vehicleBrandLogo(brand);
    expect(src).toBe(`/vehicle-brands/${file}.svg`);
    expect(existsSync(join(process.cwd(), "public", src!))).toBe(true);
  });
  it.each(["", "—", "Unknown maker", "not-a-skoda", "../audi.svg"])("uses the generic vehicle icon for %s", brand => {
    expect(vehicleBrandLogo(brand)).toBeNull();
  });
});
