"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  HandCoins,
  HeartPulse,
  House,
  ListChecks,
  Loader2,
  Plane,
  Printer,
  ReceiptText,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { isAutoProduct } from "@/app/lib/productCatalog";
import { applyTipContractAdjustmentToCommissionResult } from "@/app/lib/tipContractCommission";
import {
  type CommissionMode,
  type CommissionCoefficientSet,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  calculateAllianzAuto,
  calculateCppAuto,
  calculateCsobAuto,
  calculateKooperativaAuto,
  calculatePillowMajetek,
  calculatePillowAuto,
  calculateSlaviaFlotila,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculateKoopFlotila,
  isSlaviaAutoSupportedForSignedDate,
} from "@/app/lib/productFormulas";
import {
  candidateCoefficientSetsForProduct,
  coefficientSetLabel,
  defaultCoefficientSetForProduct,
  normalizeCommissionCoefficientSet,
  productSupportsCoefficientSetOverride,
  signedDateForCoefficientSetOverride,
} from "@/app/lib/productFormulas/coefficientSets";
import {
  calculateNeon,
  normalizeNeonDurationYears,
} from "@/app/lib/productFormulas/neon";
import {
  autoSubsequentCoefficientForProduct,
  isAutoSubsequentCommissionCode,
} from "@/app/lib/productFormulas/autoCommission";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { auth } from "@/app/firebase";
import {
  ADMIN_IMPERSONATION_EVENT,
  readAdminImpersonationState,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { AppLayout } from "@/components/AppLayout";
import { saveContractEntry } from "../kalkulacka/useContractSave";
import {
  CppAutoBatchQueue,
  cppAutoBatchQueueAmount,
  cppAutoBatchQueueItemFromPrefill,
  cppAutoBatchQueueItemKey,
  validateCppAutoBatchQueueItem,
  type CppAutoBatchQueueItem,
  type CppAutoBatchQueuePatch,
} from "./CppAutoBatchQueue";
import { StatementPairingLoader } from "./StatementPairingLoader";
import {
  NeonRefreshConversionPromptModal,
  StornoStatementActionModal,
} from "./statementActionModals";
import { AmountComparisonPanel } from "./statementAmountComparisonPanel";
import {
  contractMatchKey,
  fetchSystemContractMatchBatch,
  fetchSystemContractMatches,
  systemContractMatchError,
} from "./statementContractMatching";
import {
  DiscrepancyPdfNotesModal,
  MarkedDiscrepancyToggle,
} from "./statementDiscrepancyUi";
import {
  CommissionCodeRulesPanel,
  ContractStatusRulesPanel,
} from "./statementRulePanels";
import {
  BohemkaContractDetailLink,
  BohemkaContractDetailModal,
  ContractDetailLink,
  firstContractDetailUrl,
  firstSjednatelExtranetUrl,
  SjednatelExtranetLink,
  StatementCalculatorIframePanel,
  StatementCalculatorPrefillButton,
} from "./statementLinksAndCalculator";
import {
  BohemkaContractDetailModalContext,
  StatementCalculatorPrefillContext,
  StatementProductLogo,
  statementCalculatorPrefill,
  type StatementCalculatorPrefill,
  type StatementCalculatorPrefillSource,
} from "./statementPresentation";
import { StatementSummary } from "./statementSummary";
import {
  LifeSplitProductsSectionPanel,
  OtherProductsSectionPanel,
  type StatementProductSectionKind,
} from "./statementProductSections";
import {
  LifeSplitCommissionTable,
  OtherProductCommissionTable,
} from "./statementContractTables";
import {
  lifeSplitCardSummary,
  otherProductCardSummary,
} from "./statementCardMath";
import {
  LifeSplitCardMetadata,
  StatementRefreshConversionPanel,
  type StatementRefreshConversionStatus,
} from "./statementLifeCardPanels";
import {
  AcceleratedB36WarningNotice,
  LifeClientCardCommissionNotice,
  LifeCoefficientOverrideNotice,
  LifePremiumBaseNotice,
  LifePremiumIncreaseNotice,
  lifePremiumBaseNoticeKind,
} from "./statementLifeCardNotices";
import { groupStatementPreviewContracts } from "./statementPreviewGrouping";
import {
  StatementParseWarnings,
  StatementPreviewHeader,
} from "./statementPreviewPanels";
import {
  SystemMatchBadge,
  SystemMatchPanel,
  type SystemMatchPresentation,
} from "./statementSystemMatchUi";
import {
  StornoContractsSectionPanel,
  StornoSystemActionPanel,
  StornoSystemStatusBadge,
} from "./statementStornoPanels";
import { suggestedStornoDateForStatement } from "./statementStorno";
import {
  contractMatchForNumber,
  dedupeEquivalentSystemContracts,
  isUnpairedContractMatch,
  matchContractsRepresentSingleFamily,
  matchedSystemContract,
  matchedSystemContractForPremiumIncrease,
  normalizeCommissionModeValue,
  normalizePositionValue,
  primarySystemContractForFamily,
  sortSystemContractTimeline,
  statementProductMatchesSystemProduct,
  systemCommissionMonthlyBase,
  systemContractAnnualPremiumBase,
  systemContractAnnualPremiumDelta,
  systemContractIsEndorsement,
  systemContractIsStorno,
  systemContractPosition,
  systemContractPositionRaw,
  systemContractStatusLabel,
  systemContractTimelinePositionMismatch,
  systemMatchHasSingleFamilyHistory,
  systemMatchHistoryLabel,
} from "./statementSystemContracts";
import {
  CareerMismatchWarning,
  ContractTimelinePositionWarning,
  StatementCorrectionWarning,
} from "./statementWarnings";
import {
  PROCESSING_CAPTIONS,
  ProcessingAuditPanel,
  ProcessedStatementHistoryModal,
  StatementProcessingOverlay,
} from "./statementProcessingPanels";
import {
  downloadDiscrepancySummaryPdf,
} from "./statementDiscrepancyReport";
import {
  discrepancyIssueKey,
  markedDiscrepancyKey,
  matchingAutoIssuesForMarkedItem,
  statementBusinessIdentityKey,
  statementDiscrepancyKey,
  statementDiscrepancyLabel,
} from "./statementDiscrepancies";
import {
  ANNUAL_PREMIUM_TOLERANCE,
  AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS,
  COMMISSION_AMOUNT_TOLERANCE,
  MANAGER_COMMISSION_AMOUNT_TOLERANCE,
  addMonthsToLocalDate,
  addMonthsToMonthKey,
  addYearsToLocalDate,
  b36DeferredCodeForProduct,
  b36HalfLabelForProduct,
  b36OffsetPairIndexes,
  b36StatementAmountForReview,
  baseCommissionCodeForStatementComparison,
  classifyGeneralCommissionCode,
  classifyLifeSplitCommissionCode,
  commissionRowCanReplaceDeduction,
  commissionRowCorrectionKey,
  deductionOffsetsCommissionRow,
  formatLocalDate,
  formatMoney,
  formatMonthKey,
  formatSystemDate,
  formatWholeMoney,
  isInvestmentSectionProductCode,
  isLifeSplitProductCode,
  isNeonInitialCommissionCode,
  monthKeyFromDate,
  monthKeyFromIndex,
  monthKeyFromStatementPeriod,
  monthKeyIndex,
  managerCommissionCodeForSystemItems,
  managerCommissionRowIdentity,
  normalizeCommissionTitle,
  normalizeContractNumberForMatch,
  normalizeProductCode,
  normalizeStatementCommissionCode,
  normalizeText,
  normalizedRowText,
  parseLocalDate,
  parsePeriodEndDate,
  parseStatementHtml,
  paymentAmountWithFrequencyLabel,
  paymentsPerYearForFrequency,
  productLabelFromKey,
  readStatementFile,
  resolveStatementPremiumBasePeriod,
  resolveStatementProduct,
  setActiveStatementProductMapping,
  statementCorrectionSortValue,
  statementPaymentBundleCount,
  statementProductCategoryLabel,
  toDateInputValue,
  usesIndependentStatementCommissionBase,
} from "./statementParsing";
import type { StatementProductMapEntry } from "./statementProductMap";
import type {
  BohemkaContractDetailModalPayload,
  CoefficientOverrideInfo,
  CommissionAmountComparison,
  CommissionAmountComparisonStatus,
  CommissionRow,
  ContractCommissionPayoutRecord,
  ContractMatchRequest,
  ContractMatchScope,
  ContractMatchState,
  ContractMatchStats,
  ContractMatchesByNumber,
  ContractsMutationResponse,
  DeductionCommissionRow,
  DiscrepancyPdfItem,
  GeneralCommissionKind,
  LifePremiumChangeSummary,
  LifeSplitCommissionKind,
  LifeSplitContractPreview,
  ManagerCommissionAdvisor,
  ManagerCommissionRow,
  ManagerOverrideSummary,
  ManualNeonRefreshConversionResponse,
  ManualNeonRefreshConversionTarget,
  MarkedDiscrepancies,
  MarkedDiscrepancyItem,
  MarkingControls,
  MatchedSystemContract,
  MissingAcceleratedB36Warning,
  OtherPayment,
  OtherProductContractPreview,
  ParsedStatement,
  PostProcessingNeonRefreshPromptTarget,
  PremiumStatementHistoryEntry,
  SavedCommissionStatement,
  SavedCommissionStatementsResponse,
  StatementCorrectionContext,
  StatementDiscrepancyIssue,
  StatementDiscrepancySeverity,
  StatementFileRead,
  StatementProcessingResult,
  StatementProcessingSummary,
  StatementProductCategory,
  StatementProductMeta,
  StatementSaveState,
  StornoStatementActionTarget,
} from "./statementTypes";

type StatementProductMapResponse = {
  ok: true;
  entries: StatementProductMapEntry[];
} & Record<string, unknown>;

const STATEMENT_CONTRACT_SAVED_MESSAGE_TYPE = "bohemka:statement-contract-saved";
const STATEMENT_CONTRACT_SAVE_COMPLETED_MESSAGE_TYPE =
  "bohemka:statement-contract-save-completed";
const STATEMENT_CPP_A101_QUEUE_ADD_MESSAGE_TYPE =
  "bohemka:statement-cpp-a101-queue-add";

type StatementContractSavedMessage = {
  type:
    | typeof STATEMENT_CONTRACT_SAVED_MESSAGE_TYPE
    | typeof STATEMENT_CONTRACT_SAVE_COMPLETED_MESSAGE_TYPE;
  contractNumber: string;
  clientName?: string | null;
  product?: Product | null;
  ownerEmail?: string | null;
  entryId?: string | null;
  savedAtMs?: number | null;
};

type StatementCppA101QueueAddMessage = {
  type: typeof STATEMENT_CPP_A101_QUEUE_ADD_MESSAGE_TYPE;
  product: Extract<Product, "cppAuto" | "domex">;
  contractNumber: string;
  clientName: string;
  contractSignedDate: string;
  policyStartDate: string;
  amountText: string;
  frequency: PaymentFrequency;
  stornoDate: string;
  pdfFile?: File | null;
};

const isPaymentFrequency = (value: unknown): value is PaymentFrequency =>
  value === "monthly" ||
  value === "quarterly" ||
  value === "semiannual" ||
  value === "annual";

const isCppA101QueueProduct = (
  value: unknown
): value is Extract<Product, "cppAuto" | "domex"> =>
  value === "cppAuto" || value === "domex";

const isStatementContractSavedMessage = (
  value: unknown
): value is StatementContractSavedMessage => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === STATEMENT_CONTRACT_SAVED_MESSAGE_TYPE &&
    typeof record.contractNumber === "string" &&
    normalizeContractNumberForMatch(record.contractNumber).length > 0
  );
};

const isStatementContractSaveCompletedMessage = (
  value: unknown
): value is StatementContractSavedMessage => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === STATEMENT_CONTRACT_SAVE_COMPLETED_MESSAGE_TYPE &&
    typeof record.contractNumber === "string" &&
    normalizeContractNumberForMatch(record.contractNumber).length > 0
  );
};

const isStatementCppA101QueueAddMessage = (
  value: unknown
): value is StatementCppA101QueueAddMessage => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === STATEMENT_CPP_A101_QUEUE_ADD_MESSAGE_TYPE &&
    isCppA101QueueProduct(record.product) &&
    typeof record.contractNumber === "string" &&
    typeof record.clientName === "string" &&
    typeof record.contractSignedDate === "string" &&
    typeof record.policyStartDate === "string" &&
    typeof record.amountText === "string" &&
    typeof record.stornoDate === "string" &&
    isPaymentFrequency(record.frequency)
  );
};

const stornoUpdateEntryIds = (contract: MatchedSystemContract): string[] =>
  Array.from(
    new Set(
      [
        contract.id,
        ...(contract.lifePremiumChanges ?? []).map((change) => change.id),
      ].filter(Boolean)
    )
  );

const emptyStatementCorrectionContext = (): StatementCorrectionContext => ({
  correctedRowKeys: new Set<string>(),
  correctedRowLabels: new Map<string, string>(),
  correctedRowDetails: new Map<string, string>(),
});

const buildStatementCorrectionContext = (
  statements: ParsedStatement[]
): StatementCorrectionContext => {
  if (statements.length < 2) return emptyStatementCorrectionContext();

  const ordered = statements
    .map((statement, index) => ({
      statement,
      statementKey: statementDiscrepancyKey(statement),
      order: statementCorrectionSortValue(statement, index),
      index,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index);

  const correctedRowKeys = new Set<string>();
  const correctedRowLabels = new Map<string, string>();
  const correctedRowDetails = new Map<string, string>();

  for (let currentIndex = 1; currentIndex < ordered.length; currentIndex += 1) {
    const current = ordered[currentIndex];
    if (current.statement.deductionRows.length === 0) continue;

    for (const deduction of current.statement.deductionRows) {
      const replacement = current.statement.commissionRows.find((row) =>
        commissionRowCanReplaceDeduction(row, deduction)
      );
      if (!replacement) continue;

      for (let previousIndex = currentIndex - 1; previousIndex >= 0; previousIndex -= 1) {
        const previous = ordered[previousIndex];
        const correctedRow = previous.statement.commissionRows.find(
          (row) =>
            !correctedRowKeys.has(commissionRowCorrectionKey(previous.statementKey, row)) &&
            deductionOffsetsCommissionRow(row, deduction)
        );
        if (!correctedRow) continue;

        const key = commissionRowCorrectionKey(previous.statementKey, correctedRow);
        const correctionTarget =
          current.statement.header.statementNumber ?? current.statement.fileName;
        const careerChanged =
          normalizedRowText(correctedRow.career) !== normalizedRowText(replacement.career);
        correctedRowKeys.add(key);
        correctedRowLabels.set(
          key,
          careerChanged ? "Oprava kariérního stupně" : "Opraveno navazujícím výpisem"
        );
        correctedRowDetails.set(
          key,
          careerChanged
            ? `Původně vyplaceno na Kar. ${correctedRow.career || "—"} (${formatMoney(correctedRow.commission)} Kč), navazující výpis ${correctionTarget} to odečetl a vyplatil na Kar. ${replacement.career || "—"} (${formatMoney(replacement.commission)} Kč).`
            : `Navazující výpis ${correctionTarget} odečetl původní provizi ${formatMoney(correctedRow.commission)} Kč a nahradil ji novou výplatou ${formatMoney(replacement.commission)} Kč.`
        );
        break;
      }
    }
  }

  return { correctedRowKeys, correctedRowLabels, correctedRowDetails };
};

const rowsForStatementReview = <T extends CommissionRow>(
  statementKey: string,
  rows: T[],
  correctionContext?: StatementCorrectionContext
): T[] => {
  if (!correctionContext || correctionContext.correctedRowKeys.size === 0) return rows;
  return rows.filter(
    (row) => !correctionContext.correctedRowKeys.has(commissionRowCorrectionKey(statementKey, row))
  );
};

const correctedStatementRowsForDisplay = <T extends CommissionRow>(
  statementKey: string,
  rows: T[],
  correctionContext?: StatementCorrectionContext
): T[] => {
  if (!correctionContext || correctionContext.correctedRowKeys.size === 0) return [];
  return rows.filter((row) =>
    correctionContext.correctedRowKeys.has(commissionRowCorrectionKey(statementKey, row))
  );
};

const correctedRowsLabel = (
  statementKey: string,
  rows: CommissionRow[],
  correctionContext?: StatementCorrectionContext
): string | null => {
  const corrected = correctedStatementRowsForDisplay(statementKey, rows, correctionContext);
  if (corrected.length === 0) return null;
  const labels = corrected
    .map((row) =>
      correctionContext?.correctedRowLabels.get(commissionRowCorrectionKey(statementKey, row))
    )
    .filter((label): label is string => Boolean(label));
  return labels[0] ?? "Opraveno navazujícím výpisem";
};

const correctedRowsDetails = (
  statementKey: string,
  rows: CommissionRow[],
  correctionContext?: StatementCorrectionContext
): string[] => {
  const corrected = correctedStatementRowsForDisplay(statementKey, rows, correctionContext);
  if (corrected.length === 0) return [];

  const details = corrected
    .map((row) =>
      correctionContext?.correctedRowDetails.get(commissionRowCorrectionKey(statementKey, row))
    )
    .filter((detail): detail is string => Boolean(detail));

  return [...new Set(details)];
};

type CurrentStatementCorrectionInfo = {
  label: string;
  details: string[];
};

const currentStatementCorrectionInfoForRows = (
  rows: CommissionRow[],
  deductionRows: DeductionCommissionRow[] | null | undefined
): CurrentStatementCorrectionInfo | null => {
  if (rows.length === 0 || !deductionRows || deductionRows.length === 0) return null;

  const usedDeductionIndexes = new Set<number>();
  const details: string[] = [];
  let careerCorrection = false;

  for (const row of rows) {
    const deductionIndex = deductionRows.findIndex(
      (deduction, index) =>
        !usedDeductionIndexes.has(index) && commissionRowCanReplaceDeduction(row, deduction)
    );
    if (deductionIndex < 0) continue;

    const deduction = deductionRows[deductionIndex];
    if (!deduction) continue;
    usedDeductionIndexes.add(deductionIndex);

    const code = normalizeStatementCommissionCode(row.type) || row.type || "provize";
    const careerChanged =
      normalizedRowText(row.career) !== normalizedRowText(deduction.career);
    careerCorrection = careerCorrection || careerChanged;

    details.push(
      careerChanged
        ? `Tento výpis opravuje ${code}: odečítá původní výplatu na Kar. ${deduction.career || "—"} (${formatMoney(deduction.commission)} Kč) a zapisuje novou výplatu na Kar. ${row.career || "—"} (${formatMoney(row.commission)} Kč). Do historie smlouvy se zapisuje odúčtování i nová výplata.`
        : `Tento výpis opravuje ${code}: odečítá původní výplatu ${formatMoney(deduction.commission)} Kč a zapisuje novou výplatu ${formatMoney(row.commission)} Kč. Do historie smlouvy se zapisuje odúčtování i nová výplata.`
    );
  }

  if (details.length === 0) return null;

  return {
    label: careerCorrection ? "Opravná provize: kariérní stupeň" : "Opravná provize",
    details: [...new Set(details)],
  };
};

const statementFileReadSortValue = (
  file: StatementFileRead,
  index: number
): number => statementCorrectionSortValue(file.statement, index);

const sumAmounts = <T,>(items: T[], pickAmount: (item: T) => number): number =>
  Math.round(
    items.reduce((sum, item) => {
      const amount = pickAmount(item);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0) * 100
  ) / 100;

const savedStatementCountLabel = (count: number): string => {
  if (count === 1) return "Výpis uložen pro provizní kalendář.";
  if (count >= 2 && count <= 4) return `${count} výpisy uloženy pro provizní kalendář.`;
  return `${count} výpisů uloženo pro provizní kalendář.`;
};

const isProcessedSavedStatement = (statement: SavedCommissionStatement): boolean =>
  typeof statement.processedAtMs === "number" && Number.isFinite(statement.processedAtMs);

const savedStatementHistorySortValue = (statement: SavedCommissionStatement): number =>
  (typeof statement.statementChronologyMs === "number" && Number.isFinite(statement.statementChronologyMs)
    ? statement.statementChronologyMs
    : null) ??
  (typeof statement.periodStartMs === "number" && Number.isFinite(statement.periodStartMs)
    ? statement.periodStartMs
    : null) ??
  (typeof statement.processedAtMs === "number" && Number.isFinite(statement.processedAtMs)
    ? statement.processedAtMs
    : 0);

const fetchProcessedCommissionStatementHistory = async (
  currentUser: FirebaseUser
): Promise<SavedCommissionStatement[]> => {
  const request = async (forceRefreshToken = false) => {
    const token = await currentUser.getIdToken(forceRefreshToken);
    return fetch("/api/commission-statements?shape=history&limit=240", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  };

  let response = await request(false);
  if (response.status === 401) {
    response = await request(true);
  }

  const payload = (await response.json().catch(() => null)) as
    | SavedCommissionStatementsResponse
    | null;

  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
    throw new Error(payload?.error || "Historii zpracovaných výpisů se nepodařilo načíst.");
  }

  return payload.items
    .filter(isProcessedSavedStatement)
    .sort((left, right) => savedStatementHistorySortValue(right) - savedStatementHistorySortValue(left));
};

const fetchStatementProductMap = async (
  currentUser: FirebaseUser
): Promise<StatementProductMapEntry[]> => {
  const request = async (forceRefreshToken = false) => {
    const token = await currentUser.getIdToken(forceRefreshToken);
    return fetch("/api/commission-statements/product-map", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  };

  let response = await request(false);
  if (response.status === 401) {
    response = await request(true);
  }

  const payload = (await response.json().catch(() => null)) as
    | StatementProductMapResponse
    | null;

  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.entries)) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).error === "string"
        ? ((payload as Record<string, unknown>).error as string)
        : "Produktovou mapu výpisů se nepodařilo načíst.";
    throw new Error(message);
  }

  return payload.entries;
};

const sumProcessingResults = (
  results: StatementProcessingResult[]
): StatementProcessingSummary =>
  results.reduce<StatementProcessingSummary>(
    (summary, result) => ({
      payoutRows: summary.payoutRows + (result.payoutRows ?? 0),
      contractsMatched: summary.contractsMatched + (result.contractsMatched ?? 0),
      contractsWithPayoutChanges:
        summary.contractsWithPayoutChanges + (result.contractsWithPayoutChanges ?? 0),
      payoutRecordsAdded: summary.payoutRecordsAdded + (result.payoutRecordsAdded ?? 0),
      payoutRecordsExisting:
        summary.payoutRecordsExisting + (result.payoutRecordsExisting ?? 0),
      payoutRecordsUpdated: summary.payoutRecordsUpdated + (result.payoutRecordsUpdated ?? 0),
      coefficientOverridesApplied:
        summary.coefficientOverridesApplied + (result.coefficientOverridesApplied ?? 0),
      duplicatePayoutRowsSkipped:
        summary.duplicatePayoutRowsSkipped + (result.duplicatePayoutRowsSkipped ?? 0),
      premiumUpdates: summary.premiumUpdates + (result.premiumUpdates ?? 0),
      premiumHistoryBackfills:
        summary.premiumHistoryBackfills + (result.premiumHistoryBackfills ?? 0),
      olderPremiumUpdatesSkipped:
        summary.olderPremiumUpdatesSkipped + (result.olderPremiumUpdatesSkipped ?? 0),
      filteredContractsSkipped:
        summary.filteredContractsSkipped + (result.filteredContractsSkipped ?? 0),
      accountingRepairDrafts:
        summary.accountingRepairDrafts + (result.accountingRepairDrafts ?? 0),
      externalUpdateTasks: summary.externalUpdateTasks + (result.externalUpdateTasks ?? 0),
      contractsUpdated: summary.contractsUpdated + (result.contractsUpdated ?? 0),
      notFoundContracts: [
        ...summary.notFoundContracts,
        ...(result.notFoundContracts ?? []),
      ],
      ambiguousContracts: [
        ...summary.ambiguousContracts,
        ...(result.ambiguousContracts ?? []),
      ],
      skippedContracts: [
        ...summary.skippedContracts,
        ...(result.skippedContracts ?? []),
      ],
      errors: [...summary.errors, ...(result.errors ?? [])],
    }),
    {
      payoutRows: 0,
      contractsMatched: 0,
      contractsWithPayoutChanges: 0,
      payoutRecordsAdded: 0,
      payoutRecordsExisting: 0,
      payoutRecordsUpdated: 0,
      coefficientOverridesApplied: 0,
      duplicatePayoutRowsSkipped: 0,
      premiumUpdates: 0,
      premiumHistoryBackfills: 0,
      olderPremiumUpdatesSkipped: 0,
      filteredContractsSkipped: 0,
      accountingRepairDrafts: 0,
      externalUpdateTasks: 0,
      contractsUpdated: 0,
      notFoundContracts: [] as string[],
      ambiguousContracts: [] as string[],
      skippedContracts: [] as string[],
      errors: [] as string[],
    }
  );

const processedStatementLabel = (
  count: number,
  results: StatementProcessingResult[]
): string => {
  const summary = sumProcessingResults(results);
  const base = [
    savedStatementCountLabel(count),
    `Upraveno ${summary.contractsUpdated} smluv.`,
    `Smluvy s výplatou: ${summary.contractsWithPayoutChanges}.`,
    `Zapsáno ${summary.payoutRecordsAdded} provizních položek.`,
    `Aktualizováno existujících provizních položek: ${summary.payoutRecordsUpdated}.`,
    `Koeficientové výjimky: ${summary.coefficientOverridesApplied}.`,
    `Přeskočeno duplicit: ${summary.duplicatePayoutRowsSkipped}.`,
    `Změny pojistného: ${summary.premiumUpdates}.`,
    `Doplněná historie pojistného: ${summary.premiumHistoryBackfills}.`,
    `Návrhy účetních oprav: ${summary.accountingRepairDrafts}.`,
    `Podklady pro MAXX/extranet: ${summary.externalUpdateTasks}.`,
  ];
  const warnings = [
    summary.ambiguousContracts.length > 0
      ? `Duplicitní shody: ${Array.from(new Set(summary.ambiguousContracts)).slice(0, 8).join(", ")}.`
      : null,
    summary.skippedContracts.length > 0
      ? `Přeskočené smlouvy: ${Array.from(new Set(summary.skippedContracts)).slice(0, 8).join(", ")}.`
      : null,
    summary.olderPremiumUpdatesSkipped > 0
      ? `Starší pojistné změny po novějším výpisu přeskočeny: ${summary.olderPremiumUpdatesSkipped}.`
      : null,
    summary.premiumHistoryBackfills > 0
      ? `Starší pojistné změny doplněny do historie bez přepsání aktuální smlouvy: ${summary.premiumHistoryBackfills}.`
      : null,
    summary.errors.length > 0 ? `Chyby: ${summary.errors.slice(0, 3).join(" | ")}.` : null,
  ].filter(Boolean);

  return [...base, ...warnings].join(" ");
};

const buildStatementSavePayload = ({ statement, html }: StatementFileRead) => {
  const managerRows = statement.managerCommissions.flatMap((advisor) => advisor.rows);

  return {
    fileName: statement.fileName,
    html,
    header: statement.header,
    summary: {
      commissionRowCount: statement.commissionRows.length,
      commissionTotal: sumAmounts(statement.commissionRows, (row) => row.commission),
      reserveFundTotal: sumAmounts(statement.commissionRows, (row) => row.reserveFund),
      payoutTotal: statement.payoutTotal,
      otherPaymentsCount: statement.otherPayments.length,
      otherPaymentsTotal: sumAmounts(statement.otherPayments, (payment) => payment.amount),
      managerAdvisorCount: statement.managerCommissions.length,
      managerRowCount: managerRows.length,
      managerCommissionTotal: sumAmounts(statement.managerCommissions, (advisor) => advisor.commission),
      stornoRowCount: statement.stornoRows.length,
      stornoTotal: sumAmounts(statement.stornoRows, (row) => row.commission),
    },
  };
};

const collectStatementContractMatchRequests = (
  statements: ParsedStatement[]
): ContractMatchRequest[] => {
  const requests = new Map<string, ContractMatchRequest>();

  const addRequest = (
    contractNumber: string | null | undefined,
    scope: ContractMatchScope
  ) => {
    const key = contractMatchKey(scope, contractNumber);
    if (!key || !contractNumber || requests.has(key)) return;
    requests.set(key, { contractNumber, scope });
  };

  for (const statement of statements) {
    for (const row of statement.commissionRows) {
      addRequest(row.contractNumber, row.lifeSplitKind === "tip" ? "tip" : "my");
    }
    for (const row of statement.stornoRows) {
      addRequest(row.contractNumber, "my");
    }
    for (const payment of statement.otherPayments) {
      addRequest(payment.contractNumber, "my");
    }
    for (const advisor of statement.managerCommissions) {
      for (const row of advisor.rows) {
        addRequest(row.contractNumber, "team");
      }
    }
  }

  return [...requests.values()];
};

type ManagerCommissionMatchNotice = {
  title: string;
  lines: string[];
  tone: "amber" | "rose";
};

const managerCommissionMatchNotice = (
  match: ContractMatchState | null
): ManagerCommissionMatchNotice | null => {
  if (!match || match.status === "idle" || match.status === "loading") return null;

  if (match.status === "not_found") {
    return {
      title: "Nenalezeno v týmových smlouvách",
      lines: [
        "Číslo smlouvy z manažerské provize se nenašlo mezi smlouvami podřízených poradců.",
        "Před ostrým zápisem bude potřeba ruční kontrola poradce, čísla smlouvy nebo produktu.",
      ],
      tone: "amber",
    };
  }

  if (match.status === "error") {
    return {
      title: "Ověření nedokončeno",
      lines: [
        match.error || "Smlouvu se nepodařilo ověřit vůči systému.",
        "Před ostrým zápisem bude potřeba kontrolu zopakovat nebo smlouvu dohledat ručně.",
      ],
      tone: "rose",
    };
  }

  if (match.status === "matched" && !matchedSystemContract(match)) {
    const examples = match.contracts
      .slice(0, 3)
      .map((contract) =>
        [
          contract.clientName || "klient bez názvu",
          contract.adviserName || contract.adviserEmail || "poradce nezjištěn",
        ].join(" · ")
      );

    return {
      title: `Více shod v systému (${match.contracts.length})`,
      lines: [
        examples.length > 0
          ? `Nalezené shody: ${examples.join("; ")}${match.contracts.length > examples.length ? "…" : ""}`
          : "Systém vrátil více smluv se stejným číslem.",
        "Před zápisem je potřeba určit správnou smlouvu podle klienta a poradce.",
      ],
      tone: "amber",
    };
  }

  return null;
};

const managerCommissionMatchSortRank = (match: ContractMatchState | null): number =>
  match?.status === "matched" && matchedSystemContract(match) ? 0 : 1;

const managerCommissionProductSortRank = (category: StatementProductCategory): number => {
  if (category === "life") return 0;
  if (category === "auto") return 1;
  if (category === "property") return 2;
  if (category === "business") return 3;
  if (category === "travel") return 4;
  if (category === "foreigners") return 5;
  if (category === "investment") return 6;
  return 7;
};

type ManagerCommissionRowSectionKey =
  | "unpairedLife"
  | "unpairedAuto"
  | "unpairedProperty"
  | "unpairedBusiness"
  | "unpairedTravel"
  | "unpairedForeigners"
  | "unpairedTroyOunce"
  | "unpairedInvestment"
  | "unpairedOther"
  | "life"
  | "auto"
  | "property"
  | "business"
  | "travel"
  | "foreigners"
  | "troyOunce"
  | "investment"
  | "other";

type ManagerCommissionRowSection = {
  key: ManagerCommissionRowSectionKey;
  label: string;
  description: string;
  className: string;
  rows: Array<{ row: ManagerCommissionRow; index: number }>;
  groups: ManagerCommissionContractGroup[];
  contractCount: number;
  commissionTotal: number;
  manualReviewCount: number;
  differenceCount: number;
};

type ManagerCommissionContractGroup = {
  key: string;
  rows: Array<{ row: ManagerCommissionRow; index: number }>;
  contractNumber: string;
  commissionTotal: number;
  reserveFundTotal: number;
  hasStorno: boolean;
  manualReviewCount: number;
  differenceCount: number;
};

const MANAGER_COMMISSION_ROW_SECTION_ORDER: ManagerCommissionRowSectionKey[] = [
  "life",
  "auto",
  "property",
  "business",
  "travel",
  "foreigners",
  "investment",
  "troyOunce",
  "other",
  "unpairedLife",
  "unpairedAuto",
  "unpairedProperty",
  "unpairedBusiness",
  "unpairedTravel",
  "unpairedForeigners",
  "unpairedInvestment",
  "unpairedTroyOunce",
  "unpairedOther",
];

