import { describe, expect, it } from "vitest";
import { PRODUCT_ORDER } from "@/app/lib/productCatalog";
import type { ClientContractItem } from "./clientCardHelpers";
import { CLIENT_PRODUCT_GROUPS, clientProductGroup, type ClientProductGroup } from "./clientProducts";

describe("client product groups", () => {
  it.each(PRODUCT_ORDER)("assigns the catalog product %s to a visible portfolio group", (product) => {
    const group = clientProductGroup(product);
    expect(CLIENT_PRODUCT_GROUPS.some((option) => option.value === group)).toBe(true);
    expect(group).not.toBe("other");
  });

  it.each<[ClientContractItem["productKey"], ClientProductGroup]>([
    ["cppAuto", "auto"],
    ["koopflotila", "auto"],
    ["domex", "propertyLiability"],
    ["zamex", "propertyLiability"],
    ["koopodzam", "propertyLiability"],
    ["neon", "life"],
    ["pillowInjury", "life"],
    ["cppsimplex", "entrepreneurs"],
    ["kooppmop", "entrepreneurs"],
    ["cppPPRs", "entrepreneurs"],
    ["cppPPRbez", "entrepreneurs"],
    ["cppcestovko", "travel"],
    ["maxcizinkomplex", "travel"],
    ["conseqzenit", "pension"],
    ["comfortcc", "investment"],
  ])("classifies %s as %s", (product, group) => {
    expect(clientProductGroup(product)).toBe(group);
  });

  it.each([null, undefined, "", "unknown-product", "constructor", "__proto__", "toString"])("keeps missing or unknown product %s visible as Other", (product) => {
    expect(clientProductGroup(product)).toBe("other");
  });
});
