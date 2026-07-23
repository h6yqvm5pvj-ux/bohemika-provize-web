import { describe, expect, it } from "vitest";

import {
  buildAutoAnniversaryRows,
  contractDetailHref,
  nextAutoAnniversary,
  type AutoAnniversaryEntry,
} from "./autoAnniversary";

const now = new Date("2026-07-23T00:00:00.000Z");

const entry = (
  overrides: Partial<AutoAnniversaryEntry> = {}
): AutoAnniversaryEntry => ({
  id: "contract-1",
  userEmail: "advisor@example.com",
  productKey: "cppAuto",
  clientName: "Jan Novak",
  contractNumber: "AUTO-1",
  status: "active",
  policyStartDate: "2025-08-01",
  ...overrides,
});

describe("auto anniversary rows", () => {
  it("builds a linkable row for active auto contracts inside the 60 day window", () => {
    const rows = buildAutoAnniversaryRows([entry()], now);

    expect(rows).toEqual([
      {
        id: "advisor@example.com___contract-1",
        href: contractDetailHref("advisor@example.com", "contract-1"),
        client: "Jan Novak",
        contractNumber: "AUTO-1",
        product: "cppAuto",
        daysToAnniversary: 9,
      },
    ]);
  });

  it("filters out storno and dožitá contracts", () => {
    const rows = buildAutoAnniversaryRows(
      [
        entry({ id: "active", status: "active" }),
        entry({ id: "storno", status: "storno" }),
        entry({ id: "dozita", status: "dožitá" }),
        entry({
          id: "ended",
          status: "active",
          policyEndDate: "2026-07-22",
        }),
      ],
      now
    );

    expect(rows.map((row) => row.id)).toEqual([
      "advisor@example.com___active",
    ]);
  });

  it("filters out non-auto contracts and anniversaries outside the window", () => {
    const rows = buildAutoAnniversaryRows(
      [
        entry({ id: "life", productKey: "neon" }),
        entry({ id: "late", policyStartDate: "2025-12-01" }),
      ],
      now
    );

    expect(rows).toEqual([]);
  });

  it("uses adviser email or fallback email when userEmail is missing", () => {
    expect(
      buildAutoAnniversaryRows(
        [
          entry({
            id: "with-adviser",
            userEmail: null,
            adviserEmail: "Owner@Example.com",
          }),
        ],
        now
      )[0]?.id
    ).toBe("owner@example.com___with-adviser");

    expect(
      buildAutoAnniversaryRows(
        [entry({ id: "fallback", userEmail: null, adviserEmail: null })],
        now,
        "Fallback@Example.com"
      )[0]?.id
    ).toBe("fallback@example.com___fallback");
  });

  it("calculates the next anniversary after the current date", () => {
    expect(
      nextAutoAnniversary(
        new Date("2025-07-01T00:00:00.000Z"),
        now
      ).toISOString()
    ).toBe("2027-07-01T00:00:00.000Z");
  });
});