const managerCommissionRowSectionMeta = (
  key: ManagerCommissionRowSectionKey
): Pick<ManagerCommissionRowSection, "label" | "description" | "className"> => {
  switch (key) {
    case "unpairedLife":
      return {
        label: "Nespárované / Životní pojištění",
        description: "Životní řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedAuto":
      return {
        label: "Nespárované / Auta",
        description: "Auto řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedProperty":
      return {
        label: "Nespárované / Majetek a odpovědnost",
        description: "Majetkové a odpovědnostní řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedBusiness":
      return {
        label: "Nespárované / Podnikatelé",
        description: "Podnikatelské řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedTravel":
      return {
        label: "Nespárované / Cestovní pojištění",
        description: "Cestovní řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedForeigners":
      return {
        label: "Nespárované / Cizinci",
        description: "Řádky zdravotního pojištění cizinců bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedTroyOunce":
      return {
        label: "Nespárované / Zlato",
        description: "Zlaté položky z produktů TU_* bez jednoznačné shody v týmu.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedInvestment":
      return {
        label: "Nespárované / Investice",
        description: "Investiční řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedOther":
      return {
        label: "Nespárované / ostatní",
        description: "Ostatní řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "life":
      return {
        label: "Životní pojištění",
        description: "Meziprovize ze životních smluv.",
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
      };
    case "auto":
      return {
        label: "Auta",
        description: "Meziprovize z autopojištění.",
        className: "border-sky-200 bg-sky-50 text-sky-950",
      };
    case "property":
      return {
        label: "Majetek a odpovědnost",
        description: "Meziprovize z majetkových a odpovědnostních produktů.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "business":
      return {
        label: "Podnikatelé",
        description: "Meziprovize z podnikatelských produktů.",
        className: "border-orange-200 bg-orange-50 text-orange-950",
      };
    case "travel":
      return {
        label: "Cestovní pojištění",
        description: "Meziprovize z cestovního pojištění.",
        className: "border-cyan-200 bg-cyan-50 text-cyan-950",
      };
    case "foreigners":
      return {
        label: "Cizinci",
        description: "Meziprovize ze zdravotního pojištění cizinců.",
        className: "border-indigo-200 bg-indigo-50 text-indigo-950",
      };
    case "troyOunce":
      return {
        label: "Troyská unce / zlato",
        description: "Položky z produktů TU_*.",
        className: "border-violet-200 bg-violet-50 text-violet-950",
      };
    case "investment":
      return {
        label: "Investice",
        description: "Investika, Efektika, Monetika, Conseq a další investiční položky.",
        className: "border-teal-200 bg-teal-50 text-teal-950",
      };
    case "other":
      return {
        label: "Ostatní produkty",
        description: "Majetek a další produktové řádky.",
        className: "border-slate-200 bg-slate-50 text-slate-800",
      };
  }
};

const managerCommissionRowSectionIcon = (
  key: ManagerCommissionRowSectionKey
): LucideIcon => {
  switch (key) {
    case "unpairedLife":
    case "life":
      return HeartPulse;
    case "unpairedAuto":
    case "auto":
      return Car;
    case "unpairedProperty":
    case "property":
      return House;
    case "unpairedBusiness":
    case "business":
      return ReceiptText;
    case "unpairedTravel":
    case "travel":
      return Plane;
    case "unpairedForeigners":
    case "foreigners":
      return UsersRound;
    case "unpairedOther":
      return AlertTriangle;
    case "unpairedInvestment":
    case "investment":
      return HandCoins;
    case "unpairedTroyOunce":
    case "troyOunce":
      return WalletCards;
    case "other":
      return ListChecks;
  }
};

const czechCountLabel = (
  count: number,
  singular: string,
  few: string,
  many: string
): string => `${count} ${count === 1 ? singular : count >= 2 && count <= 4 ? few : many}`;

const managerCommissionRowSectionKey = (
  row: ManagerCommissionRow,
  matchesByContractNumber: ContractMatchesByNumber
): ManagerCommissionRowSectionKey => {
  const product = resolveStatementProduct(row.product);
  const rawCode = normalizeProductCode(product.rawCode);

  const matchNotice = managerCommissionMatchNotice(
    contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team")
  );
  if (matchNotice) {
    if (product.category === "life") return "unpairedLife";
    if (product.category === "auto") return "unpairedAuto";
    if (product.category === "property") return "unpairedProperty";
    if (product.category === "business") return "unpairedBusiness";
    if (product.category === "travel") return "unpairedTravel";
    if (product.category === "foreigners") return "unpairedForeigners";
    if (rawCode.startsWith("TU_")) return "unpairedTroyOunce";
    if (product.category === "investment") return "unpairedInvestment";
    return "unpairedOther";
  }

  if (product.category === "life") return "life";
  if (product.category === "auto") return "auto";
  if (product.category === "property") return "property";
  if (product.category === "business") return "business";
  if (product.category === "travel") return "travel";
  if (product.category === "foreigners") return "foreigners";
  if (rawCode.startsWith("TU_")) return "troyOunce";
  if (product.category === "investment") return "investment";

  return "other";
};

const buildManagerCommissionRowSections = ({
  rows,
  matchesByContractNumber,
  advisorRowScope,
  comparisonsByRowKey,
}: {
  rows: ManagerCommissionRow[];
  matchesByContractNumber: ContractMatchesByNumber;
  advisorRowScope: string;
  comparisonsByRowKey: Map<string, CommissionAmountComparison>;
}): ManagerCommissionRowSection[] => {
  const sections = new Map<
    ManagerCommissionRowSectionKey,
    Array<{ row: ManagerCommissionRow; index: number }>
  >();

  rows.forEach((row, index) => {
    const key = managerCommissionRowSectionKey(row, matchesByContractNumber);
    const existingRows = sections.get(key) ?? [];
    existingRows.push({ row, index });
    sections.set(key, existingRows);
  });

  return MANAGER_COMMISSION_ROW_SECTION_ORDER.flatMap((key) => {
    const sectionRows = sections.get(key) ?? [];
    if (sectionRows.length === 0) return [];

    const meta = managerCommissionRowSectionMeta(key);
    const groupsByContract = new Map<string, ManagerCommissionContractGroup>();
    let commissionTotal = 0;

    for (const item of sectionRows) {
      const { row } = item;
      const normalizedContractNumber = normalizeContractNumberForMatch(row.contractNumber);
      const groupKey = normalizedContractNumber || row.contractNumber || row.id;
      commissionTotal += row.commission;

      const matchNotice = managerCommissionMatchNotice(
        contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team")
      );
      const comparison = comparisonsByRowKey.get(managerCommissionRowKey(advisorRowScope, row));
      const existingGroup =
        groupsByContract.get(groupKey) ??
        ({
          key: groupKey,
          rows: [],
          contractNumber: row.contractNumber,
          commissionTotal: 0,
          reserveFundTotal: 0,
          hasStorno: false,
          manualReviewCount: 0,
          differenceCount: 0,
        } satisfies ManagerCommissionContractGroup);

      existingGroup.rows.push(item);
      existingGroup.commissionTotal += row.commission;
      existingGroup.reserveFundTotal += row.reserveFund;
      existingGroup.hasStorno = existingGroup.hasStorno || row.isStorno;
      if (matchNotice) existingGroup.manualReviewCount += 1;
      if (comparison && comparison.status !== "ok") existingGroup.differenceCount += 1;
      groupsByContract.set(groupKey, existingGroup);
    }

    const groups = [...groupsByContract.values()];
    const manualReviewCount = groups.filter((group) => group.manualReviewCount > 0).length;
    const differenceCount = groups.reduce((sum, group) => sum + group.differenceCount, 0);

    return [
      {
        key,
        ...meta,
        rows: sectionRows,
        groups,
        contractCount: groups.length,
        commissionTotal,
        manualReviewCount,
        differenceCount,
      },
    ];
  });
};

const sortManagerCommissionRows = (
  rows: ManagerCommissionRow[],
  matchesByContractNumber: ContractMatchesByNumber
): ManagerCommissionRow[] =>
  rows
    .map((row, index) => ({
      row,
      index,
      matchRank: managerCommissionMatchSortRank(
        contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team")
      ),
      productRank: managerCommissionProductSortRank(resolveStatementProduct(row.product).category),
    }))
    .sort((left, right) => {
      if (left.matchRank !== right.matchRank) return left.matchRank - right.matchRank;
      if (left.productRank !== right.productRank) return left.productRank - right.productRank;
      return left.index - right.index;
    })
    .map((item) => item.row);

const sumRows = (rows: CommissionRow[]): number =>
  rows.reduce((sum, row) => sum + row.commission, 0);

const sumPayments = (payments: OtherPayment[]): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

const STATEMENT_AMOUNT_PRESENCE_TOLERANCE = 0.005;

const hasStatementAmountForComparison = (amount: number): boolean =>
  Number.isFinite(amount) && Math.abs(amount) >= STATEMENT_AMOUNT_PRESENCE_TOLERANCE;

const hasRowsForAmountComparison = (rows: CommissionRow[]): boolean =>
  rows.some((row) => hasStatementAmountForComparison(row.commission));

const hasPaymentsForAmountComparison = (payments: OtherPayment[]): boolean =>
  payments.some((payment) => hasStatementAmountForComparison(payment.amount));

const b36PaidPaymentAmountsForComparison = (payments: OtherPayment[]): number[] =>
  payments
    .filter(
      (payment) => payment.isB36Half && payment.amount > STATEMENT_AMOUNT_PRESENCE_TOLERANCE
    )
    .map((payment) => payment.amount);

const tipExpectedAmountFromSystemContract = (
  contract: MatchedSystemContract | null | undefined
): number => {
  const amount = Number(contract?.tipContractTipsterAmountFirstYear);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
};

const hasUnpairedB36Offset = (payments: OtherPayment[]): boolean => {
  const paired = b36OffsetPairIndexes(payments);
  return payments.some(
    (payment, index) =>
      payment.isB36Half &&
      (payment.isStorno || payment.amount < -COMMISSION_AMOUNT_TOLERANCE) &&
      !paired.has(index)
  );
};

const rowsByKind = (
  contract: LifeSplitContractPreview,
  kind: LifeSplitCommissionKind
): CommissionRow[] => contract.rows.filter((row) => row.lifeSplitKind === kind);

const commissionCodeAliasesForPayoutHistory = (
  value: string | null | undefined
): string[] => {
  const code = normalizeStatementCommissionCode(value);
  if (!code) return [];

  const aliases = new Set<string>();
  const addAlias = (alias: string) => {
    const normalized = normalizeStatementCommissionCode(alias);
    if (!normalized) return;
    aliases.add(normalized);
    aliases.add(normalized.replace(/[_-]/g, ""));
  };

  addAlias(code);

  const compact = code.replace(/[_-]/g, "");
  const installmentRangeMatch = code.match(/^([AB])(\d{3})-\1(\d{3})$/);
  if (installmentRangeMatch) {
    const prefix = installmentRangeMatch[1] ?? "";
    const start = Number(installmentRangeMatch[2]);
    const end = Number(installmentRangeMatch[3]);
    if (
      prefix &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start <= 24
    ) {
      for (let item = start; item <= end; item += 1) {
        addAlias(`${prefix}${String(item).padStart(3, "0")}`);
      }
    }
  }

  if (compact === "B36HALF" || compact === "B036HALF" || compact === "B3601HALF") {
    ["B36_HALF", "B036_HALF", "B3601_HALF"].forEach(addAlias);
  } else if (compact === "B36" || compact === "B036" || compact === "B3601") {
    ["B36", "B036", "B3601"].forEach(addAlias);
  } else if (compact === "B48" || compact === "B048" || compact === "B4801") {
    ["B48", "B048", "B4801"].forEach(addAlias);
  } else if (compact === "B101B104") {
    ["B101-B104", "B101", "B102", "B103", "B104"].forEach(addAlias);
  } else if (compact === "B201B206") {
    ["B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"].forEach(addAlias);
  } else if (/^B20[1-6]$/.test(compact)) {
    addAlias("B201-B206");
  }

  const closingRoleMatch = compact.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRoleMatch) addAlias(`A${closingRoleMatch[1]}`);

  return [...aliases];
};

const payoutRecordCodeAliases = (payout: ContractCommissionPayoutRecord): string[] => {
  const aliases = new Set<string>();
  const addAliases = (value: string | null | undefined) => {
    for (const alias of commissionCodeAliasesForPayoutHistory(value)) {
      aliases.add(alias);
    }

    const normalizedValue = normalizeStatementCommissionCode(value);
    for (const match of normalizedValue.matchAll(
      /\b(A1(?:0[1-9]|1[0-2])|B0301|B1(?:0[1-9]|1[0-2])|B20[1-6]|B4801|B48|B048|B3601|B36|B036)(?:[_-]?HALF)?\b/g
    )) {
      const baseCode = match[1] ?? "";
      const matchedCode = match[0] ?? "";
      const isHalfB36 =
        /HALF$/.test(matchedCode) &&
        (baseCode === "B36" || baseCode === "B036" || baseCode === "B3601");
      const code = isHalfB36 ? `${baseCode}_HALF` : baseCode;
      for (const alias of commissionCodeAliasesForPayoutHistory(code)) {
        aliases.add(alias);
      }
    }

    const normalizedTitle = normalizeCommissionTitle(value);
    if (
      normalizedTitle.includes("50") &&
      (normalizedTitle.includes("b36") || normalizedTitle.includes("b036") || normalizedTitle.includes("b3601"))
    ) {
      for (const alias of commissionCodeAliasesForPayoutHistory("B3601_HALF")) {
        aliases.add(alias);
      }
    }
  };

  addAliases(payout.code);
  addAliases(payout.key);
  addAliases(payout.title);
  return [...aliases];
};

const historicalPayoutSignedAmount = (payout: ContractCommissionPayoutRecord): number => {
  const amount = Number(payout.amount);
  if (!Number.isFinite(amount)) return 0;
  const status = normalizeText(payout.status).toLowerCase();
  const differenceReason = normalizeText(payout.differenceReason).toLowerCase();
  if (status === "storno" || differenceReason === "storno" || amount < 0) {
    return -Math.abs(amount);
  }
  return amount;
};

const historicalPaidPayoutAmountForCodes = (
  systemContract: MatchedSystemContract | null | undefined,
  codes: string[]
): number => {
  const expectedAliases = new Set(
    codes.flatMap(commissionCodeAliasesForPayoutHistory).filter(Boolean)
  );
  if (!systemContract || expectedAliases.size === 0) return 0;

  const amount = (systemContract.commissionPayouts ?? []).reduce((sum, payout) => {
    const matches = payoutRecordCodeAliases(payout).some((alias) => expectedAliases.has(alias));
    return matches ? sum + historicalPayoutSignedAmount(payout) : sum;
  }, 0);

  return Math.round(amount * 100) / 100;
};

const hasHistoricalPaidPayoutForCodes = (
  systemContract: MatchedSystemContract | null | undefined,
  codes: string[]
): boolean =>
  historicalPaidPayoutAmountForCodes(systemContract, codes) > COMMISSION_AMOUNT_TOLERANCE;

const hasHistoricalB0301Payout = (
  systemContract: MatchedSystemContract | null | undefined
): boolean => hasHistoricalPaidPayoutForCodes(systemContract, ["B0301"]);

const hasHistoricalB36HalfPayout = (
  systemContract: MatchedSystemContract | null | undefined
): boolean =>
  hasHistoricalPaidPayoutForCodes(systemContract, ["B36_HALF", "B036_HALF", "B3601_HALF"]);

const lifeSplitContractHasOnlyTipRows = (contract: LifeSplitContractPreview): boolean =>
  contract.rows.length > 0 &&
  contract.rows.some((row) => row.lifeSplitKind === "tip") &&
  contract.rows.every((row) => row.lifeSplitKind === "tip");

const lifeSplitContractMatchScope = (
  contract: LifeSplitContractPreview
): ContractMatchScope => (lifeSplitContractHasOnlyTipRows(contract) ? "tip" : "my");

const statusForContract = (
  contract: LifeSplitContractPreview,
  systemContract?: MatchedSystemContract | null
): {
  label: string;
  tone: "ok" | "warn" | "info" | "tip";
} => {
  const hasA101 = rowsByKind(contract, "a101").length > 0;
  const hasB0301 = rowsByKind(contract, "b0301").length > 0;
  const hasB0301InHistory = hasHistoricalB0301Payout(systemContract);
  const hasTip = rowsByKind(contract, "tip").length > 0;
  const hasIncrease = rowsByKind(contract, "increase").length > 0;
  const hasOnlyLaterItems =
    !hasA101 &&
    !hasTip &&
    !hasIncrease &&
    contract.rows.some((row) =>
      ["b3601", "b4801", "subsequent", "care"].includes(row.lifeSplitKind)
    );
  const hasStornoB36 = hasUnpairedB36Offset(contract.b36Payments);

  if (hasStornoB36) return { label: "Obsahuje storno B36", tone: "warn" };
  if (contract.rows.length === 0 && contract.b36Payments.length > 0) {
    return { label: "Jen B36 z ostatních plateb", tone: "info" };
  }
  if (hasIncrease && !hasA101 && !hasB0301) {
    return { label: "Pojistné navýšeno", tone: "ok" };
  }
  if (hasTip) return { label: "Provize z TIPU", tone: "tip" };
  if (hasOnlyLaterItems) return { label: "Následná provize", tone: "info" };
  if (hasA101 && hasB0301) return { label: "Sjednávací část OK", tone: "ok" };
  if (hasA101 && hasB0301InHistory) return { label: "B0301 už zapsaná dříve", tone: "ok" };
  if (hasA101 && !hasB0301) return { label: "B0301 nenalezeno v tomto výpisu", tone: "warn" };
  if (!hasA101 && hasB0301) return { label: "Doplacená B0301", tone: "ok" };
  return { label: "Ke kontrole", tone: "warn" };
};

const statusClass = (tone: "ok" | "warn" | "info" | "tip"): string => {
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "tip") return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
};

const generalCommissionKindClass = (kind: GeneralCommissionKind): string => {
  switch (kind) {
    case "closing":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "tip":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "subsequent":
    case "installment":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "increase":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "unexpected":
    case "troyOunce":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "penalty":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "office":
    case "compensation":
    case "gradual":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const uniqueProductMetasForRows = (rows: Array<{ product: string }>): StatementProductMeta[] => {
  const seen = new Set<string>();
  const products: StatementProductMeta[] = [];

  for (const row of rows) {
    const product = resolveStatementProduct(row.product);
    if (seen.has(product.rawCode)) continue;
    seen.add(product.rawCode);
    products.push(product);
  }

  return products;
};

const contractHasProductCategory = (
  contract: OtherProductContractPreview,
  category: StatementProductCategory
): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) => product.category === category);

const contractHasTroyOunceProduct = (contract: OtherProductContractPreview): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) =>
    normalizeProductCode(product.rawCode).startsWith("TU_")
  );

const contractHasInvestmentSectionProduct = (
  contract: OtherProductContractPreview
): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) =>
    isInvestmentSectionProductCode(product.rawCode)
  );

const otherProductContractPrimaryCategory = (
  contract: OtherProductContractPreview
): StatementProductCategory | "other" => {
  if (contractHasProductCategory(contract, "life")) return "life";
  if (contractHasProductCategory(contract, "auto")) return "auto";
  if (contractHasProductCategory(contract, "property")) return "property";
  if (contractHasProductCategory(contract, "business")) return "business";
  if (contractHasProductCategory(contract, "foreigners")) return "foreigners";
  if (contractHasProductCategory(contract, "travel")) return "travel";
  if (contractHasProductCategory(contract, "investment")) return "investment";
  if (contractHasProductCategory(contract, "comfort")) return "comfort";
  return "other";
};

const otherProductContractCategoryLabel = (
  contract: OtherProductContractPreview
): string => {
  const category = otherProductContractPrimaryCategory(contract);
  switch (category) {
    case "auto":
      return "Auta";
    case "property":
      return "Majetek a odpovědnost";
    case "business":
      return "Podnikatelé";
    case "travel":
      return "Cestovní pojištění";
    case "foreigners":
      return "Cizinci";
    case "investment":
      return "Investice";
    case "comfort":
      return "Comfort";
    case "life":
      return "Životní pojištění";
    default:
      return "Ostatní smlouvy";
  }
};

const positionLabel = (position: Position | null | undefined): string => {
  if (!position) return "—";
  const advisorMatch = position.match(/^poradce(\d+)$/);
  if (advisorMatch) return `Poradce ${advisorMatch[1]}`;
  const managerMatch = position.match(/^manazer(\d+)$/);
  if (managerMatch) return `Manažer ${managerMatch[1]}`;
  return position;
};

type StatementCareerPosition = {
  raw: string;
  code: number;
  position: Position;
};

const statementCareerPositionFromValue = (
  value: string | null | undefined
): StatementCareerPosition | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const code = Number(match[0]);
  if (!Number.isFinite(code)) return null;

  const candidate =
    code >= 1 && code <= 10
      ? `poradce${code}`
      : code >= 104 && code <= 110
        ? `manazer${code - 100}`
        : null;
  const position = normalizePositionValue(candidate);
  return position ? { raw, code, position } : null;
};

const statementCareerPositionsFromRows = (
  rows: Array<{ career: string }>
): StatementCareerPosition[] => {
  const byPosition = new Map<Position, StatementCareerPosition>();
  rows.forEach((row) => {
    const parsed = statementCareerPositionFromValue(row.career);
    if (parsed && !byPosition.has(parsed.position)) {
      byPosition.set(parsed.position, parsed);
    }
  });
  return [...byPosition.values()];
};

const statementCareerPositionLabel = (career: StatementCareerPosition): string =>
  `${career.raw} (${positionLabel(career.position)})`;

const statementCareerPositionsLabel = (careers: StatementCareerPosition[]): string =>
  careers.map(statementCareerPositionLabel).join(", ");

const statementCareerBadgeLabel = (
  careers: StatementCareerPosition[] | null | undefined
): string =>
  careers && careers.length > 0
    ? `Výpis Kar. ${statementCareerPositionsLabel(careers)}`
    : "Kar. výpis nezjištěna";

const statementCareerMismatch = (
  rows: Array<{ career: string }>,
  systemPositionRaw: unknown
): { careers: StatementCareerPosition[]; systemPosition: Position | null; mismatched: boolean } => {
  const careers = statementCareerPositionsFromRows(rows);
  const systemPosition = normalizePositionValue(systemPositionRaw);
  if (careers.length === 0 || !systemPosition) {
    return { careers, systemPosition, mismatched: false };
  }
  return {
    careers,
    systemPosition,
    mismatched: careers.some((career) => career.position !== systemPosition),
  };
};

const statementCareerIssueCount = (
  rows: Array<{ career: string }>,
  systemPositionRaw: unknown
): number => {
  const { careers, systemPosition, mismatched } = statementCareerMismatch(
    rows,
    systemPositionRaw
  );
  return careers.length > 0 && (!systemPosition || mismatched) ? 1 : 0;
};

const normalizePaymentFrequencyValue = (value: unknown): PaymentFrequency =>
  value === "monthly" ||
  value === "quarterly" ||
  value === "semiannual" ||
  value === "annual"
    ? value
    : "annual";

const hasCommissionType = (rows: CommissionRow[], type: string): boolean => {
  const expectedAliases = new Set(commissionCodeAliasesForPayoutHistory(type));
  if (expectedAliases.size === 0) return false;

  return rows.some((row) =>
    commissionCodeAliasesForPayoutHistory(row.type).some((alias) =>
      expectedAliases.has(alias)
    )
  );
};

const contractRowsHaveA101Commission = (rows: CommissionRow[]): boolean =>
  hasCommissionType(rows, "A101");

const otherProductContractHasA101Commission = (
  contract: OtherProductContractPreview
): boolean => contractRowsHaveA101Commission(contract.rows);

const missingAcceleratedB36Warning = (
  rows: CommissionRow[],
  b36Payments: OtherPayment[],
  systemContract: MatchedSystemContract | null
): MissingAcceleratedB36Warning | null => {
  const splitProducts = uniqueProductMetasForRows(rows).filter((product) =>
    isLifeSplitProductCode(product.rawCode)
  );

  if (splitProducts.length === 0) return null;
  if (!systemContractExpectsImmediateB36(systemContract)) return null;
  const hasA101 = hasCommissionType(rows, "A101");
  const hasB0301 = hasCommissionType(rows, "B0301");
  const hasB0301InHistory = hasHistoricalB0301Payout(systemContract);
  if (!hasA101) return null;
  const hasCurrentB36HalfDeduction = b36Payments.some(
    (payment) => payment.isB36Half && payment.amount < -COMMISSION_AMOUNT_TOLERANCE
  );
  if (hasHistoricalB36HalfPayout(systemContract) && !hasCurrentB36HalfDeduction) return null;
  if (
    b36Payments.some(
      (payment) => payment.isB36Half && payment.amount > COMMISSION_AMOUNT_TOLERANCE
    )
  ) {
    return null;
  }

  return {
    contractNumber: rows[0]?.contractNumber ?? "",
    client: rows[0]?.client ?? "",
    productLabels: splitProducts
      .map((product) => `${product.label} (${product.rawCode})`)
      .join(", "),
    detail: hasB0301
      ? "Ve výpisu je A101 a B0301, ale není nalezená odpovídající 50% z B36 v ostatních platbách."
      : hasB0301InHistory
        ? "Ve výpisu je A101 a B0301 už je zapsaná v historii smlouvy, ale není nalezená odpovídající 50% z B36 v ostatních platbách."
        : "Ve výpisu je A101. B0301 může přijít později po kartě klienta, ale u zrychleného režimu chybí odpovídající 50% z B36 v ostatních platbách.",
  };
};

const systemContractExpectsImmediateB36 = (
  systemContract: MatchedSystemContract | null
): boolean => {
  const items = systemContract?.items ?? [];
  if (items.length > 0) {
    return items.some((item) => {
      const title = normalizeCommissionTitle(item.title);
      const amount = Number(item.amount);
      return (
        Number.isFinite(amount) &&
        amount > COMMISSION_AMOUNT_TOLERANCE &&
        title.includes("50") &&
        (title.includes("b36") || title.includes("b3601"))
      );
    });
  }

  const mode = normalizeCommissionTitle(systemContract?.commissionMode);
  if (
    mode === "standard" ||
    mode.includes("standard") ||
    mode.includes("bezny") ||
    mode.includes("bez rezimu")
  ) {
    return false;
  }
  if (mode === "accelerated" || mode.includes("accelerated") || mode.includes("zrychlen")) {
    return true;
  }

  return false;
};

const annualAmountsMatch = (
  left: number | null | undefined,
  right: number | null | undefined
): boolean => {
  const leftAmount = Number(left);
  const rightAmount = Number(right);
  return (
    Number.isFinite(leftAmount) &&
    Number.isFinite(rightAmount) &&
    Math.abs(leftAmount - rightAmount) <= ANNUAL_PREMIUM_TOLERANCE
  );
};

const matchedSystemContractForLifeSplit = (
  contract: LifeSplitContractPreview,
  match: ContractMatchState | null
): MatchedSystemContract | null => {
  if (match?.status !== "matched") return null;
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  if (contracts.length === 1) return contracts[0];
  if (!matchContractsRepresentSingleFamily(contracts)) return null;

  const timeline = sortSystemContractTimeline(contracts);
  const originalContracts = timeline.filter((item) => !systemContractIsEndorsement(item));
  const endorsementContracts = timeline.filter(systemContractIsEndorsement);
  const hasInitialCommission =
    rowsByKind(contract, "a101").length > 0 || rowsByKind(contract, "b0301").length > 0;
  const increaseAnnualBase = rowsByKind(contract, "increase")
    .map((row) => row.base)
    .find((base) => base > 0);

  if (hasInitialCommission) {
    const matchingOriginal = originalContracts.find((item) =>
      annualAmountsMatch(systemContractAnnualPremiumBase(item), contract.annualPremium)
    );
    return matchingOriginal ?? originalContracts[0] ?? primarySystemContractForFamily(timeline);
  }

  if (increaseAnnualBase != null && increaseAnnualBase > 0) {
    const matchingEndorsement = endorsementContracts.find((item) =>
      annualAmountsMatch(
        Math.abs(systemContractAnnualPremiumDelta(item) ?? 0),
        increaseAnnualBase
      )
    );
    return (
      matchingEndorsement ??
      endorsementContracts[endorsementContracts.length - 1] ??
      primarySystemContractForFamily(timeline)
    );
  }

  const matchingBase = timeline.find((item) =>
    annualAmountsMatch(systemContractAnnualPremiumBase(item), contract.annualPremium)
  );
  return matchingBase ?? primarySystemContractForFamily(timeline);
};

const matchedSystemContractForManagerCommissionRow = (
  row: ManagerCommissionRow,
  match: ContractMatchState | null
): MatchedSystemContract | null => {
  if (classifyGeneralCommissionCode(row.product, row.type).kind !== "increase") {
    return matchedSystemContract(match);
  }

  return matchedSystemContractForPremiumIncrease({
    match,
    statementPremiumBase: row.base,
    statementBasePeriod: resolveStatementProduct(row.product).usesAnnualPremiumBase
      ? "annual"
      : "payment",
  });
};

const lifePremiumBaseComparisonForContract = (
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract | null
): PremiumBaseComparison | null => {
  if (!systemContract || contract.annualPremium <= 0) return null;

  const hasLifePremiumIncrease = rowsByKind(contract, "increase").length > 0;
  if (hasLifePremiumIncrease) {
    const annualDelta = Math.abs(systemContractAnnualPremiumDelta(systemContract) ?? 0);
    if (annualDelta <= ANNUAL_PREMIUM_TOLERANCE) return null;
    return premiumBaseComparisonForAnnualStatementBase({
      key: "life-premium-increase-base",
      label: "Základna navýšení",
      statementAnnualPremium: contract.annualPremium,
      systemContract,
      systemMonthlyPremiumOverride: annualDelta / 12,
    });
  }

  return premiumBaseComparisonForAnnualStatementBase({
    key: "life-premium-base",
    label: "Základna pojistného",
    statementAnnualPremium: contract.annualPremium,
    systemContract,
  });
};

const systemMatchPresentation: SystemMatchPresentation = {
  matchedSystemContract,
  systemMatchHistoryLabel,
  dedupeEquivalentSystemContracts,
  systemMatchHasSingleFamilyHistory,
  sortSystemContractTimeline,
  statementProductMatchesSystemProduct,
  systemContractTimelinePositionMismatch,
  systemContractIsEndorsement,
  positionLabel,
  systemContractPosition,
};

const hasProductMismatch = (
  expectedProductKey: Product | null | undefined,
  systemContract: MatchedSystemContract | null
): boolean =>
  Boolean(expectedProductKey && systemContract?.productKey) &&
  !statementProductMatchesSystemProduct(expectedProductKey, systemContract?.productKey);

type AnnualPremiumBaseMismatch = {
  statementAnnualPremium: number;
  systemAnnualPremium: number;
  systemMonthlyPremium: number;
  difference: number;
  explainedByEndorsement: LifePremiumChangeSummary | null;
};

type PremiumBaseMismatch = {
  statementPremiumBase: number;
  statementPaymentBase: number;
  statementBasePeriod: "annual" | "payment";
  systemPremiumBase: number;
  systemPaymentAmount: number;
  systemPaymentFrequency: string | null;
  paymentsPerYear: number;
  statementAnnualPremiumBase: number;
  systemAnnualPremiumBase: number;
  difference: number;
  annualDifference: number;
};

type PremiumBaseComparison = PremiumBaseMismatch & {
  key: string;
  label: string;
  canBeAnniversaryPremiumChange: boolean;
  firstAnniversaryDate: Date | null;
  anniversaryDate: Date | null;
  referenceDate: Date | null;
};

type AutoPremiumChangeDirection = "increase" | "decrease";

type AutoPremiumChangeInfo = PremiumBaseMismatch & {
  direction: AutoPremiumChangeDirection;
  referenceDate: Date | null;
  firstAnniversaryDate: Date | null;
  anniversaryDate: Date | null;
  source: "stored_history" | "statement_period";
};

type AutoPremiumAnniversaryWindow = {
  anniversaryNumber: number;
  anniversaryDate: Date;
  windowStart: Date;
  windowEnd: Date;
  referenceDate: Date;
  firstAnniversaryDate: Date | null;
};

type AutoPremiumBaseReference = {
  annualPremiumBase: number;
  paymentPremiumBase: number;
  paymentsPerYear: number;
  paymentFrequency: string | null;
  referenceDate: Date | null;
  source: "current" | "history";
};

const matchingEndorsementPremiumChange = (
  statementAnnualPremium: number,
  systemContract: MatchedSystemContract | null
): LifePremiumChangeSummary | null => {
  if (statementAnnualPremium <= 0) return null;
  const changes = systemContract?.lifePremiumChanges ?? [];
  return (
    changes.find((change) => {
      if (change.entryType !== "endorsement") return false;
      const annualPremium = Number(change.annualPremium);
      return (
        Number.isFinite(annualPremium) &&
        annualPremium > 0 &&
        Math.abs(statementAnnualPremium - annualPremium) <= ANNUAL_PREMIUM_TOLERANCE
      );
    }) ?? null
  );
};

const systemCurrentPremiumPaymentBase = (
  systemContract: MatchedSystemContract | null
): number => {
  if (isAutoProduct(systemContract?.productKey ?? null)) {
    const effectiveInputAmount = Number(systemContract?.effectiveInputAmount);
    if (Number.isFinite(effectiveInputAmount) && effectiveInputAmount > 0) {
      return effectiveInputAmount;
    }

    const inputAmount = Number(systemContract?.inputAmount);
    if (Number.isFinite(inputAmount) && inputAmount > 0) return inputAmount;
  }

  return systemCommissionMonthlyBase(systemContract);
};

const isNeonRefreshMissingOriginalInSystem = (
  systemContract: MatchedSystemContract | null
): boolean =>
  systemContract?.productKey === "neon" &&
  systemContract?.isRefresh === true &&
  systemContract.commissionBaseSource !== "commission_statement" &&
  systemContract.commissionCalculationStatus !==
    "statement_resolved_refresh_missing_original" &&
  (systemContract.refreshOriginalMissingInSystem === true ||
    systemContract.requiresStatementRefresh === true ||
    systemContract.commissionCalculationStatus === "provisional_refresh_missing_original");

const isoDayFromSystemDate = (
  value: number | string | Date | null | undefined
): string | null => {
  const date = parseLocalDate(value);
  return date ? toDateInputValue(date) : null;
};

const isUnsupportedSlaviaAutoStatementContract = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null | undefined
): boolean => {
  const hasSlaviaAuto =
    systemContract?.productKey === "slaviaauto" ||
    contract.rows.some(
      (row) => resolveStatementProduct(row.product).productKey === "slaviaauto"
    );
  if (!hasSlaviaAuto) return false;

  const signedDateIso =
    isoDayFromSystemDate(contract.signedAt) ??
    isoDayFromSystemDate(systemContract?.contractSignedDate) ??
    isoDayFromSystemDate(systemContract?.createdAt);

  return !isSlaviaAutoSupportedForSignedDate(signedDateIso);
};

const effectiveCoefficientSetForContract = (
  systemContract: MatchedSystemContract | null,
  signedDateIso: string | null
): CommissionCoefficientSet | null =>
  normalizeCommissionCoefficientSet(systemContract?.commissionCoefficientSetOverride) ??
  (systemContract?.productKey === "neon"
    ? normalizeCommissionCoefficientSet(systemContract?.neonCoefficientSetOverride)
    : null) ??
  defaultCoefficientSetForProduct(systemContract?.productKey, signedDateIso);

const calculateResultForCoefficientSet = ({
  productKey,
  amount,
  frequencyRaw,
  position,
  commissionMode,
  signedDateIso,
  coefficientSet,
  durationYears,
}: {
  productKey: Product;
  amount: number;
  frequencyRaw: PaymentFrequency;
  position: Position;
  commissionMode: CommissionMode;
  signedDateIso: string | null;
  coefficientSet: CommissionCoefficientSet;
  durationYears: number | null;
}): { items: CommissionResultItemDTO[]; total: number } | null => {
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: coefficientSet,
  });

  switch (productKey) {
    case "neon": {
      if (coefficientSet !== "historical" && coefficientSet !== "current") return null;
      const years = normalizeNeonDurationYears(durationYears, signedDateIso, coefficientSet);
      return calculateNeon(
        amount,
        position,
        years,
        commissionMode,
        signedDateIso,
        coefficientSet
      );
    }
    case "cppAuto":
      return calculateCppAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "allianzAuto":
      return calculateAllianzAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "csobAuto":
      return calculateCsobAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "uniqaAuto":
      return calculateUniqaAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "uniqaflotila":
      return calculateUniqaFlotila(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "pillowAuto":
      return calculatePillowAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "slaviaflotila":
      return calculateSlaviaFlotila(amount, frequencyRaw, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(
        amount,
        frequencyRaw,
        position,
        coefficientSignedDateIso
      );
    case "koopflotila":
      return calculateKoopFlotila(amount, frequencyRaw, position);
    default:
      return null;
  }
};

const expectedNeonAmountFromItems = (
  items: CommissionResultItemDTO[],
  rowCode: string
): number => {
  const code = baseCommissionCodeForStatementComparison(rowCode);
  if (code === "A101") {
    return expectedAmountFromItems(
      items,
      (title) => title === "provize a101" || title.includes("okamzita provize")
    );
  }
  if (code === "B0301") {
    return expectedAmountFromItems(items, (title) => title === "provize b0301");
  }
  return 0;
};

const expectedAutoAmountFromItems = (
  items: CommissionResultItemDTO[],
  rowCode: string,
  statementAmount: number,
  frequencyRaw: PaymentFrequency
): number => {
  const code = normalizeText(rowCode).toUpperCase().replace(/\s+/g, "");
  const periods = periodsPerYear(frequencyRaw);
  const wantsSubsequent = isAutoSubsequentCommissionCode(code);
  const candidates = items
    .filter((item) => !isTotalCommissionItem(item))
    .flatMap((item) => {
      const title = normalizeCommissionTitle(item.title);
      const amount = Number(item.amount);
      if (!Number.isFinite(amount)) return [];

      const isClosing =
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni");
      const isAnnual =
        title.includes("provize za rok") ||
        title.includes("celkem za rok") ||
        title.includes("za rok");
      const isSubsequent = title.includes("nasledna");

      if (wantsSubsequent) {
        if (!isSubsequent && !isAnnual) return [];
      } else if (!isClosing && !isAnnual) {
        return [];
      }

      return periods > 1 && (isAnnual || isClosing || isSubsequent)
        ? [amount, amount / periods]
        : [amount];
    });

  return closestAmount(candidates, statementAmount) ?? 0;
};

const autoSubsequentExpectedAmountForRow = (
  productKey: Product,
  position: Position,
  signedDateIso: string | null,
  row: CommissionRow
): number | null => {
  if (!isAutoSubsequentCommissionCode(row.type)) return null;
  const rowBase = Number(row.base);
  if (!Number.isFinite(rowBase) || rowBase <= 0) return null;
  const coefficient = autoSubsequentCoefficientForProduct(
    productKey,
    position,
    signedDateIso
  );
  if (coefficient == null) return null;
  return Math.round(rowBase * coefficient * 100) / 100;
};

const autoSubsequentExpectedAmountForRows = (
  productKey: Product,
  systemContract: MatchedSystemContract,
  rows: CommissionRow[]
): number | null => {
  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const coefficientSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: coefficientSet,
  });

  let hasExpected = false;
  const total = rows.reduce((sum, row) => {
    const expected = autoSubsequentExpectedAmountForRow(
      productKey,
      position,
      coefficientSignedDateIso,
      row
    );
    if (expected == null) return sum;
    hasExpected = true;
    return sum + expected;
  }, 0);

  return hasExpected ? Math.round(total * 100) / 100 : null;
};

