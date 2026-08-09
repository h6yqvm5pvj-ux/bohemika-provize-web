export type StatementPreviewContractGroups<LifeSplitContract, OtherProductContract> = {
  unpairedLifeSplitContracts: LifeSplitContract[];
  pairedLifeSplitContracts: LifeSplitContract[];
  unpairedOtherProductContracts: OtherProductContract[];
  lifeProductContracts: OtherProductContract[];
  autoProductContracts: OtherProductContract[];
  propertyProductContracts: OtherProductContract[];
  businessProductContracts: OtherProductContract[];
  travelProductContracts: OtherProductContract[];
  foreignerProductContracts: OtherProductContract[];
  investmentProductContracts: OtherProductContract[];
  remainingOtherProductContracts: OtherProductContract[];
};

export function groupStatementPreviewContracts<LifeSplitContract, OtherProductContract>({
  lifeSplitContracts,
  otherProductContracts,
  isUnpairedLifeSplitContract,
  isUnpairedOtherProductContract,
  hasOtherProductCategory,
}: {
  lifeSplitContracts: LifeSplitContract[];
  otherProductContracts: OtherProductContract[];
  isUnpairedLifeSplitContract: (contract: LifeSplitContract) => boolean;
  isUnpairedOtherProductContract: (contract: OtherProductContract) => boolean;
  hasOtherProductCategory: (
    contract: OtherProductContract,
    category:
      | "life"
      | "auto"
      | "property"
      | "business"
      | "travel"
      | "foreigners"
      | "investment"
  ) => boolean;
}): StatementPreviewContractGroups<LifeSplitContract, OtherProductContract> {
  const unpairedLifeSplitContracts = lifeSplitContracts.filter(isUnpairedLifeSplitContract);
  const pairedLifeSplitContracts = lifeSplitContracts.filter(
    (contract) => !isUnpairedLifeSplitContract(contract)
  );
  const unpairedOtherProductContracts = otherProductContracts.filter(
    isUnpairedOtherProductContract
  );
  const pairedOtherProductContracts = otherProductContracts.filter(
    (contract) => !isUnpairedOtherProductContract(contract)
  );
  const hasCategory = (
    contract: OtherProductContract,
    category:
      | "life"
      | "auto"
      | "property"
      | "business"
      | "travel"
      | "foreigners"
      | "investment"
  ) => hasOtherProductCategory(contract, category);

  return {
    unpairedLifeSplitContracts,
    pairedLifeSplitContracts,
    unpairedOtherProductContracts,
    lifeProductContracts: pairedOtherProductContracts.filter((contract) =>
      hasCategory(contract, "life")
    ),
    autoProductContracts: pairedOtherProductContracts.filter((contract) =>
      hasCategory(contract, "auto")
    ),
    propertyProductContracts: pairedOtherProductContracts.filter((contract) =>
      hasCategory(contract, "property")
    ),
    businessProductContracts: pairedOtherProductContracts.filter((contract) =>
      hasCategory(contract, "business")
    ),
    travelProductContracts: pairedOtherProductContracts.filter(
      (contract) =>
        !hasCategory(contract, "foreigners") && hasCategory(contract, "travel")
    ),
    foreignerProductContracts: pairedOtherProductContracts.filter((contract) =>
      hasCategory(contract, "foreigners")
    ),
    investmentProductContracts: pairedOtherProductContracts.filter((contract) =>
      hasCategory(contract, "investment")
    ),
    remainingOtherProductContracts: pairedOtherProductContracts.filter(
      (contract) =>
        !hasCategory(contract, "life") &&
        !hasCategory(contract, "auto") &&
        !hasCategory(contract, "property") &&
        !hasCategory(contract, "business") &&
        !hasCategory(contract, "travel") &&
        !hasCategory(contract, "foreigners") &&
        !hasCategory(contract, "investment")
    ),
  };
}
