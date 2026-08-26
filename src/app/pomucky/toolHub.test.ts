import { describe, expect, it } from "vitest";

import {
  compareToolHubUsage,
  isToolHubToolKey,
  normalizeToolHubUsageMetric,
} from "./toolHub";

describe("tool hub usage helpers", () => {
  it("accepts only catalogued tool keys", () => {
    expect(isToolHubToolKey("radar-vyroci")).toBe(true);
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

  it("prioritizes favorites and recency for personal sorting", () => {
    expect(
      compareToolHubUsage(
        {
          personalOpens: 100,
          globalOpens: 100,
          lastOpenedAtMs: 100,
          favorite: false,
        },
        {
          personalOpens: 1,
          globalOpens: 1,
          lastOpenedAtMs: 1,
          favorite: true,
        },
        "personal"
      )
    ).toBeGreaterThan(0);
  });

  it("uses aggregate opens for popular sorting", () => {
    expect(
      compareToolHubUsage(
        {
          personalOpens: 50,
          globalOpens: 10,
          lastOpenedAtMs: 500,
          favorite: true,
        },
        {
          personalOpens: 1,
          globalOpens: 20,
          lastOpenedAtMs: 1,
          favorite: false,
        },
        "popular"
      )
    ).toBeGreaterThan(0);
  });
});