const lifeCoefficientOverrideInfo = (
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract | null
): CoefficientOverrideInfo | null => {
  if (systemContract?.productKey !== "neon") return null;
  const productKey = resolveStatementProduct(contract.productCode).productKey;
  if (productKey !== "neon") return null;
  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const monthlyPremium = systemCommissionMonthlyBase(systemContract);
  if (!Number.isFinite(monthlyPremium) || monthlyPremium <= 0) return null;

  const immediateRows = contract.rows.filter((row) => {
    return isNeonInitialCommissionCode(row.type) && row.base > 0 && row.commission > 0;
  });
  if (immediateRows.length === 0) return null;

  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const currentSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  if (!currentSet) return null;
  const mode = normalizeCommissionModeValue(systemContract.commissionMode);
  const frequencyRaw = normalizePaymentFrequencyValue(systemContract.frequencyRaw);
  const rawDurationYears =
    typeof systemContract.durationYears === "number" &&
    Number.isFinite(systemContract.durationYears)
      ? systemContract.durationYears
      : null;
  const matches = candidateCoefficientSetsForProduct(productKey).filter((set) => {
    return immediateRows.every((row) => {
      const result = calculateResultForCoefficientSet({
        productKey,
        amount: row.base / 12,
        frequencyRaw,
        position,
        commissionMode: mode,
        signedDateIso,
        coefficientSet: set,
        durationYears: rawDurationYears,
      });
      if (!result) return false;
      const comparableResult = applyTipContractAdjustmentToCommissionResult({
        product: productKey,
        items: result.items,
        total: result.total,
        tipsterPercent: systemContract.tipContractTipsterPercent,
      });
      const expected = expectedNeonAmountFromItems(comparableResult.items, row.type);
      return Math.abs(row.commission - expected) <= COMMISSION_AMOUNT_TOLERANCE;
    });
  });

  if (matches.length !== 1) return null;
  const coefficientSet = matches[0];
  if (coefficientSet === currentSet) return null;

  const result = calculateResultForCoefficientSet({
    productKey,
    amount: monthlyPremium,
    frequencyRaw,
    position,
    commissionMode: mode,
    signedDateIso,
    coefficientSet,
    durationYears: rawDurationYears,
  });
  if (!result) return null;
  const comparableResult = applyTipContractAdjustmentToCommissionResult({
    product: productKey,
    items: result.items,
    total: result.total,
    tipsterPercent: systemContract.tipContractTipsterPercent,
  });

  return {
    coefficientSet,
    currentSet,
    items: comparableResult.items,
    total: comparableResult.total,
  };
};

const systemCommissionPaymentBase = (
  systemContract: MatchedSystemContract | null
): number => {
  const calculationInputAmount = Number(systemContract?.calculationInputAmount);
  if (Number.isFinite(calculationInputAmount) && calculationInputAmount > 0) {
    return calculationInputAmount;
  }

  const effectiveInputAmount = Number(systemContract?.effectiveInputAmount);
  if (Number.isFinite(effectiveInputAmount) && effectiveInputAmount > 0) {
    return effectiveInputAmount;
  }

  return Number(systemContract?.inputAmount);
};

const autoCoefficientOverrideInfo = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): CoefficientOverrideInfo | null => {
  if (!systemContract) return null;
  const productKey = systemContract.productKey ?? null;
  if (!productKey || !isAutoProduct(productKey) || !productSupportsCoefficientSetOverride(productKey)) {
    return null;
  }
  const productMetas = uniqueProductMetasForRows(contract.rows);
  const statementProductKeys = Array.from(
    new Set(productMetas.map((product) => product.productKey).filter(Boolean))
  );
  if (statementProductKeys.length !== 1 || statementProductKeys[0] !== productKey) return null;

  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const paymentBase = systemCommissionPaymentBase(systemContract);
  if (!Number.isFinite(paymentBase) || paymentBase <= 0) return null;

  const coefficientRows = contract.rows.filter((row) => {
    const rowProductKey = resolveStatementProduct(row.product).productKey;
    const code = normalizeText(row.type).toUpperCase().replace(/\s+/g, "");
    return (
      rowProductKey === productKey &&
      row.base > 0 &&
      row.commission > 0 &&
      (/^A\d+/.test(code) || /^AC\d+/.test(code) || isAutoSubsequentCommissionCode(code))
    );
  });
  if (coefficientRows.length === 0) return null;

  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const currentSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  if (!currentSet) return null;
  const mode = normalizeCommissionModeValue(systemContract.commissionMode);
  const frequencyRaw = normalizePaymentFrequencyValue(systemContract.frequencyRaw);
  const rawDurationYears =
    typeof systemContract.durationYears === "number" &&
    Number.isFinite(systemContract.durationYears)
      ? systemContract.durationYears
      : null;

  const matches = candidateCoefficientSetsForProduct(productKey).filter((set) =>
    coefficientRows.every((row) => {
      const result = calculateResultForCoefficientSet({
        productKey,
        amount: row.base,
        frequencyRaw,
        position,
        commissionMode: mode,
        signedDateIso,
        coefficientSet: set,
        durationYears: rawDurationYears,
      });
      if (!result) return false;
      const comparableResult = applyTipContractAdjustmentToCommissionResult({
        product: productKey,
        items: result.items,
        total: result.total,
        tipsterPercent: systemContract.tipContractTipsterPercent,
      });
      const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
        product: productKey,
        contractSignedDateIso: signedDateIso,
        coefficientSetOverride: set,
      });
      const expected =
        autoSubsequentExpectedAmountForRow(
          productKey,
          position,
          coefficientSignedDateIso,
          row
        ) ??
        expectedAutoAmountFromItems(
          comparableResult.items,
          row.type,
          row.commission,
          frequencyRaw
        );
      return Math.abs(row.commission - expected) <= COMMISSION_AMOUNT_TOLERANCE;
    })
  );

  if (matches.length !== 1) return null;
  const coefficientSet = matches[0];
  if (coefficientSet === currentSet) return null;

  const result = calculateResultForCoefficientSet({
    productKey,
    amount: paymentBase,
    frequencyRaw,
    position,
    commissionMode: mode,
    signedDateIso,
    coefficientSet,
    durationYears: rawDurationYears,
  });
  if (!result) return null;
  const comparableResult = applyTipContractAdjustmentToCommissionResult({
    product: productKey,
    items: result.items,
    total: result.total,
    tipsterPercent: systemContract.tipContractTipsterPercent,
  });

  return {
    coefficientSet,
    currentSet,
    items: comparableResult.items,
    total: comparableResult.total,
  };
};

const annualPremiumBaseMismatch = (
  statementAnnualPremium: number,
  systemContract: MatchedSystemContract | null
): AnnualPremiumBaseMismatch | null => {
  const systemMonthlyPremium = systemCommissionMonthlyBase(systemContract);
  if (
    statementAnnualPremium <= 0 ||
    !Number.isFinite(systemMonthlyPremium) ||
    systemMonthlyPremium <= 0
  ) {
    return null;
  }

  const systemAnnualPremium = systemMonthlyPremium * 12;
  const difference = statementAnnualPremium - systemAnnualPremium;
  if (Math.abs(difference) <= ANNUAL_PREMIUM_TOLERANCE) return null;
  const explainedByEndorsement = matchingEndorsementPremiumChange(
    statementAnnualPremium,
    systemContract
  );

  return {
    statementAnnualPremium,
    systemAnnualPremium,
    systemMonthlyPremium,
    difference,
    explainedByEndorsement,
  };
};

const premiumBaseComparisonForAnnualStatementBase = ({
  key,
  label,
  statementAnnualPremium,
  systemContract,
  systemMonthlyPremiumOverride,
}: {
  key: string;
  label: string;
  statementAnnualPremium: number;
  systemContract: MatchedSystemContract | null;
  systemMonthlyPremiumOverride?: number | null;
}): PremiumBaseComparison | null => {
  const comparison = premiumBaseComparison(
    statementAnnualPremium,
    systemContract,
    "annual",
    systemMonthlyPremiumOverride
  );
  if (!comparison) return null;

  return {
    ...comparison,
    key,
    label,
    canBeAnniversaryPremiumChange: false,
    firstAnniversaryDate: null,
    anniversaryDate: null,
    referenceDate: null,
  };
};

const premiumBaseComparison = (
  statementPremiumBase: number,
  systemContract: MatchedSystemContract | null,
  statementBasePeriod: "annual" | "payment" = "annual",
  systemPaymentAmountOverride?: number | null
): PremiumBaseMismatch | null => {
  const override = Number(systemPaymentAmountOverride);
  const systemPaymentAmount =
    Number.isFinite(override) && override > 0
      ? override
      : systemCommissionMonthlyBase(systemContract);
  if (
    statementPremiumBase <= 0 ||
    !Number.isFinite(systemPaymentAmount) ||
    systemPaymentAmount <= 0
  ) {
    return null;
  }

  const systemPaymentFrequency = normalizeText(systemContract?.frequencyRaw).toLowerCase();
  const paymentsPerYear = paymentsPerYearForFrequency(systemPaymentFrequency);
  const systemPremiumBase = systemPaymentAmount;
  const statementPaymentBase =
    statementBasePeriod === "annual"
      ? statementPremiumBase / paymentsPerYear
      : statementPremiumBase;
  const statementAnnualPremiumBase =
    statementBasePeriod === "annual"
      ? statementPremiumBase
      : statementPremiumBase * paymentsPerYear;
  const systemAnnualPremiumBase = systemPaymentAmount * paymentsPerYear;
  const difference = statementPaymentBase - systemPremiumBase;
  const annualDifference = statementAnnualPremiumBase - systemAnnualPremiumBase;

  return {
    statementPremiumBase,
    statementPaymentBase,
    statementBasePeriod,
    systemPremiumBase,
    systemPaymentAmount,
    systemPaymentFrequency,
    paymentsPerYear,
    statementAnnualPremiumBase,
    systemAnnualPremiumBase,
    difference,
    annualDifference,
  };
};

const autoPremiumBaseForMismatch = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): { base: number; period: "annual" | "payment" } | null => {
  const rowsWithBase = contract.rows.filter((row) => row.base > 0);
  const systemPaymentAmount = systemCurrentPremiumPaymentBase(systemContract);

  const subsequentRow = rowsWithBase.find(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "subsequent"
  );
  if (subsequentRow) {
    return {
      base: subsequentRow.base,
      period: resolveStatementPremiumBasePeriod({
        product: subsequentRow.product,
        statementBase: subsequentRow.base,
        systemPaymentBase: systemPaymentAmount,
        systemFrequency: systemContract?.frequencyRaw,
        fallbackPeriod: "payment",
      }),
    };
  }

  const closingRow = rowsWithBase.find(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "closing"
  );
  if (closingRow) {
    return {
      base: closingRow.base,
      period: resolveStatementPremiumBasePeriod({
        product: closingRow.product,
        statementBase: closingRow.base,
        systemPaymentBase: systemPaymentAmount,
        systemFrequency: systemContract?.frequencyRaw,
        fallbackPeriod: "annual",
      }),
    };
  }

  return null;
};

const otherProductPremiumBaseForComparison = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): { base: number; period: "annual" | "payment" } | null => {
  const rowsWithBase = contract.rows.filter((row) => row.base > 0);
  if (rowsWithBase.length === 0) return null;

  const annualBaseRow = rowsWithBase.find(
    (row) => resolveStatementProduct(row.product).usesAnnualPremiumBase
  );
  if (annualBaseRow) return { base: annualBaseRow.base, period: "annual" };

  const prioritizedRow =
    rowsWithBase.find((row) => {
      const kind = classifyGeneralCommissionCode(row.product, row.type).kind;
      return kind === "closing" || kind === "installment" || kind === "subsequent";
    }) ?? rowsWithBase[0];

  return prioritizedRow
    ? {
        base: prioritizedRow.base,
        period: resolveStatementPremiumBasePeriod({
          product: prioritizedRow.product,
          statementBase: prioritizedRow.base,
          systemPaymentBase: systemCommissionPaymentBase(systemContract),
          systemFrequency: systemContract?.frequencyRaw,
          fallbackPeriod: "payment",
        }),
      }
    : null;
};

const otherProductPremiumBaseComparisonForContract = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): PremiumBaseComparison | null => {
  if (contractHasProductCategory(contract, "auto")) {
    return autoPremiumBaseComparisonForContract(contract, systemContract, statementPeriod);
  }
  if (
    contract.rows.some((row) => usesIndependentStatementCommissionBase(row.product))
  ) {
    return null;
  }

  const statementBase = otherProductPremiumBaseForComparison(contract, systemContract);
  if (!statementBase) return null;

  const comparison = premiumBaseComparison(
    statementBase.base,
    systemContract,
    statementBase.period,
    statementBase.period === "payment" ? systemCommissionPaymentBase(systemContract) : null
  );
  if (!comparison) return null;

  return {
    ...comparison,
    key: "other-premium-base",
    label: "Základna pojistného",
    canBeAnniversaryPremiumChange: false,
    firstAnniversaryDate: null,
    anniversaryDate: null,
    referenceDate: null,
  };
};

const autoPremiumReferenceDate = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): Date | null =>
  parsePeriodEndDate(statementPeriod) ??
  parseLocalDate(contract.validFrom) ??
  parseLocalDate(contract.signedAt) ??
  parseLocalDate(systemContract?.policyStartDate) ??
  parseLocalDate(systemContract?.contractSignedDate);

const autoCurrentPremiumBaseReference = (
  systemContract: MatchedSystemContract | null
): AutoPremiumBaseReference | null => {
  const systemPaymentAmount = systemCurrentPremiumPaymentBase(systemContract);
  if (!Number.isFinite(systemPaymentAmount) || systemPaymentAmount <= 0) return null;

  const paymentFrequency = normalizeText(systemContract?.frequencyRaw).toLowerCase();
  const paymentsPerYear = paymentsPerYearForFrequency(paymentFrequency);
  return {
    annualPremiumBase: systemPaymentAmount * paymentsPerYear,
    paymentPremiumBase: systemPaymentAmount,
    paymentsPerYear,
    paymentFrequency,
    referenceDate: null,
    source: "current",
  };
};

const autoPremiumHistoryEntryDate = (
  entry: PremiumStatementHistoryEntry,
  systemContract: MatchedSystemContract | null
): Date | null =>
  parseLocalDate(entry.anniversaryDate) ??
  parseLocalDate(entry.validFrom) ??
  parsePeriodEndDate(entry.statementPeriod) ??
  parseLocalDate(systemContract?.policyStartDate) ??
  parseLocalDate(systemContract?.contractSignedDate);

const autoPremiumHistoryPoints = (
  systemContract: MatchedSystemContract | null
): Array<{ annualPremiumBase: number; date: Date | null; order: number }> => {
  const entries = systemContract?.premiumStatementHistory ?? [];
  if (entries.length === 0) return [];

  const points: Array<{ annualPremiumBase: number; date: Date | null; order: number }> = [];
  const policyStartDate =
    parseLocalDate(systemContract?.policyStartDate) ??
    parseLocalDate(systemContract?.contractSignedDate);

  entries.forEach((entry, index) => {
    const kind = entry.premiumKind ?? "auto_change";
    if (kind !== "auto_initial") return;
    const annualPremiumBase =
      validPositiveMoney(entry.newAnnualPremium) ??
      validPositiveMoney(entry.newPremium) ??
      validPositiveMoney(entry.previousAnnualPremium) ??
      validPositiveMoney(entry.previousPremium);
    if (!annualPremiumBase) return;
    points.push({
      annualPremiumBase,
      date: autoPremiumHistoryEntryDate(entry, systemContract) ?? policyStartDate,
      order: index,
    });
  });

  const changes = entries
    .map((entry, index) => {
      const kind = entry.premiumKind ?? "auto_change";
      if (kind !== "auto_change") return null;
      return {
        entry,
        index,
        date: autoPremiumHistoryEntryDate(entry, systemContract),
        previousPremium:
          validPositiveMoney(entry.previousAnnualPremium) ?? validPositiveMoney(entry.previousPremium),
        newPremium:
          validPositiveMoney(entry.newAnnualPremium) ?? validPositiveMoney(entry.newPremium),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      const left = a.date?.getTime() ?? Number.POSITIVE_INFINITY;
      const right = b.date?.getTime() ?? Number.POSITIVE_INFINITY;
      return left - right || a.index - b.index;
    });

  if (
    !points.some((point) => point.annualPremiumBase > 0) &&
    changes[0]?.previousPremium
  ) {
    points.push({
      annualPremiumBase: changes[0].previousPremium,
      date: policyStartDate ?? changes[0].date,
      order: -1,
    });
  }

  changes.forEach(({ date, index, newPremium }) => {
    if (!newPremium) return;
    points.push({
      annualPremiumBase: newPremium,
      date,
      order: index,
    });
  });

  return points.sort((a, b) => {
    const left = a.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    const right = b.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    return left - right || a.order - b.order;
  });
};

const autoPremiumBaseReferenceForStatement = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): AutoPremiumBaseReference | null => {
  const current = autoCurrentPremiumBaseReference(systemContract);
  const paymentsPerYear =
    current?.paymentsPerYear ?? paymentsPerYearForFrequency(systemContract?.frequencyRaw);
  const paymentFrequency =
    current?.paymentFrequency ?? normalizeText(systemContract?.frequencyRaw).toLowerCase();
  const referenceDate = autoPremiumReferenceDate(contract, systemContract, statementPeriod);
  const referenceTime = referenceDate?.getTime() ?? null;
  const historyPoints = autoPremiumHistoryPoints(systemContract);

  if (historyPoints.length > 0) {
    let activePoint: (typeof historyPoints)[number] | null = null;
    if (referenceTime !== null) {
      for (const point of historyPoints) {
        const pointTime = point.date?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (pointTime <= referenceTime) {
          activePoint = point;
        }
      }
      activePoint ??= historyPoints[0];
    } else {
      activePoint = historyPoints.at(-1) ?? null;
    }

    if (activePoint?.annualPremiumBase) {
      return {
        annualPremiumBase: activePoint.annualPremiumBase,
        paymentPremiumBase: activePoint.annualPremiumBase / paymentsPerYear,
        paymentsPerYear,
        paymentFrequency,
        referenceDate,
        source: "history",
      };
    }
  }

  return current ? { ...current, referenceDate } : null;
};

const scaleAutoExpectedAmountForPremiumReference = (
  amount: number,
  systemContract: MatchedSystemContract,
  premiumReference: AutoPremiumBaseReference | null
): number => {
  if (!Number.isFinite(amount) || amount <= 0 || !premiumReference) return amount;
  const current = autoCurrentPremiumBaseReference(systemContract);
  if (!current || current.annualPremiumBase <= 0) return amount;
  const ratio = premiumReference.annualPremiumBase / current.annualPremiumBase;
  if (!Number.isFinite(ratio) || ratio <= 0) return amount;
  if (Math.abs(ratio - 1) <= 0.0001) return amount;
  return amount * ratio;
};

const autoPremiumBaseMismatchForContract = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): PremiumBaseMismatch | null => {
  const comparison = autoPremiumBaseComparisonForContract(
    contract,
    systemContract,
    statementPeriod
  );
  if (!comparison) return null;
  return Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
    ? null
    : comparison;
};

const autoPremiumBaseComparisonForContract = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): PremiumBaseComparison | null => {
  const statementBase = autoPremiumBaseForMismatch(contract, systemContract);
  const premiumReference = autoPremiumBaseReferenceForStatement(
    contract,
    systemContract,
    statementPeriod
  );
  const comparison = statementBase
    ? premiumBaseComparison(
        statementBase.base,
        systemContract,
        statementBase.period,
        premiumReference?.paymentPremiumBase
      )
    : null;
  if (!comparison) return null;

  return {
    ...comparison,
    key: "auto-premium-base",
    label: "Základna pojistného",
    // Změna pojistného u aut je běžná změna smlouvy, nikoliv nesrovnalost.
    // Datum výročí dál uchováváme pro informaci v kartě, ale nerozhoduje o stavu.
    canBeAnniversaryPremiumChange: true,
    firstAnniversaryDate: autoFirstAnniversaryDate(contract, systemContract),
    anniversaryDate:
      autoPremiumAnniversaryWindowForStatement(contract, systemContract, statementPeriod)
        ?.anniversaryDate ?? null,
    referenceDate: autoPremiumChangeStatementDate(statementPeriod),
  };
};

const autoStatementPremiumBaseText = (mismatch: PremiumBaseMismatch): string =>
  mismatch.statementBasePeriod === "annual"
    ? `roční základnou ${formatWholeMoney(mismatch.statementPremiumBase)} Kč`
    : `základnou ${formatWholeMoney(mismatch.statementPremiumBase)} Kč za platbu (${formatWholeMoney(mismatch.statementAnnualPremiumBase)} Kč ročně)`;

const autoStatementPremiumBaseDetail = (mismatch: PremiumBaseMismatch): string =>
  mismatch.statementBasePeriod === "annual"
    ? `Výpisová roční základna: ${formatWholeMoney(mismatch.statementPremiumBase)} Kč`
    : `Výpisová základna za platbu: ${formatWholeMoney(mismatch.statementPremiumBase)} Kč (${formatWholeMoney(mismatch.statementAnnualPremiumBase)} Kč ročně)`;

const hasSubsequentAutoCommissionRow = (contract: OtherProductContractPreview): boolean =>
  contract.rows.some(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "subsequent"
  );

const autoPolicyStartDate = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): Date | null => {
  return parseLocalDate(contract.validFrom) ?? parseLocalDate(systemContract?.policyStartDate);
};

const autoFirstAnniversaryDate = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): Date | null => {
  const policyStartDate = autoPolicyStartDate(contract, systemContract);
  return policyStartDate ? addYearsToLocalDate(policyStartDate, 1) : null;
};

const autoPremiumChangeStatementDate = (statementPeriod?: string | null): Date | null =>
  parsePeriodEndDate(statementPeriod);

const autoPremiumAnniversaryWindowForStatement = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
  fallbackReferenceDate?: Date | null
): AutoPremiumAnniversaryWindow | null => {
  const policyStartDate = autoPolicyStartDate(contract, systemContract);
  const referenceDate = autoPremiumChangeStatementDate(statementPeriod) ?? fallbackReferenceDate ?? null;
  if (!policyStartDate || !referenceDate) return null;

  const firstAnniversaryDate = addYearsToLocalDate(policyStartDate, 1);
  const referenceTime = referenceDate.getTime();
  for (let yearOffset = 1; yearOffset <= 80; yearOffset += 1) {
    const anniversaryDate = addYearsToLocalDate(policyStartDate, yearOffset);
    const windowStart = addMonthsToLocalDate(
      anniversaryDate,
      -AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS
    );
    const windowEnd = addMonthsToLocalDate(
      anniversaryDate,
      AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS
    );
    if (referenceTime >= windowStart.getTime() && referenceTime <= windowEnd.getTime()) {
      return {
        anniversaryNumber: yearOffset,
        anniversaryDate,
        windowStart,
        windowEnd,
        referenceDate,
        firstAnniversaryDate,
      };
    }
    if (referenceTime < windowStart.getTime()) return null;
  }
  return null;
};

const hasAutoPremiumAnniversaryDates = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
  fallbackReferenceDate?: Date | null
): boolean =>
  Boolean(
    autoPolicyStartDate(contract, systemContract) &&
      (autoPremiumChangeStatementDate(statementPeriod) ?? fallbackReferenceDate ?? null)
  );

const isAutoInAnniversaryPremiumWindow = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
  fallbackReferenceDate?: Date | null
): boolean => {
  if (autoPremiumAnniversaryWindowForStatement(
    contract,
    systemContract,
    statementPeriod,
    fallbackReferenceDate
  )) {
    return true;
  }
  if (hasAutoPremiumAnniversaryDates(contract, systemContract, statementPeriod, fallbackReferenceDate)) {
    return false;
  }
  return hasSubsequentAutoCommissionRow(contract);
};

const moneyNearlyEqual = (
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance = ANNUAL_PREMIUM_TOLERANCE
): boolean => {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
};

const validPositiveMoney = (value: number | null | undefined): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const storedAutoPremiumChangeInfo = (
  mismatch: PremiumBaseMismatch,
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): AutoPremiumChangeInfo | null => {
  const history = (systemContract?.premiumStatementHistory ?? [])
    .filter((entry) => (entry.premiumKind ?? "auto_change") === "auto_change")
    .map((entry) => ({
      entry,
      previousPremium: validPositiveMoney(entry.previousPremium),
      newPremium: validPositiveMoney(entry.newPremium),
      referenceDate:
        parseLocalDate(entry.anniversaryDate) ??
        parsePeriodEndDate(entry.statementPeriod) ??
        parseLocalDate(entry.validFrom),
    }))
    .filter((entry) => entry.previousPremium != null || entry.newPremium != null)
    .sort((a, b) => {
      const left = a.referenceDate?.getTime() ?? 0;
      const right = b.referenceDate?.getTime() ?? 0;
      return left - right;
    });
  if (history.length === 0) return null;

  const statementBase = mismatch.statementAnnualPremiumBase;
  const systemBase = mismatch.systemAnnualPremiumBase;
  const directMatch = history.find(
    ({ previousPremium, newPremium }) =>
      (moneyNearlyEqual(previousPremium, statementBase) &&
        moneyNearlyEqual(newPremium, systemBase)) ||
      (moneyNearlyEqual(newPremium, statementBase) &&
        moneyNearlyEqual(previousPremium, systemBase))
  );
  const statementBaseKnown = history.some(
    ({ previousPremium, newPremium }) =>
      moneyNearlyEqual(previousPremium, statementBase) ||
      moneyNearlyEqual(newPremium, statementBase)
  );
  const systemBaseKnown = history.some(
    ({ previousPremium, newPremium }) =>
      moneyNearlyEqual(previousPremium, systemBase) ||
      moneyNearlyEqual(newPremium, systemBase)
  );
  if (!directMatch && (!statementBaseKnown || !systemBaseKnown)) return null;

  const reference = directMatch ?? history[history.length - 1];
  const anniversaryWindow = autoPremiumAnniversaryWindowForStatement(
    contract,
    systemContract,
    statementPeriod,
    reference.referenceDate
  );
  if (
    !anniversaryWindow &&
    !isAutoInAnniversaryPremiumWindow(
      contract,
      systemContract,
      statementPeriod,
      reference.referenceDate
    )
  ) {
    return null;
  }

  return {
    ...mismatch,
    direction: systemBase > statementBase ? "increase" : "decrease",
    referenceDate: reference.referenceDate ?? anniversaryWindow?.referenceDate ?? null,
    firstAnniversaryDate: autoFirstAnniversaryDate(contract, systemContract),
    anniversaryDate:
      anniversaryWindow?.anniversaryDate ??
      reference.referenceDate ??
      autoFirstAnniversaryDate(contract, systemContract),
    source: "stored_history",
  };
};

const autoPremiumChangeInfo = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): AutoPremiumChangeInfo | null => {
  if (!contractHasProductCategory(contract, "auto")) return null;
  const mismatch = autoPremiumBaseMismatchForContract(
    contract,
    systemContract,
    statementPeriod
  );
  if (!mismatch || Math.abs(mismatch.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) return null;
  const anniversaryWindow = autoPremiumAnniversaryWindowForStatement(
    contract,
    systemContract,
    statementPeriod
  );
  const storedChange = storedAutoPremiumChangeInfo(
    mismatch,
    contract,
    systemContract,
    statementPeriod
  );
  if (storedChange) return storedChange;
  return {
    ...mismatch,
    direction: mismatch.annualDifference > 0 ? "increase" : "decrease",
    referenceDate: anniversaryWindow?.referenceDate ?? parsePeriodEndDate(statementPeriod),
    firstAnniversaryDate: autoFirstAnniversaryDate(contract, systemContract),
    anniversaryDate:
      anniversaryWindow?.anniversaryDate ?? autoFirstAnniversaryDate(contract, systemContract),
    source: "statement_period",
  };
};

const isAmountComparisonExplainedByAutoPremiumChange = (
  comparison: CommissionAmountComparison,
  premiumChange: AutoPremiumChangeInfo | null
): boolean =>
  Boolean(
    premiumChange &&
      comparison.status === "diff" &&
      ((premiumChange.annualDifference > COMMISSION_AMOUNT_TOLERANCE &&
        comparison.difference > COMMISSION_AMOUNT_TOLERANCE) ||
        (premiumChange.annualDifference < -COMMISSION_AMOUNT_TOLERANCE &&
          comparison.difference < -COMMISSION_AMOUNT_TOLERANCE))
  );

const lifeSplitContractTotal = (contract: LifeSplitContractPreview): number =>
  sumRows(contract.rows) + sumPayments(contract.b36Payments);

const otherProductContractTotal = (contract: OtherProductContractPreview): number =>
  sumRows(contract.rows) + sumPayments(contract.b36Payments);

const lifeSplitContractUncertaintyCount = (
  contract: LifeSplitContractPreview,
  matchesByContractNumber: ContractMatchesByNumber,
  statementPeriod?: string | null,
  statementKey?: string,
  correctionContext?: StatementCorrectionContext
): number => {
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : {
          ...contract,
          rows: reviewRows,
          annualPremium: reviewRows.find((row) => row.base > 0)?.base ?? contract.annualPremium,
        };
  if (reviewRows.length === 0 && contract.b36Payments.length === 0) return 0;

  const tipOnlyContract = lifeSplitContractHasOnlyTipRows(reviewContract);
  const matchScope = lifeSplitContractMatchScope(reviewContract);
  const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
  const systemContract = matchedSystemContractForLifeSplit(reviewContract, match);
  const expectedProductKey = resolveStatementProduct(reviewContract.productCode).productKey;
  let count = 0;

  if (isUnpairedContractMatch(match)) count += 1;
  if (hasProductMismatch(expectedProductKey, systemContract)) count += 1;
  if (systemContract && !tipOnlyContract) {
    count += statementCareerIssueCount(reviewContract.rows, systemContractPositionRaw(systemContract));
    if (systemContractTimelinePositionMismatch(systemContract)) count += 1;
  }
  const annualPremiumMismatch = tipOnlyContract
    ? null
    : annualPremiumBaseMismatch(reviewContract.annualPremium, systemContract);
  const hasLifePremiumIncrease = rowsByKind(reviewContract, "increase").length > 0;
  if (
    annualPremiumMismatch &&
    !annualPremiumMismatch.explainedByEndorsement &&
    !hasLifePremiumIncrease
  ) {
    count += 1;
  }
  if (systemContract) {
    count += buildLifeSplitAmountComparisons(reviewContract, systemContract, statementPeriod).filter(
      (comparison) => comparison.status !== "ok"
    ).length;
  }
  if (
    !tipOnlyContract &&
    missingAcceleratedB36Warning(reviewContract.rows, contract.b36Payments, systemContract)
  ) {
    count += 1;
  }
  if (rowsByKind(reviewContract, "unknown").length > 0) count += 1;

  return count;
};

const otherProductContractUncertaintyCount = (
  contract: OtherProductContractPreview,
  matchesByContractNumber: ContractMatchesByNumber,
  statementPeriod?: string | null,
  statementKey?: string,
  correctionContext?: StatementCorrectionContext
): number => {
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : { ...contract, rows: reviewRows };
  if (reviewRows.length === 0 && contract.b36Payments.length === 0) return 0;

  const tipOnlyContract = otherProductContractHasOnlyTipRows(reviewContract);
  const matchScope = otherProductContractMatchScope(reviewContract);
  const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
  const systemContract = matchedSystemContract(match);
  const productMetas = uniqueProductMetasForRows(reviewContract.rows);
  const expectedProductKey =
    productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;
  let count = 0;

  if (isUnpairedContractMatch(match)) count += 1;
  if (hasProductMismatch(expectedProductKey, systemContract)) count += 1;
  if (systemContract && !tipOnlyContract) {
    count += statementCareerIssueCount(reviewContract.rows, systemContractPositionRaw(systemContract));
    if (systemContractTimelinePositionMismatch(systemContract)) count += 1;
  }
  const explainedAutoPremiumChange = autoPremiumChangeInfo(
    reviewContract,
    systemContract,
    statementPeriod
  );
  const autoPremiumMismatch =
    !tipOnlyContract && contractHasProductCategory(reviewContract, "auto") && !explainedAutoPremiumChange
      ? autoPremiumBaseMismatchForContract(reviewContract, systemContract, statementPeriod)
      : null;
  if (autoPremiumMismatch) {
    count += 1;
  }
  if (systemContract) {
    count += buildOtherProductAmountComparisons(reviewContract, systemContract, statementPeriod).filter(
      (comparison) =>
        comparison.status !== "ok" &&
        !isAmountComparisonExplainedByAutoPremiumChange(
          comparison,
          explainedAutoPremiumChange
        )
    ).length;
  }
  if (
    !tipOnlyContract &&
    missingAcceleratedB36Warning(reviewContract.rows, contract.b36Payments, systemContract)
  ) {
    count += 1;
  }
  if (
    reviewContract.rows.some(
      (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
    )
  ) {
    count += 1;
  }

  return count;
};

const isTotalCommissionItem = (item: CommissionResultItemDTO): boolean =>
  ["celkem", "celkova provize"].includes(normalizeCommissionTitle(item.title));

const expectedAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  matcher: (title: string) => boolean
): number =>
  (items ?? [])
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => matcher(normalizeCommissionTitle(item.title)))
    .reduce((sum, item) => sum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0), 0);

const expectedClosestAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  statementAmount: number,
  matcher: (title: string) => boolean
): number => {
  const candidates = (items ?? [])
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => matcher(normalizeCommissionTitle(item.title)))
    .map((item) => Number(item.amount))
    .filter((amount) => Number.isFinite(amount));

  if (candidates.length === 0) return 0;
  const summed = candidates.reduce((sum, amount) => sum + amount, 0);
  const options = candidates.length > 1 ? [...candidates, summed] : candidates;

  return options.reduce((best, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(best - statementAmount) ? amount : best
  );
};

const paymentPeriodsPerYear = (frequency: string | null | undefined): number => {
  const normalized = normalizeCommissionTitle(frequency);
  if (normalized === "monthly" || normalized.includes("mesic")) return 12;
  if (normalized === "quarterly" || normalized.includes("ctvrt")) return 4;
  if (normalized === "semiannual" || normalized.includes("pololet")) return 2;
  return 1;
};

const closestAmount = (amounts: number[], statementAmount: number): number => {
  const candidates = amounts.filter((amount) => Number.isFinite(amount));
  if (candidates.length === 0) return 0;
  return candidates.reduce((best, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(best - statementAmount) ? amount : best
  );
};

const expectedAutoPerPaymentAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  statementAmount: number,
  frequency: string | null | undefined
): number => {
  const periods = paymentPeriodsPerYear(frequency);
  const candidates = (items ?? []).flatMap((item) => {
    if (isTotalCommissionItem(item)) return [];
    const title = normalizeCommissionTitle(item.title);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) return [];

    const isImmediate =
      title.includes("okamzita") ||
      title.includes("ziskatelska") ||
      title.includes("uzavreni");
    const isAnnual =
      title.includes("provize za rok") ||
      title.includes("celkem za rok") ||
      title.includes("za rok");
    if (!isImmediate && !isAnnual) return [];

    return periods > 1 ? [amount, amount / periods] : [amount];
  });

  return closestAmount(candidates, statementAmount);
};

const expectedAutoAmountForStatementRowBase = (
  row: CommissionRow,
  systemContract: MatchedSystemContract
): number | null => {
  const rowBase = Number(row.base);
  if (!Number.isFinite(rowBase) || rowBase <= 0) return null;

  const productKey =
    resolveStatementProduct(row.product).productKey ?? systemContract.productKey ?? null;
  if (!productKey || !isAutoProduct(productKey)) return null;

  const position = systemContractPosition(systemContract);
  if (!position) return null;

  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const coefficientSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  if (!coefficientSet) return null;

  const frequencyRaw = normalizePaymentFrequencyValue(systemContract.frequencyRaw);
  const commissionMode = normalizeCommissionModeValue(systemContract.commissionMode);
  const durationYears =
    typeof systemContract.durationYears === "number" &&
    Number.isFinite(systemContract.durationYears)
      ? systemContract.durationYears
      : null;
  const result = calculateResultForCoefficientSet({
    productKey,
    amount: rowBase,
    frequencyRaw,
    position,
    commissionMode,
    signedDateIso,
    coefficientSet,
    durationYears,
  });
  if (!result) return null;
  const comparableResult = applyTipContractAdjustmentToCommissionResult({
    product: productKey,
    items: result.items,
    total: result.total,
    tipsterPercent: systemContract.tipContractTipsterPercent,
  });

  const expected = expectedAutoAmountFromItems(
    comparableResult.items,
    row.type,
    row.commission,
    frequencyRaw
  );
  return expected > COMMISSION_AMOUNT_TOLERANCE ? expected : null;
};

const expectedAutoAmountForStatementRowBases = (
  rows: CommissionRow[],
  systemContract: MatchedSystemContract
): number | null => {
  let hasExpected = false;
  const total = rows.reduce((sum, row) => {
    const expected = expectedAutoAmountForStatementRowBase(row, systemContract);
    if (expected == null) return sum;
    hasExpected = true;
    return sum + expected;
  }, 0);

  return hasExpected ? total : null;
};

const comparisonStatus = (
  statementAmount: number,
  expectedAmount: number,
  tolerance = COMMISSION_AMOUNT_TOLERANCE
): CommissionAmountComparisonStatus => {
  const difference = statementAmount - expectedAmount;
  if (Math.abs(difference) <= tolerance) return "ok";
  if (statementAmount <= tolerance && expectedAmount > tolerance) {
    return "missing_statement";
  }
  if (expectedAmount <= tolerance && statementAmount > tolerance) {
    return "missing_expected";
  }
  return "diff";
};

type SubsequentPayoutBundleInfo = {
  periods: number;
  expectedAmount: number;
  difference: number;
  detailLines: string[];
};

const payoutMonthKeyFromRecord = (
  payout: ContractCommissionPayoutRecord
): string | null => {
  const explicit = normalizeText(payout.payoutMonthKey);
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;

  return (
    monthKeyFromDate(parsePeriodEndDate(payout.statementPeriod)) ??
    monthKeyFromDate(parseLocalDate(payout.statementDate)) ??
    monthKeyFromDate(parseLocalDate(payout.statementChronologyMs))
  );
};

const payoutRecordMatchesStatementRows = (
  payout: ContractCommissionPayoutRecord,
  rows: CommissionRow[]
): boolean => {
  const payoutCode = normalizeStatementCommissionCode(payout.code);
  if (!payoutCode || rows.length === 0) return false;

  const rowCodes = rows.map((row) => normalizeStatementCommissionCode(row.type));
  if (rowCodes.includes(payoutCode)) return true;

  const allLifeSubsequent = rows.every(
    (row) => classifyLifeSplitCommissionCode(row.type).kind === "subsequent"
  );
  if (allLifeSubsequent && /^B10[1-4]$/.test(payoutCode)) return true;

  return false;
};

const paidPayoutRecordsForRows = (
  systemContract: MatchedSystemContract,
  rows: CommissionRow[]
): ContractCommissionPayoutRecord[] =>
  (systemContract.commissionPayouts ?? []).filter((payout) => {
    const amount = Number(payout.amount);
    return (
      Number.isFinite(amount) &&
      amount > COMMISSION_AMOUNT_TOLERANCE &&
      payout.status !== "storno" &&
      payoutRecordMatchesStatementRows(payout, rows)
    );
  });

const currentRowsLookLikeRepeatedPayout = (
  rows: CommissionRow[],
  expectedPerPeriod: number
): boolean => {
  if (rows.length < 2 || expectedPerPeriod <= COMMISSION_AMOUNT_TOLERANCE) return false;
  const codes = new Set(rows.map((row) => normalizeStatementCommissionCode(row.type)));
  if (codes.size > 1) return false;
  return rows.every(
    (row) => Math.abs(row.commission - expectedPerPeriod) <= COMMISSION_AMOUNT_TOLERANCE
  );
};

const subsequentPayoutBundleInfo = ({
  rows,
  statementAmount,
  expectedPerPeriod,
  systemContract,
  statementPeriod,
}: {
  rows: CommissionRow[];
  statementAmount: number;
  expectedPerPeriod: number;
  systemContract: MatchedSystemContract;
  statementPeriod?: string | null;
}): SubsequentPayoutBundleInfo | null => {
  if (rows.length < 2) return null;
  if (paymentsPerYearForFrequency(systemContract.frequencyRaw) !== 12) return null;
  if (!currentRowsLookLikeRepeatedPayout(rows, expectedPerPeriod)) return null;

  const currentMonthKey = monthKeyFromStatementPeriod(statementPeriod);
  const currentIndex = monthKeyIndex(currentMonthKey);
  if (currentMonthKey == null || currentIndex == null) return null;

  const payouts = paidPayoutRecordsForRows(systemContract, rows);
  const previousMonthKey = addMonthsToMonthKey(currentMonthKey, -1);
  const previousMonthWasPaid = payouts.some(
    (payout) => payoutMonthKeyFromRecord(payout) === previousMonthKey
  );
  if (previousMonthWasPaid) return null;

  const previousPaidIndexes = payouts
    .map((payout) => monthKeyIndex(payoutMonthKeyFromRecord(payout)))
    .filter((index): index is number => index != null && index < currentIndex)
    .sort((left, right) => left - right);

  const lastPaidIndex = previousPaidIndexes.at(-1);
  if (lastPaidIndex == null) return null;

  const periodsSinceLastPaid = currentIndex - lastPaidIndex;
  if (periodsSinceLastPaid !== rows.length) return null;

  const expectedAmount = Math.round(expectedPerPeriod * rows.length * 100) / 100;
  const difference = Math.round((statementAmount - expectedAmount) * 100) / 100;
  if (Math.abs(difference) > COMMISSION_AMOUNT_TOLERANCE) return null;

  const lastPaidMonthKey = monthKeyFromIndex(lastPaidIndex);
  return {
    periods: rows.length,
    expectedAmount,
    difference,
    detailLines: [
      `Výpis obsahuje ${rows.length} stejné následné provize.`,
      `Poslední zapsaná výplata byla ${formatMonthKey(lastPaidMonthKey)} a v ${formatMonthKey(previousMonthKey)} není zapsaná žádná stejná následná provize.`,
      `Beru to jako souhrnnou výplatu za ${rows.length} období, ne jako rozdíl.`,
    ],
  };
};

const buildLifeSplitAmountComparisons = (
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract,
  statementPeriod?: string | null
): CommissionAmountComparison[] => {
  if (isNeonRefreshMissingOriginalInSystem(systemContract)) return [];
  const coefficientOverride = lifeCoefficientOverrideInfo(contract, systemContract);
  const items = coefficientOverride?.items ?? systemContract.items ?? [];
  const tipRows = rowsByKind(contract, "tip");
  const tipStatementAmount = sumRows(tipRows);
  const a101Rows = rowsByKind(contract, "a101");
  const b0301Rows = rowsByKind(contract, "b0301");
  const b3601Rows = rowsByKind(contract, "b3601");
  const b4801Rows = rowsByKind(contract, "b4801");
  const increaseRows = rowsByKind(contract, "increase");
  const careRows = rowsByKind(contract, "care");
  const hasA101InStatement = a101Rows.length > 0;
  const hasB0301InStatement = b0301Rows.length > 0;
  const hasB0301InHistory = hasHistoricalB0301Payout(systemContract);
  const hasB36HalfInHistory = hasHistoricalB36HalfPayout(systemContract);
  const subsequentRows = rowsByKind(contract, "subsequent");
  const subsequentStatementAmount = sumRows(subsequentRows);
  const subsequentExpectedPerPeriod = expectedAmountFromItems(
    items,
    (title) =>
      title.includes("nasledna") &&
      (title.includes("2 5") || title.includes("2 5 rok"))
  );
  const subsequentBundleInfo = subsequentPayoutBundleInfo({
    rows: subsequentRows,
    statementAmount: subsequentStatementAmount,
    expectedPerPeriod: subsequentExpectedPerPeriod,
    systemContract,
    statementPeriod,
  });
  const expectedB36HalfAmount = expectedAmountFromItems(
    items,
    (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
  );
  const statementB36HalfAmount = b36StatementAmountForReview(
    contract.b36Payments,
    expectedB36HalfAmount
  );
  const hasB36HalfInStatement = b36PaidPaymentAmountsForComparison(contract.b36Payments).some(
    hasStatementAmountForComparison
  );
  const hasB36HalfDeductionInStatement = contract.b36Payments.some(
    (payment) => payment.isB36Half && hasStatementAmountForComparison(payment.amount)
  );
  const shouldReviewB36Half =
    hasB36HalfInStatement || hasB36HalfDeductionInStatement || !hasB36HalfInHistory;

  const statementParts = [
    {
      key: "tip",
      label: "ATP101",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(tipRows),
      statementAmount: tipStatementAmount,
      expectedAmount: tipExpectedAmountFromSystemContract(systemContract),
      detailLines: [
        "Očekávanou částku beru z TIP vazby na zdrojové smlouvě.",
      ],
    },
    {
      key: "a101",
      label: "A101",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(a101Rows),
      statementAmount: sumRows(a101Rows),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("a101")),
    },
    {
      key: "b0301",
      label: "B0301",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(b0301Rows),
      statementAmount: sumRows(b0301Rows),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("b0301")),
    },
    {
      key: "b36-half",
      label: b36HalfLabelForProduct(contract.productCode),
      requiredNow:
        shouldReviewB36Half &&
        hasA101InStatement &&
        (hasB0301InStatement || hasB0301InHistory),
      hasStatementRows: shouldReviewB36Half && hasPaymentsForAmountComparison(contract.b36Payments),
      statementAmount: shouldReviewB36Half ? statementB36HalfAmount : 0,
      expectedAmount: shouldReviewB36Half ? expectedB36HalfAmount : 0,
    },
    {
      key: "b3601",
      label: b36DeferredCodeForProduct(contract.productCode),
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(b3601Rows),
      statementAmount: sumRows(b3601Rows),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          !title.includes("50") &&
          (title.includes("b3601") || title.includes("b36") || title.includes("po 3 letech"))
      ),
    },
    {
      key: "b4801",
      label: "B4801",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(b4801Rows),
      statementAmount: sumRows(b4801Rows),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) => title.includes("b4801") || title.includes("b48") || title.includes("po 4 letech")
      ),
    },
    {
      key: "increase",
      label: "Navýšení",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(increaseRows),
      statementAmount: sumRows(increaseRows),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("navyseni")),
    },
    {
      key: "subsequent",
      label: subsequentBundleInfo
        ? `B101-B104 (${subsequentBundleInfo.periods} období)`
        : "B101-B104",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(subsequentRows),
      statementAmount: subsequentStatementAmount,
      expectedAmount: subsequentBundleInfo?.expectedAmount ?? subsequentExpectedPerPeriod,
      detailLines: subsequentBundleInfo?.detailLines,
    },
    {
      key: "care",
      label: "B201-B206",
      requiredNow: false,
      hasStatementRows: hasRowsForAmountComparison(careRows),
      statementAmount: sumRows(careRows),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          title.includes("pecovatelska") ||
          (title.includes("nasledna") && title.includes("5 10"))
      ),
    },
  ];

  return statementParts
    .filter(
      (part) =>
        part.hasStatementRows ||
        (part.requiredNow && part.expectedAmount > COMMISSION_AMOUNT_TOLERANCE)
    )
    .map((part) => ({
      ...part,
      difference: part.statementAmount - part.expectedAmount,
      status: comparisonStatus(part.statementAmount, part.expectedAmount),
    }));
};

const rowsByGeneralKinds = (
  contract: OtherProductContractPreview,
  kinds: GeneralCommissionKind[]
): CommissionRow[] =>
  contract.rows.filter((row) =>
    kinds.includes(classifyGeneralCommissionCode(row.product, row.type).kind)
  );

const expectedAmountFromIndependentStatementBase = (
  rows: CommissionRow[],
  systemContract: MatchedSystemContract,
  matcher: (title: string) => boolean
): number | null => {
  const position = systemContractPosition(systemContract);
  if (!position || rows.length === 0) return null;

  let hasExpectedAmount = false;
  const expectedAmount = rows.reduce((sum, row) => {
    if (!usesIndependentStatementCommissionBase(row.product)) return sum;
    const annualBase = Number(row.base);
    if (!Number.isFinite(annualBase) || annualBase <= 0) return sum;

    const result = calculatePillowMajetek(annualBase, "annual", position);
    const comparableResult = applyTipContractAdjustmentToCommissionResult({
      product: "pillowmajetek",
      items: result.items,
      total: result.total,
      tipsterPercent: systemContract.tipContractTipsterPercent,
    });
    const rowExpectedAmount = expectedClosestAmountFromItems(
      comparableResult.items,
      row.commission,
      matcher
    );
    hasExpectedAmount = true;
    return sum + rowExpectedAmount;
  }, 0);

  return hasExpectedAmount ? expectedAmount : null;
};

const otherProductContractHasOnlyTipRows = (contract: OtherProductContractPreview): boolean =>
  contract.rows.length > 0 &&
  contract.rows.some((row) => classifyGeneralCommissionCode(row.product, row.type).kind === "tip") &&
  contract.rows.every((row) => classifyGeneralCommissionCode(row.product, row.type).kind === "tip");

const otherProductContractMatchScope = (
  contract: OtherProductContractPreview
): ContractMatchScope => (otherProductContractHasOnlyTipRows(contract) ? "tip" : "my");

const buildOtherProductAmountComparisons = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract,
  statementPeriod?: string | null
): CommissionAmountComparison[] => {
  if (isUnsupportedSlaviaAutoStatementContract(contract, systemContract)) return [];

  if (otherProductContractHasOnlyTipRows(contract)) {
    const tipRows = rowsByGeneralKinds(contract, ["tip"]);
    const statementAmount = sumRows(tipRows);
    const expectedAmount = tipExpectedAmountFromSystemContract(systemContract);
    if (
      !hasRowsForAmountComparison(tipRows) &&
      expectedAmount <= COMMISSION_AMOUNT_TOLERANCE
    ) {
      return [];
    }
    return [
      {
        key: "tip",
        label: "ATP101",
        statementAmount,
        expectedAmount,
        difference: statementAmount - expectedAmount,
        status: comparisonStatus(statementAmount, expectedAmount),
        detailLines: [
          "Očekávanou částku beru z TIP vazby na zdrojové smlouvě.",
        ],
      },
    ];
  }

  const coefficientOverride = autoCoefficientOverrideInfo(contract, systemContract);
  const items = coefficientOverride?.items ?? systemContract.items ?? [];
  const isAutoContract = contractHasProductCategory(contract, "auto");

  if (isAutoContract) {
    const immediateRows = rowsByGeneralKinds(contract, ["closing", "installment"]);
    const immediateStatementAmount = sumRows(immediateRows);
    const subsequentRows = rowsByGeneralKinds(contract, ["subsequent"]);
    const subsequentStatementAmount = sumRows(subsequentRows);
    const premiumReference = autoPremiumBaseReferenceForStatement(
      contract,
      systemContract,
      statementPeriod
    );
    const immediateExpectedFromStatementBase = expectedAutoAmountForStatementRowBases(
      immediateRows,
      systemContract
    );
    const immediateExpectedAmount =
      immediateExpectedFromStatementBase ??
      scaleAutoExpectedAmountForPremiumReference(
        expectedAutoPerPaymentAmountFromItems(
          items,
          immediateStatementAmount,
          systemContract.frequencyRaw
        ),
        systemContract,
        premiumReference
      );
    const comparisons: CommissionAmountComparison[] =
      hasRowsForAmountComparison(immediateRows)
        ? [
            {
              key: "auto-immediate",
              label: "Okamžitá provize",
              statementAmount: immediateStatementAmount,
              expectedAmount: immediateExpectedAmount,
              difference: immediateStatementAmount - immediateExpectedAmount,
              status: comparisonStatus(immediateStatementAmount, immediateExpectedAmount),
            },
          ]
        : [];

    if (hasRowsForAmountComparison(subsequentRows)) {
      const productKey = systemContract.productKey;
      const expectedSubsequent =
        productKey && isAutoProduct(productKey)
          ? autoSubsequentExpectedAmountForRows(productKey, systemContract, subsequentRows)
          : null;
      const expectedFromStatementBase = expectedAutoAmountForStatementRowBases(
        subsequentRows,
        systemContract
      );
      const rowSummedExpectedAmount = expectedFromStatementBase ?? expectedSubsequent;
      const fallbackExpectedAmount = scaleAutoExpectedAmountForPremiumReference(
        expectedClosestAmountFromItems(
          items,
          subsequentStatementAmount,
          (title) =>
            title.includes("nasledna") ||
            title.includes("provize za rok") ||
            title.includes("celkem za rok")
        ),
        systemContract,
        premiumReference
      );
      const expectedAmount =
        rowSummedExpectedAmount ?? fallbackExpectedAmount;
      const expectedPerPeriod =
        rowSummedExpectedAmount != null && subsequentRows.length > 0
          ? Math.round((rowSummedExpectedAmount / subsequentRows.length) * 100) / 100
          : fallbackExpectedAmount;
      const subsequentBundleInfo = subsequentPayoutBundleInfo({
        rows: subsequentRows,
        statementAmount: subsequentStatementAmount,
        expectedPerPeriod,
        systemContract,
        statementPeriod,
      });
      const finalExpectedAmount = subsequentBundleInfo?.expectedAmount ?? expectedAmount;
      comparisons.push({
        key: "auto-subsequent",
        label: subsequentBundleInfo
          ? `Následná provize (${subsequentBundleInfo.periods} období)`
          : "Následná provize",
        statementAmount: subsequentStatementAmount,
        expectedAmount: finalExpectedAmount,
        difference: subsequentStatementAmount - finalExpectedAmount,
        status: comparisonStatus(subsequentStatementAmount, finalExpectedAmount),
        detailLines: subsequentBundleInfo?.detailLines,
      });
    }

    const b36GrossAmount = b36PaidPaymentAmountsForComparison(contract.b36Payments).reduce(
      (sum, amount) => sum + amount,
      0
    );
    if (hasStatementAmountForComparison(b36GrossAmount)) {
      const expectedB36 = expectedClosestAmountFromItems(
        items,
        b36GrossAmount,
        (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
      );
      const b36Amount = b36StatementAmountForReview(contract.b36Payments, expectedB36);
      const scaledExpectedB36 = scaleAutoExpectedAmountForPremiumReference(
        expectedB36,
        systemContract,
        premiumReference
      );
      comparisons.push({
        key: "b36-half",
        label: "50% z B36",
        statementAmount: b36Amount,
        expectedAmount: scaledExpectedB36,
        difference: b36Amount - scaledExpectedB36,
        status: comparisonStatus(b36Amount, scaledExpectedB36),
      });
    }

    return comparisons;
  }

  const groups = [
    {
      key: "closing",
      label: "Sjednávací / okamžitá",
      rows: rowsByGeneralKinds(contract, ["closing", "tip"]),
      matcher: (title: string) =>
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni"),
    },
    {
      key: "subsequent",
      label: "Následná / splátka",
      rows: rowsByGeneralKinds(contract, ["subsequent", "installment"]),
      matcher: (title: string) =>
        title.includes("nasledna") ||
        title.includes("provize za rok") ||
        title.includes("celkem za rok"),
    },
    {
      key: "increase",
      label: "Navýšení",
      rows: rowsByGeneralKinds(contract, ["increase"]),
      matcher: (title: string) => title.includes("navyseni"),
    },
    {
      key: "unexpected",
      label: "Neočekávaná",
      rows: rowsByGeneralKinds(contract, ["unexpected"]),
      matcher: (title: string) => title.includes("neocekavana"),
    },
  ];

  const comparisons: CommissionAmountComparison[] = groups
    .map((group) => {
      const statementAmount = sumRows(group.rows);
      const expectedPerPeriod =
        expectedAmountFromIndependentStatementBase(
          group.rows,
          systemContract,
          group.matcher
        ) ?? expectedClosestAmountFromItems(items, statementAmount, group.matcher);
      const subsequentBundleInfo =
        group.key === "subsequent"
          ? subsequentPayoutBundleInfo({
              rows: group.rows,
              statementAmount,
              expectedPerPeriod,
              systemContract,
              statementPeriod,
            })
          : null;
      const expectedAmount = subsequentBundleInfo?.expectedAmount ?? expectedPerPeriod;
      return {
        key: group.key,
        label: subsequentBundleInfo
          ? `${group.label} (${subsequentBundleInfo.periods} období)`
          : group.label,
        statementAmount,
        expectedAmount,
        difference: statementAmount - expectedAmount,
        status: comparisonStatus(statementAmount, expectedAmount),
        detailLines: subsequentBundleInfo?.detailLines,
        hasStatementRows: hasRowsForAmountComparison(group.rows),
      };
    })
    .filter((comparison) => comparison.hasStatementRows);

  const b36GrossAmount = b36PaidPaymentAmountsForComparison(contract.b36Payments).reduce(
    (sum, amount) => sum + amount,
    0
  );
  if (hasStatementAmountForComparison(b36GrossAmount)) {
    const expectedB36 = expectedClosestAmountFromItems(
      items,
      b36GrossAmount,
      (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
    );
    const b36Amount = b36StatementAmountForReview(contract.b36Payments, expectedB36);
    comparisons.push({
      key: "b36-half",
      label: "50% z B36",
      statementAmount: b36Amount,
      expectedAmount: expectedB36,
      difference: b36Amount - expectedB36,
      status: comparisonStatus(b36Amount, expectedB36),
    });
  }

  return comparisons;
};

const normalizeEmailForComparison = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const managerOverrideForViewer = (
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined
): ManagerOverrideSummary | null => {
  const overrides = systemContract?.managerOverrides ?? [];
  if (overrides.length === 0) return null;

  const normalizedEmail = normalizeEmailForComparison(currentUserEmail);
  if (normalizedEmail) {
    const exactMatch = overrides.find(
      (override) => normalizeEmailForComparison(override.email) === normalizedEmail
    );
    if (exactMatch) return exactMatch;
  }

  return overrides.length === 1 ? overrides[0] ?? null : null;
};

const managerCommissionItemMatcher = (row: ManagerCommissionRow): ((title: string) => boolean) => {
  const type = normalizeCommissionTitle(row.type);
  const kind = classifyGeneralCommissionCode(row.product, row.type).kind;

  return (titleRaw: string) => {
    const title = normalizeCommissionTitle(titleRaw);
    const isB36Type = type === "b36" || type === "b036" || type === "b3601";
    const isB36HalfType =
      (type.includes("50") || type.includes("polovina")) &&
      (type.includes("b36") || type.includes("b036"));
    if (type && !isB36Type && !isB36HalfType && title.includes(type)) return true;

    if (type.startsWith("a")) {
      return (
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni")
      );
    }

    if (type.includes("b0301")) return title.includes("b0301");
    if ((type.includes("50") || type.includes("polovina")) && type.includes("b36")) {
      return title.includes("50") && (title.includes("b36") || title.includes("b3601"));
    }
    if (type === "b36" || type === "b3601") {
      return (
        title.includes("po 3") ||
        (!title.includes("50") && (title.includes("b36") || title.includes("b3601")))
      );
    }
    if (type === "b48" || type === "b4801") {
      return title.includes("po 4") || title.includes("b48") || title.includes("b4801");
    }
    if (/^b10[1-4]$/.test(type)) return title.includes("nasledna");
    if (/^b20[1-6]$/.test(type)) {
      return title.includes("pecovatelska") || (title.includes("nasledna") && title.includes("5 10"));
    }
    if (type.startsWith("bc")) {
      return title.includes("provize za rok") || title.includes("celkem za rok") || title.includes("nasledna");
    }

    switch (kind) {
      case "closing":
      case "tip":
        return (
          title.includes("okamzita") ||
          title.includes("ziskatelska") ||
          title.includes("uzavreni")
        );
      case "installment":
      case "subsequent":
        return (
          title.includes("nasledna") ||
          title.includes("provize za rok") ||
          title.includes("celkem za rok")
        );
      case "increase":
        return title.includes("navyseni");
      case "unexpected":
        return title.includes("neocekavana");
      default:
        return false;
    }
  };
};

const normalizeCommissionCode = (value: string | null | undefined): string =>
  normalizeStatementCommissionCode(value);

const commissionItemCodeMatchesStatementCode = (
  itemCode: string | null | undefined,
  rowCode: string
): boolean => {
  const code = baseCommissionCodeForStatementComparison(itemCode);
  const comparableRowCode = managerCommissionCodeForSystemItems(rowCode);
  if (!code || !comparableRowCode) return false;
  if (code === comparableRowCode) return true;
  const rangeMatch = code.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/);
  const rowMatch = comparableRowCode.match(/^([A-Z]+)(\d+)$/);
  if (rangeMatch && rowMatch && rangeMatch[1] === rangeMatch[3]) {
    const [, prefix, startRaw, , endRaw] = rangeMatch;
    const [, rowPrefix, rowNumberRaw] = rowMatch;
    const start = Number(startRaw);
    const end = Number(endRaw);
    const rowNumber = Number(rowNumberRaw);
    if (
      prefix === rowPrefix &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      Number.isFinite(rowNumber) &&
      rowNumber >= start &&
      rowNumber <= end
    ) {
      return true;
    }
  }
  if (/^[A-Z]+$/.test(code) && rowMatch) {
    return rowMatch[1] === code;
  }
  if (/^B10[1-4]$/.test(comparableRowCode)) return code === "B101-B104";
  if (/^B20[1-6]$/.test(comparableRowCode)) return code === "B201-B206";
  return false;
};

const expectedManagerAmountFromItems = (
  items: CommissionResultItemDTO[],
  row: ManagerCommissionRow
): number => {
  const rowCode = normalizeCommissionCode(row.type);
  const exactCodeMatches = items
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => commissionItemCodeMatchesStatementCode(item.code, rowCode))
    .map((item) => Number(item.amount))
    .filter((amount) => Number.isFinite(amount));

  if (exactCodeMatches.length > 0) {
    return exactCodeMatches.reduce((sum, amount) => sum + amount, 0);
  }

  return expectedClosestAmountFromItems(
    items,
    Math.abs(row.commission),
    managerCommissionItemMatcher(row)
  );
};

type ManagerCommissionPaymentBundleInfo = {
  paymentCount: number;
  expectedAmount: number;
  detailLines: string[];
};

const managerCommissionPaymentBundleInfo = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined
): ManagerCommissionPaymentBundleInfo | null => {
  if (!systemContract || usesIndependentStatementCommissionBase(row.product)) return null;

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const items = override?.items ?? [];
  if (items.length === 0) return null;

  const expectedPerPayment = expectedManagerAmountFromItems(items, row);
  const systemPaymentBase = systemCommissionPaymentBase(systemContract);
  const paymentCount = statementPaymentBundleCount({
    statementBase: Number(row.base),
    systemPaymentBase,
    statementCommission: Number(row.commission),
    expectedCommissionPerPayment: expectedPerPayment,
    systemFrequency: systemContract.frequencyRaw,
  });
  if (paymentCount == null) return null;

  const expectedAmount = Math.round(expectedPerPayment * paymentCount * 100) / 100;
  const paymentLabel = paymentCount >= 2 && paymentCount <= 4 ? "platby" : "plateb";
  return {
    paymentCount,
    expectedAmount,
    detailLines: [
      `Souhrnná výplata za ${paymentCount} ${paymentLabel}: ${formatWholeMoney(row.base)} Kč = ${paymentCount} × ${formatWholeMoney(systemPaymentBase)} Kč.`,
    ],
  };
};

const managerCommissionStatementBasePeriod = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null
): "annual" | "payment" =>
  resolveStatementPremiumBasePeriod({
    product: row.product,
    statementBase: row.base,
    systemPaymentBase: systemCommissionPaymentBase(systemContract),
    systemFrequency: systemContract?.frequencyRaw,
  });

const managerCommissionPremiumBaseMismatch = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null
): {
  statementLabel: string;
  systemLabel: string;
  differenceLabel: string;
} | null => {
  if (usesIndependentStatementCommissionBase(row.product)) return null;
  const statementBase = Number(row.base);
  if (!Number.isFinite(statementBase) || statementBase <= ANNUAL_PREMIUM_TOLERANCE) {
    return null;
  }

  const statementBasePeriod = managerCommissionStatementBasePeriod(row, systemContract);
  const mismatch = premiumBaseComparison(
    statementBase,
    systemContract,
    statementBasePeriod
  );
  if (!mismatch) return null;
  const comparableDifference =
    statementBasePeriod === "annual" ? mismatch.annualDifference : mismatch.difference;
  if (
    Math.abs(comparableDifference) <= ANNUAL_PREMIUM_TOLERANCE ||
    Math.round(comparableDifference) === 0
  ) {
    return null;
  }

  if (statementBasePeriod === "annual") {
    return {
      statementLabel: `${formatWholeMoney(mismatch.statementAnnualPremiumBase)} Kč ročně`,
      systemLabel: `${formatWholeMoney(mismatch.systemAnnualPremiumBase)} Kč ročně`,
      differenceLabel: `${formatWholeMoney(mismatch.annualDifference)} Kč ročně`,
    };
  }

  return {
    statementLabel: `${formatWholeMoney(mismatch.statementPremiumBase)} Kč`,
    systemLabel: `${formatWholeMoney(mismatch.systemPremiumBase)} Kč`,
    differenceLabel: `${formatWholeMoney(mismatch.difference)} Kč`,
  };
};

const managerCommissionBaseComparison = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined
): PremiumBaseComparison | null => {
  if (usesIndependentStatementCommissionBase(row.product)) return null;
  if (managerCommissionPaymentBundleInfo(row, systemContract, currentUserEmail)) return null;
  const statementBase = Number(row.base);
  if (!Number.isFinite(statementBase) || statementBase <= ANNUAL_PREMIUM_TOLERANCE) {
    return null;
  }

  const comparison = premiumBaseComparison(
    statementBase,
    systemContract,
    managerCommissionStatementBasePeriod(row, systemContract)
  );
  if (!comparison) return null;

  return {
    ...comparison,
    key: `manager-${managerCommissionRowIdentity(row)}-base`,
    label: "Základna pojistného",
    canBeAnniversaryPremiumChange: false,
    firstAnniversaryDate: null,
    anniversaryDate: null,
    referenceDate: null,
  };
};

const expectedManagerAmountForStatementBase = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract,
  expectedAmount: number
): number => {
  if (!usesIndependentStatementCommissionBase(row.product)) return expectedAmount;

  const statementAnnualBase = Number(row.base);
  const systemPaymentBase = systemCommissionPaymentBase(systemContract);
  const systemAnnualBase =
    systemPaymentBase * paymentsPerYearForFrequency(systemContract.frequencyRaw);
  if (
    !Number.isFinite(statementAnnualBase) ||
    statementAnnualBase <= 0 ||
    !Number.isFinite(systemAnnualBase) ||
    systemAnnualBase <= 0
  ) {
    return expectedAmount;
  }

  return expectedAmount * (statementAnnualBase / systemAnnualBase);
};

const managerCommissionDifferenceReason = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined,
  status: CommissionAmountComparisonStatus
): Pick<CommissionAmountComparison, "reason" | "reasonTitle" | "reasonLines"> => {
  if (status === "ok") return {};

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const careerCheck = statementCareerMismatch([row], override?.position);
  if (
    careerCheck.careers.length > 0 &&
    careerCheck.systemPosition &&
    careerCheck.mismatched
  ) {
    return {
      reason: "career_mismatch",
      reasonTitle: "Důvod: kariérní stupeň meziprovize",
      reasonLines: [
        `Výpis uvádí Kar. ${statementCareerPositionsLabel(careerCheck.careers)}, systém počítá meziprovizi jako ${positionLabel(careerCheck.systemPosition)}.`,
      ],
    };
  }

  const baseMismatch = managerCommissionPremiumBaseMismatch(row, systemContract);
  if (baseMismatch) {
    return {
      reason: "premium_base_mismatch",
      reasonTitle: "Důvod: jiná základna",
      reasonLines: [
        `Výpisová základna: ${baseMismatch.statementLabel}. Systémová základna: ${baseMismatch.systemLabel}. Rozdíl základny: ${baseMismatch.differenceLabel}.`,
      ],
    };
  }

  return {
    reason: "commission_amount_mismatch",
    reasonTitle: "Důvod: rozdíl v částce provize",
    reasonLines: [
      "Kariérní stupeň ani základna nevysvětlují rozdíl. Prověř konkrétní koeficient nebo výpočet této položky.",
    ],
  };
};

