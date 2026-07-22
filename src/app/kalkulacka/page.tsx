// src/app/kalkulacka/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
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
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculateMaxCizinKomplex,
  calculatePillowInjury,
  calculateDomex,
  calculateCppHafan,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateKoopOdzam,
  calculateKoopPmop,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateSlaviaFlotila,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateAllianzAuto,
  calculateAllianzMujDomov,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateKoopFlotila,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateKoopCestovko,
  calculateComfortCC,
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
  isDomexHistoricalPeriod,
  isSlaviaAutoSupportedForSignedDate,
  isSlaviaFlotilaSupportedForSignedDate,
  SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE,
} from "../lib/productFormulas";
import {
  calculateNeonRefreshCommissionBase,
  type NeonRefreshCommissionBase,
} from "../lib/productFormulas/neon";
import {
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  PRODUCT_OPTIONS,
  productInstitutionId as productInstitutionIdFromCatalog,
  productLabel as productLabelFromCatalog,
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
import { type PdfOcrProgress } from "@/app/lib/pdfOcr";
import { AppLayout } from "@/components/AppLayout";
import {
  ADMIN_IMPERSONATION_EVENT,
  readAdminImpersonationState,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { formatMoney, positionLabel, toDate } from "@/app/lib/formatters";
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
  type ContractEntryType,
  type EndorsementChangeType,
  type EndorsementSourceEntry,
  type EndorsementDraft,
  toNonNegativeNumber,
  compareSourceEntriesByRecency,
  resolveEffectivePremium,
  isoDayFromUnknown,
  normalizeClientNameForSystemMatch,
} from "./calculatorHelpers";
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


// ---------- Pomocné ----------

const LIFE_PRODUCTS = LIFE_PRODUCTS_LIST;
const SETTINGS_KEYS = {
  mode: "settings.mode",
  tipsterMode: "settings.tipsterMode",
  tipsterPercent: "settings.tipsterPercent",
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
const DOMEX_HISTORICAL_TERMS_PREVIEW_URL = "/provize/domex2023.pdf";
const MAX_CIZIN_KOMPLEX_VARIANT_OPTIONS: {
  id: MaxCizinKomplexVariant;
  label: string;
}[] = [
  { id: "exclusiveStandard", label: "EXCLUSIVE / STANDARD" },
  { id: "premium", label: "PREMIUM" },
];
const CONTRACTS_CREATE_IDEMPOTENCY_HEADER = "x-idempotency-key";
const CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL = "jakub.rauscher@bohemika.eu";
const ORIGINAL_REPLACEMENT_PRODUCTS = new Set<Product>(["neon", "domex", "cppAuto"]);
const POLICY_END_DATE_PRODUCTS = new Set<Product>([
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
]);
const isKooperativaAutoDetailProduct = (product: Product): boolean =>
  product === "kooperativaAuto" || product === "koopflotila";
const isSlaviaAutoDetailProduct = (product: Product): boolean =>
  product === "slaviaauto" || product === "slaviaflotila";
const isUniqaAutoDetailProduct = (product: Product): boolean =>
  product === "uniqaAuto";
const AUTO_HULL_USUAL_PRICE_TEXT = "Obvyklá cena vozidla";
const CLIENT_SUGGESTIONS_PAGE_LIMIT = 50;
const CLIENT_SUGGESTIONS_MAX_PAGES = 40;

type CalculatorViewMode = "addContract" | "commissionOnly";
type ParsedContractPdf = Record<string, any>;
type PdfParserOptions = {
  onOcrStart?: () => void;
  onOcrProgress?: (progress: PdfOcrProgress) => void;
};
type PrepareEndorsementOptions = {
  productOverride?: Product;
  contractNumberOverride?: string | null;
  contractSignedDateOverride?: string | null;
  newPremiumAmountOverride?: number | null;
  source?: "manual" | "pdf";
};

const PDF_IMPORT_REQUIRED_FIELD_MESSAGES: Record<string, string> = {
  clientName: "pojistníka",
  contractNumber: "číslo smlouvy",
  contractSignedDate: "datum sjednání",
  policyStartDate: "počátek pojištění",
  frequency: "frekvenci plateb",
  amount: "částku pojistného",
};

function parsedTextValue(parsed: ParsedContractPdf, key: string): string {
  if (!(key in parsed)) return "";
  const value = parsed[key];
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function parsedNumberValue(parsed: ParsedContractPdf, key: string): number | null {
  if (!(key in parsed)) return null;
  const value = Number(parsed[key]);
  return Number.isFinite(value) ? value : null;
}

function buildPdfImportIssueMessage({
  product,
  parsed,
}: {
  product: Product;
  parsed: ParsedContractPdf;
}): string | null {
  const contractNumber = parsedTextValue(parsed, "contractNumber");
  const clientName = parsedTextValue(parsed, "clientName");
  const policyStartDate = parsedTextValue(parsed, "policyStartDate");
  const contractSignedDate = parsedTextValue(parsed, "contractSignedDate");
  const amount = parsedNumberValue(parsed, "amount");
  const parsedFrequencyRaw = parsedTextValue(parsed, "frequency");
  const parsedFrequency = parsed.frequency as PaymentFrequency | null | undefined;
  const frequencyAllowed =
    parsedFrequency != null && allowedFrequencies(product).includes(parsedFrequency);
  const contractSignedDateInvalid = Boolean(contractSignedDate && !isIsoDay(contractSignedDate));
  const policyStartDateInvalid = Boolean(policyStartDate && !isIsoDay(policyStartDate));
  const signedDateAfterPolicyStart =
    isIsoDay(contractSignedDate) &&
    isIsoDay(policyStartDate) &&
    contractSignedDate > policyStartDate;

  const missing = [
    ["clientName", clientName],
    ["contractNumber", contractNumber],
    ["contractSignedDate", contractSignedDate],
    ["policyStartDate", policyStartDate],
    ["frequency", parsedFrequencyRaw || (parsedFrequency ? String(parsedFrequency) : "")],
    ["amount", amount == null ? "" : String(amount)],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => PDF_IMPORT_REQUIRED_FIELD_MESSAGES[key])
    .filter((value): value is string => Boolean(value));

  const warnings: string[] = [];
  if (clientName && clientName.split(/\s+/).filter(Boolean).length < 2) {
    warnings.push("Klient: jméno vypadá neúplně");
  }
  if (contractNumber && !/^\d{6,14}$/.test(contractNumber.replace(/\s+/g, ""))) {
    warnings.push("Smlouva: číslo má nezvyklý formát");
  }
  if (contractSignedDateInvalid) {
    warnings.push("Datum sjednání: datum má nezvyklý formát");
  } else if (signedDateAfterPolicyStart) {
    warnings.push("Datum sjednání: sjednání je po počátku pojištění");
  }
  if (policyStartDateInvalid) {
    warnings.push("Počátek: datum má nezvyklý formát");
  }
  if (parsedFrequency && !frequencyAllowed) {
    warnings.push("Frekvence: není pro vybraný produkt povolená");
  }
  if (amount != null && amount <= 0) {
    warnings.push("Částka: není kladná");
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Nenašel jsem ${missing.join(", ")}.`);
  }
  if (warnings.length > 0) {
    parts.push(`Podezřelé hodnoty: ${warnings.join("; ")}.`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" ")} Doplň nebo zkontroluj ručně před uložením.`;
}

function unreadablePdfImportMessage({
  product,
  productDetected,
}: {
  product: Product;
  productDetected: boolean;
}): string {
  const productPart = productDetected
    ? `PDF jsem rozpoznal jako ${productLabelFromCatalog(product, product)}, ale`
    : `Produkt z PDF jsem nerozpoznal a`;
  return `${productPart} nenašel jsem čitelné hodnoty smlouvy. Zkontroluj vybraný produkt, případně údaje doplň ručně.`;
}

async function detectProductFromPdfLazy(file: File) {
  const { detectProductFromPdf } = await import("../lib/detectProductFromPdf");
  return detectProductFromPdf(file);
}

async function parseMaxCizinKomplexPdfLazy(file: File): Promise<ParsedContractPdf> {
  const { parseMaxCizinKomplexPdf } = await import(
    "../lib/parseMaxCizinKomplexPdf"
  );
  return parseMaxCizinKomplexPdf(file);
}

async function parseContractPdfByProduct(
  product: Product,
  file: File,
  options: PdfParserOptions = {}
): Promise<ParsedContractPdf | null> {
  switch (product) {
    case "cppAuto": {
      const { parseCppAutoPdf } = await import("../lib/parseCppAutoPdf");
      return parseCppAutoPdf(file);
    }
    case "slaviaauto": {
      const { parseSlaviaAutoPdf } = await import("../lib/parseSlaviaAutoPdf");
      return parseSlaviaAutoPdf(file);
    }
    case "allianzAuto": {
      const { parseAllianzAutoPdf } = await import("../lib/parseAllianzAutoPdf");
      return parseAllianzAutoPdf(file);
    }
    case "csobAuto": {
      const { parseCsobAutoPdf } = await import("../lib/parseCsobAutoPdf");
      return parseCsobAutoPdf(file);
    }
    case "uniqaAuto": {
      const { parseUniqaAutoPdf } = await import("../lib/parseUniqaAutoPdf");
      return parseUniqaAutoPdf(file);
    }
    case "pillowAuto": {
      const { parsePillowAutoPdf } = await import("../lib/parsePillowAutoPdf");
      return parsePillowAutoPdf(file);
    }
    case "kooperativaAuto": {
      const { parseKooperativaAutoPdf } = await import(
        "../lib/parseKooperativaAutoPdf"
      );
      return parseKooperativaAutoPdf(file);
    }
    case "neon": {
      const { parseNeonPdf } = await import("../lib/parseNeonPdf");
      return parseNeonPdf(file);
    }
    case "flexi": {
      const { parseFlexiPdf } = await import("../lib/parseFlexiPdf");
      return parseFlexiPdf(file);
    }
    case "domex": {
      const { parseDomexPdf } = await import("../lib/parseDomexPdf");
      return parseDomexPdf(file, options);
    }
    case "cpphafan": {
      const { parseCppHafanPdf } = await import("../lib/parseCppHafanPdf");
      return parseCppHafanPdf(file);
    }
    case "koopodzam": {
      const { parseKoopOdzamPdf } = await import("../lib/parseKoopOdzamPdf");
      return parseKoopOdzamPdf(file);
    }
    case "maxdomov": {
      const { parseMaxdomovPdf } = await import("../lib/parseMaxdomovPdf");
      return parseMaxdomovPdf(file);
    }
    case "maxcizinkomplex":
      return parseMaxCizinKomplexPdfLazy(file);
    case "comfortcc": {
      const { parseComfortPdf } = await import("../lib/parseComfortPdf");
      return parseComfortPdf(file);
    }
    case "cppcestovko": {
      const { parseCppCestovkoPdf } = await import("../lib/parseCppCestovkoPdf");
      return parseCppCestovkoPdf(file);
    }
    case "axacestovko": {
      const { parseAxaCestovkoPdf } = await import("../lib/parseAxaCestovkoPdf");
      return parseAxaCestovkoPdf(file);
    }
    case "cppsimplex": {
      const { parseCppSimplexPdf } = await import("../lib/parseCppSimplexPdf");
      return parseCppSimplexPdf(file);
    }
    case "zamex": {
      const { parseCppZamexPdf } = await import("../lib/parseCppZamexPdf");
      return parseCppZamexPdf(file);
    }
    default:
      return null;
  }
}

function supportsOriginalContractReplacement(product: Product): boolean {
  return ORIGINAL_REPLACEMENT_PRODUCTS.has(product);
}

function supportsPolicyEndDate(product: Product): boolean {
  return POLICY_END_DATE_PRODUCTS.has(product);
}

function originalReplacementLabel(product: Product): string {
  return product === "neon" ? "Refresh" : "Náhrada";
}

function stableSerializeForIdempotency(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeForIdempotency(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerializeForIdempotency(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashFnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildContractsCreateIdempotencyKey(entry: Record<string, unknown>): string {
  const stable = stableSerializeForIdempotency(entry);
  const forward = hashFnv1a32(stable);
  const backward = hashFnv1a32(stable.split("").reverse().join(""));
  return `contracts-create:v1:${forward}${backward}`;
}

function formatMoneyResult(value: number | undefined | null): string {
  return formatMoney(value, {
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });
}

const paymentsPerYear = (f: PaymentFrequency) =>
  f === "monthly" ? 12 : f === "quarterly" ? 4 : f === "semiannual" ? 2 : 1;

const frequencyLabel = (f: PaymentFrequency) => {
  switch (f) {
    case "monthly":
      return "měsíční";
    case "quarterly":
      return "čtvrtletní";
    case "semiannual":
      return "pololetní";
    case "annual":
      return "roční";
  }
};

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: { clientName?: string | null }[];
  hasMore?: boolean;
  nextCursor?: number | null;
  nextCursorToken?: string | null;
};

type ContractsFindApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: Array<{
    id?: string;
    entryType?: string | null;
    contractNumber?: string | null;
    clientName?: string | null;
    adviserEmail?: string | null;
    adviserName?: string | null;
    userEmail?: string | null;
    productKey?: Product | null;
    rootContractEntryId?: string | null;
    effectiveInputAmount?: number | null;
    newInputAmount?: number | null;
    inputAmount?: number | null;
    refreshCommissionBase?: {
      calculationMonthlyPremium?: number | null;
      calculationAnnualPremium?: number | null;
    } | null;
    policyStartDate?: unknown;
    contractSignedDate?: unknown;
    createdAt?: unknown;
    lifePremiumChanges?: Array<{
      premiumAmount?: number | null;
      policyStartDate?: unknown;
      contractSignedDate?: unknown;
      createdAt?: unknown;
    }> | null;
  }>;
};

type ContractsFindItem = NonNullable<ContractsFindApiResponse["contracts"]>[number];

function finitePositiveNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function resolveRefreshOriginalContractInfo(
  contract: ContractsFindItem
): RefreshOriginalContractInfo | null {
  const changes = Array.isArray(contract.lifePremiumChanges)
    ? contract.lifePremiumChanges
    : [];
  const latestPremiumChange = [...changes]
    .reverse()
    .find((change) => finitePositiveNumber(change?.premiumAmount) != null);
  const premiumAmount =
    finitePositiveNumber(latestPremiumChange?.premiumAmount) ??
    finitePositiveNumber(contract.newInputAmount) ??
    finitePositiveNumber(contract.effectiveInputAmount) ??
    finitePositiveNumber(contract.inputAmount);
  if (premiumAmount == null) return null;
  const stornoBasePremiumAmount =
    finitePositiveNumber(contract.refreshCommissionBase?.calculationMonthlyPremium) ??
    (finitePositiveNumber(contract.refreshCommissionBase?.calculationAnnualPremium) != null
      ? finitePositiveNumber(contract.refreshCommissionBase?.calculationAnnualPremium)! / 12
      : null) ??
    premiumAmount;

  const firstChangeWithDate = changes.find(
    (change) =>
      Boolean(isoDayFromUnknown(change?.contractSignedDate)) ||
      Boolean(isoDayFromUnknown(change?.policyStartDate))
  );
  const stornoStartDateIso =
    isoDayFromUnknown(firstChangeWithDate?.policyStartDate) ??
    isoDayFromUnknown(contract.policyStartDate) ??
    isoDayFromUnknown(firstChangeWithDate?.contractSignedDate) ??
    isoDayFromUnknown(contract.contractSignedDate);

  return {
    premiumAmount,
    stornoBasePremiumAmount,
    stornoStartDateIso,
  };
}

type ContractsPrecheckApiResponse = {
  ok?: boolean;
  error?: string;
  similarContracts?: Array<{
    id?: string;
    contractNumber?: string | null;
    ownerEmail?: string | null;
  }>;
};

type ContractsMutationResponse = {
  ok?: boolean;
  error?: string;
  entryId?: string;
  refreshOriginalEntryId?: string | null;
  idempotentReplay?: boolean;
  [key: string]: unknown;
};

type ContractAttachmentUploadResponse = {
  ok?: boolean;
  error?: string;
  attachment?: {
    hasFile?: boolean;
    originalName?: string | null;
    sizeBytes?: number | null;
  } | null;
};

type TeamOverviewApiResponse = {
  ok?: boolean;
  error?: string;
  members?: Array<{
    email?: string | null;
    name?: string | null;
    managerEmail?: string | null;
    position?: Position | null;
    commissionMode?: CommissionMode | null;
  }>;
};

type TeamOverviewPositionTimelineReadApiResponse = {
  ok?: boolean;
  error?: string;
  targetEmail?: string | null;
  positionTimeline?: unknown;
};

type SubordinateOption = {
  email: string;
  name: string;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

type ContractNumberLiveCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "duplicate"; count: number }
  | { status: "error" };

type RefreshOriginalContractInfo = {
  premiumAmount: number;
  stornoBasePremiumAmount: number;
  stornoStartDateIso: string | null;
};

type RefreshOriginalLookupStatus =
  | "idle"
  | "checking"
  | "found"
  | "notFound"
  | "wrongProduct"
  | "error";

type RefreshOriginalLookupState = {
  status: RefreshOriginalLookupStatus;
  progress: number;
  adviserName: string | null;
  original: RefreshOriginalContractInfo | null;
};

type ManagerSnapshotApiChainEntry = {
  email?: string | null;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
};

type ManagerSnapshotApiResponse = {
  ok?: boolean;
  error?: string;
  ownerEmail?: string | null;
  managerEmail?: string | null;
  managerPosition?: Position | null;
  managerMode?: CommissionMode | null;
  managerChain?: ManagerSnapshotApiChainEntry[];
};

async function requestContractsMutationWithAuth({
  user,
  path,
  method,
  payload,
  idempotencyKey,
}: {
  user: User;
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: unknown;
  idempotencyKey?: string | null;
}): Promise<{
  response: Response;
  data: ContractsMutationResponse | null;
}> {
  let token = await user.getIdToken();
  const request = async (idToken: string) =>
    fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(idempotencyKey
          ? { [CONTRACTS_CREATE_IDEMPOTENCY_HEADER]: idempotencyKey }
          : {}),
      },
      body: JSON.stringify(payload),
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  const raw = await response.text();
  let data: ContractsMutationResponse | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as ContractsMutationResponse;
    } catch {
      data = null;
    }
  }

  return { response, data };
}

async function uploadContractPdfAttachmentWithAuth({
  user,
  ownerEmail,
  entryId,
  file,
}: {
  user: User;
  ownerEmail: string;
  entryId: string;
  file: File;
}): Promise<ContractAttachmentUploadResponse> {
  const form = new FormData();
  form.set("ownerEmail", ownerEmail);
  form.set("entryId", entryId);
  form.set("file", file);

  return fetchAuthedJsonOrThrow<ContractAttachmentUploadResponse>(
    user,
    "/api/contracts/attachment",
    {
      method: "POST",
      body: form,
    }
  );
}

async function requestBlobWithAuth({
  user,
  path,
}: {
  user: User;
  path: string;
}): Promise<Response> {
  let token = await user.getIdToken();
  const request = async (idToken: string) =>
    fetch(path, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  return response;
}

function normalizeManagerChainFromApi(
  rawChain: ManagerSnapshotApiChainEntry[] | null | undefined
): ManagerChainSnapshotEntry[] {
  if (!Array.isArray(rawChain)) return [];
  return rawChain.map((row) => {
    const email =
      typeof row?.email === "string" && row.email.trim().length > 0
        ? row.email.trim().toLowerCase()
        : null;
    const position = POSITION_ORDER.includes(row?.position as Position)
      ? (row?.position as Position)
      : null;
    const commissionMode =
      row?.commissionMode === "accelerated" || row?.commissionMode === "standard"
        ? row.commissionMode
        : null;

    return {
      email,
      position,
      commissionMode,
    };
  });
}

async function requestManagerSnapshotWithAuth({
  user,
  signedDateIso,
}: {
  user: User;
  signedDateIso: string | null;
}): Promise<{
  managerEmail: string | null;
  managerPosition: Position | null;
  managerMode: CommissionMode | null;
  managerChain: ManagerChainSnapshotEntry[];
}> {
  let token = await user.getIdToken();
  const requestBody = JSON.stringify({ signedDateIso: signedDateIso ?? null });

  const request = async (idToken: string) =>
    fetch("/api/manager-snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
      body: requestBody,
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  const payload = (await response.json().catch(() => null)) as ManagerSnapshotApiResponse | null;
  const apiError =
    payload?.ok === false && typeof payload.error === "string" ? payload.error.trim() : "";
  if (!response.ok || payload?.ok === false) {
    throw new Error(
      apiError || `Nepodařilo se načíst manager snapshot (HTTP ${response.status}).`
    );
  }

  const managerEmail =
    typeof payload?.managerEmail === "string" && payload.managerEmail.trim().length > 0
      ? payload.managerEmail.trim().toLowerCase()
      : null;
  const managerPosition = POSITION_ORDER.includes(payload?.managerPosition as Position)
    ? (payload?.managerPosition as Position)
    : null;
  const managerMode =
    payload?.managerMode === "accelerated" || payload?.managerMode === "standard"
      ? payload.managerMode
      : null;

  const managerChain = normalizeManagerChainFromApi(payload?.managerChain);

  return {
    managerEmail,
    managerPosition,
    managerMode,
    managerChain,
  };
}

function getContractsMutationError({
  response,
  data,
  fallback,
}: {
  response: Response;
  data: ContractsMutationResponse | null;
  fallback: string;
}): string | null {
  if (!response.ok) {
    const apiError =
      data && data.ok === false && typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "";
    return apiError || `${fallback} (HTTP ${response.status}).`;
  }
  if (data && data.ok === false) {
    return typeof data.error === "string" && data.error.trim()
      ? data.error.trim()
      : fallback;
  }
  if (!data || data.ok !== true) {
    return `${fallback} Server nevrátil potvrzení uložení.`;
  }
  return null;
}

const productLabel = (p: Product | null) =>
  productLabelFromCatalog(p, p ?? "—");

const PDF_AUTOMATED_PRODUCTS = new Set<Product>([
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
  "cppcestovko",
  "axacestovko",
  "cppsimplex",
  "neon",
  "flexi",
  "domex",
  "cpphafan",
  "zamex",
  "koopodzam",
  "maxdomov",
  "maxcizinkomplex",
  "comfortcc",
]);

const hasAutomatedPdfImport = (product: Product) => PDF_AUTOMATED_PRODUCTS.has(product);

const manualPdfImportMessage = (product: Product) =>
  `Pro produkt ${productLabel(product)} zatím není automatické načítání dat z PDF hotové. PDF se při uložení přiloží ke smlouvě, údaje prosím vyplň ručně.`;

const failedPdfImportMessage = (product: Product, productDetected = true) =>
  productDetected
    ? `PDF se pro produkt ${productLabel(product)} nepodařilo automaticky přečíst. Zkontroluj, jestli je PDF čitelné, nebo údaje doplň ručně.`
    : `Produkt z PDF jsem nerozpoznal a import podle vybraného produktu ${productLabel(product)} selhal. Zkontroluj vybraný produkt, nebo údaje doplň ručně.`;

const normalizeEmailValue = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeSearchTextValue = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const simpleNameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) =>
      part.length > 0
        ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
        : part
    )
    .join(" ");
};

const entryPathFromContractOwner = (ownerEmail: unknown, entryId: unknown): string => {
  const owner = normalizeEmailValue(ownerEmail);
  const id = typeof entryId === "string" ? entryId.trim() : "";
  if (!owner || !id) return "";
  return `users/${owner}/entries/${id}`;
};

const currentIsoDay = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
};

