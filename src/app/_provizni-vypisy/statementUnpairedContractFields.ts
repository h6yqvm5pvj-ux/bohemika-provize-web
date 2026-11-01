import { commissionCodeAliasesForPayoutHistory, resolveStatementProduct } from "./statementParsing";
import type { LifeSplitContractPreview, OtherProductContractPreview } from "./statementTypes";

/** Both kinds of unpaired contracts must supply the same A101 filter data. */
export function statementUnpairedContractFields(contract: LifeSplitContractPreview | OtherProductContractPreview) {
  const life = "productCode" in contract;
  return {
    key: life ? `life:${contract.contractNumber}-${contract.productCode}` : `other:${contract.key}`,
    searchText: life
      ? `${contract.client} ${contract.contractNumber} ${contract.productLabel} ${contract.productCode}`
      : [contract.client, contract.contractNumber, ...contract.rows.map(row => `${row.product} ${resolveStatementProduct(row.product).label}`)].join(" "),
    unpaired: true,
    hasA101: contract.rows.some(row => commissionCodeAliasesForPayoutHistory(row.type).includes("A101")),
  };
}
