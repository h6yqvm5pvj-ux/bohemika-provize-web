// src/app/kalkulacka/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, UploadCloud, Users } from "lucide-react";
import { auth } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

import {
  type Product,
  type Position,
  type PaymentFrequency,
  type CommissionMode,
  type CommissionResultItemDTO,
  type MaxCizinKomplexVariant,
} from "../types/domain";

import {
  getCoefficientSummary,
  isNeonHistoricalPeriod,
  isCppAutoHistoricalPeriod,
  isAllianzAutoHistoricalPeriod,
  isCsobAutoHistoricalPeriod,
  isUniqaAutoEarlyHistoricalPeriod,
  isUniqaAutoHistoricalPeriod,
  isUniqaFlotilaHistoricalPeriod,
  isPillowAutoHistoricalPeriod,
  isKooperativaAutoHistoricalPeriod,
  isMaxEfekt5Period,
  isMaxEfekt7Period,
  isDomexEarlyHistoricalPeriod,
  isDomexHistoricalPeriod,
  productCoefficientValidityError,
} from "../lib/productFormulas";
import { calculateCommission } from "../lib/calculateCommission";
import {
  calculateNeonDecreaseStornoBase,
  calculateNeonRefreshCommissionBase,
  type NeonRefreshCommissionBase,
} from "../lib/productFormulas/neon";
import {
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  PRODUCT_OPTIONS,
  productInstitutionId as productInstitutionIdFromCatalog,
} from "@/app/lib/productCatalog";
import { tipContractGrossBaseForProduct } from "@/app/lib/tipContractCommission";
import {
  isAnnualSeparatedPeriodProduct,
  isSeparatedPeriodCommissionProduct,
} from "@/app/lib/separatedPeriodCommissions";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";
import { autoAssistancePlanLabel } from "@/app/lib/autoAssistanceLabels";
import { AppLayout } from "@/components/AppLayout";
import { HelpDialog } from "@/components/HelpDialog";
import {
  ADMIN_IMPERSONATION_EVENT,
  readAdminImpersonationState,
  resolveUserProfilePatchRequest,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { formatMoney, positionLabel } from "@/app/lib/formatters";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  POSITION_ORDER,
  type PositionTimelineEntry,
  type ManagerChainSnapshotEntry,
  isIsoDay,
  collectContractDateIssues,
  parsePositionTimeline,
  resolvePositionTimelineMatch,
  resolveCurrentPositionTimelineRow,
  ensureManagerChainWithDirectManager,
  hasResolvedTopManagerPosition,
  formatIsoDay,
  productInstitutionLogo,
  isAutoProduct,
  isFrequencyAutoPayoutProduct,
  shouldShowDuration,
  shouldShowDurationMonths,
  durationRange,
  durationFallback,
  normalizedDurationYears,
  durationMonthsRange,
  durationMonthsFallback,
  normalizedDurationMonths,
  allowedFrequencies,
  durationTooltip,
  parseNumber,
  clampTipsterPercent,
  clampTipContractPercent,
  roundToCents,
  SUPPORTED_LABEL,
  paymentBasedTotals,
  supportsOriginalContractReplacement,
  supportsPolicyEndDate,
  originalReplacementLabel,
  buildContractsCreateIdempotencyKey,
  formatMoneyResult,
  paymentsPerYear,
  frequencyLabel,
  productLabel,
  normalizeEmailValue,
  normalizeSearchTextValue,
  simpleNameFromEmail,
  entryPathFromContractOwner,
  type ContractEntryType,
  type EndorsementChangeType,
  type EndorsementSourceEntry,
  type EndorsementDraft,
  toNonNegativeNumber,
  normalizeClientNameForSystemMatch,
} from "./calculatorHelpers";
import {
  buildEndorsementSourceEntries,
  contractOwnerEmail,
  dateToIsoDay,
  durationYearsLabel,
  negativeImmediateCommissionResult,
  negativeImmediateCommissionResultFromSourceItems,
  resolveRemainingEndorsementDurationMonths,
  resolveRemainingEndorsementDurationYears,
} from "./endorsementCalculation";
import { useEndorsementPreparation } from "./useEndorsementPreparation";
import { useContractSave } from "./useContractSave";
import { useCalculatorProductPicker } from "./useCalculatorProductPicker";
import { CalculatorProductPickerModal } from "./CalculatorProductPickerModal";
import { CalculatorProductAndPdfSection } from "./CalculatorProductAndPdfSection";
import { usePdfDropzone } from "./usePdfDropzone";
import { CalculatorDurationAndFrequencySection } from "./CalculatorDurationAndFrequencySection";
import { CalculatorAmountAndActionsSection } from "./CalculatorAmountAndActionsSection";
import { CalculatorContractDetailsSection } from "./CalculatorContractDetailsSection";
import { CalculatorPositionModeSection } from "./CalculatorPositionModeSection";
import {
  CalculatorAutoPdfDetailSummary,
  type AutoPdfHullSumPrompt,
  type AutoPdfDetailSummaryItem,
  type AutoPdfDetailSummarySection,
} from "./CalculatorAutoPdfDetailSummary";
import {
  CalculatorAutoPdfDetailEditor,
  type AutoPdfDetailEditorFields,
  type AutoPdfEditorBooleanField,
  type AutoPdfEditorTextField,
} from "./CalculatorAutoPdfDetailEditor";
import {
  CalculatorDomexPdfDetailSummary,
  type DomexPdfDetailSummaryItem,
  type DomexPdfDetailSummarySection,
} from "./CalculatorDomexPdfDetailSummary";
import {
  CalculatorDomexPdfDetailEditor,
  type DomexPdfDetailEditorFields,
  type DomexPdfEditorBooleanField,
  type DomexPdfEditorTextField,
} from "./CalculatorDomexPdfDetailEditor";
import {
  CalculatorNeonPdfDetailSummary,
  type NeonPdfDetailSummaryItem,
  type NeonPdfDetailSummarySection,
} from "./CalculatorNeonPdfDetailSummary";
import {
  CalculatorNeonPdfDetailEditor,
  createEmptyNeonPdfDetailFields,
  type NeonPdfDetailEditorFields,
  type NeonPdfEditorBooleanField,
  type NeonPdfEditorTextField,
} from "./CalculatorNeonPdfDetailEditor";
import { CalculatorResultsSection } from "./CalculatorResultsSection";
import { ContractSaveSuccessOverlay } from "./ContractSaveSuccessOverlay";
import { CalculatorSaveLoader } from "./CalculatorSaveLoader";
import {
  CalculatorCoefficientModal,
  type NeonCoefficientView,
} from "./CalculatorCoefficientModal";
import {
  DuplicateContractModal,
  EndorsementDraftModal,
  SubordinatePickerModal,
  ValidationErrorModal,
} from "./CalculatorWorkflowModals";
import { TipContractModal, TipContractTipsModal } from "./TipContractModals";
import {
  type AdvisorTipsByUserApiResponse,
  type TipContractConfig,
  type TipContractTipOption,
  type TipContractTipsFilter,
  type TipContractUserOption,
  type TipLifecycleStatus,
  type TipsterLookupApiResponse,
  type TipsterLookupState,
  type UserSearchApiResponse,
} from "./tipContractSettings";
import {
  BULK_PDF_PRODUCTS,
  buildPdfImportIssueMessage,
  detectProductFromPdfLazy,
  failedPdfImportMessage,
  hasAutomatedPdfImport,
  manualPdfImportMessage,
  parseContractPdfByProduct,
  parseMaxCizinKomplexPdfLazy,
  type ParsedContractPdf,
  unreadablePdfImportMessage,
} from "./calculatorPdfImport";
import {
  getContractsMutationError,
  requestBlobWithAuth,
  requestContractsMutationWithAuth,
  requestManagerSnapshotWithAuth,
  resolveRefreshOriginalContractInfo,
  uploadContractPdfAttachmentWithAuth,
  type ContractNumberLiveCheckState,
  type ContractsApiResponse,
  type ContractsFindApiResponse,
  type ContractsPrecheckApiResponse,
  type RefreshOriginalLookupState,
  type SubordinateOption,
  type TeamOverviewApiResponse,
  type TeamOverviewPositionTimelineReadApiResponse,
} from "./calculatorApi";


// ---------- Pomocné ----------

const LIFE_PRODUCTS = LIFE_PRODUCTS_LIST;
const SETTINGS_KEYS = {
  mode: "settings.mode",
  tipsterMode: "settings.tipsterMode",
  tipsterPercent: "settings.tipsterPercent",
};
const PDF_PRODUCT_DETECTION_TIMEOUT_MS = 8_000;
const PDF_DATA_IMPORT_TIMEOUT_MS = 15_000;
const PDF_IMPORT_TIMEOUT_ERROR_NAME = "PdfImportTimeoutError";
const AUTO_BULK_IMPORT_MAX_FILES = 25;
const DOMEX_BULK_IMPORT_MIN_CONTRACT_SIGNED_DATE = "2025-01-01";
const DOMEX_BULK_IMPORT_MIN_CONTRACT_SIGNED_DATE_LABEL = "01.01.2025";
const BULK_IMPORT_PRODUCTS = BULK_PDF_PRODUCTS;
const BULK_IMPORT_PRODUCT_SET = new Set<Product>(BULK_IMPORT_PRODUCTS);
const PAYMENT_FREQUENCIES: PaymentFrequency[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];
const profileModeStorageKey = (email: string | null | undefined) =>
  email ? `${SETTINGS_KEYS.mode}:${email}` : SETTINGS_KEYS.mode;

const parsedPdfTextValue = (parsed: ParsedContractPdf, key: string): string => {
  const value = parsed[key];
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
};

const parsedPdfNumberValue = (
  parsed: ParsedContractPdf,
  key: string
): number | null => {
  const value = parsed[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const parsedPdfRoundedNumberValue = (
  parsed: ParsedContractPdf,
  key: string
): number | null => {
  const value = parsedPdfNumberValue(parsed, key);
  return value == null ? null : Math.round(value);
};

const parsedPdfBooleanValue = (parsed: ParsedContractPdf, key: string): boolean =>
  parsed[key] === true;

const parsedPdfFrequencyValue = (
  parsed: ParsedContractPdf
): PaymentFrequency | null => {
  const value = parsed.frequency;
  return typeof value === "string" &&
    PAYMENT_FREQUENCIES.includes(value as PaymentFrequency)
    ? (value as PaymentFrequency)
    : null;
};

const isBulkImportProduct = (
  product: Product | null | undefined
): product is Product => Boolean(product && BULK_IMPORT_PRODUCT_SET.has(product));

const isBulkImportProductAllowedForSelection = (
  importProduct: Product,
  selectedProduct: Product | null | undefined
): boolean =>
  isBulkImportProduct(importProduct) && isBulkImportProduct(selectedProduct);

const parsedPdfBooleanOrNumberValue = (
  parsed: ParsedContractPdf,
  booleanKey: string,
  numberKey: string
): boolean =>
  parsedPdfBooleanValue(parsed, booleanKey) ||
  parsedPdfNumberValue(parsed, numberKey) != null;

const hasParsedDomexDetail = (parsed: ParsedContractPdf): boolean =>
  Boolean(
    parsedPdfTextValue(parsed, "domexAddress") ||
      parsedPdfTextValue(parsed, "domexPropertyType") ||
      parsedPdfTextValue(parsed, "domexPropertyCoverage") ||
      parsedPdfNumberValue(parsed, "domexPropertySumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexPropertyDeductible") != null ||
      parsedPdfTextValue(parsed, "domexHouseholdType") ||
      parsedPdfTextValue(parsed, "domexHouseholdCoverage") ||
      parsedPdfNumberValue(parsed, "domexHouseholdSumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexHouseholdDeductible") != null ||
      parsedPdfNumberValue(parsed, "domexOutbuildingSumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexLiabilitySumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexLiabilityDeductible") != null ||
      parsedPdfBooleanValue(parsed, "domexLiabilityMobile") ||
      parsedPdfBooleanValue(parsed, "domexLiabilityTenant") ||
      parsedPdfBooleanValue(parsed, "domexLiabilityLandlord") ||
      parsedPdfBooleanValue(parsed, "domexAssistancePlus")
  );

const buildAutoBulkImportWarnings = ({
  product,
  parsed,
  productDetected,
  detectionConfidence,
}: {
  product: Product;
  parsed: ParsedContractPdf;
  productDetected: boolean;
  detectionConfidence: "high" | "medium" | null;
}): string[] => {
  const warnings: string[] = [];
  if (!productDetected) {
    warnings.push(
      `produkt se nepodařilo rozpoznat, použil se vybraný produkt ${productLabel(product)}`
    );
  } else if (detectionConfidence === "medium") {
    warnings.push(`produkt byl rozpoznán jen se střední jistotou jako ${productLabel(product)}`);
  }
  if (parsed.ocrTextUsed === true) {
    warnings.push("PDF bylo načtené přes OCR");
  }

  const clientName = parsedPdfTextValue(parsed, "clientName");
  if (clientName && clientName.split(/\s+/).filter(Boolean).length < 2) {
    warnings.push("jméno klienta vypadá neúplně");
  }

  const contractNumber = parsedPdfTextValue(parsed, "contractNumber");
  if (contractNumber && !/^\d{6,14}$/.test(contractNumber.replace(/\s+/g, ""))) {
    warnings.push("číslo smlouvy má nezvyklý formát");
  }

  const signedDate = parsedPdfTextValue(parsed, "contractSignedDate");
  if (signedDate && !isIsoDay(signedDate)) {
    warnings.push("datum sjednání má nezvyklý formát");
  }

  const policyStartDate = parsedPdfTextValue(parsed, "policyStartDate");
  if (policyStartDate && !isIsoDay(policyStartDate)) {
    warnings.push("datum počátku má nezvyklý formát");
  }

  return warnings;
};

const formatAutoBulkImportWarnings = (warnings: string[]): string => {
  const uniqueWarnings = Array.from(
    new Set(warnings.map((warning) => warning.trim()).filter(Boolean))
  );
  return uniqueWarnings.length > 0
    ? `Zkontroluj: ${uniqueWarnings.join("; ")}.`
    : "";
};

const compactErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : fallback;

const invalidateContractsCaches = () => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("contracts_cache_v2");
    sessionStorage.removeItem("contracts_cache_v3");
    localStorage.setItem("contracts_last_updated", String(Date.now()));
    window.dispatchEvent(new Event("contracts:updated"));
  } catch {
    // best effort cache invalidation
  }
};
const TIPSTER_PERCENT_PRESETS = [10, 20, 30, 40, 50, 75, 100];
const EMAIL_LOOKUP_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTO_TERMS_PREVIEW_BY_PRODUCT: Partial<Record<Product, string>> = {
  cppAuto: "/provize/cppauto.jpg",
  slaviaauto: "/provize/slaviaauto.jpg",
  slaviaflotila: "/provize/slaviaflotila.pdf",
  allianzAuto: "/provize/allianzauto.jpg",
  csobAuto: "/provize/csobauto.jpg",
  uniqaAuto: "/provize/uniqaauto.jpg",
  uniqaflotila: "/provize/uniqaflotila.jpg",
  pillowAuto: "/provize/pillowauto.jpg",
  kooperativaAuto: "/provize/koopauto.jpg",
  koopflotila: "/provize/koopflotila.pdf",
  cpphafan: "/provize/cpphafan.pdf",
  koopodzam: "/provize/koopodzam.pdf",
  kooppmop: "/provize/kooppmop.pdf",
  zamex: "/provize/cppzamex.pdf",
  cppsimplex: "/provize/cppsimplex.pdf",
  cppPPRbez: "/provize/cppbezupisu.pdf",
  cppPPRs: "/provize/cppupis.pdf",
  cppbytex: "/provize/bytexprovize.pdf",
  domex: "/provize/domex2024.pdf",
  maxdomov: "/provize/maxdomov2025.pdf",
  maximaMaxEfekt: "/provize/maxefekt7.pdf",
  pillowInjury: "/provize/pillowuraznemoc.pdf",
  pillowmajetek: "/provize/pillowmajetek.pdf",
  allianzmujdomov: "/provize/allianzmujdomov.pdf",
  cppcestovko: "/provize/cppcestovko.pdf",
  koopcestovko: "/provize/koopcestovko.pdf",
  axacestovko: "/provize/axacs.pdf",
};
const PILLOW_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/pillowhistoricke.jpg";
const UNIQA_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/uniqahistoricke.jpg";
const UNIQA_AUTO_EARLY_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/BHMK-UNIQA-AUTO-230101-01_page-0001.jpg";
const UNIQA_FLOTILA_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/uniqaflotilahis.pdf";
const ALLIANZ_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/AlliHistoricke.jpg";
const CSOB_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/csobhistoricke.jpg";
const CPP_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/cpphistorickeauto.jpg";
const KOOPERATIVA_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/koophistoricke.jpg";
const MAXEFEKT5_TERMS_PREVIEW_URL = "/provize/maxefekt5.pdf";
const DOMEX_EARLY_HISTORICAL_TERMS_PREVIEW_URL = "/provize/domexPLUS.pdf";
const DOMEX_HISTORICAL_TERMS_PREVIEW_URL = "/provize/domex2023.pdf";
const MAX_CIZIN_KOMPLEX_VARIANT_OPTIONS: {
  id: MaxCizinKomplexVariant;
  label: string;
}[] = [
  { id: "exclusiveStandard", label: "EXCLUSIVE / STANDARD" },
  { id: "premium", label: "PREMIUM" },
];
const STATEMENT_CONTRACT_SAVED_MESSAGE_TYPE = "bohemka:statement-contract-saved";
const STATEMENT_CONTRACT_SAVE_COMPLETED_MESSAGE_TYPE =
  "bohemka:statement-contract-save-completed";
const STATEMENT_CPP_A101_QUEUE_ADD_MESSAGE_TYPE =
  "bohemka:statement-cpp-a101-queue-add";
type StatementPremiumSource = {
  statementId: string | null;
  statementChronologyMs: number | null;
  capturedAtMs: number;
};
const notifyStatementParentContractEvent = ({
  type,
  contractNumber,
  clientName,
  product,
  ownerEmail,
  entryId,
}: {
  type:
    | typeof STATEMENT_CONTRACT_SAVED_MESSAGE_TYPE
    | typeof STATEMENT_CONTRACT_SAVE_COMPLETED_MESSAGE_TYPE;
  contractNumber: string;
  clientName: string;
  product: Product;
  ownerEmail: string;
  entryId: string;
}) => {
  if (typeof window === "undefined" || window.parent === window) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("prefill") !== "commission-statement") return;

  window.parent.postMessage(
    {
      type,
      contractNumber,
      clientName,
      product,
      ownerEmail,
      entryId,
      savedAtMs: Date.now(),
    },
    window.location.origin
  );
};

const withPdfImportTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(timeoutMessage);
      error.name = PDF_IMPORT_TIMEOUT_ERROR_NAME;
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const isPdfImportTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.name === PDF_IMPORT_TIMEOUT_ERROR_NAME;
const notifyStatementParentContractSaved = (
  payload: Omit<Parameters<typeof notifyStatementParentContractEvent>[0], "type">
) =>
  notifyStatementParentContractEvent({
    type: STATEMENT_CONTRACT_SAVED_MESSAGE_TYPE,
    ...payload,
  });
const notifyStatementParentContractSaveCompleted = (
  payload: Omit<Parameters<typeof notifyStatementParentContractEvent>[0], "type">
) =>
  notifyStatementParentContractEvent({
    type: STATEMENT_CONTRACT_SAVE_COMPLETED_MESSAGE_TYPE,
    ...payload,
  });

const notifyStatementParentCppA101QueueAdd = ({
  product,
  contractNumber,
  clientName,
  contractSignedDate,
  policyStartDate,
  amountText,
  frequency,
  stornoDate,
  pdfFile,
}: {
  product: "cppAuto" | "domex";
  contractNumber: string;
  clientName: string;
  contractSignedDate: string;
  policyStartDate: string;
  amountText: string;
  frequency: PaymentFrequency;
  stornoDate: string;
  pdfFile: File | null;
}) => {
  if (typeof window === "undefined" || window.parent === window) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("prefill") !== "commission-statement") return;

  window.parent.postMessage(
    {
      type: STATEMENT_CPP_A101_QUEUE_ADD_MESSAGE_TYPE,
      product,
      contractNumber,
      clientName,
      contractSignedDate,
      policyStartDate,
      amountText,
      frequency,
      stornoDate,
      pdfFile,
    },
    window.location.origin
  );
};
const CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL = "jakub.rauscher@bohemika.eu";
const isKooperativaAutoDetailProduct = (product: Product): boolean =>
  product === "kooperativaAuto" || product === "koopflotila";
const isSlaviaAutoDetailProduct = (product: Product): boolean =>
  product === "slaviaauto" || product === "slaviaflotila";
const isUniqaAutoDetailProduct = (product: Product): boolean =>
  product === "uniqaAuto";
const AUTO_HULL_USUAL_PRICE_TEXT = "Obvyklá cena vozidla";
const CLIENT_SUGGESTIONS_PAGE_LIMIT = 50;
const CLIENT_SUGGESTIONS_MAX_PAGES = 40;
const CLIENT_SUGGESTIONS_VISIBLE_LIMIT = 6;
const AUTO_PAID_POLICY_START_MONTHS = 6;

const parseIsoDayAsLocalDate = (value: string): Date | null => {
  if (!isIsoDay(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const subtractMonthsClamped = (date: Date, months: number): Date => {
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth() - months;
  const firstOfTargetMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  const result = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth(),
    Math.min(date.getDate(), lastDayOfTargetMonth)
  );
  result.setHours(0, 0, 0, 0);
  return result;
};

const shouldAutoMarkPaidByPolicyStartDate = (policyStartDateIso: string): boolean => {
  const policyStart = parseIsoDayAsLocalDate(policyStartDateIso.trim());
  if (!policyStart) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = subtractMonthsClamped(today, AUTO_PAID_POLICY_START_MONTHS);
  return policyStart.getTime() <= cutoff.getTime();
};

const normalizeClientSuggestionText = (value: string | null | undefined): string =>
  normalizeClientNameForSystemMatch(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const clientNameTokens = (value: string | null | undefined): string[] =>
  normalizeClientSuggestionText(value).split(" ").filter(Boolean);

const clientNameSearchVariants = (value: string | null | undefined): string[] => {
  const tokens = clientNameTokens(value);
  const variants = new Set<string>();
  const joined = tokens.join(" ");
  if (joined) variants.add(joined);
  if (tokens.length >= 2) {
    variants.add([tokens[tokens.length - 1], ...tokens.slice(0, -1)].join(" "));
  }
  return [...variants];
};

const clientNameContainsTokenSequence = (
  tokens: string[],
  sequence: string[]
): boolean =>
  tokens.some((_, index) =>
    sequence.every((token, offset) => tokens[index + offset] === token)
  );

const clientNameLooksLikeCompany = (value: string | null | undefined): boolean => {
  const tokens = clientNameTokens(value);
  if (
    clientNameContainsTokenSequence(tokens, ["s", "r", "o"]) ||
    clientNameContainsTokenSequence(tokens, ["a", "s"]) ||
    clientNameContainsTokenSequence(tokens, ["z", "s"]) ||
    clientNameContainsTokenSequence(tokens, ["o", "p", "s"])
  ) {
    return true;
  }
  return (
    tokens.includes("sro") ||
    tokens.includes("as") ||
    tokens.includes("zs") ||
    tokens.includes("ops") ||
    tokens.includes("spol") ||
    tokens.includes("druzstvo") ||
    tokens.includes("nadace") ||
    tokens.includes("ustav") ||
    tokens.includes("obec") ||
    tokens.includes("urad")
  );
};

const clientNameLooksLikePersonQuery = (value: string | null | undefined): boolean => {
  if (clientNameLooksLikeCompany(value)) return false;
  const tokens = clientNameTokens(value).filter((token) => token.length > 1);
  return tokens.length >= 2 && tokens.length <= 4;
};

const boundedLevenshteinDistance = (
  left: string,
  right: string,
  maxDistance: number
): number => {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowBest = current[0] ?? 0;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + cost
      );
      current[rightIndex] = value;
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length] ?? maxDistance + 1;
};

const clientNameTokenMatches = (queryToken: string, candidateToken: string): boolean => {
  if (!queryToken || !candidateToken) return false;
  if (queryToken === candidateToken) return true;
  if (queryToken.length === 1) return candidateToken.length > 1 && candidateToken.startsWith(queryToken);
  if (candidateToken.length === 1) return false;
  if (
    Math.min(queryToken.length, candidateToken.length) >= 3 &&
    (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken))
  ) {
    return true;
  }
  if (Math.min(queryToken.length, candidateToken.length) < 3) return false;
  const maxDistance = Math.max(queryToken.length, candidateToken.length) <= 4 ? 1 : 2;
  return boundedLevenshteinDistance(queryToken, candidateToken, maxDistance) <= maxDistance;
};

const clientNameSuggestionScore = (query: string, candidate: string): number => {
  const queryVariants = clientNameSearchVariants(query);
  if (queryVariants.length === 0) return 0;

  const candidateVariants = clientNameSearchVariants(candidate);
  const candidateTokens = clientNameTokens(candidate);
  let bestScore = 0;

  for (const queryVariant of queryVariants) {
    const queryTokens = queryVariant.split(" ").filter(Boolean);
    for (const candidateVariant of candidateVariants) {
      if (queryVariant === candidateVariant) bestScore = Math.max(bestScore, 1000);
      if (candidateVariant.includes(queryVariant)) bestScore = Math.max(bestScore, 900);
      if (queryVariant.includes(candidateVariant)) bestScore = Math.max(bestScore, 840);

      const maxDistance = queryVariant.length <= 10 ? 2 : 3;
      const wholeDistance = boundedLevenshteinDistance(
        queryVariant,
        candidateVariant,
        maxDistance
      );
      if (wholeDistance <= maxDistance) {
        bestScore = Math.max(bestScore, 760 - wholeDistance * 60);
      }
    }

    if (
      queryTokens.length > 0 &&
      queryTokens.every((token) =>
        candidateTokens.some((candidateToken) => clientNameTokenMatches(token, candidateToken))
      )
    ) {
      const exactTokenMatches = queryTokens.filter((token) =>
        candidateTokens.includes(token)
      ).length;
      bestScore = Math.max(bestScore, 700 + exactTokenMatches * 20);
    }
  }

  return bestScore;
};

type CalculatorViewMode = "addContract" | "commissionOnly";

type AutoBulkImportRowStatus =
  | "queued"
  | "processing"
  | "success"
  | "review"
  | "warning"
  | "skipped"
  | "error";

type AutoBulkReviewDraft = {
  file: File;
  product: Product;
  parsed: ParsedContractPdf;
  warnings: string[];
  isReplacement: boolean;
  replacementNumber: string;
};

type AutoBulkImportRow = {
  id: string;
  fileName: string;
  status: AutoBulkImportRowStatus;
  productLabel: string | null;
  contractNumber: string | null;
  clientName: string | null;
  message: string;
  reviewDraft?: AutoBulkReviewDraft | null;
};

// ---------- Kalkulačka ----------

export default function CalculatorPage() {
  const [user, setUser] = useState<User | null>(null);

  const [product, setProduct] = useState<Product>("neon");
  const [hasSelectedProduct, setHasSelectedProduct] = useState(false);
  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [frequency, setFrequency] = useState<PaymentFrequency>("monthly");
  const [durationYears, setDurationYears] = useState<number | null>(null);
  const [durationMonths, setDurationMonths] = useState<number | null>(null);
  const [maxCizinKomplexVariant, setMaxCizinKomplexVariant] =
    useState<MaxCizinKomplexVariant>("exclusiveStandard");
  const [amountText, setAmountText] = useState<string>("");
  const [tipsterModeEnabled, setTipsterModeEnabled] = useState(false);
  const [tipsterModeSaving, setTipsterModeSaving] = useState(false);
  const [calculatorViewMode, setCalculatorViewMode] =
    useState<CalculatorViewMode>("addContract");
  const [tipsterPercent, setTipsterPercent] = useState(100);
  const [tipsterPercentPanelOpen, setTipsterPercentPanelOpen] = useState(false);
  const [tipContractModalOpen, setTipContractModalOpen] = useState(false);
  const [tipContractDraftEmail, setTipContractDraftEmail] = useState("");
  const [tipContractDraftPercent, setTipContractDraftPercent] = useState(50);
  const [tipContractLookupState, setTipContractLookupState] = useState<TipsterLookupState>({
    status: "idle",
  });
  const [tipContractUserSuggestions, setTipContractUserSuggestions] = useState<TipContractUserOption[]>([]);
  const [tipContractSuggestionsLoading, setTipContractSuggestionsLoading] = useState(false);
  const [tipContractSelectedUser, setTipContractSelectedUser] =
    useState<TipContractUserOption | null>(null);
  const [tipContractTipsModalOpen, setTipContractTipsModalOpen] = useState(false);
  const [tipContractTipsLoading, setTipContractTipsLoading] = useState(false);
  const [tipContractTipsError, setTipContractTipsError] = useState<string | null>(null);
  const [tipContractTips, setTipContractTips] = useState<TipContractTipOption[]>([]);
  const [tipContractTipsFilter, setTipContractTipsFilter] =
    useState<TipContractTipsFilter>("all");
  const [tipContractSelectedTip, setTipContractSelectedTip] =
    useState<TipContractTipOption | null>(null);
  const [tipContractConfig, setTipContractConfig] = useState<TipContractConfig | null>(null);
  const selectedTipContractUserEmail = tipContractSelectedUser?.email ?? null;
  const foundTipContractLookupEmail =
    tipContractLookupState.status === "found" ? tipContractLookupState.email : null;
  const [comfortGradual, setComfortGradual] = useState<boolean>(false);
  const [comfortPaymentText, setComfortPaymentText] = useState<string>("");
  const [comfortTargetAmountText, setComfortTargetAmountText] = useState<string>("");

  const [clientName, setClientName] = useState<string>("");
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [statementClientNamePrefillActive, setStatementClientNamePrefillActive] =
    useState(false);
  const [contractSignedDate, setContractSignedDate] = useState<string>("");
  const [policyStartDate, setPolicyStartDate] = useState<string>("");
  const [policyEndDate, setPolicyEndDate] = useState<string>("");
  const [stornoDate, setStornoDate] = useState<string>("");
  const [contractNumber, setContractNumber] = useState<string>("");
  const [autoCarMake, setAutoCarMake] = useState<string>("");
  const [autoCarPlate, setAutoCarPlate] = useState<string>("");
  const [autoCarVin, setAutoCarVin] = useState<string>("");
  const [autoCarTp, setAutoCarTp] = useState<string>("");
  const [autoCarOrv, setAutoCarOrv] = useState<string>("");
  const [autoCarAnnualMileage, setAutoCarAnnualMileage] = useState<string>("");
  const [autoCarAllianzScope, setAutoCarAllianzScope] = useState<string>("");
  const [autoCarLiabilityLimit, setAutoCarLiabilityLimit] = useState<number | null>(null);
  const [autoCarHullSumInsured, setAutoCarHullSumInsured] = useState<number | null>(null);
  const [autoCarHullSumInsuredText, setAutoCarHullSumInsuredText] = useState<string>("");
  const [autoCarHullSumInsuredDraft, setAutoCarHullSumInsuredDraft] = useState<string>("");
  const [autoCarHullDeductible, setAutoCarHullDeductible] = useState<number | null>(null);
  const [autoCarHullDeductibleText, setAutoCarHullDeductibleText] = useState<string>("");
  const [autoCarHullRiskAccident, setAutoCarHullRiskAccident] = useState(false);
  const [autoCarHullRiskTheft, setAutoCarHullRiskTheft] = useState(false);
  const [autoCarHullRiskNatural, setAutoCarHullRiskNatural] = useState(false);
  const [autoCarHullRiskVandalism, setAutoCarHullRiskVandalism] = useState(false);
  const [autoCarHullRiskAnimalCollision, setAutoCarHullRiskAnimalCollision] = useState(false);
  const [autoCarAssistancePlan, setAutoCarAssistancePlan] = useState<string>("");
  const [autoCarAddonEso, setAutoCarAddonEso] = useState(false);
  const [autoCarAddonNaturalRisks, setAutoCarAddonNaturalRisks] = useState(false);
  const [autoCarAddonKlika, setAutoCarAddonKlika] = useState(false);
  const [autoCarAddonGlass, setAutoCarAddonGlass] = useState(false);
  const [autoCarAddonGlassLimit, setAutoCarAddonGlassLimit] = useState<number | null>(null);
  const [autoCarAddonAnimalCollision, setAutoCarAddonAnimalCollision] = useState(false);
  const [autoCarAddonAnimalCollisionLimit, setAutoCarAddonAnimalCollisionLimit] =
    useState<number | null>(null);
  const [autoCarAddonAnimalDamage, setAutoCarAddonAnimalDamage] = useState(false);
  const [autoCarAddonAnimalDamageLimit, setAutoCarAddonAnimalDamageLimit] =
    useState<number | null>(null);
  const [autoCarAddonVandalism, setAutoCarAddonVandalism] = useState(false);
  const [autoCarAddonTheft, setAutoCarAddonTheft] = useState(false);
  const [autoCarAddonTheftLimit, setAutoCarAddonTheftLimit] = useState<number | null>(null);
  const [autoCarAddonNatural, setAutoCarAddonNatural] = useState(false);
  const [autoCarAddonNaturalLimit, setAutoCarAddonNaturalLimit] = useState<number | null>(null);
  const [autoCarAddonOwnDamage, setAutoCarAddonOwnDamage] = useState(false);
  const [autoCarAddonOwnDamageLimit, setAutoCarAddonOwnDamageLimit] =
    useState<number | null>(null);
  const [autoCarAddonGap, setAutoCarAddonGap] = useState(false);
  const [autoCarAddonGapLimit, setAutoCarAddonGapLimit] = useState<number | null>(null);
  const [autoCarAddonSmartGap, setAutoCarAddonSmartGap] = useState(false);
  const [autoCarAddonServisPro, setAutoCarAddonServisPro] = useState(false);
  const [autoCarAddonFireExplosion, setAutoCarAddonFireExplosion] = useState(false);
  const [autoCarAddonLegalAdvice, setAutoCarAddonLegalAdvice] = useState(false);
  const [autoCarAddonReplacementCar, setAutoCarAddonReplacementCar] = useState(false);
  const [autoCarAddonLuggage, setAutoCarAddonLuggage] = useState(false);
  const [autoCarAddonTransportedGoods, setAutoCarAddonTransportedGoods] = useState(false);
  const [autoCarAddonPothole, setAutoCarAddonPothole] = useState(false);
  const [autoCarAddonNonFaultAccident, setAutoCarAddonNonFaultAccident] = useState(false);
  const [autoCarAddonPassengerInjury, setAutoCarAddonPassengerInjury] = useState(false);
  const [autoCarAddonKeyLossTheft, setAutoCarAddonKeyLossTheft] = useState(false);
  const [domexAddress, setDomexAddress] = useState<string>("");
  const [domexPropertyType, setDomexPropertyType] = useState<string>("");
  const [domexPropertyCoverage, setDomexPropertyCoverage] = useState<string>("");
  const [domexPropertySumInsured, setDomexPropertySumInsured] = useState<number | null>(null);
  const [domexPropertyDeductible, setDomexPropertyDeductible] = useState<number | null>(null);
  const [domexHouseholdType, setDomexHouseholdType] = useState<string>("");
  const [domexHouseholdCoverage, setDomexHouseholdCoverage] = useState<string>("");
  const [domexHouseholdSumInsured, setDomexHouseholdSumInsured] = useState<number | null>(null);
  const [domexHouseholdDeductible, setDomexHouseholdDeductible] = useState<number | null>(null);
  const [domexOutbuildingSumInsured, setDomexOutbuildingSumInsured] =
    useState<number | null>(null);
  const [domexLiabilitySumInsured, setDomexLiabilitySumInsured] = useState<number | null>(null);
  const [domexLiabilityDeductible, setDomexLiabilityDeductible] = useState<number | null>(null);
  const [domexLiabilityMobile, setDomexLiabilityMobile] = useState(false);
  const [domexLiabilityTenant, setDomexLiabilityTenant] = useState(false);
  const [domexLiabilityLandlord, setDomexLiabilityLandlord] = useState(false);
  const [domexAssistancePlus, setDomexAssistancePlus] = useState(false);
  const [domexNote, setDomexNote] = useState("");
  const [neonPdfDetailFields, setNeonPdfDetailFields] =
    useState<NeonPdfDetailEditorFields>(() => createEmptyNeonPdfDetailFields());
  const [refreshOriginalOpen, setRefreshOriginalOpen] = useState(false);
  const [refreshOriginalContractNumber, setRefreshOriginalContractNumber] = useState("");
  const [refreshOriginalMissingInSystem, setRefreshOriginalMissingInSystem] = useState(false);
  const [refreshOriginalPdfLookupNumber, setRefreshOriginalPdfLookupNumber] =
    useState<string | null>(null);
  const [refreshOriginalLookup, setRefreshOriginalLookup] = useState<RefreshOriginalLookupState>({
    status: "idle",
    progress: 0,
    adviserName: null,
    original: null,
  });
  const [durationHelpOpen, setDurationHelpOpen] = useState(false);
  const [addContractHelpOpen, setAddContractHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoBulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfImportRunIdRef = useRef(0);
  const statementPrefillAppliedRef = useRef(false);
  const [statementEmbedMode, setStatementEmbedMode] = useState(false);
  const [statementEmbedParentAvailable, setStatementEmbedParentAvailable] = useState(false);
  const [statementCppA101QueueEligible, setStatementCppA101QueueEligible] = useState(false);
  const [statementPremiumSource, setStatementPremiumSource] =
    useState<StatementPremiumSource | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportStatus, setPdfImportStatus] = useState<string | null>(null);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [autoBulkImporting, setAutoBulkImporting] = useState(false);
  const [autoBulkImportStatus, setAutoBulkImportStatus] =
    useState<string | null>(null);
  const [autoBulkImportRows, setAutoBulkImportRows] = useState<
    AutoBulkImportRow[]
  >([]);
  const [importedContractPdfFile, setImportedContractPdfFile] = useState<File | null>(null);
  const [savingIncludesPdfAttachment, setSavingIncludesPdfAttachment] = useState(false);
  const [pdfClientNameLoaded, setPdfClientNameLoaded] = useState(false);
  const [pdfMatchedClientName, setPdfMatchedClientName] = useState(false);
  const {
    isOpen: productOpen,
    toggle: toggleProductPicker,
    close: closeProductPicker,
    setSectionKey: setProductPickerSection,
    setSectionForProduct: setProductPickerSectionForProduct,
    searchText: productSearchText,
    setSearchText: setProductSearchText,
    columns: productPickerColumns,
    activeColumn: activeProductPickerColumn,
    allProducts: allProductPickerProducts,
    isGlobalSearch,
    filteredProducts: filteredSectionProducts,
    selectProduct,
  } = useCalculatorProductPicker({
    product: hasSelectedProduct ? product : null,
    onProductSelect: (nextProduct) => {
      setProduct(nextProduct);
      setHasSelectedProduct(true);
      setPdfClientNameLoaded(false);
      setPdfMatchedClientName(false);
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const isStatementPrefill = params.get("prefill") === "commission-statement";
    setStatementEmbedMode(isStatementPrefill);
    setStatementEmbedParentAvailable(isStatementPrefill && window.parent !== window);
    setStatementCppA101QueueEligible(
      isStatementPrefill && params.get("cppA101QueueEligible") === "1"
    );
    if (!isStatementPrefill) {
      setStatementPremiumSource(null);
      return;
    }
    if (statementPrefillAppliedRef.current) return;

    const productOption = PRODUCT_OPTIONS.find(
      (option) => option.id === params.get("product")
    );
    if (!productOption) return;

    statementPrefillAppliedRef.current = true;
    const nextProduct = productOption.id;
    const allowed = allowedFrequencies(nextProduct);
    const defaultFrequency = allowed[0] ?? "annual";
    const frequencyParam = params.get("frequency") as PaymentFrequency | null;
    const nextFrequency =
      frequencyParam && allowed.includes(frequencyParam) ? frequencyParam : defaultFrequency;
    const amountParam = (params.get("amount") ?? "")
      .replace(/[^\d.,-]/g, "")
      .trim();
    const clientNameParam = (params.get("clientName") ?? "").trim();
    const contractNumberParam = (params.get("contractNumber") ?? "").trim();
    const contractSignedDateParam = (params.get("contractSignedDate") ?? "").trim();
    const policyStartDateParam = (params.get("policyStartDate") ?? "").trim();
    const sourceStatementIdParam = (params.get("sourceStatementId") ?? "").trim();
    const sourceStatementChronologyRaw = (
      params.get("sourceStatementChronologyMs") ?? ""
    ).trim();
    const sourceStatementChronologyParam = sourceStatementChronologyRaw
      ? Number(sourceStatementChronologyRaw)
      : null;

    setProduct(nextProduct);
    setHasSelectedProduct(true);
    setProductPickerSectionForProduct(nextProduct);
    setProductSearchText("");
    setCalculatorViewMode("addContract");
    setFrequency(nextFrequency);
    setTipsterModeEnabled(false);
    setPdfClientNameLoaded(false);
    setPdfMatchedClientName(false);
    setImportedContractPdfFile(null);
    setPdfImportStatus(null);
    setPdfImportError(null);
    setValidationError(null);
    setSaveMessage(null);
    setMissingFields([]);
    setStatementPremiumSource({
      statementId: sourceStatementIdParam || null,
      statementChronologyMs:
        sourceStatementChronologyParam != null &&
        Number.isFinite(sourceStatementChronologyParam)
        ? Math.round(sourceStatementChronologyParam)
        : null,
      capturedAtMs: Date.now(),
    });

    if (amountParam) setAmountText(amountParam);
    if (clientNameParam) {
      setClientName(clientNameParam);
      setStatementClientNamePrefillActive(true);
      setClientSuggestionsOpen(true);
    } else {
      setStatementClientNamePrefillActive(false);
    }
    if (contractNumberParam) setContractNumber(contractNumberParam);
    if (isIsoDay(contractSignedDateParam)) setContractSignedDate(contractSignedDateParam);
    if (isIsoDay(policyStartDateParam)) setPolicyStartDate(policyStartDateParam);
  }, [setProductPickerSectionForProduct, setProductSearchText]);

  const [items, setItems] = useState<CommissionResultItemDTO[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [unsupported, setUnsupported] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [contractNumberLiveCheck, setContractNumberLiveCheck] =
    useState<ContractNumberLiveCheckState>({ status: "idle" });
  const [duplicateModal, setDuplicateModal] = useState<{
    mode: "overwrite" | "saveAnyway";
    description: string;
    contractNumber: string | null;
    count: number;
    entries: { id: string; ownerEmail: string; path: string; contractNumber: string | null }[];
  } | null>(null);
  const [endorsementDraft, setEndorsementDraft] = useState<EndorsementDraft | null>(null);
  const [endorsementDraftModalOpen, setEndorsementDraftModalOpen] = useState(false);
  const [endorsementWorkflowActive, setEndorsementWorkflowActive] = useState(false);
  const [endorsementDurationManualOverride, setEndorsementDurationManualOverride] =
    useState(false);
  const [endorsementPreviewSource, setEndorsementPreviewSource] =
    useState<EndorsementSourceEntry | null>(null);
  const [saveSuccessFlash, setSaveSuccessFlash] = useState<{
    contractNumber: string | null;
    clientName: string | null;
  } | null>(null);
  const [contractSaveCelebrationKey, setContractSaveCelebrationKey] = useState(0);
  const [lastSavedContractRef, setLastSavedContractRef] = useState<{
    ownerEmail: string;
    entryId: string;
  } | null>(null);
  const [subordinatePickerOpen, setSubordinatePickerOpen] = useState(false);
  const [subordinateSearchText, setSubordinateSearchText] = useState("");
  const [subordinateOptions, setSubordinateOptions] = useState<SubordinateOption[]>([]);
  const [subordinateLoading, setSubordinateLoading] = useState(false);
  const [subordinateLoadError, setSubordinateLoadError] = useState<string | null>(null);
  const [selectedSubordinateEmail, setSelectedSubordinateEmail] = useState<string | null>(null);
  const [adminImpersonation, setAdminImpersonation] =
    useState<AdminImpersonationState | null>(() =>
      typeof window === "undefined" ? null : readAdminImpersonationState()
    );

  const normalizedUserEmail = normalizeEmailValue(user?.email);
  const impersonatedUserEmail = normalizeEmailValue(adminImpersonation?.email);
  const activeSaveBaseEmail = impersonatedUserEmail || normalizedUserEmail;
  const activeProfileEmail = activeSaveBaseEmail;
  const canOverrideOwnerOnSave =
    normalizedUserEmail === CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL;
  const effectiveSaveOwnerEmail =
    canOverrideOwnerOnSave && selectedSubordinateEmail
      ? selectedSubordinateEmail
      : activeSaveBaseEmail;
  const isSavingForSubordinate =
    canOverrideOwnerOnSave &&
    !!selectedSubordinateEmail &&
    selectedSubordinateEmail !== activeSaveBaseEmail;
  const subordinateOptionsByEmail = useMemo(
    () => new Map(subordinateOptions.map((item) => [item.email, item] as const)),
    [subordinateOptions]
  );
  const selectedSubordinate =
    selectedSubordinateEmail && subordinateOptionsByEmail.has(selectedSubordinateEmail)
      ? subordinateOptionsByEmail.get(selectedSubordinateEmail) ?? null
      : null;
  const subordinateSearchQuery = useMemo(
    () => normalizeSearchTextValue(subordinateSearchText),
    [subordinateSearchText]
  );
  const filteredSubordinateOptions = useMemo(() => {
    if (!subordinateSearchQuery) return subordinateOptions;
    return subordinateOptions.filter((option) => {
      const email = normalizeSearchTextValue(option.email);
      const name = normalizeSearchTextValue(option.name);
      return email.includes(subordinateSearchQuery) || name.includes(subordinateSearchQuery);
    });
  }, [subordinateOptions, subordinateSearchQuery]);
  const selectedSaveOwnerLabel = selectedSubordinate
    ? `${selectedSubordinate.name} (${selectedSubordinate.email})`
    : impersonatedUserEmail
      ? `${
          adminImpersonation?.name?.trim() || simpleNameFromEmail(impersonatedUserEmail)
        } (${impersonatedUserEmail})`
    : "Můj účet";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncImpersonation = () => {
      setAdminImpersonation(readAdminImpersonationState());
      setSelectedSubordinateEmail(null);
    };
    syncImpersonation();
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    return () => {
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    };
  }, []);

  const contractDateIssues = useMemo(
    () => collectContractDateIssues(contractSignedDate, policyStartDate, policyEndDate),
    [contractSignedDate, policyStartDate, policyEndDate]
  );
  const contractDateErrors = useMemo(
    () => contractDateIssues.filter((issue) => issue.severity === "error"),
    [contractDateIssues]
  );
  const contractDateWarnings = useMemo(
    () => contractDateIssues.filter((issue) => issue.severity === "warning"),
    [contractDateIssues]
  );
  const contractDateErrorText = useMemo(
    () => (contractDateErrors.length > 0 ? contractDateErrors.map((issue) => issue.message).join(" ") : null),
    [contractDateErrors]
  );
  const contractDateWarningText = useMemo(
    () =>
      contractDateWarnings.length > 0
        ? contractDateWarnings.map((issue) => issue.message).join(" ")
        : null,
    [contractDateWarnings]
  );

  const validateContractDatesBeforeSave = (): boolean => {
    if (contractDateErrors.length > 0) {
      const msg = `Zkontroluj datumy: ${contractDateErrors
        .map((issue) => issue.message)
        .join(" ")}`;
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    if (contractDateWarnings.length === 0) return true;
    if (typeof window === "undefined") return true;

    const warningText = contractDateWarnings
      .map((issue) => `• ${issue.message}`)
      .join("\n");
    const proceed = window.confirm(
      `Pozor, datumy vypadají neobvykle:\n${warningText}\n\nChceš i přesto uložit?`
    );
    if (!proceed) {
      setSaveMessage("Uložení zrušeno. Zkontroluj datumy.");
      return false;
    }

    return true;
  };

  const validateOptionalStornoDateBeforeSave = (): boolean => {
    const trimmedStornoDate = stornoDate.trim();
    if (!trimmedStornoDate) return true;

    const parsedStornoDate = parseIsoDayAsLocalDate(trimmedStornoDate);
    if (!parsedStornoDate) {
      const msg = "Datum storna má neplatný formát.";
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    const parsedPolicyStartDate = parseIsoDayAsLocalDate(policyStartDate.trim());
    const parsedSignedDate = parseIsoDayAsLocalDate(contractSignedDate.trim());
    const boundaryDate = parsedPolicyStartDate ?? parsedSignedDate;
    if (boundaryDate && parsedStornoDate.getTime() < boundaryDate.getTime()) {
      const msg = parsedPolicyStartDate
        ? "Datum storna nesmí být před datem počátku smlouvy."
        : "Datum storna nesmí být před datem sjednání smlouvy.";
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    return true;
  };

  const validateProductCoefficientPeriodBeforeSave = (
    targetProduct: Product | null,
    signedDateIsoRaw: string
  ): boolean => {
    const coefficientValidityError = productCoefficientValidityError(
      targetProduct,
      signedDateIsoRaw
    );
    if (coefficientValidityError) {
      setSaveMessage(coefficientValidityError);
      setValidationError(coefficientValidityError);
      return false;
    }
    return true;
  };

  const tipContractImmediateGrossFirstYear = useMemo(
    () => tipContractGrossBaseForProduct(product, items),
    [product, items]
  );
  const neonRefreshCommissionBase = useMemo<NeonRefreshCommissionBase | null>(() => {
    if (product !== "neon" || !refreshOriginalOpen || refreshOriginalMissingInSystem) {
      return null;
    }
    const original = refreshOriginalLookup.original;
    if (!original) return null;

    return calculateNeonRefreshCommissionBase({
      newMonthlyPremium: parseNumber(amountText),
      originalMonthlyPremium: original.premiumAmount,
      stornoBaseMonthlyPremium: original.stornoBasePremiumAmount,
      originalStornoStartDateIso: original.stornoStartDateIso,
      refreshPolicyStartDateIso: policyStartDate.trim(),
    });
  }, [
    product,
    refreshOriginalOpen,
    refreshOriginalMissingInSystem,
    refreshOriginalLookup.original,
    amountText,
    policyStartDate,
  ]);
  const neonRefreshInfoText = useMemo(() => {
    if (product !== "neon" || !refreshOriginalOpen) return null;
    if (refreshOriginalMissingInSystem) return null;
    if (refreshOriginalLookup.status === "checking") {
      return "Po dohledání původní smlouvy přepočítám Refresh základnu pro provizi.";
    }
    if (refreshOriginalLookup.status === "found" && !refreshOriginalLookup.original) {
      return "Původní smlouva je nalezená, ale chybí u ní pojistné nebo datum pro výpočet Refresh základny.";
    }
    if (refreshOriginalLookup.original && !neonRefreshCommissionBase) {
      return "Pro výpočet Refresh základny doplň nové pojistné a datum počátku nové smlouvy.";
    }
    if (!neonRefreshCommissionBase) return null;

    const originalAnnual = neonRefreshCommissionBase.originalMonthlyPremium * 12;
    const stornoBaseAnnual =
      neonRefreshCommissionBase.stornoBaseMonthlyPremium * 12;
    const newAnnual = neonRefreshCommissionBase.newMonthlyPremium * 12;
    const usesMotivationalBase =
      neonRefreshCommissionBase.calculationMethod === "motivational_48_percent";
    const usesDifferentStornoBase =
      Math.abs(stornoBaseAnnual - originalAnnual) >= 0.01;
    const stornoPartLabel = usesDifferentStornoBase
      ? ` + stornovaná část předchozí provizní základny ${formatMoney(
          stornoBaseAnnual
        )} = ${formatMoney(neonRefreshCommissionBase.stornedOriginalAnnualPremium)}`
      : ` + stornovaná část ${formatMoney(
          neonRefreshCommissionBase.stornedOriginalAnnualPremium
        )}`;
    const originalBasePartLabel = usesMotivationalBase
      ? ` + motivační základna 48 % z ${formatMoney(
          stornoBaseAnnual
        )} = ${formatMoney(neonRefreshCommissionBase.motivationalAnnualPremium)}`
      : stornoPartLabel;
    const premiumIncreaseAnnual = neonRefreshCommissionBase.premiumIncreaseAnnual;
    const premiumMovementLabel =
      premiumIncreaseAnnual >= 0
        ? `navýšení ${formatMoney(premiumIncreaseAnnual)} (${formatMoney(
            newAnnual
          )} - ${formatMoney(originalAnnual)})`
        : `pokles pojistného ${formatMoney(
            Math.abs(premiumIncreaseAnnual)
          )} (${formatMoney(newAnnual)} - ${formatMoney(
            originalAnnual
          )}), záporné navýšení se nezapočítává`;
    const periodLabel = usesMotivationalBase
      ? "motivační provize po 5 letech"
      : `${neonRefreshCommissionBase.remainingMonths}/60 původní storno lhůty`;
    return `Refresh základna pro provizi: ${formatMoney(
      neonRefreshCommissionBase.calculationAnnualPremium
    )} ročně (${periodLabel}). Výpočet: ${premiumMovementLabel}${originalBasePartLabel}.`;
  }, [
    product,
    refreshOriginalOpen,
    refreshOriginalMissingInSystem,
    refreshOriginalLookup.status,
    refreshOriginalLookup.original,
    neonRefreshCommissionBase,
  ]);
  const originalReplacementWorkflowActive =
    supportsOriginalContractReplacement(product) && refreshOriginalOpen;
  useEffect(() => {
    if (!originalReplacementWorkflowActive) return;
    setEndorsementDraft(null);
    setEndorsementDraftModalOpen(false);
    setEndorsementWorkflowActive(false);
    setEndorsementDurationManualOverride(false);
    setEndorsementPreviewSource(null);
  }, [originalReplacementWorkflowActive]);
  const comfortPayoutCount = useMemo(() => {
    if (product !== "comfortcc" || !comfortGradual) return null;
    const payment = parseNumber(comfortPaymentText);
    const targetAmount = parseNumber(comfortTargetAmountText);
    if (payment <= 0 || targetAmount <= 0) return null;
    return Math.max(1, Math.ceil(targetAmount / payment));
  }, [product, comfortGradual, comfortPaymentText, comfortTargetAmountText]);

  const [managerEmailSnapshot, setManagerEmailSnapshot] = useState<string | null>(null);
  const [managerPositionSnapshot, setManagerPositionSnapshot] = useState<Position | null>(null);
  const [managerModeSnapshot, setManagerModeSnapshot] = useState<CommissionMode | null>(null);
  const [managerChainSnapshot, setManagerChainSnapshot] = useState<
    ManagerChainSnapshotEntry[]
  >([]);
  const [userCommissionMode, setUserCommissionMode] = useState<CommissionMode | null>(null);
  const [positionTimeline, setPositionTimeline] = useState<PositionTimelineEntry[]>([]);
  const [subordinatePositionTimeline, setSubordinatePositionTimeline] =
    useState<PositionTimelineEntry[] | null>(null);
  const [subordinatePositionTimelineEmail, setSubordinatePositionTimelineEmail] =
    useState<string | null>(null);
  const [subordinatePositionTimelineLoading, setSubordinatePositionTimelineLoading] =
    useState(false);
  const [subordinatePositionTimelineError, setSubordinatePositionTimelineError] =
    useState<string | null>(null);
  const [timelineMatchedPosition, setTimelineMatchedPosition] = useState<{
    position: Position;
    validFrom: string;
    validTo: string | null;
  } | null>(null);
  const selectedSubordinatePositionTimeline =
    selectedSubordinateEmail &&
    subordinatePositionTimelineEmail === selectedSubordinateEmail
      ? subordinatePositionTimeline
      : null;
  const effectivePositionTimeline = useMemo(
    () =>
      isSavingForSubordinate
        ? selectedSubordinatePositionTimeline ?? []
        : positionTimeline,
    [isSavingForSubordinate, positionTimeline, selectedSubordinatePositionTimeline]
  );
  const effectivePositionTimelineLoading =
    isSavingForSubordinate && subordinatePositionTimelineLoading;
  const selectedSubordinateTimelineMissing =
    isSavingForSubordinate &&
    !subordinatePositionTimelineLoading &&
    !subordinatePositionTimelineError &&
    selectedSubordinatePositionTimeline != null &&
    selectedSubordinatePositionTimeline.length === 0;
  const [showCoefModal, setShowCoefModal] = useState(false);
  const [neonCoefficientView, setNeonCoefficientView] =
    useState<NeonCoefficientView>("current");
  const [neonPreviewBlobUrl, setNeonPreviewBlobUrl] = useState<string | null>(null);
  const neonPreviewObjectUrlRef = useRef<string | null>(null);
  const [neonPreviewLoading, setNeonPreviewLoading] = useState(false);
  const [neonPreviewError, setNeonPreviewError] = useState<string | null>(null);
  const [neonDocAction, setNeonDocAction] = useState<"download" | "open" | null>(null);
  const isLifeProduct = useMemo(() => LIFE_PRODUCTS.includes(product), [product]);
  const contractSignedDateForNeon = useMemo(() => {
    const signedDate = contractSignedDate.trim();
    return isIsoDay(signedDate) ? signedDate : null;
  }, [contractSignedDate]);
  const isNeonHistoricalBySignedDate = useMemo(
    () =>
      product === "neon" && isNeonHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isCppAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "cppAuto" &&
      isCppAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isAllianzAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "allianzAuto" &&
      isAllianzAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isCsobAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "csobAuto" &&
      isCsobAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isUniqaAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "uniqaAuto" &&
      isUniqaAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isUniqaAutoEarlyHistoricalBySignedDate = useMemo(
    () =>
      product === "uniqaAuto" &&
      isUniqaAutoEarlyHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isUniqaFlotilaHistoricalBySignedDate = useMemo(
    () =>
      product === "uniqaflotila" &&
      isUniqaFlotilaHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isPillowAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "pillowAuto" &&
      isPillowAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isKooperativaAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "kooperativaAuto" &&
      isKooperativaAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isMaxEfekt5BySignedDate = useMemo(
    () =>
      product === "maximaMaxEfekt" &&
      isMaxEfekt5Period(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isDomexEarlyHistoricalBySignedDate = useMemo(
    () =>
      product === "domex" &&
      isDomexEarlyHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isDomexHistoricalBySignedDate = useMemo(
    () =>
      product === "domex" &&
      isDomexHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const neonCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2024-06-30";
    return "2024-07-01";
  }, [neonCoefficientView]);
  const cppAutoCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const allianzAutoCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const csobAutoCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const uniqaAutoCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "olderHistorical") return "2023-02-01";
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const uniqaFlotilaCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const pillowAutoCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const kooperativaAutoCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2026-03-31";
    return "2026-04-01";
  }, [neonCoefficientView]);
  const maxEfektCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2023-04-21";
    return "2026-04-23";
  }, [neonCoefficientView]);
  const domexCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "olderHistorical") return "2017-06-01";
    if (neonCoefficientView === "historical") return "2023-06-01";
    return "2024-09-01";
  }, [neonCoefficientView]);
  const coefficientDateForView = useMemo(() => {
    if (product === "neon") return neonCoefficientDateForView;
    if (product === "maximaMaxEfekt") return maxEfektCoefficientDateForView;
    if (product === "domex") return domexCoefficientDateForView;
    if (product === "cppAuto") return cppAutoCoefficientDateForView;
    if (product === "allianzAuto") return allianzAutoCoefficientDateForView;
    if (product === "csobAuto") return csobAutoCoefficientDateForView;
    if (product === "uniqaAuto") return uniqaAutoCoefficientDateForView;
    if (product === "uniqaflotila") return uniqaFlotilaCoefficientDateForView;
    if (product === "pillowAuto") return pillowAutoCoefficientDateForView;
    if (product === "kooperativaAuto") return kooperativaAutoCoefficientDateForView;
    return contractSignedDateForNeon;
  }, [
    product,
    neonCoefficientDateForView,
    cppAutoCoefficientDateForView,
    allianzAutoCoefficientDateForView,
    csobAutoCoefficientDateForView,
    uniqaAutoCoefficientDateForView,
    uniqaFlotilaCoefficientDateForView,
    pillowAutoCoefficientDateForView,
    kooperativaAutoCoefficientDateForView,
    maxEfektCoefficientDateForView,
    domexCoefficientDateForView,
    contractSignedDateForNeon,
  ]);
  const isMaxEfekt5InCoefModal = useMemo(
    () =>
      product === "maximaMaxEfekt" &&
      isMaxEfekt5Period(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isMaxEfekt7InCoefModal = useMemo(
    () =>
      product === "maximaMaxEfekt" &&
      isMaxEfekt7Period(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isDomexHistoricalInCoefModal = useMemo(
    () => product === "domex" && isDomexHistoricalPeriod(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isDomexEarlyHistoricalInCoefModal = useMemo(
    () =>
      product === "domex" &&
      isDomexEarlyHistoricalPeriod(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isNeonHistoricalInCoefModal = useMemo(
    () => product === "neon" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isCppAutoHistoricalInCoefModal = useMemo(
    () => product === "cppAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isAllianzAutoHistoricalInCoefModal = useMemo(
    () => product === "allianzAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isCsobAutoHistoricalInCoefModal = useMemo(
    () => product === "csobAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isUniqaAutoHistoricalInCoefModal = useMemo(
    () =>
      product === "uniqaAuto" &&
      (neonCoefficientView === "historical" ||
        neonCoefficientView === "olderHistorical"),
    [product, neonCoefficientView]
  );
  const isUniqaAutoEarlyHistoricalInCoefModal = useMemo(
    () => product === "uniqaAuto" && neonCoefficientView === "olderHistorical",
    [product, neonCoefficientView]
  );
  const isUniqaFlotilaHistoricalInCoefModal = useMemo(
    () => product === "uniqaflotila" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isPillowAutoHistoricalInCoefModal = useMemo(
    () => product === "pillowAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isKooperativaAutoHistoricalInCoefModal = useMemo(
    () => product === "kooperativaAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const immediatePayoutInfo = useMemo(() => {
    if (product === "flexi") {
      if (mode === "accelerated") {
        return "Okamžitá provize je součet 1. provize A101, 2. provize B0301 a 50 % z provize B36. Zbývajících 50 % z B36 zůstává jako provize po 3 letech.";
      }
      return "Okamžitá provize je součet 1. provize A101 a 2. provize B0301.";
    }
    if (product === "maximaMaxEfekt") {
      if (mode === "accelerated") {
        return "Okamžitá provize je součet provize A101, provize B0301 a 50 % z provize B3601. Zbývajících 50 % z B3601 zůstává jako provize po 3 letech.";
      }
      return "Okamžitá provize je součet provize A101 a provize B0301.";
    }
    if (product === "pillowInjury") {
      if (mode === "accelerated") {
        return "Okamžitá provize je součet provize A101, provize B0301 a 50 % z provize B36. Zbývajících 50 % z B36 zůstává jako provize po 3 letech.";
      }
      return "Okamžitá provize je součet provize A101 a provize B0301.";
    }
    if (product !== "neon") return null;
    if (isNeonHistoricalInCoefModal) {
      return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
    }
    if (mode === "accelerated") {
      return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících a 50 % z 3. provize po 36 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
    }
    return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
  }, [product, isNeonHistoricalInCoefModal, mode]);
  const canImportFromPdf = useMemo(
    () => !tipsterModeEnabled,
    [tipsterModeEnabled]
  );

  const coefList = useMemo(
    () =>
      getCoefficientSummary(
        product ?? null,
        position ?? null,
        mode ?? null,
        maxCizinKomplexVariant,
        coefficientDateForView
      ),
    [
      product,
      position,
      mode,
      maxCizinKomplexVariant,
      coefficientDateForView,
    ]
  );
  const coefExplanation = useMemo(() => {
    if (!product) return "";
    const payLabel = frequencyLabel(frequency);
    const payPerYear = paymentsPerYear(frequency);
    switch (product) {
      case "neon":
        return "Výpočet: měsíční pojistné × 12 × doba trvání × koeficient. Následné provize jsou roční: roční pojistné × koeficient (2.–5. rok a 5.–10. rok).";
      case "flexi":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 6. roku do konce zadané doby.";
      case "maximaMaxEfekt":
        return "Výpočet: roční pojistné × doba trvání × koeficient pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 5. roku.";
      case "maxcizinkomplex":
        return `Výpočet: jednorázové pojistné × koeficient (${maxCizinKomplexVariant === "premium" ? "PREMIUM" : "EXCLUSIVE / STANDARD"}). Provize je vyplacena pouze 1×.`;
      case "pillowInjury":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro jednotlivé položky. Koeficienty platné od 01.10.2023.";
      case "domex":
        return isDomexHistoricalInCoefModal
          ? `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}). Historická následná provize se vyplácí maximálně 4 roky.`
          : `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}). Aktuální následná provize se vyplácí po dobu aktivní smlouvy.`;
      case "cppbytex":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}). Následná provize se vyplácí maximálně 4 roky. Provizní režim nemá vliv.`;
      case "cpphafan":
      case "koopmajetekobcan":
      case "koopfit":
      case "koopodzam":
      case "kooppmop":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}).`;
      case "pillowmajetek":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.10.2023.`;
      case "maxdomov":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská i následná). Roční částka = × počet plateb (${payPerYear}).`;
      case "allianzmujdomov":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.06.2020.`;
      case "cppsimplex":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.09.2021.`;
      case "uniqaAuto":
        if (isUniqaAutoEarlyHistoricalInCoefModal) {
          return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×). V 1. roce se použije získatelský koeficient, od 1. výročí následný koeficient.`;
        }
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "uniqaflotila":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částka = × počet plateb (${payPerYear}).`;
      case "slaviaflotila":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částka = × počet plateb (${payPerYear}). Koeficienty platné od 01.08.2025. Zrychlený režim výpočet nemění.`;
      case "koopflotila":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částka = × počet plateb (${payPerYear}). Koeficienty platné od 01.04.2026.`;
      case "cppAuto":
      case "slaviaauto":
      case "allianzAuto":
      case "csobAuto":
      case "pillowAuto":
      case "kooperativaAuto":
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "zamex":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 15.04.2023.`;
      case "cppPPRs":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.06.2023.`;
      case "cppPPRbez":
        return `Výpočet: platba (${payLabel}) × koeficient pro okamžitou (získatelskou) nebo následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.06.2023.`;
      case "cppcestovko":
        return "Výpočet: pojistné × koeficient (jednorázově). Koeficienty platné od 01.09.2019.";
      case "axacestovko":
        return "Výpočet: pojistné × koeficient (jednorázově). Koeficienty platné od 15.04.2021.";
      case "koopcestovko":
        return "Výpočet: pojistné × koeficient (jednorázově). Koeficienty platné od 01.09.2019.";
      case "comfortcc":
        return "Výpočet: následná provize z platby = pravidelná platba × koeficient. U postupného poplatku je tato částka započtená i do okamžité provize. Pokud zadáš cílovou částku, Celkem dopočítá celý součet za všechny výplaty následné.";
      default:
        return "";
    }
  }, [
    product,
    frequency,
    maxCizinKomplexVariant,
    isUniqaAutoEarlyHistoricalInCoefModal,
    isDomexHistoricalInCoefModal,
  ]);
  const autoTermsPreviewUrl = useMemo(() => {
    if (!product) return null;
    if (product === "cppAuto" && isCppAutoHistoricalInCoefModal) {
      return CPP_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "allianzAuto" && isAllianzAutoHistoricalInCoefModal) {
      return ALLIANZ_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "csobAuto" && isCsobAutoHistoricalInCoefModal) {
      return CSOB_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "uniqaAuto" && isUniqaAutoEarlyHistoricalInCoefModal) {
      return UNIQA_AUTO_EARLY_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "uniqaAuto" && isUniqaAutoHistoricalInCoefModal) {
      return UNIQA_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "uniqaflotila" && isUniqaFlotilaHistoricalInCoefModal) {
      return UNIQA_FLOTILA_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "pillowAuto" && isPillowAutoHistoricalInCoefModal) {
      return PILLOW_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (
      product === "kooperativaAuto" &&
      isKooperativaAutoHistoricalInCoefModal
    ) {
      return KOOPERATIVA_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "maximaMaxEfekt" && isMaxEfekt5InCoefModal) {
      return MAXEFEKT5_TERMS_PREVIEW_URL;
    }
    if (product === "maximaMaxEfekt" && !isMaxEfekt7InCoefModal) {
      return null;
    }
    if (product === "domex" && isDomexEarlyHistoricalInCoefModal) {
      return DOMEX_EARLY_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "domex" && isDomexHistoricalInCoefModal) {
      return DOMEX_HISTORICAL_TERMS_PREVIEW_URL;
    }
    return AUTO_TERMS_PREVIEW_BY_PRODUCT[product] ?? null;
  }, [
    product,
    isMaxEfekt5InCoefModal,
    isMaxEfekt7InCoefModal,
    isCppAutoHistoricalInCoefModal,
    isAllianzAutoHistoricalInCoefModal,
    isCsobAutoHistoricalInCoefModal,
    isUniqaAutoHistoricalInCoefModal,
    isUniqaAutoEarlyHistoricalInCoefModal,
    isUniqaFlotilaHistoricalInCoefModal,
    isPillowAutoHistoricalInCoefModal,
    isKooperativaAutoHistoricalInCoefModal,
    isDomexEarlyHistoricalInCoefModal,
    isDomexHistoricalInCoefModal,
  ]);
  const showAutoTermsPreview = Boolean(autoTermsPreviewUrl);
  const neonPeriod = neonCoefficientView === "historical" ? "2019" : "2024";
  const neonPreviewRole: "poradce" | "manazer" = (
    timelineMatchedPosition?.position ?? position
  ).startsWith("poradce")
    ? "poradce"
    : "manazer";
  const neonTermsPreviewUrl =
    product === "neon"
      ? `/api/documents/neon?type=pdf&period=${neonPeriod}`
      : null;
  const neonPreviewImageUrl =
    product === "neon"
      ? `/api/documents/neon?type=preview&period=${neonPeriod}&role=${neonPreviewRole}`
      : null;
  const showNeonTermsPreview = product === "neon";
  const handleNeonDocumentAction = async (action: "download" | "open") => {
    if (!user || !neonTermsPreviewUrl) return;

    let openedWindow: Window | null = null;
    if (action === "open") {
      openedWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!openedWindow) {
        setNeonPreviewError("Prohlížeč zablokoval otevření nové karty s PDF.");
        return;
      }
      try {
        openedWindow.document.title = "Načítám provizní podmínky...";
        openedWindow.document.body.style.fontFamily = "monospace";
        openedWindow.document.body.style.padding = "24px";
        openedWindow.document.body.textContent = "Načítám provizní podmínky...";
      } catch {
        // best effort
      }
    }

    setNeonDocAction(action);
    setNeonPreviewError(null);
    try {
      const path =
        action === "download" ? `${neonTermsPreviewUrl}&download=1` : neonTermsPreviewUrl;
      const response = await requestBlobWithAuth({
        user,
        path,
      });
      if (!response.ok) {
        throw new Error(`Nepodařilo se načíst PDF (${response.status}).`);
      }

      const pdfBlob = await response.blob();
      const blobUrl = URL.createObjectURL(pdfBlob);
      if (action === "download") {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `cppneon${neonPeriod}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
      } else {
        if (!openedWindow || openedWindow.closed) {
          URL.revokeObjectURL(blobUrl);
          throw new Error("Nepodařilo se otevřít kartu s PDF.");
        }
        openedWindow.location.href = blobUrl;
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
    } catch (err) {
      if (openedWindow && !openedWindow.closed) {
        openedWindow.close();
      }
      const errorMessage =
        err instanceof Error && err.message.trim().length > 0
          ? err.message.trim()
          : "Nepodařilo se načíst provizní podmínky.";
      setNeonPreviewError(errorMessage);
    } finally {
      setNeonDocAction(null);
    }
  };
  const filteredClientSuggestions = useMemo(() => {
    const q = normalizeClientSuggestionText(clientName);
    if (!q) return [];
    const personQuery = clientNameLooksLikePersonQuery(q);
    return clientSuggestions
      .map((name) => ({
        name,
        score:
          personQuery && clientNameLooksLikeCompany(name)
            ? 0
            : clientNameSuggestionScore(q, name),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.name.localeCompare(right.name, "cs-CZ");
      })
      .slice(0, CLIENT_SUGGESTIONS_VISIBLE_LIMIT)
      .map((item) => item.name);
  }, [clientName, clientSuggestions]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchClientNames = async () => {
      const targetOwnerEmail = effectiveSaveOwnerEmail;
      if (!user?.email || !targetOwnerEmail) {
        if (!cancelled) setClientSuggestions([]);
        return;
      }

      if (!cancelled) {
        setClientSuggestions([]);
      }

      const namesByKey = new Map<string, string>();
      const publishClientSuggestions = () => {
        if (!cancelled) {
          setClientSuggestions(Array.from(namesByKey.values()));
        }
      };

      try {
        let bearerToken = await user.getIdToken();
        let cursor: string | null = null;

        for (let page = 0; page < CLIENT_SUGGESTIONS_MAX_PAGES; page += 1) {
          const params = new URLSearchParams({
            scope: isSavingForSubordinate ? "team" : "my",
            limit: String(CLIENT_SUGGESTIONS_PAGE_LIMIT),
            shape: "clientNames",
          });
          if (isSavingForSubordinate) {
            params.set("subordinates", targetOwnerEmail);
          }
          if (cursor) params.set("cursor", cursor);

          const requestWithToken = async (token: string) =>
            fetch(`/api/contracts/list?${params.toString()}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              cache: "no-store",
            });

          let res = await requestWithToken(bearerToken);
          if (res.status === 401) {
            bearerToken = await user.getIdToken(true);
            res = await requestWithToken(bearerToken);
          }

          const payload = (await res.json()) as ContractsApiResponse;
          if (!res.ok || payload?.ok === false) {
            throw new Error(payload?.error || "Nepodařilo se načíst smlouvy.");
          }

          (payload.contracts ?? [])
            .map((d) => d.clientName)
            .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
            .forEach((name) => {
              const trimmed = name.trim();
              const key = normalizeClientNameForSystemMatch(trimmed);
              if (key && !namesByKey.has(key)) {
                namesByKey.set(key, trimmed);
              }
            });

          publishClientSuggestions();

          const nextCursor = payload.nextCursorToken ?? null;
          if (!payload.hasMore || !nextCursor || nextCursor === cursor) {
            break;
          }
          cursor = nextCursor;
        }

        publishClientSuggestions();
      } catch (err) {
        console.error("Failed to load client name suggestions", err);
        publishClientSuggestions();
      }
    };

    void fetchClientNames();

    return () => {
      cancelled = true;
    };
  }, [user, effectiveSaveOwnerEmail, isSavingForSubordinate]);

  useEffect(() => {
    if (!user || !canOverrideOwnerOnSave) {
      setSubordinateOptions([]);
      setSelectedSubordinateEmail(null);
      setSubordinateSearchText("");
      setSubordinateLoadError(null);
      setSubordinateLoading(false);
      setSubordinatePickerOpen(false);
      return;
    }

    let cancelled = false;
    const loadSubordinates = async () => {
      setSubordinateLoading(true);
      setSubordinateLoadError(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<TeamOverviewApiResponse>(
          user,
          "/api/team-overview",
          { method: "GET" }
        );
        const ownEmail = normalizeEmailValue(user.email);
        const options = (Array.isArray(payload?.members) ? payload.members : [])
          .map((member) => {
            const email = normalizeEmailValue(member?.email);
            if (!email || email === ownEmail) return null;
            const rawName =
              typeof member?.name === "string" ? member.name.trim() : "";
            return {
              email,
              name: rawName || simpleNameFromEmail(email),
              managerEmail: normalizeEmailValue(member?.managerEmail) || null,
              position: POSITION_ORDER.includes(member?.position as Position)
                ? (member?.position as Position)
                : null,
              commissionMode:
                member?.commissionMode === "standard" ||
                member?.commissionMode === "accelerated"
                  ? member.commissionMode
                  : null,
            } satisfies SubordinateOption;
          })
          .filter((member): member is SubordinateOption => Boolean(member))
          .sort((a, b) => a.name.localeCompare(b.name, "cs"));

        if (cancelled) return;
        setSubordinateOptions(options);
        setSelectedSubordinateEmail((prev) =>
          prev && options.some((item) => item.email === prev) ? prev : null
        );
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message.trim()
            : "Nepodařilo se načíst podřízené.";
        setSubordinateLoadError(message);
        setSubordinateOptions([]);
        setSelectedSubordinateEmail(null);
      } finally {
        if (!cancelled) {
          setSubordinateLoading(false);
        }
      }
    };

    void loadSubordinates();

    return () => {
      cancelled = true;
    };
  }, [user, canOverrideOwnerOnSave]);

  useEffect(() => {
    if (subordinatePickerOpen) {
      setSubordinateSearchText("");
    }
  }, [subordinatePickerOpen]);

  useEffect(() => {
    if (!canOverrideOwnerOnSave) return;

    if (!selectedSubordinateEmail) {
      if (userCommissionMode) {
        setMode(userCommissionMode);
      }
      return;
    }

    const subordinate = subordinateOptionsByEmail.get(selectedSubordinateEmail) ?? null;
    if (subordinate?.position) {
      setPosition(subordinate.position);
    }
    if (subordinate?.commissionMode) {
      setMode(subordinate.commissionMode);
    }
  }, [
    canOverrideOwnerOnSave,
    selectedSubordinateEmail,
    subordinateOptionsByEmail,
    userCommissionMode,
  ]);

  useEffect(() => {
    if (!user || !canOverrideOwnerOnSave || !selectedSubordinateEmail) {
      setSubordinatePositionTimeline(null);
      setSubordinatePositionTimelineEmail(null);
      setSubordinatePositionTimelineLoading(false);
      setSubordinatePositionTimelineError(null);
      return;
    }

    let cancelled = false;
    const loadSubordinateTimeline = async () => {
      setSubordinatePositionTimelineLoading(true);
      setSubordinatePositionTimelineError(null);
      setSubordinatePositionTimeline(null);
      setSubordinatePositionTimelineEmail(null);
      try {
        const payload =
          await fetchAuthedJsonOrThrow<TeamOverviewPositionTimelineReadApiResponse>(
            user,
            `/api/team-overview?action=positionTimelineRead&targetEmail=${encodeURIComponent(
              selectedSubordinateEmail
            )}`,
            { method: "GET" }
          );
        if (cancelled) return;
        setSubordinatePositionTimeline(parsePositionTimeline(payload?.positionTimeline));
        setSubordinatePositionTimelineEmail(selectedSubordinateEmail);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message.trim()
            : "Nepodařilo se načíst kariérní historii vybraného poradce.";
        setSubordinatePositionTimeline([]);
        setSubordinatePositionTimelineEmail(selectedSubordinateEmail);
        setSubordinatePositionTimelineError(message);
      } finally {
        if (!cancelled) {
          setSubordinatePositionTimelineLoading(false);
        }
      }
    };

    void loadSubordinateTimeline();

    return () => {
      cancelled = true;
    };
  }, [user, canOverrideOwnerOnSave, selectedSubordinateEmail]);

  useEffect(() => {
    if (!pdfClientNameLoaded) {
      setPdfMatchedClientName(false);
      return;
    }

    const normalizedClientName = normalizeClientNameForSystemMatch(clientName);
    if (!normalizedClientName) {
      setPdfMatchedClientName(false);
      return;
    }

    const matched = clientSuggestions.some(
      (name) => normalizeClientNameForSystemMatch(name) === normalizedClientName
    );
    setPdfMatchedClientName(matched);
  }, [pdfClientNameLoaded, clientName, clientSuggestions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeProfileEmail) return;

    const profileStoredMode = window.localStorage.getItem(
      profileModeStorageKey(activeProfileEmail)
    ) as CommissionMode | null;
    const legacyStoredMode = impersonatedUserEmail
      ? null
      : (window.localStorage.getItem(SETTINGS_KEYS.mode) as CommissionMode | null);
    const storedMode = profileStoredMode ?? legacyStoredMode;
    if (storedMode === "standard" || storedMode === "accelerated") {
      setMode(storedMode);
    }
  }, [activeProfileEmail, impersonatedUserEmail]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTipsterMode = window.localStorage.getItem(SETTINGS_KEYS.tipsterMode);
    if (storedTipsterMode === "1" || storedTipsterMode === "0") {
      setTipsterModeEnabled(storedTipsterMode === "1");
    }

    const storedTipsterPercent = window.localStorage.getItem(SETTINGS_KEYS.tipsterPercent);
    const tipsterPercentValue = storedTipsterPercent
      ? Number(storedTipsterPercent)
      : 100;
    if (Number.isFinite(tipsterPercentValue)) {
      setTipsterPercent(clampTipsterPercent(tipsterPercentValue));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadUserPosition = async () => {
      if (!user?.email || !activeProfileEmail) {
        setUserCommissionMode(null);
        setPositionTimeline([]);
        setManagerEmailSnapshot(null);
        setManagerPositionSnapshot(null);
        setManagerModeSnapshot(null);
        setManagerChainSnapshot([]);
        return;
      }
      try {
        const payload = await fetchAuthedJsonOrThrow<{
          ok?: boolean;
          email?: string;
          profile?: Record<string, unknown>;
        }>(user, "/api/user/profile", { method: "GET" });
        if (cancelled) return;
        const data = (payload?.profile ?? {}) as any;
        const profileEmail =
          normalizeEmailValue(payload?.email) ||
          normalizeEmailValue(data?.email) ||
          activeProfileEmail;

        const parsedPositionTimeline = parsePositionTimeline(data?.positionTimeline);
        setPositionTimeline(parsedPositionTimeline);
        if (parsedPositionTimeline.length > 0) {
          const currentTimelineRow =
            resolveCurrentPositionTimelineRow(parsedPositionTimeline);
          if (currentTimelineRow) {
            setPosition(currentTimelineRow.position);
          }
        }

        let mgrEmail = (data?.managerEmail as string | undefined)?.toLowerCase() ?? null;
        setManagerEmailSnapshot(mgrEmail ?? null);
        const userMode =
          data?.commissionMode === "standard" || data?.commissionMode === "accelerated"
            ? data.commissionMode
            : null;
        if (userMode) {
          setUserCommissionMode(userMode);
          setMode(userMode);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(profileModeStorageKey(profileEmail), userMode);
            if (!impersonatedUserEmail && profileEmail === normalizedUserEmail) {
              window.localStorage.setItem(SETTINGS_KEYS.mode, userMode);
            }
          }
        }

        const tipsterModeValue =
          typeof data?.tipsterCollaborationMode === "boolean"
            ? data.tipsterCollaborationMode
            : null;
        if (tipsterModeValue !== null) {
          setTipsterModeEnabled(tipsterModeValue);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              SETTINGS_KEYS.tipsterMode,
              tipsterModeValue ? "1" : "0"
            );
          }
        }

        const tipsterPercentValue =
          typeof data?.tipsterCommissionPercent === "number"
            ? clampTipsterPercent(data.tipsterCommissionPercent)
            : null;
        if (tipsterPercentValue !== null) {
          setTipsterPercent(tipsterPercentValue);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              SETTINGS_KEYS.tipsterPercent,
              String(tipsterPercentValue)
            );
          }
        }

        let chain: ManagerChainSnapshotEntry[] = [];
        try {
          const snapshot = await requestManagerSnapshotWithAuth({
            user,
            signedDateIso: null,
          });
          if (cancelled) return;
          const snapshotManagerEmail = snapshot.managerEmail ?? null;
          if (snapshotManagerEmail) {
            setManagerEmailSnapshot(snapshotManagerEmail);
            mgrEmail = snapshotManagerEmail;
          }
          setManagerPositionSnapshot(snapshot.managerPosition ?? null);
          setManagerModeSnapshot(snapshot.managerMode ?? null);
          chain = snapshot.managerChain;
        } catch (mgrErr) {
          console.error("Failed to load manager snapshot", mgrErr);
          setManagerPositionSnapshot(null);
          setManagerModeSnapshot(null);
        }

        if (cancelled) return;
        if (chain.length === 0 && mgrEmail) {
          chain = ensureManagerChainWithDirectManager(chain, mgrEmail, null, null);
        }
        setManagerChainSnapshot(chain);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load user position", err);
        setPositionTimeline([]);
      }
    };

    loadUserPosition();
    return () => {
      cancelled = true;
    };
  }, [user, activeProfileEmail, impersonatedUserEmail, normalizedUserEmail]);

  useEffect(() => {
    if (calculatorViewMode === "commissionOnly") {
      setTimelineMatchedPosition(null);
      return;
    }

    if (effectivePositionTimelineLoading) {
      setTimelineMatchedPosition(null);
      return;
    }

    const signedDateIso = contractSignedDate.trim();
    if (!signedDateIso) {
      setTimelineMatchedPosition(null);
      const currentTimelineRow =
        resolveCurrentPositionTimelineRow(effectivePositionTimeline);
      if (currentTimelineRow) {
        setPosition((prev) =>
          prev === currentTimelineRow.position ? prev : currentTimelineRow.position
        );
      }
      return;
    }

    if (effectivePositionTimeline.length === 0) {
      setTimelineMatchedPosition(null);
      return;
    }

    const match = resolvePositionTimelineMatch(signedDateIso, effectivePositionTimeline);
    if (!match) {
      setTimelineMatchedPosition(null);
      return;
    }

    setTimelineMatchedPosition({
      position: match.position,
      validFrom: match.validFrom,
      validTo: match.validTo,
    });
    setPosition((prev) => (prev === match.position ? prev : match.position));
  }, [
    calculatorViewMode,
    contractSignedDate,
    effectivePositionTimeline,
    effectivePositionTimelineLoading,
  ]);

  const validateTimelineBeforeSave = (): boolean => {
    if (effectivePositionTimelineLoading) {
      const msg = isSavingForSubordinate
        ? "Načítám kariérní historii vybraného poradce. Zkus uložení za chvíli."
        : "Načítám kariérní historii. Zkus uložení za chvíli.";
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    if (effectivePositionTimeline.length === 0) {
      const msg = isSavingForSubordinate
        ? `Vybraný poradce ${selectedSaveOwnerLabel} nemá vyplněnou kariérní historii. Bez timeline nejde smlouvu uložit.`
        : "Bez nastavené timeline kariéry nejde smlouvu uložit. Doplň ji prosím v Nastavení.";
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    const signedDateIso = contractSignedDate.trim();
    if (!signedDateIso || !isIsoDay(signedDateIso)) return true;

    const match = resolvePositionTimelineMatch(signedDateIso, effectivePositionTimeline);
    if (match) return true;

    const msg = isSavingForSubordinate
      ? `Pro datum sjednání ${formatIsoDay(
          signedDateIso
        )} nemá vybraný poradce ${selectedSaveOwnerLabel} v timeline nastavenou pozici.`
      : `Pro datum sjednání ${formatIsoDay(
          signedDateIso
        )} nemáš v timeline nastavenou pozici.`;
    setSaveMessage(msg);
    setValidationError(msg);
    return false;
  };

  useEffect(() => {
    const allowed = allowedFrequencies(product);
    if (!allowed.includes(frequency)) {
      setFrequency(allowed[0]);
    }

    if (product !== "comfortcc") {
      setComfortGradual(false);
      setComfortPaymentText("");
      setComfortTargetAmountText("");
    }

    const [min, max] = durationRange(product);
    if (durationYears == null) {
      if (product !== "neon" && product !== "maximaMaxEfekt") {
        setDurationYears(durationFallback(product));
        return;
      }
    } else if (durationYears < min || durationYears > max) {
      setDurationYears(Math.min(max, Math.max(min, durationYears)));
    }

    if (shouldShowDurationMonths(product)) {
      if (durationMonths == null) {
        setDurationMonths(durationMonthsFallback(product));
        return;
      }
      const [minMonths, maxMonths] = durationMonthsRange(product);
      if (durationMonths < minMonths || durationMonths > maxMonths) {
        setDurationMonths(Math.min(maxMonths, Math.max(minMonths, durationMonths)));
      }
    } else if (durationMonths != null) {
      setDurationMonths(null);
    }

    // pokud uživatel má zrychlený režim, dovolíme přepnout pro konkrétní smlouvu
    // defaultně zůstává nastavený režim z profilu (mode)
  }, [product, frequency, durationYears, durationMonths]);

  // Výchozí hodnota doby trvání po změně produktu
  useEffect(() => {
    if (product === "neon" || product === "maximaMaxEfekt") {
      setDurationYears(null);
    }
    if (product === "maxcizinkomplex") {
      setDurationMonths(12);
      setMaxCizinKomplexVariant("exclusiveStandard");
    }
  }, [product]);

  useEffect(() => {
    // pokud uživatel začal doplňovat chybějící pole, postupně čistíme chyby
    setMissingFields((prev) =>
      prev.filter((key) => {
        if (key === "částku") return parseNumber(amountText) <= 0;
        if (key === "jméno klienta") return !clientName.trim();
        if (key === "číslo smlouvy") return !contractNumber.trim();
        if (key === "datum sjednání") return !contractSignedDate.trim();
        if (key === "datum počátku") return !policyStartDate.trim();
        if (key === "produkt") return !hasSelectedProduct;
        if (key === "dobu trvání smlouvy") {
          return product === "maximaMaxEfekt" && durationYears == null;
        }
        if (key === "pravidelnou platbu") return product === "comfortcc" && comfortGradual && parseNumber(comfortPaymentText) <= 0;
        if (key === "dobu trvání v měsících") {
          return (
            product === "maxcizinkomplex" &&
            (durationMonths == null || normalizedDurationMonths(product, durationMonths) <= 0)
          );
        }
        return true;
      })
    );
  }, [
    amountText,
    clientName,
    contractNumber,
    contractSignedDate,
    policyStartDate,
    durationYears,
    comfortPaymentText,
    product,
    hasSelectedProduct,
    comfortGradual,
    durationMonths,
  ]);

  useEffect(() => {
    if (!tipsterModeEnabled) {
      setTipsterPercentPanelOpen(false);
    }
  }, [tipsterModeEnabled]);

  useEffect(() => {
    if (tipsterModeEnabled) {
      setCalculatorViewMode("commissionOnly");
      setTipContractModalOpen(false);
    }
  }, [tipsterModeEnabled]);

  useEffect(() => {
    if (!tipContractModalOpen || !user) {
      setTipContractUserSuggestions([]);
      setTipContractSuggestionsLoading(false);
      return;
    }

    const query = tipContractDraftEmail.trim();
    const normalizedQuery = query.toLowerCase();
    if (query.length < 2) {
      setTipContractUserSuggestions([]);
      setTipContractSuggestionsLoading(false);
      return;
    }
    if (
      normalizedQuery === selectedTipContractUserEmail ||
      normalizedQuery === foundTipContractLookupEmail
    ) {
      setTipContractUserSuggestions([]);
      setTipContractSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setTipContractSuggestionsLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchApiResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(query)}`,
          { method: "GET" }
        );
        if (cancelled) return;

        const users = Array.isArray(payload.users)
          ? payload.users
              .map((option): TipContractUserOption => {
                const email =
                  typeof option.email === "string" ? option.email.trim().toLowerCase() : "";
                return {
                  email,
                  name: typeof option.name === "string" ? option.name.trim() : "",
                  managerEmail:
                    typeof option.managerEmail === "string" && option.managerEmail.trim()
                      ? option.managerEmail.trim().toLowerCase()
                      : null,
                  accountType: option.accountType === "tipster" ? "tipster" : "advisor",
                };
              })
              .filter((option) => option.email)
          : [];
        setTipContractUserSuggestions(users);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load TIP user suggestions", err);
          setTipContractUserSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setTipContractSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    foundTipContractLookupEmail,
    selectedTipContractUserEmail,
    tipContractModalOpen,
    tipContractDraftEmail,
    user,
  ]);

  useEffect(() => {
    if (!tipContractModalOpen) return;

    const normalizedEmail = tipContractDraftEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setTipContractLookupState({ status: "idle" });
      return;
    }
    if (!EMAIL_LOOKUP_RE.test(normalizedEmail)) {
      setTipContractLookupState({ status: "idle" });
      return;
    }
    if (!user) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setTipContractLookupState({ status: "checking" });
      try {
        const payload = await fetchAuthedJsonOrThrow<TipsterLookupApiResponse>(
          user,
          `/api/user/lookup?email=${encodeURIComponent(normalizedEmail)}`,
          { method: "GET" }
        );
        if (cancelled) return;

        if (payload?.exists && typeof payload.email === "string" && payload.email.trim()) {
          const accountType = payload.accountType === "tipster" ? "tipster" : "advisor";
          const foundUser = {
            email: payload.email.trim().toLowerCase(),
            name:
              typeof payload.name === "string" && payload.name.trim()
                ? payload.name.trim()
                : payload.email.trim().toLowerCase(),
            managerEmail: null,
            accountType,
          } satisfies TipContractUserOption;
          setTipContractLookupState({
            status: "found",
            email: foundUser.email,
            name:
              typeof payload.name === "string" && payload.name.trim()
                ? payload.name.trim()
                : null,
            accountType,
          });
          setTipContractSelectedUser(foundUser);
          return;
        }

        setTipContractSelectedUser(null);
        setTipContractLookupState({ status: "notFound" });
      } catch (lookupErr) {
        if (cancelled) return;
        const message =
          lookupErr instanceof Error && lookupErr.message.trim()
            ? lookupErr.message.trim()
            : "Ověření tipaře se nepodařilo.";
        setTipContractLookupState({ status: "error", message });
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tipContractModalOpen, tipContractDraftEmail, user]);

  useEffect(() => {
    if (!isAutoProduct(product)) {
      setAutoCarMake("");
      setAutoCarPlate("");
      setAutoCarVin("");
      setAutoCarTp("");
      setAutoCarOrv("");
      setAutoCarAnnualMileage("");
      setAutoCarAllianzScope("");
      setAutoCarLiabilityLimit(null);
      setAutoCarHullSumInsured(null);
      setAutoCarHullSumInsuredText("");
      setAutoCarHullSumInsuredDraft("");
      setAutoCarHullDeductible(null);
      setAutoCarHullDeductibleText("");
      setAutoCarHullRiskAccident(false);
      setAutoCarHullRiskTheft(false);
      setAutoCarHullRiskNatural(false);
      setAutoCarHullRiskVandalism(false);
      setAutoCarHullRiskAnimalCollision(false);
      setAutoCarAssistancePlan("");
      setAutoCarAddonEso(false);
      setAutoCarAddonNaturalRisks(false);
      setAutoCarAddonKlika(false);
      setAutoCarAddonGlass(false);
      setAutoCarAddonGlassLimit(null);
      setAutoCarAddonAnimalCollision(false);
      setAutoCarAddonAnimalCollisionLimit(null);
      setAutoCarAddonAnimalDamage(false);
      setAutoCarAddonAnimalDamageLimit(null);
      setAutoCarAddonVandalism(false);
      setAutoCarAddonTheft(false);
      setAutoCarAddonTheftLimit(null);
      setAutoCarAddonNatural(false);
      setAutoCarAddonNaturalLimit(null);
      setAutoCarAddonOwnDamage(false);
      setAutoCarAddonOwnDamageLimit(null);
      setAutoCarAddonGap(false);
      setAutoCarAddonGapLimit(null);
      setAutoCarAddonSmartGap(false);
      setAutoCarAddonServisPro(false);
      setAutoCarAddonFireExplosion(false);
      setAutoCarAddonLegalAdvice(false);
      setAutoCarAddonReplacementCar(false);
      setAutoCarAddonLuggage(false);
      setAutoCarAddonTransportedGoods(false);
      setAutoCarAddonPothole(false);
      setAutoCarAddonNonFaultAccident(false);
      setAutoCarAddonPassengerInjury(false);
      setAutoCarAddonKeyLossTheft(false);
    }
  }, [product]);

  useEffect(() => {
    if (product !== "domex" && product !== "maxdomov") {
      setDomexAddress("");
      setDomexPropertyType("");
      setDomexPropertyCoverage("");
      setDomexPropertySumInsured(null);
      setDomexPropertyDeductible(null);
      setDomexHouseholdType("");
      setDomexHouseholdCoverage("");
      setDomexHouseholdSumInsured(null);
      setDomexHouseholdDeductible(null);
      setDomexOutbuildingSumInsured(null);
      setDomexLiabilitySumInsured(null);
      setDomexLiabilityDeductible(null);
      setDomexLiabilityMobile(false);
      setDomexLiabilityTenant(false);
      setDomexLiabilityLandlord(false);
      setDomexAssistancePlus(false);
      setDomexNote("");
    }
  }, [product]);

  useEffect(() => {
    if (product !== "neon") {
      setNeonPdfDetailFields(createEmptyNeonPdfDetailFields());
    }
  }, [product]);

  useEffect(() => {
    const trimmedContractNumber = contractNumber.trim();
    const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user?.email);
    if (!user || !trimmedContractNumber || trimmedContractNumber.length < 3 || !targetOwnerEmail) {
      setContractNumberLiveCheck({ status: "idle" });
      setEndorsementPreviewSource(null);
      return;
    }

    const checkMode = endorsementWorkflowActive ? "endorsement" : "newContract";
    let canceled = false;
    const timer = window.setTimeout(async () => {
      setContractNumberLiveCheck({ status: "checking" });
      try {
        const params = new URLSearchParams({
          scope: isSavingForSubordinate ? "team" : "my",
          q: trimmedContractNumber,
        });
        const payload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
          user,
          `/api/contracts/find?${params.toString()}`
        );
        if (canceled) return;

        if (payload.ok === false) {
          setEndorsementPreviewSource(null);
          setContractNumberLiveCheck({ status: "error" });
          return;
        }

        const ownerContracts = (Array.isArray(payload.contracts) ? payload.contracts : []).filter(
          (entry) => contractOwnerEmail(entry) === targetOwnerEmail
        );

        if (checkMode === "endorsement") {
          const sourceContracts = buildEndorsementSourceEntries(ownerContracts, product);
          const sourceContractCount = sourceContracts.length;
          setEndorsementPreviewSource(sourceContracts[0] ?? null);
          setContractNumberLiveCheck(
            sourceContractCount > 0
              ? { status: "foundForEndorsement", count: sourceContractCount }
              : { status: "notFoundForEndorsement" }
          );
          return;
        }

        const dupCount = ownerContracts.length;
        if (dupCount > 0) {
          const sourceContracts = LIFE_PRODUCTS.includes(product)
            ? buildEndorsementSourceEntries(ownerContracts, product)
            : [];
          if (!originalReplacementWorkflowActive && sourceContracts.length > 0) {
            setEndorsementPreviewSource(sourceContracts[0]);
            setContractNumberLiveCheck({
              status: "foundForEndorsement",
              count: sourceContracts.length,
            });
            return;
          }
          setEndorsementPreviewSource(null);
          setContractNumberLiveCheck({
            status: "duplicate",
            count: dupCount,
          });
          return;
        }
        setEndorsementPreviewSource(null);
        setContractNumberLiveCheck({ status: "ok" });
      } catch (err) {
        console.warn("Live kontrola duplicitního čísla smlouvy selhala", err);
        if (!canceled) {
          setEndorsementPreviewSource(null);
          setContractNumberLiveCheck({ status: "error" });
        }
      }
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [
    contractNumber,
    effectiveSaveOwnerEmail,
    endorsementWorkflowActive,
    isSavingForSubordinate,
    originalReplacementWorkflowActive,
    product,
    user,
  ]);

  useEffect(() => {
    const trimmedOriginalNumber = refreshOriginalContractNumber.trim();
    const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user?.email);
    if (
      !user ||
      !supportsOriginalContractReplacement(product) ||
      !refreshOriginalOpen ||
      refreshOriginalMissingInSystem ||
      !trimmedOriginalNumber ||
      trimmedOriginalNumber.length < 3 ||
      !targetOwnerEmail
    ) {
      setRefreshOriginalLookup({
        status: "idle",
        progress: 0,
        adviserName: null,
        original: null,
      });
      return;
    }

    let cancelled = false;
    let progressInterval: number | null = null;

    const timer = window.setTimeout(async () => {
      setRefreshOriginalLookup({
        status: "checking",
        progress: 0,
        adviserName: null,
        original: null,
      });
      progressInterval = window.setInterval(() => {
        setRefreshOriginalLookup((prev) => {
          if (prev.status !== "checking") return prev;
          const nextProgress = Math.min(92, prev.progress + Math.max(3, Math.round((94 - prev.progress) / 7)));
          return { ...prev, progress: nextProgress };
        });
      }, 160);

      try {
        const params = new URLSearchParams({
          scope: isSavingForSubordinate ? "team" : "my",
          q: trimmedOriginalNumber,
        });
        const payload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
          user,
          `/api/contracts/find?${params.toString()}`
        );
        if (cancelled) return;

        if (payload.ok === false) {
          setRefreshOriginalLookup({
            status: "error",
            progress: 100,
            adviserName: null,
            original: null,
          });
          return;
        }

        const matchingContracts = (Array.isArray(payload.contracts) ? payload.contracts : []).filter(
          (item) => {
            const ownerEmail =
              normalizeEmailValue(item.userEmail) || normalizeEmailValue(item.adviserEmail);
            return ownerEmail === targetOwnerEmail;
          }
        );

        if (matchingContracts.length === 0) {
          setRefreshOriginalLookup({
            status: "notFound",
            progress: 100,
            adviserName: null,
            original: null,
          });
          return;
        }

        const productMatch =
          matchingContracts.find((item) => item.productKey === product) ?? matchingContracts[0];
        const adviserName =
          typeof productMatch.adviserName === "string" && productMatch.adviserName.trim()
            ? productMatch.adviserName.trim()
            : null;

        if (productMatch.productKey !== product) {
          setRefreshOriginalLookup({
            status: "wrongProduct",
            progress: 100,
            adviserName,
            original: null,
          });
          return;
        }

        setRefreshOriginalLookup({
          status: "found",
          progress: 100,
          adviserName,
          original: resolveRefreshOriginalContractInfo(productMatch),
        });
      } catch (err) {
        console.warn("Ověření původní refresh smlouvy selhalo", err);
        if (!cancelled) {
          setRefreshOriginalLookup({
            status: "error",
            progress: 100,
            adviserName: null,
            original: null,
          });
        }
      } finally {
        if (progressInterval != null) {
          window.clearInterval(progressInterval);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (progressInterval != null) {
        window.clearInterval(progressInterval);
      }
    };
  }, [
    user,
    product,
    refreshOriginalOpen,
    refreshOriginalMissingInSystem,
    refreshOriginalContractNumber,
    effectiveSaveOwnerEmail,
    isSavingForSubordinate,
  ]);

  useEffect(() => {
    if (
      product !== "neon" ||
      !refreshOriginalOpen ||
      refreshOriginalMissingInSystem ||
      !refreshOriginalPdfLookupNumber
    ) {
      return;
    }

    const currentNumber = refreshOriginalContractNumber.trim();
    if (currentNumber !== refreshOriginalPdfLookupNumber) {
      setRefreshOriginalPdfLookupNumber(null);
      return;
    }

    if (refreshOriginalLookup.status === "notFound") {
      setRefreshOriginalMissingInSystem(true);
      setRefreshOriginalContractNumber("");
      setRefreshOriginalPdfLookupNumber(null);
      setPdfImportStatus(
        "PDF je REFRESH a původní smlouva z PDF není v systému. Zapnul jsem volbu Původní smlouva není v systému."
      );
      return;
    }

    if (
      refreshOriginalLookup.status === "found" ||
      refreshOriginalLookup.status === "wrongProduct" ||
      refreshOriginalLookup.status === "error"
    ) {
      setRefreshOriginalPdfLookupNumber(null);
    }
  }, [
    product,
    refreshOriginalOpen,
    refreshOriginalMissingInSystem,
    refreshOriginalPdfLookupNumber,
    refreshOriginalContractNumber,
    refreshOriginalLookup.status,
  ]);

  const persistTipsterMode = async (value: boolean) => {
    if (value === tipsterModeEnabled || tipsterModeSaving) return;

    const previousTipsterMode = tipsterModeEnabled;
    const previousViewMode = calculatorViewMode;

    setTipsterModeEnabled(value);
    if (value) {
      setCalculatorViewMode("commissionOnly");
    }
    if (!impersonatedUserEmail && typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterMode, value ? "1" : "0");
    }

    if (!user) return;

    setTipsterModeSaving(true);
    try {
      if (normalizeEmailValue(readAdminImpersonationState()?.email) !== impersonatedUserEmail) {
        throw new Error("Přepnutí uživatele se změnilo. Změnu ulož znovu.");
      }
      const profilePatch = resolveUserProfilePatchRequest();
      await fetchAuthedJsonOrThrow(user, profilePatch.url, {
        method: "PATCH",
        headers: profilePatch.headers,
        body: JSON.stringify({ tipsterCollaborationMode: value }),
      });
    } catch (err) {
      console.error("Failed to persist tipster mode", err);
      setTipsterModeEnabled(previousTipsterMode);
      setCalculatorViewMode(previousViewMode);
      if (!impersonatedUserEmail && typeof window !== "undefined") {
        window.localStorage.setItem(
          SETTINGS_KEYS.tipsterMode,
          previousTipsterMode ? "1" : "0"
        );
      }
    } finally {
      setTipsterModeSaving(false);
    }
  };

  const setTipsterPercentDraft = (value: number): number => {
    const next = clampTipsterPercent(value);
    setTipsterPercent(next);
    if (!impersonatedUserEmail && typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterPercent, String(next));
    }
    return next;
  };

  const persistTipsterPercent = async (value: number) => {
    const next = setTipsterPercentDraft(value);

    if (!user) return;

    try {
      if (normalizeEmailValue(readAdminImpersonationState()?.email) !== impersonatedUserEmail) {
        throw new Error("Přepnutí uživatele se změnilo. Změnu ulož znovu.");
      }
      const profilePatch = resolveUserProfilePatchRequest();
      await fetchAuthedJsonOrThrow(user, profilePatch.url, {
        method: "PATCH",
        headers: profilePatch.headers,
        body: JSON.stringify({ tipsterCommissionPercent: next }),
      });
    } catch (err) {
      console.error("Failed to persist tipster percent", err);
    }
  };

  const getCurrentTipContractUser = (): TipContractUserOption | null => {
    const normalizedDraftEmail = tipContractDraftEmail.trim().toLowerCase();
    if (!normalizedDraftEmail) return null;
    if (tipContractSelectedUser?.email === normalizedDraftEmail) {
      return tipContractSelectedUser;
    }
    if (
      tipContractLookupState.status === "found" &&
      tipContractLookupState.email === normalizedDraftEmail
    ) {
      return {
        email: tipContractLookupState.email,
        name: tipContractLookupState.name ?? tipContractLookupState.email,
        managerEmail: null,
        accountType: tipContractLookupState.accountType,
      };
    }
    return null;
  };

  const handleTipContractUserInputChange = (value: string) => {
    setTipContractDraftEmail(value);
    const normalizedValue = value.trim().toLowerCase();
    if (tipContractSelectedUser?.email !== normalizedValue) {
      setTipContractSelectedUser(null);
      setTipContractSelectedTip(null);
      setTipContractTips([]);
      setTipContractTipsError(null);
    }
  };

  const selectTipContractUser = (option: TipContractUserOption) => {
    const normalizedEmail = option.email.trim().toLowerCase();
    const normalizedOption: TipContractUserOption = {
      ...option,
      email: normalizedEmail,
      name: option.name.trim() || normalizedEmail,
      accountType: option.accountType === "tipster" ? "tipster" : "advisor",
    };
    setTipContractDraftEmail(normalizedEmail);
    setTipContractSelectedUser(normalizedOption);
    setTipContractLookupState({
      status: "found",
      email: normalizedEmail,
      name: normalizedOption.name,
      accountType: normalizedOption.accountType,
    });
    setTipContractUserSuggestions([]);
    if (tipContractSelectedTip?.tipsterEmail !== normalizedEmail) {
      setTipContractSelectedTip(null);
      setTipContractTips([]);
      setTipContractTipsError(null);
    }
  };

  const loadTipContractTipsForSelectedUser = async () => {
    const selectedUser = getCurrentTipContractUser();
    if (!user || !selectedUser) {
      setSaveMessage("Nejdřív vyber uživatele ze seznamu.");
      return;
    }

    setTipContractTipsModalOpen(true);
    setTipContractTipsLoading(true);
    setTipContractTipsError(null);
    setTipContractTipsFilter("all");
    try {
      const payload = await fetchAuthedJsonOrThrow<AdvisorTipsByUserApiResponse>(
        user,
        `/api/advisor-tips/by-user?email=${encodeURIComponent(selectedUser.email)}`,
        { method: "GET" }
      );
      const items = Array.isArray(payload.items)
        ? payload.items
            .map((item): TipContractTipOption => {
              const status: TipLifecycleStatus =
                item.status === "contracted" || item.status === "failed"
                  ? item.status
                  : "pending";
              return {
                id: typeof item.id === "string" ? item.id.trim() : "",
                title: typeof item.title === "string" ? item.title.trim() : "Nový tip",
                product: typeof item.product === "string" ? item.product.trim() : "other",
                productLabel:
                  typeof item.productLabel === "string" && item.productLabel.trim()
                    ? item.productLabel.trim()
                    : "Tip",
                status,
                tipsterEmail:
                  typeof item.tipsterEmail === "string"
                    ? item.tipsterEmail.trim().toLowerCase()
                    : selectedUser.email,
                tipsterName:
                  typeof item.tipsterName === "string"
                    ? item.tipsterName.trim()
                    : selectedUser.name,
                clientName:
                  typeof item.clientName === "string" && item.clientName.trim()
                    ? item.clientName.trim()
                    : "Klient neuveden",
                phone: typeof item.phone === "string" ? item.phone.trim() : "",
                email: typeof item.email === "string" ? item.email.trim() : "",
                createdAtMs:
                  typeof item.createdAtMs === "number" && Number.isFinite(item.createdAtMs)
                    ? Math.round(item.createdAtMs)
                    : null,
              };
            })
            .filter((item) => item.id)
        : [];
      setTipContractTips(items);
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : "Tipy se nepodařilo načíst.";
      setTipContractTipsError(message);
      setTipContractTips([]);
    } finally {
      setTipContractTipsLoading(false);
    }
  };

  const selectTipContractTip = (tip: TipContractTipOption) => {
    setTipContractSelectedTip(tip);
    setTipContractTipsModalOpen(false);
  };

  const openTipContractModal = () => {
    setTipContractDraftPercent(tipContractConfig?.tipsterPercent ?? 50);
    setTipContractDraftEmail(tipContractConfig?.tipsterEmail ?? "");
    if (tipContractConfig?.tipsterEmail) {
      const accountType = tipContractConfig.tipsterAccountType ?? "advisor";
      setTipContractSelectedUser({
        email: tipContractConfig.tipsterEmail,
        name: tipContractConfig.tipsterName ?? tipContractConfig.tipsterEmail,
        managerEmail: null,
        accountType,
      });
      setTipContractLookupState({
        status: "found",
        email: tipContractConfig.tipsterEmail,
        name: tipContractConfig.tipsterName ?? null,
        accountType,
      });
    } else {
      setTipContractSelectedUser(null);
      setTipContractLookupState({ status: "idle" });
    }
    setTipContractSelectedTip(
      tipContractConfig?.sourceTipId
        ? {
            id: tipContractConfig.sourceTipId,
            title: tipContractConfig.sourceTipTitle ?? "Nový tip",
            product: "",
            productLabel: tipContractConfig.sourceTipProductLabel ?? "Tip",
            status: "pending",
            tipsterEmail: tipContractConfig.tipsterEmail ?? "",
            tipsterName: tipContractConfig.tipsterName ?? "",
            clientName: tipContractConfig.sourceTipClientName ?? "Klient neuveden",
            phone: "",
            email: "",
            createdAtMs: tipContractConfig.sourceTipCreatedAtMs,
          }
        : null
    );
    setTipContractUserSuggestions([]);
    setTipContractTipsModalOpen(false);
    setTipContractTipsError(null);
    setTipContractTipsFilter("all");
    setTipContractModalOpen(true);
  };

  const applyTipContractSettings = () => {
    const normalizedDraftEmail = tipContractDraftEmail.trim().toLowerCase();
    const nextPercent = clampTipContractPercent(tipContractDraftPercent);
    if (!normalizedDraftEmail) {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Opravdu chcete uložit tip bez označení Tipaře?"
        );
        if (!confirmed) return;
      }

      setTipContractConfig({
        tipsterEmail: null,
        tipsterName: null,
        tipsterAccountType: null,
        tipsterPercent: nextPercent,
        sourceTipId: null,
        sourceTipTitle: null,
        sourceTipProductLabel: null,
        sourceTipClientName: null,
        sourceTipCreatedAtMs: null,
      });
      setTipContractModalOpen(false);
      setSaveMessage(`Smlouva z TIPU: ${nextPercent} % bez označení tipaře.`);
      return;
    }

    if (
      tipContractLookupState.status !== "found" ||
      tipContractLookupState.email !== normalizedDraftEmail
    ) {
      setSaveMessage("Nejdřív vyber tipaře, který v systému existuje.");
      return;
    }

    const nextEmail = normalizedDraftEmail;
    const selectedUser = getCurrentTipContractUser();
    const selectedTip =
      tipContractSelectedTip?.tipsterEmail === nextEmail ? tipContractSelectedTip : null;
    setTipContractConfig({
      tipsterEmail: nextEmail,
      tipsterName: selectedUser?.name ?? tipContractLookupState.name ?? null,
      tipsterAccountType: selectedUser?.accountType ?? tipContractLookupState.accountType,
      tipsterPercent: nextPercent,
      sourceTipId: selectedTip?.id ?? null,
      sourceTipTitle: selectedTip?.title ?? null,
      sourceTipProductLabel: selectedTip?.productLabel ?? null,
      sourceTipClientName: selectedTip?.clientName ?? null,
      sourceTipCreatedAtMs: selectedTip?.createdAtMs ?? null,
    });
    setTipContractModalOpen(false);
    setSaveMessage(
      selectedTip
        ? `Smlouva z TIPU: ${nextPercent} % pro ${selectedUser?.name ?? nextEmail}, vybraný tip ${selectedTip.clientName}.`
        : `Smlouva z TIPU: ${nextPercent} % pro tipaře (${tipContractLookupState.name ?? nextEmail}).`
    );
  };

  const clearTipContractSettings = () => {
    setTipContractConfig(null);
    setTipContractModalOpen(false);
    setTipContractDraftEmail("");
    setTipContractDraftPercent(50);
    setTipContractLookupState({ status: "idle" });
    setTipContractSelectedUser(null);
    setTipContractUserSuggestions([]);
    setTipContractSelectedTip(null);
    setTipContractTips([]);
    setTipContractTipsModalOpen(false);
    setTipContractTipsError(null);
    setTipContractTipsFilter("all");
    setSaveMessage("Smlouva z TIPU byla vypnutá.");
  };

  const looksLikeMaxCizinKomplexPdf = (
    parsed: ParsedContractPdf | null | undefined
  ): boolean => {
    if (!parsed) return false;
    return Boolean(
      parsed.maxCizinKomplexVariant ||
        (typeof parsed.durationMonths === "number" && parsed.durationMonths > 0) ||
        typeof parsed.amount === "number" ||
        parsed.policyStartDate ||
        parsed.contractSignedDate
    );
  };

  const showMaxCizinKomplexHint = () => {
    setPdfImportError(
      "PDF vypadá jako MAXIMA Cizinci. V poli Produkt vyber sekci Cizinci -> MAXIMA Komplexní zdravotní pojištění cizinců a nahraj PDF znovu."
    );
    setPdfImportStatus(null);
  };

  const handlePdfImport = async (file: File | null) => {
    if (!file) return;
    const importRunId = pdfImportRunIdRef.current + 1;
    pdfImportRunIdRef.current = importRunId;
    const isCurrentPdfImport = () => pdfImportRunIdRef.current === importRunId;
    let allowPdfImportProgress = true;

    setPdfImporting(true);
    setPdfImportError(null);
    setPdfImportStatus(
      "PDF je připravené k přiložení. Zkouším z něj načíst data…"
    );
    setImportedContractPdfFile(file);
    setPdfClientNameLoaded(false);
    setPdfMatchedClientName(false);
    let importProduct: Product | null = hasSelectedProduct ? product : null;
    let productDetected = false;
    try {
      const detected = await withPdfImportTimeout(
        detectProductFromPdfLazy(file),
        PDF_PRODUCT_DETECTION_TIMEOUT_MS,
        "Automatické rozpoznání produktu z PDF trvá moc dlouho."
      );
      if (!isCurrentPdfImport()) return;
      if (detected) {
        productDetected = true;
        if (detected.product !== product) {
          importProduct = detected.product;
          setProduct(detected.product);
          setHasSelectedProduct(true);
          setProductPickerSectionForProduct(detected.product);
          setPdfImportStatus(`Rozpoznán produkt: ${productLabel(detected.product)}. Načítám data…`);
        } else {
          importProduct = detected.product;
          setHasSelectedProduct(true);
        }
      } else if (importProduct) {
        setPdfImportStatus(
          `Produkt z PDF jsem nerozpoznal. Zkouším import podle vybraného produktu ${productLabel(importProduct)}…`
        );
      } else {
        setPdfImportStatus(
          "PDF je připravené k přiložení, ale produkt se nepodařilo automaticky rozpoznat."
        );
      }
    } catch (detectErr) {
      console.warn("Auto-detekce produktu z PDF selhala", detectErr);
      if (!isCurrentPdfImport()) return;
      if (importProduct) {
        setPdfImportStatus(
          isPdfImportTimeoutError(detectErr)
            ? `PDF je připravené k přiložení. Rozpoznání produktu trvalo moc dlouho, zkouším vybraný produkt ${productLabel(importProduct)}…`
            : `Produkt z PDF se nepodařilo rozpoznat. Zkouším import podle vybraného produktu ${productLabel(importProduct)}…`
        );
      } else {
        setPdfImportStatus(
          "PDF je připravené k přiložení, ale produkt se nepodařilo automaticky rozpoznat."
        );
      }
    }
    if (!importProduct) {
      setImportedContractPdfFile(file);
      setPdfImportError(
        "Vyber produkt ručně. Údaje z tohoto PDF zatím nebyly načtené, ale PDF zůstane připravené k přiložení po uložení smlouvy."
      );
      setPdfImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    if (
      importProduct === "cppAuto" ||
      importProduct === "slaviaauto" ||
      importProduct === "allianzAuto" ||
      importProduct === "csobAuto" ||
      importProduct === "uniqaAuto" ||
      importProduct === "pillowAuto" ||
      importProduct === "kooperativaAuto"
    ) {
      setAutoCarMake("");
      setAutoCarPlate("");
      setAutoCarVin("");
      setAutoCarTp("");
      setAutoCarOrv("");
      setAutoCarAnnualMileage("");
      setAutoCarAllianzScope("");
      setAutoCarLiabilityLimit(null);
      setAutoCarHullSumInsured(null);
      setAutoCarHullSumInsuredText("");
      setAutoCarHullSumInsuredDraft("");
      setAutoCarHullDeductible(null);
      setAutoCarHullDeductibleText("");
      setAutoCarHullRiskAccident(false);
      setAutoCarHullRiskTheft(false);
      setAutoCarHullRiskNatural(false);
      setAutoCarHullRiskVandalism(false);
      setAutoCarHullRiskAnimalCollision(false);
      setAutoCarAssistancePlan("");
      setAutoCarAddonEso(false);
      setAutoCarAddonNaturalRisks(false);
      setAutoCarAddonKlika(false);
      setAutoCarAddonGlass(false);
      setAutoCarAddonGlassLimit(null);
      setAutoCarAddonAnimalCollision(false);
      setAutoCarAddonAnimalCollisionLimit(null);
      setAutoCarAddonAnimalDamage(false);
      setAutoCarAddonAnimalDamageLimit(null);
      setAutoCarAddonVandalism(false);
      setAutoCarAddonTheft(false);
      setAutoCarAddonTheftLimit(null);
      setAutoCarAddonNatural(false);
      setAutoCarAddonNaturalLimit(null);
      setAutoCarAddonOwnDamage(false);
      setAutoCarAddonOwnDamageLimit(null);
      setAutoCarAddonGap(false);
      setAutoCarAddonGapLimit(null);
      setAutoCarAddonSmartGap(false);
      setAutoCarAddonServisPro(false);
      setAutoCarAddonFireExplosion(false);
      setAutoCarAddonLegalAdvice(false);
      setAutoCarAddonReplacementCar(false);
      setAutoCarAddonLuggage(false);
      setAutoCarAddonTransportedGoods(false);
      setAutoCarAddonPothole(false);
      setAutoCarAddonNonFaultAccident(false);
      setAutoCarAddonPassengerInjury(false);
      setAutoCarAddonKeyLossTheft(false);
    }
    if (importProduct === "domex" || importProduct === "maxdomov") {
      setDomexAddress("");
      setDomexPropertyType("");
      setDomexPropertyCoverage("");
      setDomexPropertySumInsured(null);
      setDomexPropertyDeductible(null);
      setDomexHouseholdType("");
      setDomexHouseholdCoverage("");
      setDomexHouseholdSumInsured(null);
      setDomexHouseholdDeductible(null);
      setDomexOutbuildingSumInsured(null);
      setDomexLiabilitySumInsured(null);
      setDomexLiabilityDeductible(null);
      setDomexLiabilityMobile(false);
      setDomexLiabilityTenant(false);
      setDomexLiabilityLandlord(false);
      setDomexAssistancePlus(false);
      setDomexNote("");
    }
    if (importProduct === "neon") {
      setNeonPdfDetailFields(createEmptyNeonPdfDetailFields());
    }
    try {
      if (!hasAutomatedPdfImport(importProduct)) {
        setImportedContractPdfFile(file);
        setPdfImportStatus(manualPdfImportMessage(importProduct));
        setPdfImportError(
          productDetected
            ? null
            : `Produkt z PDF jsem nerozpoznal. Vyber produkt ručně; PDF se při uložení přiloží.`
        );
        return;
      }

      const parsed = await withPdfImportTimeout(
        parseContractPdfByProduct(importProduct, file, {
          onOcrStart: () => {
            if (!isCurrentPdfImport() || !allowPdfImportProgress) return;
            setPdfImportStatus("PDF vypadá jako sken. Spouštím OCR…");
          },
          onOcrProgress: (progress) => {
            if (!isCurrentPdfImport() || !allowPdfImportProgress) return;
            const pagePart =
              progress.page > 0
                ? `strana ${progress.page}/${progress.totalPages}`
                : "připravuji OCR";
            const percent =
              progress.progress > 0
                ? ` (${Math.round(progress.progress * 100)} %)`
                : "";
            setPdfImportStatus(`PDF je sken, OCR ${pagePart}${percent}…`);
          },
        }),
        PDF_DATA_IMPORT_TIMEOUT_MS,
        "Automatické čtení dat z PDF trvá moc dlouho."
      );
      if (!isCurrentPdfImport()) return;
      allowPdfImportProgress = false;
      if (!parsed) {
        setImportedContractPdfFile(file);
        setPdfImportStatus(
          "PDF se při uložení přiloží k detailu záznamu, údaje prosím doplň ručně."
        );
        setPdfImportError(
          unreadablePdfImportMessage({ product: importProduct, productDetected })
        );
        return;
      }
      const importIssueMessage = buildPdfImportIssueMessage({ product: importProduct, parsed });

      let applied = 0;
      const parsedIsEndorsement =
        importProduct === "neon" &&
        "isEndorsement" in parsed &&
        parsed.isEndorsement === true;
      let endorsementPreparedFromPdf = false;

      if (parsed.contractNumber) {
        setContractNumber(parsed.contractNumber);
        applied += 1;
      }
      if (parsed.clientName) {
        setClientName(parsed.clientName);
        setPdfClientNameLoaded(true);
        applied += 1;
      }
      if (parsed.policyStartDate) {
        setPolicyStartDate(parsed.policyStartDate);
        applied += 1;
      }
      if ("policyEndDate" in parsed && typeof parsed.policyEndDate === "string") {
        setPolicyEndDate(parsed.policyEndDate);
        applied += 1;
      }
      if (parsed.contractSignedDate) {
        setContractSignedDate(parsed.contractSignedDate);
        applied += 1;
      }
      if (typeof parsed.amount === "number") {
        setAmountText(String(parsed.amount));
        applied += 1;
      }
      if (parsedIsEndorsement) {
        setRefreshOriginalOpen(false);
        setRefreshOriginalContractNumber("");
        setRefreshOriginalMissingInSystem(false);
        setRefreshOriginalPdfLookupNumber(null);
        setRefreshOriginalLookup({
          status: "idle",
          progress: 0,
          adviserName: null,
          original: null,
        });
      }
      if (supportsOriginalContractReplacement(importProduct)) {
        const parsedRefreshOriginalContractNumber =
          "refreshOriginalContractNumber" in parsed &&
          typeof parsed.refreshOriginalContractNumber === "string"
            ? parsed.refreshOriginalContractNumber.trim()
            : "";
        const parsedIsRefresh = "isRefresh" in parsed && parsed.isRefresh === true;
        if (parsedIsRefresh || parsedRefreshOriginalContractNumber) {
          setRefreshOriginalOpen(true);
          setRefreshOriginalMissingInSystem(false);
          setRefreshOriginalPdfLookupNumber(null);
          if (parsedRefreshOriginalContractNumber) {
            setRefreshOriginalContractNumber(parsedRefreshOriginalContractNumber);
            setRefreshOriginalPdfLookupNumber(
              importProduct === "neon" && parsedIsRefresh
                ? parsedRefreshOriginalContractNumber
                : null
            );
            applied += 1;
          }
        }
      }
      if ("comfortPayment" in parsed && typeof parsed.comfortPayment === "number") {
        setComfortPaymentText(String(parsed.comfortPayment));
        applied += 1;
      }
      if (parsed.frequency) {
        const allowedForProduct = allowedFrequencies(importProduct);
        if (allowedForProduct.includes(parsed.frequency)) {
          setFrequency(parsed.frequency);
        }
      }
      if ("domexAddress" in parsed) {
        const address = typeof parsed.domexAddress === "string" ? parsed.domexAddress.trim() : "";
        setDomexAddress(address);
        if (address) applied += 1;
      }
      if ("domexPropertyType" in parsed) {
        const propertyType =
          typeof parsed.domexPropertyType === "string" ? parsed.domexPropertyType.trim() : "";
        setDomexPropertyType(propertyType);
        if (propertyType) applied += 1;
      }
      if ("domexPropertyCoverage" in parsed) {
        const propertyCoverage =
          typeof parsed.domexPropertyCoverage === "string"
            ? parsed.domexPropertyCoverage.trim()
            : "";
        setDomexPropertyCoverage(propertyCoverage);
        if (propertyCoverage) applied += 1;
      }
      if ("domexPropertySumInsured" in parsed) {
        const sumInsured =
          typeof parsed.domexPropertySumInsured === "number" &&
          Number.isFinite(parsed.domexPropertySumInsured)
            ? Math.round(parsed.domexPropertySumInsured)
            : null;
        setDomexPropertySumInsured(sumInsured);
        if (sumInsured != null) applied += 1;
      }
      if ("domexPropertyDeductible" in parsed) {
        const deductible =
          typeof parsed.domexPropertyDeductible === "number" &&
          Number.isFinite(parsed.domexPropertyDeductible)
            ? Math.round(parsed.domexPropertyDeductible)
            : null;
        setDomexPropertyDeductible(deductible);
        if (deductible != null) applied += 1;
      }
      if ("domexHouseholdType" in parsed) {
        const householdType =
          typeof parsed.domexHouseholdType === "string" ? parsed.domexHouseholdType.trim() : "";
        setDomexHouseholdType(householdType);
        if (householdType) applied += 1;
      }
      if ("domexHouseholdCoverage" in parsed) {
        const householdCoverage =
          typeof parsed.domexHouseholdCoverage === "string"
            ? parsed.domexHouseholdCoverage.trim()
            : "";
        setDomexHouseholdCoverage(householdCoverage);
        if (householdCoverage) applied += 1;
      }
      if ("domexHouseholdSumInsured" in parsed) {
        const householdSumInsured =
          typeof parsed.domexHouseholdSumInsured === "number" &&
          Number.isFinite(parsed.domexHouseholdSumInsured)
            ? Math.round(parsed.domexHouseholdSumInsured)
            : null;
        setDomexHouseholdSumInsured(householdSumInsured);
        if (householdSumInsured != null) applied += 1;
      }
      if ("domexHouseholdDeductible" in parsed) {
        const householdDeductible =
          typeof parsed.domexHouseholdDeductible === "number" &&
          Number.isFinite(parsed.domexHouseholdDeductible)
            ? Math.round(parsed.domexHouseholdDeductible)
            : null;
        setDomexHouseholdDeductible(householdDeductible);
        if (householdDeductible != null) applied += 1;
      }
      if ("domexOutbuildingSumInsured" in parsed) {
        const outbuildingSumInsured =
          typeof parsed.domexOutbuildingSumInsured === "number" &&
          Number.isFinite(parsed.domexOutbuildingSumInsured)
            ? Math.round(parsed.domexOutbuildingSumInsured)
            : null;
        setDomexOutbuildingSumInsured(outbuildingSumInsured);
        if (outbuildingSumInsured != null) applied += 1;
      }
      if ("domexLiabilitySumInsured" in parsed) {
        const liabilitySumInsured =
          typeof parsed.domexLiabilitySumInsured === "number" &&
          Number.isFinite(parsed.domexLiabilitySumInsured)
            ? Math.round(parsed.domexLiabilitySumInsured)
            : null;
        setDomexLiabilitySumInsured(liabilitySumInsured);
        if (liabilitySumInsured != null) applied += 1;
      }
      if ("domexLiabilityDeductible" in parsed) {
        const liabilityDeductible =
          typeof parsed.domexLiabilityDeductible === "number" &&
          Number.isFinite(parsed.domexLiabilityDeductible)
            ? Math.round(parsed.domexLiabilityDeductible)
            : null;
        setDomexLiabilityDeductible(liabilityDeductible);
        if (liabilityDeductible != null) applied += 1;
      }
      if ("domexLiabilityMobile" in parsed) {
        const hasAddon = parsed.domexLiabilityMobile === true;
        setDomexLiabilityMobile(hasAddon);
        if (hasAddon) applied += 1;
      }
      if ("domexLiabilityTenant" in parsed) {
        const hasAddon = parsed.domexLiabilityTenant === true;
        setDomexLiabilityTenant(hasAddon);
        if (hasAddon) applied += 1;
      }
      if ("domexLiabilityLandlord" in parsed) {
        const hasAddon = parsed.domexLiabilityLandlord === true;
        setDomexLiabilityLandlord(hasAddon);
        if (hasAddon) applied += 1;
      }
      if ("domexAssistancePlus" in parsed) {
        const hasAssistance = parsed.domexAssistancePlus === true;
        setDomexAssistancePlus(hasAssistance);
        if (hasAssistance) applied += 1;
      }
      if (importProduct === "neon" && parsed.riskFields && typeof parsed.riskFields === "object") {
        const riskFields = parsed.riskFields as Record<string, unknown>;
        const nextNeonFields = createEmptyNeonPdfDetailFields();
        let riskApplied = 0;
        const applyText = (field: NeonPdfEditorTextField, value: unknown) => {
          if (value == null) return;
          const normalized = typeof value === "string" ? value.trim() : String(value).trim();
          if (!normalized) return;
          nextNeonFields[field] = normalized;
          riskApplied += 1;
        };
        const applyBoolean = (field: NeonPdfEditorBooleanField, value: unknown) => {
          nextNeonFields[field] = value === true;
          if (value === true) riskApplied += 1;
        };

        applyText("version", riskFields.version ?? "neon_life");
        applyText("deathType", riskFields.deathType);
        applyText("deathAmount", riskFields.deathAmount);
        applyText("death2Type", riskFields.death2Type);
        applyText("death2Amount", riskFields.death2Amount);
        applyText("deathTerminalAmount", riskFields.deathTerminalAmount);
        applyBoolean("waiverInvalidity", riskFields.waiverInvalidity);
        applyBoolean("waiverUnemployment", riskFields.waiverUnemployment);
        applyText("invalidityAType", riskFields.invalidityAType);
        applyText("invalidityA1", riskFields.invalidityA1);
        applyText("invalidityA2", riskFields.invalidityA2);
        applyText("invalidityA3", riskFields.invalidityA3);
        applyText("invalidityBType", riskFields.invalidityBType);
        applyText("invalidityB1", riskFields.invalidityB1);
        applyText("invalidityB2", riskFields.invalidityB2);
        applyText("invalidityB3", riskFields.invalidityB3);
        applyBoolean("invalidityPension", riskFields.invalidityPension);
        applyText("criticalType", riskFields.criticalType);
        applyText("criticalVariant", riskFields.criticalVariant);
        applyText("criticalAmount", riskFields.criticalAmount);
        applyText("childSurgeryAmount", riskFields.childSurgeryAmount);
        applyText("vaccinationCompAmount", riskFields.vaccinationCompAmount);
        applyText("diabetesAmount", riskFields.diabetesAmount);
        applyText("deathAccidentAmount", riskFields.deathAccidentAmount);
        applyText("injuryPermanentAmount", riskFields.injuryPermanentAmount);
        applyText(
          "injuryPermanentFulfillmentFrom",
          riskFields.injuryPermanentFulfillmentFrom
        );
        applyText("injuryPermanentProgression", riskFields.injuryPermanentProgression);
        applyText("injuryPermanent2Amount", riskFields.injuryPermanent2Amount);
        applyText(
          "injuryPermanent2FulfillmentFrom",
          riskFields.injuryPermanent2FulfillmentFrom
        );
        applyText("injuryPermanent2Progression", riskFields.injuryPermanent2Progression);
        applyText("hospitalizationIllnessAmount", riskFields.hospitalizationIllnessAmount);
        applyText("hospitalizationInjuryAmount", riskFields.hospitalizationInjuryAmount);
        applyText("accidentDailyBenefitStart", riskFields.accidentDailyBenefitStart);
        applyText("accidentDailyBenefitBackpay", riskFields.accidentDailyBenefitBackpay);
        applyText("accidentDailyBenefit", riskFields.accidentDailyBenefit);
        applyText("workIncapacityStart", riskFields.workIncapacityStart);
        applyText("workIncapacityBackpay", riskFields.workIncapacityBackpay);
        applyText("workIncapacityAmount", riskFields.workIncapacityAmount);
        applyBoolean("workIncapacityInjury", riskFields.workIncapacityInjury);
        applyBoolean("workIncapacityIllness", riskFields.workIncapacityIllness);
        applyText("workIncapacity2Start", riskFields.workIncapacity2Start);
        applyText("workIncapacity2Backpay", riskFields.workIncapacity2Backpay);
        applyText("workIncapacity2Amount", riskFields.workIncapacity2Amount);
        applyBoolean("workIncapacity2Injury", riskFields.workIncapacity2Injury);
        applyBoolean("workIncapacity2Illness", riskFields.workIncapacity2Illness);
        applyText("careDependencyAmount", riskFields.careDependencyAmount);
        applyText("specialAidAmount", riskFields.specialAidAmount);
        applyText("caregivingAmount", riskFields.caregivingAmount);
        applyText("reproductionCostAmount", riskFields.reproductionCostAmount);
        applyBoolean("cppHelp", riskFields.cppHelp);
        applyText("liabilityCitizenLimit", riskFields.liabilityCitizenLimit);
        applyText("liabilityEmployeeLimit", riskFields.liabilityEmployeeLimit);
        applyBoolean("travelInsurance", riskFields.travelInsurance);

        setNeonPdfDetailFields(nextNeonFields);
        applied += riskApplied;
      }
      if ("durationYears" in parsed && typeof parsed.durationYears === "number") {
        const [min, max] = durationRange(importProduct);
        const yrs = Math.min(max, Math.max(min, parsed.durationYears));
        setDurationYears(yrs);
        applied += 1;
      }
      if ("durationMonths" in parsed && typeof parsed.durationMonths === "number") {
        setDurationMonths(normalizedDurationMonths(importProduct, parsed.durationMonths));
        applied += 1;
      }
      if (
        "maxCizinKomplexVariant" in parsed &&
        (parsed.maxCizinKomplexVariant === "exclusiveStandard" ||
          parsed.maxCizinKomplexVariant === "premium")
      ) {
        setMaxCizinKomplexVariant(parsed.maxCizinKomplexVariant);
        applied += 1;
      }
      if ("carMake" in parsed) {
        const carMake = typeof parsed.carMake === "string" ? parsed.carMake.trim() : "";
        setAutoCarMake(carMake);
        if (carMake) applied += 1;
      }
      if ("carPlate" in parsed) {
        const plate = typeof parsed.carPlate === "string" ? parsed.carPlate.trim() : "";
        setAutoCarPlate(plate);
        if (plate) applied += 1;
      }
      if ("carVin" in parsed) {
        const vin = typeof parsed.carVin === "string" ? parsed.carVin.trim() : "";
        setAutoCarVin(vin);
        if (vin) applied += 1;
      }
      if ("carTp" in parsed) {
        const tp = typeof parsed.carTp === "string" ? parsed.carTp.trim() : "";
        setAutoCarTp(tp);
        if (tp) applied += 1;
      }
      if ("carOrv" in parsed) {
        const orv = typeof parsed.carOrv === "string" ? parsed.carOrv.trim() : "";
        setAutoCarOrv(orv);
        if (orv) applied += 1;
      }
      if ("carAnnualMileage" in parsed) {
        const annualMileage =
          typeof parsed.carAnnualMileage === "string"
            ? parsed.carAnnualMileage.trim()
            : "";
        setAutoCarAnnualMileage(annualMileage);
        if (annualMileage) applied += 1;
      }
      if ("carAllianzScope" in parsed) {
        const scope =
          typeof parsed.carAllianzScope === "string"
            ? parsed.carAllianzScope.trim()
            : "";
        setAutoCarAllianzScope(scope);
        if (scope) applied += 1;
      }
      if ("carLiabilityLimit" in parsed) {
        const liabilityLimit =
          typeof parsed.carLiabilityLimit === "number" &&
          Number.isFinite(parsed.carLiabilityLimit)
            ? Math.round(parsed.carLiabilityLimit)
            : null;
        setAutoCarLiabilityLimit(liabilityLimit);
        if (liabilityLimit != null) applied += 1;
        if (importProduct === "cppAuto" && liabilityLimit === 200_000_000) {
          setAutoCarAddonSmartGap(true);
          setAutoCarAddonServisPro(true);
          applied += 2;
        }
      }
      if ("carHullSumInsured" in parsed) {
        const hullSumInsured =
          typeof parsed.carHullSumInsured === "number" &&
          Number.isFinite(parsed.carHullSumInsured)
            ? Math.round(parsed.carHullSumInsured)
            : null;
        setAutoCarHullSumInsured(hullSumInsured);
        setAutoCarHullSumInsuredDraft("");
        if (hullSumInsured != null) applied += 1;
      }
      if ("carHullSumInsuredText" in parsed) {
        const hullSumInsuredText =
          typeof parsed.carHullSumInsuredText === "string"
            ? parsed.carHullSumInsuredText.trim()
            : "";
        setAutoCarHullSumInsuredText(hullSumInsuredText);
        setAutoCarHullSumInsuredDraft("");
        if (hullSumInsuredText) {
          setAutoCarHullSumInsured(null);
          applied += 1;
        }
      }
      if ("carHullDeductible" in parsed) {
        const hullDeductible =
          typeof parsed.carHullDeductible === "number" &&
          Number.isFinite(parsed.carHullDeductible)
            ? Math.round(parsed.carHullDeductible)
            : null;
        setAutoCarHullDeductible(hullDeductible);
        if (hullDeductible != null) applied += 1;
      }
      if ("carHullDeductibleText" in parsed) {
        const hullDeductibleText =
          typeof parsed.carHullDeductibleText === "string"
            ? parsed.carHullDeductibleText.trim()
            : "";
        setAutoCarHullDeductibleText(hullDeductibleText);
        if (hullDeductibleText) applied += 1;
      }
      if ("carHullRiskAccident" in parsed) {
        const risk = parsed.carHullRiskAccident === true;
        setAutoCarHullRiskAccident(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskTheft" in parsed) {
        const risk = parsed.carHullRiskTheft === true;
        setAutoCarHullRiskTheft(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskNatural" in parsed) {
        const risk = parsed.carHullRiskNatural === true;
        setAutoCarHullRiskNatural(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskVandalism" in parsed) {
        const risk = parsed.carHullRiskVandalism === true;
        setAutoCarHullRiskVandalism(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskAnimalCollision" in parsed) {
        const risk = parsed.carHullRiskAnimalCollision === true;
        setAutoCarHullRiskAnimalCollision(risk);
        if (risk) applied += 1;
      }
      if ("carAssistancePlan" in parsed) {
        const assistance =
          typeof parsed.carAssistancePlan === "string"
            ? parsed.carAssistancePlan.trim()
            : "";
        setAutoCarAssistancePlan(assistance);
        if (assistance) applied += 1;
      }
      if ("carAddonEso" in parsed) {
        const addon = parsed.carAddonEso === true;
        setAutoCarAddonEso(addon);
        if (addon) applied += 1;
      }
      if ("carAddonNaturalRisks" in parsed) {
        const addon = parsed.carAddonNaturalRisks === true;
        setAutoCarAddonNaturalRisks(addon);
        if (addon) applied += 1;
      }
      if ("carAddonGlass" in parsed) {
        const addon = parsed.carAddonGlass === true;
        setAutoCarAddonGlass(addon);
        if (addon) applied += 1;
      }
      if ("carAddonGlassLimit" in parsed) {
        const limit =
          typeof parsed.carAddonGlassLimit === "number" &&
          Number.isFinite(parsed.carAddonGlassLimit)
            ? Math.round(parsed.carAddonGlassLimit)
            : null;
        setAutoCarAddonGlassLimit(limit);
        if (limit != null) {
          setAutoCarAddonGlass(true);
          applied += 1;
        }
      }
      if ("carAddonAnimalCollision" in parsed) {
        const addon = parsed.carAddonAnimalCollision === true;
        setAutoCarAddonAnimalCollision(addon);
        if (addon) applied += 1;
      }
      if ("carAddonAnimalCollisionLimit" in parsed) {
        const limit =
          typeof parsed.carAddonAnimalCollisionLimit === "number" &&
          Number.isFinite(parsed.carAddonAnimalCollisionLimit)
            ? Math.round(parsed.carAddonAnimalCollisionLimit)
            : null;
        setAutoCarAddonAnimalCollisionLimit(limit);
        if (limit != null) {
          setAutoCarAddonAnimalCollision(true);
          applied += 1;
        }
      }
      if ("carAddonAnimalDamage" in parsed) {
        const addon = parsed.carAddonAnimalDamage === true;
        setAutoCarAddonAnimalDamage(addon);
        if (addon) applied += 1;
      }
      if ("carAddonVandalism" in parsed) {
        const addon = parsed.carAddonVandalism === true;
        setAutoCarAddonVandalism(addon);
        if (addon) applied += 1;
      }
      if ("carAddonTheft" in parsed) {
        const addon = parsed.carAddonTheft === true;
        setAutoCarAddonTheft(addon);
        if (addon) applied += 1;
      }
      if ("carAddonNatural" in parsed) {
        const addon = parsed.carAddonNatural === true;
        setAutoCarAddonNatural(addon);
        if (addon) applied += 1;
      }
      if ("carAddonGap" in parsed) {
        const addon = parsed.carAddonGap === true;
        setAutoCarAddonGap(addon);
        if (addon) applied += 1;
      }
      if ("carAddonSmartGap" in parsed) {
        const addon = parsed.carAddonSmartGap === true;
        setAutoCarAddonSmartGap(addon);
        if (addon) applied += 1;
      }
      if ("carAddonServisPro" in parsed) {
        const addon = parsed.carAddonServisPro === true;
        setAutoCarAddonServisPro(addon);
        if (addon) applied += 1;
      }
      if ("carAddonFireExplosion" in parsed) {
        const addon = parsed.carAddonFireExplosion === true;
        setAutoCarAddonFireExplosion(addon);
        if (addon) applied += 1;
      }
      if ("carAddonLegalAdvice" in parsed) {
        const addon = parsed.carAddonLegalAdvice === true;
        setAutoCarAddonLegalAdvice(addon);
        if (addon) applied += 1;
      }
      if ("carAddonReplacementCar" in parsed) {
        const addon = parsed.carAddonReplacementCar === true;
        setAutoCarAddonReplacementCar(addon);
        if (addon) applied += 1;
      }
      if ("carAddonLuggage" in parsed) {
        const addon = parsed.carAddonLuggage === true;
        setAutoCarAddonLuggage(addon);
        if (addon) applied += 1;
      }
      if ("carAddonTransportedGoods" in parsed) {
        const addon = parsed.carAddonTransportedGoods === true;
        setAutoCarAddonTransportedGoods(addon);
        if (addon) applied += 1;
      }
      if ("carAddonPothole" in parsed) {
        const addon = parsed.carAddonPothole === true;
        setAutoCarAddonPothole(addon);
        if (addon) applied += 1;
      }
      if ("carAddonNonFaultAccident" in parsed) {
        const addon = parsed.carAddonNonFaultAccident === true;
        setAutoCarAddonNonFaultAccident(addon);
        if (addon) applied += 1;
      }
      if ("carAddonKeyLossTheft" in parsed) {
        const addon = parsed.carAddonKeyLossTheft === true;
        setAutoCarAddonKeyLossTheft(addon);
        if (addon) applied += 1;
      }

      if (parsedIsEndorsement) {
        setEndorsementWorkflowActive(true);
        const parsedContractNumber =
          typeof parsed.contractNumber === "string" ? parsed.contractNumber.trim() : "";
        const parsedSignedDate =
          typeof parsed.contractSignedDate === "string"
            ? parsed.contractSignedDate.trim()
            : "";
        const parsedAmount =
          typeof parsed.amount === "number" && Number.isFinite(parsed.amount)
            ? parsed.amount
            : null;
        endorsementPreparedFromPdf = await handlePrepareEndorsement({
          productOverride: importProduct,
          contractNumberOverride: parsedContractNumber,
          contractSignedDateOverride: parsedSignedDate,
          newPremiumAmountOverride: parsedAmount ?? 0,
          source: "pdf",
        });
      }

      if (applied === 0 && importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await withPdfImportTimeout(
            parseMaxCizinKomplexPdfLazy(file),
            5_000,
            "Fallback rozpoznání MAXIMA Cizinci trvá moc dlouho."
          );
          if (!isCurrentPdfImport()) return;
          if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
            showMaxCizinKomplexHint();
            return;
          }
        } catch {
          // ignore fallback detection error
        }
      }

      setImportedContractPdfFile(file);
      const attachmentNote = parsedIsEndorsement
        ? " PDF se při uložení přiloží k detailu dodatku."
        : " PDF se při uložení přiloží k detailu záznamu.";
      const productDetectionPrefix = productDetected
        ? ""
        : `Produkt z PDF jsem nerozpoznal; použil jsem vybraný produkt ${productLabel(importProduct)}. `;
      const ocrPrefix = parsed.ocrTextUsed === true ? "PDF bylo skenované, načteno přes OCR. " : "";
      setPdfImportStatus(
        parsedIsEndorsement
          ? endorsementPreparedFromPdf
            ? `${ocrPrefix}${productDetectionPrefix}Načtena žádanka o změnu z PDF (${applied} polí). Připravil jsem dodatek podle rozdílu proti poslední uložené hodnotě smlouvy.${attachmentNote}`
            : `${ocrPrefix}${productDetectionPrefix}Načtena žádanka o změnu z PDF (${applied} polí). Původní smlouvu se nepodařilo automaticky porovnat, zkontroluj hlášku a klikni na Změna znovu.${attachmentNote}`
          : applied > 0
          ? `${ocrPrefix}${productDetectionPrefix}Načteno z PDF (${applied} polí). Zkontroluj prosím.${attachmentNote}`
          : importProduct === "cppsimplex"
            ? `${ocrPrefix}${productDetectionPrefix}PDF pro ČPP Simplex nahráno. Extrakci polí doladíme v dalším kroku.${attachmentNote}`
            : `${ocrPrefix}${productDetectionPrefix}V PDF se nenašla čitelná data, doplň ručně.${attachmentNote}`
      );
      setPdfImportError(importIssueMessage);
    } catch (err) {
      console.error("PDF import selhal", err);
      if (!isCurrentPdfImport()) return;
      const importTimedOut = isPdfImportTimeoutError(err);
      allowPdfImportProgress = false;
      if (!importTimedOut && importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await withPdfImportTimeout(
            parseMaxCizinKomplexPdfLazy(file),
            5_000,
            "Fallback rozpoznání MAXIMA Cizinci trvá moc dlouho."
          );
          if (!isCurrentPdfImport()) return;
          if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
            showMaxCizinKomplexHint();
            return;
          }
        } catch {
          // ignore fallback detection error
        }
      }
      setImportedContractPdfFile(file);
      setPdfImportError(
        importTimedOut
          ? "Automatické čtení PDF trvalo příliš dlouho, takže jsem ho odblokoval. PDF zůstává připravené jako příloha."
          : importProduct
            ? failedPdfImportMessage(importProduct, productDetected)
            : "Produkt z PDF se nepodařilo rozpoznat. Vyber produkt ručně."
      );
      setPdfImportStatus(
        importTimedOut
          ? "PDF se při uložení přiloží k detailu smlouvy. Údaje doplň ručně a můžeš pokračovat bez čekání na parser."
          : null
      );
    } finally {
      allowPdfImportProgress = false;
      if (isCurrentPdfImport()) {
        setPdfImporting(false);
      }
      if (isCurrentPdfImport() && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const {
    isDropActive: pdfDropActive,
    resetDropState: resetPdfDropState,
    handleDragEnter: handlePdfDragEnter,
    handleDragOver: handlePdfDragOver,
    handleDragLeave: handlePdfDragLeave,
    handleDrop: handlePdfDrop,
  } = usePdfDropzone({
    isBusy: pdfImporting,
    onPdfFile: (file) => {
      void handlePdfImport(file);
    },
    onInvalidFile: () => {
      setPdfImportError("Přetáhni prosím PDF soubor.");
      setPdfImportStatus(null);
      setImportedContractPdfFile(null);
    },
  });

  const updateAutoBulkRow = (
    rows: AutoBulkImportRow[],
    index: number,
    patch: Partial<AutoBulkImportRow>
  ): AutoBulkImportRow[] => {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row
    );
    setAutoBulkImportRows(nextRows);
    return nextRows;
  };

  const loadAutoBulkReviewDraft = (rowId: string) => {
    const row = autoBulkImportRows.find((item) => item.id === rowId);
    const draft = row?.reviewDraft;
    if (!row || !draft) return;

    const reviewProduct = draft.product;
    const parsed = draft.parsed;
    const parsedFrequency = parsedPdfFrequencyValue(parsed);
    const amount = parsedPdfNumberValue(parsed, "amount");
    const liabilityLimit = parsedPdfRoundedNumberValue(parsed, "carLiabilityLimit");
    const hullSumInsuredText = parsedPdfTextValue(parsed, "carHullSumInsuredText");
    const hullSumInsured = parsedPdfRoundedNumberValue(parsed, "carHullSumInsured");
    const hullDeductible = parsedPdfRoundedNumberValue(parsed, "carHullDeductible");
    const hullDeductibleText = parsedPdfTextValue(parsed, "carHullDeductibleText");
    const glassLimit = parsedPdfRoundedNumberValue(parsed, "carAddonGlassLimit");
    const animalCollisionLimit = parsedPdfRoundedNumberValue(
      parsed,
      "carAddonAnimalCollisionLimit"
    );
    const animalDamageLimit = parsedPdfRoundedNumberValue(
      parsed,
      "carAddonAnimalDamageLimit"
    );
    const theftLimit = parsedPdfRoundedNumberValue(parsed, "carAddonTheftLimit");
    const naturalLimit = parsedPdfRoundedNumberValue(parsed, "carAddonNaturalLimit");
    const ownDamageLimit = parsedPdfRoundedNumberValue(parsed, "carAddonOwnDamageLimit");
    const gapLimit = parsedPdfRoundedNumberValue(parsed, "carAddonGapLimit");
    const cppPremiumLiabilityBundle =
      reviewProduct === "cppAuto" && liabilityLimit === 200_000_000;

    setCalculatorViewMode("addContract");
    setProduct(reviewProduct);
    setHasSelectedProduct(true);
    setProductPickerSectionForProduct(reviewProduct);
    setProductSearchText("");
    setTipsterModeEnabled(false);
    setTipContractConfig(null);
    setStatementPremiumSource(null);
    setEndorsementDraft(null);
    setEndorsementDraftModalOpen(false);
    setEndorsementWorkflowActive(false);

    setImportedContractPdfFile(draft.file);
    setPdfImporting(false);
    setPdfClientNameLoaded(Boolean(parsedPdfTextValue(parsed, "clientName")));
    setPdfMatchedClientName(false);
    setPdfImportStatus(
      `Načteno ke kontrole z hromadného importu: ${row.fileName}. PDF se při uložení přiloží ke smlouvě.`
    );
    setPdfImportError(formatAutoBulkImportWarnings(draft.warnings) || null);
    setValidationError(null);
    setMissingFields([]);
    setSaveMessage("Zkontroluj načtená pole a pak smlouvu ulož ručně.");

    setContractNumber(parsedPdfTextValue(parsed, "contractNumber"));
    setClientName(parsedPdfTextValue(parsed, "clientName"));
    setPolicyStartDate(parsedPdfTextValue(parsed, "policyStartDate"));
    setPolicyEndDate(parsedPdfTextValue(parsed, "policyEndDate"));
    setContractSignedDate(parsedPdfTextValue(parsed, "contractSignedDate"));
    setStornoDate("");
    setAmountText(amount != null ? String(amount) : "");
    if (parsedFrequency && allowedFrequencies(reviewProduct).includes(parsedFrequency)) {
      setFrequency(parsedFrequency);
    } else {
      setFrequency(allowedFrequencies(reviewProduct)[0] ?? "annual");
    }

    setRefreshOriginalOpen(draft.isReplacement);
    setRefreshOriginalContractNumber(
      draft.isReplacement ? draft.replacementNumber : ""
    );
    setRefreshOriginalMissingInSystem(false);
    setRefreshOriginalPdfLookupNumber(null);
    setRefreshOriginalLookup({
      status: "idle",
      progress: 0,
      adviserName: null,
      original: null,
    });

    setAutoCarMake(parsedPdfTextValue(parsed, "carMake"));
    setAutoCarPlate(parsedPdfTextValue(parsed, "carPlate"));
    setAutoCarVin(parsedPdfTextValue(parsed, "carVin"));
    setAutoCarTp(parsedPdfTextValue(parsed, "carTp"));
    setAutoCarOrv(parsedPdfTextValue(parsed, "carOrv"));
    setAutoCarAnnualMileage(parsedPdfTextValue(parsed, "carAnnualMileage"));
    setAutoCarAllianzScope(parsedPdfTextValue(parsed, "carAllianzScope"));
    setAutoCarLiabilityLimit(liabilityLimit);
    if (hullSumInsuredText) {
      setAutoCarHullSumInsured(null);
      setAutoCarHullSumInsuredText(hullSumInsuredText);
    } else {
      setAutoCarHullSumInsured(hullSumInsured);
      setAutoCarHullSumInsuredText("");
    }
    setAutoCarHullSumInsuredDraft("");
    setAutoCarHullDeductible(hullDeductible);
    setAutoCarHullDeductibleText(hullDeductibleText);
    setAutoCarHullRiskAccident(parsedPdfBooleanValue(parsed, "carHullRiskAccident"));
    setAutoCarHullRiskTheft(parsedPdfBooleanValue(parsed, "carHullRiskTheft"));
    setAutoCarHullRiskNatural(parsedPdfBooleanValue(parsed, "carHullRiskNatural"));
    setAutoCarHullRiskVandalism(parsedPdfBooleanValue(parsed, "carHullRiskVandalism"));
    setAutoCarHullRiskAnimalCollision(
      parsedPdfBooleanValue(parsed, "carHullRiskAnimalCollision")
    );
    setAutoCarAssistancePlan(parsedPdfTextValue(parsed, "carAssistancePlan"));
    setAutoCarAddonEso(parsedPdfBooleanValue(parsed, "carAddonEso"));
    setAutoCarAddonNaturalRisks(parsedPdfBooleanValue(parsed, "carAddonNaturalRisks"));
    setAutoCarAddonKlika(parsedPdfBooleanValue(parsed, "carAddonKlika"));
    setAutoCarAddonGlass(
      parsedPdfBooleanOrNumberValue(parsed, "carAddonGlass", "carAddonGlassLimit")
    );
    setAutoCarAddonGlassLimit(glassLimit);
    setAutoCarAddonAnimalCollision(
      parsedPdfBooleanOrNumberValue(
        parsed,
        "carAddonAnimalCollision",
        "carAddonAnimalCollisionLimit"
      )
    );
    setAutoCarAddonAnimalCollisionLimit(animalCollisionLimit);
    setAutoCarAddonAnimalDamage(
      parsedPdfBooleanOrNumberValue(
        parsed,
        "carAddonAnimalDamage",
        "carAddonAnimalDamageLimit"
      )
    );
    setAutoCarAddonAnimalDamageLimit(animalDamageLimit);
    setAutoCarAddonVandalism(parsedPdfBooleanValue(parsed, "carAddonVandalism"));
    setAutoCarAddonTheft(
      parsedPdfBooleanOrNumberValue(parsed, "carAddonTheft", "carAddonTheftLimit")
    );
    setAutoCarAddonTheftLimit(theftLimit);
    setAutoCarAddonNatural(
      parsedPdfBooleanOrNumberValue(parsed, "carAddonNatural", "carAddonNaturalLimit")
    );
    setAutoCarAddonNaturalLimit(naturalLimit);
    setAutoCarAddonOwnDamage(
      parsedPdfBooleanOrNumberValue(
        parsed,
        "carAddonOwnDamage",
        "carAddonOwnDamageLimit"
      )
    );
    setAutoCarAddonOwnDamageLimit(ownDamageLimit);
    setAutoCarAddonGap(
      parsedPdfBooleanOrNumberValue(parsed, "carAddonGap", "carAddonGapLimit")
    );
    setAutoCarAddonGapLimit(gapLimit);
    setAutoCarAddonSmartGap(
      parsedPdfBooleanValue(parsed, "carAddonSmartGap") || cppPremiumLiabilityBundle
    );
    setAutoCarAddonServisPro(
      parsedPdfBooleanValue(parsed, "carAddonServisPro") || cppPremiumLiabilityBundle
    );
    setAutoCarAddonFireExplosion(
      parsedPdfBooleanValue(parsed, "carAddonFireExplosion")
    );
    setAutoCarAddonLegalAdvice(parsedPdfBooleanValue(parsed, "carAddonLegalAdvice"));
    setAutoCarAddonReplacementCar(
      parsedPdfBooleanValue(parsed, "carAddonReplacementCar")
    );
    setAutoCarAddonLuggage(parsedPdfBooleanValue(parsed, "carAddonLuggage"));
    setAutoCarAddonTransportedGoods(
      parsedPdfBooleanValue(parsed, "carAddonTransportedGoods")
    );
    setAutoCarAddonPothole(parsedPdfBooleanValue(parsed, "carAddonPothole"));
    setAutoCarAddonNonFaultAccident(
      parsedPdfBooleanValue(parsed, "carAddonNonFaultAccident")
    );
    setAutoCarAddonPassengerInjury(
      parsedPdfBooleanValue(parsed, "carAddonPassengerInjury")
    );
    setAutoCarAddonKeyLossTheft(parsedPdfBooleanValue(parsed, "carAddonKeyLossTheft"));

    setDomexAddress(parsedPdfTextValue(parsed, "domexAddress"));
    setDomexPropertyType(parsedPdfTextValue(parsed, "domexPropertyType"));
    setDomexPropertyCoverage(parsedPdfTextValue(parsed, "domexPropertyCoverage"));
    setDomexPropertySumInsured(
      parsedPdfRoundedNumberValue(parsed, "domexPropertySumInsured")
    );
    setDomexPropertyDeductible(
      parsedPdfRoundedNumberValue(parsed, "domexPropertyDeductible")
    );
    setDomexHouseholdType(parsedPdfTextValue(parsed, "domexHouseholdType"));
    setDomexHouseholdCoverage(parsedPdfTextValue(parsed, "domexHouseholdCoverage"));
    setDomexHouseholdSumInsured(
      parsedPdfRoundedNumberValue(parsed, "domexHouseholdSumInsured")
    );
    setDomexHouseholdDeductible(
      parsedPdfRoundedNumberValue(parsed, "domexHouseholdDeductible")
    );
    setDomexOutbuildingSumInsured(
      parsedPdfRoundedNumberValue(parsed, "domexOutbuildingSumInsured")
    );
    setDomexLiabilitySumInsured(
      parsedPdfRoundedNumberValue(parsed, "domexLiabilitySumInsured")
    );
    setDomexLiabilityDeductible(
      parsedPdfRoundedNumberValue(parsed, "domexLiabilityDeductible")
    );
    setDomexLiabilityMobile(parsedPdfBooleanValue(parsed, "domexLiabilityMobile"));
    setDomexLiabilityTenant(parsedPdfBooleanValue(parsed, "domexLiabilityTenant"));
    setDomexLiabilityLandlord(parsedPdfBooleanValue(parsed, "domexLiabilityLandlord"));
    setDomexAssistancePlus(parsedPdfBooleanValue(parsed, "domexAssistancePlus"));
    setDomexNote(parsedPdfTextValue(parsed, "domexNote"));

    setAutoBulkImportRows((currentRows) =>
      currentRows.map((item) =>
        item.id === rowId
          ? {
              ...item,
              message: "Načteno do formuláře ke kontrole.",
            }
          : item
      )
    );

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document
          .getElementById("auto-bulk-review-form-anchor")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleAutoBulkImport = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []).filter(
      (file) =>
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );

    if (autoBulkFileInputRef.current) {
      autoBulkFileInputRef.current.value = "";
    }

    if (files.length === 0) {
      setAutoBulkImportStatus("Vyber alespoň jedno PDF smlouvy.");
      setAutoBulkImportRows([]);
      return;
    }

    if (files.length > AUTO_BULK_IMPORT_MAX_FILES) {
      setAutoBulkImportStatus(
        `Najednou lze nahrát maximálně ${AUTO_BULK_IMPORT_MAX_FILES} PDF.`
      );
      setAutoBulkImportRows([]);
      return;
    }

    if (!user) {
      setAutoBulkImportStatus("Nejdřív se prosím přihlas.");
      return;
    }

    if (!isAddContractMode) {
      setAutoBulkImportStatus("Hromadné nahrávání je dostupné jen při přidání smlouvy.");
      return;
    }

    if (product && !isBulkImportProduct(product)) {
      setAutoBulkImportStatus(
        "Hromadné nahrávání podporuje auto produkty kromě flotil a ČPP DOMEX od 01.01.2025."
      );
      return;
    }

    if (tipsterModeEnabled || tipContractConfig) {
      setAutoBulkImportStatus("Hromadné nahrávání zatím nepoužívá smlouvy z TIPU.");
      return;
    }

    if (saving || pdfImporting) {
      setAutoBulkImportStatus("Počkej prosím na dokončení aktuální akce.");
      return;
    }

    const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user.email);
    if (!targetOwnerEmail) {
      setAutoBulkImportStatus("Chybí cílový vlastník smlouvy.");
      return;
    }

    let rows: AutoBulkImportRow[] = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
      fileName: file.name,
      status: "queued",
      productLabel: null,
      contractNumber: null,
      clientName: null,
      message: "Čeká",
    }));

    setAutoBulkImportRows(rows);
    setAutoBulkImporting(true);
    setAutoBulkImportStatus(`Zpracovávám 0/${files.length}`);
    setSaveMessage(null);
    setValidationError(null);

    const batchContractNumbers = new Set<string>();
    let savedCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let processedCount = 0;

    const finishRow = (
      index: number,
      patch: Partial<AutoBulkImportRow>,
      counter: "saved" | "review" | "skipped" | "failed"
    ) => {
      if (counter === "saved") savedCount += 1;
      if (counter === "review") reviewCount += 1;
      if (counter === "skipped") skippedCount += 1;
      if (counter === "failed") failedCount += 1;
      rows = updateAutoBulkRow(rows, index, patch);
    };

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        rows = updateAutoBulkRow(rows, index, {
          status: "processing",
          message: "Čtu PDF",
        });
        setAutoBulkImportStatus(`Zpracovávám ${processedCount + 1}/${files.length}`);

        try {
          const detected = await withPdfImportTimeout(
            detectProductFromPdfLazy(file),
            PDF_PRODUCT_DETECTION_TIMEOUT_MS,
            "Rozpoznání produktu z PDF trvá moc dlouho."
          ).catch((detectErr) => {
            console.warn("Batch import: detekce produktu selhala", detectErr);
            return null;
          });

          const productDetected = Boolean(detected);
          const detectionConfidence = detected?.confidence ?? null;
          const importProduct = detected?.product ?? (isBulkImportProduct(product) ? product : null);
          if (!importProduct) {
            finishRow(
              index,
              {
                status: "error",
                message: "Produkt se nepodařilo rozpoznat.",
              },
              "failed"
            );
            continue;
          }

          if (!isBulkImportProduct(importProduct)) {
            finishRow(
              index,
              {
                status: "skipped",
                productLabel: productLabel(importProduct),
                message: isAutoProduct(importProduct)
                  ? "Flotilové auto produkty dávka nepodporuje."
                  : `Rozpoznáno jako ${productLabel(importProduct)}.`,
              },
              "skipped"
            );
            continue;
          }

          if (!isBulkImportProductAllowedForSelection(importProduct, product)) {
            finishRow(
              index,
              {
                status: "skipped",
                productLabel: productLabel(importProduct),
                message: "Pro tento produkt není hromadný PDF import dostupný.",
              },
              "skipped"
            );
            continue;
          }

          rows = updateAutoBulkRow(rows, index, {
            productLabel: productLabel(importProduct),
            message: `Načítám ${productLabel(importProduct)}`,
          });

          const parsed = await withPdfImportTimeout(
            parseContractPdfByProduct(importProduct, file),
            PDF_DATA_IMPORT_TIMEOUT_MS,
            "Automatické čtení dat z PDF trvá moc dlouho."
          );

          if (!parsed) {
            finishRow(
              index,
              {
                status: "error",
                message: "Parser nevrátil čitelná data.",
              },
              "failed"
            );
            continue;
          }

          const replacementNumber = parsedPdfTextValue(
            parsed,
            "refreshOriginalContractNumber"
          );
          const isReplacementPdf = parsed.isRefresh === true || Boolean(replacementNumber);
          let replacementOriginalMissingInSystem = false;
          if (isReplacementPdf && !replacementNumber) {
            finishRow(
              index,
              {
                status: "error",
                message: "PDF vypadá jako náhrada, ale chybí číslo původní smlouvy.",
              },
              "failed"
            );
            continue;
          }
          if (isReplacementPdf && !supportsOriginalContractReplacement(importProduct)) {
            finishRow(
              index,
              {
                status: "error",
                message: `Náhrada není pro ${productLabel(importProduct)} v dávce podporovaná.`,
              },
              "failed"
            );
            continue;
          }

          const parsedFrequency = parsedPdfFrequencyValue(parsed);
          const parsedAmount = parsedPdfNumberValue(parsed, "amount");
          const contractNumberFromPdf = parsedPdfTextValue(parsed, "contractNumber");
          const clientNameFromPdf = parsedPdfTextValue(parsed, "clientName");
          const signedDateIso = parsedPdfTextValue(parsed, "contractSignedDate");
          const policyStartDateIso = parsedPdfTextValue(parsed, "policyStartDate");
          const policyEndDateIso = parsedPdfTextValue(parsed, "policyEndDate");
          const parsedDurationYears = parsedPdfRoundedNumberValue(
            parsed,
            "durationYears"
          );
          const parsedDurationMonths = parsedPdfRoundedNumberValue(
            parsed,
            "durationMonths"
          );
          const parsedMaxCizinKomplexVariant =
            parsed.maxCizinKomplexVariant === "exclusiveStandard" ||
            parsed.maxCizinKomplexVariant === "premium"
              ? parsed.maxCizinKomplexVariant
              : null;
          const parsedComfortPayment = parsedPdfNumberValue(parsed, "comfortPayment");
          rows = updateAutoBulkRow(rows, index, {
            contractNumber: contractNumberFromPdf || null,
            clientName: clientNameFromPdf || null,
            message: "Kontroluji data",
          });

          const missing: string[] = [];
          if (!contractNumberFromPdf) missing.push("číslo smlouvy");
          if (!clientNameFromPdf) missing.push("klienta");
          if (!signedDateIso) missing.push("datum sjednání");
          if (!policyStartDateIso) missing.push("datum počátku");
          if (parsedAmount == null || parsedAmount <= 0) missing.push("pojistné");
          if (!parsedFrequency) missing.push("frekvenci");

          if (missing.length > 0) {
            finishRow(
              index,
              {
                status: "error",
                message: `Chybí: ${missing.join(", ")}.`,
              },
              "failed"
            );
            continue;
          }

          const frequencyForSave = parsedFrequency;
          const amountForSave = parsedAmount;
          if (!frequencyForSave || amountForSave == null || amountForSave <= 0) {
            finishRow(
              index,
              {
                status: "error",
                message: "Chybí pojistné nebo frekvence.",
              },
              "failed"
            );
            continue;
          }

          if (!allowedFrequencies(importProduct).includes(frequencyForSave)) {
            finishRow(
              index,
              {
                status: "error",
                message: `Nepodporovaná frekvence: ${frequencyLabel(frequencyForSave)}.`,
              },
              "failed"
            );
            continue;
          }

          const dateIssues = collectContractDateIssues(
            signedDateIso,
            policyStartDateIso,
            policyEndDateIso
          );
          const dateErrors = dateIssues.filter((issue) => issue.severity === "error");
          const dateWarnings = dateIssues.filter((issue) => issue.severity === "warning");
          const rowWarnings = buildAutoBulkImportWarnings({
            product: importProduct,
            parsed,
            productDetected,
            detectionConfidence,
          });
          if (dateErrors.length > 0) {
            finishRow(
              index,
              {
                status: "error",
                message: dateErrors.map((issue) => issue.message).join(" "),
              },
              "failed"
            );
            continue;
          }

          if (
            importProduct === "domex" &&
            signedDateIso < DOMEX_BULK_IMPORT_MIN_CONTRACT_SIGNED_DATE
          ) {
            finishRow(
              index,
              {
                status: "skipped",
                message: `DOMEX dávka je zatím povolená jen pro smlouvy sjednané od ${DOMEX_BULK_IMPORT_MIN_CONTRACT_SIGNED_DATE_LABEL}.`,
              },
              "skipped"
            );
            continue;
          }

          const coefficientError = productCoefficientValidityError(
            importProduct,
            signedDateIso
          );
          if (coefficientError) {
            finishRow(
              index,
              {
                status: "error",
                message: coefficientError,
              },
              "failed"
            );
            continue;
          }

          const batchContractNumberKey = contractNumberFromPdf
            .replace(/\s+/g, "")
            .toLowerCase();
          if (batchContractNumbers.has(batchContractNumberKey)) {
            finishRow(
              index,
              {
                status: "skipped",
                message: "Duplicitní číslo v této dávce.",
              },
              "skipped"
            );
            continue;
          }
          batchContractNumbers.add(batchContractNumberKey);

          rows = updateAutoBulkRow(rows, index, {
            status: "processing",
            message: "Kontroluji duplicity",
          });

          const findParams = new URLSearchParams({
            scope: isSavingForSubordinate ? "team" : "my",
            q: contractNumberFromPdf,
          });
          const findPayload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
            user,
            `/api/contracts/find?${findParams.toString()}`,
            { method: "GET" }
          );
          const duplicateCount = (Array.isArray(findPayload.contracts)
            ? findPayload.contracts
            : []
          ).filter((entry) => contractOwnerEmail(entry) === targetOwnerEmail).length;
          if (duplicateCount > 0) {
            finishRow(
              index,
              {
                status: "skipped",
                message: `Smlouva už existuje (${duplicateCount}x).`,
              },
              "skipped"
            );
            continue;
          }

          if (!isSavingForSubordinate) {
            try {
              const precheckParams = new URLSearchParams({
                productKey: importProduct,
                clientName: clientNameFromPdf,
                signedDate: signedDateIso,
                contractNumber: contractNumberFromPdf,
              });
              const precheckPayload =
                await fetchAuthedJsonOrThrow<ContractsPrecheckApiResponse>(
                  user,
                  `/api/contracts/precheck?${precheckParams.toString()}`,
                  { method: "GET" }
                );
              const similarCount = Array.isArray(precheckPayload?.similarContracts)
                ? precheckPayload.similarContracts.length
                : 0;
              if (similarCount > 0) {
                rowWarnings.push(
                  `v systému je podobná smlouva stejného produktu a klienta (${similarCount}x)`
                );
              }
            } catch (precheckErr) {
              console.warn("Batch import: kontrola podobných smluv selhala", precheckErr);
              rowWarnings.push("nepodařilo se ověřit podobné smlouvy");
            }
          }

          if (isReplacementPdf && replacementNumber) {
            try {
              const originalFindParams = new URLSearchParams({
                scope: isSavingForSubordinate ? "team" : "my",
                q: replacementNumber,
              });
              const originalFindPayload =
                await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
                  user,
                  `/api/contracts/find?${originalFindParams.toString()}`,
                  { method: "GET" }
                );
              const normalizedReplacementNumber =
                normalizeSearchTextValue(replacementNumber);
              const originalFound = (Array.isArray(originalFindPayload.contracts)
                ? originalFindPayload.contracts
                : []
              ).some((entry) => {
                if (contractOwnerEmail(entry) !== targetOwnerEmail) return false;
                const entryContractNumber =
                  typeof entry.contractNumber === "string"
                    ? entry.contractNumber
                    : "";
                return (
                  normalizeSearchTextValue(entryContractNumber) ===
                  normalizedReplacementNumber
                );
              });
              if (!originalFound) {
                replacementOriginalMissingInSystem = true;
              }
            } catch (originalLookupErr) {
              console.warn(
                "Batch import: kontrola původní smlouvy náhrady selhala",
                originalLookupErr
              );
              rowWarnings.push("nepodařilo se ověřit původní smlouvu náhrady");
            }
          }

          if (importProduct === "domex" && !hasParsedDomexDetail(parsed)) {
            rowWarnings.push("nenašel jsem detail majetku DOMEX");
          }

          const rowWarningMessages = [
            ...dateWarnings.map((issue) => issue.message),
            ...rowWarnings,
          ];
          const warningText = formatAutoBulkImportWarnings(rowWarningMessages);
          if (warningText) {
            finishRow(
              index,
              {
                status: "review",
                message: `Ke kontrole. ${warningText}`,
                reviewDraft: {
                  file,
                  product: importProduct,
                  parsed,
                  warnings: rowWarningMessages,
                  isReplacement: isReplacementPdf,
                  replacementNumber,
                },
              },
              "review"
            );
            continue;
          }

          rows = updateAutoBulkRow(rows, index, {
            status: "processing",
            message: isReplacementPdf ? "Ukládám náhradu" : "Ukládám smlouvu",
          });

          const carLiabilityLimit = parsedPdfRoundedNumberValue(
            parsed,
            "carLiabilityLimit"
          );
          const hullSumInsuredText = parsedPdfTextValue(parsed, "carHullSumInsuredText");
          const hullSumInsuredNumber = parsedPdfRoundedNumberValue(
            parsed,
            "carHullSumInsured"
          );
          const hullDeductibleText = parsedPdfTextValue(parsed, "carHullDeductibleText");
          const hullDeductible = parsedPdfRoundedNumberValue(
            parsed,
            "carHullDeductible"
          );
          const glassLimit = parsedPdfRoundedNumberValue(parsed, "carAddonGlassLimit");
          const animalCollisionLimit = parsedPdfRoundedNumberValue(
            parsed,
            "carAddonAnimalCollisionLimit"
          );
          const animalDamageLimit = parsedPdfRoundedNumberValue(
            parsed,
            "carAddonAnimalDamageLimit"
          );
          const theftLimit = parsedPdfRoundedNumberValue(parsed, "carAddonTheftLimit");
          const naturalLimit = parsedPdfRoundedNumberValue(parsed, "carAddonNaturalLimit");
          const ownDamageLimit = parsedPdfRoundedNumberValue(
            parsed,
            "carAddonOwnDamageLimit"
          );
          const gapLimit = parsedPdfRoundedNumberValue(parsed, "carAddonGapLimit");
          const canSaveTp =
            importProduct === "slaviaauto" || importProduct === "uniqaAuto";
          const canSaveAnnualMileage =
            importProduct === "allianzAuto" || importProduct === "pillowAuto";
          const canSaveAllianzScope = importProduct === "allianzAuto";
          const canSaveHullSum =
            importProduct === "kooperativaAuto" ||
            importProduct === "uniqaAuto" ||
            importProduct === "cppAuto" ||
            importProduct === "allianzAuto" ||
            importProduct === "pillowAuto" ||
            importProduct === "csobAuto";
          const canSaveHullText =
            importProduct === "allianzAuto" || importProduct === "pillowAuto";
          const canSaveHullRisks =
            importProduct === "kooperativaAuto" ||
            importProduct === "uniqaAuto" ||
            importProduct === "cppAuto" ||
            importProduct === "allianzAuto" ||
            importProduct === "pillowAuto";
          const canSaveAssistance =
            importProduct === "kooperativaAuto" ||
            importProduct === "uniqaAuto" ||
            importProduct === "cppAuto" ||
            importProduct === "allianzAuto" ||
            importProduct === "csobAuto" ||
            importProduct === "pillowAuto";
          const cppPremiumLiabilityBundle =
            importProduct === "cppAuto" && carLiabilityLimit === 200_000_000;
          const carAddonGlass = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonGlass",
            "carAddonGlassLimit"
          );
          const carAddonAnimalCollision = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonAnimalCollision",
            "carAddonAnimalCollisionLimit"
          );
          const carAddonAnimalDamage = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonAnimalDamage",
            "carAddonAnimalDamageLimit"
          );
          const carAddonTheft = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonTheft",
            "carAddonTheftLimit"
          );
          const carAddonNatural = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonNatural",
            "carAddonNaturalLimit"
          );
          const carAddonOwnDamage = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonOwnDamage",
            "carAddonOwnDamageLimit"
          );
          const carAddonGap = parsedPdfBooleanOrNumberValue(
            parsed,
            "carAddonGap",
            "carAddonGapLimit"
          );
          const carHullSumInsured =
            canSaveHullText && hullSumInsuredText ? null : hullSumInsuredNumber;
          const isAutoImportProduct = isAutoProduct(importProduct);
          const propertyDetailForSave =
            importProduct === "domex" || importProduct === "maxdomov"
              ? {
                  address: parsedPdfTextValue(parsed, "domexAddress") || null,
                  propertyType: parsedPdfTextValue(parsed, "domexPropertyType") || null,
                  propertyCoverage:
                    parsedPdfTextValue(parsed, "domexPropertyCoverage") || null,
                  sumInsured: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexPropertySumInsured"
                  ),
                  deductible: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexPropertyDeductible"
                  ),
                  householdType:
                    parsedPdfTextValue(parsed, "domexHouseholdType") || null,
                  householdCoverage:
                    parsedPdfTextValue(parsed, "domexHouseholdCoverage") || null,
                  householdSumInsured: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexHouseholdSumInsured"
                  ),
                  householdDeductible: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexHouseholdDeductible"
                  ),
                  outbuildingSumInsured: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexOutbuildingSumInsured"
                  ),
                  liabilitySumInsured: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexLiabilitySumInsured"
                  ),
                  liabilityDeductible: parsedPdfRoundedNumberValue(
                    parsed,
                    "domexLiabilityDeductible"
                  ),
                  liabilityMobile: parsedPdfBooleanValue(parsed, "domexLiabilityMobile")
                    ? true
                    : null,
                  liabilityTenant: parsedPdfBooleanValue(parsed, "domexLiabilityTenant")
                    ? true
                    : null,
                  liabilityLandlord: parsedPdfBooleanValue(
                    parsed,
                    "domexLiabilityLandlord"
                  )
                    ? true
                    : null,
                  assistancePlus: parsedPdfBooleanValue(parsed, "domexAssistancePlus")
                    ? true
                    : null,
                  note: parsedPdfTextValue(parsed, "domexNote") || null,
                }
              : null;
          const contractEntryPayload = {
            productKey: importProduct,
            entryType: "contract" as ContractEntryType,
            commissionMode: null,
            inputAmount: amountForSave,
            calculationInputAmount: amountForSave,
            effectiveInputAmount: amountForSave,
            comfortPayment:
              importProduct === "comfortcc" &&
              parsedComfortPayment != null &&
              parsedComfortPayment > 0
                ? parsedComfortPayment
                : null,
            comfortGradual: importProduct === "comfortcc" ? false : null,
            comfortTargetAmount: null,
            frequencyRaw: frequencyForSave,
            clientName: clientNameFromPdf,
            contractSignedDate: signedDateIso,
            policyStartDate: policyStartDateIso,
            policyEndDate: policyEndDateIso || null,
            status: "active",
            stornoDate: null,
            durationYears:
              shouldShowDuration(importProduct) &&
              parsedDurationYears != null &&
              parsedDurationYears > 0
                ? parsedDurationYears
                : null,
            durationMonths:
              shouldShowDurationMonths(importProduct) &&
              parsedDurationMonths != null &&
              parsedDurationMonths > 0
                ? normalizedDurationMonths(importProduct, parsedDurationMonths)
                : null,
            maxCizinKomplexVariant:
              importProduct === "maxcizinkomplex"
                ? parsedMaxCizinKomplexVariant
                : null,
            contractNumber: contractNumberFromPdf,
            tipContractTipsterEmail: null,
            tipContractTipsterPercent: null,
            tipContractSourceTipId: null,
            tipContractSourceTipTitle: null,
            tipContractSourceTipProductLabel: null,
            tipContractSourceTipClientName: null,
            tipContractSourceTipCreatedAtMs: null,
            carMake: isAutoImportProduct
              ? parsedPdfTextValue(parsed, "carMake") || null
              : null,
            carPlate: isAutoImportProduct
              ? parsedPdfTextValue(parsed, "carPlate") || null
              : null,
            carVin: isAutoImportProduct
              ? parsedPdfTextValue(parsed, "carVin") || null
              : null,
            carTp:
              isAutoImportProduct && canSaveTp
                ? parsedPdfTextValue(parsed, "carTp") || null
                : null,
            carOrv: isAutoImportProduct
              ? parsedPdfTextValue(parsed, "carOrv") || null
              : null,
            carAnnualMileage: isAutoImportProduct && canSaveAnnualMileage
              ? parsedPdfTextValue(parsed, "carAnnualMileage") || null
              : null,
            carAllianzScope: isAutoImportProduct && canSaveAllianzScope
              ? parsedPdfTextValue(parsed, "carAllianzScope") || null
              : null,
            carLiabilityLimit: isAutoImportProduct ? carLiabilityLimit : null,
            carHullSumInsured:
              isAutoImportProduct && canSaveHullSum ? carHullSumInsured : null,
            carHullSumInsuredText:
              isAutoImportProduct && canSaveHullText
                ? hullSumInsuredText || null
                : null,
            carHullDeductible:
              isAutoImportProduct && canSaveHullSum ? hullDeductible : null,
            carHullDeductibleText:
              isAutoImportProduct && canSaveHullSum
                ? hullDeductibleText || null
                : null,
            carHullRiskAccident: isAutoImportProduct && canSaveHullRisks
              ? parsedPdfBooleanValue(parsed, "carHullRiskAccident")
              : null,
            carHullRiskTheft: isAutoImportProduct && canSaveHullRisks
              ? parsedPdfBooleanValue(parsed, "carHullRiskTheft")
              : null,
            carHullRiskNatural: isAutoImportProduct && canSaveHullRisks
              ? parsedPdfBooleanValue(parsed, "carHullRiskNatural")
              : null,
            carHullRiskVandalism: isAutoImportProduct && canSaveHullRisks
              ? parsedPdfBooleanValue(parsed, "carHullRiskVandalism")
              : null,
            carHullRiskAnimalCollision: isAutoImportProduct && canSaveHullRisks
              ? parsedPdfBooleanValue(parsed, "carHullRiskAnimalCollision")
              : null,
            carAssistancePlan: isAutoImportProduct && canSaveAssistance
              ? parsedPdfTextValue(parsed, "carAssistancePlan") || null
              : null,
            carAddonEso: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonEso")
              : null,
            carAddonNaturalRisks: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonNaturalRisks")
              : null,
            carAddonKlika: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonKlika")
              : null,
            carAddonGlass: isAutoImportProduct ? carAddonGlass : null,
            carAddonGlassLimit: isAutoImportProduct ? glassLimit : null,
            carAddonAnimalCollision: isAutoImportProduct
              ? carAddonAnimalCollision
              : null,
            carAddonAnimalCollisionLimit: isAutoImportProduct
              ? animalCollisionLimit
              : null,
            carAddonAnimalDamage: isAutoImportProduct ? carAddonAnimalDamage : null,
            carAddonAnimalDamageLimit: isAutoImportProduct
              ? animalDamageLimit
              : null,
            carAddonVandalism: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonVandalism")
              : null,
            carAddonTheft: isAutoImportProduct ? carAddonTheft : null,
            carAddonTheftLimit: isAutoImportProduct ? theftLimit : null,
            carAddonNatural: isAutoImportProduct ? carAddonNatural : null,
            carAddonNaturalLimit: isAutoImportProduct ? naturalLimit : null,
            carAddonOwnDamage: isAutoImportProduct ? carAddonOwnDamage : null,
            carAddonOwnDamageLimit: isAutoImportProduct ? ownDamageLimit : null,
            carAddonGap: isAutoImportProduct ? carAddonGap : null,
            carAddonGapLimit: isAutoImportProduct ? gapLimit : null,
            carAddonSmartGap: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonSmartGap") ||
                cppPremiumLiabilityBundle
              : null,
            carAddonServisPro: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonServisPro") ||
                cppPremiumLiabilityBundle
              : null,
            carAddonFireExplosion: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonFireExplosion")
              : null,
            carAddonLegalAdvice: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonLegalAdvice")
              : null,
            carAddonReplacementCar: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonReplacementCar")
              : null,
            carAddonLuggage: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonLuggage")
              : null,
            carAddonTransportedGoods: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonTransportedGoods")
              : null,
            carAddonPothole: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonPothole")
              : null,
            carAddonNonFaultAccident: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonNonFaultAccident")
              : null,
            carAddonPassengerInjury: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonPassengerInjury")
              : null,
            carAddonKeyLossTheft: isAutoImportProduct
              ? parsedPdfBooleanValue(parsed, "carAddonKeyLossTheft")
              : null,
            neonDetail: null,
            domexDetail: importProduct === "domex" ? propertyDetailForSave : null,
            maxdomovDetail:
              importProduct === "maxdomov" ? propertyDetailForSave : null,
            paid: shouldAutoMarkPaidByPolicyStartDate(policyStartDateIso),
            isRefresh: isReplacementPdf,
            refreshOriginalMissingInSystem: replacementOriginalMissingInSystem,
            requiresStatementRefresh: replacementOriginalMissingInSystem,
            commissionCalculationStatus: replacementOriginalMissingInSystem
              ? "provisional_refresh_missing_original"
              : null,
            commissionBaseSource: replacementOriginalMissingInSystem
              ? "calculator_provisional"
              : null,
            premiumUpdatedFromStatementAtMs: null,
            premiumUpdatedFromStatementChronologyMs: null,
            premiumUpdatedFromStatementId: null,
            createdFromCommissionStatement: false,
            createdFromCommissionStatementAtMs: null,
            createdFromCommissionStatementChronologyMs: null,
            createdFromCommissionStatementId: null,
            refreshOriginalContractNumber: isReplacementPdf
              ? replacementNumber
              : null,
          };

          const { response, data } = await requestContractsMutationWithAuth({
            user,
            path: "/api/contracts",
            method: "POST",
            payload: {
              ownerEmail: targetOwnerEmail,
              entry: contractEntryPayload,
            },
            idempotencyKey: buildContractsCreateIdempotencyKey({
              ownerEmail: targetOwnerEmail,
              entry: contractEntryPayload,
            }),
          });
          const apiError = getContractsMutationError({
            response,
            data,
            fallback: "Uložení smlouvy selhalo.",
          });
          if (apiError) {
            throw new Error(apiError);
          }

          const createdEntryId =
            typeof data?.entryId === "string" ? data.entryId.trim() : "";
          if (!createdEntryId) {
            throw new Error("Server potvrdil uložení bez ID smlouvy.");
          }

          let rowStatus: AutoBulkImportRowStatus = "success";
          const savedLabel = replacementOriginalMissingInSystem
            ? "Uloženo jako náhrada bez původní smlouvy v systému"
            : isReplacementPdf
            ? `Uloženo jako náhrada ${replacementNumber}`
            : "Uloženo";
          let rowMessage = savedLabel;

          rows = updateAutoBulkRow(rows, index, {
            status: "processing",
            message: "Přikládám PDF",
          });

          try {
            await uploadContractPdfAttachmentWithAuth({
              user,
              ownerEmail: targetOwnerEmail,
              entryId: createdEntryId,
              file,
            });
          } catch (uploadErr) {
            rowStatus = "warning";
            const uploadErrorMessage = compactErrorMessage(
              uploadErr,
              "PDF se nepodařilo přiložit."
            );
            rowMessage = `${savedLabel} bez PDF přílohy: ${uploadErrorMessage}`;
          }

          setLastSavedContractRef({
            ownerEmail: targetOwnerEmail,
            entryId: createdEntryId,
          });
          setSaveSuccessFlash({
            contractNumber: contractNumberFromPdf,
            clientName: clientNameFromPdf,
          });
          setContractSaveCelebrationKey((prev) => prev + 1);
          finishRow(
            index,
            {
              status: rowStatus,
              message: rowMessage,
            },
            "saved"
          );
        } catch (error) {
          finishRow(
            index,
            {
              status: "error",
              message: compactErrorMessage(
                error,
                "Smlouvu se nepodařilo zpracovat."
              ),
            },
            "failed"
          );
        } finally {
          processedCount += 1;
          setAutoBulkImportStatus(
            `Zpracovávám ${Math.min(processedCount, files.length)}/${files.length}`
          );
        }
      }
    } finally {
      setAutoBulkImporting(false);
      if (savedCount > 0) {
        invalidateContractsCaches();
      }
      setAutoBulkImportStatus(
        `Hotovo: uloženo ${savedCount}, ke kontrole ${reviewCount}, přeskočeno ${skippedCount}, chyby ${failedCount}.`
      );
    }
  };

  const recalc = () => {
    const val = parseNumber(amountText);
    const positionForCalc =
      calculatorViewMode === "commissionOnly"
        ? position
        : timelineMatchedPosition?.position ??
          (!effectivePositionTimelineLoading && effectivePositionTimeline.length > 0
            ? position
            : null);

    if (
      !hasSelectedProduct ||
      val <= 0 ||
      !positionForCalc ||
      (product === "maximaMaxEfekt" && durationYears == null)
    ) {
      setItems([]);
      setTotal(0);
      setUnsupported(false);
      return;
    }

    const result = calculateCommission({
      productKey: product,
      position: positionForCalc,
      commissionMode: mode,
      contractSignedDateIso: contractSignedDateForNeon,
      inputAmount:
        product === "neon"
          ? neonRefreshCommissionBase?.calculationMonthlyPremium ?? val
          : val,
      frequencyRaw: frequency,
      durationYears,
      durationMonths,
      maxCizinKomplexVariant,
      comfortPayment: parseNumber(comfortPaymentText),
      comfortGradual,
      comfortTargetAmount: parseNumber(comfortTargetAmountText),
    });

    if (!result) {
      setItems([]);
      setTotal(0);
      setUnsupported(true);
      return;
    }

    setItems(result.items);
    setTotal(result.total);
    setUnsupported(false);
  };

  useEffect(() => {
    recalc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    product,
    hasSelectedProduct,
    position,
    timelineMatchedPosition,
    effectivePositionTimeline,
    effectivePositionTimelineLoading,
    isSavingForSubordinate,
    mode,
    frequency,
    durationYears,
    amountText,
    neonRefreshCommissionBase,
    contractSignedDateForNeon,
    comfortGradual,
    comfortPaymentText,
    comfortTargetAmountText,
    maxCizinKomplexVariant,
  ]);

  useEffect(() => {
    if (!supportsOriginalContractReplacement(product)) {
      setRefreshOriginalOpen(false);
      setRefreshOriginalContractNumber("");
      setRefreshOriginalMissingInSystem(false);
      setRefreshOriginalPdfLookupNumber(null);
      setRefreshOriginalLookup({
        status: "idle",
        progress: 0,
        adviserName: null,
        original: null,
      });
    } else if (product !== "neon") {
      setRefreshOriginalMissingInSystem(false);
      setRefreshOriginalPdfLookupNumber(null);
    }
    if (!supportsPolicyEndDate(product)) {
      setPolicyEndDate("");
    }
  }, [product]);

  useEffect(() => {
    setDurationHelpOpen(false);
  }, [product]);

  const resetContractFormAfterSave = () => {
    setAmountText("");
    setFrequency(allowedFrequencies(product)[0]);
    setDurationYears(
      product === "neon" || product === "maximaMaxEfekt"
        ? null
        : durationFallback(product)
    );
    setDurationMonths(
      shouldShowDurationMonths(product) ? durationMonthsFallback(product) : null
    );
    setMaxCizinKomplexVariant("exclusiveStandard");

    setClientName("");
    setClientSuggestionsOpen(false);
    setContractSignedDate("");
    setPolicyStartDate("");
    setPolicyEndDate("");
    setStornoDate("");
    setContractNumber("");
    setContractNumberLiveCheck({ status: "idle" });

    setComfortGradual(false);
    setComfortPaymentText("");
    setComfortTargetAmountText("");

    setAutoCarMake("");
    setAutoCarPlate("");
    setAutoCarVin("");
    setAutoCarTp("");
    setAutoCarOrv("");
    setAutoCarAnnualMileage("");
    setAutoCarAllianzScope("");
    setAutoCarLiabilityLimit(null);
    setAutoCarHullSumInsured(null);
    setAutoCarHullSumInsuredText("");
    setAutoCarHullSumInsuredDraft("");
    setAutoCarHullDeductible(null);
    setAutoCarHullDeductibleText("");
    setAutoCarHullRiskAccident(false);
    setAutoCarHullRiskTheft(false);
    setAutoCarHullRiskNatural(false);
    setAutoCarHullRiskVandalism(false);
    setAutoCarHullRiskAnimalCollision(false);
    setAutoCarAssistancePlan("");
    setAutoCarAddonEso(false);
    setAutoCarAddonNaturalRisks(false);
    setAutoCarAddonKlika(false);
    setAutoCarAddonGlass(false);
    setAutoCarAddonGlassLimit(null);
    setAutoCarAddonAnimalCollision(false);
    setAutoCarAddonAnimalCollisionLimit(null);
    setAutoCarAddonAnimalDamage(false);
    setAutoCarAddonAnimalDamageLimit(null);
    setAutoCarAddonVandalism(false);
    setAutoCarAddonTheft(false);
    setAutoCarAddonTheftLimit(null);
    setAutoCarAddonNatural(false);
    setAutoCarAddonNaturalLimit(null);
    setAutoCarAddonOwnDamage(false);
    setAutoCarAddonOwnDamageLimit(null);
    setAutoCarAddonGap(false);
    setAutoCarAddonGapLimit(null);
    setAutoCarAddonSmartGap(false);
    setAutoCarAddonServisPro(false);
    setAutoCarAddonFireExplosion(false);
    setAutoCarAddonLegalAdvice(false);
    setAutoCarAddonReplacementCar(false);
    setAutoCarAddonLuggage(false);
    setAutoCarAddonTransportedGoods(false);
    setAutoCarAddonPothole(false);
    setAutoCarAddonNonFaultAccident(false);
    setAutoCarAddonPassengerInjury(false);
    setAutoCarAddonKeyLossTheft(false);

    setDomexAddress("");
    setDomexPropertyType("");
    setDomexPropertyCoverage("");
    setDomexPropertySumInsured(null);
    setDomexPropertyDeductible(null);
    setDomexHouseholdType("");
    setDomexHouseholdCoverage("");
    setDomexHouseholdSumInsured(null);
    setDomexHouseholdDeductible(null);
    setDomexOutbuildingSumInsured(null);
    setDomexLiabilitySumInsured(null);
    setDomexLiabilityDeductible(null);
    setDomexLiabilityMobile(false);
    setDomexLiabilityTenant(false);
    setDomexLiabilityLandlord(false);
    setDomexAssistancePlus(false);
    setDomexNote("");

    setNeonPdfDetailFields(createEmptyNeonPdfDetailFields());
    setRefreshOriginalOpen(false);
    setRefreshOriginalContractNumber("");
    setRefreshOriginalMissingInSystem(false);
    setRefreshOriginalPdfLookupNumber(null);
    setRefreshOriginalLookup({
      status: "idle",
      progress: 0,
      adviserName: null,
      original: null,
    });

    setPdfClientNameLoaded(false);
    setPdfMatchedClientName(false);
    setStatementClientNamePrefillActive(false);
    setPdfImportStatus(null);
    setPdfImportError(null);
    setImportedContractPdfFile(null);
    resetPdfDropState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setTipContractConfig(null);
    setTipContractModalOpen(false);
    setTipContractDraftEmail("");
    setTipContractDraftPercent(50);
    setTipContractLookupState({ status: "idle" });
    setTipContractSelectedUser(null);
    setTipContractUserSuggestions([]);
    setTipContractSelectedTip(null);
    setTipContractTips([]);
    setTipContractTipsModalOpen(false);
    setTipContractTipsError(null);
    setTipContractTipsFilter("all");

    setItems([]);
    setTotal(0);
    setUnsupported(false);
    setValidationError(null);
    setMissingFields([]);
    setDuplicateModal(null);
    setEndorsementDraft(null);
    setEndorsementDraftModalOpen(false);
    setEndorsementWorkflowActive(false);
    setEndorsementDurationManualOverride(false);
    setEndorsementPreviewSource(null);
  };

  const endorsementDuplicateCandidateActive =
    !originalReplacementWorkflowActive &&
    !endorsementWorkflowActive &&
    !endorsementDraft &&
    isLifeProduct &&
    contractNumberLiveCheck.status === "foundForEndorsement" &&
    endorsementPreviewSource?.productKey === product;
  const endorsementPreviewContextActive =
    endorsementWorkflowActive || endorsementDuplicateCandidateActive;

  const endorsementOriginalDurationYears =
    endorsementPreviewContextActive && shouldShowDuration(product)
      ? resolveRemainingEndorsementDurationYears(
          endorsementPreviewSource,
          product,
          policyStartDate.trim()
        )
      : null;
  const endorsementOriginalDurationMonths =
    endorsementPreviewContextActive && shouldShowDurationMonths(product)
      ? resolveRemainingEndorsementDurationMonths(
          endorsementPreviewSource,
          product,
          policyStartDate.trim()
        )
      : null;
  const endorsementOriginalDurationLabel =
    endorsementOriginalDurationYears != null
      ? `Zbývá ${durationYearsLabel(endorsementOriginalDurationYears)}`
      : endorsementOriginalDurationMonths != null
        ? `Zbývá ${endorsementOriginalDurationMonths} měsíců`
        : null;
  const endorsementUsesOriginalDuration =
    endorsementPreviewContextActive &&
    Boolean(endorsementPreviewSource) &&
    !endorsementDurationManualOverride &&
    Boolean(endorsementOriginalDurationLabel);
  const effectiveEndorsementDurationYears =
    endorsementUsesOriginalDuration && endorsementOriginalDurationYears != null
      ? endorsementOriginalDurationYears
      : durationYears ?? null;
  const effectiveEndorsementDurationMonths =
    endorsementUsesOriginalDuration && endorsementOriginalDurationMonths != null
      ? endorsementOriginalDurationMonths
      : durationMonths ?? null;

  const handleUseOriginalEndorsementDuration = () => {
    if (!endorsementPreviewSource) return;
    const sourceDurationYears = resolveRemainingEndorsementDurationYears(
      endorsementPreviewSource,
      product,
      policyStartDate.trim()
    );
    const sourceDurationMonths = resolveRemainingEndorsementDurationMonths(
      endorsementPreviewSource,
      product,
      policyStartDate.trim()
    );
    setEndorsementDurationManualOverride(false);
    if (shouldShowDuration(product) && sourceDurationYears != null) {
      setDurationYears(normalizedDurationYears(product, sourceDurationYears));
    }
    if (shouldShowDurationMonths(product) && sourceDurationMonths != null) {
      setDurationMonths(normalizedDurationMonths(product, sourceDurationMonths));
    }
  };

  useEffect(() => {
    if (!endorsementPreviewContextActive) {
      if (endorsementDurationManualOverride) {
        setEndorsementDurationManualOverride(false);
      }
      return;
    }
    if (endorsementDurationManualOverride || !endorsementPreviewSource) return;

    const sourceDurationYears = resolveRemainingEndorsementDurationYears(
      endorsementPreviewSource,
      product,
      policyStartDate.trim()
    );
    const sourceDurationMonths = resolveRemainingEndorsementDurationMonths(
      endorsementPreviewSource,
      product,
      policyStartDate.trim()
    );

    if (shouldShowDuration(product) && sourceDurationYears != null) {
      setDurationYears(normalizedDurationYears(product, sourceDurationYears));
    }
    if (shouldShowDurationMonths(product) && sourceDurationMonths != null) {
      setDurationMonths(normalizedDurationMonths(product, sourceDurationMonths));
    }
  }, [
    endorsementDurationManualOverride,
    endorsementPreviewSource,
    endorsementPreviewContextActive,
    policyStartDate,
    product,
  ]);

  useEffect(() => {
    if (!endorsementDraft) return;
    const currentPremiumAmount = parseNumber(amountText);
    const draftNoLongerMatches =
      !isLifeProduct ||
      endorsementDraft.productKey !== product ||
      endorsementDraft.contractNumber !== contractNumber.trim() ||
      endorsementDraft.contractSignedDate !== contractSignedDate.trim() ||
      endorsementDraft.position !== position ||
      endorsementDraft.commissionMode !== mode ||
      endorsementDraft.durationYears !== effectiveEndorsementDurationYears ||
      endorsementDraft.durationMonths !== effectiveEndorsementDurationMonths ||
      Math.abs(currentPremiumAmount - endorsementDraft.newPremiumAmount) > 0.01;

    if (draftNoLongerMatches) {
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      setSaveMessage("Formulář změny se upravil. Klikni na Změna znovu.");
    }
  }, [
    amountText,
    contractNumber,
    contractSignedDate,
    durationMonths,
    durationYears,
    effectiveEndorsementDurationMonths,
    effectiveEndorsementDurationYears,
    endorsementDraft,
    isLifeProduct,
    mode,
    position,
    product,
  ]);

  const resolveEndorsementPositionForSignedDate = (
    signedDateIso: string
  ): Position | null => {
    if (effectivePositionTimelineLoading) {
      const msg = isSavingForSubordinate
        ? "Načítám kariérní historii vybraného poradce. Zkus změnu připravit za chvíli."
        : "Načítám kariérní historii. Zkus změnu připravit za chvíli.";
      setSaveMessage(msg);
      setValidationError(msg);
      return null;
    }

    if (effectivePositionTimeline.length === 0) {
      const msg = isSavingForSubordinate
        ? `Vybraný poradce ${selectedSaveOwnerLabel} nemá vyplněnou kariérní historii. Bez timeline nejde změnu připravit.`
        : "Bez nastavené timeline kariéry nejde změnu připravit. Doplň ji prosím v Nastavení.";
      setSaveMessage(msg);
      setValidationError(msg);
      return null;
    }

    if (signedDateIso && !isIsoDay(signedDateIso)) {
      const msg = "Datum sjednání změny má neplatný formát.";
      setSaveMessage(msg);
      setValidationError(msg);
      return null;
    }

    if (!signedDateIso) {
      return (
        timelineMatchedPosition?.position ??
        resolveCurrentPositionTimelineRow(effectivePositionTimeline)?.position ??
        position
      );
    }

    const match = resolvePositionTimelineMatch(signedDateIso, effectivePositionTimeline);
    if (!match) {
      const msg = isSavingForSubordinate
        ? `Pro datum sjednání ${formatIsoDay(
            signedDateIso
          )} nemá vybraný poradce ${selectedSaveOwnerLabel} v timeline nastavenou pozici.`
        : `Pro datum sjednání ${formatIsoDay(
            signedDateIso
          )} nemáš v timeline nastavenou pozici.`;
      setSaveMessage(msg);
      setValidationError(msg);
      return null;
    }

    setTimelineMatchedPosition({
      position: match.position,
      validFrom: match.validFrom,
      validTo: match.validTo,
    });
    setPosition((prev) => (prev === match.position ? prev : match.position));
    return match.position;
  };

  const handlePrepareEndorsement = useEndorsementPreparation({
    user,
    hasSelectedProduct,
    product,
    effectiveSaveOwnerEmail,
    tipsterModeEnabled,
    contractNumber,
    contractSignedDate,
    policyStartDate,
    amountText,
    durationYears,
    durationMonths,
    endorsementDurationManualOverride,
    mode,
    frequency,
    maxCizinKomplexVariant,
    comfortPaymentText,
    comfortGradual,
    comfortTargetAmountText,
    isSavingForSubordinate,
    resolveEndorsementPositionForSignedDate,
    setEndorsementWorkflowActive,
    setEndorsementPreviewSource,
    setEndorsementDraft,
    setEndorsementDraftModalOpen,
    setDurationYears,
    setDurationMonths,
    setValidationError,
    setSaveMessage,
    setMissingFields,
  });

  const saveContractEntry = useContractSave();

  const handleSaveEndorsement = async () => {
    if (!user || !endorsementDraft) return;
    const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user.email);
    if (!targetOwnerEmail) {
      setValidationError("Chybí cílový vlastník smlouvy.");
      return;
    }

    if (tipsterModeEnabled) {
      setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
      return;
    }

    const missing: string[] = [];
    if (!clientName.trim()) missing.push("jméno klienta");
    if (!contractNumber.trim()) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (!policyStartDate.trim()) missing.push("datum počátku");
    if (product === "maximaMaxEfekt" && endorsementDraft.durationYears == null) {
      missing.push("dobu trvání smlouvy");
    }

    if (missing.length > 0) {
      const msg = `Doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
      return;
    }
    if (!validateContractDatesBeforeSave()) return;
    if (
      !validateProductCoefficientPeriodBeforeSave(
        product,
        contractSignedDate.trim()
      )
    ) {
      return;
    }
    if (!validateTimelineBeforeSave()) return;

    const trimmedContractNumber = contractNumber.trim();
    if (endorsementDraft.productKey !== product) {
      setValidationError(
        "Produkt se od otevření okna změnil. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      return;
    }

    if (trimmedContractNumber !== endorsementDraft.contractNumber) {
      setValidationError(
        "Číslo smlouvy se od otevření okna změnilo. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      return;
    }

    if (contractSignedDate.trim() !== endorsementDraft.contractSignedDate) {
      setValidationError(
        "Datum sjednání se od přípravy změny změnilo. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      return;
    }

    const currentPremiumAmount = parseNumber(amountText);
    if (Math.abs(currentPremiumAmount - endorsementDraft.newPremiumAmount) > 0.01) {
      setValidationError(
        "Částka se od otevření okna změnila. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      return;
    }

    if (
      position !== endorsementDraft.position ||
      mode !== endorsementDraft.commissionMode ||
      effectiveEndorsementDurationYears !== endorsementDraft.durationYears ||
      effectiveEndorsementDurationMonths !== endorsementDraft.durationMonths
    ) {
      setValidationError(
        "Parametry výpočtu se od přípravy změny změnily. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      return;
    }

    setSavingIncludesPdfAttachment(Boolean(importedContractPdfFile));
    setSaving(true);
    setSaveMessage(null);
    setValidationError(null);
    setMissingFields([]);
    setLastSavedContractRef(null);

    try {
      if (!isSavingForSubordinate) {
        const signedDateIso = contractSignedDate.trim() || null;
        let mgrEmail = managerEmailSnapshot;
        let mgrPos = managerPositionSnapshot;
        let mgrMode = managerModeSnapshot;
        let managerChainForSave: ManagerChainSnapshotEntry[] = managerChainSnapshot;
        try {
          const snapshot = await requestManagerSnapshotWithAuth({
            user,
            signedDateIso,
          });
          mgrEmail = snapshot.managerEmail ?? mgrEmail ?? null;
          mgrPos = snapshot.managerPosition ?? mgrPos ?? null;
          mgrMode = snapshot.managerMode ?? mgrMode ?? null;
          if (snapshot.managerChain.length > 0) {
            managerChainForSave = snapshot.managerChain;
          }
        } catch (snapshotErr) {
          console.error("Failed to snapshot manager info", snapshotErr);
        }

        managerChainForSave = ensureManagerChainWithDirectManager(
          managerChainForSave,
          mgrEmail,
          mgrPos ?? null,
          mgrMode ?? null
        );

        if (!hasResolvedTopManagerPosition(managerChainForSave, mgrEmail)) {
          const msg =
            "Nepodařilo se načíst pozici nadřízeného. Dodatek teď neuložím, aby nechyběla meziprovize.";
          setValidationError(msg);
          setSaveMessage(msg);
          return;
        }
      }

      const endorsementEntryPayload = {
        productKey: endorsementDraft.productKey,
        entryType: "endorsement" as ContractEntryType,
        commissionMode: endorsementDraft.commissionMode,
        rootContractEntryId: endorsementDraft.rootContractEntryId,
        parentContractEntryId: endorsementDraft.sourceEntryId,
        parentContractEntryPath: endorsementDraft.sourceEntryPath,
        inputAmount: endorsementDraft.calculationAmount,
        calculationInputAmount: endorsementDraft.calculationAmount,
        previousInputAmount: endorsementDraft.previousPremiumAmount,
        newInputAmount: endorsementDraft.newPremiumAmount,
        effectiveInputAmount: endorsementDraft.newPremiumAmount,
        premiumDelta: endorsementDraft.deltaAmount,
        premiumIncreaseAmount:
          endorsementDraft.deltaAmount > 0 ? endorsementDraft.deltaAmount : 0,
        premiumDecreaseAmount:
          endorsementDraft.deltaAmount < 0 ? Math.abs(endorsementDraft.deltaAmount) : 0,
        changeType: endorsementDraft.changeType,
        frequencyRaw: frequency,
        clientName: clientName || null,
        contractSignedDate: contractSignedDate.trim(),
        policyStartDate: policyStartDate.trim(),
        policyEndDate: policyEndDate.trim() || null,
        durationYears: shouldShowDuration(endorsementDraft.productKey)
          ? endorsementDraft.durationYears
          : null,
        durationMonths: shouldShowDurationMonths(endorsementDraft.productKey)
          ? normalizedDurationMonths(
              endorsementDraft.productKey,
              endorsementDraft.durationMonths
            )
          : null,
        maxCizinKomplexVariant:
          endorsementDraft.productKey === "maxcizinkomplex"
            ? maxCizinKomplexVariant
            : null,
        contractNumber: endorsementDraft.contractNumber,
      };

      const saved = await saveContractEntry({
        user,
        ownerEmail: targetOwnerEmail,
        entry: endorsementEntryPayload,
        fallbackError: "Uložení dodatku selhalo.",
        pdfFile: importedContractPdfFile,
      });
      if (!saved.ok) {
        setSaveMessage(saved.error);
        return;
      }

      const createdEntryId = saved.entryId;
      const ownerEmail = targetOwnerEmail;
      setLastSavedContractRef({
        ownerEmail,
        entryId: createdEntryId,
      });

      let pdfAttachmentMessage = "";
      if (saved.pdfAttachment.status === "uploaded") {
        pdfAttachmentMessage = " PDF bylo přiloženo k detailu dodatku.";
        setPdfImportStatus("PDF bylo bezpečně přiloženo k uloženému dodatku.");
        setPdfImportError(null);
        setImportedContractPdfFile(null);
      } else if (saved.pdfAttachment.status === "failed") {
        pdfAttachmentMessage = ` PDF se nepodařilo přiložit: ${saved.pdfAttachment.message}`;
        setPdfImportError(`PDF se nepodařilo přiložit: ${saved.pdfAttachment.message}`);
      }

      const savedMessage =
        endorsementDraft.changeType === "increase"
          ? "Dodatek byl uložen mezi sepsané."
          : "Dodatek (ponížení) byl uložen. Provize je zatím 0 Kč.";
      setSaveMessage(`${savedMessage}${pdfAttachmentMessage}`);
      setSaveSuccessFlash({
        contractNumber: endorsementDraft.contractNumber,
        clientName: clientName.trim() || null,
      });
      setContractSaveCelebrationKey((prev) => prev + 1);
      setEndorsementDraft(null);
      setEndorsementDraftModalOpen(false);
      setEndorsementWorkflowActive(false);
      setEndorsementDurationManualOverride(false);
      setEndorsementPreviewSource(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "Nepodařilo se uložit dodatek. Zkus to prosím za chvíli znovu.";
      console.error("Chyba při ukládání dodatku:", errorMessage);
      setSaveMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCppA101ToStatementQueue = () => {
    if (
      (product !== "cppAuto" && product !== "domex") ||
      !statementEmbedMode ||
      !statementEmbedParentAvailable ||
      !statementCppA101QueueEligible
    ) {
      return;
    }

    const value = parseNumber(amountText);
    const missing: string[] = [];
    if (value <= 0) missing.push("částku");
    if (!clientName.trim()) missing.push("jméno klienta");
    if (!contractNumber.trim()) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (!policyStartDate.trim()) missing.push("datum počátku");
    if (missing.length > 0) {
      const message = `Doplň: ${missing.join(", ")}.`;
      setSaveMessage(message);
      setValidationError(message);
      setMissingFields(missing);
      return;
    }
    if (contractDateErrors.length > 0) {
      const message = `Zkontroluj datumy: ${contractDateErrors
        .map((issue) => issue.message)
        .join(" ")}`;
      setSaveMessage(message);
      setValidationError(message);
      return;
    }

    const trimmedStornoDate = stornoDate.trim();
    if (trimmedStornoDate && !parseIsoDayAsLocalDate(trimmedStornoDate)) {
      const message = "Datum storna má neplatný formát.";
      setSaveMessage(message);
      setValidationError(message);
      return;
    }

    notifyStatementParentCppA101QueueAdd({
      product,
      contractNumber: contractNumber.trim(),
      clientName: clientName.trim(),
      contractSignedDate: contractSignedDate.trim(),
      policyStartDate: policyStartDate.trim(),
      amountText: amountText.trim(),
      frequency,
      stornoDate: trimmedStornoDate,
      pdfFile: importedContractPdfFile,
    });
    setMissingFields([]);
    setValidationError(null);
    setSaveMessage("Smlouva byla přidána do fronty. Na výpisu ji pak nahraješ hromadně.");
  };

  const handleSaveContract = async (skipDuplicateCheck = false) => {
    if (endorsementDraft) {
      await handleSaveEndorsement();
      return;
    }

    if (endorsementWorkflowActive || endorsementDuplicateCandidateActive) {
      const msg = "Nejdřív klikni na Změna a připrav aktuální dodatek.";
      setSaveMessage(msg);
      setValidationError(msg);
      return;
    }

    if (!user) return;
    const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user.email);
    if (!targetOwnerEmail) {
      setValidationError("Chybí cílový vlastník smlouvy.");
      return;
    }

    if (tipsterModeEnabled) {
      setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
      return;
    }

    if (!hasSelectedProduct) {
      const msg = "Nejdřív vyber produkt.";
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields(["produkt"]);
      return;
    }

    const value = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);
    const comfortTargetAmount = parseNumber(comfortTargetAmountText);
    const missing: string[] = [];
    if (value <= 0) missing.push("částku");
    if (!clientName.trim()) missing.push("jméno klienta");
    if (!contractNumber.trim()) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (!policyStartDate.trim()) missing.push("datum počátku");
    if (product === "comfortcc" && comfortGradual && comfortPayment <= 0) {
      missing.push("pravidelnou platbu");
    }
    if (product === "maximaMaxEfekt" && durationYears == null) {
      missing.push("dobu trvání smlouvy");
    }
    if (
      product === "maxcizinkomplex" &&
      (durationMonths == null || normalizedDurationMonths(product, durationMonths) <= 0)
    ) {
      missing.push("dobu trvání v měsících");
    }
    if (autoHullSumNeedsInput) {
      missing.push("havarijní pojistnou částku");
    }
    const trimmedContractNumber = contractNumber.trim();
    const trimmedClientName = clientName.trim();
    const signedDateIsoDay = contractSignedDate.trim();
    const shouldReplaceOriginalContract = originalReplacementWorkflowActive;
    const isRefreshWithoutOriginalInSystem =
      shouldReplaceOriginalContract &&
      product === "neon" &&
      refreshOriginalMissingInSystem;
    const trimmedRefreshOriginalContractNumber = refreshOriginalContractNumber.trim();
    if (
      shouldReplaceOriginalContract &&
      !isRefreshWithoutOriginalInSystem &&
      !trimmedRefreshOriginalContractNumber
    ) {
      missing.push("číslo původní smlouvy");
    }

    if (missing.length > 0 || items.length === 0) {
      const msg =
        items.length === 0 && missing.length === 0
          ? "Doplň částku a produkt, aby šlo uložit."
          : `Doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields(missing);
      return;
    }
    if (autoHullSumInsuredDraftValue != null) {
      commitAutoHullSumDraft();
    }
    if (
      shouldReplaceOriginalContract &&
      product === "neon" &&
      !isRefreshWithoutOriginalInSystem &&
      refreshOriginalLookup.status === "found" &&
      !neonRefreshCommissionBase
    ) {
      const msg =
        "Původní NEON smlouva je nalezená, ale nejde z ní spočítat Refresh základna. Zkontroluj původní pojistné, datum původního sjednání a datum počátku nové smlouvy.";
      setSaveMessage(msg);
      setValidationError(msg);
      return;
    }
    if (!validateContractDatesBeforeSave()) return;
    if (!validateOptionalStornoDateBeforeSave()) return;
    if (!validateProductCoefficientPeriodBeforeSave(product, signedDateIsoDay)) {
      return;
    }
    if (!validateTimelineBeforeSave()) return;

    const neonNumberOrNull = (valueText: string) => {
      const trimmed = valueText.trim();
      if (!trimmed) return null;
      const value = parseNumber(trimmed);
      return value > 0 ? Math.round(value) : null;
    };
    const neonDetailForSave =
      product === "neon"
        ? {
            version: neonPdfDetailFields.version.trim() || null,
            deathType: neonPdfDetailFields.deathType.trim() || null,
            deathAmount: neonNumberOrNull(neonPdfDetailFields.deathAmount),
            death2Type: neonPdfDetailFields.death2Type.trim() || null,
            death2Amount: neonNumberOrNull(neonPdfDetailFields.death2Amount),
            deathTerminalAmount: neonNumberOrNull(neonPdfDetailFields.deathTerminalAmount),
            waiverInvalidity: neonPdfDetailFields.waiverInvalidity,
            waiverUnemployment: neonPdfDetailFields.waiverUnemployment,
            invalidityAType: neonPdfDetailFields.invalidityAType.trim() || null,
            invalidityA1: neonNumberOrNull(neonPdfDetailFields.invalidityA1),
            invalidityA2: neonNumberOrNull(neonPdfDetailFields.invalidityA2),
            invalidityA3: neonNumberOrNull(neonPdfDetailFields.invalidityA3),
            invalidityBType: neonPdfDetailFields.invalidityBType.trim() || null,
            invalidityB1: neonNumberOrNull(neonPdfDetailFields.invalidityB1),
            invalidityB2: neonNumberOrNull(neonPdfDetailFields.invalidityB2),
            invalidityB3: neonNumberOrNull(neonPdfDetailFields.invalidityB3),
            invalidityPension: neonPdfDetailFields.invalidityPension,
            criticalIllnessType: neonPdfDetailFields.criticalType.trim() || null,
            criticalIllnessVariant: neonPdfDetailFields.criticalVariant.trim() || null,
            criticalIllnessAmount: neonNumberOrNull(neonPdfDetailFields.criticalAmount),
            childSurgeryAmount: neonNumberOrNull(neonPdfDetailFields.childSurgeryAmount),
            vaccinationCompAmount: neonNumberOrNull(neonPdfDetailFields.vaccinationCompAmount),
            accidentDailyBenefit: neonNumberOrNull(neonPdfDetailFields.accidentDailyBenefit),
            diabetesAmount: neonNumberOrNull(neonPdfDetailFields.diabetesAmount),
            deathAccidentAmount: neonNumberOrNull(neonPdfDetailFields.deathAccidentAmount),
            injuryPermanentAmount: neonNumberOrNull(neonPdfDetailFields.injuryPermanentAmount),
            injuryPermanentFulfillmentFrom:
              neonPdfDetailFields.injuryPermanentFulfillmentFrom.trim() || null,
            injuryPermanentProgression:
              neonPdfDetailFields.injuryPermanentProgression.trim() || null,
            injuryPermanent2Amount: neonNumberOrNull(
              neonPdfDetailFields.injuryPermanent2Amount
            ),
            injuryPermanent2FulfillmentFrom:
              neonPdfDetailFields.injuryPermanent2FulfillmentFrom.trim() || null,
            injuryPermanent2Progression:
              neonPdfDetailFields.injuryPermanent2Progression.trim() || null,
            hospitalizationAmount: null,
            hospitalizationIllnessAmount: neonNumberOrNull(
              neonPdfDetailFields.hospitalizationIllnessAmount
            ),
            hospitalizationInjuryAmount: neonNumberOrNull(
              neonPdfDetailFields.hospitalizationInjuryAmount
            ),
            accidentDailyBenefitStart:
              neonPdfDetailFields.accidentDailyBenefitStart.trim() || null,
            accidentDailyBenefitBackpay:
              neonPdfDetailFields.accidentDailyBenefitBackpay.trim() || null,
            workIncapacityStart: neonPdfDetailFields.workIncapacityStart.trim() || null,
            workIncapacityBackpay: neonPdfDetailFields.workIncapacityBackpay.trim() || null,
            workIncapacityAmount: neonNumberOrNull(neonPdfDetailFields.workIncapacityAmount),
            workIncapacityInjury: neonPdfDetailFields.workIncapacityInjury,
            workIncapacityIllness: neonPdfDetailFields.workIncapacityIllness,
            workIncapacity2Start: neonPdfDetailFields.workIncapacity2Start.trim() || null,
            workIncapacity2Backpay:
              neonPdfDetailFields.workIncapacity2Backpay.trim() || null,
            workIncapacity2Amount: neonNumberOrNull(neonPdfDetailFields.workIncapacity2Amount),
            workIncapacity2Injury: neonPdfDetailFields.workIncapacity2Injury,
            workIncapacity2Illness: neonPdfDetailFields.workIncapacity2Illness,
            careDependencyAmount: neonNumberOrNull(neonPdfDetailFields.careDependencyAmount),
            specialAidAmount: neonNumberOrNull(neonPdfDetailFields.specialAidAmount),
            caregivingAmount: neonNumberOrNull(neonPdfDetailFields.caregivingAmount),
            reproductionCostAmount: neonNumberOrNull(
              neonPdfDetailFields.reproductionCostAmount
            ),
            cppHelp: neonPdfDetailFields.cppHelp,
            liabilityCitizenLimit: neonNumberOrNull(neonPdfDetailFields.liabilityCitizenLimit),
            liabilityEmployeeLimit: neonNumberOrNull(
              neonPdfDetailFields.liabilityEmployeeLimit
            ),
            travelInsurance: neonPdfDetailFields.travelInsurance,
            neonPdfRisks: null,
          }
        : null;

    setSavingIncludesPdfAttachment(Boolean(importedContractPdfFile));
    setSaving(true);
    setSaveMessage("Kontroluji duplicity…");
    setValidationError(null);
    setMissingFields([]);
    setLastSavedContractRef(null);

    // kontrola duplicitního čísla smlouvy
    if (!skipDuplicateCheck) {
      try {
        if (trimmedContractNumber) {
          const findParams = new URLSearchParams({
            scope: isSavingForSubordinate ? "team" : "my",
            q: trimmedContractNumber,
          });
          const findPayload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
            user,
            `/api/contracts/find?${findParams.toString()}`,
            { method: "GET" }
          );
          const duplicateContracts = (Array.isArray(findPayload?.contracts)
            ? findPayload.contracts
            : []
          ).filter((item) => {
            const ownerEmail =
              normalizeEmailValue(item.userEmail) || normalizeEmailValue(item.adviserEmail);
            return ownerEmail === targetOwnerEmail;
          });
          if (duplicateContracts.length > 0) {
            const entries = duplicateContracts
              .map((item) => {
                const id = typeof item.id === "string" ? item.id.trim() : "";
                if (!id) return null;
                const ownerEmail =
                  normalizeEmailValue(item.userEmail) ||
                  normalizeEmailValue(item.adviserEmail) ||
                  targetOwnerEmail;
                if (!ownerEmail || ownerEmail !== targetOwnerEmail) return null;
                const existingNumber =
                  typeof item.contractNumber === "string" ? item.contractNumber.trim() : "";
                return {
                  id,
                  ownerEmail,
                  path: entryPathFromContractOwner(ownerEmail, id),
                  contractNumber: existingNumber || trimmedContractNumber,
                };
              })
              .filter(
                (
                  entry
                ): entry is {
                  id: string;
                  ownerEmail: string;
                  path: string;
                  contractNumber: string;
                } =>
                  Boolean(entry)
              );
            if (entries.length > 0) {
              setDuplicateModal({
                mode: "overwrite",
                description: `Smlouva s číslem ${trimmedContractNumber} už existuje (${entries.length}×).`,
                contractNumber: trimmedContractNumber,
                count: entries.length,
                entries,
              });
              setSaving(false);
              return;
            }
          }
        }

        if (!isSavingForSubordinate && product && signedDateIsoDay && trimmedClientName) {
          const precheckParams = new URLSearchParams({
            productKey: product,
            clientName: trimmedClientName,
            signedDate: signedDateIsoDay,
            contractNumber: trimmedContractNumber,
          });
          const precheckPayload = await fetchAuthedJsonOrThrow<ContractsPrecheckApiResponse>(
            user,
            `/api/contracts/precheck?${precheckParams.toString()}`,
            { method: "GET" }
          );
          const similarEntries = Array.isArray(precheckPayload?.similarContracts)
            ? precheckPayload.similarContracts
            : [];

          if (similarEntries.length > 0) {
            const entries = similarEntries
              .map((item) => {
                const id = typeof item.id === "string" ? item.id.trim() : "";
                if (!id) return null;
                const existingNumber =
                  typeof item.contractNumber === "string"
                    ? item.contractNumber.trim()
                    : null;
                const ownerEmail = normalizeEmailValue(item.ownerEmail);
                if (!ownerEmail) return null;
                return {
                  id,
                  ownerEmail,
                  path: entryPathFromContractOwner(ownerEmail, id),
                  contractNumber: existingNumber || null,
                };
              })
              .filter(
                (
                  entry
                ): entry is {
                  id: string;
                  ownerEmail: string;
                  path: string;
                  contractNumber: string | null;
                } =>
                  Boolean(entry)
              );
            if (entries.length > 0) {
              const displayDate = formatIsoDay(signedDateIsoDay);
              setDuplicateModal({
                mode: "saveAnyway",
                description: `Pro klienta ${trimmedClientName} už existuje produkt ${productLabel(
                  product
                )} se stejným datem sjednání ${displayDate} a číslem smlouvy ${trimmedContractNumber} (${similarEntries.length}×).`,
                contractNumber: trimmedContractNumber || null,
                count: entries.length,
                entries,
              });
              setSaving(false);
              return;
            }
          }
        }
      } catch (dupErr) {
        console.warn("Kontrola duplicitních smluv selhala, pokračuji bez ní", dupErr);
      }
    }

    setSaveMessage("Ukládám smlouvu…");

    try {
      if (!isSavingForSubordinate) {
        const signedDateIso = contractSignedDate.trim() || null;

        // Snapshot chainu nadřízených k datu sjednání (timeline) – uložíme k záznamu
        let mgrEmail = managerEmailSnapshot;
        let mgrPos = managerPositionSnapshot;
        let mgrMode = managerModeSnapshot;
        let managerChainForSave: ManagerChainSnapshotEntry[] = managerChainSnapshot;
        try {
          const snapshot = await requestManagerSnapshotWithAuth({
            user,
            signedDateIso,
          });
          mgrEmail = snapshot.managerEmail ?? mgrEmail ?? null;
          mgrPos = snapshot.managerPosition ?? mgrPos ?? null;
          mgrMode = snapshot.managerMode ?? mgrMode ?? null;
          if (snapshot.managerChain.length > 0) {
            managerChainForSave = snapshot.managerChain;
          }
        } catch (snapshotErr) {
          console.error("Failed to snapshot manager info", snapshotErr);
        }

        managerChainForSave = ensureManagerChainWithDirectManager(
          managerChainForSave,
          mgrEmail,
          mgrPos ?? null,
          mgrMode ?? null
        );

        if (!hasResolvedTopManagerPosition(managerChainForSave, mgrEmail)) {
          const msg =
            "Nepodařilo se načíst pozici nadřízeného. Smlouvu teď neuložím, aby nechyběla meziprovize.";
          setValidationError(msg);
          setSaveMessage(msg);
          return;
        }
      }

      const calculationInputAmount =
        shouldReplaceOriginalContract && product === "neon" && !isRefreshWithoutOriginalInSystem
          ? neonRefreshCommissionBase?.calculationMonthlyPremium ?? value
          : value;
      const autoPaidByPolicyStartDate = shouldAutoMarkPaidByPolicyStartDate(
        policyStartDate
      );
      const trimmedStornoDate = stornoDate.trim();

      const contractEntryPayload = {
            productKey: product,
            entryType: "contract" as ContractEntryType,
            commissionMode: canChooseMode ? mode : null,
            inputAmount: product === "comfortcc" ? value : value,
            calculationInputAmount,
            effectiveInputAmount: value,
            comfortPayment:
              product === "comfortcc" && comfortPayment > 0 ? comfortPayment : null,
            comfortGradual: product === "comfortcc" ? comfortGradual : null,
            comfortTargetAmount:
              product === "comfortcc" && comfortGradual && comfortTargetAmount > 0
                ? comfortTargetAmount
                : null,
            frequencyRaw: frequency,
            clientName: clientName || null,
            contractSignedDate: contractSignedDate.trim(),
            policyStartDate: policyStartDate.trim(),
            policyEndDate: policyEndDate.trim() || null,
            status: trimmedStornoDate ? "storno" : "active",
            stornoDate: trimmedStornoDate || null,
            durationYears: shouldShowDuration(product) ? durationYears : null,
            durationMonths:
              shouldShowDurationMonths(product) ? normalizedDurationMonths(product, durationMonths) : null,
            maxCizinKomplexVariant:
              product === "maxcizinkomplex" ? maxCizinKomplexVariant : null,
            contractNumber: trimmedContractNumber || null,
            tipContractTipsterEmail: tipContractConfig?.tipsterEmail ?? null,
            tipContractTipsterPercent: tipContractConfig?.tipsterPercent ?? null,
            tipContractSourceTipId: tipContractConfig?.sourceTipId ?? null,
            tipContractSourceTipTitle: tipContractConfig?.sourceTipTitle ?? null,
            tipContractSourceTipProductLabel: tipContractConfig?.sourceTipProductLabel ?? null,
            tipContractSourceTipClientName: tipContractConfig?.sourceTipClientName ?? null,
            tipContractSourceTipCreatedAtMs: tipContractConfig?.sourceTipCreatedAtMs ?? null,
            carMake:
              product === "cppAuto" ||
              isSlaviaAutoDetailProduct(product) ||
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarMake.trim() || null
                : null,
            carPlate:
              product === "cppAuto" ||
              isSlaviaAutoDetailProduct(product) ||
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarPlate.trim() || null
                : null,
            carVin:
              product === "cppAuto" ||
              isSlaviaAutoDetailProduct(product) ||
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarVin.trim() || null
                : null,
            carTp:
              isSlaviaAutoDetailProduct(product) || isUniqaAutoDetailProduct(product)
                ? autoCarTp.trim() || null
                : null,
            carOrv:
              product === "cppAuto" ||
              isSlaviaAutoDetailProduct(product) ||
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarOrv.trim() || null
                : null,
            carAnnualMileage:
              product === "allianzAuto" || product === "pillowAuto"
                ? autoCarAnnualMileage.trim() || null
                : null,
            carAllianzScope:
              product === "allianzAuto" ? autoCarAllianzScope.trim() || null : null,
            carLiabilityLimit:
              product === "cppAuto" ||
              isSlaviaAutoDetailProduct(product) ||
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarLiabilityLimit
                : null,
            carHullSumInsured:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto" ||
              product === "csobAuto"
                ? autoHullSumInsuredForSave
                : null,
            carHullSumInsuredText:
              product === "allianzAuto" || product === "pillowAuto"
                ? autoCarHullSumInsuredText.trim() || null
                : null,
            carHullDeductible:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarHullDeductible
                : null,
            carHullDeductibleText:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarHullDeductibleText.trim() || null
                : null,
            carHullRiskAccident:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskAccident
                : null,
            carHullRiskTheft:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskTheft
                : null,
            carHullRiskNatural:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskNatural
                : null,
            carHullRiskVandalism:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskVandalism
                : null,
            carHullRiskAnimalCollision:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskAnimalCollision
                : null,
            carAssistancePlan:
              isKooperativaAutoDetailProduct(product) ||
              isUniqaAutoDetailProduct(product) ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarAssistancePlan.trim() || null
                : null,
            carAddonEso: isAutoProduct(product) ? autoCarAddonEso : null,
            carAddonNaturalRisks: isAutoProduct(product) ? autoCarAddonNaturalRisks : null,
            carAddonKlika: isAutoProduct(product) ? autoCarAddonKlika : null,
            carAddonGlass: isAutoProduct(product) ? autoCarAddonGlass : null,
            carAddonGlassLimit: isAutoProduct(product)
              ? autoCarAddonGlass
                ? autoCarAddonGlassLimit
                : null
              : null,
            carAddonAnimalCollision: isAutoProduct(product)
              ? autoCarAddonAnimalCollision
              : null,
            carAddonAnimalCollisionLimit: isAutoProduct(product)
              ? autoCarAddonAnimalCollision
                ? autoCarAddonAnimalCollisionLimit
                : null
              : null,
            carAddonAnimalDamage: isAutoProduct(product) ? autoCarAddonAnimalDamage : null,
            carAddonAnimalDamageLimit: isAutoProduct(product)
              ? autoCarAddonAnimalDamage
                ? autoCarAddonAnimalDamageLimit
                : null
              : null,
            carAddonVandalism: isAutoProduct(product) ? autoCarAddonVandalism : null,
            carAddonTheft: isAutoProduct(product) ? autoCarAddonTheft : null,
            carAddonTheftLimit: isAutoProduct(product)
              ? autoCarAddonTheft
                ? autoCarAddonTheftLimit
                : null
              : null,
            carAddonNatural: isAutoProduct(product) ? autoCarAddonNatural : null,
            carAddonNaturalLimit: isAutoProduct(product)
              ? autoCarAddonNatural
                ? autoCarAddonNaturalLimit
                : null
              : null,
            carAddonOwnDamage: isAutoProduct(product) ? autoCarAddonOwnDamage : null,
            carAddonOwnDamageLimit: isAutoProduct(product)
              ? autoCarAddonOwnDamage
                ? autoCarAddonOwnDamageLimit
                : null
              : null,
            carAddonGap: isAutoProduct(product) ? autoCarAddonGap : null,
            carAddonGapLimit: isAutoProduct(product)
              ? autoCarAddonGap
                ? autoCarAddonGapLimit
                : null
              : null,
            carAddonSmartGap: isAutoProduct(product) ? autoCarAddonSmartGap : null,
            carAddonServisPro: isAutoProduct(product) ? autoCarAddonServisPro : null,
            carAddonFireExplosion: isAutoProduct(product)
              ? autoCarAddonFireExplosion
              : null,
            carAddonLegalAdvice: isAutoProduct(product) ? autoCarAddonLegalAdvice : null,
            carAddonReplacementCar: isAutoProduct(product)
              ? autoCarAddonReplacementCar
              : null,
            carAddonLuggage: isAutoProduct(product) ? autoCarAddonLuggage : null,
            carAddonTransportedGoods: isAutoProduct(product)
              ? autoCarAddonTransportedGoods
              : null,
            carAddonPothole: isAutoProduct(product) ? autoCarAddonPothole : null,
            carAddonNonFaultAccident: isAutoProduct(product)
              ? autoCarAddonNonFaultAccident
              : null,
            carAddonPassengerInjury: isAutoProduct(product)
              ? autoCarAddonPassengerInjury
              : null,
            carAddonKeyLossTheft: isAutoProduct(product) ? autoCarAddonKeyLossTheft : null,
            neonDetail: neonDetailForSave,
            domexDetail:
              product === "domex"
                ? {
                    address: domexAddress.trim() || null,
                    propertyType: domexPropertyType.trim() || null,
                    propertyCoverage: domexPropertyCoverage.trim() || null,
                    sumInsured: domexPropertySumInsured,
                    deductible: domexPropertyDeductible,
                    householdType: domexHouseholdType.trim() || null,
                    householdCoverage: domexHouseholdCoverage.trim() || null,
                    householdSumInsured: domexHouseholdSumInsured,
                    householdDeductible: domexHouseholdDeductible,
                    outbuildingSumInsured: domexOutbuildingSumInsured,
                    liabilitySumInsured: domexLiabilitySumInsured,
                    liabilityDeductible: domexLiabilityDeductible,
                    liabilityMobile: domexLiabilityMobile ? true : null,
                    liabilityTenant: domexLiabilityTenant ? true : null,
                    liabilityLandlord: domexLiabilityLandlord ? true : null,
                    assistancePlus: domexAssistancePlus ? true : null,
                    note: domexNote.trim() || null,
                  }
                : null,
            maxdomovDetail:
              product === "maxdomov"
                ? {
                    address: domexAddress.trim() || null,
                    propertyType: domexPropertyType.trim() || null,
                    propertyCoverage: domexPropertyCoverage.trim() || null,
                    sumInsured: domexPropertySumInsured,
                    deductible: domexPropertyDeductible,
                    householdType: domexHouseholdType.trim() || null,
                    householdCoverage: domexHouseholdCoverage.trim() || null,
                    householdSumInsured: domexHouseholdSumInsured,
                    householdDeductible: domexHouseholdDeductible,
                    outbuildingSumInsured: domexOutbuildingSumInsured,
                    liabilitySumInsured: domexLiabilitySumInsured,
                    liabilityDeductible: domexLiabilityDeductible,
                    liabilityMobile: domexLiabilityMobile ? true : null,
                    liabilityTenant: domexLiabilityTenant ? true : null,
                    liabilityLandlord: domexLiabilityLandlord ? true : null,
                    assistancePlus: domexAssistancePlus ? true : null,
                    note: domexNote.trim() || null,
                  }
                : null,
            paid: autoPaidByPolicyStartDate,
            isRefresh: shouldReplaceOriginalContract,
            refreshOriginalMissingInSystem: isRefreshWithoutOriginalInSystem,
            requiresStatementRefresh: isRefreshWithoutOriginalInSystem,
            commissionCalculationStatus: isRefreshWithoutOriginalInSystem
              ? "provisional_refresh_missing_original"
              : null,
            commissionBaseSource: isRefreshWithoutOriginalInSystem
              ? "calculator_provisional"
              : null,
            premiumUpdatedFromStatementAtMs: statementPremiumSource?.capturedAtMs ?? null,
            premiumUpdatedFromStatementChronologyMs:
              statementPremiumSource?.statementChronologyMs ?? null,
            premiumUpdatedFromStatementId: statementPremiumSource?.statementId ?? null,
            createdFromCommissionStatement: Boolean(statementPremiumSource),
            createdFromCommissionStatementAtMs: statementPremiumSource?.capturedAtMs ?? null,
            createdFromCommissionStatementChronologyMs:
              statementPremiumSource?.statementChronologyMs ?? null,
            createdFromCommissionStatementId: statementPremiumSource?.statementId ?? null,
            refreshOriginalContractNumber: shouldReplaceOriginalContract
              ? isRefreshWithoutOriginalInSystem
                ? null
                : trimmedRefreshOriginalContractNumber
              : null,
      };

      const saved = await saveContractEntry({
        user,
        ownerEmail: targetOwnerEmail,
        entry: contractEntryPayload,
        fallbackError: "Uložení smlouvy selhalo.",
        pdfFile: importedContractPdfFile,
      });
      if (!saved.ok) {
        setSaveMessage(saved.error);
        return;
      }

      const createdEntryId = saved.entryId;
      const linkedRefreshOriginalEntryId = saved.linkedRefreshOriginalEntryId;
      const ownerEmail = targetOwnerEmail;
      setLastSavedContractRef({
        ownerEmail,
        entryId: createdEntryId,
      });
      notifyStatementParentContractSaved({
        contractNumber: trimmedContractNumber,
        clientName: trimmedClientName,
        product,
        ownerEmail,
        entryId: createdEntryId,
      });

      let pdfAttachmentMessage = "";
      let pdfAttachmentFailed = false;
      if (saved.pdfAttachment.status === "uploaded") {
        pdfAttachmentMessage = " PDF bylo přiloženo k detailu smlouvy.";
        setPdfImportStatus("PDF bylo bezpečně přiloženo k uložené smlouvě.");
        setPdfImportError(null);
        setImportedContractPdfFile(null);
      } else if (saved.pdfAttachment.status === "failed") {
        pdfAttachmentMessage = ` PDF se nepodařilo přiložit: ${saved.pdfAttachment.message}`;
        pdfAttachmentFailed = true;
        setPdfImportError(`PDF se nepodařilo přiložit: ${saved.pdfAttachment.message}`);
      }

      const linkedRefreshOriginal = Boolean(linkedRefreshOriginalEntryId);
      const originalReplacementStornoDescription =
        product === "cppAuto" || product === "allianzAuto"
          ? "jeden den před počátkem nové smlouvy"
          : "ke dni počátku";
      const savedMessage = isRefreshWithoutOriginalInSystem
        ? "Smlouva byla uložena jako REFRESH bez původní smlouvy v systému. Výpočet provize je orientační a musí se sladit podle provizního výpisu."
        : shouldReplaceOriginalContract
          ? linkedRefreshOriginal
            ? `Smlouva byla uložena jako ${originalReplacementLabel(product)} a původní smlouva byla stornována ${originalReplacementStornoDescription}.`
            : `Smlouva byla uložena jako ${originalReplacementLabel(product)}. Původní smlouva nebyla v systému nalezena, takže se automaticky nestornovala.`
          : "Smlouva byla uložena mezi sepsané.";
      setSaveMessage(`${savedMessage}${pdfAttachmentMessage}`);
      setSaveSuccessFlash({
        contractNumber: contractNumber.trim() || null,
        clientName: clientName.trim() || null,
      });
      setContractSaveCelebrationKey((prev) => prev + 1);
      if (!pdfAttachmentFailed) {
        notifyStatementParentContractSaveCompleted({
          contractNumber: trimmedContractNumber,
          clientName: trimmedClientName,
          product,
          ownerEmail,
          entryId: createdEntryId,
        });
      }
      resetContractFormAfterSave();
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "Nepodařilo se uložit smlouvu. Zkus to prosím za chvíli znovu.";
      console.error("Chyba při ukládání smlouvy:", errorMessage);
      setSaveMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDuplicateModal = async () => {
    if (!user || !duplicateModal) return;
    const modal = duplicateModal;
    setDuplicateModal(null);
    try {
      if (modal.mode === "overwrite") {
        const entriesToDelete = modal.entries
          .map((entry) => ({
            ownerEmail: normalizeEmailValue(entry.ownerEmail),
            entryId: entry.id,
          }))
          .filter(
            (entry) =>
              entry.ownerEmail.length > 0 && entry.entryId.trim().length > 0
          );
        if (entriesToDelete.length > 0) {
          const { response, data } = await requestContractsMutationWithAuth({
            user,
            path: "/api/contracts/bulk-delete",
            method: "DELETE",
            payload: { entries: entriesToDelete },
          });
          const apiError = getContractsMutationError({
            response,
            data,
            fallback: "Smazání původních smluv selhalo.",
          });
          if (apiError) {
            throw new Error(apiError);
          }
        }
      }
      await handleSaveContract(true);
    } catch (err) {
      console.error("Přepsání smlouvy selhalo", err);
      setSaveMessage("Přepsání smlouvy se nepodařilo. Zkus to znovu.");
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!saveSuccessFlash) return;
    const t = window.setTimeout(() => setSaveSuccessFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [saveSuccessFlash]);

  useEffect(() => {
    if (!showCoefModal) return;
    if (product === "neon") {
      setNeonCoefficientView(isNeonHistoricalBySignedDate ? "historical" : "current");
      return;
    }
    if (product === "cppAuto") {
      setNeonCoefficientView(
        isCppAutoHistoricalBySignedDate ? "historical" : "current"
      );
      return;
    }
    if (product === "allianzAuto") {
      setNeonCoefficientView(
        isAllianzAutoHistoricalBySignedDate ? "historical" : "current"
      );
      return;
    }
    if (product === "csobAuto") {
      setNeonCoefficientView(
        isCsobAutoHistoricalBySignedDate ? "historical" : "current"
      );
      return;
    }
    if (product === "uniqaAuto") {
      setNeonCoefficientView(
        isUniqaAutoEarlyHistoricalBySignedDate
          ? "olderHistorical"
          : isUniqaAutoHistoricalBySignedDate
          ? "historical"
          : "current"
      );
      return;
    }
    if (product === "uniqaflotila") {
      setNeonCoefficientView(
        isUniqaFlotilaHistoricalBySignedDate ? "historical" : "current"
      );
      return;
    }
    if (product === "pillowAuto") {
      setNeonCoefficientView(
        isPillowAutoHistoricalBySignedDate ? "historical" : "current"
      );
      return;
    }
    if (product === "kooperativaAuto") {
      setNeonCoefficientView(
        isKooperativaAutoHistoricalBySignedDate ? "historical" : "current"
      );
      return;
    }
    if (product === "maximaMaxEfekt") {
      setNeonCoefficientView(isMaxEfekt5BySignedDate ? "historical" : "current");
      return;
    }
    if (product === "domex") {
      setNeonCoefficientView(
        isDomexEarlyHistoricalBySignedDate
          ? "olderHistorical"
          : isDomexHistoricalBySignedDate
            ? "historical"
            : "current"
      );
    }
  }, [
    showCoefModal,
    product,
    isNeonHistoricalBySignedDate,
    isCppAutoHistoricalBySignedDate,
    isAllianzAutoHistoricalBySignedDate,
    isCsobAutoHistoricalBySignedDate,
    isUniqaAutoEarlyHistoricalBySignedDate,
    isUniqaAutoHistoricalBySignedDate,
    isUniqaFlotilaHistoricalBySignedDate,
    isPillowAutoHistoricalBySignedDate,
    isKooperativaAutoHistoricalBySignedDate,
    isMaxEfekt5BySignedDate,
    isDomexEarlyHistoricalBySignedDate,
    isDomexHistoricalBySignedDate,
  ]);

  useEffect(() => {
    return () => {
      if (neonPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(neonPreviewObjectUrlRef.current);
        neonPreviewObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showCoefModal || product !== "neon" || !user || !neonPreviewImageUrl) {
      if (neonPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(neonPreviewObjectUrlRef.current);
        neonPreviewObjectUrlRef.current = null;
      }
      setNeonPreviewBlobUrl(null);
      setNeonPreviewLoading(false);
      setNeonPreviewError(null);
      return;
    }

    let cancelled = false;
    setNeonPreviewLoading(true);
    setNeonPreviewError(null);

    const loadPreview = async () => {
      try {
        const response = await requestBlobWithAuth({
          user,
          path: neonPreviewImageUrl,
        });
        if (!response.ok) {
          throw new Error(`Nepodařilo se načíst náhled (${response.status}).`);
        }

        const previewBlob = await response.blob();
        const blobUrl = URL.createObjectURL(previewBlob);

        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        if (neonPreviewObjectUrlRef.current) {
          URL.revokeObjectURL(neonPreviewObjectUrlRef.current);
        }
        neonPreviewObjectUrlRef.current = blobUrl;
        setNeonPreviewBlobUrl(blobUrl);
      } catch (err) {
        const errorMessage =
          err instanceof Error && err.message.trim().length > 0
            ? err.message.trim()
            : "Nepodařilo se načíst náhled provizních podmínek.";
        if (!cancelled) {
          setNeonPreviewError(errorMessage);
          setNeonPreviewBlobUrl(null);
        }
      } finally {
        if (!cancelled) {
          setNeonPreviewLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
    }, [showCoefModal, product, user, neonPreviewImageUrl]);
  
    const tipContractTipCounts = useMemo<Record<TipContractTipsFilter, number>>(
      () => ({
        all: tipContractTips.length,
        new: tipContractTips.filter((tip) => tip.status === "pending").length,
        contracted: tipContractTips.filter((tip) => tip.status === "contracted").length,
      }),
      [tipContractTips]
    );
    const filteredTipContractTips = useMemo(
      () =>
        tipContractTips.filter((tip) => {
          if (tipContractTipsFilter === "all") return true;
          if (tipContractTipsFilter === "new") return tip.status === "pending";
          return tip.status === "contracted";
        }),
      [tipContractTips, tipContractTipsFilter]
    );
  
    if (!user) {
      return (
      <main className="relative min-h-screen overflow-hidden bg-black font-mono text-slate-50">
        <div className="fixed inset-0 -z-10 bg-black" />

        <div className="relative flex min-h-screen items-center justify-center px-4">
          <div className="bg-slate-950/90 border border-slate-300 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl p-6 w-full max-w-md space-y-4 text-center">
            <p className="text-sm text-slate-200">
              Pro používání kalkulačky se prosím nejdřív přihlas na domovské
              stránce.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl bg-white text-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Zpět na přihlášení
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const allowed = allowedFrequencies(product);
  const isAddContractMode = calculatorViewMode === "addContract";
  const isCommissionOnlyMode = calculatorViewMode === "commissionOnly";
  const canChoosePositionManually = isCommissionOnlyMode;
  const headerTitle = tipsterModeEnabled
    ? "Kalkulačka - TIPAŘ"
    : isAddContractMode
      ? "Přidat smlouvu"
      : "Kalkulačka provizí";
  const showAddContractHelp = isAddContractMode || tipsterModeEnabled;
  const hasFrequencyPicker = allowed.length > 1;
  const showPolicyEndDateField = supportsPolicyEndDate(product);
  const lastSavedContractHref = lastSavedContractRef
    ? `/smlouvy/${encodeURIComponent(
        `${lastSavedContractRef.ownerEmail}___${lastSavedContractRef.entryId}`
      )}?from=list`
    : null;
  const currentProduct = PRODUCT_OPTIONS.find((p) => p.id === product)!;
  const showNeonAddContractHelp = hasSelectedProduct && product === "neon";
  const showReplacementAddContractHelp =
    hasSelectedProduct &&
    supportsOriginalContractReplacement(product) &&
    originalReplacementLabel(product) === "Náhrada";
  const currentProductInstitutionId = productInstitutionIdFromCatalog(product);
  const autoHullSumInsuredText = autoCarHullSumInsuredText.trim();
  const autoHullSumInsuredDraftText = autoCarHullSumInsuredDraft.trim();
  const autoHullSumInsuredDraftAmount = parseNumber(autoHullSumInsuredDraftText);
  const autoHullSumInsuredDraftValue =
    autoHullSumInsuredDraftAmount > 0 ? Math.round(autoHullSumInsuredDraftAmount) : null;
  const autoHullSumInsuredForSave =
    autoHullSumInsuredDraftValue != null
      ? autoHullSumInsuredDraftValue
      : autoCarHullSumInsured;
  const autoHullHasInsurance =
    isAutoProduct(product) &&
    (autoCarHullSumInsured != null ||
      autoHullSumInsuredDraftText !== "" ||
      autoHullSumInsuredText !== "" ||
      autoCarHullDeductible != null ||
      autoCarHullDeductibleText.trim() !== "" ||
      autoCarHullRiskAccident ||
      autoCarHullRiskTheft ||
      autoCarHullRiskNatural ||
      autoCarHullRiskVandalism ||
      autoCarHullRiskAnimalCollision);
  const autoHullSumStoredResolved =
    autoCarHullSumInsured != null || autoHullSumInsuredText !== "";
  const autoHullSumResolved =
    autoHullSumStoredResolved || autoHullSumInsuredDraftValue != null;
  const autoHullSumNeedsInput = autoHullHasInsurance && !autoHullSumResolved;
  const autoHullCanUseUsualPrice = product === "allianzAuto" || product === "pillowAuto";
  const autoHullUsualPriceSelected =
    autoHullSumInsuredText.toLowerCase() === AUTO_HULL_USUAL_PRICE_TEXT.toLowerCase();
  const handleAutoHullSumAmountChange = (value: string) => {
    setAutoCarHullSumInsuredDraft(value);
    setAutoCarHullSumInsuredText("");
    if (parseNumber(value) > 0) {
      setMissingFields((prev) =>
        prev.filter((key) => key !== "havarijní pojistnou částku")
      );
    }
  };
  const commitAutoHullSumDraft = () => {
    if (autoHullSumInsuredDraftValue == null) return;
    setAutoCarHullSumInsured(autoHullSumInsuredDraftValue);
    setAutoCarHullSumInsuredText("");
    setAutoCarHullSumInsuredDraft("");
    setMissingFields((prev) =>
      prev.filter((key) => key !== "havarijní pojistnou částku")
    );
  };
  const handleAutoHullUsualPriceChange = (checked: boolean) => {
    if (checked) {
      setAutoCarHullSumInsured(null);
      setAutoCarHullSumInsuredText(AUTO_HULL_USUAL_PRICE_TEXT);
      setAutoCarHullSumInsuredDraft("");
      setMissingFields((prev) =>
        prev.filter((key) => key !== "havarijní pojistnou částku")
      );
      return;
    }
    setAutoCarHullSumInsuredText("");
    setAutoCarHullSumInsuredDraft("");
  };
  const autoHullSumPromptVisible =
    autoHullHasInsurance &&
    !autoHullUsualPriceSelected &&
    (!autoHullSumStoredResolved || autoHullSumInsuredDraftText !== "");
  const autoHullSumPrompt: AutoPdfHullSumPrompt | null = autoHullSumPromptVisible
    ? {
        amountText: autoCarHullSumInsuredDraft,
        canUseUsualPrice: autoHullCanUseUsualPrice,
        usualPriceSelected: autoHullUsualPriceSelected,
        onAmountTextChange: handleAutoHullSumAmountChange,
        onAmountTextBlur: commitAutoHullSumDraft,
        onUsualPriceChange: handleAutoHullUsualPriceChange,
      }
    : null;
  const parsePositiveRounded = (value: string) => {
    const parsed = parseNumber(value);
    return parsed > 0 ? Math.round(parsed) : null;
  };
  const clearAutoHullSumMissingField = () => {
    setMissingFields((prev) =>
      prev.filter((key) => key !== "havarijní pojistnou částku")
    );
  };
  const setAutoNumberField = (
    value: string,
    setter: (nextValue: number | null) => void
  ) => {
    setter(parsePositiveRounded(value));
  };
  const autoPdfEditorVisibleAddons: AutoPdfEditorBooleanField[] = isAutoProduct(product)
    ? [
        "carAddonEso",
        "carAddonNaturalRisks",
        "carAddonKlika",
        "carAddonGlass",
        "carAddonAnimalCollision",
        "carAddonAnimalDamage",
        "carAddonVandalism",
        "carAddonTheft",
        "carAddonNatural",
        "carAddonOwnDamage",
        "carAddonPothole",
        "carAddonNonFaultAccident",
        "carAddonGap",
        "carAddonSmartGap",
        "carAddonServisPro",
        "carAddonReplacementCar",
        "carAddonLuggage",
        "carAddonTransportedGoods",
        "carAddonFireExplosion",
        "carAddonLegalAdvice",
        "carAddonPassengerInjury",
        "carAddonKeyLossTheft",
      ]
    : [];
  const autoPdfEditorFields: AutoPdfDetailEditorFields | null = isAutoProduct(product)
    ? {
        carMake: autoCarMake,
        carPlate: autoCarPlate,
        carVin: autoCarVin,
        carTp: autoCarTp,
        carOrv: autoCarOrv,
        carAnnualMileage: autoCarAnnualMileage,
        carAllianzScope: autoCarAllianzScope,
        carLiabilityLimit:
          autoCarLiabilityLimit != null && Number.isFinite(autoCarLiabilityLimit)
            ? String(autoCarLiabilityLimit)
            : "",
        carHullSumInsured:
          autoCarHullSumInsuredDraft ||
          autoHullSumInsuredText ||
          (autoCarHullSumInsured != null && Number.isFinite(autoCarHullSumInsured)
            ? String(autoCarHullSumInsured)
            : ""),
        carHullDeductible:
          autoCarHullDeductibleText.trim() ||
          (autoCarHullDeductible != null && Number.isFinite(autoCarHullDeductible)
            ? String(autoCarHullDeductible)
            : ""),
        carAssistancePlan: autoCarAssistancePlan,
        carAddonGlassLimit:
          autoCarAddonGlassLimit != null && Number.isFinite(autoCarAddonGlassLimit)
            ? String(autoCarAddonGlassLimit)
            : "",
        carAddonAnimalCollisionLimit:
          autoCarAddonAnimalCollisionLimit != null &&
          Number.isFinite(autoCarAddonAnimalCollisionLimit)
            ? String(autoCarAddonAnimalCollisionLimit)
            : "",
        carAddonAnimalDamageLimit:
          autoCarAddonAnimalDamageLimit != null &&
          Number.isFinite(autoCarAddonAnimalDamageLimit)
            ? String(autoCarAddonAnimalDamageLimit)
            : "",
        carAddonTheftLimit:
          autoCarAddonTheftLimit != null && Number.isFinite(autoCarAddonTheftLimit)
            ? String(autoCarAddonTheftLimit)
            : "",
        carAddonNaturalLimit:
          autoCarAddonNaturalLimit != null && Number.isFinite(autoCarAddonNaturalLimit)
            ? String(autoCarAddonNaturalLimit)
            : "",
        carAddonOwnDamageLimit:
          autoCarAddonOwnDamageLimit != null && Number.isFinite(autoCarAddonOwnDamageLimit)
            ? String(autoCarAddonOwnDamageLimit)
            : "",
        carAddonGapLimit:
          autoCarAddonGapLimit != null && Number.isFinite(autoCarAddonGapLimit)
            ? String(autoCarAddonGapLimit)
            : "",
        carHullRiskAccident: autoCarHullRiskAccident,
        carHullRiskTheft: autoCarHullRiskTheft,
        carHullRiskNatural: autoCarHullRiskNatural,
        carHullRiskVandalism: autoCarHullRiskVandalism,
        carHullRiskAnimalCollision: autoCarHullRiskAnimalCollision,
        carAddonEso: autoCarAddonEso,
        carAddonNaturalRisks: autoCarAddonNaturalRisks,
        carAddonKlika: autoCarAddonKlika,
        carAddonGlass: autoCarAddonGlass,
        carAddonAnimalCollision: autoCarAddonAnimalCollision,
        carAddonAnimalDamage: autoCarAddonAnimalDamage,
        carAddonVandalism: autoCarAddonVandalism,
        carAddonTheft: autoCarAddonTheft,
        carAddonNatural: autoCarAddonNatural,
        carAddonOwnDamage: autoCarAddonOwnDamage,
        carAddonGap: autoCarAddonGap,
        carAddonSmartGap: autoCarAddonSmartGap,
        carAddonServisPro: autoCarAddonServisPro,
        carAddonFireExplosion: autoCarAddonFireExplosion,
        carAddonLegalAdvice: autoCarAddonLegalAdvice,
        carAddonReplacementCar: autoCarAddonReplacementCar,
        carAddonLuggage: autoCarAddonLuggage,
        carAddonTransportedGoods: autoCarAddonTransportedGoods,
        carAddonPothole: autoCarAddonPothole,
        carAddonNonFaultAccident: autoCarAddonNonFaultAccident,
        carAddonPassengerInjury: autoCarAddonPassengerInjury,
        carAddonKeyLossTheft: autoCarAddonKeyLossTheft,
        showTp: isSlaviaAutoDetailProduct(product) || isUniqaAutoDetailProduct(product),
        showAnnualMileage: product === "allianzAuto" || product === "pillowAuto",
        showAllianzScope: product === "allianzAuto",
        showHull:
          isKooperativaAutoDetailProduct(product) ||
          isUniqaAutoDetailProduct(product) ||
          product === "cppAuto" ||
          product === "allianzAuto" ||
          product === "pillowAuto" ||
          product === "csobAuto",
        showHullRisks:
          isKooperativaAutoDetailProduct(product) ||
          isUniqaAutoDetailProduct(product) ||
          product === "cppAuto" ||
          product === "allianzAuto" ||
          product === "pillowAuto",
        showAssistance:
          isKooperativaAutoDetailProduct(product) ||
          isUniqaAutoDetailProduct(product) ||
          product === "cppAuto" ||
          product === "allianzAuto" ||
          product === "csobAuto" ||
          product === "pillowAuto",
        canUseHullUsualPrice: autoHullCanUseUsualPrice,
        hullUsualPriceSelected: autoHullUsualPriceSelected,
        visibleAddons: autoPdfEditorVisibleAddons,
      }
    : null;
  const handleAutoPdfEditorTextChange = (
    field: AutoPdfEditorTextField,
    value: string
  ) => {
    switch (field) {
      case "carMake":
        setAutoCarMake(value);
        return;
      case "carPlate":
        setAutoCarPlate(value);
        return;
      case "carVin":
        setAutoCarVin(value);
        return;
      case "carTp":
        setAutoCarTp(value);
        return;
      case "carOrv":
        setAutoCarOrv(value);
        return;
      case "carAnnualMileage":
        setAutoCarAnnualMileage(value);
        return;
      case "carAllianzScope":
        setAutoCarAllianzScope(value);
        return;
      case "carLiabilityLimit": {
        const limit = parsePositiveRounded(value);
        setAutoCarLiabilityLimit(limit);
        if (product === "cppAuto" && limit === 200_000_000) {
          setAutoCarAddonSmartGap(true);
          setAutoCarAddonServisPro(true);
        }
        return;
      }
      case "carHullSumInsured": {
        const trimmed = value.trim();
        setAutoCarHullSumInsuredDraft("");
        if (!trimmed) {
          setAutoCarHullSumInsured(null);
          setAutoCarHullSumInsuredText("");
          return;
        }
        if (
          autoHullCanUseUsualPrice &&
          trimmed.toLowerCase() === AUTO_HULL_USUAL_PRICE_TEXT.toLowerCase()
        ) {
          setAutoCarHullSumInsured(null);
          setAutoCarHullSumInsuredText(AUTO_HULL_USUAL_PRICE_TEXT);
          clearAutoHullSumMissingField();
          return;
        }
        const amount = parsePositiveRounded(trimmed);
        if (amount != null) {
          setAutoCarHullSumInsured(amount);
          setAutoCarHullSumInsuredText("");
          clearAutoHullSumMissingField();
          return;
        }
        setAutoCarHullSumInsured(null);
        setAutoCarHullSumInsuredText(autoHullCanUseUsualPrice ? trimmed : "");
        return;
      }
      case "carHullDeductible": {
        const trimmed = value.trim();
        if (!trimmed) {
          setAutoCarHullDeductible(null);
          setAutoCarHullDeductibleText("");
          return;
        }
        const isNumericOnly = /^[\d\s.,]+(?:kč|czk)?$/i.test(trimmed);
        const amount = parsePositiveRounded(trimmed);
        if (amount != null && isNumericOnly) {
          setAutoCarHullDeductible(amount);
          setAutoCarHullDeductibleText("");
          return;
        }
        setAutoCarHullDeductible(null);
        setAutoCarHullDeductibleText(trimmed);
        return;
      }
      case "carAssistancePlan":
        setAutoCarAssistancePlan(value);
        return;
      case "carAddonGlassLimit":
        setAutoNumberField(value, setAutoCarAddonGlassLimit);
        return;
      case "carAddonAnimalCollisionLimit":
        setAutoNumberField(value, setAutoCarAddonAnimalCollisionLimit);
        return;
      case "carAddonAnimalDamageLimit":
        setAutoNumberField(value, setAutoCarAddonAnimalDamageLimit);
        return;
      case "carAddonTheftLimit":
        setAutoNumberField(value, setAutoCarAddonTheftLimit);
        return;
      case "carAddonNaturalLimit":
        setAutoNumberField(value, setAutoCarAddonNaturalLimit);
        return;
      case "carAddonOwnDamageLimit":
        setAutoNumberField(value, setAutoCarAddonOwnDamageLimit);
        return;
      case "carAddonGapLimit":
        setAutoNumberField(value, setAutoCarAddonGapLimit);
        return;
    }
  };
  const handleAutoPdfEditorBooleanChange = (
    field: AutoPdfEditorBooleanField,
    value: boolean
  ) => {
    switch (field) {
      case "carHullRiskAccident":
        setAutoCarHullRiskAccident(value);
        return;
      case "carHullRiskTheft":
        setAutoCarHullRiskTheft(value);
        return;
      case "carHullRiskNatural":
        setAutoCarHullRiskNatural(value);
        return;
      case "carHullRiskVandalism":
        setAutoCarHullRiskVandalism(value);
        return;
      case "carHullRiskAnimalCollision":
        setAutoCarHullRiskAnimalCollision(value);
        return;
      case "carAddonEso":
        setAutoCarAddonEso(value);
        return;
      case "carAddonNaturalRisks":
        setAutoCarAddonNaturalRisks(value);
        return;
      case "carAddonKlika":
        setAutoCarAddonKlika(value);
        return;
      case "carAddonGlass":
        setAutoCarAddonGlass(value);
        if (!value) setAutoCarAddonGlassLimit(null);
        return;
      case "carAddonAnimalCollision":
        setAutoCarAddonAnimalCollision(value);
        if (!value) setAutoCarAddonAnimalCollisionLimit(null);
        return;
      case "carAddonAnimalDamage":
        setAutoCarAddonAnimalDamage(value);
        if (!value) setAutoCarAddonAnimalDamageLimit(null);
        return;
      case "carAddonVandalism":
        setAutoCarAddonVandalism(value);
        return;
      case "carAddonTheft":
        setAutoCarAddonTheft(value);
        if (!value) setAutoCarAddonTheftLimit(null);
        return;
      case "carAddonNatural":
        setAutoCarAddonNatural(value);
        if (!value) setAutoCarAddonNaturalLimit(null);
        return;
      case "carAddonOwnDamage":
        setAutoCarAddonOwnDamage(value);
        if (!value) setAutoCarAddonOwnDamageLimit(null);
        return;
      case "carAddonGap":
        setAutoCarAddonGap(value);
        if (!value) setAutoCarAddonGapLimit(null);
        return;
      case "carAddonSmartGap":
        setAutoCarAddonSmartGap(value);
        return;
      case "carAddonServisPro":
        setAutoCarAddonServisPro(value);
        return;
      case "carAddonFireExplosion":
        setAutoCarAddonFireExplosion(value);
        return;
      case "carAddonLegalAdvice":
        setAutoCarAddonLegalAdvice(value);
        return;
      case "carAddonReplacementCar":
        setAutoCarAddonReplacementCar(value);
        return;
      case "carAddonLuggage":
        setAutoCarAddonLuggage(value);
        return;
      case "carAddonTransportedGoods":
        setAutoCarAddonTransportedGoods(value);
        return;
      case "carAddonPothole":
        setAutoCarAddonPothole(value);
        return;
      case "carAddonNonFaultAccident":
        setAutoCarAddonNonFaultAccident(value);
        return;
      case "carAddonPassengerInjury":
        setAutoCarAddonPassengerInjury(value);
        return;
      case "carAddonKeyLossTheft":
        setAutoCarAddonKeyLossTheft(value);
        return;
    }
  };
  const autoPdfDetailEditor =
    autoPdfEditorFields != null ? (
      <CalculatorAutoPdfDetailEditor
        fields={autoPdfEditorFields}
        onTextChange={handleAutoPdfEditorTextChange}
        onBooleanChange={handleAutoPdfEditorBooleanChange}
        onHullUsualPriceChange={handleAutoHullUsualPriceChange}
      />
    ) : null;
  const autoPdfDetailItems: AutoPdfDetailSummaryItem[] = (() => {
    if (!isAutoProduct(product)) return [];

    const items: AutoPdfDetailSummaryItem[] = [];
    const addText = (section: AutoPdfDetailSummarySection, label: string, value: string) => {
      const normalized = value.trim();
      if (normalized) items.push({ section, label, value: normalized });
    };
    const addMoney = (
      section: AutoPdfDetailSummarySection,
      label: string,
      value: number | null
    ) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        items.push({ section, label, value: formatMoney(value) });
      }
    };
    const addBoolean = (
      section: AutoPdfDetailSummarySection,
      label: string,
      value: boolean
    ) => {
      if (value) items.push({ section, label, value: "Ano" });
    };
    const addAddon = (
      label: string,
      value: boolean,
      limit: number | null = null
    ) => {
      if (!value) return;
      const limitText =
        typeof limit === "number" && Number.isFinite(limit) ? formatMoney(limit) : null;
      items.push({
        section: "addons",
        label,
        value: "Ano",
        ...(limitText ? { sideLabel: "Limit", sideValue: limitText } : {}),
      });
    };

    addText("vehicle", "Značka/model", autoCarMake);
    addText("vehicle", "RZ", autoCarPlate);
    addText("vehicle", "VIN", autoCarVin);
    if (isSlaviaAutoDetailProduct(product) || isUniqaAutoDetailProduct(product)) {
      addText("vehicle", "TP", autoCarTp);
    }
    addText("vehicle", "ORV", autoCarOrv);
    if (product === "allianzAuto" || product === "pillowAuto") {
      addText("vehicle", "Roční nájezd", autoCarAnnualMileage);
    }
    if (product === "allianzAuto") addText("vehicle", "Rozsah Allianz", autoCarAllianzScope);
    addMoney("liability", "Limit odpovědnosti", autoCarLiabilityLimit);
    if (autoHullSumInsuredText) {
      addText("hull", "Havarijní pojistná částka", autoHullSumInsuredText);
    } else {
      addMoney("hull", "Havarijní pojistná částka", autoCarHullSumInsured);
    }
    const hullDeductibleText = autoCarHullDeductibleText.trim();
    if (hullDeductibleText) {
      addText("hull", "Spoluúčast havárie", hullDeductibleText);
    } else {
      addMoney("hull", "Spoluúčast havárie", autoCarHullDeductible);
    }
    addBoolean("hull", "Havárie", autoCarHullRiskAccident);
    addBoolean("hull", "Odcizení", autoCarHullRiskTheft);
    addBoolean("hull", "Živel", autoCarHullRiskNatural);
    addBoolean("hull", "Vandalismus", autoCarHullRiskVandalism);
    addBoolean("hull", "Střet se zvířetem", autoCarHullRiskAnimalCollision);
    if (autoCarAssistancePlan.trim()) {
      addText("assistance", "Asistence", autoAssistancePlanLabel(autoCarAssistancePlan));
    }
    addAddon("ESO", autoCarAddonEso);
    addAddon("Pojištění přírodních rizik", autoCarAddonNaturalRisks);
    addAddon("Pojištění KLIKA", autoCarAddonKlika);
    addAddon("Skla", autoCarAddonGlass, autoCarAddonGlassLimit);
    addAddon(
      "Střet se zvěří",
      autoCarAddonAnimalCollision,
      autoCarAddonAnimalCollisionLimit
    );
    addAddon(
      "Poškození zvěří",
      autoCarAddonAnimalDamage,
      autoCarAddonAnimalDamageLimit
    );
    addAddon("Vandalismus", autoCarAddonVandalism);
    addAddon("Odcizení", autoCarAddonTheft, autoCarAddonTheftLimit);
    addAddon("Živel", autoCarAddonNatural, autoCarAddonNaturalLimit);
    addAddon(
      "Poškození vlastního vozidla",
      autoCarAddonOwnDamage,
      autoCarAddonOwnDamageLimit
    );
    addAddon("Výmol", autoCarAddonPothole);
    addAddon("Pojištění nezaviněné nehody", autoCarAddonNonFaultAccident);
    addAddon("GAP", autoCarAddonGap, autoCarAddonGapLimit);
    addAddon("SmartGAP", autoCarAddonSmartGap);
    addAddon("Servis PRO", autoCarAddonServisPro);
    addAddon("Náhradní vozidlo", autoCarAddonReplacementCar);
    addAddon("Zavazadla, nosiče a boxy", autoCarAddonLuggage);
    addAddon("Dopravované věci", autoCarAddonTransportedGoods);
    addAddon("Požár/výbuch", autoCarAddonFireExplosion);
    addAddon("Právní poradenství", autoCarAddonLegalAdvice);
    addAddon("Úraz všech osob", autoCarAddonPassengerInjury);
    addAddon("Ztráta/odcizení klíčů", autoCarAddonKeyLossTheft);

    return items;
  })();
  const domexPdfNumberText = (value: number | null) =>
    value != null && Number.isFinite(value) ? String(value) : "";
  const domexPropertyTypeLabel = (value: string) => {
    const key = value.trim().toLowerCase();
    const labels: Record<string, string> = {
      byt: "Byt",
      dum: "Dům",
      chata: "Chata",
      rekreace: "Rekreační objekt",
      ostatni: "Ostatní",
    };
    return key ? labels[key] ?? value.trim() : "";
  };
  const domexHouseholdTypeLabel = (value: string) => {
    const key = value.trim().toLowerCase();
    if (key === "trvale") return "Trvale obydlená";
    if (key === "rekreacni") return "Rekreační";
    return value.trim();
  };
  const domexCoverageLabel = (value: string) => value.trim().toUpperCase();
  const isDomexPdfDetailProduct = product === "domex" || product === "maxdomov";
  const domexPdfEditorFields: DomexPdfDetailEditorFields | null = isDomexPdfDetailProduct
    ? {
        address: domexAddress,
        propertyType: domexPropertyType,
        propertyCoverage: domexPropertyCoverage,
        sumInsured: domexPdfNumberText(domexPropertySumInsured),
        deductible: domexPdfNumberText(domexPropertyDeductible),
        outbuildingSumInsured: domexPdfNumberText(domexOutbuildingSumInsured),
        householdType: domexHouseholdType,
        householdCoverage: domexHouseholdCoverage,
        householdSumInsured: domexPdfNumberText(domexHouseholdSumInsured),
        householdDeductible: domexPdfNumberText(domexHouseholdDeductible),
        liabilitySumInsured: domexPdfNumberText(domexLiabilitySumInsured),
        liabilityDeductible: domexPdfNumberText(domexLiabilityDeductible),
        note: domexNote,
        liabilityMobile: domexLiabilityMobile,
        liabilityTenant: domexLiabilityTenant,
        liabilityLandlord: domexLiabilityLandlord,
        assistancePlus: domexAssistancePlus,
      }
    : null;
  const setDomexNumberField = (
    value: string,
    setter: (nextValue: number | null) => void
  ) => {
    setter(parsePositiveRounded(value));
  };
  const handleDomexPdfEditorTextChange = (
    field: DomexPdfEditorTextField,
    value: string
  ) => {
    switch (field) {
      case "address":
        setDomexAddress(value);
        return;
      case "propertyType":
        setDomexPropertyType(value);
        return;
      case "propertyCoverage":
        setDomexPropertyCoverage(value);
        return;
      case "sumInsured":
        setDomexNumberField(value, setDomexPropertySumInsured);
        return;
      case "deductible":
        setDomexNumberField(value, setDomexPropertyDeductible);
        return;
      case "outbuildingSumInsured":
        setDomexNumberField(value, setDomexOutbuildingSumInsured);
        return;
      case "householdType":
        setDomexHouseholdType(value);
        return;
      case "householdCoverage":
        setDomexHouseholdCoverage(value);
        return;
      case "householdSumInsured":
        setDomexNumberField(value, setDomexHouseholdSumInsured);
        return;
      case "householdDeductible":
        setDomexNumberField(value, setDomexHouseholdDeductible);
        return;
      case "liabilitySumInsured":
        setDomexNumberField(value, setDomexLiabilitySumInsured);
        return;
      case "liabilityDeductible":
        setDomexNumberField(value, setDomexLiabilityDeductible);
        return;
      case "note":
        setDomexNote(value);
        return;
    }
  };
  const handleDomexPdfEditorBooleanChange = (
    field: DomexPdfEditorBooleanField,
    value: boolean
  ) => {
    switch (field) {
      case "liabilityMobile":
        setDomexLiabilityMobile(value);
        return;
      case "liabilityTenant":
        setDomexLiabilityTenant(value);
        return;
      case "liabilityLandlord":
        setDomexLiabilityLandlord(value);
        return;
      case "assistancePlus":
        setDomexAssistancePlus(value);
        return;
    }
  };
  const domexPdfDetailEditor =
    domexPdfEditorFields != null ? (
      <CalculatorDomexPdfDetailEditor
        fields={domexPdfEditorFields}
        onTextChange={handleDomexPdfEditorTextChange}
        onBooleanChange={handleDomexPdfEditorBooleanChange}
      />
    ) : null;
  const domexPdfDetailItems: DomexPdfDetailSummaryItem[] = (() => {
    if (!isDomexPdfDetailProduct) return [];

    const items: DomexPdfDetailSummaryItem[] = [];
    const addText = (
      section: DomexPdfDetailSummarySection,
      label: string,
      value: string
    ) => {
      const normalized = value.trim();
      if (normalized) items.push({ section, label, value: normalized });
    };
    const addMoney = (
      section: DomexPdfDetailSummarySection,
      label: string,
      value: number | null
    ) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        items.push({ section, label, value: formatMoney(value) });
      }
    };
    const addBoolean = (
      section: DomexPdfDetailSummarySection,
      label: string,
      value: boolean
    ) => {
      if (value) items.push({ section, label, value: "Ano" });
    };

    addText("property", "Adresa", domexAddress);
    addText("property", "Typ nemovitosti", domexPropertyTypeLabel(domexPropertyType));
    addText("property", "Rozsah", domexCoverageLabel(domexPropertyCoverage));
    addMoney("property", "Pojistná částka", domexPropertySumInsured);
    addMoney("property", "Spoluúčast", domexPropertyDeductible);
    addMoney("outbuilding", "Pojistná částka", domexOutbuildingSumInsured);
    addText("household", "Typ", domexHouseholdTypeLabel(domexHouseholdType));
    addText("household", "Rozsah", domexCoverageLabel(domexHouseholdCoverage));
    addMoney("household", "Pojistná částka", domexHouseholdSumInsured);
    addMoney("household", "Spoluúčast", domexHouseholdDeductible);
    addMoney("liability", "Pojistná částka", domexLiabilitySumInsured);
    addMoney("liability", "Spoluúčast", domexLiabilityDeductible);
    addBoolean("liability", "Náhrada újmy mobilní elektronice", domexLiabilityMobile);
    addBoolean("liability", "Odpovědnost nájemce na věci nemovité", domexLiabilityTenant);
    addBoolean("liability", "Odpovědnost pronajímatele", domexLiabilityLandlord);
    addBoolean("assistance", "Asistence PLUS", domexAssistancePlus);
    addText("note", "Poznámka", domexNote);

    return items;
  })();
  const neonVersionLabel = (value: string) => {
    const key = value.trim();
    const labels: Record<string, string> = {
      neon_life: "NEON Life",
      neon_risk: "NEON Risk",
      neon_life_kids: "NEON Life Dětské",
      neon_risk_kids: "NEON Risk Dětské",
    };
    return key ? labels[key] ?? key : "";
  };
  const neonSumTypeLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    const labels: Record<string, string> = {
      konstantni: "Konstantní",
      klesajici: "Klesající",
      klesajici_urok: "Klesající dle úroku",
    };
    return key ? labels[key] ?? key : "";
  };
  const neonCriticalVariantLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    const labels: Record<string, string> = {
      zakladni: "Základní",
      rozsirena_in_situ: "Rozšířená včetně formy in situ",
      maxi_in_situ: "Maxi včetně formy in situ",
    };
    return key ? labels[key] ?? key : "";
  };
  const neonWorkIncapacityStartLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    return key ? `${key}. dne` : "";
  };
  const neonWorkIncapacityBackpayLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    if (key === "zpetne") return "Zpětně";
    if (key === "nezpetne") return "Nezpětně";
    return key;
  };
  const neonAccidentDailyStartLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    return key ? `${key}. dne` : "";
  };
  const neonAccidentDailyBackpayLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    if (key === "zpetne") return "Zpětně od 1. dne";
    if (key === "zpetne_progrese") return "Zpětně s progresí";
    return key;
  };
  const neonInjuryPermanentFulfillmentLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    if (key === "0.001") return "0,001 %";
    if (key === "10") return "10 %";
    return key;
  };
  const neonInjuryPermanentProgressionLabel = (value?: string) => {
    const key = value?.trim() ?? "";
    const labels: Record<string, string> = {
      bez_progrese: "Bez progrese",
      progrese_5x: "5x progrese",
      progrese_10x: "10x progrese",
    };
    return key ? labels[key] ?? key : "";
  };
  const neonAmountText = (value?: string) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return "";
    const amount = parseNumber(trimmed);
    return amount > 0 ? formatMoney(Math.round(amount)) : trimmed;
  };
  const handleNeonPdfEditorTextChange = (
    field: NeonPdfEditorTextField,
    value: string
  ) => {
    setNeonPdfDetailFields((prev) => ({ ...prev, [field]: value }));
  };
  const handleNeonPdfEditorBooleanChange = (
    field: NeonPdfEditorBooleanField,
    value: boolean
  ) => {
    setNeonPdfDetailFields((prev) => ({ ...prev, [field]: value }));
  };
  const neonPdfDetailEditor =
    product === "neon" ? (
      <CalculatorNeonPdfDetailEditor
        fields={neonPdfDetailFields}
        onTextChange={handleNeonPdfEditorTextChange}
        onBooleanChange={handleNeonPdfEditorBooleanChange}
      />
    ) : null;
  const neonPdfDetailItems: NeonPdfDetailSummaryItem[] = (() => {
    if (product !== "neon") return [];

    const fields = neonPdfDetailFields;
    const items: NeonPdfDetailSummaryItem[] = [];
    const addText = (
      section: NeonPdfDetailSummarySection,
      label: string,
      value: string
    ) => {
      const normalized = value.trim();
      if (normalized) items.push({ section, label, value: normalized });
    };
    const addAmount = (
      section: NeonPdfDetailSummarySection,
      label: string,
      value: string,
      typeValue = ""
    ) => {
      const amount = neonAmountText(value);
      const type = neonSumTypeLabel(typeValue);
      if (!amount && !type) return;
      items.push({
        section,
        label,
        value: amount || type,
        ...(amount && type ? { sideLabel: "Typ", sideValue: type } : {}),
      });
    };
    const addBoolean = (
      section: NeonPdfDetailSummarySection,
      label: string,
      value: boolean
    ) => {
      if (value) items.push({ section, label, value: "Ano" });
    };
    const compactDetails = (...values: Array<string | null | undefined | false>) =>
      values.filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .join(" · ");

    addText("version", "Verze", neonVersionLabel(fields.version));
    addAmount("death", "Smrt", fields.deathAmount, fields.deathType);
    addAmount("death", "Smrt (2)", fields.death2Amount, fields.death2Type);
    addAmount("death", "Smrt nebo terminální stádium", fields.deathTerminalAmount);
    addBoolean("waiver", "Invalidita", fields.waiverInvalidity);
    addBoolean("waiver", "Ztráta zaměstnání", fields.waiverUnemployment);
    addAmount("invalidity", "Invalidita 1. stupeň", fields.invalidityA1, fields.invalidityAType);
    addAmount("invalidity", "Invalidita 2. stupeň", fields.invalidityA2, fields.invalidityAType);
    addAmount("invalidity", "Invalidita 3. stupeň", fields.invalidityA3, fields.invalidityAType);
    addAmount(
      "invalidity",
      "Invalidita 1. stupeň (2)",
      fields.invalidityB1,
      fields.invalidityBType
    );
    addAmount(
      "invalidity",
      "Invalidita 2. stupeň (2)",
      fields.invalidityB2,
      fields.invalidityBType
    );
    addAmount(
      "invalidity",
      "Invalidita 3. stupeň (2)",
      fields.invalidityB3,
      fields.invalidityBType
    );
    addBoolean("invalidity", "Invalidita s výplatou důchodu", fields.invalidityPension);
    const criticalAmount = neonAmountText(fields.criticalAmount);
    const criticalType = neonSumTypeLabel(fields.criticalType);
    const criticalVariant = neonCriticalVariantLabel(fields.criticalVariant);
    const criticalDetails = compactDetails(
      criticalVariant,
      criticalType ? `Typ ${criticalType}` : ""
    );
    if (criticalAmount || criticalDetails) {
      items.push({
        section: "critical",
        label: "Závažná onemocnění a poranění",
        value: criticalAmount || criticalDetails,
        ...(criticalAmount && criticalDetails
          ? { sideLabel: "Nastavení", sideValue: criticalDetails }
          : {}),
      });
    }
    addAmount("critical", "Operace dítěte s vrozenou vadou", fields.childSurgeryAmount);
    addAmount("critical", "Závažné následky očkování", fields.vaccinationCompAmount);
    addAmount("critical", "Cukrovka a její komplikace", fields.diabetesAmount);
    addAmount("accident", "Smrt úrazem", fields.deathAccidentAmount);
    const addInjuryPermanent = (
      label: string,
      amountValue: string,
      fulfillmentValue: string,
      progressionValue: string
    ) => {
      const injuryPermanentAmount = neonAmountText(amountValue);
      const injuryPermanentFulfillment =
        neonInjuryPermanentFulfillmentLabel(fulfillmentValue);
      const injuryPermanentProgression =
        neonInjuryPermanentProgressionLabel(progressionValue);
      const injuryPermanentDetails = compactDetails(
        injuryPermanentFulfillment ? `od ${injuryPermanentFulfillment}` : "",
        injuryPermanentProgression
      );
      if (injuryPermanentAmount || injuryPermanentDetails) {
        items.push({
          section: "accident",
          label,
          value: injuryPermanentAmount || injuryPermanentDetails,
          ...(injuryPermanentAmount && injuryPermanentDetails
            ? { sideLabel: "Nastavení", sideValue: injuryPermanentDetails }
            : {}),
        });
      }
    };
    addInjuryPermanent(
      "Trvalé následky úrazu",
      fields.injuryPermanentAmount,
      fields.injuryPermanentFulfillmentFrom,
      fields.injuryPermanentProgression
    );
    addInjuryPermanent(
      "Trvalé následky úrazu (2)",
      fields.injuryPermanent2Amount,
      fields.injuryPermanent2FulfillmentFrom,
      fields.injuryPermanent2Progression
    );
    const accidentDailyAmount = neonAmountText(fields.accidentDailyBenefit);
    const accidentDailyDetails = compactDetails(
      neonAccidentDailyStartLabel(fields.accidentDailyBenefitStart),
      neonAccidentDailyBackpayLabel(fields.accidentDailyBenefitBackpay)
    );
    if (accidentDailyAmount || accidentDailyDetails) {
      items.push({
        section: "accident",
        label: "Denní odškodné úrazem",
        value: accidentDailyAmount || accidentDailyDetails,
        ...(accidentDailyAmount && accidentDailyDetails
          ? { sideLabel: "Nastavení", sideValue: accidentDailyDetails }
          : {}),
      });
    }
    addAmount("hospitalization", "Hospitalizace nemoc", fields.hospitalizationIllnessAmount);
    addAmount("hospitalization", "Hospitalizace úraz", fields.hospitalizationInjuryAmount);
    const addWorkIncapacity = (
      label: string,
      startValue: string,
      backpayValue: string,
      amountValue: string,
      illness: boolean,
      injury: boolean
    ) => {
      const workAmount = neonAmountText(amountValue);
      const workDetails = compactDetails(
        neonWorkIncapacityStartLabel(startValue),
        neonWorkIncapacityBackpayLabel(backpayValue)
      );
      if (workAmount || workDetails) {
        items.push({
          section: "work",
          label,
          value: workAmount || workDetails,
          ...(workAmount && workDetails
            ? { sideLabel: "Nastavení", sideValue: workDetails }
            : {}),
        });
      }
      addBoolean("work", `${label} nemoc`, illness);
      addBoolean("work", `${label} úraz`, injury);
    };
    addWorkIncapacity(
      "Pracovní neschopnost",
      fields.workIncapacityStart,
      fields.workIncapacityBackpay,
      fields.workIncapacityAmount,
      fields.workIncapacityIllness,
      fields.workIncapacityInjury
    );
    addWorkIncapacity(
      "Pracovní neschopnost (2)",
      fields.workIncapacity2Start,
      fields.workIncapacity2Backpay,
      fields.workIncapacity2Amount,
      fields.workIncapacity2Illness,
      fields.workIncapacity2Injury
    );
    addAmount("other", "Závislost na péči", fields.careDependencyAmount);
    addAmount("other", "Příspěvek na zvláštní pomůcku", fields.specialAidAmount);
    addAmount("other", "Celodenní ošetřování", fields.caregivingAmount);
    addAmount("other", "Náklady asistované reprodukce", fields.reproductionCostAmount);
    addAmount("other", "Odpovědnost občana", fields.liabilityCitizenLimit);
    addAmount("other", "Odpovědnost zaměstnance", fields.liabilityEmployeeLimit);
    addBoolean("other", "ČPP Pomoc", fields.cppHelp);
    addBoolean("other", "Cestovní pojištění", fields.travelInsurance);

    return items;
  })();
  const durationHelp = durationTooltip(product);
  const canChooseMode =
    isLifeProduct &&
    !(product === "neon" && isNeonHistoricalBySignedDate);
  const positionLockedToTimeline = !canChoosePositionManually;
  const allowedPositionOptions = canChoosePositionManually
    ? POSITION_ORDER
    : timelineMatchedPosition
      ? [timelineMatchedPosition.position]
      : [position];
  const subordinateTimelineStatusText = isSavingForSubordinate
    ? subordinatePositionTimelineLoading
      ? "Načítám kariérní historii..."
      : subordinatePositionTimelineError
        ? subordinatePositionTimelineError
        : selectedSubordinateTimelineMissing
          ? "Vybraný poradce nemá vyplněnou kariérní historii."
          : null
    : null;

  const computeItemsForPositionAndMode = (
    pos: Position | null,
    customMode?: CommissionMode | null,
    amountOverride?: number | null,
    productOverride?: Product | null,
    contractSignedDateOverride?: string | null,
    durationYearsOverride?: number | null
  ): { items: CommissionResultItemDTO[]; total: number } | null => {
    const val =
      amountOverride == null ? parseNumber(amountText) : toNonNegativeNumber(amountOverride);
    const years = durationYearsOverride ?? durationYears;
    const usedMode = (customMode ?? mode) as CommissionMode;
    const targetProduct = productOverride ?? product;
    const signedDateForCalculation =
      contractSignedDateOverride ?? contractSignedDateForNeon;
    const inputAmount =
      targetProduct === "neon" && amountOverride == null
        ? neonRefreshCommissionBase?.calculationMonthlyPremium ?? val
        : val;

    return calculateCommission({
      productKey: targetProduct,
      position: pos,
      commissionMode: usedMode,
      contractSignedDateIso: signedDateForCalculation,
      inputAmount,
      frequencyRaw: frequency,
      durationYears: years,
      durationMonths,
      maxCizinKomplexVariant,
      comfortPayment: parseNumber(comfortPaymentText),
      comfortGradual,
      comfortTargetAmount: parseNumber(comfortTargetAmountText),
    });
  };

  const liveEndorsementPreview = (() => {
    if (
      !endorsementPreviewContextActive ||
      endorsementDraft ||
      !endorsementPreviewSource ||
      !hasSelectedProduct ||
      !isLifeProduct ||
      endorsementPreviewSource.productKey !== product
    ) {
      return null;
    }

    const newPremiumAmount = parseNumber(amountText);
    if (newPremiumAmount <= 0) return null;

    const previousPremiumAmount = endorsementPreviewSource.effectiveInputAmount;
    const deltaAmount = newPremiumAmount - previousPremiumAmount;
    const changeType: EndorsementChangeType =
      deltaAmount > 0 ? "increase" : deltaAmount < 0 ? "decrease" : "same";
    let calculationAmount = Math.abs(deltaAmount);

    if (changeType === "decrease" && product === "neon") {
      const originalStornoStartDateIso =
        dateToIsoDay(endorsementPreviewSource.policyStartDate) ??
        dateToIsoDay(endorsementPreviewSource.contractSignedDate);
      const endorsementPolicyStartDateIso = policyStartDate.trim();
      const decreaseBase = calculateNeonDecreaseStornoBase({
        previousMonthlyPremium: previousPremiumAmount,
        newMonthlyPremium: newPremiumAmount,
        originalStornoStartDateIso,
        endorsementPolicyStartDateIso,
      });
      calculationAmount = decreaseBase?.calculationMonthlyPremium ?? 0;
    } else if (changeType === "decrease") {
      calculationAmount = 0;
    }

    if (calculationAmount <= 0) {
      return {
        items: [] as CommissionResultItemDTO[],
        total: 0,
        previousPremiumAmount,
        newPremiumAmount,
        deltaAmount,
        calculationAmount,
        changeType,
      };
    }

    const signedDateIso = contractSignedDate.trim();
    const timelinePosition =
      isIsoDay(signedDateIso)
        ? resolvePositionTimelineMatch(signedDateIso, effectivePositionTimeline)?.position ?? null
        : null;
    const positionForPreview =
      timelineMatchedPosition?.position ?? timelinePosition ?? position;
    const signedDateForPreview = isIsoDay(signedDateIso)
      ? signedDateIso
      : contractSignedDateForNeon;
    const durationYearsForPreview =
      shouldShowDuration(product) && !endorsementDurationManualOverride
        ? resolveRemainingEndorsementDurationYears(
            endorsementPreviewSource,
            product,
            policyStartDate.trim()
          )
        : durationYears ?? null;
    if (shouldShowDuration(product) && durationYearsForPreview == null) {
      return null;
    }
    const sourceDecreaseResult =
      changeType === "decrease" && product === "neon"
        ? negativeImmediateCommissionResultFromSourceItems({
            sourceItems: endorsementPreviewSource.items,
            previousPremiumAmount,
            calculationAmount,
          })
        : null;
    const result = computeItemsForPositionAndMode(
      changeType === "decrease" && product === "neon"
        ? endorsementPreviewSource.position ?? positionForPreview
        : positionForPreview,
      changeType === "decrease" && product === "neon"
        ? endorsementPreviewSource.commissionMode ?? mode
        : mode,
      calculationAmount,
      product,
      changeType === "decrease" && product === "neon"
        ? dateToIsoDay(endorsementPreviewSource.contractSignedDate) ?? signedDateForPreview
        : signedDateForPreview,
      durationYearsForPreview
    );
    const displayedResult =
      changeType === "decrease" && product === "neon"
        ? sourceDecreaseResult ?? negativeImmediateCommissionResult(result)
        : result;
    if (!displayedResult) return null;

    return {
      items: displayedResult.items,
      total: displayedResult.total,
      previousPremiumAmount,
      newPremiumAmount,
      deltaAmount,
      calculationAmount,
      changeType,
    };
  })();
  const displayedCommissionItems =
    endorsementDraft?.items ?? liveEndorsementPreview?.items ?? items;
  const displayedCommissionTotal =
    endorsementDraft?.total ?? liveEndorsementPreview?.total ?? total;
  const displayedPaymentBasedTotals =
    (!isSeparatedPeriodCommissionProduct(product) &&
      !isFrequencyAutoPayoutProduct(product)) ||
    displayedCommissionItems.length === 0
      ? null
      : paymentBasedTotals(
          displayedCommissionItems,
          isAnnualSeparatedPeriodProduct(product)
            ? 1
            : paymentsPerYear(frequency)
        );
  const displayedTipContractImmediateGrossFirstYear =
    tipContractGrossBaseForProduct(product, displayedCommissionItems);
  const displayedTipContractTipsterAmountFirstYear = tipContractConfig
    ? roundToCents(
        displayedTipContractImmediateGrossFirstYear *
          (tipContractConfig.tipsterPercent / 100)
      )
    : 0;
  const displayedTipContractImmediateNetFirstYear = tipContractConfig
    ? roundToCents(
        displayedTipContractImmediateGrossFirstYear -
          displayedTipContractTipsterAmountFirstYear
      )
    : 0;
  const displayedTipContractTotalNet = tipContractConfig
    ? roundToCents(
        Math.max(
          0,
          displayedCommissionTotal - displayedTipContractTipsterAmountFirstYear
        )
      )
    : displayedCommissionTotal;
  const displayedTipsterImmediateCommission =
    displayedTipContractImmediateGrossFirstYear * (tipsterPercent / 100);

  const currentTipContractUser = getCurrentTipContractUser();
  const canShowTipContractTipsButton = currentTipContractUser?.accountType === "tipster";
  const tipContractExampleGrossFirstYearLabel = formatMoneyResult(
    tipContractImmediateGrossFirstYear
  );
  const tipContractExampleAdvisorRemainderLabel = formatMoneyResult(
    roundToCents(
      tipContractImmediateGrossFirstYear *
        (1 - clampTipContractPercent(tipContractDraftPercent) / 100)
    )
  );
  const tipContractApplyDisabled = (() => {
    const normalizedDraftEmail = tipContractDraftEmail.trim().toLowerCase();
    if (!normalizedDraftEmail) return false;
    return (
      tipContractLookupState.status !== "found" ||
      tipContractLookupState.email !== normalizedDraftEmail
    );
  })();
  const showAutoBulkImport =
    hasSelectedProduct && isBulkImportProduct(product) && isAddContractMode && canImportFromPdf;
  const autoBulkImportCounts = autoBulkImportRows.reduce(
    (acc, row) => {
      if (row.status === "success" || row.status === "warning") acc.saved += 1;
      if (row.status === "review") acc.review += 1;
      if (row.status === "skipped") acc.skipped += 1;
      if (row.status === "error") acc.failed += 1;
      if (row.status === "processing") acc.processing += 1;
      return acc;
    },
    { saved: 0, review: 0, skipped: 0, failed: 0, processing: 0 }
  );
  const autoBulkImportButtonDisabled =
    autoBulkImporting ||
    saving ||
    pdfImporting ||
    tipsterModeEnabled ||
    Boolean(tipContractConfig);
  const renderAutoBulkImportPanel = () => {
    if (!showAutoBulkImport) return null;
    const bulkImportPanelTitle = "Hromadné nahrání smluv z PDF";

    const rowTone = (status: AutoBulkImportRowStatus): string => {
      switch (status) {
        case "success":
          return "border-emerald-200 bg-emerald-50 text-emerald-900";
        case "review":
        case "warning":
          return "border-amber-200 bg-amber-50 text-amber-950";
        case "skipped":
          return "border-slate-200 bg-slate-50 text-slate-700";
        case "error":
          return "border-rose-200 bg-rose-50 text-rose-900";
        case "processing":
          return "border-violet-200 bg-violet-50 text-violet-950";
        case "queued":
        default:
          return "border-slate-200 bg-white text-slate-700";
      }
    };

    const rowIcon = (status: AutoBulkImportRowStatus) => {
      if (status === "processing") {
        return <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} aria-hidden="true" />;
      }
      if (status === "success") {
        return <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />;
      }
      if (status === "review" || status === "warning" || status === "error") {
        return <AlertTriangle className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />;
      }
      return <span className="h-2.5 w-2.5 rounded-full bg-current opacity-45" aria-hidden="true" />;
    };

    return (
      <section className="rounded-[1.1rem] border border-white/80 bg-white/80 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-800 shadow-sm">
              <UploadCloud className="h-5 w-5" strokeWidth={2.3} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-950">
                {bulkImportPanelTitle}
              </h3>
              {autoBulkImportStatus ? (
                <p className="mt-1 text-xs font-semibold text-slate-600" aria-live="polite">
                  {autoBulkImportStatus}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => autoBulkFileInputRef.current?.click()}
            disabled={autoBulkImportButtonDisabled}
            className="ui-focus inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-700 bg-violet-700 px-4 py-2 text-sm font-black !text-white shadow-[0_12px_28px_rgba(109,40,217,0.18)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
          >
            {autoBulkImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.3} aria-hidden="true" />
            ) : (
              <UploadCloud className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />
            )}
            {autoBulkImporting ? "Nahrávám…" : "Vybrat PDF"}
          </button>
          <input
            ref={autoBulkFileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              void handleAutoBulkImport(event.target.files);
            }}
          />
        </div>

        {autoBulkImportRows.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                Uloženo {autoBulkImportCounts.saved}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                Ke kontrole {autoBulkImportCounts.review}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                Přeskočeno {autoBulkImportCounts.skipped}
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
                Chyby {autoBulkImportCounts.failed}
              </span>
              {autoBulkImportCounts.processing > 0 && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
                  Běží {autoBulkImportCounts.processing}
                </span>
              )}
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {autoBulkImportRows.map((row) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-xl border px-3 py-2 text-xs ${rowTone(
                    row.status
                  )}`}
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center">
                    {rowIcon(row.status)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-bold">
                      <span className="max-w-full truncate">{row.fileName}</span>
                      {row.productLabel && (
                        <span className="shrink-0 text-[11px] font-black">
                          {row.productLabel}
                        </span>
                      )}
                      {row.contractNumber && (
                        <span className="shrink-0 text-[11px] font-black">
                          {row.contractNumber}
                        </span>
                      )}
                    </div>
                    {row.clientName && (
                      <p className="mt-0.5 truncate font-semibold opacity-80">
                        {row.clientName}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="font-semibold opacity-80">{row.message}</p>
                      {row.status === "review" && row.reviewDraft ? (
                        <button
                          type="button"
                          onClick={() => loadAutoBulkReviewDraft(row.id)}
                          disabled={autoBulkImporting || saving || pdfImporting}
                          className="ui-focus inline-flex min-h-8 items-center justify-center rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-black text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Zkontrolovat
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };
  const renderProductAndPdfSection = (large = false) => (
      <CalculatorProductAndPdfSection
        canImportFromPdf={canImportFromPdf && isAddContractMode}
        productOpen={productOpen}
        productSelected={hasSelectedProduct}
        large={large}
        currentProductLabel={
          hasSelectedProduct ? currentProduct.label : "Klikni pro výběr produktu"
        }
        productLogoSrc={hasSelectedProduct ? productInstitutionLogo(product) : null}
        productInstitutionId={hasSelectedProduct ? currentProductInstitutionId : null}
        productLogoImageClass={
          hasSelectedProduct
            ? institutionLogoImageClass(currentProductInstitutionId)
            : undefined
        }
        productLogoFrameClass={
          hasSelectedProduct
            ? institutionLogoFrameClass(currentProductInstitutionId, "chip")
            : undefined
        }
        pdfDropActive={pdfDropActive}
        pdfImporting={pdfImporting}
        pdfImportStatus={pdfImportStatus}
        pdfImportError={pdfImportError}
        fileInputRef={fileInputRef}
        onToggleProductPicker={toggleProductPicker}
        onOpenFileDialog={() => fileInputRef.current?.click()}
        onFileInputChange={(file) => {
          resetPdfDropState();
          void handlePdfImport(file);
        }}
        onDragEnter={handlePdfDragEnter}
        onDragOver={handlePdfDragOver}
        onDragLeave={handlePdfDragLeave}
        onDrop={handlePdfDrop}
      />
    );
  
    return (
    <AppLayout active="calc" embedded={statementEmbedMode}>
      <ContractSaveSuccessOverlay
        visible={Boolean(saveSuccessFlash)}
        celebrationKey={contractSaveCelebrationKey}
      />
      {saving ? (
        <CalculatorSaveLoader
          message={saveMessage}
          hasPdfAttachment={savingIncludesPdfAttachment}
        />
      ) : null}
      <div className="w-full bg-[linear-gradient(180deg,#ffffff_0%,#fbfaff_48%,#ffffff_100%)] px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl font-mono text-slate-900">
      <ValidationErrorModal
        message={validationError}
        onClose={() => setValidationError(null)}
      />
      <DuplicateContractModal
        modal={duplicateModal}
        onCancel={() => setDuplicateModal(null)}
        onConfirm={handleConfirmDuplicateModal}
      />
      <EndorsementDraftModal
        draft={endorsementDraftModalOpen && product !== "neon" ? endorsementDraft : null}
        onCancel={() => {
          setEndorsementDraft(null);
          setEndorsementDraftModalOpen(false);
          setEndorsementWorkflowActive(false);
          setEndorsementDurationManualOverride(false);
          setEndorsementPreviewSource(null);
          setSaveMessage(null);
        }}
        onContinue={() => setEndorsementDraftModalOpen(false)}
      />

      <TipContractModal
        isOpen={tipContractModalOpen}
        draftPercent={tipContractDraftPercent}
        draftEmail={tipContractDraftEmail}
        lookupState={tipContractLookupState}
        userSuggestions={tipContractUserSuggestions}
        suggestionsLoading={tipContractSuggestionsLoading}
        selectedTip={tipContractSelectedTip}
        hasExistingConfig={Boolean(tipContractConfig)}
        canShowTipsButton={canShowTipContractTipsButton}
        isLifeProduct={isLifeProduct}
        exampleGrossFirstYearLabel={tipContractExampleGrossFirstYearLabel}
        exampleAdvisorRemainderLabel={tipContractExampleAdvisorRemainderLabel}
        onClose={() => setTipContractModalOpen(false)}
        onPercentChange={(value) =>
          setTipContractDraftPercent(clampTipContractPercent(value))
        }
        onEmailChange={handleTipContractUserInputChange}
        onSelectUser={selectTipContractUser}
        onLoadTips={loadTipContractTipsForSelectedUser}
        onClear={clearTipContractSettings}
        onApply={applyTipContractSettings}
        applyDisabled={tipContractApplyDisabled}
      />

      <TipContractTipsModal
        isOpen={tipContractTipsModalOpen}
        currentUser={currentTipContractUser}
        loading={tipContractTipsLoading}
        error={tipContractTipsError}
        tips={tipContractTips}
        filteredTips={filteredTipContractTips}
        filter={tipContractTipsFilter}
        counts={tipContractTipCounts}
        selectedTip={tipContractSelectedTip}
        onClose={() => setTipContractTipsModalOpen(false)}
        onFilterChange={setTipContractTipsFilter}
        onSelectTip={selectTipContractTip}
      />

      <SubordinatePickerModal
        isOpen={canOverrideOwnerOnSave && subordinatePickerOpen}
        searchText={subordinateSearchText}
        loading={subordinateLoading}
        error={subordinateLoadError}
        selectedEmail={selectedSubordinateEmail}
        currentUserEmail={normalizedUserEmail}
        options={filteredSubordinateOptions}
        hasSearchQuery={Boolean(subordinateSearchQuery)}
        onClose={() => setSubordinatePickerOpen(false)}
        onSearchTextChange={setSubordinateSearchText}
        onSelectOwnAccount={() => {
          setSelectedSubordinateEmail(null);
          setSubordinatePickerOpen(false);
        }}
        onSelectEmail={(email) => {
          setSelectedSubordinateEmail(email);
          setSubordinatePickerOpen(false);
        }}
      />

      <CalculatorProductPickerModal
        isOpen={productOpen}
        product={hasSelectedProduct ? product : null}
        columns={productPickerColumns}
        activeColumn={activeProductPickerColumn}
        allProducts={allProductPickerProducts}
        filteredProducts={filteredSectionProducts}
        isGlobalSearch={isGlobalSearch}
        searchText={productSearchText}
        onClose={closeProductPicker}
        onSectionChange={setProductPickerSection}
        onSearchTextChange={setProductSearchText}
        onSelectProduct={selectProduct}
      />

      <HelpDialog
        isOpen={addContractHelpOpen}
        onClose={() => setAddContractHelpOpen(false)}
        title={
          hasSelectedProduct
            ? `Nápověda k produktu ${currentProduct.label}`
            : "Nápověda k přidání smlouvy"
        }
        description={
          showNeonAddContractHelp
            ? "Doporučený postup pro nahrání PDF, kontrolu údajů a práci s Refreshem nebo Změnou."
            : showReplacementAddContractHelp
              ? "Doporučený postup pro nahrání PDF, kontrolu údajů a práci s Náhradou."
            : "Doporučený postup pro nahrání PDF, kontrolu údajů a uložení smlouvy jako sepsané."
        }
      >
        <div className="space-y-5 text-sm leading-6 text-slate-700">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-950">
            <p className="font-semibold">Doporučený postup</p>
            <p className="mt-1">
              Když máš smlouvu v PDF, nahraj ji hned na začátku. PDF se po
              uložení přiloží k detailu smlouvy a ve většině případů se z něj
              automaticky propíšou potřebná data.
            </p>
          </div>

          <section>
            <h3 className="text-base font-bold text-slate-950">Originální PDF vs. sken</h3>
            <p className="mt-1">
              Automatické načítání dat aktuálně funguje hlavně u originálních
              PDF smluv. U skenů nebo fotek smluv, což bývá časté u starších
              smluv, může systém PDF přiložit, ale údaje bude většinou potřeba
              doplnit ručně.
            </p>
          </section>

          <section>
            <h3 className="text-base font-bold text-slate-950">Když se něco nenačte</h3>
            <p className="mt-1">
              Může se stát, že aplikace některou informaci z PDF nedohledá,
              nerozpozná produkt nebo si nebude jistá konkrétním údajem. V tom
              případě pole doplň ručně podle smlouvy.
            </p>
          </section>

          <section>
            <h3 className="text-base font-bold text-slate-950">Smlouva z TIPU</h3>
            <p className="mt-1">
              Sjednal jsi smlouvu na základě tipu? Klikni na Smlouva z TIPU a
              zadej firemní e-mail nebo jméno tipaře. Tipař může, ale nemusí být
              v systému Bohemka.App.
            </p>
            <p className="mt-2">
              Potom nastav procenta pro tipaře a potvrď. Tipařská část se ti
              automaticky odečte ze vznikové provize.
            </p>
          </section>

          {showNeonAddContractHelp && (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">
                ČPP ŽP NEON
              </p>
              <div className="mt-3 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-950">Refresh smlouvy</h3>
                  <p className="mt-1">
                    Správného výpočtu provize lze dosáhnout pouze tehdy, když je
                    v systému uložená původní smlouva. Pokud původní smlouva v
                    systému není, smlouvu lze uložit i tak, ale je potřeba
                    zaškrtnout možnost Původní smlouva není v systému.
                  </p>
                  <p className="mt-2">
                    Po následném nahrání provizního výpisu se taková smlouva
                    automaticky aktualizuje podle údajů z výpisu.
                  </p>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-950">Změna smlouvy</h3>
                  <p className="mt-1">
                    U změny zadej nové celkové pojistné ze smlouvy, ne jen rozdíl
                    oproti původní částce. Systém nové pojistné porovná s
                    pojistným z původní smlouvy.
                  </p>
                  <p className="mt-2">
                    Podle výsledku porovnání dojde buď k ponížení provize, nebo
                    k vyplacení provize za navýšení.
                  </p>
                </div>
              </div>
            </section>
          )}

          {showReplacementAddContractHelp && (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">
                Náhrada smlouvy
              </p>
              <p className="mt-2">
                V případě náhrady můžeš zadat číslo původní smlouvy. Pokud se
                původní smlouva najde v systému, při uložení nové smlouvy se
                automaticky označí jako stornovaná k datu počátku nové smlouvy.
              </p>
            </section>
          )}

          <section>
            <h3 className="text-base font-bold text-slate-950">Kontrola před uložením</h3>
            <p className="mt-1">
              Před kliknutím na tlačítko Uložit jako sepsáno vždy zkontroluj
              hlavně produkt, jméno klienta, číslo smlouvy, datum uzavření,
              pojistné, frekvenci platby, pozici a režim provize. Uložením se
              smlouva začne používat v produkci, výplatách a dalších přehledech.
            </p>
          </section>
        </div>
      </HelpDialog>

      <div className="w-full max-w-6xl space-y-6">
        {/* Header */}
        <header
          className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
            !hasSelectedProduct ? "mx-auto w-full max-w-4xl" : ""
          }`}
        >
          <SplitTitle text={headerTitle} className="!text-slate-900" />
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {showAddContractHelp && (
              <button
                type="button"
                onClick={() => setAddContractHelpOpen(true)}
                aria-label="Otevřít nápovědu k přidání smlouvy"
                title="Nápověda"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-200 bg-white/90 text-violet-800 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:border-violet-300 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-600"
              >
                <CircleHelp className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
              </button>
            )}
            {!tipsterModeEnabled && (
              <div className="inline-flex items-center rounded-full border border-violet-200 bg-white/85 p-1 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => setCalculatorViewMode("addContract")}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:px-4 sm:text-sm ${
                    isAddContractMode
                      ? "bg-violet-700 !text-white shadow-[0_8px_20px_rgba(109,40,217,0.18)]"
                      : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"
                  }`}
                >
                  Přidat smlouvu
                </button>
                <button
                  type="button"
                  onClick={() => setCalculatorViewMode("commissionOnly")}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:px-4 sm:text-sm ${
                    isCommissionOnlyMode
                      ? "bg-violet-700 !text-white shadow-[0_8px_20px_rgba(109,40,217,0.18)]"
                      : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"
                  }`}
                >
                  Kalkulačka provizí
                </button>
              </div>
            )}
          </div>
        </header>
        {(isCommissionOnlyMode || tipsterModeEnabled) && (
          <div className="flex justify-start sm:justify-end">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-violet-200 bg-white/85 px-3 py-2 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                Režim tipařské spolupráce
              </span>
              <button
                type="button"
                onClick={() => void persistTipsterMode(!tipsterModeEnabled)}
                disabled={tipsterModeSaving}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  tipsterModeEnabled
                    ? "border-violet-700 bg-violet-700 !text-white shadow-[0_10px_22px_rgba(109,40,217,0.18)]"
                    : "border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                }`}
                aria-pressed={tipsterModeEnabled}
                aria-label="Přepnout režim tipařské spolupráce"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    tipsterModeEnabled ? "bg-white" : "bg-violet-300"
                  }`}
                  aria-hidden="true"
                />
                {tipsterModeSaving ? "Ukládám…" : tipsterModeEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}

        {!hasSelectedProduct ? (
          <div className="flex min-h-[calc(100vh-18rem)] items-center justify-center py-6">
            <div className="w-full max-w-4xl">
              {renderProductAndPdfSection(true)}
            </div>
          </div>
        ) : (
        <div className="grid gap-5 items-start lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3.5 w-full lg:max-w-3xl">
            <div id="auto-bulk-review-form-anchor" className="scroll-mt-28" />
            {/* Produkt + PDF import */}
            {renderProductAndPdfSection(false)}
            {renderAutoBulkImportPanel()}

            <section className="space-y-3 rounded-[1.1rem] border border-white/80 bg-white/80 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl">
              {/* Doba trvání + platba */}
              <CalculatorDurationAndFrequencySection
                embedded
                product={product}
                durationHelp={durationHelp}
                durationHelpOpen={durationHelpOpen}
                durationYears={durationYears}
                durationMonths={durationMonths}
                durationSourceLabel={endorsementOriginalDurationLabel}
                durationUsingOriginal={endorsementUsesOriginalDuration}
                missingFields={missingFields}
                maxCizinKomplexVariant={maxCizinKomplexVariant}
                maxCizinOptions={MAX_CIZIN_KOMPLEX_VARIANT_OPTIONS}
                hasFrequencyPicker={hasFrequencyPicker}
                isLifeProduct={isLifeProduct}
                frequency={frequency}
                allowedFrequencies={allowed}
                comfortGradual={comfortGradual}
                amountText={amountText}
                onToggleDurationHelp={() => setDurationHelpOpen((prev) => !prev)}
                onDurationYearsChange={(value) => {
                  if (endorsementPreviewContextActive && endorsementPreviewSource) {
                    setEndorsementDurationManualOverride(true);
                  }
                  setDurationYears(value);
                }}
                onDurationMonthsChange={(value) => {
                  if (endorsementPreviewContextActive && endorsementPreviewSource) {
                    setEndorsementDurationManualOverride(true);
                  }
                  setDurationMonths(value);
                }}
                onUseOriginalDuration={handleUseOriginalEndorsementDuration}
                onEditDuration={() => setEndorsementDurationManualOverride(true)}
                onMaxCizinVariantChange={setMaxCizinKomplexVariant}
                onFrequencyChange={setFrequency}
                onAmountTextChange={setAmountText}
              />

              <CalculatorAmountAndActionsSection
                embedded
                showAmountInput={false}
                product={product}
                frequency={frequency}
                isLifeProduct={isLifeProduct}
                tipsterModeEnabled={tipsterModeEnabled}
                showContractActions={isAddContractMode}
                showManualEntryOption={isCommissionOnlyMode}
                comfortGradual={comfortGradual}
                amountText={amountText}
                comfortPaymentText={comfortPaymentText}
                comfortTargetAmountText={comfortTargetAmountText}
                comfortPayoutCount={comfortPayoutCount}
                missingFields={missingFields}
                hasTipContractConfig={Boolean(tipContractConfig)}
                refreshOriginalOpen={refreshOriginalOpen}
                refreshOriginalContractNumber={refreshOriginalContractNumber}
                refreshOriginalMissingInSystem={refreshOriginalMissingInSystem}
                refreshOriginalLookupStatus={refreshOriginalLookup.status}
                refreshOriginalLookupProgress={refreshOriginalLookup.progress}
                refreshOriginalLookupAdviserName={refreshOriginalLookup.adviserName}
                refreshOriginalInfoText={neonRefreshInfoText}
                inlineEndorsementDraft={product === "neon" ? endorsementDraft : null}
                onComfortGradualChange={setComfortGradual}
                onAmountTextChange={setAmountText}
                onComfortPaymentTextChange={setComfortPaymentText}
                onComfortTargetAmountTextChange={setComfortTargetAmountText}
                onRefreshOriginalContractNumberChange={(value) => {
                  setRefreshOriginalContractNumber(value);
                  setRefreshOriginalPdfLookupNumber(null);
                }}
                onRefreshOriginalMissingInSystemChange={(value) => {
                  setRefreshOriginalMissingInSystem(value);
                  setRefreshOriginalPdfLookupNumber(null);
                  if (value) {
                    setRefreshOriginalContractNumber("");
                    setRefreshOriginalLookup({
                      status: "idle",
                      progress: 0,
                      adviserName: null,
                      original: null,
                    });
                  }
                }}
                onOpenTipContractModal={openTipContractModal}
                onToggleRefreshOriginal={() => {
                  const nextRefreshOpen = !refreshOriginalOpen;
                  if (nextRefreshOpen) {
                    setEndorsementDraft(null);
                    setEndorsementDraftModalOpen(false);
                    setEndorsementWorkflowActive(false);
                    setEndorsementDurationManualOverride(false);
                    setEndorsementPreviewSource(null);
                    setSaveMessage(null);
                  } else {
                    setRefreshOriginalMissingInSystem(false);
                    setRefreshOriginalPdfLookupNumber(null);
                  }
                  setRefreshOriginalOpen(nextRefreshOpen);
                }}
                onPrepareEndorsement={() => {
                  void handlePrepareEndorsement();
                }}
                onCancelEndorsement={() => {
                  setEndorsementDraft(null);
                  setEndorsementDraftModalOpen(false);
                  setEndorsementWorkflowActive(false);
                  setEndorsementDurationManualOverride(false);
                  setEndorsementPreviewSource(null);
                  setSaveMessage(null);
                }}
                onSwitchToManualEntry={() => setCalculatorViewMode("addContract")}
              />
            </section>

            <CalculatorContractDetailsSection
              isVisible={!tipsterModeEnabled && isAddContractMode}
              missingFields={missingFields}
              clientName={clientName}
              pdfClientNameLoaded={pdfClientNameLoaded}
              pdfMatchedClientName={pdfMatchedClientName}
              filteredClientSuggestions={filteredClientSuggestions}
              clientSuggestionsOpen={clientSuggestionsOpen}
              clientSuggestionHint={
                statementClientNamePrefillActive
                  ? "Možná shoda v databázi podle jména bez diakritiky, obráceného pořadí nebo drobného překlepu."
                  : null
              }
              contractSignedDate={contractSignedDate}
              contractNumber={contractNumber}
              contractNumberLiveCheckStatus={contractNumberLiveCheck.status}
              contractNumberLiveCheckCount={
                contractNumberLiveCheck.status === "duplicate" ||
                contractNumberLiveCheck.status === "foundForEndorsement"
                  ? contractNumberLiveCheck.count
                  : null
              }
              contractNumberLiveCheckMode={
                endorsementWorkflowActive ? "endorsement" : "newContract"
              }
              policyStartDate={policyStartDate}
              contractDateErrorText={contractDateErrorText}
              contractDateWarningText={contractDateWarningText}
              showPolicyEndDateField={showPolicyEndDateField}
              policyEndDate={policyEndDate}
              stornoDate={stornoDate}
              onClientNameChange={(value) => {
                setClientName(value);
                setPdfClientNameLoaded(false);
                setPdfMatchedClientName(false);
                setStatementClientNamePrefillActive(false);
                setClientSuggestionsOpen(true);
              }}
              onClientNameFocus={() => setClientSuggestionsOpen(true)}
              onClientNameBlur={() => {
                setTimeout(() => setClientSuggestionsOpen(false), 100);
              }}
              onSelectClientSuggestion={(name) => {
                setClientName(name);
                setPdfClientNameLoaded(false);
                setPdfMatchedClientName(false);
                setStatementClientNamePrefillActive(false);
                setMissingFields((prev) => prev.filter((key) => key !== "jméno klienta"));
                setClientSuggestionsOpen(false);
              }}
              onContractSignedDateChange={setContractSignedDate}
              onContractNumberChange={setContractNumber}
              onPolicyStartDateChange={setPolicyStartDate}
              onPolicyEndDateChange={setPolicyEndDate}
              onStornoDateChange={setStornoDate}
            />

            <CalculatorPositionModeSection
              isVisible={!tipsterModeEnabled}
              product={product}
              position={position}
              allowedPositions={allowedPositionOptions}
              positionDisabled={positionLockedToTimeline}
              canChooseMode={canChooseMode}
              mode={mode}
              isNeonHistoricalBySignedDate={isNeonHistoricalBySignedDate}
              onPositionChange={canChoosePositionManually ? setPosition : () => {}}
              onModeChange={setMode}
            />

            <CalculatorAutoPdfDetailSummary
              items={autoPdfDetailItems}
              hullSumPrompt={autoHullSumPrompt}
              editor={autoPdfDetailEditor}
            />

            <CalculatorDomexPdfDetailSummary
              items={domexPdfDetailItems}
              editor={domexPdfDetailEditor}
            />

            <CalculatorNeonPdfDetailSummary
              items={neonPdfDetailItems}
              editor={neonPdfDetailEditor}
            />
          </div>

          <CalculatorResultsSection
            topTools={
              canOverrideOwnerOnSave && isAddContractMode ? (
                <div className="relative overflow-hidden rounded-[1.35rem] border border-white/80 bg-white/80 px-3 py-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#4c1d95_100%)]" aria-hidden="true" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Uložení smlouvy
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {selectedSaveOwnerLabel}
                      </p>
                      {subordinateTimelineStatusText && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          {subordinateTimelineStatusText}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubordinatePickerOpen(true)}
                      className="ui-focus inline-flex shrink-0 items-center gap-2 rounded-full border border-violet-700 bg-violet-700 px-3 py-1.5 text-xs font-black !text-white shadow-[0_12px_26px_rgba(109,40,217,0.18)] transition hover:-translate-y-0.5 hover:bg-violet-800"
                    >
                      <Users size={14} aria-hidden="true" />
                      Vybrat poradce
                    </button>
                  </div>
                </div>
              ) : null
            }
            tipsterModeEnabled={tipsterModeEnabled}
            showSaveActions={isAddContractMode}
            tipsterPercentPanelOpen={tipsterPercentPanelOpen}
            tipsterPercent={tipsterPercent}
            tipsterPercentPresets={TIPSTER_PERCENT_PRESETS}
            saveMessage={saveMessage}
            tipContractConfig={
              tipContractConfig
                ? {
                    tipsterPercent: tipContractConfig.tipsterPercent,
                    tipsterName: tipContractConfig.tipsterName ?? null,
                    tipsterEmail: tipContractConfig.tipsterEmail ?? null,
                  }
                : null
            }
            unsupported={unsupported}
            supportedLabel={SUPPORTED_LABEL}
            items={displayedCommissionItems}
            tipsterImmediateCommission={displayedTipsterImmediateCommission}
            product={product}
            position={position}
            mode={mode}
            hideAnnualAutoTotals={
              (isAutoProduct(product) &&
                (frequency === "annual" || !isFrequencyAutoPayoutProduct(product))) ||
              ((product === "domex" || product === "cppbytex") && frequency === "annual")
            }
            paymentBasedTotalsMemo={displayedPaymentBasedTotals}
            tipContractImmediateGrossFirstYear={displayedTipContractImmediateGrossFirstYear}
            tipContractTipsterAmountFirstYear={displayedTipContractTipsterAmountFirstYear}
            tipContractImmediateNetFirstYear={displayedTipContractImmediateNetFirstYear}
            tipContractTotalNet={displayedTipContractTotalNet}
            total={displayedCommissionTotal}
            saving={saving}
            canSaveContract={
              isAddContractMode &&
              hasSelectedProduct &&
              !saving &&
              !autoBulkImporting &&
              parseNumber(amountText) > 0 &&
              !autoHullSumNeedsInput &&
              !effectivePositionTimelineLoading &&
              effectivePositionTimeline.length > 0 &&
              (endorsementPreviewContextActive ? Boolean(endorsementDraft) : items.length > 0)
            }
            saveButtonLabel={
              endorsementDraft
                ? "Uložit dodatek jako sepsáno"
                : endorsementPreviewContextActive
                ? "Nejdřív klikni na Změna"
                : "Uložit jako sepsáno"
            }
            savingButtonLabel={endorsementDraft ? "Ukládám dodatek…" : "Ukládám smlouvu…"}
            lastSavedContractHref={lastSavedContractHref}
            showAddToQueue={
              statementEmbedMode &&
              statementEmbedParentAvailable &&
              statementCppA101QueueEligible &&
              isAddContractMode &&
              (product === "cppAuto" || product === "domex") &&
              !tipsterModeEnabled &&
              !originalReplacementWorkflowActive &&
              !endorsementDraft &&
              !endorsementWorkflowActive &&
              !endorsementDuplicateCandidateActive
            }
            canAddToQueue={!saving && !pdfImporting && !autoBulkImporting}
            onOpenCoefModal={() => setShowCoefModal(true)}
            onToggleTipsterPercentPanel={() => setTipsterPercentPanelOpen((prev) => !prev)}
            onTipsterPercentDraft={setTipsterPercentDraft}
            onPersistTipsterPercent={persistTipsterPercent}
            onSaveContract={() => {
              void handleSaveContract();
            }}
            onAddToQueue={handleAddCppA101ToStatementQueue}
          />
        </div>
        )}
      </div>

      {hasSelectedProduct && (
      <CalculatorCoefficientModal
        isOpen={showCoefModal}
        product={product}
        productLabel={productLabel(product)}
        positionLabel={positionLabel(position)}
        mode={mode}
        coefficientView={neonCoefficientView}
        isNeonHistorical={isNeonHistoricalInCoefModal}
        isCppAutoHistorical={isCppAutoHistoricalInCoefModal}
        isAllianzAutoHistorical={isAllianzAutoHistoricalInCoefModal}
        isCsobAutoHistorical={isCsobAutoHistoricalInCoefModal}
        isUniqaAutoHistorical={isUniqaAutoHistoricalInCoefModal}
        isUniqaAutoEarlyHistorical={isUniqaAutoEarlyHistoricalInCoefModal}
        isUniqaFlotilaHistorical={isUniqaFlotilaHistoricalInCoefModal}
        isPillowAutoHistorical={isPillowAutoHistoricalInCoefModal}
        isKooperativaAutoHistorical={isKooperativaAutoHistoricalInCoefModal}
        isDomexEarlyHistorical={isDomexEarlyHistoricalInCoefModal}
        isDomexHistorical={isDomexHistoricalInCoefModal}
        isMaxEfekt5={isMaxEfekt5InCoefModal}
        isMaxEfekt7={isMaxEfekt7InCoefModal}
        coefExplanation={coefExplanation}
        immediatePayoutInfo={immediatePayoutInfo}
        coefList={coefList}
        showAutoTermsValidityNote={
          isAutoProduct(product) &&
          product !== "cppAuto" &&
          product !== "allianzAuto" &&
          product !== "csobAuto" &&
          product !== "uniqaAuto" &&
          product !== "uniqaflotila" &&
          product !== "slaviaflotila" &&
          product !== "pillowAuto" &&
          product !== "kooperativaAuto"
        }
        showAutoTermsPreview={showAutoTermsPreview}
        autoTermsPreviewUrl={autoTermsPreviewUrl}
        showNeonTermsPreview={showNeonTermsPreview}
        neonTermsPreviewUrl={neonTermsPreviewUrl}
        neonPreviewBlobUrl={neonPreviewBlobUrl}
        neonPreviewLoading={neonPreviewLoading}
        neonPreviewError={neonPreviewError}
        neonDocAction={neonDocAction}
        onClose={() => setShowCoefModal(false)}
        onCoefficientViewChange={setNeonCoefficientView}
        onNeonDocumentAction={handleNeonDocumentAction}
      />
      )}
      </div>
      </div>
    </AppLayout>
  );
}
