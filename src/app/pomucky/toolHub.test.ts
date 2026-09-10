import { describe, expect, it } from "vitest";

import { TOOL_CATALOG } from "./toolCatalog";
import {
  compareToolHubTools,
  isToolHubToolKey,
  normalizeToolHubUsageMetric,
  type ToolHubToolKey,
  type ToolHubUsageMetric,
} from "./toolHub";

const sortedToolKeys = (
  keys: ToolHubToolKey[],
  usage: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>> = {}
) => TOOL_CATALOG
  .filter((tool) => keys.includes(tool.key))
  .sort((a, b) => compareToolHubTools(a, b, usage))
  .map((tool) => tool.key);

describe("tool hub usage helpers", () => {
  it("accepts only catalogued tool keys", () => {
    expect(isToolHubToolKey("radar-vyroci")).toBe(true);
    expect(isToolHubToolKey("nahrada-smlouvy")).toBe(true);
    expect(isToolHubToolKey("kontakty")).toBe(true);
    expect(isToolHubToolKey("../admin")).toBe(false);
    expect(isToolHubToolKey(123)).toBe(false);
  });

  it("normalizes invalid counters and timestamps", () => {
    expect(
      normalizeToolHubUsageMetric({
        personalOpens: -5,
        globalOpens: Number.NaN,
        lastOpenedAtMs: -1,
        favorite: true,
      })
    ).toEqual({
      personalOpens: 0,
      globalOpens: 0,
      lastOpenedAtMs: null,
      favorite: true,
    });
  });

  it("pins favorites above every category", () => {
    expect(
      sortedToolKeys(
        ["argumenty", "zlato", "srovnavac-trvalych-nasledku", "proklepka-vozidla"],
        {
          argumenty: normalizeToolHubUsageMetric({ favorite: true }),
          zlato: normalizeToolHubUsageMetric({ favorite: true }),
        }
      )
    ).toEqual(["zlato", "argumenty", "srovnavac-trvalych-nasledku", "proklepka-vozidla"]);
  });

  it("orders categories consistently without favorites", () => {
    expect(
      sortedToolKeys([
        "argumenty", "zlato", "statistika", "cestovni-pojisteni-cpp-vs-kooperativa",
        "proklepka-vozidla", "katastr", "srovnavac-trvalych-nasledku",
      ])
    ).toEqual([
      "srovnavac-trvalych-nasledku", "katastr", "proklepka-vozidla",
      "cestovni-pojisteni-cpp-vs-kooperativa", "statistika", "zlato", "argumenty",
    ]);
  });

  it("keeps favorites first inside a selected category and restores name order when unstarred", () => {
    const keys: ToolHubToolKey[] = ["argumenty", "dokumenty", "zaznam"];
    expect(
      sortedToolKeys(keys, {
        zaznam: normalizeToolHubUsageMetric({ favorite: true }),
      })
    ).toEqual(["zaznam", "argumenty", "dokumenty"]);
    expect(
      sortedToolKeys(keys, {
        zaznam: normalizeToolHubUsageMetric({ favorite: false }),
      })
    ).toEqual(["argumenty", "dokumenty", "zaznam"]);
  });

  it("ignores popularity and recency when ordering tools", () => {
    expect(
      sortedToolKeys(
        ["argumenty", "dokumenty", "srovnavac-trvalych-nasledku"],
        {
          dokumenty: normalizeToolHubUsageMetric({
            personalOpens: 100,
            globalOpens: 1000,
            lastOpenedAtMs: 1_000_000,
          }),
        }
      )
    ).toEqual(["srovnavac-trvalych-nasledku", "argumenty", "dokumenty"]);
  });
});