const buildManagerCommissionAmountComparison = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined
): CommissionAmountComparison | null => {
  if (row.isStorno || row.commission < 0) return null;
  if (!systemContract) return null;

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const items = override?.items ?? [];
  if (items.length === 0) return null;

  const paymentBundle = managerCommissionPaymentBundleInfo(
    row,
    systemContract,
    currentUserEmail
  );
  const expectedAbsAmount =
    paymentBundle?.expectedAmount ??
    expectedManagerAmountForStatementBase(
      row,
      systemContract,
      expectedManagerAmountFromItems(items, row)
    );
  const expectedAmount = expectedAbsAmount;
  const status = comparisonStatus(
    row.commission,
    expectedAmount,
    MANAGER_COMMISSION_AMOUNT_TOLERANCE
  );

  return {
    key: `manager-${managerCommissionRowIdentity(row)}-commission`,
    label: `Meziprovize ${row.type || "—"}${paymentBundle ? ` (${paymentBundle.paymentCount} platby)` : ""}`,
    statementAmount: row.commission,
    expectedAmount,
    difference: row.commission - expectedAmount,
    status,
    detailLines: paymentBundle?.detailLines,
    ...managerCommissionDifferenceReason(row, systemContract, currentUserEmail, status),
  };
};

const managerCommissionRowKey = (advisorNumber: string, row: ManagerCommissionRow): string =>
  `${advisorNumber}-${managerCommissionRowIdentity(row)}`;

const amountComparisonStatusLabel = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "Sedí";
    case "missing_statement":
      return "Chybí ve výpisu";
    case "missing_expected":
      return "Chybí v systému";
    default:
      return "Rozdíl";
  }
};

const amountIssueCountLabel = (count: number): string => {
  if (count === 1) return "1 rozdíl";
  if (count >= 2 && count <= 4) return `${count} rozdíly`;
  return `${count} rozdílů`;
};

const uncertaintyCountLabel = (count: number): string => {
  if (count === 1) return "1 nejasnost";
  if (count >= 2 && count <= 4) return `${count} nejasnosti`;
  return `${count} nejasností`;
};

const contractMatchDiscrepancyIssue = ({
  statementKey,
  category,
  keyPrefix,
  scope,
  contractNumber,
  client,
  product,
  match,
}: {
  statementKey: string;
  category: string;
  keyPrefix: string;
  scope: ContractMatchScope;
  contractNumber: string | null | undefined;
  client: string;
  product: string;
  match: ContractMatchState | null;
}): StatementDiscrepancyIssue | null => {
  if (!isUnpairedContractMatch(match)) return null;

  if (match?.status === "not_found") {
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "not-found"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: "Smlouva není nalezená v systému",
      details: ["Ověřit číslo smlouvy, poradce nebo ruční dopárování před opravou výpisu."],
    };
  }

  if (match?.status === "error") {
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "match-error"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: "Smlouvu se nepodařilo ověřit vůči systému",
      details: [match.error || "Párování smlouvy v systému skončilo chybou."],
    };
  }

  if (match?.status === "matched" && !matchedSystemContract(match)) {
    const examples = match.contracts
      .slice(0, 3)
      .map((contract) => contract.clientName || contract.contractNumber || contract.id)
      .filter(Boolean);
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "multiple"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: `Více shod v systému (${match.contracts.length})`,
      details: examples.length > 0 ? [`Nalezené shody: ${examples.join("; ")}`] : [],
    };
  }

  return null;
};

const careerPositionDiscrepancyIssue = ({
  statementKey,
  category,
  keyPrefix,
  scope,
  contractNumber,
  client,
  product,
  rows,
  systemPositionRaw,
}: {
  statementKey: string;
  category: string;
  keyPrefix: string;
  scope: ContractMatchScope;
  contractNumber: string | null | undefined;
  client: string;
  product: string;
  rows: Array<{ career: string }>;
  systemPositionRaw: unknown;
}): StatementDiscrepancyIssue | null => {
  const { careers, systemPosition, mismatched } = statementCareerMismatch(
    rows,
    systemPositionRaw
  );
  if (careers.length === 0) return null;

  const careerLabel = statementCareerPositionsLabel(careers);
  if (!systemPosition) {
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "missing-system-position"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: "Kar. z výpisu nelze ověřit",
      details: [
        `Výpis Kar.: ${careerLabel}`,
        "Systém nemá u smlouvy uloženou pozici pro porovnání.",
      ],
    };
  }

  if (!mismatched) return null;

  return {
    key: discrepancyIssueKey(
      statementKey,
      keyPrefix,
      scope,
      contractNumber,
      careers.map((career) => career.raw).join("-"),
      systemPosition
    ),
    statementKey,
    source: "auto",
    severity: "error",
    category,
    scope,
    contractNumber: normalizeText(contractNumber) || null,
    client: normalizeText(client) || "—",
    product: normalizeText(product) || "—",
    title: "Kar. ve výpisu nesedí s pozicí smlouvy",
    details: [
      `Výpis Kar.: ${careerLabel}`,
      `Systém: ${positionLabel(systemPosition)} (${systemPosition})`,
    ],
  };
};

const managerCareerPositionDiscrepancyIssue = ({
  statementKey,
  advisor,
  row,
  systemContract,
  currentUserEmail,
}: {
  statementKey: string;
  advisor: ManagerCommissionAdvisor;
  row: ManagerCommissionRow;
  systemContract: MatchedSystemContract | null;
  currentUserEmail: string | null | undefined;
}): StatementDiscrepancyIssue | null => {
  if (!systemContract) return null;

  const career = statementCareerPositionFromValue(row.career);
  if (!career) return null;

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const overridePosition = normalizePositionValue(override?.position);
  const product = `${resolveStatementProduct(row.product).label} · ${row.product}`;
  const advisorLabel = advisor.advisorName || advisor.advisorNumber || "—";

  if (!overridePosition) {
    return {
      key: discrepancyIssueKey(
        statementKey,
        "manager-career",
        advisor.advisorNumber,
        row.contractNumber,
        row.id,
        "missing-system-position"
      ),
      statementKey,
      source: "auto",
      severity: "warning",
      category: "Provize manažera",
      scope: "team",
      contractNumber: row.contractNumber || null,
      client: row.client || systemContract.clientName || "—",
      product,
      title: "Kar. meziprovize nelze ověřit",
      details: [
        `Poradce: ${advisorLabel}`,
        `Výpis Kar.: ${statementCareerPositionLabel(career)}`,
        "Systém nemá uloženou odpovídající manažerskou pozici v meziprovizi.",
      ],
      statementAmount: row.commission,
    };
  }

  if (career.position === overridePosition) return null;

  return {
    key: discrepancyIssueKey(
      statementKey,
      "manager-career",
      advisor.advisorNumber,
      row.contractNumber,
      row.id,
      career.raw,
      overridePosition
    ),
    statementKey,
    source: "auto",
    severity: "error",
    category: "Provize manažera",
    scope: "team",
    contractNumber: row.contractNumber || null,
    client: row.client || systemContract.clientName || "—",
    product,
    title: "Kar. meziprovize nesedí s pozicí manažera",
    details: [
      `Poradce: ${advisorLabel}`,
      `Výpis Kar.: ${statementCareerPositionLabel(career)}`,
      `Systém: ${positionLabel(overridePosition)} (${overridePosition})`,
    ],
    statementAmount: row.commission,
  };
};

const buildStatementDiscrepancyIssues = (
  statement: ParsedStatement,
  matchesByContractNumber: ContractMatchesByNumber,
  currentUserEmail?: string | null,
  correctionContext?: StatementCorrectionContext
): StatementDiscrepancyIssue[] => {
  const statementKey = statementDiscrepancyKey(statement);
  const issues: StatementDiscrepancyIssue[] = [];
  const managerMatchIssueKeys = new Set<string>();

  const addIssue = (issue: StatementDiscrepancyIssue | null) => {
    if (!issue || issues.some((existing) => existing.key === issue.key)) return;
    issues.push(issue);
  };

  const addStornoSystemStatusIssue = ({
    contractNumber,
    client,
    product,
    match,
    statementAmount,
    scope = "my",
  }: {
    contractNumber: string | null | undefined;
    client: string;
    product: string;
    match: ContractMatchState | null;
    statementAmount?: number;
    scope?: ContractMatchScope;
  }) => {
    const systemContract = matchedSystemContract(match);
    if (!systemContract || systemContractIsStorno(systemContract)) return;

    addIssue({
      key: discrepancyIssueKey(statementKey, "storno-system-status", contractNumber),
      statementKey,
      source: "auto",
      severity: "warning",
      category: "Storna",
      scope,
      contractNumber: contractNumber || null,
      client,
      product,
      title: "Storno z výpisu není označené v systému",
      details: [
        `Výpis: storno`,
        `Systém: ${systemContractStatusLabel(systemContract)}`,
      ],
      statementAmount,
    });
  };

  statement.parseWarnings.forEach((warning, index) => {
    addIssue({
      key: discrepancyIssueKey(statementKey, "parse-warning", index, warning),
      statementKey,
      source: "auto",
      severity: "info",
      category: "Import výpisu",
      scope: null,
      contractNumber: null,
      client: "—",
      product: "—",
      title: "Výpis nebyl načten kompletně",
      details: [warning],
    });
  });

  for (const contract of statement.lifeSplitContracts) {
    const reviewRows = rowsForStatementReview(statementKey, contract.rows, correctionContext);
    const reviewContract =
      reviewRows.length === contract.rows.length
        ? contract
        : {
            ...contract,
            rows: reviewRows,
            annualPremium: reviewRows.find((row) => row.base > 0)?.base ?? contract.annualPremium,
          };
    if (reviewRows.length === 0 && contract.b36Payments.length === 0) continue;
    const productMeta = resolveStatementProduct(contract.productCode);
    const productLabel = `${productMeta.label} · ${productMeta.rawCode}`;
    const category = "Životní pojištění";
    const tipOnlyContract = lifeSplitContractHasOnlyTipRows(reviewContract);
    const matchScope = lifeSplitContractMatchScope(reviewContract);
    const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
    const systemContract = matchedSystemContractForLifeSplit(reviewContract, match);
    const expectedProductKey = productMeta.productKey;

    addIssue(
      contractMatchDiscrepancyIssue({
        statementKey,
        category,
        keyPrefix: "life-match",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client,
        product: productLabel,
        match,
      })
    );

    if (hasProductMismatch(expectedProductKey, systemContract)) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-product", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "Produkt ve výpisu nesedí se systémem",
        details: [
          `Výpis: ${productMeta.label}`,
          `Systém: ${productLabelFromKey(systemContract?.productKey)}`,
        ],
      });
    }

    if (systemContract && !tipOnlyContract) {
      addIssue(
        careerPositionDiscrepancyIssue({
          statementKey,
          category,
          keyPrefix: "life-career",
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          rows: reviewContract.rows,
          systemPositionRaw: systemContractPositionRaw(systemContract),
        })
      );
    }

    const hasLifePremiumIncrease = rowsByKind(reviewContract, "increase").length > 0;
    const premiumMismatch = !tipOnlyContract && reviewContract.rows.length > 0
      ? annualPremiumBaseMismatch(reviewContract.annualPremium, systemContract)
      : null;
    const isRefreshMissingOriginal = isNeonRefreshMissingOriginalInSystem(systemContract);
    if (
      premiumMismatch &&
      !premiumMismatch.explainedByEndorsement &&
      !hasLifePremiumIncrease &&
      isRefreshMissingOriginal
    ) {
      const statementMonthlyPremium = premiumMismatch.statementAnnualPremium / 12;
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-refresh-missing-original", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "REFRESH bez původní smlouvy v systému",
        details: [
          `Výpis počítá se základnou ${formatWholeMoney(premiumMismatch.statementAnnualPremium)} Kč ročně (${formatWholeMoney(statementMonthlyPremium)} Kč měsíčně).`,
          `Smlouva je uložená jako REFRESH bez původní smlouvy v systému, takže základna v kalkulačce je jen orientační.`,
          "Při zápisu výpisu je potřeba použít základnu a schéma z výpisu jako autoritu.",
        ],
        statementAmount: premiumMismatch.statementAnnualPremium,
        expectedAmount: premiumMismatch.systemAnnualPremium,
        difference: premiumMismatch.difference,
      });
    } else if (premiumMismatch && !premiumMismatch.explainedByEndorsement && !hasLifePremiumIncrease) {
      const statementMonthlyPremium = premiumMismatch.statementAnnualPremium / 12;
      const monthlyDifference = statementMonthlyPremium - premiumMismatch.systemMonthlyPremium;
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-premium", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "warning",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "Nesoulad ročního pojistného",
        details: [
          `Výpis: ${formatWholeMoney(premiumMismatch.statementAnnualPremium)} Kč ročně (${formatWholeMoney(statementMonthlyPremium)} Kč měsíčně)`,
          `Systém: ${formatWholeMoney(premiumMismatch.systemAnnualPremium)} Kč ročně (${formatWholeMoney(premiumMismatch.systemMonthlyPremium)} Kč měsíčně)`,
          `Rozdíl pojistného: ${formatWholeMoney(premiumMismatch.difference)} Kč ročně (${formatWholeMoney(monthlyDifference)} Kč měsíčně)`,
        ],
        statementAmount: premiumMismatch.statementAnnualPremium,
        expectedAmount: premiumMismatch.systemAnnualPremium,
        difference: premiumMismatch.difference,
      });
    }

    if (systemContract) {
      for (const comparison of buildLifeSplitAmountComparisons(
        reviewContract,
        systemContract,
        statement.header.period
      )) {
        if (comparison.status === "ok") continue;
        addIssue({
          key: discrepancyIssueKey(statementKey, "life-amount", contract.contractNumber, comparison.key),
          statementKey,
          source: "auto",
          severity: "error",
          category,
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          title: `${comparison.label}: ${amountComparisonStatusLabel(comparison.status).toLowerCase()}`,
          details: [
            `Výpis: ${formatMoney(comparison.statementAmount)} Kč`,
            `Systém: ${formatMoney(comparison.expectedAmount)} Kč`,
            `Rozdíl: ${formatMoney(comparison.difference)} Kč`,
          ],
          statementAmount: comparison.statementAmount,
          expectedAmount: comparison.expectedAmount,
          difference: comparison.difference,
        });
      }
    }

    const missingB36Warning = tipOnlyContract
      ? null
      : missingAcceleratedB36Warning(
          reviewContract.rows,
          contract.b36Payments,
          systemContract
        );
    if (missingB36Warning) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-missing-b36", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Chybí 50% z B36 ve zrychleném režimu",
        details: [missingB36Warning.detail],
      });
    }

    const unknownRows = rowsByKind(reviewContract, "unknown");
    if (unknownRows.length > 0) {
      const unknownCodes = [...new Set(unknownRows.map((row) => row.type || "bez kódu"))];
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-unknown-code", contract.contractNumber, unknownCodes.join("-")),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Neznámý kód provize ve výpisu",
        details: [`Kódy: ${unknownCodes.join(", ")}`],
      });
    }

    if (
      rowsByKind(reviewContract, "a101").length > 0 &&
      rowsByKind(reviewContract, "b0301").length === 0 &&
      !hasHistoricalB0301Payout(systemContract)
    ) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-missing-b0301", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Chybí B0301 karta klienta",
        details: [
          "Ve výpisu je A101, ale B0301 zde není. Může jít o odloženou výplatu po zpracování karty klienta.",
        ],
      });
    }
  }

  for (const contract of statement.otherProductContracts) {
    const reviewRows = rowsForStatementReview(statementKey, contract.rows, correctionContext);
    const reviewContract =
      reviewRows.length === contract.rows.length
        ? contract
        : { ...contract, rows: reviewRows };
    if (reviewRows.length === 0 && contract.b36Payments.length === 0) continue;
    const productMetas = uniqueProductMetasForRows(reviewContract.rows);
    const productLabel =
      productMetas.length > 0
        ? productMetas.map((product) => `${product.label} · ${product.rawCode}`).join("; ")
        : "Produkt nezjištěn";
    const category = otherProductContractCategoryLabel(contract);
    const tipOnlyContract = otherProductContractHasOnlyTipRows(reviewContract);
    const matchScope = otherProductContractMatchScope(reviewContract);
    const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
    const systemContract = matchedSystemContract(match);
    const expectedProductKey =
      productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;

    addIssue(
      contractMatchDiscrepancyIssue({
        statementKey,
        category,
        keyPrefix: "other-match",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client,
        product: productLabel,
        match,
      })
    );

    if (hasProductMismatch(expectedProductKey, systemContract)) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "other-product", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "Produkt ve výpisu nesedí se systémem",
        details: [
          `Výpis: ${productMetas[0]?.label ?? "—"}`,
          `Systém: ${productLabelFromKey(systemContract?.productKey)}`,
        ],
      });
    }

    if (systemContract && !tipOnlyContract) {
      addIssue(
        careerPositionDiscrepancyIssue({
          statementKey,
          category,
          keyPrefix: "other-career",
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          rows: reviewContract.rows,
          systemPositionRaw: systemContractPositionRaw(systemContract),
        })
      );
    }

    if (!tipOnlyContract && contractHasProductCategory(reviewContract, "auto")) {
      const explainedPremiumChange = autoPremiumChangeInfo(
        reviewContract,
        systemContract,
        statement.header.period
      );
      const premiumMismatch = autoPremiumBaseMismatchForContract(
        reviewContract,
        systemContract,
        statement.header.period
      );
      if (premiumMismatch && !explainedPremiumChange) {
        addIssue({
          key: discrepancyIssueKey(statementKey, "other-premium", contract.contractNumber),
          statementKey,
          source: "auto",
          severity: "warning",
          category,
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract?.clientName || "—",
          product: productLabel,
          title: "Rozdíl pojistného ve výpisu a systému",
          details: [
            autoStatementPremiumBaseDetail(premiumMismatch),
            `Systém: ${paymentAmountWithFrequencyLabel(premiumMismatch.systemPremiumBase, premiumMismatch.systemPaymentFrequency)} (${formatWholeMoney(premiumMismatch.systemAnnualPremiumBase)} Kč ročně)`,
            `Rozdíl pojistného: ${formatWholeMoney(premiumMismatch.difference)} Kč za platbu (${formatWholeMoney(premiumMismatch.annualDifference)} Kč ročně)`,
          ],
          statementAmount: premiumMismatch.statementAnnualPremiumBase,
          expectedAmount: premiumMismatch.systemAnnualPremiumBase,
          difference: premiumMismatch.annualDifference,
        });
      }
    }

    if (systemContract) {
      const explainedPremiumChange = autoPremiumChangeInfo(
        reviewContract,
        systemContract,
        statement.header.period
      );
      for (const comparison of buildOtherProductAmountComparisons(
        reviewContract,
        systemContract,
        statement.header.period
      )) {
        if (
          comparison.status === "ok" ||
          isAmountComparisonExplainedByAutoPremiumChange(
            comparison,
            explainedPremiumChange
          )
        ) {
          continue;
        }
        addIssue({
          key: discrepancyIssueKey(statementKey, "other-amount", contract.contractNumber, comparison.key),
          statementKey,
          source: "auto",
          severity: "error",
          category,
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          title: `${comparison.label}: ${amountComparisonStatusLabel(comparison.status).toLowerCase()}`,
          details: [
            `Výpis: ${formatMoney(comparison.statementAmount)} Kč`,
            `Systém: ${formatMoney(comparison.expectedAmount)} Kč`,
            `Rozdíl: ${formatMoney(comparison.difference)} Kč`,
          ],
          statementAmount: comparison.statementAmount,
          expectedAmount: comparison.expectedAmount,
          difference: comparison.difference,
        });
      }
    }

    const missingB36Warning = tipOnlyContract
      ? null
      : missingAcceleratedB36Warning(
          reviewContract.rows,
          contract.b36Payments,
          systemContract
        );
    if (missingB36Warning) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "other-missing-b36", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Chybí 50% z B36 ve zrychleném režimu",
        details: [missingB36Warning.detail],
      });
    }

    const unknownRows = reviewContract.rows.filter(
      (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
    );
    if (unknownRows.length > 0) {
      const unknownCodes = [...new Set(unknownRows.map((row) => `${row.product} ${row.type}`.trim()))];
      addIssue({
        key: discrepancyIssueKey(statementKey, "other-unknown-code", contract.contractNumber, unknownCodes.join("-")),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Neznámý kód provize ve výpisu",
        details: [`Kódy: ${unknownCodes.join(", ")}`],
      });
    }
  }

  for (const advisor of statement.managerCommissions) {
    for (const row of advisor.rows) {
      const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team");
      const systemContract = matchedSystemContract(match);
      addIssue(
        managerCareerPositionDiscrepancyIssue({
          statementKey,
          advisor,
          row,
          systemContract,
          currentUserEmail,
        })
      );
      if (row.isStorno) {
        const productMeta = resolveStatementProduct(row.product);
        addStornoSystemStatusIssue({
          contractNumber: row.contractNumber,
          client: row.client || systemContract?.clientName || "—",
          product: `${productMeta.label} · ${productMeta.rawCode}`,
          match,
          statementAmount: row.commission,
          scope: "team",
        });
      }

      const matchNotice = managerCommissionMatchNotice(match);
      if (!matchNotice) continue;

      const key = discrepancyIssueKey(statementKey, "manager-match", advisor.advisorNumber, row.contractNumber);
      if (managerMatchIssueKeys.has(key)) continue;
      managerMatchIssueKeys.add(key);

      addIssue({
        key,
        statementKey,
        source: "auto",
        severity: matchNotice.tone === "rose" ? "error" : "warning",
        category: "Provize manažera",
        scope: "team",
        contractNumber: row.contractNumber || null,
        client: row.client || "—",
        product: `${resolveStatementProduct(row.product).label} · ${row.product}`,
        title: matchNotice.title,
        details: [
          `Poradce: ${advisor.advisorName || advisor.advisorNumber}`,
          ...matchNotice.lines,
        ],
        statementAmount: row.commission,
      });
    }
  }

  statement.unmatchedB36Payments.forEach((payment, index) => {
    addIssue({
      key: discrepancyIssueKey(statementKey, "unmatched-b36", payment.contractNumber, index),
      statementKey,
      source: "auto",
      severity: "warning",
      category: "Ostatní platby",
      scope: "my",
      contractNumber: payment.contractNumber,
      client: "—",
      product: "B36 / ostatní platby",
      title: "B36 bez detailního řádku ve výpisu",
      details: [payment.description],
      statementAmount: payment.amount,
    });
  });

  for (const row of statement.stornoRows) {
    const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber);
    const product = `${resolveStatementProduct(row.product).label} · ${row.product}`;
    addIssue(
      contractMatchDiscrepancyIssue({
        statementKey,
        category: "Storna",
        keyPrefix: "storno-match",
        scope: "my",
        contractNumber: row.contractNumber,
        client: row.client,
        product,
        match,
      })
    );
    addStornoSystemStatusIssue({
      contractNumber: row.contractNumber,
      client: row.client || "—",
      product,
      match,
      statementAmount: row.commission,
    });
  }

  statement.otherPayments
    .filter((payment) => payment.isStorno)
    .forEach((payment, index) => {
      const match = contractMatchForNumber(matchesByContractNumber, payment.contractNumber);
      addIssue(
        contractMatchDiscrepancyIssue({
          statementKey,
          category: "Storna",
          keyPrefix: `storno-payment-match-${index}`,
          scope: "my",
          contractNumber: payment.contractNumber,
          client: "—",
          product: "Ostatní platby",
          match,
        })
      );
      addStornoSystemStatusIssue({
        contractNumber: payment.contractNumber,
        client: matchedSystemContract(match)?.clientName || "—",
        product: "Ostatní platby",
        match,
        statementAmount: payment.amount,
      });
    });

  const severityOrder: Record<StatementDiscrepancySeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return issues.sort((left, right) => {
    const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDiff !== 0) return severityDiff;
    return left.category.localeCompare(right.category, "cs");
  });
};

const collectPostProcessingNeonRefreshPromptTargets = ({
  statements,
  matchesByContractNumber,
  processedStatementIdsByKey,
}: {
  statements: ParsedStatement[];
  matchesByContractNumber: ContractMatchesByNumber;
  processedStatementIdsByKey: Record<string, string>;
}): PostProcessingNeonRefreshPromptTarget[] => {
  const targets: PostProcessingNeonRefreshPromptTarget[] = [];
  const seen = new Set<string>();

  for (const statement of statements) {
    const statementId = processedStatementIdsByKey[statementDiscrepancyKey(statement)];
    if (!statementId) continue;

    const statementLabel = statementDiscrepancyLabel(statement);
    for (const contract of statement.lifeSplitContracts) {
      if (normalizeProductCode(contract.productCode) !== "CPP_NRF_LF") continue;

      const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber);
      const systemContract = matchedSystemContractForLifeSplit(contract, match);
      if (
        !systemContract ||
        systemContract.productKey !== "neon" ||
        systemContract.isRefresh === true
      ) {
        continue;
      }

      const ownerEmail = normalizeEmailForComparison(systemContract.adviserEmail);
      const entryId = normalizeText(systemContract.id);
      if (!ownerEmail || !entryId) continue;

      const key = `${statementId}:${ownerEmail}:${entryId}:${contract.contractNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const systemAnnualPremium = systemContractAnnualPremiumBase(systemContract);
      targets.push({
        key,
        statementId,
        contract: systemContract,
        contractNumber: contract.contractNumber,
        statementLabel,
        client: contract.client || systemContract.clientName || "—",
        productCode: contract.productCode,
        statementAnnualPremium: contract.annualPremium,
        systemAnnualPremium,
        systemMonthlyPremium:
          systemAnnualPremium == null ? null : Math.round((systemAnnualPremium / 12) * 100) / 100,
      });
    }
  }

  return targets;
};

const formatSignedWholeMoney = (value: number): string => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + formatWholeMoney(Math.abs(value)) + " Kč";
};

function LifeSplitContractCard({
  contract,
  match,
  deductionRows,
  statementId,
  statementPeriod,
  statementPrefillSource,
  statementKey,
  correctionContext,
  markingControls,
  onConvertNeonRefresh,
}: {
  contract: LifeSplitContractPreview;
  match: ContractMatchState | null;
  deductionRows?: DeductionCommissionRow[];
  statementId?: string | null;
  statementPeriod?: string | null;
  statementPrefillSource?: StatementCalculatorPrefillSource;
  statementKey?: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
  onConvertNeonRefresh?: (
    target: ManualNeonRefreshConversionTarget
  ) => Promise<ManualNeonRefreshConversionResponse>;
}) {
  const {
    total,
    monthlyPremium,
    tipCommission: tip,
    hasPremiumIncrease: hasLifePremiumIncrease,
    premiumIncreaseAnnualBase: lifeIncreaseAnnualPremium,
  } = lifeSplitCardSummary(contract);
  const b36HalfLabel = b36HalfLabelForProduct(contract.productCode);
  const pairedB36PaymentIndexes = b36OffsetPairIndexes(contract.b36Payments);
  const contractProductMeta = resolveStatementProduct(contract.productCode);
  const expectedProductKey = contractProductMeta.productKey;
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : {
          ...contract,
          rows: reviewRows,
          annualPremium: reviewRows.find((row) => row.base > 0)?.base ?? contract.annualPremium,
        };
  const tipOnlyContract = lifeSplitContractHasOnlyTipRows(reviewContract);
  const matchScope = lifeSplitContractMatchScope(reviewContract);
  const correctionLabel = statementKey
    ? correctedRowsLabel(statementKey, contract.rows, correctionContext)
    : null;
  const correctionDetails = statementKey
    ? correctedRowsDetails(statementKey, contract.rows, correctionContext)
    : [];
  const currentCorrectionInfo = currentStatementCorrectionInfoForRows(
    reviewContract.rows,
    deductionRows
  );
  const systemContract = matchedSystemContractForLifeSplit(reviewContract, match);
  const reviewA101Rows = rowsByKind(reviewContract, "a101");
  const reviewB0301Rows = rowsByKind(reviewContract, "b0301");
  const hasHistoricalB0301 = hasHistoricalB0301Payout(systemContract);
  const status = statusForContract(reviewContract, systemContract);
  const missingClientCardCommissionWarning =
    reviewA101Rows.length > 0 && reviewB0301Rows.length === 0 && !hasHistoricalB0301;
  const deferredClientCardCommission =
    reviewA101Rows.length === 0 && reviewB0301Rows.length > 0;
  const missingB36Warning = tipOnlyContract
    ? null
    : missingAcceleratedB36Warning(
        reviewContract.rows,
        contract.b36Payments,
        systemContract
      );
  const amountComparisons = systemContract
    ? buildLifeSplitAmountComparisons(reviewContract, systemContract, statementPeriod)
    : [];
  const lifePremiumBaseComparison =
    systemContract && !tipOnlyContract
      ? lifePremiumBaseComparisonForContract(reviewContract, systemContract)
      : null;
  const coefficientOverride = systemContract
    ? lifeCoefficientOverrideInfo(reviewContract, systemContract)
    : null;
  const amountIssueCount = amountComparisons.filter((comparison) => comparison.status !== "ok").length;
  const careerCheck = systemContract && !tipOnlyContract
    ? statementCareerMismatch(reviewContract.rows, systemContractPositionRaw(systemContract))
    : null;
  const timelinePositionMismatch = tipOnlyContract
    ? null
    : systemContractTimelinePositionMismatch(systemContract);
  const hasCareerIssue = Boolean(
    careerCheck &&
      careerCheck.careers.length > 0 &&
      (!careerCheck.systemPosition || careerCheck.mismatched)
  );
  const premiumBaseMismatch = !tipOnlyContract && reviewContract.rows.length > 0
    ? annualPremiumBaseMismatch(reviewContract.annualPremium, systemContract)
    : null;
  const isRefreshMissingOriginal = isNeonRefreshMissingOriginalInSystem(systemContract);
  const premiumBaseExplainedByEndorsement =
    premiumBaseMismatch?.explainedByEndorsement ?? null;
  const premiumMonthlyDifference = premiumBaseMismatch
    ? premiumBaseMismatch.statementAnnualPremium / 12 - premiumBaseMismatch.systemMonthlyPremium
    : null;
  const premiumEndorsementDate = premiumBaseExplainedByEndorsement
    ? formatSystemDate(
        premiumBaseExplainedByEndorsement.policyStartDate ??
          premiumBaseExplainedByEndorsement.contractSignedDate ??
          premiumBaseExplainedByEndorsement.createdAt
      )
    : "—";
  const premiumEndorsementMonthly = Number(
    premiumBaseExplainedByEndorsement?.premiumAmount
  );
  const premiumEndorsementAnnual = Number(
    premiumBaseExplainedByEndorsement?.annualPremium
  );
  const premiumEndorsementAnnualDelta = Number(
    premiumBaseExplainedByEndorsement?.annualPremiumDelta
  );
  const premiumBaseNotice = lifePremiumBaseNoticeKind({
    hasPremiumMismatch: Boolean(premiumBaseMismatch),
    isRefreshMissingOriginal,
    hasPremiumIncrease: hasLifePremiumIncrease,
    hasEndorsement: Boolean(premiumBaseExplainedByEndorsement),
  });
  const detailUrl = firstContractDetailUrl(contract.rows);
  const extranetUrl = firstSjednatelExtranetUrl(contract.rows, systemContract);
  const calculatorPrefill =
    isUnpairedContractMatch(match) && contractProductMeta.productKey
      ? statementCalculatorPrefill({
          product: contractProductMeta,
          contractNumber: contract.contractNumber,
          clientName: contract.client,
          signedAt: contract.signedAt,
          validFrom: contract.validFrom,
          statementBase: contract.annualPremium,
          source: statementPrefillSource,
        })
      : null;
  const [expanded, setExpanded] = useState(false);
  const [refreshConversionState, setRefreshConversionState] = useState<{
    status: StatementRefreshConversionStatus;
    message: string | null;
  }>({ status: "idle", message: null });
  const isStatementNrfRefresh = normalizeProductCode(reviewContract.productCode) === "CPP_NRF_LF";
  const shouldShowStatementRefreshConversion = Boolean(
    isStatementNrfRefresh &&
      systemContract &&
      systemContract.productKey === "neon" &&
      systemContract.isRefresh !== true &&
      onConvertNeonRefresh
  );
  const canConvertStatementRefresh = Boolean(
    shouldShowStatementRefreshConversion && statementId
  );
  const handleConvertStatementRefresh = async () => {
    if (!statementId || !systemContract || !onConvertNeonRefresh) return;
    setRefreshConversionState({ status: "saving", message: null });

    try {
      await onConvertNeonRefresh({
        statementId,
        contract: systemContract,
        contractNumber: contract.contractNumber,
      });
      setRefreshConversionState({
        status: "success",
        message: "Smlouva byla převedena na REFRESH podle výpisu.",
      });
    } catch (conversionError) {
      setRefreshConversionState({
        status: "error",
        message:
          conversionError instanceof Error
            ? conversionError.message
            : "Převod na REFRESH se nepodařil.",
      });
    }
  };
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: matchScope,
          category: "Životní pojištění",
          contractNumber: contract.contractNumber,
          fallback: `${contract.productCode}-${contract.client}`,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: "Životní pojištění",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: `${contract.productLabel} · ${contract.productCode}`,
        title: "Ručně označená smlouva k opravě",
        amount: total,
        details: [
          `Uzavřeno: ${contract.signedAt || "—"}`,
          `Počátek: ${contract.validFrom || "—"}`,
        ],
      }
    : null;
  return (
    <article className="relative overflow-hidden border-b border-violet-100 bg-white/35 px-4 py-3 last:border-b-0">
      {markedItem && (
        <div className="mb-3 flex justify-end">
          <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="grid w-full gap-3 text-left lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-950">
              Smlouva {contract.contractNumber}
            </h3>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status.tone)}`}>
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700">
              <StatementProductLogo product={contractProductMeta} size="xs" />
              {contract.productLabel} · {contract.productCode}
            </span>
            <SystemMatchBadge
              match={match}
              scope={matchScope}
              presentation={systemMatchPresentation}
            />
            {correctionLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {correctionLabel}
              </span>
            )}
            {currentCorrectionInfo && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {currentCorrectionInfo.label}
              </span>
            )}
            {hasCareerIssue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                {statementCareerBadgeLabel(careerCheck?.careers)}
              </span>
            )}
            {timelinePositionMismatch && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Pozice mimo timeline
              </span>
            )}
            {amountComparisons.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  amountIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {amountIssueCount === 0 ? "Provize sedí" : amountIssueCountLabel(amountIssueCount)}
              </span>
            )}
            {coefficientOverride && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                Výpis použil {coefficientSetLabel(coefficientOverride.coefficientSet)}
              </span>
            )}
            {premiumBaseExplainedByEndorsement && (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                Základna z dodatku
              </span>
            )}
            {hasLifePremiumIncrease && (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                Navýšení pojistného
              </span>
            )}
            {missingB36Warning && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Chybí 50% z B36
              </span>
            )}
          </div>
          <div className="mt-1 text-lg font-black tracking-tight text-slate-950">
            {contract.client || "Klient se doplní po spárování se systémem"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 self-start lg:self-auto lg:justify-self-end">
          <div className="min-w-36 text-right">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              Provize celkem
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-black text-violet-700">
              {formatMoney(total)} Kč
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-white/80 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {tip > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
              ATP101: provize z TIPU. Párovat přes TIP vazbu, ne jako vlastní sjednání smlouvy.
            </div>
          )}

          <SystemMatchPanel
            match={match}
            expectedProductKey={expectedProductKey}
            selectedContract={systemContract}
            scope={matchScope}
            presentation={systemMatchPresentation}
          />
          {(systemContract || detailUrl || extranetUrl || calculatorPrefill) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <BohemkaContractDetailLink contract={systemContract} />
              <ContractDetailLink href={detailUrl} />
              <SjednatelExtranetLink href={extranetUrl} />
              <StatementCalculatorPrefillButton prefill={calculatorPrefill} maxxHref={detailUrl} />
            </div>
          )}

          <LifeSplitCardMetadata contract={contract} monthlyPremium={monthlyPremium} />

          <StatementRefreshConversionPanel
            showConversion={shouldShowStatementRefreshConversion}
            state={refreshConversionState}
            statementId={statementId}
            canConvert={canConvertStatementRefresh}
            onConvert={() => {
              void handleConvertStatementRefresh();
            }}
          />

          <StatementCorrectionWarning details={correctionDetails} label={correctionLabel} />
          <StatementCorrectionWarning
            details={currentCorrectionInfo?.details ?? []}
            label={currentCorrectionInfo?.label ?? null}
          />
          <ContractTimelinePositionWarning mismatch={timelinePositionMismatch} />
          <CareerMismatchWarning
            careerCheck={careerCheck}
            hasAmountDifference={amountIssueCount > 0}
          />

          <LifePremiumIncreaseNotice
            annualPremiumIncrease={hasLifePremiumIncrease ? lifeIncreaseAnnualPremium : null}
          />
          <LifeCoefficientOverrideNotice override={coefficientOverride} />
          <LifePremiumBaseNotice
            kind={premiumBaseNotice}
            mismatch={premiumBaseMismatch}
            monthlyDifference={premiumMonthlyDifference}
            endorsement={
              premiumBaseExplainedByEndorsement
                ? {
                    dateLabel: premiumEndorsementDate,
                    annualPremium: premiumEndorsementAnnual,
                    monthlyPremium: premiumEndorsementMonthly,
                    annualPremiumDelta: premiumEndorsementAnnualDelta,
                  }
                : null
            }
          />
          <LifeClientCardCommissionNotice
            hasMissingCommission={missingClientCardCommissionWarning}
            hasDeferredCommission={deferredClientCardCommission}
          />

          <AmountComparisonPanel
            comparisons={amountComparisons}
            baseComparisons={lifePremiumBaseComparison ? [lifePremiumBaseComparison] : []}
          />

          <AcceleratedB36WarningNotice warning={missingB36Warning} />

          <LifeSplitCommissionTable
            rows={contract.rows}
            b36Payments={contract.b36Payments}
            b36HalfLabel={b36HalfLabel}
            pairedB36PaymentIndexes={pairedB36PaymentIndexes}
          />
        </div>
      )}
    </article>
  );
}

