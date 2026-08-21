import { describe, expect, it } from "vitest";

import { ownContractsLoadingPercent } from "./loadingProgress";

describe("cashflow loading progress", () => {
  it("tracks the actual ratio of loaded contracts", () => {
    expect(
      ownContractsLoadingPercent({ loaded: 100, total: 2_000, done: false })
    ).toBe(11);
    expect(
      ownContractsLoadingPercent({ loaded: 1_000, total: 2_000, done: false })
    ).toBe(42);
    expect(
      ownContractsLoadingPercent({ loaded: 2_000, total: 2_000, done: false })
    ).toBe(75);
  });

  it("reserves the final phases until all contract pages are loaded", () => {
    expect(
      ownContractsLoadingPercent({ loaded: 2_000, total: 2_000, done: true })
    ).toBe(76);
    expect(
      ownContractsLoadingPercent({ loaded: 10_000, total: null, done: false })
    ).toBeLessThanOrEqual(70);
  });
});
