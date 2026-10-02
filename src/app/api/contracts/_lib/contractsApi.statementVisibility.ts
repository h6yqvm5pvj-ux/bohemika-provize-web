import { canViewStatementDerivedRecord, normalizeAccessEmail as normalizeEmail } from "./contractsApi.access";
import type { ContractDoc } from "./contractsApi.types";

export type StatementDataViewer = {
  viewerEmail: string;
  teamEmails: string[];
  canViewAllStatementDerivedRecords?: boolean;
};

// Use the same projection before commission predicates and before serialization.
export const filterStatementDerivedContractDataForViewer = <T extends ContractDoc & { adviserEmail?: string | null }>({
  contract,
  ownerEmail,
  viewerEmail,
  teamEmails,
  canViewAllStatementDerivedRecords = false,
}: {
  contract: T;
  ownerEmail?: string;
} & StatementDataViewer): T => {
  const originalAdviserEmail = normalizeEmail(contract.originalAdviserEmail);
  const servicingOwnerEmail =
    normalizeEmail(contract.servicingOwnerEmail) ||
    normalizeEmail(contract.commissionOwnerEmail) ||
    normalizeEmail(contract.userEmail) ||
    normalizeEmail(contract.adviserEmail) || normalizeEmail(ownerEmail);
  const transferred = Boolean(
    originalAdviserEmail &&
      servicingOwnerEmail &&
      originalAdviserEmail !== servicingOwnerEmail
  );
  const canViewRecord = (record: {
    writtenBy?: string | null;
    writtenAtMs?: number | null;
  }) =>
    canViewStatementDerivedRecord({
      viewerEmail,
      teamEmails,
      writtenBy: record.writtenBy,
      canViewAllStatementDerivedRecords,
    }) ||
    // Po převodu musí být staré výplaty dál viditelné jako vypořádané,
    // jinak by cashflow mohlo tutéž provizi předpovědět novému správci podruhé.
    (transferred && normalizeEmail(record.writtenBy) === originalAdviserEmail);

  return {
    ...contract,
    // Starší záznamy bez autora schováváme také: nelze bezpečně určit, komu patří.
    commissionPayouts: Array.isArray(contract.commissionPayouts)
      ? contract.commissionPayouts.filter(canViewRecord)
      : [],
    cashflowPayoutMatches: Array.isArray(contract.cashflowPayoutMatches)
      ? contract.cashflowPayoutMatches.filter(canViewRecord)
      : [],
    premiumStatementHistory: Array.isArray(contract.premiumStatementHistory)
      ? contract.premiumStatementHistory.filter(canViewRecord)
      : [],
    premiumStatementBaseResolutions: Array.isArray(contract.premiumStatementBaseResolutions)
      ? contract.premiumStatementBaseResolutions.filter(canViewRecord)
      : [],
    // Souhrn může zahrnovat i skryté manažerské zápisy, proto jej neposíláme.
    commissionStornoSummary: null,
  };
};
