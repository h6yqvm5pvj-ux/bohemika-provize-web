import { describe, expect, it } from "vitest";

import type { ContractDoc, ContractListFilters } from "./contractsApi.types";
import {
  buildContractListIndexedQueryClauses,
  contractClientSearchKeys,
  contractListIndexFieldsForContract,
  contractListProductCategoryForProduct,
  contractMatchesListFilters,
  contractMatchesListSearch,
  contractMatchesRefreshFilter,
  contractNumberSearchKeys,
  contractSearchIndexFieldsForContract,
  contractSearchLookupKeys,
  contractSortDate,
  hasContractListClientFilters,
  hasContractListFilters,
  isAnniversarySoonForList,
  normalizeContractNumberForSearch,
  normalizeSearchValue,
  parseContractListFilters,
  productMatchesListCategory,
  productMatchesListInstitution,
} from "./contractsApi.listFilters";

const emptyFilters = (): ContractListFilters =>
  parseContractListFilters(new URLSearchParams());

const contract = (overrides: Partial<ContractDoc> = {}): ContractDoc => ({
  id: "contract-1",
  clientName: "Žaneta Nováková",
  contractNumber: "AB 12/34",
  productKey: "neon",
  status: "active",
  paid: false,
  contractSignedDate: new Date("2026-01-10T00:00:00.000Z"),
  policyStartDate: new Date("2026-02-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-09T00:00:00.000Z"),
  ...overrides,
});