const resolveCurrentPositionTimelineRow = (
  timeline: PositionTimelineEntry[]
): PositionTimelineEntry | null => {
  if (timeline.length === 0) return null;
  return (
    resolvePositionTimelineMatch(currentIsoDay(), timeline) ??
    timeline.find((row) => !row.validTo) ??
    timeline[timeline.length - 1] ??
    null
  );
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
  const [contractSignedDate, setContractSignedDate] = useState<string>("");
  const [policyStartDate, setPolicyStartDate] = useState<string>("");
  const [policyEndDate, setPolicyEndDate] = useState<string>("");
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportStatus, setPdfImportStatus] = useState<string | null>(null);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [importedContractPdfFile, setImportedContractPdfFile] = useState<File | null>(null);
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

  const validateProductCoefficientPeriodBeforeSave = (
    targetProduct: Product | null,
    signedDateIsoRaw: string
  ): boolean => {
    if (
      targetProduct === "slaviaauto" &&
      !isSlaviaAutoSupportedForSignedDate(signedDateIsoRaw)
    ) {
      setSaveMessage(SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE);
      setValidationError(SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE);
      return false;
    }
    if (
      targetProduct === "slaviaflotila" &&
      !isSlaviaFlotilaSupportedForSignedDate(signedDateIsoRaw)
    ) {
      setSaveMessage(SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE);
      setValidationError(SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE);
      return false;
    }
    return true;
  };

  const paymentBasedTotalsMemo = useMemo(() => {
    if (
      (!isSeparatedPeriodCommissionProduct(product) &&
        !isFrequencyAutoPayoutProduct(product)) ||
      items.length === 0
    ) {
      return null;
    }
    const multiplier = isAnnualSeparatedPeriodProduct(product)
      ? 1
      : paymentsPerYear(frequency);
    return paymentBasedTotals(items, multiplier);
  }, [product, items, frequency]);

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
    const periodLabel = usesMotivationalBase
      ? "motivační provize po 5 letech"
      : `${neonRefreshCommissionBase.remainingMonths}/60 původní storno lhůty`;
    return `Refresh základna pro provizi: ${formatMoney(
      neonRefreshCommissionBase.calculationAnnualPremium
    )} ročně (${periodLabel}). Výpočet: navýšení ${formatMoney(
      neonRefreshCommissionBase.premiumIncreaseAnnual
    )} (${formatMoney(newAnnual)} - ${formatMoney(originalAnnual)})${originalBasePartLabel}.`;
  }, [
    product,
    refreshOriginalOpen,
    refreshOriginalMissingInSystem,
    refreshOriginalLookup.status,
    refreshOriginalLookup.original,
    neonRefreshCommissionBase,
  ]);
  const tipContractTipsterAmountFirstYear = useMemo(() => {
    if (!tipContractConfig) return 0;
    return roundToCents(
      tipContractImmediateGrossFirstYear * (tipContractConfig.tipsterPercent / 100)
    );
  }, [tipContractConfig, tipContractImmediateGrossFirstYear]);
  const tipContractImmediateNetFirstYear = useMemo(() => {
    if (!tipContractConfig) return 0;
    return roundToCents(
      tipContractImmediateGrossFirstYear - tipContractTipsterAmountFirstYear
    );
  }, [
    tipContractConfig,
    tipContractImmediateGrossFirstYear,
    tipContractTipsterAmountFirstYear,
  ]);
  const tipContractTotalNet = useMemo(() => {
    if (!tipContractConfig) return total;
    return roundToCents(Math.max(0, total - tipContractTipsterAmountFirstYear));
  }, [tipContractConfig, tipContractTipsterAmountFirstYear, total]);
  const tipsterImmediateCommission = useMemo(
    () => tipContractImmediateGrossFirstYear * (tipsterPercent / 100),
    [tipContractImmediateGrossFirstYear, tipsterPercent]
  );
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
    const q = normalizeClientNameForSystemMatch(clientName);
    if (!q) return [];
    return clientSuggestions
      .filter((name) => normalizeClientNameForSystemMatch(name).includes(q))
      .slice(0, 6);
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

      try {
        let bearerToken = await user.getIdToken();
        const namesByKey = new Map<string, string>();
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

          const nextCursor = payload.nextCursorToken ?? null;
          if (!payload.hasMore || !nextCursor || nextCursor === cursor) {
            break;
          }
          cursor = nextCursor;
        }

        if (!cancelled) {
          setClientSuggestions(Array.from(namesByKey.values()));
        }
      } catch (err) {
        console.error("Failed to load client name suggestions", err);
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

    const storedMode = window.localStorage.getItem(
      SETTINGS_KEYS.mode
    ) as CommissionMode | null;
    if (storedMode) {
      setMode(storedMode);
    }

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
    const loadUserPosition = async () => {
      if (!user?.email) return;
      try {
        const payload = await fetchAuthedJsonOrThrow<{
          ok?: boolean;
          profile?: Record<string, unknown>;
        }>(user, "/api/user/profile", { method: "GET" });
        const data = (payload?.profile ?? {}) as any;

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
        const userMode = (data?.commissionMode as CommissionMode | undefined) ?? null;
        if (userMode) {
          setUserCommissionMode(userMode);
          setMode(userMode);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(SETTINGS_KEYS.mode, userMode);
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

        if (chain.length === 0 && mgrEmail) {
          chain = ensureManagerChainWithDirectManager(chain, mgrEmail, null, null);
        }
        setManagerChainSnapshot(chain);
      } catch (err) {
        console.error("Failed to load user position", err);
        setPositionTimeline([]);
      }
    };

    loadUserPosition();
  }, [user]);

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
    if (!user || !trimmedContractNumber || trimmedContractNumber.length < 3 || endorsementDraft) {
      setContractNumberLiveCheck({ status: "idle" });
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(async () => {
      setContractNumberLiveCheck({ status: "checking" });
      try {
        const params = new URLSearchParams({
          scope: "my",
          q: trimmedContractNumber,
        });
        const payload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
          user,
          `/api/contracts/find?${params.toString()}`
        );
        if (canceled) return;

        if (payload.ok === false) {
          setContractNumberLiveCheck({ status: "error" });
          return;
        }

        const dupCount = Array.isArray(payload.contracts) ? payload.contracts.length : 0;
        if (dupCount > 0) {
          setContractNumberLiveCheck({
            status: "duplicate",
            count: dupCount,
          });
          return;
        }
        setContractNumberLiveCheck({ status: "ok" });
      } catch (err) {
        console.warn("Live kontrola duplicitního čísla smlouvy selhala", err);
        if (!canceled) setContractNumberLiveCheck({ status: "error" });
      }
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [user, contractNumber, endorsementDraft]);

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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterMode, value ? "1" : "0");
    }

    if (!user) return;

    setTipsterModeSaving(true);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ tipsterCollaborationMode: value }),
      });
    } catch (err) {
      console.error("Failed to persist tipster mode", err);
      setTipsterModeEnabled(previousTipsterMode);
      setCalculatorViewMode(previousViewMode);
      if (typeof window !== "undefined") {
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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterPercent, String(next));
    }
    return next;
  };

  const persistTipsterPercent = async (value: number) => {
    const next = setTipsterPercentDraft(value);

    if (!user) return;

    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
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
    setPdfImporting(true);
    setPdfImportError(null);
    setPdfImportStatus("Načítám PDF…");
    setImportedContractPdfFile(null);
    setPdfClientNameLoaded(false);
    setPdfMatchedClientName(false);
    let importProduct: Product | null = hasSelectedProduct ? product : null;
    let productDetected = false;
    try {
      const detected = await detectProductFromPdfLazy(file);
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
      if (importProduct) {
        setPdfImportStatus(
          `Produkt z PDF se nepodařilo rozpoznat. Zkouším import podle vybraného produktu ${productLabel(importProduct)}…`
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

      const parsed = await parseContractPdfByProduct(importProduct, file, {
        onOcrStart: () => {
          setPdfImportStatus("PDF vypadá jako sken. Spouštím OCR…");
        },
        onOcrProgress: (progress) => {
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
      });
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
          const maxCizinParsed = await parseMaxCizinKomplexPdfLazy(file);
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
      if (importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await parseMaxCizinKomplexPdfLazy(file);
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
        importProduct
          ? failedPdfImportMessage(importProduct, productDetected)
          : "Produkt z PDF se nepodařilo rozpoznat. Vyber produkt ručně."
      );
      setPdfImportStatus(null);
    } finally {
      setPdfImporting(false);
      if (fileInputRef.current) {
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

  const recalc = () => {
    const val = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);
    const comfortTargetAmount = parseNumber(comfortTargetAmountText);
    const positionForCalc = calculatorViewMode === "commissionOnly"
      ? position
      : timelineMatchedPosition?.position ??
        (!effectivePositionTimelineLoading && effectivePositionTimeline.length > 0
          ? position
          : null);

    if (!hasSelectedProduct) {
      setItems([]);
      setTotal(0);
      setUnsupported(false);
      return;
    }

    if (val <= 0) {
      setItems([]);
      setTotal(0);
      setUnsupported(false);
      return;
    }
    if (!positionForCalc) {
      setItems([]);
      setTotal(0);
      setUnsupported(false);
      return;
    }

    if (product === "neon") {
      const neonCalculationAmount =
        neonRefreshCommissionBase?.calculationMonthlyPremium ?? val;
      const dto = calculateNeon(
        neonCalculationAmount,
        positionForCalc,
        durationYears,
        mode,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "flexi") {
      const y = normalizedDurationYears("flexi", durationYears);
      const dto = calculateFlexi(val, positionForCalc, mode, y);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "maximaMaxEfekt") {
      if (durationYears == null) {
        setItems([]);
        setTotal(0);
        setUnsupported(false);
        return;
      }
      const y = normalizedDurationYears("maximaMaxEfekt", durationYears);
      const dto = calculateMaxEfekt(
        val,
        y,
        positionForCalc,
        mode,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "maxcizinkomplex") {
      const dto = calculateMaxCizinKomplex(val, positionForCalc, maxCizinKomplexVariant);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowInjury") {
      const dto = calculatePillowInjury(val, positionForCalc, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (
      product === "domex" ||
      product === "cpphafan" ||
      product === "koopmajetekobcan" ||
      product === "koopfit" ||
      product === "koopodzam" ||
      product === "kooppmop" ||
      product === "zamex"
    ) {
      const dto =
        product === "domex"
          ? calculateDomex(val, frequency, positionForCalc, contractSignedDateForNeon)
          : product === "cpphafan"
          ? calculateCppHafan(val, frequency, positionForCalc)
          : product === "koopodzam"
          ? calculateKoopOdzam(val, frequency, positionForCalc)
          : product === "kooppmop"
          ? calculateKoopPmop(val, frequency, positionForCalc)
          : product === "zamex"
          ? calculateZamex(val, frequency, positionForCalc)
          : calculateKoopMajetekObcan(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate);
      setUnsupported(false);
      return;
    }

    if (product === "pillowmajetek") {
      const dto = calculatePillowMajetek(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "maxdomov") {
      const dto = calculateMaxdomov(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate);
      setUnsupported(false);
      return;
    }

    if (product === "allianzmujdomov") {
      const dto = calculateAllianzMujDomov(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppAuto") {
      const dto = calculateCppAuto(
        val,
        frequency,
        positionForCalc,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "slaviaauto") {
      const dto = calculateSlaviaAuto(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "slaviaflotila") {
      const dto = calculateSlaviaFlotila(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppsimplex") {
      const dto = calculateCppSimplex(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRbez") {
      const dto = calculateCppPPRbez(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRs") {
      const dto = calculateCppPPRs(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate);
      setUnsupported(false);
      return;
    }

    if (product === "allianzAuto") {
      const dto = calculateAllianzAuto(
        val,
        frequency,
        positionForCalc,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "csobAuto") {
      const dto = calculateCsobAuto(
        val,
        frequency,
        positionForCalc,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "uniqaAuto" || product === "uniqaflotila") {
      const dto =
        product === "uniqaAuto"
          ? calculateUniqaAuto(
              val,
              frequency,
              positionForCalc,
              contractSignedDateForNeon
            )
          : calculateUniqaFlotila(
              val,
              frequency,
              positionForCalc,
              contractSignedDateForNeon
            );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowAuto") {
      const dto = calculatePillowAuto(
        val,
        frequency,
        positionForCalc,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "kooperativaAuto") {
      const dto = calculateKooperativaAuto(
        val,
        frequency,
        positionForCalc,
        contractSignedDateForNeon
      );
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "koopflotila") {
      const dto = calculateKoopFlotila(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppcestovko") {
      const dto = calculateCppCestovko(val, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "axacestovko") {
      const dto = calculateAxaCestovko(val, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "koopcestovko") {
      const dto = calculateKoopCestovko(val, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "comfortcc") {
      const dto = calculateComfortCC({
        fee: val,
        payment: comfortPayment,
        targetAmount: comfortGradual ? comfortTargetAmount : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position: positionForCalc,
      });
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    setItems([]);
    setTotal(0);
    setUnsupported(true);
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
  };

  useEffect(() => {
    if (!endorsementDraft) return;
    if (!isLifeProduct || endorsementDraft.productKey !== product) {
      setEndorsementDraft(null);
    }
  }, [endorsementDraft, isLifeProduct, product]);

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

  const handlePrepareEndorsement = async (
    options: PrepareEndorsementOptions = {}
  ): Promise<boolean> => {
    if (!user) {
      setValidationError("Nejdřív se prosím přihlas.");
      return false;
    }
    const targetProduct = options.productOverride ?? (hasSelectedProduct ? product : null);
    const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user.email);
    if (!targetOwnerEmail) {
      setValidationError("Chybí cílový vlastník smlouvy.");
      return false;
    }

    if (tipsterModeEnabled) {
      setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
      return false;
    }

    if (!targetProduct) {
      setValidationError("Nejdřív vyber produkt.");
      return false;
    }

    if (!LIFE_PRODUCTS.includes(targetProduct)) {
      setValidationError("Změnu zatím umíme jen pro ŽP produkty.");
      return false;
    }

    const trimmedContractNumber = (
      options.contractNumberOverride ?? contractNumber
    ).trim();
    const signedDateIso = (
      options.contractSignedDateOverride ?? contractSignedDate
    ).trim();
    const newPremiumAmount =
      options.newPremiumAmountOverride == null
        ? parseNumber(amountText)
        : toNonNegativeNumber(options.newPremiumAmountOverride);

    const missing: string[] = [];
    if (!trimmedContractNumber) missing.push("číslo smlouvy");
    if (!signedDateIso) missing.push("datum sjednání");
    if (newPremiumAmount <= 0) missing.push("částku");
    if (targetProduct === "maximaMaxEfekt" && durationYears == null) {
      missing.push("dobu trvání smlouvy");
    }

    if (missing.length > 0) {
      const msg = `Pro změnu doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
      return false;
    }

    const positionForEndorsement = resolveEndorsementPositionForSignedDate(signedDateIso);
    if (!positionForEndorsement) return false;

    try {
      const params = new URLSearchParams({
        scope: isSavingForSubordinate ? "team" : "my",
        q: trimmedContractNumber,
      });
      const payload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
        user,
        `/api/contracts/find?${params.toString()}`,
        { method: "GET" }
      );
      const contracts = (Array.isArray(payload?.contracts) ? payload.contracts : []).filter(
        (entry) =>
          normalizeEmailValue(entry.userEmail ?? entry.adviserEmail) === targetOwnerEmail
      );

      if (contracts.length === 0) {
        setValidationError(
          `Smlouvu č. ${trimmedContractNumber} jsem u vybraného poradce nenašel. Nejdřív musí být uložená jako původní smlouva.`
        );
        return false;
      }

      const productMatches: EndorsementSourceEntry[] = contracts
        .map((entry) => {
          const entryId = typeof entry.id === "string" ? entry.id.trim() : "";
          if (!entryId) return null;
          return {
            id: entryId,
            path: entryPathFromContractOwner(entry.userEmail ?? entry.adviserEmail, entryId),
            productKey: (entry?.productKey as Product | undefined) ?? null,
            rootContractEntryId:
              (typeof entry?.rootContractEntryId === "string"
                ? entry.rootContractEntryId
                : null) ?? null,
            effectiveInputAmount: resolveEffectivePremium(entry),
            policyStartDate: toDate(entry?.policyStartDate),
            contractSignedDate: toDate(entry?.contractSignedDate),
            createdAt: toDate(entry?.createdAt),
          };
        })
        .filter((entry): entry is EndorsementSourceEntry => Boolean(entry))
        .filter((entry) => entry.productKey === targetProduct);

      if (productMatches.length === 0) {
        setValidationError(
          `Pro smlouvu č. ${trimmedContractNumber} není uložený produkt ${productLabel(targetProduct)}.`
        );
        return false;
      }

      productMatches.sort(compareSourceEntriesByRecency);

      const latestEntry = productMatches[0];
      const previousPremiumAmount = latestEntry.effectiveInputAmount;
      const deltaAmount = newPremiumAmount - previousPremiumAmount;

      if (Math.abs(deltaAmount) < 0.01) {
        setValidationError(
          `Nové pojistné je stejné jako poslední uložená hodnota (${formatMoney(previousPremiumAmount)}).`
        );
        return false;
      }

      const changeType: EndorsementChangeType =
        deltaAmount > 0 ? "increase" : deltaAmount < 0 ? "decrease" : "same";
      const calculationAmount = deltaAmount > 0 ? deltaAmount : 0;

      let endorsementItems: CommissionResultItemDTO[] = [];
      let endorsementTotal = 0;
      if (calculationAmount > 0) {
        const result = computeItemsForPositionAndMode(
          positionForEndorsement,
          mode,
          calculationAmount,
          targetProduct,
          signedDateIso
        );
        endorsementItems = result?.items ?? [];
        endorsementTotal = result?.total ?? 0;
      }

      setEndorsementDraft({
        productKey: targetProduct,
        contractNumber: trimmedContractNumber,
        sourceEntryId: latestEntry.id,
        sourceEntryPath: latestEntry.path,
        rootContractEntryId: latestEntry.rootContractEntryId ?? latestEntry.id,
        previousPremiumAmount,
        newPremiumAmount,
        deltaAmount,
        calculationAmount,
        changeType,
        items: endorsementItems,
        total: endorsementTotal,
      });
      setValidationError(null);
      setSaveMessage(null);
      return true;
    } catch (error) {
      console.error("Chyba při přípravě dodatku", error);
      setValidationError("Nepodařilo se připravit změnu smlouvy. Zkus to prosím znovu.");
      return false;
    }
  };

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
    if (product === "maximaMaxEfekt" && durationYears == null) {
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
      return;
    }

    if (trimmedContractNumber !== endorsementDraft.contractNumber) {
      setValidationError(
        "Číslo smlouvy se od otevření okna změnilo. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      return;
    }

    const currentPremiumAmount = parseNumber(amountText);
    if (Math.abs(currentPremiumAmount - endorsementDraft.newPremiumAmount) > 0.01) {
      setValidationError(
        "Částka se od otevření okna změnila. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      return;
    }

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
          ? durationYears
          : null,
        durationMonths: shouldShowDurationMonths(endorsementDraft.productKey)
          ? normalizedDurationMonths(endorsementDraft.productKey, durationMonths)
          : null,
        maxCizinKomplexVariant:
          endorsementDraft.productKey === "maxcizinkomplex"
            ? maxCizinKomplexVariant
            : null,
        contractNumber: endorsementDraft.contractNumber,
      };

      const { response, data } = await requestContractsMutationWithAuth({
        user,
        path: "/api/contracts",
        method: "POST",
        payload: {
          ownerEmail: targetOwnerEmail,
          entry: endorsementEntryPayload,
        },
        idempotencyKey: buildContractsCreateIdempotencyKey({
          ownerEmail: targetOwnerEmail,
          entry: endorsementEntryPayload,
        }),
      });
      const apiError = getContractsMutationError({
        response,
        data,
        fallback: "Uložení dodatku selhalo.",
      });
      if (apiError) {
        setSaveMessage(apiError);
        return;
      }

      const createdEntryId =
        typeof data?.entryId === "string" ? data.entryId.trim() : "";
      if (!createdEntryId) {
        setSaveMessage("Server potvrdil uložení bez ID smlouvy. Zkus to prosím znovu.");
        return;
      }
      const ownerEmail = targetOwnerEmail;
      if (createdEntryId && ownerEmail) {
        setLastSavedContractRef({
          ownerEmail,
          entryId: createdEntryId,
        });
      }

      let pdfAttachmentMessage = "";
      if (createdEntryId && ownerEmail && importedContractPdfFile) {
        try {
          await uploadContractPdfAttachmentWithAuth({
            user,
            ownerEmail,
            entryId: createdEntryId,
            file: importedContractPdfFile,
          });
          pdfAttachmentMessage = " PDF bylo přiloženo k detailu dodatku.";
          setPdfImportStatus("PDF bylo bezpečně přiloženo k uloženému dodatku.");
          setPdfImportError(null);
          setImportedContractPdfFile(null);
        } catch (pdfUploadErr) {
          const message =
            pdfUploadErr instanceof Error && pdfUploadErr.message.trim()
              ? pdfUploadErr.message.trim()
              : "PDF se nepodařilo přiložit.";
          pdfAttachmentMessage = ` PDF se nepodařilo přiložit: ${message}`;
          setPdfImportError(`PDF se nepodařilo přiložit: ${message}`);
        }
      }

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
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

  const handleSaveContract = async (skipDuplicateCheck = false) => {
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
    const shouldReplaceOriginalContract =
      supportsOriginalContractReplacement(product) &&
      refreshOriginalOpen;
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
            isRefresh: shouldReplaceOriginalContract,
            refreshOriginalMissingInSystem: isRefreshWithoutOriginalInSystem,
            requiresStatementRefresh: isRefreshWithoutOriginalInSystem,
            commissionCalculationStatus: isRefreshWithoutOriginalInSystem
              ? "provisional_refresh_missing_original"
              : null,
            commissionBaseSource: isRefreshWithoutOriginalInSystem
              ? "calculator_provisional"
              : null,
            refreshOriginalContractNumber: shouldReplaceOriginalContract
              ? isRefreshWithoutOriginalInSystem
                ? null
                : trimmedRefreshOriginalContractNumber
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
        setSaveMessage(apiError);
        return;
      }

      const createdEntryId =
        typeof data?.entryId === "string" ? data.entryId.trim() : "";
      if (!createdEntryId) {
        setSaveMessage("Server potvrdil uložení bez ID smlouvy. Zkus to prosím znovu.");
        return;
      }
      const linkedRefreshOriginalEntryId =
        typeof data?.refreshOriginalEntryId === "string"
          ? data.refreshOriginalEntryId.trim()
          : "";
      const ownerEmail = targetOwnerEmail;
      if (createdEntryId && ownerEmail) {
        setLastSavedContractRef({
          ownerEmail,
          entryId: createdEntryId,
        });
      }

      let pdfAttachmentMessage = "";
      if (createdEntryId && ownerEmail && importedContractPdfFile) {
        try {
          await uploadContractPdfAttachmentWithAuth({
            user,
            ownerEmail,
            entryId: createdEntryId,
            file: importedContractPdfFile,
          });
          pdfAttachmentMessage = " PDF bylo přiloženo k detailu smlouvy.";
          setPdfImportStatus("PDF bylo bezpečně přiloženo k uložené smlouvě.");
          setPdfImportError(null);
          setImportedContractPdfFile(null);
        } catch (pdfUploadErr) {
          const message =
            pdfUploadErr instanceof Error && pdfUploadErr.message.trim()
              ? pdfUploadErr.message.trim()
              : "PDF se nepodařilo přiložit.";
          pdfAttachmentMessage = ` PDF se nepodařilo přiložit: ${message}`;
          setPdfImportError(`PDF se nepodařilo přiložit: ${message}`);
        }
      }

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      const linkedRefreshOriginal = linkedRefreshOriginalEntryId.length > 0;
      const savedMessage = isRefreshWithoutOriginalInSystem
        ? "Smlouva byla uložena jako REFRESH bez původní smlouvy v systému. Výpočet provize je orientační a musí se sladit podle provizního výpisu."
        : shouldReplaceOriginalContract
          ? linkedRefreshOriginal
            ? `Smlouva byla uložena jako ${originalReplacementLabel(product)} a původní smlouva byla stornována ke dni počátku.`
            : `Smlouva byla uložena jako ${originalReplacementLabel(product)}. Původní smlouva nebyla v systému nalezena, takže se automaticky nestornovala.`
          : "Smlouva byla uložena mezi sepsané.";
      setSaveMessage(`${savedMessage}${pdfAttachmentMessage}`);
      setSaveSuccessFlash({
        contractNumber: contractNumber.trim() || null,
        clientName: clientName.trim() || null,
      });
      setContractSaveCelebrationKey((prev) => prev + 1);
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
  const hasFrequencyPicker = allowed.length > 1;
  const showPolicyEndDateField = supportsPolicyEndDate(product);
  const lastSavedContractHref = lastSavedContractRef
    ? `/smlouvy/${encodeURIComponent(
        `${lastSavedContractRef.ownerEmail}___${lastSavedContractRef.entryId}`
      )}?from=list`
    : null;
  const currentProduct = PRODUCT_OPTIONS.find((p) => p.id === product)!;
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
  const durationHelp = durationTooltip(product, isNeonHistoricalBySignedDate);
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
    contractSignedDateOverride?: string | null
  ): { items: CommissionResultItemDTO[]; total: number } | null => {
    if (!pos) return null;
    const val =
      amountOverride == null ? parseNumber(amountText) : toNonNegativeNumber(amountOverride);
    const freq = frequency;
    const years = durationYears;
    const usedMode = (customMode ?? mode) as CommissionMode;
    const targetProduct = productOverride ?? product;
    const signedDateForCalculation =
      contractSignedDateOverride ?? contractSignedDateForNeon;

    switch (targetProduct) {
      case "neon": {
        const neonVal =
          amountOverride == null
            ? neonRefreshCommissionBase?.calculationMonthlyPremium ?? val
            : val;
        return calculateNeon(
          neonVal,
          pos,
          years,
          usedMode,
          signedDateForCalculation
        );
      }
      case "flexi":
      {
        const y = normalizedDurationYears("flexi", years);
        return calculateFlexi(val, pos, usedMode, y);
      }
      case "maximaMaxEfekt": {
        const y = normalizedDurationYears("maximaMaxEfekt", years);
        return calculateMaxEfekt(val, y, pos, usedMode, signedDateForCalculation);
      }
      case "maxcizinkomplex":
        return calculateMaxCizinKomplex(val, pos, maxCizinKomplexVariant);
      case "pillowInjury":
        return calculatePillowInjury(val, pos, usedMode);
      case "domex":
      case "cpphafan":
      case "koopmajetekobcan":
      case "koopfit":
      case "koopodzam":
      case "kooppmop":
      case "zamex": {
        const dto =
          targetProduct === "domex"
            ? calculateDomex(val, freq, pos, signedDateForCalculation)
            : targetProduct === "cpphafan"
            ? calculateCppHafan(val, freq, pos)
            : targetProduct === "koopodzam"
            ? calculateKoopOdzam(val, freq, pos)
            : targetProduct === "kooppmop"
            ? calculateKoopPmop(val, freq, pos)
            : targetProduct === "zamex"
            ? calculateZamex(val, freq, pos)
            : calculateKoopMajetekObcan(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return {
          items: filtered,
          total: totals.immediate,
        };
      }
      case "pillowmajetek":
        return calculatePillowMajetek(val, freq, pos);
      case "maxdomov": {
        const dto = calculateMaxdomov(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate };
      }
      case "allianzmujdomov":
        return calculateAllianzMujDomov(val, freq, pos);
      case "cppAuto":
        return calculateCppAuto(val, freq, pos, signedDateForCalculation);
      case "slaviaauto":
        return calculateSlaviaAuto(val, freq, pos);
      case "slaviaflotila":
        return calculateSlaviaFlotila(val, freq, pos);
      case "cppsimplex": {
        const dto = calculateCppSimplex(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate };
      }
      case "cppPPRbez": {
        const dto = calculateCppPPRbez(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate };
      }
      case "cppPPRs": {
        const dto = calculateCppPPRs(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate };
      }
      case "allianzAuto":
        return calculateAllianzAuto(val, freq, pos, signedDateForCalculation);
      case "csobAuto":
        return calculateCsobAuto(val, freq, pos, signedDateForCalculation);
      case "uniqaAuto":
        return calculateUniqaAuto(val, freq, pos, signedDateForCalculation);
      case "uniqaflotila":
        return calculateUniqaFlotila(val, freq, pos, signedDateForCalculation);
      case "pillowAuto":
        return calculatePillowAuto(val, freq, pos, signedDateForCalculation);
      case "kooperativaAuto":
        return calculateKooperativaAuto(val, freq, pos, signedDateForCalculation);
      case "koopflotila":
        return calculateKoopFlotila(val, freq, pos);
      case "cppcestovko":
        return calculateCppCestovko(val, pos);
      case "axacestovko":
        return calculateAxaCestovko(val, pos);
      case "koopcestovko":
        return calculateKoopCestovko(val, pos);
      case "comfortcc":
        return calculateComfortCC({
          fee: val,
          payment: parseNumber(comfortPaymentText),
          targetAmount: comfortGradual ? parseNumber(comfortTargetAmountText) : 0,
          isSavings: comfortGradual,
          isGradualFee: comfortGradual,
          position: pos,
        });
      default:
        return null;
    }
  };

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
    <AppLayout active="calc">
      <ContractSaveSuccessOverlay
        visible={Boolean(saveSuccessFlash)}
        celebrationKey={contractSaveCelebrationKey}
      />
      <div className="w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
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
        draft={endorsementDraft}
        saving={saving}
        onCancel={() => setEndorsementDraft(null)}
        onSave={handleSaveEndorsement}
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

      <div className="w-full max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SplitTitle text={headerTitle} className="!text-slate-900" />
          {!tipsterModeEnabled && (
            <div className="inline-flex items-center rounded-full border border-slate-300 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setCalculatorViewMode("addContract")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                  isAddContractMode
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Přidat smlouvu
              </button>
              <button
                type="button"
                onClick={() => setCalculatorViewMode("commissionOnly")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                  isCommissionOnlyMode
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Kalkulačka provizí
              </button>
            </div>
          )}
        </header>
        {(isCommissionOnlyMode || tipsterModeEnabled) && (
          <div className="flex justify-start sm:justify-end">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                Režim tipařské spolupráce
              </span>
              <button
                type="button"
                onClick={() => void persistTipsterMode(!tipsterModeEnabled)}
                disabled={tipsterModeSaving}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  tipsterModeEnabled
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
                aria-pressed={tipsterModeEnabled}
                aria-label="Přepnout režim tipařské spolupráce"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    tipsterModeEnabled ? "bg-white" : "bg-slate-400"
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
            {/* Produkt + PDF import */}
            {renderProductAndPdfSection(false)}

            <section className="rounded-[1.1rem] border border-slate-300 bg-white/95 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] space-y-3">
              {/* Doba trvání + platba */}
              <CalculatorDurationAndFrequencySection
                embedded
                product={product}
                durationHelp={durationHelp}
                durationHelpOpen={durationHelpOpen}
                durationYears={durationYears}
                durationMonths={durationMonths}
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
                onDurationYearsChange={setDurationYears}
                onDurationMonthsChange={setDurationMonths}
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
                onToggleRefreshOriginal={() =>
                  setRefreshOriginalOpen((prev) => {
                    if (prev) {
                      setRefreshOriginalMissingInSystem(false);
                      setRefreshOriginalPdfLookupNumber(null);
                    }
                    return !prev;
                  })
                }
                onPrepareEndorsement={() => {
                  void handlePrepareEndorsement();
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
              contractSignedDate={contractSignedDate}
              contractNumber={contractNumber}
              contractNumberLiveCheckStatus={contractNumberLiveCheck.status}
              contractNumberLiveCheckCount={
                contractNumberLiveCheck.status === "duplicate" ? contractNumberLiveCheck.count : null
              }
              policyStartDate={policyStartDate}
              contractDateErrorText={contractDateErrorText}
              contractDateWarningText={contractDateWarningText}
              showPolicyEndDateField={showPolicyEndDateField}
              policyEndDate={policyEndDate}
              onClientNameChange={(value) => {
                setClientName(value);
                setPdfClientNameLoaded(false);
                setPdfMatchedClientName(false);
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
                setMissingFields((prev) => prev.filter((key) => key !== "jméno klienta"));
                setClientSuggestionsOpen(false);
              }}
              onContractSignedDateChange={setContractSignedDate}
              onContractNumberChange={setContractNumber}
              onPolicyStartDateChange={setPolicyStartDate}
              onPolicyEndDateChange={setPolicyEndDate}
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
                <div className="rounded-[1.35rem] border border-slate-300 bg-white/95 px-3 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
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
                      className="ui-btn-primary ui-focus inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs"
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
            items={items}
            tipsterImmediateCommission={tipsterImmediateCommission}
            product={product}
            position={position}
            mode={mode}
            hideAnnualAutoTotals={
              (isAutoProduct(product) &&
                (frequency === "annual" || !isFrequencyAutoPayoutProduct(product))) ||
              (product === "domex" && frequency === "annual")
            }
            paymentBasedTotalsMemo={paymentBasedTotalsMemo}
            tipContractImmediateGrossFirstYear={tipContractImmediateGrossFirstYear}
            tipContractTipsterAmountFirstYear={tipContractTipsterAmountFirstYear}
            tipContractImmediateNetFirstYear={tipContractImmediateNetFirstYear}
            tipContractTotalNet={tipContractTotalNet}
            total={total}
            saving={saving}
            canSaveContract={
              isAddContractMode &&
              hasSelectedProduct &&
              !saving &&
              items.length > 0 &&
              parseNumber(amountText) > 0 &&
              !autoHullSumNeedsInput &&
              !effectivePositionTimelineLoading &&
              effectivePositionTimeline.length > 0
            }
            lastSavedContractHref={lastSavedContractHref}
            onOpenCoefModal={() => setShowCoefModal(true)}
            onToggleTipsterPercentPanel={() => setTipsterPercentPanelOpen((prev) => !prev)}
            onTipsterPercentDraft={setTipsterPercentDraft}
            onPersistTipsterPercent={persistTipsterPercent}
            onSaveContract={() => {
              void handleSaveContract();
            }}
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