function OtherProductContractCard({
  contract,
  match,
  deductionRows,
  statementPeriod,
  statementPrefillSource,
  statementKey,
  correctionContext,
  markingControls,
}: {
  contract: OtherProductContractPreview;
  match: ContractMatchState | null;
  deductionRows?: DeductionCommissionRow[];
  statementPeriod?: string | null;
  statementPrefillSource?: StatementCalculatorPrefillSource;
  statementKey?: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
}) {
  const productMetas = uniqueProductMetasForRows(contract.rows);
  const notes = productMetas.map((product) => product.note).filter(Boolean);
  const {
    totalCommission,
    totalReserve,
    hasUnknownCommissionCode: hasUnknown,
    annualBase,
    monthlyBase,
  } = otherProductCardSummary(contract);
  const pairedB36PaymentIndexes = b36OffsetPairIndexes(contract.b36Payments);
  const isAutoContract = contractHasProductCategory(contract, "auto");
  const expectedProductKey =
    productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;
  const calculatorPrefillProduct =
    productMetas.length === 1 && productMetas[0]?.productKey ? productMetas[0] : null;
  const calculatorPrefillBase =
    calculatorPrefillProduct
      ? contract.rows.find(
          (row) =>
            resolveStatementProduct(row.product).productKey ===
              calculatorPrefillProduct.productKey && row.base > 0
        )?.base ?? 0
      : 0;
  const systemContract = matchedSystemContract(match);
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : { ...contract, rows: reviewRows };
  const tipOnlyContract = otherProductContractHasOnlyTipRows(reviewContract);
  const matchScope = otherProductContractMatchScope(reviewContract);
  const correctionLabel = statementKey
    ? correctedRowsLabel(statementKey, contract.rows, correctionContext)
    : null;
  const correctionDetails = statementKey
    ? correctedRowsDetails(statementKey, contract.rows, correctionContext)
    : [];
  const currentCorrectionInfo = currentStatementCorrectionInfoForRows(
    reviewContract.rows,
    deductionRows
  );
  const missingB36Warning = tipOnlyContract
    ? null
    : missingAcceleratedB36Warning(
        reviewContract.rows,
        contract.b36Payments,
        systemContract
      );
  const amountComparisons = systemContract
    ? buildOtherProductAmountComparisons(reviewContract, systemContract, statementPeriod)
    : [];
  const coefficientOverride =
    isAutoContract && systemContract && !tipOnlyContract
      ? autoCoefficientOverrideInfo(reviewContract, systemContract)
      : null;
  const statementPremiumBaseComparison = systemContract && !tipOnlyContract
    ? otherProductPremiumBaseComparisonForContract(reviewContract, systemContract, statementPeriod)
    : null;
  const autoPremiumChange = tipOnlyContract
    ? null
    : autoPremiumChangeInfo(
        reviewContract,
        systemContract,
        statementPeriod
      );
  const amountComparisonsForReview = amountComparisons.filter(
    (comparison) =>
      !isAmountComparisonExplainedByAutoPremiumChange(comparison, autoPremiumChange)
  );
  const amountIssueCount = amountComparisonsForReview.filter(
    (comparison) => comparison.status !== "ok"
  ).length;
  const careerCheck = systemContract && !tipOnlyContract
    ? statementCareerMismatch(reviewContract.rows, systemContractPositionRaw(systemContract))
    : null;
  const timelinePositionMismatch = tipOnlyContract
    ? null
    : systemContractTimelinePositionMismatch(systemContract);
  const hasCareerIssue = Boolean(
    careerCheck &&
      careerCheck.careers.length > 0 &&
      (!careerCheck.systemPosition || careerCheck.mismatched)
  );
  const detailUrl = firstContractDetailUrl(contract.rows);
  const extranetUrl = firstSjednatelExtranetUrl(contract.rows, systemContract);
  const calculatorPrefill =
    isUnpairedContractMatch(match) && calculatorPrefillProduct
      ? statementCalculatorPrefill({
          product: calculatorPrefillProduct,
          contractNumber: contract.contractNumber,
          clientName: contract.client,
          signedAt: contract.signedAt,
          validFrom: contract.validFrom,
          statementBase: calculatorPrefillBase,
          source: statementPrefillSource,
        })
      : null;
  const cppA101BatchQueueEligible =
    match?.status === "not_found" &&
    isCppA101QueueProduct(calculatorPrefill?.product) &&
    otherProductContractHasA101Commission(reviewContract);
  const calculatorPrefillWithCppA101Queue =
    calculatorPrefill && cppA101BatchQueueEligible
      ? { ...calculatorPrefill, cppA101QueueEligible: true }
      : calculatorPrefill;
  const [expanded, setExpanded] = useState(false);
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: matchScope,
          category: isAutoContract ? "Auta" : "Ostatní smlouvy",
          contractNumber: contract.contractNumber,
          fallback: `${contract.key}-${contract.client}`,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: isAutoContract ? "Auta" : "Ostatní smlouvy",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product:
          productMetas.length > 0
            ? productMetas.map((product) => `${product.label} · ${product.rawCode}`).join("; ")
            : "Produkt nezjištěn",
        title: "Ručně označená smlouva k opravě",
        amount: totalCommission,
        details: [
          `Uzavřeno: ${contract.signedAt || "—"}`,
          `Platnost: ${contract.validFrom || "—"}`,
        ],
      }
    : null;

  return (
    <article className="relative overflow-hidden border-b border-violet-100 bg-white/35 px-4 py-3 last:border-b-0">
      {markedItem && (
        <div className="mb-3 flex justify-end">
          <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="grid w-full gap-3 text-left lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-slate-950">
              Smlouva {contract.contractNumber || "—"}
            </h4>
            {productMetas.map((product) => (
              <span
                key={product.rawCode}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700"
              >
                <StatementProductLogo product={product} size="xs" />
                {product.label} · {product.rawCode} · {statementProductCategoryLabel(product.category)}
              </span>
            ))}
            {hasUnknown && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Neznámý kód
              </span>
            )}
            <SystemMatchBadge
              match={match}
              scope={matchScope}
              presentation={systemMatchPresentation}
            />
            {correctionLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {correctionLabel}
              </span>
            )}
            {currentCorrectionInfo && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {currentCorrectionInfo.label}
              </span>
            )}
            {hasCareerIssue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                {statementCareerBadgeLabel(careerCheck?.careers)}
              </span>
            )}
            {timelinePositionMismatch && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Pozice mimo timeline
              </span>
            )}
            {autoPremiumChange && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800"
              >
                {autoPremiumChange.direction === "increase" ? (
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                )}
                {autoPremiumChange.direction === "increase"
                  ? "Pojistné navýšeno"
                  : "Pojistné poníženo"}
              </span>
            )}
            {amountComparisonsForReview.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  amountIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {amountIssueCount === 0 ? "Provize sedí" : amountIssueCountLabel(amountIssueCount)}
              </span>
            )}
            {coefficientOverride && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                Výpis použil {coefficientSetLabel(coefficientOverride.coefficientSet)}
              </span>
            )}
            {missingB36Warning && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Chybí 50% z B36
              </span>
            )}
          </div>
          <div className="mt-1 text-lg font-black tracking-tight text-slate-950">
            {contract.client || "Klient nezjištěn"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 self-start lg:self-auto lg:justify-self-end">
          <div className="grid grid-cols-2 gap-5 text-right">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Provize celkem
              </div>
              <div className="mt-1 whitespace-nowrap text-lg font-black text-violet-700">
                {formatMoney(totalCommission)} Kč
              </div>
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Rez. fond
              </div>
              <div className="mt-1 whitespace-nowrap text-lg font-black text-rose-700">
                {formatMoney(totalReserve)} Kč
              </div>
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-white/80 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {notes.length > 0 && (
            <div className="space-y-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
              {notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}

          <SystemMatchPanel
            match={match}
            expectedProductKey={expectedProductKey}
            scope={matchScope}
            presentation={systemMatchPresentation}
          />
          {(systemContract || detailUrl || extranetUrl || calculatorPrefillWithCppA101Queue) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <BohemkaContractDetailLink contract={systemContract} />
              <ContractDetailLink href={detailUrl} />
              <SjednatelExtranetLink href={extranetUrl} />
              <StatementCalculatorPrefillButton
                prefill={calculatorPrefillWithCppA101Queue}
                maxxHref={detailUrl}
              />
            </div>
          )}

          <div className="mt-3 grid divide-y divide-violet-100 border-y border-violet-100 text-xs font-semibold text-slate-600 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className="px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Uzavřeno
              </div>
              <div className="mt-0.5 text-slate-900">{contract.signedAt || "—"}</div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Platnost
              </div>
              <div className="mt-0.5 text-slate-900">{contract.validFrom || "—"}</div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Položky
              </div>
              <div className="mt-0.5 text-slate-900">
                {contract.rows.length} řádků
                {contract.b36Payments.length > 0
                  ? ` · ${contract.b36Payments.length} B36`
                  : ""}
              </div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Pojistné
              </div>
              <div className="mt-0.5 text-slate-900">
                {productMetas.some((product) => product.usesAnnualPremiumBase)
                  ? annualBase > 0
                    ? `${formatWholeMoney(annualBase)} Kč ročně`
                    : "—"
                  : "Nesleduje se"}
                {productMetas.some((product) => product.usesAnnualPremiumBase) && monthlyBase !== null
                  ? ` · ${formatWholeMoney(monthlyBase)} Kč měsíčně`
                  : ""}
              </div>
            </div>
          </div>

          <StatementCorrectionWarning details={correctionDetails} label={correctionLabel} />
          <StatementCorrectionWarning
            details={currentCorrectionInfo?.details ?? []}
            label={currentCorrectionInfo?.label ?? null}
          />
          <ContractTimelinePositionWarning mismatch={timelinePositionMismatch} />
          <CareerMismatchWarning
            careerCheck={careerCheck}
            hasAmountDifference={amountIssueCount > 0}
          />

          {autoPremiumChange && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
              {autoPremiumChange.direction === "increase" ? (
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              )}
              <div>
                <div className="font-bold">
                  Pojistné {autoPremiumChange.direction === "increase" ? "navýšeno" : "poníženo"}
                </div>
                <div className="mt-0.5 font-medium text-rose-900">
                  Výpis počítá s {autoStatementPremiumBaseText(autoPremiumChange)} pro tuto provizní položku. Systém eviduje {paymentAmountWithFrequencyLabel(autoPremiumChange.systemPremiumBase, autoPremiumChange.systemPaymentFrequency)} ({formatWholeMoney(autoPremiumChange.systemAnnualPremiumBase)} Kč ročně). Rozdíl {formatSignedWholeMoney(autoPremiumChange.difference)} za platbu ({formatSignedWholeMoney(autoPremiumChange.annualDifference)} ročně) odpovídá {autoPremiumChange.source === "stored_history" ? "uložené historii změny pojistného" : "změně pojistného u smlouvy"}{autoPremiumChange.anniversaryDate ? ` k výročí ${formatLocalDate(autoPremiumChange.anniversaryDate)}` : ""}{autoPremiumChange.referenceDate ? ` (výpis do ${formatLocalDate(autoPremiumChange.referenceDate)})` : ""}. Změnu pojistného u auta neberu jako chybu výpisu.
                </div>
              </div>
            </div>
          )}

          {coefficientOverride && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">
                  Výpis sedí na {coefficientSetLabel(coefficientOverride.coefficientSet)}
                </div>
                <div className="mt-0.5 font-medium text-violet-900">
                  Smlouva podle data používá {coefficientSetLabel(coefficientOverride.currentSet)}, ale vyplacené částky ve výpisu jednoznačně odpovídají sadě {coefficientSetLabel(coefficientOverride.coefficientSet)}. Při zápisu výpisu uložím ke smlouvě výjimku a přepočítám položky podle výpisu.
                </div>
              </div>
            </div>
          )}

          <AmountComparisonPanel
            comparisons={amountComparisonsForReview}
            baseComparisons={
              statementPremiumBaseComparison ? [statementPremiumBaseComparison] : []
            }
          />

          {missingB36Warning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>Zrychlený režim: {missingB36Warning.detail}</span>
            </div>
          )}

          <OtherProductCommissionTable
            rows={contract.rows}
            b36Payments={contract.b36Payments}
            pairedB36PaymentIndexes={pairedB36PaymentIndexes}
            generalCommissionKindClass={generalCommissionKindClass}
          />
        </div>
      )}
    </article>
  );
}

function LifeSplitProductsSection({
  contracts,
  matchesByContractNumber,
  deductionRows,
  statementId,
  statementPeriod,
  statementPrefillSource,
  statementKey,
  correctionContext,
  markingControls,
  onConvertNeonRefresh,
}: {
  contracts: LifeSplitContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
  deductionRows?: DeductionCommissionRow[];
  statementId?: string | null;
  statementPeriod?: string | null;
  statementPrefillSource?: StatementCalculatorPrefillSource;
  statementKey: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
  onConvertNeonRefresh?: (
    target: ManualNeonRefreshConversionTarget
  ) => Promise<ManualNeonRefreshConversionResponse>;
}) {
  return (
    <LifeSplitProductsSectionPanel
      contracts={contracts}
      contractTotal={lifeSplitContractTotal}
      contractUncertaintyCount={(contract) =>
        lifeSplitContractUncertaintyCount(
          contract,
          matchesByContractNumber,
          statementPeriod,
          statementKey,
          correctionContext
        )
      }
      uncertaintyCountLabel={uncertaintyCountLabel}
      renderContract={(contract) => (
        <LifeSplitContractCard
          key={`${contract.productCode}-${contract.contractNumber}`}
          contract={contract}
          match={contractMatchForNumber(
            matchesByContractNumber,
            contract.contractNumber,
            lifeSplitContractMatchScope(contract)
          )}
          deductionRows={deductionRows}
          statementId={statementId}
          statementPeriod={statementPeriod}
          statementPrefillSource={statementPrefillSource}
          statementKey={statementKey}
          correctionContext={correctionContext}
          markingControls={markingControls}
          onConvertNeonRefresh={onConvertNeonRefresh}
        />
      )}
    />
  );
}

