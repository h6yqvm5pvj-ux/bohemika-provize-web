import { describe, expect, it } from "vitest";

import { groupStatementPreviewContracts } from "./statementPreviewGrouping";

type Contract = {
  id: string;
  unpaired?: boolean;
  categories: string[];
};

const ids = (contracts: Contract[]) => contracts.map((contract) => contract.id);

describe("groupStatementPreviewContracts", () => {
  it("separates unpaired contracts before assigning product sections", () => {
    const groups = groupStatementPreviewContracts({
      lifeSplitContracts: [
        { id: "life-paired", categories: [] },
        { id: "life-unpaired", unpaired: true, categories: [] },
      ],
      otherProductContracts: [
        { id: "auto-paired", categories: ["auto"] },
        { id: "auto-unpaired", unpaired: true, categories: ["auto"] },
      ],
      isUnpairedLifeSplitContract: (contract) => Boolean(contract.unpaired),
      isUnpairedOtherProductContract: (contract) => Boolean(contract.unpaired),
      hasOtherProductCategory: (contract, category) => contract.categories.includes(category),
    });

    expect(ids(groups.pairedLifeSplitContracts)).toEqual(["life-paired"]);
    expect(ids(groups.unpairedLifeSplitContracts)).toEqual(["life-unpaired"]);
    expect(ids(groups.unpairedOtherProductContracts)).toEqual(["auto-unpaired"]);
    expect(ids(groups.autoProductContracts)).toEqual(["auto-paired"]);
  });

  it("keeps health insurance for foreigners out of the travel section", () => {
    const groups = groupStatementPreviewContracts({
      lifeSplitContracts: [],
      otherProductContracts: [
        { id: "travel", categories: ["travel"] },
        { id: "foreigners", categories: ["travel", "foreigners"] },
      ],
      isUnpairedLifeSplitContract: () => false,
      isUnpairedOtherProductContract: () => false,
      hasOtherProductCategory: (contract, category) => contract.categories.includes(category),
    });

    expect(ids(groups.travelProductContracts)).toEqual(["travel"]);
    expect(ids(groups.foreignerProductContracts)).toEqual(["foreigners"]);
  });

  it("puts paired contracts without a known category into the remaining section", () => {
    const groups = groupStatementPreviewContracts({
      lifeSplitContracts: [],
      otherProductContracts: [
        { id: "other", categories: [] },
        { id: "investment", categories: ["investment"] },
      ],
      isUnpairedLifeSplitContract: () => false,
      isUnpairedOtherProductContract: () => false,
      hasOtherProductCategory: (contract, category) => contract.categories.includes(category),
    });

    expect(ids(groups.investmentProductContracts)).toEqual(["investment"]);
    expect(ids(groups.remainingOtherProductContracts)).toEqual(["other"]);
  });
});