describe("contracts API list filters", () => {
  it("normalizes search text and contract numbers", () => {
    expect(normalizeSearchValue("  Žaneta  ")).toBe("zaneta");
    expect(normalizeContractNumberForSearch(" AB 12/34 ")).toBe("ab1234");
  });

  it("builds compact search keys for names and contract numbers", () => {
    const clientKeys = contractClientSearchKeys("Petr Žluťoučký");
    const numberKeys = contractNumberSearchKeys("AB 12/34");

    expect(clientKeys).toContain("petr z");
    expect(clientKeys).toContain("lut");
    expect(clientKeys).toContain("zlutoucky");
    expect(numberKeys).toContain("ab1234");
    expect(numberKeys).toContain("123");
    expect(contractSearchIndexFieldsForContract(contract())).toMatchObject({
      clientSearchKeys: expect.arrayContaining(["novak"]),
      contractNumberSearchKeys: expect.arrayContaining(["ab1234"]),
    });
  });

  it("only uses the search index for queries with at least two characters", () => {
    expect(contractSearchLookupKeys("x")).toBeNull();
    expect(contractSearchLookupKeys(" Novák ")).toEqual({
      client: "novak",
      contractNumber: null,
    });
    expect(contractSearchLookupKeys("AB 12/34")).toEqual({
      client: "ab 12/34",
      contractNumber: "ab1234",
    });
  });

  it("parses URL search params into bounded filters", () => {
    const filters = parseContractListFilters(
      new URLSearchParams({
        q: "x".repeat(140),
        mode: "anniversary",
        unpaidOnly: "true",
        refreshOnly: "1",
        activeOnly: "true",
        stornoOnly: "true",
        maturedOnly: "1",
        commissionAudit: "difference",
        commissionCode: "b36",
        categories: "life,unknown,auto",
        institutions: "cpp,unknown",
        signedFrom: "2026-01-01",
      })
    );

    expect(filters.query).toHaveLength(120);
    expect(filters.mode).toBe("anniversary");
    expect(filters.unpaidOnly).toBe(true);
    expect(filters.refreshOnly).toBe(true);
    expect(filters.activeOnly).toBe(true);
    expect(filters.stornoOnly).toBe(true);
    expect(filters.maturedOnly).toBe(true);
    expect(filters.commissionAuditMode).toBe("difference");
    expect(filters.commissionAuditCodeFilter).toBe("b36");
    expect([...filters.categories].sort()).toEqual(["auto", "life"]);
    expect([...filters.institutions]).toEqual(["cpp"]);
    expect(filters.signedFrom?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(hasContractListClientFilters(filters)).toBe(true);
    expect(hasContractListFilters(filters)).toBe(true);
  });

  it("distinguishes client-only filters from signed date filters", () => {
    const onlySigned = parseContractListFilters(
      new URLSearchParams({ signedFrom: "2026-01-01" })
    );

    expect(hasContractListClientFilters(emptyFilters())).toBe(false);
    expect(hasContractListFilters(emptyFilters())).toBe(false);
    expect(hasContractListClientFilters(onlySigned)).toBe(false);
    expect(hasContractListFilters(onlySigned)).toBe(true);
  });

  it("matches search by Czech client name and compact contract number", () => {
    const item = contract();

    expect(contractMatchesListSearch(item, "zaneta")).toBe(true);
    expect(contractMatchesListSearch(item, "AB1234")).toBe(true);
    expect(contractMatchesListSearch(item, "neexistuje")).toBe(false);
  });

  it("assigns zamex to the property and liability category used by list filters", () => {
    expect(productMatchesListCategory("domex", new Set(["property"]))).toBe(
      true
    );
    expect(productMatchesListCategory("koopodzam", new Set(["property"]))).toBe(
      true
    );
    expect(productMatchesListCategory("zamex", new Set(["property"]))).toBe(
      true
    );
    expect(productMatchesListCategory("kooppmop", new Set(["property"]))).toBe(
      false
    );
    expect(productMatchesListCategory("kooppmop", new Set(["business"]))).toBe(
      true
    );
    expect(
      productMatchesListCategory("cppsimplex", new Set(["property"]))
    ).toBe(false);
    expect(
      productMatchesListCategory("cppsimplex", new Set(["business"]))
    ).toBe(true);
    expect(
      productMatchesListCategory("maxcizinkomplex", new Set(["travel"]))
    ).toBe(false);
    expect(
      productMatchesListCategory("maxcizinkomplex", new Set(["foreigners"]))
    ).toBe(true);
  });

  it("derives stored index fields from the same category rules as list filters", () => {
    expect(contractListProductCategoryForProduct("cppsimplex")).toBe("business");
    expect(contractListProductCategoryForProduct("zamex")).toBe("property");
    expect(productMatchesListInstitution("neon", new Set(["cpp"]))).toBe(true);

    expect(
      contractListIndexFieldsForContract(
        contract({
          productKey: "cppsimplex",
          status: "active",
          policyEndDate: new Date("2026-07-31T00:00:00.000Z"),
        }),
        new Date("2026-08-03T00:00:00.000Z")
      )
    ).toEqual({
      productCategory: "business",
      institutionId: "cpp",
      lifecycleStatus: "dozita",
    });

    expect(
      contractListIndexFieldsForContract(
        contract({ productKey: "neon", status: "storno" }),
        new Date("2026-08-03T00:00:00.000Z")
      ).lifecycleStatus
    ).toBe("storno");
  });

  it("builds indexed query clauses with at most one multi-value in filter", () => {
    const filters = parseContractListFilters(
      new URLSearchParams({
        categories: "life,auto",
        institutions: "cpp,allianz",
        stornoOnly: "1",
        maturedOnly: "1",
      })
    );

    expect(buildContractListIndexedQueryClauses(filters, { allowIn: true })).toEqual([
      { field: "lifecycleStatus", op: "in", values: ["storno", "dozita"] },
    ]);

    expect(buildContractListIndexedQueryClauses(filters, { allowIn: false })).toEqual([]);

    const singleValueFilters = parseContractListFilters(
      new URLSearchParams({
        categories: "auto",
        institutions: "allianz",
        unpaidOnly: "1",
      })
    );

    expect(
      buildContractListIndexedQueryClauses(singleValueFilters, { allowIn: false })
    ).toEqual([
      { field: "lifecycleStatus", op: "==", value: "active" },
      { field: "paid", op: "==", value: false },
      { field: "productCategory", op: "==", value: "auto" },
      { field: "institutionId", op: "==", value: "allianz" },
    ]);

    const activeFilters = parseContractListFilters(
      new URLSearchParams({ activeOnly: "1" })
    );
    expect(
      buildContractListIndexedQueryClauses(activeFilters, { allowIn: false })
    ).toEqual([{ field: "lifecycleStatus", op: "==", value: "active" }]);
  });

  it("matches full list filters for unpaid, refresh and product category", () => {
    const filters = parseContractListFilters(
      new URLSearchParams({
        q: "AB1234",
        unpaidOnly: "1",
        refreshOnly: "true",
        categories: "life",
      })
    );

    expect(
      contractMatchesListFilters(
        contract({ isRefresh: true, productKey: "neon" }),
        filters,
        "advisor@example.com"
      )
    ).toBe(true);
    expect(
      contractMatchesListFilters(
        contract({ isRefresh: false, refreshCommissionBase: null }),
        filters,
        "advisor@example.com"
      )
    ).toBe(false);
    expect(
      contractMatchesListFilters(
        contract({ isRefresh: true, paid: true }),
        filters,
        "advisor@example.com"
      )
    ).toBe(false);
  });

  it("detects refresh contracts from all supported refresh markers", () => {
    expect(contractMatchesRefreshFilter(contract({ isRefresh: true }))).toBe(
      true
    );
    expect(
      contractMatchesRefreshFilter(
        contract({ isRefresh: false, refreshOriginalContractNumber: "A1" })
      )
    ).toBe(true);
    expect(
      contractMatchesRefreshFilter(
        contract({ isRefresh: false, refreshCommissionBase: { method: "x" } })
      )
    ).toBe(true);
    expect(contractMatchesRefreshFilter(contract({ isRefresh: false }))).toBe(
      false
    );
  });

  it("matches storno and matured lifecycle filters", () => {
    const stornoFilters = parseContractListFilters(
      new URLSearchParams({ stornoOnly: "1" })
    );
    const maturedFilters = parseContractListFilters(
      new URLSearchParams({ maturedOnly: "1" })
    );
    const bothFilters = parseContractListFilters(
      new URLSearchParams({ stornoOnly: "1", maturedOnly: "1" })
    );

    expect(
      contractMatchesListFilters(contract({ status: "storno" }), stornoFilters)
    ).toBe(true);
    expect(
      contractMatchesListFilters(contract({ status: "active" }), stornoFilters)
    ).toBe(false);
    expect(
      contractMatchesListFilters(contract({ status: "dozita" }), maturedFilters)
    ).toBe(true);
    expect(
      contractMatchesListFilters(contract({ status: "storno" }), bothFilters)
    ).toBe(true);
    expect(
      contractMatchesListFilters(contract({ status: "dozita" }), bothFilters)
    ).toBe(true);
  });

  it("matches only contracts outside storno and matured states for active filter", () => {
    const activeFilters = parseContractListFilters(
      new URLSearchParams({ activeOnly: "1" })
    );

    expect(
      contractMatchesListFilters(contract({ status: "active" }), activeFilters)
    ).toBe(true);
    expect(
      contractMatchesListFilters(contract({ status: "storno" }), activeFilters)
    ).toBe(false);
    expect(
      contractMatchesListFilters(contract({ status: "dozita" }), activeFilters)
    ).toBe(false);
  });

  it("uses signed date before createdAt for list sorting", () => {
    expect(contractSortDate(contract())?.toISOString().slice(0, 10)).toBe(
      "2026-01-10"
    );
    expect(
      contractSortDate(contract({ contractSignedDate: null }))?.toISOString().slice(
        0,
        10
      )
    ).toBe("2026-01-09");
  });

  it("checks anniversary window with a fixed current date", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");

    expect(isAnniversarySoonForList(new Date("2025-08-01"), now)).toBe(true);
    expect(isAnniversarySoonForList(new Date("2026-08-01"), now)).toBe(false);
    expect(isAnniversarySoonForList(new Date("2025-12-01"), now)).toBe(false);
  });
});