function UnpairedContractsSection({
  lifeContracts,
  otherContracts,
  matchesByContractNumber,
  deductionRows,
  statementPeriod,
  statementPrefillSource,
  statementKey,
  correctionContext,
  markingControls,
}: {
  lifeContracts: LifeSplitContractPreview[];
  otherContracts: OtherProductContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
  deductionRows?: DeductionCommissionRow[];
  statementPeriod?: string | null;
  statementPrefillSource?: StatementCalculatorPrefillSource;
  statementKey: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalContracts = lifeContracts.length + otherContracts.length;
  if (totalContracts === 0) return null;

  const lifeProductContracts = otherContracts.filter((contract) =>
    contractHasProductCategory(contract, "life")
  );
  const autoProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      contractHasProductCategory(contract, "auto")
  );
  const propertyProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      !contractHasProductCategory(contract, "auto") &&
      contractHasProductCategory(contract, "property")
  );
  const businessProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      !contractHasProductCategory(contract, "auto") &&
      !contractHasProductCategory(contract, "property") &&
      contractHasProductCategory(contract, "business")
  );
  const travelProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      !contractHasProductCategory(contract, "auto") &&
      !contractHasProductCategory(contract, "property") &&
      !contractHasProductCategory(contract, "business") &&
      !contractHasProductCategory(contract, "foreigners") &&
      contractHasProductCategory(contract, "travel")
  );
  const foreignerProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      !contractHasProductCategory(contract, "auto") &&
      !contractHasProductCategory(contract, "property") &&
      !contractHasProductCategory(contract, "business") &&
      contractHasProductCategory(contract, "foreigners")
  );
  const investmentProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      !contractHasProductCategory(contract, "auto") &&
      !contractHasProductCategory(contract, "property") &&
      !contractHasProductCategory(contract, "business") &&
      !contractHasProductCategory(contract, "travel") &&
      !contractHasProductCategory(contract, "foreigners") &&
      (contractHasProductCategory(contract, "investment") ||
        contractHasInvestmentSectionProduct(contract) ||
        contractHasTroyOunceProduct(contract))
  );
  const remainingOtherProductContracts = otherContracts.filter(
    (contract) =>
      !contractHasProductCategory(contract, "life") &&
      !contractHasProductCategory(contract, "auto") &&
      !contractHasProductCategory(contract, "property") &&
      !contractHasProductCategory(contract, "business") &&
      !contractHasProductCategory(contract, "travel") &&
      !contractHasProductCategory(contract, "foreigners") &&
      !contractHasProductCategory(contract, "investment") &&
      !contractHasInvestmentSectionProduct(contract) &&
      !contractHasTroyOunceProduct(contract)
  );

  const totalCommission =
    lifeContracts.reduce((sum, contract) => sum + lifeSplitContractTotal(contract), 0) +
    otherContracts.reduce((sum, contract) => sum + otherProductContractTotal(contract), 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-[0_14px_32px_rgba(120,53,15,0.05)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-amber-500" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 py-4 pl-7 pr-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-amber-950">Nespárované smlouvy</h3>
            <p className="text-sm text-amber-900">
              Smlouvy bez jednoznačné shody v systému. Před zápisem budou vyžadovat ruční kontrolu.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-950">
          <span>{totalContracts} smluv · {formatMoney(totalCommission)} Kč</span>
          <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
            {uncertaintyCountLabel(totalContracts)}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-amber-200 bg-white/45 py-3 pl-4 pr-3 sm:pl-5">
          <LifeSplitProductsSection
            contracts={lifeContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Životní pojištění"
            description="Životní produkty mimo detailní rozpad jsou oddělené od ostatních smluv."
            sectionKind="life"
            contracts={lifeProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Auta"
            description="Auto produkty se párují primárně podle čísla smlouvy. Produkt z výpisu je doplňující kontrola."
            sectionKind="auto"
            enableA101Filter
            contracts={autoProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Majetek a odpovědnost"
            description="Majetkové a odpovědnostní produkty jsou oddělené od ostatních smluv."
            sectionKind="property"
            enableA101Filter
            contracts={propertyProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Podnikatelé"
            description="Podnikatelské produkty jsou oddělené od ostatních smluv."
            sectionKind="business"
            contracts={businessProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Cestovní pojištění"
            description="Cestovní produkty jsou oddělené od ostatních smluv."
            sectionKind="travel"
            contracts={travelProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Cizinci"
            description="Zdravotní pojištění cizinců je oddělené od cestovního pojištění."
            sectionKind="foreigners"
            contracts={foreignerProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Investice"
            description="Investiční produkty jsou oddělené od ostatních smluv."
            sectionKind="investment"
            contracts={investmentProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />

          <OtherProductsSection
            title="Ostatní produkty"
            contracts={remainingOtherProductContracts}
            matchesByContractNumber={matchesByContractNumber}
            deductionRows={deductionRows}
            statementPeriod={statementPeriod}
            statementPrefillSource={statementPrefillSource}
            statementKey={statementKey}
            correctionContext={correctionContext}
            markingControls={markingControls}
          />
        </div>
      )}
    </div>
  );
}

function ManagerCommissionRowCard({
  advisor,
  advisorRowScope,
  group,
  matchesByContractNumber,
  currentUserEmail,
  managerAmountComparisonsByRowKey,
  suggestedStornoDate,
  markingControls,
  onRequestSystemStorno,
}: {
  advisor: ManagerCommissionAdvisor;
  advisorRowScope: string;
  group: ManagerCommissionContractGroup;
  matchesByContractNumber: ContractMatchesByNumber;
  currentUserEmail?: string | null;
  managerAmountComparisonsByRowKey: Map<string, CommissionAmountComparison>;
  suggestedStornoDate: Date | null;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
}) {
  const row = group.rows[0]?.row;
  if (!row) return null;
  const rowKey = group.key;
  const rowItems = group.rows.map((item) => item.row);
  const displayContractNumber = group.contractNumber || row.contractNumber || "—";
  const groupedItemsLabel = czechCountLabel(
    group.rows.length,
    "provizní položka",
    "provizní položky",
    "provizních položek"
  );
  const product = resolveStatementProduct(row.product);
  const products = uniqueProductMetasForRows(rowItems);
  const productLabel =
    products.length === 1
      ? `${products[0].label} · ${products[0].rawCode}`
      : `${products.length} produktů`;
  const codeLabels = [...new Set(rowItems.map((item) => item.type).filter(Boolean))];
  const hasStorno = rowItems.some((item) => item.isStorno);
  const uniqueBases = [...new Set(rowItems.map((item) => formatMoney(item.base)))];
  const uniqueCareers = [...new Set(rowItems.map((item) => item.career).filter(Boolean))];
  const rowComparisons = group.rows
    .map((item) =>
      managerAmountComparisonsByRowKey.get(managerCommissionRowKey(advisorRowScope, item.row))
    )
    .filter((comparison): comparison is CommissionAmountComparison => Boolean(comparison));
  const rowComparisonIssueCount = rowComparisons.filter(
    (comparison) => comparison.status !== "ok"
  ).length;
  const classification = classifyGeneralCommissionCode(row.product, row.type);
  const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team");
  const matchedContract = matchedSystemContractForManagerCommissionRow(row, match);
  const rowBaseComparisonMap = new Map<string, PremiumBaseComparison>();
  rowItems.forEach((item) => {
    const comparison = managerCommissionBaseComparison(
      item,
      matchedContract,
      currentUserEmail
    );
    if (!comparison) return;
    const comparisonKey = [
      comparison.label,
      comparison.statementBasePeriod,
      Math.round(comparison.statementPremiumBase * 100),
      Math.round(comparison.statementAnnualPremiumBase * 100),
      Math.round(comparison.systemPremiumBase * 100),
      Math.round(comparison.systemAnnualPremiumBase * 100),
      comparison.paymentsPerYear,
    ].join(":");
    if (!rowBaseComparisonMap.has(comparisonKey)) {
      rowBaseComparisonMap.set(comparisonKey, comparison);
    }
  });
  const rowBaseComparisons = [...rowBaseComparisonMap.values()];
  const extranetUrl = firstSjednatelExtranetUrl(rowItems, matchedContract);
  const stornoActionTarget: StornoStatementActionTarget | null =
    hasStorno && matchedContract
      ? {
          contract: matchedContract,
          contractNumber: row.contractNumber || matchedContract.contractNumber || "",
          client: row.client || matchedContract.clientName || "—",
          product: productLabel,
          suggestedDate: suggestedStornoDate,
        }
      : null;
  const matchNotice = managerCommissionMatchNotice(match);
  const managerCareerCheck = matchedContract
    ? statementCareerMismatch(
        rowItems,
        managerOverrideForViewer(matchedContract, currentUserEmail)?.position
      )
    : null;
  const hasManagerCareerIssue = Boolean(
    managerCareerCheck &&
      managerCareerCheck.careers.length > 0 &&
      (!managerCareerCheck.systemPosition || managerCareerCheck.mismatched)
  );
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: "team",
          category: "Provize manažera",
          contractNumber: row.contractNumber,
          fallback: rowKey,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: "Provize manažera",
        scope: "team",
        contractNumber: row.contractNumber,
        client: row.client || "—",
        product: productLabel,
        title: "Ručně označená manažerská provize k opravě",
        amount: group.commissionTotal,
        details: [
          `Poradce: ${advisor.advisorName || advisor.advisorNumber}`,
          `Uzavřeno: ${row.signedAt || "—"}`,
          hasStorno ? "Storno" : "Provize",
          `${czechCountLabel(group.rows.length, "řádek", "řádky", "řádků")}: ${
            codeLabels.join(", ") || "—"
          }`,
        ],
      }
    : null;

  return (
    <article
      className={`rounded-2xl border px-4 py-4 ${
        hasStorno ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-slate-50"
      }`}
    >
      {markedItem && (
        <div className="mb-3 flex justify-end">
          <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-base font-bold text-slate-950">
              Smlouva {displayContractNumber}
            </h5>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700">
              <StatementProductLogo product={product} size="xs" />
              {productLabel}
            </span>
            {codeLabels.map((code) => (
              <span
                key={code}
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${generalCommissionKindClass(
                  classifyGeneralCommissionCode(row.product, code).kind
                )}`}
              >
                {code}
              </span>
            ))}
            {group.rows.length > 1 && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                {groupedItemsLabel}
              </span>
            )}
            {hasStorno && (
              <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">
                Storno
              </span>
            )}
            {hasStorno && <StornoSystemStatusBadge contract={matchedContract} />}
            <SystemMatchBadge
              match={match}
              scope="team"
              presentation={systemMatchPresentation}
            />
            {rowComparisons.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  rowComparisonIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {rowComparisonIssueCount === 0
                  ? "Meziprovize sedí"
                  : `${rowComparisonIssueCount} rozdílů meziprovize`}
              </span>
            )}
            {hasManagerCareerIssue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                {statementCareerBadgeLabel(managerCareerCheck?.careers)}
              </span>
            )}
          </div>

          <div className="mt-1 text-[15px] font-semibold text-slate-800">
            {row.client || "Klient nezjištěn"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Uzavřeno: {row.signedAt || "—"}</span>
            <span>
              Typ:{" "}
              {group.rows.length > 1 ? groupedItemsLabel : classification.label}
            </span>
            {row.role && <span>Role: {row.role}</span>}
            <span>Kariéra ve výpisu: {row.career || "—"}</span>
          </div>
          {matchedContract && (
            <div className="mt-1 text-xs font-medium text-emerald-800">
              Systém: {matchedContract.clientName || "klient bez názvu"} ·{" "}
              {matchedContract.adviserName || matchedContract.adviserEmail || "poradce nezjištěn"}
            </div>
          )}
          {(matchedContract || row.detailUrl || extranetUrl) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <BohemkaContractDetailLink contract={matchedContract} compact />
              <ContractDetailLink href={row.detailUrl} compact />
              <SjednatelExtranetLink href={extranetUrl} compact />
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 text-right">
          <div className="rounded-xl bg-slate-950 px-3 py-2 text-white ring-1 ring-slate-800">
            <div className="text-[11px] font-black uppercase tracking-wide !text-white opacity-100">
              Provize
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-200">
              {formatMoney(group.commissionTotal)} Kč
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-950">
            <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
              Rez. fond
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-bold text-rose-900">
              {formatMoney(group.reserveFundTotal)} Kč
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Základna
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {uniqueBases.length === 1 ? `${uniqueBases[0]} Kč` : `${uniqueBases.length} hodnot`}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Kódy
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {codeLabels.join(" · ") || "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Výpisový stupeň
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {uniqueCareers.length === 1
              ? uniqueCareers[0]
              : uniqueCareers.length > 1
                ? `${uniqueCareers.length} stupně`
                : "—"}
          </div>
        </div>
      </div>

      {(rowComparisons.length > 0 || rowBaseComparisons.length > 0) && (
        <AmountComparisonPanel
          comparisons={rowComparisons}
          baseComparisons={rowBaseComparisons}
        />
      )}

      {group.rows.length > 1 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="grid min-w-[620px] grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span>Položka</span>
            <span className="text-right">Základna</span>
            <span className="text-right">Procento</span>
            <span className="text-right">Provize</span>
            <span className="text-right">Rez. fond</span>
          </div>
          <div className="min-w-[620px] divide-y divide-slate-100">
            {group.rows.map(({ row: item }) => {
              const itemClassification = classifyGeneralCommissionCode(item.product, item.type);

              return (
                <div
                  key={`${item.id}-${item.type}-${item.commission}-${item.reserveFund}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${generalCommissionKindClass(itemClassification.kind)}`}
                    >
                      {item.type || "—"}
                    </span>
                    <span className="ml-2 font-medium text-slate-500">
                      {itemClassification.label}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-right font-medium text-slate-600">
                    {formatMoney(item.base)} Kč
                  </span>
                  <span className="whitespace-nowrap text-right font-medium text-slate-600">
                    {item.percent || "—"}
                  </span>
                  <span className="whitespace-nowrap text-right font-bold text-slate-950">
                    {formatMoney(item.commission)} Kč
                  </span>
                  <span className="whitespace-nowrap text-right font-medium text-rose-900">
                    {formatMoney(item.reserveFund)} Kč
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matchNotice && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            matchNotice.tone === "rose"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <div>
            <div className="font-bold">{matchNotice.title}</div>
            {matchNotice.lines.map((line) => (
              <div key={line} className="mt-0.5 font-medium">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {rowComparisonIssueCount > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <div>
            <div className="font-bold">
              {rowComparisonIssueCount === 1
                ? "Meziprovize nesedí se systémem"
                : `${rowComparisonIssueCount} položky meziprovize nesedí se systémem`}
            </div>
            {rowComparisons
              .filter((comparison) => comparison.status !== "ok")
              .map((comparison) => (
                <div key={comparison.key} className="mt-1">
                  <div className="font-medium">
                    {comparison.label}: výpis {formatMoney(comparison.statementAmount)} Kč ·
                    systém {formatMoney(comparison.expectedAmount)} Kč · rozdíl{" "}
                    {comparison.difference > 0 ? "+" : ""}
                    {formatMoney(comparison.difference)} Kč
                  </div>
                  {comparison.reasonTitle && (
                    <div className="mt-0.5 font-bold">{comparison.reasonTitle}</div>
                  )}
                  {comparison.reasonLines?.map((line) => (
                    <div key={`${comparison.key}-${line}`} className="mt-0.5 font-medium">
                      {line}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {hasStorno && (
        <StornoSystemActionPanel
          target={stornoActionTarget}
          onRequestStorno={onRequestSystemStorno}
        />
      )}
    </article>
  );
}

function ManagerCommissionsSection({
  advisors = [],
  matchesByContractNumber,
  currentUserEmail,
  suggestedStornoDate,
  markingControls,
  onRequestSystemStorno,
}: {
  advisors?: ManagerCommissionAdvisor[];
  matchesByContractNumber: ContractMatchesByNumber;
  currentUserEmail?: string | null;
  suggestedStornoDate: Date | null;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedAdvisors, setExpandedAdvisors] = useState<Record<string, boolean>>({});
  const [expandedAdvisorRowSections, setExpandedAdvisorRowSections] = useState<
    Record<string, boolean>
  >({});
  if (advisors.length === 0) return null;

  const totalCommission = advisors.reduce(
    (sum, advisor) => sum + advisor.commission + advisor.stornos + advisor.deductions,
    0
  );
  const totalReserveFund = advisors.reduce((sum, advisor) => sum + advisor.reserveFund, 0);
  const uniqueContractNumberMap = new Map<string, string>();
  for (const row of advisors.flatMap((advisor) => advisor.rows)) {
    const key = normalizeContractNumberForMatch(row.contractNumber);
    if (key && !uniqueContractNumberMap.has(key)) {
      uniqueContractNumberMap.set(key, row.contractNumber);
    }
  }
  const uniqueContractNumbers = [...uniqueContractNumberMap.values()];
  const unpairedContractCount = uniqueContractNumbers.filter((contractNumber) =>
    Boolean(
      managerCommissionMatchNotice(
        contractMatchForNumber(matchesByContractNumber, contractNumber, "team")
      )
    )
  ).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/70 shadow-[0_14px_32px_rgba(67,56,202,0.05)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-indigo-500" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 py-4 pl-7 pr-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-700">
            <UsersRound className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-indigo-950">Provize manažera</h3>
            <p className="text-sm text-indigo-900">
              Meziprovize ze smluv podřízených poradců. Nejde o vlastní sjednané smlouvy.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-950">
          <span>{uniqueContractNumbers.length} smluv · {formatMoney(totalCommission)} Kč</span>
          {unpairedContractCount > 0 && (
            <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">
              {uncertaintyCountLabel(unpairedContractCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-indigo-200 py-4 pl-7 pr-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Manažerská provize
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(totalCommission)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Rez. fond
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(totalReserveFund)} Kč
              </div>
            </div>
          </div>

          {advisors.map((advisor, advisorIndex) => {
            const advisorKey =
              advisor.advisorNumber || `${advisor.advisorName || "poradce"}-${advisorIndex}`;
            const advisorRowScope = advisor.advisorNumber || advisorKey;
            const advisorTotal = advisor.commission + advisor.stornos + advisor.deductions;
            const sortedRows = sortManagerCommissionRows(
              advisor.rows,
              matchesByContractNumber
            );
            const advisorContractNumberMap = new Map<string, string>();
            for (const row of sortedRows) {
              const key = normalizeContractNumberForMatch(row.contractNumber);
              if (key && !advisorContractNumberMap.has(key)) {
                advisorContractNumberMap.set(key, row.contractNumber);
              }
            }
            const advisorContractNumbers = [...advisorContractNumberMap.values()];
            const advisorMatchedContractCount = advisorContractNumbers.filter((contractNumber) => {
              const match = contractMatchForNumber(matchesByContractNumber, contractNumber, "team");
              return Boolean(match?.status === "matched" && matchedSystemContract(match));
            }).length;
            const advisorUnpairedContractCount = advisorContractNumbers.filter((contractNumber) =>
              Boolean(
                managerCommissionMatchNotice(
                  contractMatchForNumber(matchesByContractNumber, contractNumber, "team")
                )
              )
            ).length;
            const managerAmountComparisonsByRowKey = new Map<string, CommissionAmountComparison>();
            for (const row of sortedRows) {
              const match = contractMatchForNumber(
                matchesByContractNumber,
                row.contractNumber,
                "team"
              );
              const matchedContract = matchedSystemContractForManagerCommissionRow(row, match);
              const comparison = buildManagerCommissionAmountComparison(
                row,
                matchedContract,
                currentUserEmail
              );
              if (!comparison) continue;
              managerAmountComparisonsByRowKey.set(
                managerCommissionRowKey(advisorRowScope, row),
                comparison
              );
            }
            const advisorManagerAmountComparisons = [
              ...new Map(
                [...managerAmountComparisonsByRowKey.values()].map((comparison) => [
                  comparison.key,
                  comparison,
                ])
              ).values(),
            ];
            const advisorManagerAmountIssueCount = advisorManagerAmountComparisons.filter(
              (comparison) => comparison.status !== "ok"
            ).length;
            const advisorRowSections = buildManagerCommissionRowSections({
              rows: sortedRows,
              matchesByContractNumber,
              advisorRowScope,
              comparisonsByRowKey: managerAmountComparisonsByRowKey,
            });
            const advisorExpanded = Boolean(expandedAdvisors[advisorKey]);

            return (
              <article
                key={advisorKey}
                className="overflow-hidden rounded-2xl border border-indigo-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAdvisors((previous) => ({
                      ...previous,
                      [advisorKey]: !previous[advisorKey],
                    }))
                  }
                  className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-indigo-50/40 lg:flex-row lg:items-start lg:justify-between"
                  aria-expanded={advisorExpanded}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-slate-950">
                        {advisor.advisorName || "Poradce bez jména"}
                      </h4>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                        {advisor.advisorNumber}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {advisor.position || "Pozice nezjištěna"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{advisor.contractCount} smluv dle výpisu</span>
                      <span>{advisor.rows.length} detailních řádků</span>
                      <span>
                        Spárováno {advisorMatchedContractCount}/{advisorContractNumbers.length}
                      </span>
                      <span>Storna {formatMoney(advisor.stornos)} Kč</span>
                      <span>Odpočty {formatMoney(advisor.deductions)} Kč</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
                    {advisorManagerAmountComparisons.length > 0 && (
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          advisorManagerAmountIssueCount === 0
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-rose-200 bg-rose-50 text-rose-800"
                        }`}
                      >
                        {advisorManagerAmountIssueCount === 0
                          ? "Meziprovize sedí"
                          : `${advisorManagerAmountIssueCount} rozdílů meziprovize`}
                      </span>
                    )}
                    {advisorUnpairedContractCount > 0 && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                        {advisorUnpairedContractCount} k ruční kontrole
                      </span>
                    )}
                    <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white ring-1 ring-slate-800">
                      <div className="text-[11px] font-black uppercase tracking-wide !text-white opacity-100">
                        Celkem
                      </div>
                      <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-200">
                        {formatMoney(advisorTotal)} Kč
                      </div>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-700">
                      <ChevronDown
                        className={`h-5 w-5 transition-transform ${advisorExpanded ? "rotate-180" : ""}`}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </button>

                {advisorExpanded && advisorRowSections.length > 0 && (
                  <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 px-4 py-4">
                    {advisorRowSections.map((section) => {
                      const sectionToggleKey = `${advisorKey}-${section.key}`;
                      const sectionExpanded = Boolean(
                        expandedAdvisorRowSections[sectionToggleKey]
                      );
                      const SectionIcon = managerCommissionRowSectionIcon(section.key);

                      return (
                        <div
                          key={`manager-section-${advisorKey}-${section.key}`}
                          className={`overflow-hidden rounded-2xl border ${section.className}`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedAdvisorRowSections((previous) => ({
                                ...previous,
                                [sectionToggleKey]: !previous[sectionToggleKey],
                              }))
                            }
                            className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                            aria-expanded={sectionExpanded}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/85">
                                <SectionIcon
                                  className="h-5 w-5"
                                  strokeWidth={2.2}
                                  aria-hidden="true"
                                />
                              </span>
                              <div className="min-w-0">
                                <div className="text-base font-bold">{section.label}</div>
                                <div className="text-sm font-medium opacity-80">
                                  {section.description}
                                </div>
                              </div>
                            </div>
                            <span className="inline-flex flex-wrap items-center justify-end gap-2 text-sm font-semibold">
                              <span>{section.contractCount} smluv</span>
                              <span>{section.rows.length} řádků</span>
                              <span>{formatMoney(section.commissionTotal)} Kč</span>
                              {section.differenceCount > 0 && (
                                <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-800">
                                  {section.differenceCount} rozdílů
                                </span>
                              )}
                              {section.manualReviewCount > 0 && (
                                <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-900">
                                  {section.manualReviewCount} k ruční kontrole
                                </span>
                              )}
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${
                                  sectionExpanded ? "rotate-180" : ""
                                }`}
                                strokeWidth={2.2}
                                aria-hidden="true"
                              />
                            </span>
                          </button>
                          {sectionExpanded && (
                            <div className="space-y-3 border-t border-white/70 bg-white px-3 py-3">
                              {section.groups.map((group) => (
                                <ManagerCommissionRowCard
                                  key={`${advisorKey}-${section.key}-${group.key}`}
                                  advisor={advisor}
                                  advisorRowScope={advisorRowScope}
                                  group={group}
                                  matchesByContractNumber={matchesByContractNumber}
                                  currentUserEmail={currentUserEmail}
                                  managerAmountComparisonsByRowKey={
                                    managerAmountComparisonsByRowKey
                                  }
                                  suggestedStornoDate={suggestedStornoDate}
                                  markingControls={markingControls}
                                  onRequestSystemStorno={onRequestSystemStorno}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OtherProductsSection({
  title = "Ostatní smlouvy",
  description = "Primárně seskupeno podle čísla smlouvy. Produkt je doplňující kontrola z výpisu.",
  showTitle = true,
  showDescription = false,
  sectionKind = "other",
  enableA101Filter = false,
  contracts,
  matchesByContractNumber,
  deductionRows,
  statementPeriod,
  statementPrefillSource,
  statementKey,
  correctionContext,
  markingControls,
}: {
  title?: string;
  description?: string;
  showTitle?: boolean;
  showDescription?: boolean;
  sectionKind?: StatementProductSectionKind;
  enableA101Filter?: boolean;
  contracts?: OtherProductContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
  deductionRows?: DeductionCommissionRow[];
  statementPeriod?: string | null;
  statementPrefillSource?: StatementCalculatorPrefillSource;
  statementKey: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
}) {
  return (
    <OtherProductsSectionPanel
      title={title}
      description={description}
      showTitle={showTitle}
      showDescription={showDescription}
      sectionKind={sectionKind}
      enableA101Filter={enableA101Filter}
      contracts={contracts}
      contractHasA101Commission={otherProductContractHasA101Commission}
      contractTotal={otherProductContractTotal}
      contractUncertaintyCount={(contract) =>
        otherProductContractUncertaintyCount(
          contract,
          matchesByContractNumber,
          statementPeriod,
          statementKey,
          correctionContext
        )
      }
      uncertaintyCountLabel={uncertaintyCountLabel}
      renderContract={(contract) => (
        <OtherProductContractCard
          key={contract.key}
          contract={contract}
          match={contractMatchForNumber(
            matchesByContractNumber,
            contract.contractNumber,
            otherProductContractMatchScope(contract)
          )}
          deductionRows={deductionRows}
          statementPeriod={statementPeriod}
          statementPrefillSource={statementPrefillSource}
          statementKey={statementKey}
          correctionContext={correctionContext}
          markingControls={markingControls}
        />
      )}
    />
  );
}

function StatementPreview({
  statement,
  matchesByContractNumber,
  queuedCppA101ContractKeys,
  currentUserEmail,
  selectedStatementId,
  correctionContext,
  markingControls,
  onRequestSystemStorno,
  onConvertNeonRefresh,
}: {
  statement: ParsedStatement;
  matchesByContractNumber: ContractMatchesByNumber;
  queuedCppA101ContractKeys: ReadonlySet<string>;
  currentUserEmail?: string | null;
  selectedStatementId?: string | null;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
  onConvertNeonRefresh?: (
    target: ManualNeonRefreshConversionTarget
  ) => Promise<ManualNeonRefreshConversionResponse>;
}) {
  const statementKey = statementDiscrepancyKey(statement);
  const statementPrefillSource: StatementCalculatorPrefillSource = {
    statementId: selectedStatementId ?? null,
    statementNumber: statement.header.statementNumber ?? null,
    statementPeriod: statement.header.period ?? null,
    statementDate: statement.header.statementDate ?? null,
    statementChronologyMs:
      parseLocalDate(statement.header.statementDate)?.getTime() ??
      parsePeriodEndDate(statement.header.period)?.getTime() ??
      null,
  };
  const visibleOtherProductContracts = statement.otherProductContracts.filter((contract) => {
    const contractNumber = normalizeContractNumberForMatch(contract.contractNumber);
    const productMetas = uniqueProductMetasForRows(contract.rows);
    const productKey = productMetas.length === 1 ? productMetas[0]?.productKey : null;
    const queueItemKey = productKey
      ? cppAutoBatchQueueItemKey({ product: productKey, contractNumber })
      : "";
    if (!queueItemKey || !queuedCppA101ContractKeys.has(queueItemKey)) return true;
    if (!isCppA101QueueProduct(productKey)) return true;
    if (!otherProductContractHasA101Commission(contract)) return true;

    return !isUnpairedContractMatch(
      contractMatchForNumber(
        matchesByContractNumber,
        contract.contractNumber,
        otherProductContractMatchScope(contract)
      )
    );
  });
  const {
    unpairedLifeSplitContracts,
    pairedLifeSplitContracts,
    unpairedOtherProductContracts,
    lifeProductContracts,
    autoProductContracts,
    propertyProductContracts,
    businessProductContracts,
    travelProductContracts,
    foreignerProductContracts,
    investmentProductContracts,
    remainingOtherProductContracts,
  } = groupStatementPreviewContracts({
    lifeSplitContracts: statement.lifeSplitContracts,
    otherProductContracts: visibleOtherProductContracts,
    isUnpairedLifeSplitContract: (contract) =>
      isUnpairedContractMatch(
        contractMatchForNumber(
          matchesByContractNumber,
          contract.contractNumber,
          lifeSplitContractMatchScope(contract)
        )
      ),
    isUnpairedOtherProductContract: (contract) =>
      isUnpairedContractMatch(
        contractMatchForNumber(
          matchesByContractNumber,
          contract.contractNumber,
          otherProductContractMatchScope(contract)
        )
      ),
    hasOtherProductCategory: contractHasProductCategory,
  });
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <StatementPreviewHeader
        fileName={statement.fileName}
        statementNumber={statement.header.statementNumber}
        statementDate={statement.header.statementDate}
      />
      <StatementParseWarnings warnings={statement.parseWarnings} />

      <StatementSummary statement={statement} />

      <LifeSplitProductsSection
        contracts={pairedLifeSplitContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementId={selectedStatementId}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
        onConvertNeonRefresh={onConvertNeonRefresh}
      />

      <OtherProductsSection
        title="Životní pojištění"
        description="Životní produkty mimo detailní rozpad jsou oddělené od ostatních smluv."
        sectionKind="life"
        contracts={lifeProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Auta"
        description="Auto produkty se párují primárně podle čísla smlouvy. Produkt z výpisu je doplňující kontrola."
        sectionKind="auto"
        contracts={autoProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Majetek a odpovědnost"
        description="Majetkové a odpovědnostní produkty jsou oddělené od ostatních smluv."
        sectionKind="property"
        contracts={propertyProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Podnikatelé"
        description="Podnikatelské produkty jsou oddělené od ostatních smluv."
        sectionKind="business"
        contracts={businessProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Cestovní pojištění"
        description="Cestovní produkty jsou oddělené od ostatních smluv."
        sectionKind="travel"
        contracts={travelProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Cizinci"
        description="Zdravotní pojištění cizinců je oddělené od cestovního pojištění."
        sectionKind="foreigners"
        contracts={foreignerProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Investice"
        description="Investiční produkty jsou oddělené od ostatních smluv."
        sectionKind="investment"
        contracts={investmentProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        title="Ostatní produkty"
        contracts={remainingOtherProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <UnpairedContractsSection
        lifeContracts={unpairedLifeSplitContracts}
        otherContracts={unpairedOtherProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        deductionRows={statement.deductionRows}
        statementPeriod={statement.header.period}
        statementPrefillSource={statementPrefillSource}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      {statement.unmatchedB36Payments.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <h3 className="text-base font-bold text-amber-950">
            B36 bez detailního řádku ve výpisu
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            Tyto položky se mají při ostrém importu dopárovat podle čísla smlouvy v našem systému.
          </p>
          <div className="mt-3 space-y-2">
            {statement.unmatchedB36Payments.map((payment, index) => {
              const match = contractMatchForNumber(matchesByContractNumber, payment.contractNumber);
              const systemContract = matchedSystemContract(match);
              const markedItem: MarkedDiscrepancyItem | null = markingControls
                ? {
                    key: markedDiscrepancyKey({
                      statementKey: markingControls.statementKey,
                      scope: "my",
                      category: "Ostatní platby",
                      contractNumber: payment.contractNumber,
                      fallback: `unmatched-b36-${index}`,
                    }),
                    statementKey: markingControls.statementKey,
                    statementLabel: markingControls.statementLabel,
                    category: "Ostatní platby",
                    scope: "my",
                    contractNumber: payment.contractNumber,
                    client: "—",
                    product: "B36 / ostatní platby",
                    title: "Ručně označená B36 položka k opravě",
                    amount: payment.amount,
                    details: [payment.description],
                  }
                : null;

              return (
                <div
                  key={`${payment.contractNumber}-${index}`}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                        <span>Smlouva {payment.contractNumber ?? "—"}</span>
                        <BohemkaContractDetailLink contract={systemContract} compact />
                        <SystemMatchBadge
                          match={match}
                          presentation={systemMatchPresentation}
                        />
                      </div>
                      {markedItem && (
                        <div className="mt-2">
                          <MarkedDiscrepancyToggle
                            item={markedItem}
                            markingControls={markingControls}
                          />
                        </div>
                      )}
                      <div className="text-slate-600">{payment.description}</div>
                    </div>
                    <div className="whitespace-nowrap font-bold text-slate-950">
                      {formatMoney(payment.amount)} Kč
                    </div>
                  </div>
                  <SystemMatchPanel match={match} presentation={systemMatchPresentation} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <StornoContractsSectionPanel
        statement={statement}
        statementId={selectedStatementId}
        matchesByContractNumber={matchesByContractNumber}
        currentUserEmail={currentUserEmail}
        markingControls={markingControls}
        onRequestSystemStorno={onRequestSystemStorno}
        presentation={systemMatchPresentation}
      />

      <ManagerCommissionsSection
        advisors={statement.managerCommissions}
        matchesByContractNumber={matchesByContractNumber}
        currentUserEmail={currentUserEmail}
        suggestedStornoDate={suggestedStornoDateForStatement(statement.header)}
        markingControls={markingControls}
        onRequestSystemStorno={onRequestSystemStorno}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <CommissionCodeRulesPanel statement={statement} />
        <ContractStatusRulesPanel rules={statement.contractStatusRules} />
      </div>
    </section>
  );
}

export default function CommissionStatementsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [adminImpersonation, setAdminImpersonation] =
    useState<AdminImpersonationState | null>(() =>
      typeof window === "undefined" ? null : readAdminImpersonationState()
    );
  const [statements, setStatements] = useState<ParsedStatement[]>([]);
  const [statementFilesForProcessing, setStatementFilesForProcessing] = useState<
    StatementFileRead[]
  >([]);
  const [matchesByContractNumber, setMatchesByContractNumber] =
    useState<ContractMatchesByNumber>({});
  const [markingMode, setMarkingMode] = useState(false);
  const [markedDiscrepancies, setMarkedDiscrepancies] = useState<MarkedDiscrepancies>({});
  const [discrepancyNotes, setDiscrepancyNotes] = useState<Record<string, string>>({});
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [contractDetailModal, setContractDetailModal] =
    useState<BohemkaContractDetailModalPayload | null>(null);
  const [calculatorPrefillPanel, setCalculatorPrefillPanel] =
    useState<StatementCalculatorPrefill | null>(null);
  const [cppAutoBatchQueue, setCppAutoBatchQueue] = useState<CppAutoBatchQueueItem[]>([]);
  const [cppAutoBatchQueueRunning, setCppAutoBatchQueueRunning] = useState(false);
  const [cppAutoBatchQueueNotice, setCppAutoBatchQueueNotice] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [statementSaveState, setStatementSaveState] = useState<StatementSaveState>({
    status: "idle",
    message: null,
  });
  const statementProcessingInFlightRef = useRef(false);
  const lastMatchEffectiveUserEmailRef = useRef<string | null>(null);
  const [processingAuditSummary, setProcessingAuditSummary] =
    useState<StatementProcessingSummary | null>(null);
  const [stornoActionTarget, setStornoActionTarget] =
    useState<StornoStatementActionTarget | null>(null);
  const [stornoActionDateInput, setStornoActionDateInput] = useState("");
  const [stornoActionSaving, setStornoActionSaving] = useState(false);
  const [stornoActionError, setStornoActionError] = useState<string | null>(null);
  const statementRecordsProcessing = statementSaveState.status === "saving";
  const statementRecordsProcessed = statementSaveState.status === "saved";
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processedStatementHistory, setProcessedStatementHistory] = useState<
    SavedCommissionStatement[]
  >([]);
  const [processedStatementHistoryLoading, setProcessedStatementHistoryLoading] =
    useState(false);
  const [processedStatementHistoryError, setProcessedStatementHistoryError] =
    useState<string | null>(null);
  const [processedStatementHistoryVisible, setProcessedStatementHistoryVisible] =
    useState(false);
  const [selectedHistoryStatementId, setSelectedHistoryStatementId] = useState<string | null>(null);
  const [processedStatementIdsByKey, setProcessedStatementIdsByKey] =
    useState<Record<string, string>>({});
  const [openingHistoryStatementId, setOpeningHistoryStatementId] = useState<string | null>(null);
  const [neonRefreshPromptTargets, setNeonRefreshPromptTargets] = useState<
    PostProcessingNeonRefreshPromptTarget[]
  >([]);
  const [neonRefreshPromptSaving, setNeonRefreshPromptSaving] = useState(false);
  const [neonRefreshPromptError, setNeonRefreshPromptError] = useState<string | null>(null);
  const [statementProductMapLoaded, setStatementProductMapLoaded] = useState(false);
  const effectiveUserEmail =
    normalizeEmailForComparison(adminImpersonation?.email) ||
    normalizeEmailForComparison(user?.email);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncImpersonation = () => {
      setAdminImpersonation(readAdminImpersonationState());
    };
    syncImpersonation();
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    return () => {
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setActiveStatementProductMapping(null);
      setStatementProductMapLoaded(false);
      return () => {
        cancelled = true;
      };
    }

    setStatementProductMapLoaded(false);
    void fetchStatementProductMap(user)
      .then((entries) => {
        if (cancelled) return;
        setActiveStatementProductMapping(entries);
        setStatementProductMapLoaded(true);
      })
      .catch((mapError) => {
        if (cancelled) return;
        console.warn("Provizní výpisy: produktovou mapu se nepodařilo načíst.", mapError);
        setActiveStatementProductMapping(null);
        setStatementProductMapLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const refreshProcessedStatementHistory = async () => {
    if (!user) {
      setProcessedStatementHistory([]);
      setProcessedStatementHistoryError(null);
      setProcessedStatementHistoryLoading(false);
      return;
    }

    setProcessedStatementHistoryLoading(true);
    setProcessedStatementHistoryError(null);

    try {
      const items = await fetchProcessedCommissionStatementHistory(user);
      setProcessedStatementHistory(items);
    } catch (historyError) {
      console.warn("Provizní výpisy: historii zpracovaných výpisů se nepodařilo načíst.", historyError);
      setProcessedStatementHistoryError(
        historyError instanceof Error
          ? historyError.message
          : "Historii zpracovaných výpisů se nepodařilo načíst."
      );
    } finally {
      setProcessedStatementHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (user) return;

    setProcessedStatementHistory([]);
    setProcessedStatementHistoryError(null);
    setProcessedStatementHistoryLoading(false);
    setProcessedStatementHistoryVisible(false);
    setSelectedHistoryStatementId(null);
    setProcessedStatementIdsByKey({});
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
  }, [user]);

  useEffect(() => {
    if (!statementRecordsProcessing) {
      setProcessingStepIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setProcessingStepIndex((previous) =>
        Math.min(previous + 1, PROCESSING_CAPTIONS.length - 1)
      );
    }, 1700);

    return () => window.clearInterval(intervalId);
  }, [statementRecordsProcessing]);

  const openStornoActionModal = (target: StornoStatementActionTarget) => {
    const suggestedDate = target.inference?.suggestedDate ?? target.suggestedDate;
    setStornoActionTarget(target);
    setStornoActionDateInput(toDateInputValue(suggestedDate));
    setStornoActionError(null);
  };

  const closeStornoActionModal = () => {
    if (stornoActionSaving) return;
    setStornoActionTarget(null);
    setStornoActionError(null);
  };

  const updateMatchedContractStornoState = (
    ownerEmail: string,
    entryIds: string[],
    stornoDate: Date
  ) => {
    const normalizedOwner = normalizeEmailForComparison(ownerEmail);
    const entryIdSet = new Set(entryIds);
    const stornoDateMs = stornoDate.getTime();

    setMatchesByContractNumber((previous) => {
      let touched = false;
      const nextEntries = Object.entries(previous).map(([key, match]) => {
        const contracts = match.contracts.map((contract) => {
          if (
            normalizeEmailForComparison(contract.adviserEmail) !== normalizedOwner ||
            !entryIdSet.has(contract.id)
          ) {
            return contract;
          }

          touched = true;
          return {
            ...contract,
            status: "storno",
            stornoDate: stornoDateMs,
          };
        });

        const matchChanged = contracts.some(
          (contract, index) => contract !== match.contracts[index]
        );
        return [key, matchChanged ? { ...match, contracts } : match] as const;
      });

      return touched ? Object.fromEntries(nextEntries) : previous;
    });
  };

  const updateMatchedContractRefreshState = (
    ownerEmail: string,
    entryId: string,
    patch: Partial<MatchedSystemContract>
  ) => {
    const normalizedOwner = normalizeEmailForComparison(ownerEmail);

    setMatchesByContractNumber((previous) => {
      let touched = false;
      const nextEntries = Object.entries(previous).map(([key, match]) => {
        const contracts = match.contracts.map((contract) => {
          if (
            normalizeEmailForComparison(contract.adviserEmail) !== normalizedOwner ||
            contract.id !== entryId
          ) {
            return contract;
          }

          touched = true;
          return {
            ...contract,
            ...patch,
            id: contract.id,
            adviserEmail: contract.adviserEmail,
          };
        });

        const matchChanged = contracts.some(
          (contract, index) => contract !== match.contracts[index]
        );
        return [key, matchChanged ? { ...match, contracts } : match] as const;
      });

      return touched ? Object.fromEntries(nextEntries) : previous;
    });
  };

  const convertNeonRefreshFromStatement = async ({
    statementId,
    contract,
    contractNumber,
  }: ManualNeonRefreshConversionTarget): Promise<ManualNeonRefreshConversionResponse> => {
    if (!user) {
      throw new Error("Pro převod smlouvy na REFRESH musíš být přihlášený.");
    }

    const ownerEmail = normalizeEmailForComparison(contract.adviserEmail);
    const entryId = normalizeText(contract.id);
    if (!ownerEmail || !entryId || !statementId) {
      throw new Error("Spárovaná smlouva nemá dostatek údajů pro převod na REFRESH.");
    }

    const sendRequest = async (token: string) =>
      fetch("/api/commission-statements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "convert-neon-refresh-from-statement",
          statementId,
          ownerEmail,
          entryId,
          contractNumber,
        }),
      });

    let token = await user.getIdToken();
    let response = await sendRequest(token);
    if (response.status === 401) {
      token = await user.getIdToken(true);
      response = await sendRequest(token);
    }

    const payload = (await response.json().catch(() => null)) as
      | ManualNeonRefreshConversionResponse
      | null;
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error || "Převod na REFRESH se nepodařilo uložit.");
    }

    if (payload.contract) {
      updateMatchedContractRefreshState(ownerEmail, entryId, payload.contract);
    }

    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("contracts_cache_v3");
        localStorage.setItem("contracts_last_updated", String(Date.now()));
        window.dispatchEvent(new Event("contracts:updated"));
      } catch {
        // best effort cache invalidation
      }
    }

    void refreshProcessedStatementHistory();
    return payload;
  };

  const activeNeonRefreshPromptTarget = neonRefreshPromptTargets[0] ?? null;

  const closeNeonRefreshPrompt = () => {
    if (neonRefreshPromptSaving) return;
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
  };

  const confirmNeonRefreshPrompt = async () => {
    if (!activeNeonRefreshPromptTarget) return;
    setNeonRefreshPromptSaving(true);
    setNeonRefreshPromptError(null);

    try {
      await convertNeonRefreshFromStatement(activeNeonRefreshPromptTarget);
      setNeonRefreshPromptTargets((previous) =>
        previous.filter((target) => target.key !== activeNeonRefreshPromptTarget.key)
      );
    } catch (conversionError) {
      setNeonRefreshPromptError(
        conversionError instanceof Error
          ? conversionError.message
          : "Převod smlouvy na REFRESH se nepodařil."
      );
    } finally {
      setNeonRefreshPromptSaving(false);
    }
  };

  const confirmStornoAction = async () => {
    if (!stornoActionTarget) return;

    if (!user) {
      setStornoActionError("Pro úpravu smlouvy musíš být přihlášený.");
      return;
    }

    const parsedDate = stornoActionDateInput ? new Date(stornoActionDateInput) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      setStornoActionError("Zadej platné datum storna.");
      return;
    }

    const ownerEmail = normalizeEmailForComparison(stornoActionTarget.contract.adviserEmail);
    const entryIds = stornoUpdateEntryIds(stornoActionTarget.contract);
    if (!ownerEmail || entryIds.length === 0) {
      setStornoActionError("Spárovaná smlouva nemá dostatek údajů pro úpravu.");
      return;
    }

    setStornoActionSaving(true);
    setStornoActionError(null);

    try {
      const sendRequest = async (token: string) =>
        fetch("/api/contracts/update-fields", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerEmail,
            entryIds,
            updates: {
              status: "storno",
              stornoDate: parsedDate,
            },
          }),
        });

      let token = await user.getIdToken();
      let response = await sendRequest(token);
      if (response.status === 401) {
        token = await user.getIdToken(true);
        response = await sendRequest(token);
      }

      const payload = (await response.json().catch(() => null)) as
        | ContractsMutationResponse
        | null;
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Storno se nepodařilo uložit.");
      }

      updateMatchedContractStornoState(ownerEmail, entryIds, parsedDate);
      setStornoActionTarget(null);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }
    } catch (saveError) {
      console.error("Provizní výpisy: označení smlouvy jako storno selhalo.", saveError);
      setStornoActionError(
        saveError instanceof Error
          ? saveError.message
          : "Storno se nepodařilo uložit."
      );
    } finally {
      setStornoActionSaving(false);
    }
  };

  const statementContractMatchRequests = useMemo(
    () => collectStatementContractMatchRequests(statements),
    [statements]
  );

  useEffect(() => {
    let cancelled = false;
    const previousEffectiveUserEmail = lastMatchEffectiveUserEmailRef.current;
    const effectiveUserChanged = previousEffectiveUserEmail !== effectiveUserEmail;
    lastMatchEffectiveUserEmailRef.current = effectiveUserEmail || null;

    setMatchingError(null);

    if (statements.length === 0 || statementContractMatchRequests.length === 0) {
      setMatchesByContractNumber({});
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setMatchesByContractNumber({});
      return () => {
        cancelled = true;
      };
    }

    setMatchesByContractNumber((previous) => {
      const next: ContractMatchesByNumber = {};
      for (const request of statementContractMatchRequests) {
        const key = contractMatchKey(request.scope, request.contractNumber);
        if (!key) continue;
        next[key] =
          !effectiveUserChanged && previous[key]?.status === "matched"
            ? previous[key]
            : { status: "loading", contracts: [] };
      }
      return next;
    });

    void fetchSystemContractMatches(
      user,
      statementContractMatchRequests,
      (request, match) => {
        if (cancelled) return;
        const key = contractMatchKey(request.scope, request.contractNumber);
        if (!key) return;
        setMatchesByContractNumber((previous) => ({
          ...previous,
          [key]: match,
        }));
      },
      dedupeEquivalentSystemContracts
    ).catch((err) => {
      if (cancelled) return;
      setMatchingError(
        err instanceof Error
          ? err.message
          : "Nepodařilo se spustit párování smluv se systémem."
      );
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveUserEmail, statementContractMatchRequests, statements.length, user]);

  useEffect(() => {
    if (!user || statementContractMatchRequests.length === 0) return;
    let cancelled = false;

    const handleStatementContractSaved = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isStatementContractSavedMessage(event.data)) return;

      const normalizedSavedContractNumber = normalizeContractNumberForMatch(
        event.data.contractNumber
      );
      if (!normalizedSavedContractNumber) return;

      const requests = statementContractMatchRequests.filter(
        (request) =>
          normalizeContractNumberForMatch(request.contractNumber) ===
          normalizedSavedContractNumber
      );
      if (requests.length === 0) return;

      setMatchesByContractNumber((previous) => {
        const next = { ...previous };
        for (const request of requests) {
          const key = contractMatchKey(request.scope, request.contractNumber);
          if (!key) continue;
          next[key] = { status: "loading", contracts: [] };
        }
        return next;
      });

      void fetchSystemContractMatchBatch(user, requests, dedupeEquivalentSystemContracts)
        .then((matches) => {
          if (cancelled) return;
          setMatchesByContractNumber((previous) => {
            const next = { ...previous };
            for (const request of requests) {
              const key = contractMatchKey(request.scope, request.contractNumber);
              if (!key) continue;
              next[key] =
                matches.get(key) ??
                systemContractMatchError(
                  "Párování po uložení smlouvy nevrátilo výsledek."
                );
            }
            return next;
          });
        })
        .catch((matchError) => {
          if (cancelled) return;
          const message =
            matchError instanceof Error
              ? matchError.message
              : "Nepodařilo se znovu spárovat uloženou smlouvu.";
          setMatchesByContractNumber((previous) => {
            const next = { ...previous };
            for (const request of requests) {
              const key = contractMatchKey(request.scope, request.contractNumber);
              if (!key) continue;
              next[key] = systemContractMatchError(message);
            }
            return next;
          });
        });
    };

    window.addEventListener("message", handleStatementContractSaved);
    return () => {
      cancelled = true;
      window.removeEventListener("message", handleStatementContractSaved);
    };
  }, [statementContractMatchRequests, user]);

  useEffect(() => {
    const handleStatementContractSaveCompleted = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isStatementContractSaveCompletedMessage(event.data)) return;
      setCalculatorPrefillPanel(null);
    };

    window.addEventListener("message", handleStatementContractSaveCompleted);
    return () => {
      window.removeEventListener("message", handleStatementContractSaveCompleted);
    };
  }, []);

  useEffect(() => {
    const handleCppA101QueueAdd = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isStatementCppA101QueueAddMessage(event.data)) return;

      const prefill = calculatorPrefillPanel;
      if (
        !prefill ||
        !isCppA101QueueProduct(prefill.product) ||
        prefill.product !== event.data.product ||
        !prefill.cppA101QueueEligible
      ) {
        return;
      }

      const queuedPrefill: StatementCalculatorPrefill = {
        ...prefill,
        contractNumber: event.data.contractNumber.trim(),
        clientName: event.data.clientName.trim(),
        contractSignedDate: event.data.contractSignedDate.trim(),
        policyStartDate: event.data.policyStartDate.trim(),
        amountText: event.data.amountText.trim(),
        frequency: event.data.frequency,
      };
      const pdfFile =
        typeof File !== "undefined" && event.data.pdfFile instanceof File
          ? event.data.pdfFile
          : null;
      const nextItem = {
        ...cppAutoBatchQueueItemFromPrefill(queuedPrefill),
        stornoDate: event.data.stornoDate.trim(),
        pdfFile,
      };
      const contractKey = cppAutoBatchQueueItemKey(queuedPrefill);

      setCppAutoBatchQueue((previous) => {
        const duplicate = contractKey
          ? previous.some((item) => cppAutoBatchQueueItemKey(item) === contractKey)
          : false;
        if (duplicate) return previous;
        return [...previous, nextItem];
      });
      setCppAutoBatchQueueNotice(
        contractKey
          ? `Smlouva ${queuedPrefill.contractNumber} je připravená ve frontě.`
          : "Smlouva je připravená ve frontě; před nahráním doplň její číslo."
      );
    };

    window.addEventListener("message", handleCppA101QueueAdd);
    return () => window.removeEventListener("message", handleCppA101QueueAdd);
  }, [calculatorPrefillPanel]);

  const matchStats = useMemo<ContractMatchStats>(() => {
    let matched = 0;
    let loading = 0;
    let notFound = 0;
    let errors = 0;

    for (const request of statementContractMatchRequests) {
      const match = contractMatchForNumber(
        matchesByContractNumber,
        request.contractNumber,
        request.scope
      );
      if (match?.status === "matched") matched += 1;
      else if (match?.status === "loading") loading += 1;
      else if (match?.status === "not_found") notFound += 1;
      else if (match?.status === "error") errors += 1;
    }

    const total = statementContractMatchRequests.length;
    const completed = matched + notFound + errors;
    const pending = Math.max(0, total - completed - loading);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      matched,
      loading,
      notFound,
      errors,
      pending,
      completed,
      progress,
    };
  }, [matchesByContractNumber, statementContractMatchRequests]);

  const statementCorrectionContext = useMemo(
    () => buildStatementCorrectionContext(statements),
    [statements]
  );

  const markedDiscrepancyItems = useMemo(
    () => Object.values(markedDiscrepancies),
    [markedDiscrepancies]
  );

  const allAutoDiscrepancyIssues = useMemo(
    () =>
      statements.flatMap((statement) =>
        buildStatementDiscrepancyIssues(
          statement,
          matchesByContractNumber,
          effectiveUserEmail,
          statementCorrectionContext
        )
      ),
    [effectiveUserEmail, matchesByContractNumber, statementCorrectionContext, statements]
  );

  const selectedPdfItems = useMemo<DiscrepancyPdfItem[]>(
    () =>
      markedDiscrepancyItems.map((item) => ({
        ...item,
        note: normalizeText(discrepancyNotes[item.key]),
        autoIssues: matchingAutoIssuesForMarkedItem(item, allAutoDiscrepancyIssues),
      })),
    [allAutoDiscrepancyIssues, discrepancyNotes, markedDiscrepancyItems]
  );
  const activeProcessingCaption =
    PROCESSING_CAPTIONS[processingStepIndex % PROCESSING_CAPTIONS.length];
  const processingProgressPercent = Math.round(
    ((processingStepIndex + 1) / PROCESSING_CAPTIONS.length) * 100
  );

  const toggleMarkedDiscrepancy = (item: MarkedDiscrepancyItem, selected: boolean) => {
    setMarkedDiscrepancies((previous) => {
      if (selected) {
        return {
          ...previous,
          [item.key]: item,
        };
      }

      const next = { ...previous };
      delete next[item.key];
      return next;
    });

    if (!selected) {
      setDiscrepancyNotes((previous) => {
        if (!(item.key in previous)) return previous;
        const next = { ...previous };
        delete next[item.key];
        return next;
      });
    }
  };

  const downloadSelectedDiscrepancies = async () => {
    if (selectedPdfItems.length === 0) return;
    setPdfError(null);
    setPdfDownloading(true);
    try {
      await downloadDiscrepancySummaryPdf(selectedPdfItems);
      setReportModalOpen(false);
    } catch (downloadError) {
      console.error("Provizní výpisy: stažení souhrnu nesrovnalostí selhalo.", downloadError);
      setPdfError(
        downloadError instanceof Error
          ? downloadError.message
          : "Souhrn nesrovnalostí se nepodařilo stáhnout."
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  const resetStatementWorkspace = () => {
    setStatements([]);
    setStatementFilesForProcessing([]);
    setError(null);
    setMatchingError(null);
    setStatementSaveState({ status: "idle", message: null });
    setProcessingAuditSummary(null);
    setMatchesByContractNumber({});
    setMarkingMode(false);
    setMarkedDiscrepancies({});
    setDiscrepancyNotes({});
    setReportModalOpen(false);
    setContractDetailModal(null);
    setPdfError(null);
    setStornoActionTarget(null);
    setStornoActionError(null);
    setStornoActionSaving(false);
    setSelectedHistoryStatementId(null);
    setProcessedStatementIdsByKey({});
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
    setNeonRefreshPromptSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parseFiles = async (files: FileList | File[]) => {
    const htmlFiles = Array.from(files).filter((file) =>
      /\.html?$/i.test(file.name)
    );
    if (htmlFiles.length === 0) {
      setError("Vyber HTML soubor provizního výpisu.");
      return;
    }

    setParsing(true);
    setError(null);
    setMatchingError(null);
    setStatementSaveState({ status: "idle", message: null });
    setProcessingAuditSummary(null);
    setStatementFilesForProcessing([]);
    setMatchesByContractNumber({});
    setMarkingMode(false);
    setMarkedDiscrepancies({});
    setDiscrepancyNotes({});
    setReportModalOpen(false);
    setContractDetailModal(null);
    setPdfError(null);
    setStornoActionTarget(null);
    setStornoActionError(null);
    setStornoActionSaving(false);
    setSelectedHistoryStatementId(null);
    setProcessedStatementIdsByKey({});
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
    setNeonRefreshPromptSaving(false);

    if (user && !statementProductMapLoaded) {
      try {
        const entries = await fetchStatementProductMap(user);
        setActiveStatementProductMapping(entries);
        setStatementProductMapLoaded(true);
      } catch (mapError) {
        console.warn("Provizní výpisy: produktovou mapu před importem se nepodařilo načíst.", mapError);
        setActiveStatementProductMapping(null);
        setStatementProductMapLoaded(true);
      }
    }

    let parsedFiles: StatementFileRead[];
    try {
      parsedFiles = await Promise.all(htmlFiles.map((file) => readStatementFile(file)));
    } catch (parseError) {
      console.error("Provizní výpisy: importní náhled selhal.", parseError);
      setError("Soubor se nepodařilo přečíst. Zkontroluj, že jde o uložený HTML výpis.");
      setParsing(false);
      return;
    }

    const uniqueParsedFiles = [
      ...new Map(
        parsedFiles.map((file) => [statementBusinessIdentityKey(file.statement), file])
      ).values(),
    ];
    setStatements(uniqueParsedFiles.map((file) => file.statement));
    setStatementFilesForProcessing(uniqueParsedFiles);

    if (!user) {
      setStatementSaveState({
        status: "error",
        message: "Výpis je jen připravený. Pro zpracování záznamu musíš být přihlášený.",
      });
      setParsing(false);
      return;
    }

    setStatementSaveState({
      status: "ready",
      message: "Výpis je připravený ke kontrole. Zápis proběhne až po kliknutí na Zpracovat záznam.",
    });
    setParsing(false);
  };

  const openProcessedStatementFromHistory = async (statementId: string) => {
    const normalizedStatementId = statementId.trim();
    if (!normalizedStatementId) return;

    if (!user) {
      setError("Pro otevření historie musíš být přihlášený.");
      return;
    }

    setOpeningHistoryStatementId(normalizedStatementId);
    setError(null);
    setMatchingError(null);

    try {
      const request = async (forceRefreshToken = false) => {
        const token = await user.getIdToken(forceRefreshToken);
        return fetch(
          `/api/commission-statements?id=${encodeURIComponent(normalizedStatementId)}&includeHtml=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );
      };

      let response = await request(false);
      if (response.status === 401) {
        response = await request(true);
      }

      const payload = (await response.json().catch(() => null)) as
        | SavedCommissionStatementsResponse
        | null;

      if (!response.ok || payload?.ok !== true || !payload.item?.html) {
        throw new Error(payload?.error || "Zpracovaný výpis se nepodařilo otevřít.");
      }

      if (!isProcessedSavedStatement(payload.item)) {
        throw new Error("Tento výpis není označený jako zpracovaný.");
      }

      const statementFile: StatementFileRead = {
        html: payload.item.html,
        statement: parseStatementHtml(
          payload.item.html,
          payload.item.fileName || "Provizní výpis.html"
        ),
      };

      setStatements([statementFile.statement]);
      setStatementFilesForProcessing([]);
      setStatementSaveState({
        status: "saved",
        message: "Načteno ze zpracované historie.",
      });
      setProcessingAuditSummary(
        payload.item.processingResult ? sumProcessingResults([payload.item.processingResult]) : null
      );
      setMatchesByContractNumber({});
      setMarkingMode(false);
      setMarkedDiscrepancies({});
      setDiscrepancyNotes({});
      setReportModalOpen(false);
      setContractDetailModal(null);
      setPdfError(null);
      setStornoActionTarget(null);
      setStornoActionError(null);
      setStornoActionSaving(false);
      setSelectedHistoryStatementId(normalizedStatementId);
      setProcessedStatementIdsByKey({
        [statementDiscrepancyKey(statementFile.statement)]: normalizedStatementId,
      });
      setProcessedStatementHistoryVisible(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (historyOpenError) {
      console.error("Provizní výpisy: otevření zpracovaného výpisu z historie selhalo.", historyOpenError);
      setError(
        historyOpenError instanceof Error
          ? historyOpenError.message
          : "Zpracovaný výpis se nepodařilo otevřít."
      );
    } finally {
      setOpeningHistoryStatementId(null);
    }
  };

  const processStatementRecords = async () => {
    if (statementProcessingInFlightRef.current || statementRecordsProcessed) return;

    if (statementFilesForProcessing.length === 0) {
      setStatementSaveState({
        status: "error",
        message: "Nejdřív nahraj HTML výpis.",
      });
      return;
    }

    if (!user) {
      setStatementSaveState({
        status: "error",
        message: "Pro zpracování záznamu musíš být přihlášený.",
      });
      return;
    }

    statementProcessingInFlightRef.current = true;
    setProcessingStepIndex(0);
    setStatementSaveState({
      status: "saving",
      message: "Zpracovávám záznam a ukládám výpis pro provizní kalendář…",
    });
    setProcessingAuditSummary(null);

    try {
      const token = await user.getIdToken();
      const filesForProcessing = [
        ...new Map(
          statementFilesForProcessing.map((file) => [
            statementBusinessIdentityKey(file.statement),
            file,
          ])
        ).values(),
      ].sort(
        (left, right) =>
          statementFileReadSortValue(left, statementFilesForProcessing.indexOf(left)) -
          statementFileReadSortValue(right, statementFilesForProcessing.indexOf(right))
      );
      const processingResults: StatementProcessingResult[] = [];
      const nextProcessedStatementIdsByKey: Record<string, string> = {};
      for (const parsedFile of filesForProcessing) {
        const response = await fetch("/api/commission-statements", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildStatementSavePayload(parsedFile)),
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              item?: SavedCommissionStatement;
              processingResult?: StatementProcessingResult;
            }
          | null;
        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.error || "Provizní výpis se nepodařilo uložit.");
        }
        processingResults.push(payload.processingResult ?? {});
        if (payload.item?.id) {
          nextProcessedStatementIdsByKey[statementDiscrepancyKey(parsedFile.statement)] =
            payload.item.id;
        }
      }
      const processingSummary = sumProcessingResults(processingResults);
      const processedStatementIds = Object.values(nextProcessedStatementIdsByKey);

      setStatementSaveState({
        status: "saved",
        message: processedStatementLabel(filesForProcessing.length, processingResults),
      });
      setProcessingAuditSummary(processingSummary);
      setProcessedStatementIdsByKey((previous) => ({
        ...previous,
        ...nextProcessedStatementIdsByKey,
      }));
      if (processedStatementIds.length === 1) {
        setSelectedHistoryStatementId(processedStatementIds[0]);
      }
      const neonRefreshTargets = collectPostProcessingNeonRefreshPromptTargets({
        statements: filesForProcessing.map((parsedFile) => parsedFile.statement),
        matchesByContractNumber,
        processedStatementIdsByKey: nextProcessedStatementIdsByKey,
      });
      setNeonRefreshPromptTargets(neonRefreshTargets);
      setNeonRefreshPromptError(null);
      setNeonRefreshPromptSaving(false);
      void refreshProcessedStatementHistory();
    } catch (saveError) {
      console.warn("Provizní výpisy: zpracování záznamu selhalo.", saveError);
      setStatementSaveState({
        status: "error",
        message:
          saveError instanceof Error
            ? saveError.message
            : "Záznam se nepodařilo zpracovat.",
      });
      setProcessingAuditSummary(null);
    } finally {
      statementProcessingInFlightRef.current = false;
    }
  };

  const reprocessSelectedHistoryStatement = async () => {
    if (statementProcessingInFlightRef.current) return;

    const statementId = selectedHistoryStatementId?.trim();
    if (!statementId) {
      setStatementSaveState({
        status: "error",
        message: "Nejdřív otevři zpracovaný výpis z historie.",
      });
      return;
    }

    if (!user) {
      setStatementSaveState({
        status: "error",
        message: "Pro opětovné zpracování výpisu musíš být přihlášený.",
      });
      return;
    }

    statementProcessingInFlightRef.current = true;
    setProcessingStepIndex(0);
    setStatementSaveState({
      status: "saving",
      message: "Znovu zpracovávám uložený výpis podle aktuálních smluv…",
    });
    setProcessingAuditSummary(null);

    try {
      const sendRequest = async (forceRefreshToken = false) => {
        const token = await user.getIdToken(forceRefreshToken);
        return fetch("/api/commission-statements", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "reprocess-saved-statement",
            statementId,
          }),
        });
      };

      let response = await sendRequest(false);
      if (response.status === 401) {
        response = await sendRequest(true);
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            item?: SavedCommissionStatement;
            processingResult?: StatementProcessingResult;
          }
        | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || "Výpis se nepodařilo zpracovat znovu.");
      }

      const processingResult = payload.processingResult ?? {};
      const processingResults = [processingResult];
      const processingSummary = sumProcessingResults(processingResults);
      const processedStatementId = payload.item?.id ?? statementId;
      const currentStatement = statements[0] ?? null;
      const nextProcessedStatementIdsByKey = currentStatement
        ? {
            [statementDiscrepancyKey(currentStatement)]: processedStatementId,
          }
        : {};

      setStatementSaveState({
        status: "saved",
        message: `Výpis z historie byl znovu zpracovaný. ${processedStatementLabel(
          1,
          processingResults
        )}`,
      });
      setProcessingAuditSummary(processingSummary);
      setSelectedHistoryStatementId(processedStatementId);
      setProcessedStatementIdsByKey((previous) => ({
        ...previous,
        ...nextProcessedStatementIdsByKey,
      }));
      const neonRefreshTargets = collectPostProcessingNeonRefreshPromptTargets({
        statements,
        matchesByContractNumber,
        processedStatementIdsByKey: nextProcessedStatementIdsByKey,
      });
      setNeonRefreshPromptTargets(neonRefreshTargets);
      setNeonRefreshPromptError(null);
      setNeonRefreshPromptSaving(false);
      void refreshProcessedStatementHistory();
    } catch (saveError) {
      console.warn("Provizní výpisy: opětovné zpracování výpisu selhalo.", saveError);
      setStatementSaveState({
        status: "error",
        message:
          saveError instanceof Error
            ? saveError.message
            : "Výpis se nepodařilo zpracovat znovu.",
      });
      setProcessingAuditSummary(null);
    } finally {
      statementProcessingInFlightRef.current = false;
    }
  };

  const updateCppAutoBatchQueueItem = useCallback(
    (id: string, patch: CppAutoBatchQueuePatch) => {
      setCppAutoBatchQueue((previous) =>
        previous.map((item) => {
          if (item.id !== id) return item;
          if (item.status === "saved") return item;
          return {
            ...item,
            ...patch,
            status: "ready",
            message: null,
          };
        })
      );
      setCppAutoBatchQueueNotice(null);
    },
    []
  );

  const removeCppAutoBatchQueueItem = useCallback((id: string) => {
    setCppAutoBatchQueue((previous) => previous.filter((item) => item.id !== id));
    setCppAutoBatchQueueNotice(null);
  }, []);

  const clearSavedCppAutoBatchQueueItems = useCallback(() => {
    setCppAutoBatchQueue((previous) => previous.filter((item) => item.status !== "saved"));
    setCppAutoBatchQueueNotice(null);
  }, []);

  const runCppAutoBatchQueue = async () => {
    if (cppAutoBatchQueueRunning) return;
    if (!user) {
      setCppAutoBatchQueueNotice("Pro uložení dávky se nejdřív přihlas.");
      return;
    }
    if (!effectiveUserEmail) {
      setCppAutoBatchQueueNotice("Nepodařilo se určit uživatele, pod kterým se mají smlouvy uložit.");
      return;
    }

    const candidates = cppAutoBatchQueue.filter(
      (item) => item.status !== "saved" && item.status !== "saving"
    );
    const validItems: CppAutoBatchQueueItem[] = [];
    const invalidItems = new Map<string, string>();
    for (const item of candidates) {
      const validationError = validateCppAutoBatchQueueItem(item);
      if (validationError) {
        invalidItems.set(item.id, validationError);
      } else {
        validItems.push(item);
      }
    }

    if (invalidItems.size > 0) {
      setCppAutoBatchQueue((previous) =>
        previous.map((item) => {
          const message = invalidItems.get(item.id);
          return message ? { ...item, status: "error", message } : item;
        })
      );
    }
    if (validItems.length === 0) {
      setCppAutoBatchQueueNotice("Doplň nebo oprav označené údaje a potom spusť dávku znovu.");
      return;
    }

    setCppAutoBatchQueueRunning(true);
    setCppAutoBatchQueueNotice(`Ukládám ${validItems.length} smluv ve frontě…`);
    setCppAutoBatchQueue((previous) =>
      previous.map((item) =>
        validItems.some((candidate) => candidate.id === item.id)
          ? { ...item, status: "saving", message: null }
          : item
      )
    );

    type SavedBatchItem = {
      item: CppAutoBatchQueueItem;
      stored: boolean;
      attachmentFailed: boolean;
    };
    const savedBatchItems: SavedBatchItem[] = [];
    let nextIndex = 0;
    const saveOne = async (item: CppAutoBatchQueueItem): Promise<SavedBatchItem> => {
      const amount = cppAutoBatchQueueAmount(item.amountText);
      const sourceRecordedAtMs = item.queuedAtMs;
      try {
        const saved = await saveContractEntry({
          user,
          ownerEmail: effectiveUserEmail,
          entry: {
            productKey: item.product,
            entryType: "contract",
            commissionMode: null,
            inputAmount: amount,
            effectiveInputAmount: amount,
            frequencyRaw: item.frequency,
            clientName: item.clientName.trim(),
            contractSignedDate: item.contractSignedDate.trim(),
            policyStartDate: item.policyStartDate.trim(),
            policyEndDate: null,
            status: item.stornoDate.trim() ? "storno" : "active",
            stornoDate: item.stornoDate.trim() || null,
            durationYears: null,
            durationMonths: null,
            maxCizinKomplexVariant: null,
            contractNumber: item.contractNumber.trim(),
            tipContractTipsterEmail: null,
            tipContractTipsterPercent: null,
            tipContractSourceTipId: null,
            tipContractSourceTipTitle: null,
            tipContractSourceTipProductLabel: null,
            tipContractSourceTipClientName: null,
            tipContractSourceTipCreatedAtMs: null,
            paid: false,
            isRefresh: false,
            refreshOriginalContractNumber: null,
            refreshOriginalMissingInSystem: false,
            requiresStatementRefresh: false,
            commissionCalculationStatus: null,
            commissionBaseSource: null,
            premiumUpdatedFromStatementAtMs: sourceRecordedAtMs,
            premiumUpdatedFromStatementChronologyMs: item.statementChronologyMs,
            premiumUpdatedFromStatementId: item.statementId,
            createdFromCommissionStatement: true,
            createdFromCommissionStatementAtMs: sourceRecordedAtMs,
            createdFromCommissionStatementChronologyMs: item.statementChronologyMs,
            createdFromCommissionStatementId: item.statementId,
          },
          fallbackError: "Smlouvu se nepodařilo uložit.",
          pdfFile: item.pdfFile,
        });
        if (!saved.ok) {
          setCppAutoBatchQueue((previous) =>
            previous.map((current) =>
              current.id === item.id
                ? { ...current, status: "error", message: saved.error }
                : current
            )
          );
          return { item, stored: false, attachmentFailed: false };
        }

        const attachmentErrorMessage =
          saved.pdfAttachment.status === "failed" ? saved.pdfAttachment.message : null;
        const attachmentFailed = attachmentErrorMessage !== null;
        const message = attachmentFailed
          ? `Smlouva je uložená, ale PDF se nepodařilo přiložit: ${attachmentErrorMessage}`
          : item.pdfFile
            ? "Smlouva i PDF jsou uložené."
            : "Smlouva je uložená.";
        setCppAutoBatchQueue((previous) =>
          previous.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: attachmentFailed ? "attachment_error" : "saved",
                  message,
                }
              : current
          )
        );
        return { item, stored: true, attachmentFailed };
      } catch (saveError) {
        const message =
          saveError instanceof Error && saveError.message.trim()
            ? saveError.message
            : "Smlouvu se nepodařilo uložit.";
        setCppAutoBatchQueue((previous) =>
          previous.map((current) =>
            current.id === item.id ? { ...current, status: "error", message } : current
          )
        );
        return { item, stored: false, attachmentFailed: false };
      }
    };

    const worker = async () => {
      while (nextIndex < validItems.length) {
        const item = validItems[nextIndex++];
        if (!item) return;
        savedBatchItems.push(await saveOne(item));
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(3, validItems.length) }, () => worker())
      );

      const storedItems = savedBatchItems.filter((result) => result.stored);
      const savedContractNumbers = new Set(
        storedItems.map((result) => normalizeContractNumberForMatch(result.item.contractNumber))
      );
      const reprocessSourceStatementIds = [
        ...new Set(
          storedItems
            .map((result) => result.item.statementId?.trim() || "")
            .filter(Boolean)
        ),
      ];
      const reprocessFailures: string[] = [];

      for (const statementId of reprocessSourceStatementIds) {
        try {
          const sendRequest = async (forceRefreshToken = false) => {
            const token = await user.getIdToken(forceRefreshToken);
            return fetch("/api/commission-statements", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "reprocess-saved-statement",
                statementId,
              }),
            });
          };
          let response = await sendRequest();
          if (response.status === 401) response = await sendRequest(true);
          const payload = (await response.json().catch(() => null)) as
            | { ok?: boolean; error?: string }
            | null;
          if (!response.ok || payload?.ok !== true) {
            throw new Error(payload?.error || "Výpis se nepodařilo zpracovat znovu.");
          }
        } catch (reprocessError) {
          reprocessFailures.push(
            reprocessError instanceof Error
              ? reprocessError.message
              : "Výpis se nepodařilo zpracovat znovu."
          );
        }
      }

      const requestsToRefresh = statementContractMatchRequests.filter((request) =>
        savedContractNumbers.has(normalizeContractNumberForMatch(request.contractNumber))
      );
      let matchingFailure: string | null = null;
      if (requestsToRefresh.length > 0) {
        setMatchesByContractNumber((previous) => {
          const next = { ...previous };
          for (const request of requestsToRefresh) {
            const key = contractMatchKey(request.scope, request.contractNumber);
            if (key) next[key] = { status: "loading", contracts: [] };
          }
          return next;
        });
        try {
          const refreshedMatches = await fetchSystemContractMatchBatch(
            user,
            requestsToRefresh,
            dedupeEquivalentSystemContracts
          );
          setMatchesByContractNumber((previous) => {
            const next = { ...previous };
            for (const request of requestsToRefresh) {
              const key = contractMatchKey(request.scope, request.contractNumber);
              if (!key) continue;
              next[key] =
                refreshedMatches.get(key) ??
                systemContractMatchError("Párování po uložení smlouvy nevrátilo výsledek.");
            }
            return next;
          });
        } catch (matchError) {
          matchingFailure =
            matchError instanceof Error
              ? matchError.message
              : "Párování po uložení smluv selhalo.";
          setMatchesByContractNumber((previous) => {
            const next = { ...previous };
            for (const request of requestsToRefresh) {
              const key = contractMatchKey(request.scope, request.contractNumber);
              if (key) next[key] = systemContractMatchError(matchingFailure!);
            }
            return next;
          });
        }
      }

      if (reprocessSourceStatementIds.length > 0) void refreshProcessedStatementHistory();
      const attachmentFailures = storedItems.filter((result) => result.attachmentFailed).length;
      const failureCount = savedBatchItems.length - storedItems.length;
      const resultParts = [`Uloženo ${storedItems.length} z ${validItems.length} smluv.`];
      if (attachmentFailures > 0) resultParts.push(`PDF vyžaduje opravu u ${attachmentFailures} smluv.`);
      if (reprocessSourceStatementIds.length > 0 && reprocessFailures.length === 0) {
        resultParts.push(`Znovu zpracováno výpisů: ${reprocessSourceStatementIds.length}.`);
      }
      if (reprocessFailures.length > 0) resultParts.push(`Výpis se nepodařilo obnovit: ${reprocessFailures[0]}`);
      if (matchingFailure) resultParts.push(`Párování se nepodařilo obnovit: ${matchingFailure}`);
      if (failureCount > 0) resultParts.push(`${failureCount} smluv vyžaduje opravu.`);
      setCppAutoBatchQueueNotice(resultParts.join(" "));
    } catch (batchError) {
      setCppAutoBatchQueueNotice(
        batchError instanceof Error
          ? `Dávka doběhla s chybou při obnovení párování: ${batchError.message}`
          : "Dávka doběhla s chybou při obnovení párování."
      );
    } finally {
      setCppAutoBatchQueueRunning(false);
    }
  };

  const freshUploadPairingInProgress =
    statements.length > 0 &&
    statementFilesForProcessing.length > 0 &&
    matchStats.total > 0 &&
    matchStats.completed < matchStats.total &&
    !matchingError;
  const queuedCppA101ContractKeys = useMemo(
    () =>
      new Set(
        cppAutoBatchQueue
          .map((item) => cppAutoBatchQueueItemKey(item))
          .filter(Boolean)
      ),
    [cppAutoBatchQueue]
  );
  const canReprocessSelectedHistoryStatement =
    statements.length === 1 &&
    statementFilesForProcessing.length === 0 &&
    Boolean(selectedHistoryStatementId);
  const visibleStatementSaveMessage =
    statementSaveState.status === "saved" ||
    (freshUploadPairingInProgress && statementSaveState.status === "ready")
      ? null
      : statementSaveState.message;

  return (
    <BohemkaContractDetailModalContext.Provider value={setContractDetailModal}>
      <StatementCalculatorPrefillContext.Provider value={setCalculatorPrefillPanel}>
        <AppLayout active="statements">
      <div className="w-full max-w-7xl space-y-4">
        {!freshUploadPairingInProgress && (
          <section
            className={`px-1 py-1 ${
              statements.length === 0 ? "mx-auto w-full max-w-5xl" : ""
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-black text-slate-950 sm:text-4xl">
                Kontrola provizního výpisu
              </h1>
              <button
                type="button"
                onClick={() => {
                  setProcessedStatementHistoryVisible(true);
                  void refreshProcessedStatementHistory();
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:bg-black"
              >
                <CalendarDays className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Zobrazit historii
                {processedStatementHistory.length > 0 && (
                  <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-xs text-white">
                    {processedStatementHistory.length}
                  </span>
                )}
              </button>
            </div>

            {statements.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/75 p-1 shadow-[0_14px_36px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/70 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setMarkingMode((value) => !value)}
                    className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-bold transition ${
                      markingMode
                        ? "bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                        : "text-slate-800 hover:bg-violet-50 hover:text-violet-800"
                    }`}
                  >
                    <ListChecks className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    {markingMode ? "Dokončit" : "Označit"}
                  </button>
                  <button
                    type="button"
                    onClick={resetStatementWorkspace}
                    className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-bold text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Vymazat
                  </button>
                </div>
                {markedDiscrepancyItems.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPdfError(null);
                        setReportModalOpen(true);
                      }}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-violet-100 bg-white/75 px-4 text-sm font-bold text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/70 backdrop-blur-xl transition hover:border-violet-200 hover:text-violet-800"
                    >
                      <Printer className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      Souhrn nesrovnalostí
                    </button>
                    <span className="inline-flex h-9 items-center rounded-full bg-violet-50 px-3 text-xs font-bold text-violet-800 ring-1 ring-violet-100">
                      Označeno {markedDiscrepancyItems.length}
                    </span>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void parseFiles(event.target.files);
            }
          }}
        />

        {!freshUploadPairingInProgress && processedStatementHistoryVisible && (
          <ProcessedStatementHistoryModal
            statements={processedStatementHistory}
            loading={processedStatementHistoryLoading}
            error={processedStatementHistoryError}
            selectedId={selectedHistoryStatementId}
            openingId={openingHistoryStatementId}
            onClose={() => setProcessedStatementHistoryVisible(false)}
            onRefresh={refreshProcessedStatementHistory}
            onOpen={(statementId) => {
              void openProcessedStatementFromHistory(statementId);
            }}
          />
        )}

        {(error || matchingError || pdfError || visibleStatementSaveMessage) && (
          <div className="space-y-3">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {error}
              </div>
            )}
            {matchingError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {matchingError}
              </div>
            )}
            {pdfError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {pdfError}
              </div>
            )}
            {visibleStatementSaveMessage && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
                  statementSaveState.status === "saved"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : statementSaveState.status === "saving"
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : statementSaveState.status === "ready"
                        ? "border-slate-200 bg-white text-slate-800"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {statementSaveState.status === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                ) : statementSaveState.status === "saved" ? (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                ) : statementSaveState.status === "ready" ? (
                  <ListChecks className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                )}
                {visibleStatementSaveMessage}
              </div>
            )}
          </div>
        )}

        {statementSaveState.status === "saved" && processingAuditSummary && (
          <ProcessingAuditPanel summary={processingAuditSummary} />
        )}

        {statements.length === 0 ? (
          <section className="mx-auto w-full max-w-5xl pt-3">
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_34px_110px_rgba(15,23,42,0.12)]">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#d946ef_58%,#ec4899_100%)]"
                aria-hidden="true"
              />
              <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                <div className="relative min-h-[19rem] overflow-hidden bg-slate-950 p-6 text-white sm:p-7">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]"
                    aria-hidden="true"
                  />
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/12"
                    aria-hidden="true"
                  />
                  <div className="relative flex h-full min-h-[16rem] flex-col justify-between">
                    <div>
                      <span className="inline-flex rounded-full border border-fuchsia-300/35 bg-fuchsia-400/14 px-3 py-1 text-xs font-bold uppercase text-fuchsia-100">
                        HTML import
                      </span>
                      <h2 className="mt-5 max-w-sm text-4xl font-black leading-none text-white sm:text-5xl">
                        Nahrát výpis
                      </h2>
                    </div>

                    <div className="mt-8 space-y-3">
                      <div className="h-2.5 w-24 rounded-full bg-white/90" />
                      <div className="h-2.5 w-full max-w-[18rem] rounded-full bg-white/18" />
                      <div className="h-2.5 w-4/5 max-w-[15rem] rounded-full bg-fuchsia-400/70" />
                      <div className="h-2.5 w-3/5 max-w-[12rem] rounded-full bg-white/18" />
                    </div>
                  </div>
                </div>

                <div
                  className="relative flex min-h-[19rem] flex-col justify-between p-6 transition hover:bg-slate-50/70 sm:p-7"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void parseFiles(event.dataTransfer.files);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,0.09)]">
                      <UploadCloud size={27} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-bold uppercase text-fuchsia-700 shadow-sm">
                      .HTML / .HTM
                    </span>
                  </div>

                  <div>
                    <p className="max-w-md text-xl font-black leading-7 text-slate-950 sm:text-2xl">
                      Přetáhni výpis sem
                    </p>
                    <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
                      nebo vyber HTML soubor ze zařízení.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={parsing}
                      className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                    >
                      {parsing ? (
                        <Loader2
                          className="h-[18px] w-[18px] animate-spin shrink-0"
                          strokeWidth={2.2}
                          aria-hidden="true"
                        />
                      ) : (
                        <UploadCloud size={18} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
                      )}
                      {parsing ? "Načítám…" : "Nahrát výpis"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : freshUploadPairingInProgress ? (
          <StatementPairingLoader stats={matchStats} hasUser={Boolean(user)} />
        ) : (
          <div className="space-y-4">
            <CppAutoBatchQueue
              items={cppAutoBatchQueue}
              isRunning={cppAutoBatchQueueRunning}
              notice={cppAutoBatchQueueNotice}
              onUpdate={updateCppAutoBatchQueueItem}
              onRemove={removeCppAutoBatchQueueItem}
              onRun={() => {
                void runCppAutoBatchQueue();
              }}
              onClearSaved={clearSavedCppAutoBatchQueueItems}
            />
            {statements.map((statement) => {
              const statementKey = statementDiscrepancyKey(statement);
              const statementLabel = statementDiscrepancyLabel(statement);
              const statementIdForActions =
                processedStatementIdsByKey[statementKey] ??
                (statements.length === 1 ? selectedHistoryStatementId : null);

              return (
                <StatementPreview
                  key={`${statement.fileName}-${statement.header.statementNumber ?? "bez-cisla"}`}
                  statement={statement}
                  matchesByContractNumber={matchesByContractNumber}
                  queuedCppA101ContractKeys={queuedCppA101ContractKeys}
                  currentUserEmail={effectiveUserEmail}
                  selectedStatementId={statementIdForActions}
                  onRequestSystemStorno={openStornoActionModal}
                  onConvertNeonRefresh={convertNeonRefreshFromStatement}
                  correctionContext={statementCorrectionContext}
                  markingControls={{
                    markingMode,
                    markedItems: markedDiscrepancies,
                    onToggleMarked: toggleMarkedDiscrepancy,
                    statementKey,
                    statementLabel,
                  }}
                />
              );
            })}

            <section className="relative overflow-hidden rounded-lg border border-white/70 bg-white/75 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/70 backdrop-blur-xl sm:px-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-violet-500/60" aria-hidden="true" />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                    <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black tracking-tight text-slate-950">
                      Zápis výpisu
                    </h2>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-600">
                    {statementRecordsProcessed
                      ? "Výpis byl zpracovaný."
                      : `${statements.length} ${
                          statements.length === 1 ? "výpis připravený" : "výpisů připraveno"
                        } ke zpracování.`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canReprocessSelectedHistoryStatement && (
                    <button
                      type="button"
                      onClick={() => {
                        void reprocessSelectedHistoryStatement();
                      }}
                      disabled={statementRecordsProcessing}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-violet-100 bg-white/70 px-4 text-sm font-bold text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {statementRecordsProcessing ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          strokeWidth={2.2}
                          aria-hidden="true"
                        />
                      ) : (
                        <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      {statementRecordsProcessing
                        ? "Zpracovávám…"
                        : "Zpracovat znovu podle aktuálních smluv"}
                    </button>
                  )}
                  {statementRecordsProcessed && !statementRecordsProcessing ? (
                    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      Zpracováno
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void processStatementRecords();
                      }}
                      disabled={
                        statementRecordsProcessing ||
                        statementFilesForProcessing.length === 0
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {statementRecordsProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      {statementRecordsProcessing ? "Zpracovávám…" : "Zpracovat výpis"}
                    </button>
                  )}
                </div>
              </div>

            </section>
          </div>
        )}
      </div>

      {statementRecordsProcessing && (
        <StatementProcessingOverlay
          caption={activeProcessingCaption}
          progress={processingProgressPercent}
          stepIndex={processingStepIndex}
          statementCount={statements.length}
        />
      )}

      {reportModalOpen && (
        <DiscrepancyPdfNotesModal
          items={selectedPdfItems}
          notes={discrepancyNotes}
          downloading={pdfDownloading}
          onNoteChange={(key, note) =>
            setDiscrepancyNotes((previous) => ({
              ...previous,
              [key]: note,
            }))
          }
          onClose={() => {
            if (!pdfDownloading) setReportModalOpen(false);
          }}
          onDownload={() => {
            void downloadSelectedDiscrepancies();
          }}
        />
      )}

      {contractDetailModal && (
        <BohemkaContractDetailModal
          detail={contractDetailModal}
          onClose={() => setContractDetailModal(null)}
        />
      )}

      {calculatorPrefillPanel && (
        <StatementCalculatorIframePanel
          prefill={calculatorPrefillPanel}
          onClose={() => setCalculatorPrefillPanel(null)}
        />
      )}

      {stornoActionTarget && (
        <StornoStatementActionModal
          target={stornoActionTarget}
          dateInput={stornoActionDateInput}
          saving={stornoActionSaving}
          error={stornoActionError}
          onDateChange={setStornoActionDateInput}
          onClose={closeStornoActionModal}
          onConfirm={() => {
            void confirmStornoAction();
          }}
        />
      )}

      {activeNeonRefreshPromptTarget && (
        <NeonRefreshConversionPromptModal
          target={activeNeonRefreshPromptTarget}
          totalCount={neonRefreshPromptTargets.length}
          saving={neonRefreshPromptSaving}
          error={neonRefreshPromptError}
          onClose={closeNeonRefreshPrompt}
          onConfirm={() => {
            void confirmNeonRefreshPrompt();
          }}
        />
      )}
        </AppLayout>
      </StatementCalculatorPrefillContext.Provider>
    </BohemkaContractDetailModalContext.Provider>
  );
}
