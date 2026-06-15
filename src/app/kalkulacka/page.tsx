// src/app/kalkulacka/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Lightbulb,
  Mail,
  Search,
  Tag,
  Users,
  UserRound,
  X,
} from "lucide-react";
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
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateAllianzAuto,
  calculateAllianzMujDomov,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateKoopCestovko,
  calculateComfortCC,
  getCoefficientSummary,
  isNeonHistoricalPeriod,
} from "../lib/productFormulas";
import { parseCppAutoPdf } from "../lib/parseCppAutoPdf";
import { parseSlaviaAutoPdf } from "../lib/parseSlaviaAutoPdf";
import { parseNeonPdf } from "../lib/parseNeonPdf";
import { parseFlexiPdf } from "../lib/parseFlexiPdf";
import { parseDomexPdf } from "../lib/parseDomexPdf";
import { parseCppHafanPdf } from "../lib/parseCppHafanPdf";
import { parseComfortPdf } from "../lib/parseComfortPdf";
import { parseMaxCizinKomplexPdf } from "../lib/parseMaxCizinKomplexPdf";
import { parseMaxdomovPdf } from "../lib/parseMaxdomovPdf";
import { parseKooperativaAutoPdf } from "../lib/parseKooperativaAutoPdf";
import { parseAllianzAutoPdf } from "../lib/parseAllianzAutoPdf";
import { parsePillowAutoPdf } from "../lib/parsePillowAutoPdf";
import { parseCsobAutoPdf } from "../lib/parseCsobAutoPdf";
import { parseCppCestovkoPdf } from "../lib/parseCppCestovkoPdf";
import { parseCppSimplexPdf } from "../lib/parseCppSimplexPdf";
import { detectProductFromPdf } from "../lib/detectProductFromPdf";
import {
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  PRODUCT_OPTIONS,
  productInstitutionId as productInstitutionIdFromCatalog,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";
import { AppLayout } from "@/components/AppLayout";
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
  isImmediateCommissionTitle,
  computeImmediateCommissionFirstYearTotal,
  type ContractEntryType,
  type EndorsementChangeType,
  type EndorsementSourceEntry,
  type EndorsementDraft,
  toNonNegativeNumber,
  compareSourceEntriesByRecency,
  resolveEffectivePremium,
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
import { CalculatorResultsSection } from "./CalculatorResultsSection";


// ---------- Pomocné ----------

const LIFE_PRODUCTS = LIFE_PRODUCTS_LIST;
const SETTINGS_KEYS = {
  mode: "settings.mode",
  tipsterMode: "settings.tipsterMode",
  tipsterPercent: "settings.tipsterPercent",
};
const TIPSTER_PERCENT_PRESETS = [10, 20, 30, 40, 50, 75, 100];
const TIP_CONTRACT_PERCENT_OPTIONS = Array.from({ length: 19 }, (_, idx) => (idx + 1) * 5);
const EMAIL_LOOKUP_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIP_CONTRACT_STATUS_LABELS: Record<TipLifecycleStatus, string> = {
  pending: "Čeká na zpracování",
  contracted: "Sjednáno",
  failed: "Obchod neproběhl",
};
const TIP_CONTRACT_TIPS_FILTER_OPTIONS = [
  { key: "all", label: "Všechny" },
  { key: "new", label: "Nové" },
  { key: "contracted", label: "Sjednané" },
] as const;
const ACCOUNT_TYPE_LABELS: Record<UserAccountType, string> = {
  advisor: "Vázaný zástupce",
  tipster: "Tipař",
};
const AUTO_TERMS_PREVIEW_BY_PRODUCT: Partial<Record<Product, string>> = {
  cppAuto: "/provize/cppauto.jpg",
  slaviaauto: "/provize/slaviaauto.jpg",
  allianzAuto: "/provize/allianzauto.jpg",
  csobAuto: "/provize/csobauto.jpg",
  uniqaAuto: "/provize/uniqaauto.jpg",
  uniqaflotila: "/provize/uniqaflotila.jpg",
  pillowAuto: "/provize/pillowauto.jpg",
  kooperativaAuto: "/provize/koopauto.jpg",
};
const MAX_CIZIN_KOMPLEX_VARIANT_OPTIONS: {
  id: MaxCizinKomplexVariant;
  label: string;
}[] = [
  { id: "exclusiveStandard", label: "EXCLUSIVE / STANDARD" },
  { id: "premium", label: "PREMIUM" },
];
const CONTRACTS_CREATE_IDEMPOTENCY_HEADER = "x-idempotency-key";
const CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL = "jakub.rauscher@bohemika.eu";
const CONTRACT_SAVE_CONFETTI_COLORS = [
  "#c084fc",
  "#a855f7",
  "#22c55e",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
];

const CONTRACT_SAVE_CONFETTI_PIECES = Array.from({ length: 52 }, (_, index) => {
  const angle = (index / 52) * Math.PI * 2;
  const radius = 118 + (index % 9) * 18;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius - 26 - (index % 4) * 8),
    rotate: ((index * 53) % 360) - 180,
    delayMs: (index % 10) * 22,
    color: CONTRACT_SAVE_CONFETTI_COLORS[index % CONTRACT_SAVE_CONFETTI_COLORS.length],
    shapeClass:
      index % 5 === 0
        ? "h-2.5 w-2.5 rounded-full"
        : index % 3 === 0
          ? "h-2 w-4 rounded-[3px]"
          : "h-3 w-1.5 rounded-[2px]",
  };
});

const formatTipCreatedAt = (createdAtMs: number | null): string => {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return "Datum neuvedeno";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(createdAtMs));
  } catch {
    return "Datum neuvedeno";
  }
};

type NeonCoefficientView = "current" | "historical";
type CalculatorViewMode = "addContract" | "commissionOnly";

function formatCoefficientNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 6 });
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
};

type ContractsFindApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: Array<{
    id?: string;
    contractNumber?: string | null;
    adviserEmail?: string | null;
    userEmail?: string | null;
    productKey?: Product | null;
    rootContractEntryId?: string | null;
    effectiveInputAmount?: number | null;
    newInputAmount?: number | null;
    inputAmount?: number | null;
    policyStartDate?: unknown;
    contractSignedDate?: unknown;
    createdAt?: unknown;
  }>;
};

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

type SubordinateOption = {
  email: string;
  name: string;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

type UserAccountType = "advisor" | "tipster";
type TipLifecycleStatus = "pending" | "contracted" | "failed";
type TipContractTipsFilter = (typeof TIP_CONTRACT_TIPS_FILTER_OPTIONS)[number]["key"];

type TipContractUserOption = {
  email: string;
  name: string;
  managerEmail: string | null;
  accountType: UserAccountType;
};

type UserSearchApiResponse = {
  ok?: boolean;
  users?: TipContractUserOption[];
  error?: string;
};

type TipsterLookupApiResponse = {
  ok?: boolean;
  exists?: boolean;
  email?: string | null;
  name?: string | null;
  accountType?: UserAccountType | null;
  error?: string;
};

type TipsterLookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; email: string; name: string | null; accountType: UserAccountType }
  | { status: "notFound" }
  | { status: "error"; message: string };

type TipContractTipOption = {
  id: string;
  title: string;
  product: string;
  productLabel: string;
  status: TipLifecycleStatus;
  tipsterEmail: string;
  tipsterName: string;
  clientName: string;
  phone: string;
  email: string;
  createdAtMs: number | null;
};

type AdvisorTipsByUserApiResponse = {
  ok?: boolean;
  items?: TipContractTipOption[];
  error?: string;
};

type TipContractConfig = {
  tipsterEmail: string | null;
  tipsterName: string | null;
  tipsterAccountType: UserAccountType | null;
  tipsterPercent: number;
  sourceTipId: string | null;
  sourceTipTitle: string | null;
  sourceTipProductLabel: string | null;
  sourceTipClientName: string | null;
  sourceTipCreatedAtMs: number | null;
};

type ContractNumberLiveCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "duplicate"; count: number }
  | { status: "error" };

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
  return null;
}

const productLabel = (p: Product | null) =>
  productLabelFromCatalog(p, p ?? "—");

const PDF_AUTOMATED_PRODUCTS = new Set<Product>([
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "pillowAuto",
  "kooperativaAuto",
  "cppcestovko",
  "cppsimplex",
  "neon",
  "flexi",
  "domex",
  "cpphafan",
  "maxdomov",
  "maxcizinkomplex",
  "comfortcc",
]);

const hasAutomatedPdfImport = (product: Product) => PDF_AUTOMATED_PRODUCTS.has(product);

const manualPdfImportMessage = (product: Product) =>
  `Pro produkt ${productLabel(product)} zatím není automatické načítání dat z PDF hotové. PDF se při uložení přiloží ke smlouvě, údaje prosím vyplň ručně.`;

const failedPdfImportMessage = (product: Product) =>
  `PDF se pro produkt ${productLabel(product)} nepodařilo automaticky přečíst. PDF se při uložení přiloží ke smlouvě, údaje prosím vyplň ručně.`;

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

// ---------- Kalkulačka ----------

export default function CalculatorPage() {
  const [user, setUser] = useState<User | null>(null);

  const [product, setProduct] = useState<Product>("neon");
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
  const [autoCarHullDeductible, setAutoCarHullDeductible] = useState<number | null>(null);
  const [autoCarHullDeductibleText, setAutoCarHullDeductibleText] = useState<string>("");
  const [autoCarHullRiskAccident, setAutoCarHullRiskAccident] = useState(false);
  const [autoCarHullRiskTheft, setAutoCarHullRiskTheft] = useState(false);
  const [autoCarHullRiskNatural, setAutoCarHullRiskNatural] = useState(false);
  const [autoCarHullRiskVandalism, setAutoCarHullRiskVandalism] = useState(false);
  const [autoCarHullRiskAnimalCollision, setAutoCarHullRiskAnimalCollision] = useState(false);
  const [autoCarAssistancePlan, setAutoCarAssistancePlan] = useState<string>("");
  const [autoCarAddonEso, setAutoCarAddonEso] = useState(false);
  const [autoCarAddonGlass, setAutoCarAddonGlass] = useState(false);
  const [autoCarAddonAnimalCollision, setAutoCarAddonAnimalCollision] = useState(false);
  const [autoCarAddonAnimalDamage, setAutoCarAddonAnimalDamage] = useState(false);
  const [autoCarAddonVandalism, setAutoCarAddonVandalism] = useState(false);
  const [autoCarAddonTheft, setAutoCarAddonTheft] = useState(false);
  const [autoCarAddonNatural, setAutoCarAddonNatural] = useState(false);
  const [autoCarAddonGap, setAutoCarAddonGap] = useState(false);
  const [autoCarAddonFireExplosion, setAutoCarAddonFireExplosion] = useState(false);
  const [autoCarAddonLegalAdvice, setAutoCarAddonLegalAdvice] = useState(false);
  const [autoCarAddonReplacementCar, setAutoCarAddonReplacementCar] = useState(false);
  const [autoCarAddonLuggage, setAutoCarAddonLuggage] = useState(false);
  const [autoCarAddonTransportedGoods, setAutoCarAddonTransportedGoods] = useState(false);
  const [autoCarAddonPothole, setAutoCarAddonPothole] = useState(false);
  const [autoCarAddonNonFaultAccident, setAutoCarAddonNonFaultAccident] = useState(false);
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
  const [refreshOriginalOpen, setRefreshOriginalOpen] = useState(false);
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
    product,
    onProductSelect: (nextProduct) => {
      setProduct(nextProduct);
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

  const normalizedUserEmail = normalizeEmailValue(user?.email);
  const canOverrideOwnerOnSave =
    normalizedUserEmail === CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL;
  const effectiveSaveOwnerEmail =
    canOverrideOwnerOnSave && selectedSubordinateEmail
      ? selectedSubordinateEmail
      : normalizedUserEmail;
  const isSavingForSubordinate =
    canOverrideOwnerOnSave &&
    !!selectedSubordinateEmail &&
    selectedSubordinateEmail !== normalizedUserEmail;
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
    : "Můj účet";

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

  const paymentBasedTotalsMemo = useMemo(() => {
    if (
      (product !== "domex" &&
        product !== "koopmajetekobcan" &&
        product !== "maxdomov") ||
      items.length === 0
    ) {
      return null;
    }
    const multiplier = paymentsPerYear(frequency);
    return paymentBasedTotals(items, multiplier);
  }, [product, items, frequency]);

  const immediateCommissionTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (!isImmediateCommissionTitle(item.title)) return sum;
        return sum + (item.amount ?? 0);
      }, 0),
    [items]
  );
  const tipContractImmediateGrossFirstYear = useMemo(
    () => computeImmediateCommissionFirstYearTotal(items),
    [items]
  );
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
    () => immediateCommissionTotal * (tipsterPercent / 100),
    [immediateCommissionTotal, tipsterPercent]
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
  const [timelineMatchedPosition, setTimelineMatchedPosition] = useState<{
    position: Position;
    validFrom: string;
    validTo: string | null;
  } | null>(null);
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
  const neonCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2024-06-30";
    return "2024-07-01";
  }, [neonCoefficientView]);
  const isNeonHistoricalInCoefModal = useMemo(
    () => product === "neon" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const neonImmediatePayoutInfo = useMemo(() => {
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
        product === "neon" ? neonCoefficientDateForView : contractSignedDateForNeon
      ),
    [
      product,
      position,
      mode,
      maxCizinKomplexVariant,
      contractSignedDateForNeon,
      neonCoefficientDateForView,
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
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro jednotlivé položky.";
      case "domex":
      case "cpphafan":
      case "koopmajetekobcan":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}).`;
      case "pillowmajetek":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.10.2023.`;
      case "maxdomov":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská i následná). Roční částka = × počet plateb (${payPerYear}).`;
      case "allianzmujdomov":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.06.2020.`;
      case "cppAuto":
      case "slaviaauto":
      case "cppsimplex":
      case "allianzAuto":
      case "csobAuto":
      case "uniqaAuto":
      case "uniqaflotila":
      case "pillowAuto":
      case "kooperativaAuto":
      case "zamex":
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "cppPPRbez":
      case "cppPPRs":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská / následná). Roční varianta = × počet plateb (${payPerYear}).`;
      case "cppcestovko":
      case "axacestovko":
      case "koopcestovko":
        return "Výpočet: pojistné × koeficient (jednorázově).";
      case "comfortcc":
        return "Výpočet: následná provize z platby = pravidelná platba × koeficient. U postupného poplatku je tato částka započtená i do okamžité provize. Pokud zadáš cílovou částku, Celkem dopočítá celý součet za všechny výplaty následné.";
      default:
        return "";
    }
  }, [product, frequency, maxCizinKomplexVariant]);
  const autoTermsPreviewUrl = useMemo(() => {
    if (!product) return null;
    return AUTO_TERMS_PREVIEW_BY_PRODUCT[product] ?? null;
  }, [product]);
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
    const q = clientName.trim().toLowerCase();
    if (!q) return [];
    return clientSuggestions
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 6);
  }, [clientName, clientSuggestions]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchClientNames = async () => {
      if (!user?.email) {
        setClientSuggestions([]);
        return;
      }

      try {
        let bearerToken = await user.getIdToken();
        const requestWithToken = async (token: string) =>
          fetch("/api/contracts/list?scope=my&limit=200", {
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

        const names = (payload.contracts ?? [])
          .map((d) => d.clientName as string | undefined)
          .filter((n) => typeof n === "string" && n.trim().length > 0)
          .map((n) => n!.trim());
        const unique = Array.from(new Set(names));
        setClientSuggestions(unique);
      } catch (err) {
        console.error("Failed to load client name suggestions", err);
      }
    };

    fetchClientNames();
  }, [user]);

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
          const now = new Date();
          const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(now.getDate()).padStart(2, "0")}`;
          const currentTimelineRow =
            resolvePositionTimelineMatch(todayIso, parsedPositionTimeline) ??
            parsedPositionTimeline.find((row) => !row.validTo) ??
            parsedPositionTimeline[parsedPositionTimeline.length - 1] ??
            null;
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
    if (isSavingForSubordinate) {
      setTimelineMatchedPosition(null);
      return;
    }

    if (!contractSignedDate.trim() || positionTimeline.length === 0) {
      setTimelineMatchedPosition(null);
      return;
    }

    const match = resolvePositionTimelineMatch(contractSignedDate.trim(), positionTimeline);
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
  }, [contractSignedDate, positionTimeline, isSavingForSubordinate]);

  const validateTimelineBeforeSave = (): boolean => {
    if (isSavingForSubordinate) return true;

    if (positionTimeline.length === 0) {
      const msg =
        "Bez nastavené timeline kariéry nejde smlouvu uložit. Doplň ji prosím v Nastavení.";
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    const signedDateIso = contractSignedDate.trim();
    if (!signedDateIso || !isIsoDay(signedDateIso)) return true;

    const match = resolvePositionTimelineMatch(signedDateIso, positionTimeline);
    if (match) return true;

    const msg = `Pro datum sjednání ${formatIsoDay(
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
      if (product === "neon") return;
      setDurationYears(durationFallback(product));
      return;
    }
    if (durationYears < min || durationYears > max) {
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
    if (product === "neon") {
      setDurationYears(null);
    }
    if (product === "maximaMaxEfekt") {
      setDurationYears(20);
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
    comfortPaymentText,
    product,
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
    if (
      product !== "cppAuto" &&
      product !== "slaviaauto" &&
      product !== "kooperativaAuto"
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
      setAutoCarHullDeductible(null);
      setAutoCarHullDeductibleText("");
      setAutoCarHullRiskAccident(false);
      setAutoCarHullRiskTheft(false);
      setAutoCarHullRiskNatural(false);
      setAutoCarHullRiskVandalism(false);
      setAutoCarHullRiskAnimalCollision(false);
      setAutoCarAssistancePlan("");
      setAutoCarAddonEso(false);
      setAutoCarAddonGlass(false);
      setAutoCarAddonAnimalCollision(false);
      setAutoCarAddonAnimalDamage(false);
      setAutoCarAddonVandalism(false);
      setAutoCarAddonTheft(false);
      setAutoCarAddonNatural(false);
      setAutoCarAddonGap(false);
      setAutoCarAddonFireExplosion(false);
      setAutoCarAddonLegalAdvice(false);
      setAutoCarAddonReplacementCar(false);
      setAutoCarAddonLuggage(false);
      setAutoCarAddonTransportedGoods(false);
      setAutoCarAddonPothole(false);
      setAutoCarAddonNonFaultAccident(false);
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
    parsed:
      | Awaited<ReturnType<typeof parseMaxCizinKomplexPdf>>
      | null
      | undefined
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
    let importProduct: Product = product;
    try {
      const detected = await detectProductFromPdf(file);
      if (detected && detected.product !== product) {
        importProduct = detected.product;
        setProduct(detected.product);
        setProductPickerSectionForProduct(detected.product);
        setPdfImportStatus(`Rozpoznán produkt: ${productLabel(detected.product)}. Načítám data…`);
      }
    } catch (detectErr) {
      console.warn("Auto-detekce produktu z PDF selhala", detectErr);
    }
    if (
      importProduct === "cppAuto" ||
      importProduct === "slaviaauto" ||
      importProduct === "allianzAuto" ||
      importProduct === "csobAuto" ||
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
      setAutoCarHullDeductible(null);
      setAutoCarHullDeductibleText("");
      setAutoCarHullRiskAccident(false);
      setAutoCarHullRiskTheft(false);
      setAutoCarHullRiskNatural(false);
      setAutoCarHullRiskVandalism(false);
      setAutoCarHullRiskAnimalCollision(false);
      setAutoCarAssistancePlan("");
      setAutoCarAddonEso(false);
      setAutoCarAddonGlass(false);
      setAutoCarAddonAnimalCollision(false);
      setAutoCarAddonAnimalDamage(false);
      setAutoCarAddonVandalism(false);
      setAutoCarAddonTheft(false);
      setAutoCarAddonNatural(false);
      setAutoCarAddonGap(false);
      setAutoCarAddonFireExplosion(false);
      setAutoCarAddonLegalAdvice(false);
      setAutoCarAddonReplacementCar(false);
      setAutoCarAddonLuggage(false);
      setAutoCarAddonTransportedGoods(false);
      setAutoCarAddonPothole(false);
      setAutoCarAddonNonFaultAccident(false);
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
    }
    try {
      if (!hasAutomatedPdfImport(importProduct)) {
        setImportedContractPdfFile(file);
        setPdfImportStatus(manualPdfImportMessage(importProduct));
        setPdfImportError(null);
        return;
      }

      let parsed:
        | Awaited<ReturnType<typeof parseCppAutoPdf>>
        | Awaited<ReturnType<typeof parseSlaviaAutoPdf>>
        | Awaited<ReturnType<typeof parseNeonPdf>>
        | Awaited<ReturnType<typeof parseFlexiPdf>>
        | Awaited<ReturnType<typeof parseDomexPdf>>
        | Awaited<ReturnType<typeof parseCppHafanPdf>>
        | Awaited<ReturnType<typeof parseMaxdomovPdf>>
        | Awaited<ReturnType<typeof parseMaxCizinKomplexPdf>>
        | Awaited<ReturnType<typeof parseComfortPdf>>
        | Awaited<ReturnType<typeof parseKooperativaAutoPdf>>
        | Awaited<ReturnType<typeof parseAllianzAutoPdf>>
        | Awaited<ReturnType<typeof parsePillowAutoPdf>>
        | Awaited<ReturnType<typeof parseCsobAutoPdf>>
        | Awaited<ReturnType<typeof parseCppCestovkoPdf>>
        | Awaited<ReturnType<typeof parseCppSimplexPdf>>
        | null = null;

      if (importProduct === "cppAuto") {
        parsed = await parseCppAutoPdf(file);
      } else if (importProduct === "slaviaauto") {
        parsed = await parseSlaviaAutoPdf(file);
      } else if (importProduct === "allianzAuto") {
        parsed = await parseAllianzAutoPdf(file);
      } else if (importProduct === "csobAuto") {
        parsed = await parseCsobAutoPdf(file);
      } else if (importProduct === "pillowAuto") {
        parsed = await parsePillowAutoPdf(file);
      } else if (importProduct === "kooperativaAuto") {
        parsed = await parseKooperativaAutoPdf(file);
      } else if (importProduct === "neon") {
        parsed = await parseNeonPdf(file);
      } else if (importProduct === "flexi") {
        parsed = await parseFlexiPdf(file);
      } else if (importProduct === "domex") {
        parsed = await parseDomexPdf(file);
      } else if (importProduct === "cpphafan") {
        parsed = await parseCppHafanPdf(file);
      } else if (importProduct === "maxdomov") {
        parsed = await parseMaxdomovPdf(file);
      } else if (importProduct === "maxcizinkomplex") {
        parsed = await parseMaxCizinKomplexPdf(file);
      } else if (importProduct === "comfortcc") {
        parsed = await parseComfortPdf(file);
      } else if (importProduct === "cppcestovko") {
        parsed = await parseCppCestovkoPdf(file);
      } else if (importProduct === "cppsimplex") {
        parsed = await parseCppSimplexPdf(file);
      } else {
        setImportedContractPdfFile(file);
        setPdfImportStatus(manualPdfImportMessage(importProduct));
        setPdfImportError(null);
        return;
      }

      if (!parsed) {
        setImportedContractPdfFile(file);
        setPdfImportStatus(failedPdfImportMessage(importProduct));
        setPdfImportError(null);
        return;
      }
      let applied = 0;

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
      }
      if ("carHullSumInsured" in parsed) {
        const hullSumInsured =
          typeof parsed.carHullSumInsured === "number" &&
          Number.isFinite(parsed.carHullSumInsured)
            ? Math.round(parsed.carHullSumInsured)
            : null;
        setAutoCarHullSumInsured(hullSumInsured);
        if (hullSumInsured != null) applied += 1;
      }
      if ("carHullSumInsuredText" in parsed) {
        const hullSumInsuredText =
          typeof parsed.carHullSumInsuredText === "string"
            ? parsed.carHullSumInsuredText.trim()
            : "";
        setAutoCarHullSumInsuredText(hullSumInsuredText);
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
      if ("carAddonGlass" in parsed) {
        const addon = parsed.carAddonGlass === true;
        setAutoCarAddonGlass(addon);
        if (addon) applied += 1;
      }
      if ("carAddonAnimalCollision" in parsed) {
        const addon = parsed.carAddonAnimalCollision === true;
        setAutoCarAddonAnimalCollision(addon);
        if (addon) applied += 1;
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

      if (applied === 0 && importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await parseMaxCizinKomplexPdf(file);
          if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
            showMaxCizinKomplexHint();
            return;
          }
        } catch {
          // ignore fallback detection error
        }
      }

      setImportedContractPdfFile(file);
      const attachmentNote = " PDF se při uložení přiloží k detailu záznamu.";
      setPdfImportStatus(
        applied > 0
          ? `Načteno z PDF (${applied} polí). Zkontroluj prosím.${attachmentNote}`
          : importProduct === "cppsimplex"
            ? `PDF pro ČPP Simplex nahráno. Extrakci polí doladíme v dalším kroku.${attachmentNote}`
            : `V PDF se nenašla čitelná data, doplň ručně.${attachmentNote}`
      );
    } catch (err) {
      console.error("PDF import selhal", err);
      if (importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await parseMaxCizinKomplexPdf(file);
          if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
            showMaxCizinKomplexHint();
            return;
          }
        } catch {
          // ignore fallback detection error
        }
      }
      setImportedContractPdfFile(file);
      setPdfImportError(failedPdfImportMessage(importProduct));
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
      : isSavingForSubordinate
      ? position
      : timelineMatchedPosition?.position ??
        (positionTimeline.length > 0 ? position : null);

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
      const dto = calculateNeon(
        val,
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
      const y = normalizedDurationYears("maximaMaxEfekt", durationYears);
      const dto = calculateMaxEfekt(val, y, positionForCalc, mode);
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
      product === "koopmajetekobcan"
    ) {
      const dto =
        product === "domex"
          ? calculateDomex(val, frequency, positionForCalc)
          : product === "cpphafan"
          ? calculateCppHafan(val, frequency, positionForCalc)
          : calculateKoopMajetekObcan(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate + totals.subsequent);
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
      setTotal(totals.immediate + totals.subsequent);
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
      const dto = calculateCppAuto(val, frequency, positionForCalc);
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

    if (product === "cppsimplex") {
      const dto = calculateCppSimplex(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRbez") {
      const dto = calculateCppPPRbez(val, frequency, positionForCalc);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
      setItems(filtered);
      setTotal(sum);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRs") {
      const dto = calculateCppPPRs(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "allianzAuto") {
      const dto = calculateAllianzAuto(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "csobAuto") {
      const dto = calculateCsobAuto(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "uniqaAuto" || product === "uniqaflotila") {
      const dto = calculateUniqaAuto(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowAuto") {
      const dto = calculatePillowAuto(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "kooperativaAuto") {
      const dto = calculateKooperativaAuto(val, frequency, positionForCalc);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "zamex") {
      const dto = calculateZamex(val, frequency, positionForCalc);
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
    position,
    timelineMatchedPosition,
    isSavingForSubordinate,
    mode,
    frequency,
    durationYears,
    amountText,
    contractSignedDateForNeon,
    comfortGradual,
    comfortPaymentText,
    comfortTargetAmountText,
    maxCizinKomplexVariant,
  ]);

  useEffect(() => {
    if (product !== "neon") {
      setRefreshOriginalOpen(false);
    }
    if (product !== "cppcestovko") {
      setPolicyEndDate("");
    }
  }, [product]);

  useEffect(() => {
    setDurationHelpOpen(false);
  }, [product]);

  useEffect(() => {
    if (!endorsementDraft) return;
    if (!isLifeProduct || endorsementDraft.productKey !== product) {
      setEndorsementDraft(null);
    }
  }, [endorsementDraft, isLifeProduct, product]);

  const handlePrepareEndorsement = async () => {
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

    if (!isLifeProduct) {
      setValidationError("Změnu zatím umíme jen pro ŽP produkty.");
      return;
    }

    const trimmedContractNumber = contractNumber.trim();
    const newPremiumAmount = parseNumber(amountText);

    const missing: string[] = [];
    if (!trimmedContractNumber) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (newPremiumAmount <= 0) missing.push("částku");

    if (missing.length > 0) {
      const msg = `Pro změnu doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
      return;
    }
    if (!validateTimelineBeforeSave()) return;

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
        return;
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
        .filter((entry) => entry.productKey === product);

      if (productMatches.length === 0) {
        setValidationError(
          `Pro smlouvu č. ${trimmedContractNumber} není uložený produkt ${productLabel(product)}.`
        );
        return;
      }

      productMatches.sort(compareSourceEntriesByRecency);

      const latestEntry = productMatches[0];
      const previousPremiumAmount = latestEntry.effectiveInputAmount;
      const deltaAmount = newPremiumAmount - previousPremiumAmount;

      if (Math.abs(deltaAmount) < 0.01) {
        setValidationError(
          `Nové pojistné je stejné jako poslední uložená hodnota (${formatMoney(previousPremiumAmount)}).`
        );
        return;
      }

      const changeType: EndorsementChangeType =
        deltaAmount > 0 ? "increase" : deltaAmount < 0 ? "decrease" : "same";
      const calculationAmount = deltaAmount > 0 ? deltaAmount : 0;

      let endorsementItems: CommissionResultItemDTO[] = [];
      let endorsementTotal = 0;
      if (calculationAmount > 0) {
        const result = computeItemsForPositionAndMode(position, mode, calculationAmount);
        endorsementItems = result?.items ?? [];
        endorsementTotal = result?.total ?? 0;
      }

      setEndorsementDraft({
        productKey: product,
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
    } catch (error) {
      console.error("Chyba při přípravě dodatku", error);
      setValidationError("Nepodařilo se připravit změnu smlouvy. Zkus to prosím znovu.");
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

    if (missing.length > 0) {
      const msg = `Doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
      return;
    }
    if (!validateContractDatesBeforeSave()) return;
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
        idempotencyKey: buildContractsCreateIdempotencyKey(endorsementEntryPayload),
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
    if (
      product === "maxcizinkomplex" &&
      (durationMonths == null || normalizedDurationMonths(product, durationMonths) <= 0)
    ) {
      missing.push("dobu trvání v měsících");
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
    if (!validateContractDatesBeforeSave()) return;
    if (!validateTimelineBeforeSave()) return;

    // kontrola duplicitního čísla smlouvy
    const trimmedContractNumber = contractNumber.trim();
    const trimmedClientName = clientName.trim();
    const signedDateIsoDay = contractSignedDate.trim();
    const shouldRefreshOriginalNeon =
      product === "neon" &&
      refreshOriginalOpen;

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
            if (entries.length === 0) return;
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

        if (!isSavingForSubordinate && product && signedDateIsoDay && trimmedClientName) {
          const precheckParams = new URLSearchParams({
            productKey: product,
            clientName: trimmedClientName,
            signedDate: signedDateIsoDay,
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
            if (entries.length === 0) return;
            const displayDate = formatIsoDay(signedDateIsoDay);
            setDuplicateModal({
              mode: "saveAnyway",
              description: `Pro klienta ${trimmedClientName} už existuje produkt ${productLabel(
                product
              )} se stejným datem sjednání ${displayDate} (${similarEntries.length}×).`,
              contractNumber: trimmedContractNumber || null,
              count: entries.length,
              entries,
            });
            setSaving(false);
            return;
          }
        }
      } catch (dupErr) {
        console.warn("Kontrola duplicitních smluv selhala, pokračuji bez ní", dupErr);
      }
    }

    setSaving(true);
    setSaveMessage(null);
    setValidationError(null);
    setMissingFields([]);
    setLastSavedContractRef(null);

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

      const { response, data } = await requestContractsMutationWithAuth({
        user,
        path: "/api/contracts",
        method: "POST",
        payload: {
          ownerEmail: targetOwnerEmail,
          entry: {
            productKey: product,
            entryType: "contract" as ContractEntryType,
            inputAmount: product === "comfortcc" ? value : value,
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
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarMake.trim() || null
                : null,
            carPlate:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarPlate.trim() || null
                : null,
            carVin:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarVin.trim() || null
                : null,
            carTp: product === "slaviaauto" ? autoCarTp.trim() || null : null,
            carOrv:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
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
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarLiabilityLimit
                : null,
            carHullSumInsured:
              product === "kooperativaAuto" ||
              product === "pillowAuto" ||
              product === "csobAuto"
                ? autoCarHullSumInsured
                : null,
            carHullSumInsuredText:
              product === "pillowAuto" ? autoCarHullSumInsuredText.trim() || null : null,
            carHullDeductible:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarHullDeductible
                : null,
            carHullDeductibleText:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarHullDeductibleText.trim() || null
                : null,
            carHullRiskAccident:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskAccident
                : null,
            carHullRiskTheft:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskTheft
                : null,
            carHullRiskNatural:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskNatural
                : null,
            carHullRiskVandalism:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskVandalism
                : null,
            carHullRiskAnimalCollision:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskAnimalCollision
                : null,
            carAssistancePlan:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarAssistancePlan.trim() || null
                : null,
            carAddonEso: product === "cppAuto" ? autoCarAddonEso : null,
            carAddonGlass:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarAddonGlass
                : null,
            carAddonAnimalCollision:
              product === "slaviaauto" ? autoCarAddonAnimalCollision : null,
            carAddonAnimalDamage:
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto"
                ? autoCarAddonAnimalDamage
                : null,
            carAddonVandalism:
              product === "slaviaauto" || product === "allianzAuto"
                ? autoCarAddonVandalism
                : null,
            carAddonTheft: product === "allianzAuto" ? autoCarAddonTheft : null,
            carAddonNatural:
              product === "kooperativaAuto" || product === "allianzAuto"
                ? autoCarAddonNatural
                : null,
            carAddonGap: product === "allianzAuto" ? autoCarAddonGap : null,
            carAddonFireExplosion:
              product === "allianzAuto" ? autoCarAddonFireExplosion : null,
            carAddonLegalAdvice:
              product === "allianzAuto" ? autoCarAddonLegalAdvice : null,
            carAddonReplacementCar:
              product === "kooperativaAuto" ? autoCarAddonReplacementCar : null,
            carAddonLuggage:
              product === "kooperativaAuto" ? autoCarAddonLuggage : null,
            carAddonTransportedGoods:
              product === "kooperativaAuto" ? autoCarAddonTransportedGoods : null,
            carAddonPothole:
              product === "kooperativaAuto" ? autoCarAddonPothole : null,
            carAddonNonFaultAccident:
              product === "kooperativaAuto" || product === "pillowAuto"
                ? autoCarAddonNonFaultAccident
                : null,
            carAddonKeyLossTheft:
              product === "slaviaauto" ? autoCarAddonKeyLossTheft : null,
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
                    note: null,
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
                    note: null,
                  }
                : null,
            isRefresh: shouldRefreshOriginalNeon,
            refreshOriginalContractNumber: null,
          },
        },
        idempotencyKey: buildContractsCreateIdempotencyKey({
          entryType: "contract",
          productKey: product,
          contractNumber: trimmedContractNumber || null,
          clientName: clientName.trim() || null,
          contractSignedDate: contractSignedDate.trim(),
          policyStartDate: policyStartDate.trim(),
          policyEndDate: policyEndDate.trim() || null,
          inputAmount: value,
          frequencyRaw: frequency,
          isRefresh: shouldRefreshOriginalNeon,
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
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      const savedMessage = shouldRefreshOriginalNeon
        ? "Smlouva byla uložena a označena jako Refresh."
        : "Smlouva byla uložena mezi sepsané.";
      setSaveMessage(`${savedMessage}${pdfAttachmentMessage}`);
      setSaveSuccessFlash({
        contractNumber: contractNumber.trim() || null,
        clientName: clientName.trim() || null,
      });
      setContractSaveCelebrationKey((prev) => prev + 1);
      setRefreshOriginalOpen(false);
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

  useEffect(() => {
    if (!saveSuccessFlash) return;
    const t = window.setTimeout(() => setSaveSuccessFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [saveSuccessFlash]);

  useEffect(() => {
    if (!showCoefModal || product !== "neon") return;
    setNeonCoefficientView(isNeonHistoricalBySignedDate ? "historical" : "current");
  }, [showCoefModal, product, isNeonHistoricalBySignedDate]);

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
  const canChoosePositionManually = isSavingForSubordinate || isCommissionOnlyMode;
  const headerTitle = tipsterModeEnabled
    ? "Kalkulačka - TIPAŘ"
    : isAddContractMode
      ? "Přidat smlouvu"
      : "Kalkulačka provizí";
  const hasFrequencyPicker = allowed.length > 1;
  const showPolicyEndDateField = product === "cppcestovko";
  const lastSavedContractHref = lastSavedContractRef
    ? `/smlouvy/${encodeURIComponent(
        `${lastSavedContractRef.ownerEmail}___${lastSavedContractRef.entryId}`
      )}?from=list`
    : null;
  const currentProduct = PRODUCT_OPTIONS.find((p) => p.id === product)!;
  const currentProductInstitutionId = productInstitutionIdFromCatalog(product);
  const durationHelp = durationTooltip(product, isNeonHistoricalBySignedDate);
  const canChooseMode =
    isLifeProduct &&
    userCommissionMode === "accelerated" &&
    !(product === "neon" && isNeonHistoricalBySignedDate);
  const positionLockedToTimeline = !canChoosePositionManually;
  const allowedPositionOptions = canChoosePositionManually
    ? POSITION_ORDER
    : timelineMatchedPosition
      ? [timelineMatchedPosition.position]
      : [position];
  const showPositionTimelineHint = !isSavingForSubordinate;
  const positionTimelineHintWarning =
    !isSavingForSubordinate &&
    isAddContractMode &&
    (positionTimeline.length === 0 ||
      (!isCommissionOnlyMode &&
        contractSignedDate.trim().length > 0 &&
        !timelineMatchedPosition));
  const positionTimelineHintText = showPositionTimelineHint
    ? isCommissionOnlyMode
      ? "V režimu kalkulačky provizí si můžeš pozici zvolit ručně."
      : positionTimeline.length === 0
      ? "Nejdřív nastav timeline kariéry v Nastavení. Bez ní nepůjde smlouvu uložit."
      : !contractSignedDate.trim()
        ? "Doplň datum sjednání. Pozice se načte automaticky z timeline."
        : timelineMatchedPosition
          ? `Pozice byla načtena z timeline: ${positionLabel(
              timelineMatchedPosition.position
            )} (${formatIsoDay(timelineMatchedPosition.validFrom)} - ${
              timelineMatchedPosition.validTo
                ? formatIsoDay(timelineMatchedPosition.validTo)
                : "otevřeno"
            }).`
          : "Pro zadané datum sjednání nemáš v timeline nastavenou pozici."
    : null;

  const computeItemsForPositionAndMode = (
    pos: Position | null,
    customMode?: CommissionMode | null,
    amountOverride?: number | null
  ): { items: CommissionResultItemDTO[]; total: number } | null => {
    if (!pos) return null;
    const val =
      amountOverride == null ? parseNumber(amountText) : toNonNegativeNumber(amountOverride);
    const freq = frequency;
    const years = durationYears;
    const usedMode = (customMode ?? mode) as CommissionMode;

    switch (product) {
      case "neon": {
        return calculateNeon(
          val,
          pos,
          years,
          usedMode,
          contractSignedDateForNeon
        );
      }
      case "flexi":
      {
        const y = normalizedDurationYears("flexi", years);
        return calculateFlexi(val, pos, usedMode, y);
      }
      case "maximaMaxEfekt": {
        const y = normalizedDurationYears("maximaMaxEfekt", years);
        return calculateMaxEfekt(val, y, pos, usedMode);
      }
      case "maxcizinkomplex":
        return calculateMaxCizinKomplex(val, pos, maxCizinKomplexVariant);
      case "pillowInjury":
        return calculatePillowInjury(val, pos, usedMode);
      case "domex":
      case "cpphafan":
      case "koopmajetekobcan": {
        const dto =
          product === "domex"
            ? calculateDomex(val, freq, pos)
            : product === "cpphafan"
            ? calculateCppHafan(val, freq, pos)
            : calculateKoopMajetekObcan(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "pillowmajetek":
        return calculatePillowMajetek(val, freq, pos);
      case "maxdomov": {
        const dto = calculateMaxdomov(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "allianzmujdomov":
        return calculateAllianzMujDomov(val, freq, pos);
      case "cppAuto":
        return calculateCppAuto(val, freq, pos);
      case "slaviaauto":
        return calculateSlaviaAuto(val, freq, pos);
      case "cppPPRbez": {
        const dto = calculateCppPPRbez(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
        return { items: filtered, total: sum };
      }
      case "cppPPRs":
        return calculateCppPPRs(val, freq, pos);
      case "allianzAuto":
        return calculateAllianzAuto(val, freq, pos);
      case "csobAuto":
        return calculateCsobAuto(val, freq, pos);
      case "uniqaAuto":
      case "uniqaflotila":
        return calculateUniqaAuto(val, freq, pos);
      case "pillowAuto":
        return calculatePillowAuto(val, freq, pos);
      case "kooperativaAuto":
        return calculateKooperativaAuto(val, freq, pos);
      case "zamex":
        return calculateZamex(val, freq, pos);
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
  
    return (
    <AppLayout active="calc">
      {saveSuccessFlash ? (
        <div
          key={contractSaveCelebrationKey}
          className="admin-create-celebration pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="absolute inset-0 bg-slate-950/24 backdrop-blur-[5px]" />
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2">
            {CONTRACT_SAVE_CONFETTI_PIECES.map((piece, index) => (
              <span
                key={`${piece.x}-${piece.y}-${index}`}
                className={`admin-create-confetti-piece absolute left-1/2 top-1/2 ${piece.shapeClass}`}
                style={
                  {
                    "--admin-confetti-x": `${piece.x}px`,
                    "--admin-confetti-y": `${piece.y}px`,
                    "--admin-confetti-rotate": `${piece.rotate}deg`,
                    "--admin-confetti-color": piece.color,
                    animationDelay: `${piece.delayMs}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="admin-create-success-stage relative flex min-h-[260px] flex-col items-center justify-center px-4 text-center">
            <span className="admin-create-success-aura absolute inset-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="admin-create-success-orbit absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="admin-create-success-check relative mb-5 inline-flex h-24 w-24 items-center justify-center rounded-full !text-emerald-100">
              <CheckCircle2 size={56} strokeWidth={2.4} aria-hidden="true" />
            </span>
            <p className="admin-create-success-kicker text-[12px] font-semibold uppercase tracking-[0.32em]">
              Hotovo
            </p>
            <p className="admin-create-success-title mt-2 font-bold tracking-[-0.02em]">
              Smlouva sepsána !
            </p>
          </div>
        </div>
      ) : null}
      <div className="w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl font-mono text-slate-900">
      {validationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setValidationError(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
            <div className="text-sm text-slate-900">
              {validationError}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDuplicateModal(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
            <div className="text-sm text-slate-900 space-y-2">
              <p>{duplicateModal.description}</p>
              <p>
                {duplicateModal.mode === "overwrite"
                  ? "Můžeš ji přepsat, nebo akci zrušit."
                  : "Může jít o duplicitu. Můžeš pokračovat uložením, nebo akci zrušit."}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={async () => {
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
                    // ulož znovu bez další kontroly duplicit
                    await handleSaveContract(true);
                  } catch (err) {
                    console.error("Přepsání smlouvy selhalo", err);
                    setSaveMessage("Přepsání smlouvy se nepodařilo. Zkus to znovu.");
                    setSaving(false);
                  }
                }}
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                {duplicateModal.mode === "overwrite" ? "Přepsat" : "Uložit i tak"}
              </button>
            </div>
          </div>
        </div>
      )}
      {endorsementDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEndorsementDraft(null)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
            <div className="space-y-2 text-sm text-slate-900">
              <p>
                Připravena změna ke smlouvě <strong>{endorsementDraft.contractNumber}</strong>.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-1.5 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">Původní pojistné</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(endorsementDraft.previousPremiumAmount)}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">Nové pojistné</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(endorsementDraft.newPremiumAmount)}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">
                    {endorsementDraft.changeType === "increase"
                      ? "Navýšení"
                      : endorsementDraft.changeType === "decrease"
                        ? "Ponížení"
                        : "Rozdíl"}
                  </span>
                  <span
                    className={`font-semibold ${
                      endorsementDraft.deltaAmount >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {endorsementDraft.deltaAmount >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(endorsementDraft.deltaAmount))}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="text-slate-600">Provize k dodatku</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(endorsementDraft.total)}
                  </span>
                </p>
              </div>
              {endorsementDraft.changeType === "decrease" && (
                <p className="text-xs text-amber-700">
                  Ponížení zatím neřešíme výpočtem. Dodatek se uloží s provizí 0 Kč.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Dodatek bude uložen zvlášť a navázán na původní smlouvu.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndorsementDraft(null)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSaveEndorsement}
                disabled={saving}
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Ukládám…" : "Uložit změnu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tipContractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setTipContractModalOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)] space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900">Smlouva z TIPU</h3>
              <p className="text-sm text-slate-700">
                Tipař má nárok pouze na % z okamžité provize v 1. roce.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wide text-slate-600">
                Podíl pro tipaře
              </label>
              <select
                value={tipContractDraftPercent}
                onChange={(e) =>
                  setTipContractDraftPercent(clampTipContractPercent(Number(e.target.value)))
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                {TIP_CONTRACT_PERCENT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} %
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wide text-slate-600">
                Tipař / uživatel (e-mail nebo jméno)
              </label>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={tipContractDraftEmail}
                  onChange={(e) => handleTipContractUserInputChange(e.target.value)}
                  placeholder="Začni psát jméno nebo e-mail"
                  className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:border-slate-900 ${
                    tipContractLookupState.status === "found"
                      ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-600"
                      : "border-slate-300 bg-white focus:ring-slate-900"
                  }`}
                />
                {(tipContractSuggestionsLoading || tipContractUserSuggestions.length > 0) && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                    {tipContractSuggestionsLoading && (
                      <div className="px-3 py-2 text-xs text-slate-500">Načítám návrhy…</div>
                    )}
                    {tipContractUserSuggestions.map((option) => (
                      <button
                        key={option.email}
                        type="button"
                        onClick={() => selectTipContractUser(option)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                          {option.accountType === "tipster" ? (
                            <Lightbulb size={16} aria-hidden="true" />
                          ) : (
                            <UserRound size={16} aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {option.name || option.email}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {option.email} • {ACCOUNT_TYPE_LABELS[option.accountType]}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {tipContractLookupState.status === "checking" && (
                <p className="text-xs text-slate-500">Ověřuji uživatele…</p>
              )}
              {tipContractLookupState.status === "found" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {tipContractLookupState.name ?? tipContractLookupState.email}
                    <span className="text-emerald-700/70">
                      {ACCOUNT_TYPE_LABELS[tipContractLookupState.accountType]}
                    </span>
                  </span>
                  {canShowTipContractTipsButton && (
                    <button
                      type="button"
                      onClick={loadTipContractTipsForSelectedUser}
                      className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#d946ef_0%,#9d22c9_100%)] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(217,70,239,0.25)] transition hover:-translate-y-0.5"
                    >
                      <Lightbulb size={14} aria-hidden="true" />
                      {tipContractSelectedTip ? "Změnit TIP" : "Zobrazit TIPY"}
                    </button>
                  )}
                </div>
              )}
              {tipContractLookupState.status === "notFound" && (
                <p className="text-xs text-rose-700">Uživatel s tímto e-mailem nebyl nalezen.</p>
              )}
              {tipContractLookupState.status === "error" && (
                <p className="text-xs text-rose-700">{tipContractLookupState.message}</p>
              )}
              {tipContractSelectedTip && (
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-950">
                  <div className="flex items-start gap-2">
                    <Tag size={15} className="mt-0.5 text-fuchsia-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        Vybraný TIP: {tipContractSelectedTip.productLabel} •{" "}
                        {tipContractSelectedTip.clientName}
                      </p>
                      <p className="mt-0.5 text-fuchsia-900/75">
                        Vytvořeno {formatTipCreatedAt(tipContractSelectedTip.createdAtMs)}.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>
                Příklad: pokud je okamžitá provize v 1. roce {formatMoneyResult(
                  tipContractImmediateGrossFirstYear
                )}
                , tipař dostane {tipContractDraftPercent} % a tobě zůstane{" "}
                {formatMoneyResult(
                  roundToCents(
                    tipContractImmediateGrossFirstYear *
                      (1 - clampTipContractPercent(tipContractDraftPercent) / 100)
                  )
                )}
                .
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {tipContractConfig && (
                <button
                  type="button"
                  onClick={clearTipContractSettings}
                  className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition"
                >
                  Vypnout TIP
                </button>
              )}
              <button
                type="button"
                onClick={() => setTipContractModalOpen(false)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={applyTipContractSettings}
                disabled={
                  (() => {
                    const normalizedDraftEmail = tipContractDraftEmail.trim().toLowerCase();
                    if (!normalizedDraftEmail) return false;
                    return (
                      tipContractLookupState.status !== "found" ||
                      tipContractLookupState.email !== normalizedDraftEmail
                    );
                  })()
                }
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Použít
              </button>
            </div>
          </div>
        </div>
      )}

      {tipContractTipsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setTipContractTipsModalOpen(false)}
          />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                  Výběr tipu
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  Tipy od {currentTipContractUser?.name ?? currentTipContractUser?.email ?? "uživatele"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Vyber konkrétní tip, který se má propsat do ukládané smlouvy.
                </p>
              </div>
                <button
                  type="button"
                  onClick={() => setTipContractTipsModalOpen(false)}
                  className="rounded-full border border-slate-300 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  aria-label="Zavřít výběr tipů"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
  
              {!tipContractTipsLoading && !tipContractTipsError && tipContractTips.length > 0 && (
                <div className="mt-4 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {TIP_CONTRACT_TIPS_FILTER_OPTIONS.map((option) => {
                    const active = tipContractTipsFilter === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setTipContractTipsFilter(option.key)}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? "bg-slate-950 text-white shadow-[0_8px_16px_rgba(15,23,42,0.18)]"
                            : "text-slate-600 hover:bg-white"
                        }`}
                      >
                        {option.label}{" "}
                        <span className={active ? "text-white/75" : "text-slate-400"}>
                          ({tipContractTipCounts[option.key]})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
  
              <div className="mt-5 max-h-[56vh] space-y-3 overflow-y-auto pr-1">
                {tipContractTipsLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    Načítám tipy…
                  </div>
                ) : tipContractTipsError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {tipContractTipsError}
                  </div>
                ) : tipContractTips.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    Od tohoto uživatele zatím nemáš žádný přijatý tip.
                  </div>
                ) : filteredTipContractTips.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    V tomto filtru není žádný tip.
                  </div>
                  ) : (
                    filteredTipContractTips.map((tip) => {
                      const isSelected = tipContractSelectedTip?.id === tip.id;
                      return (
                        <button
                          key={tip.id}
                          type="button"
                          onClick={() => selectTipContractTip(tip)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)] ${
                            isSelected
                              ? "border-fuchsia-300 bg-fuchsia-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-800">
                                  <Lightbulb size={13} aria-hidden="true" />
                                  {tip.productLabel}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {TIP_CONTRACT_STATUS_LABELS[tip.status]}
                                </span>
                              </div>
                              <h4 className="mt-2 truncate text-lg font-semibold text-slate-950">
                                {tip.clientName}
                              </h4>
                              <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                                <span className="inline-flex items-center gap-2">
                                  <CalendarDays size={15} aria-hidden="true" />
                                  {formatTipCreatedAt(tip.createdAtMs)}
                                </span>
                                {tip.phone && (
                                  <span className="inline-flex items-center gap-2">
                                    <UserRound size={15} aria-hidden="true" />
                                    {tip.phone}
                                  </span>
                                )}
                                {tip.email && (
                                  <span className="inline-flex items-center gap-2 truncate">
                                    <Mail size={15} aria-hidden="true" />
                                    <span className="truncate">{tip.email}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                                isSelected
                                  ? "bg-[linear-gradient(135deg,#d946ef_0%,#9d22c9_100%)] text-white"
                                  : "border border-slate-300 bg-white text-slate-900"
                              }`}
                            >
                              {isSelected ? (
                                <CheckCircle2 size={16} aria-hidden="true" />
                              ) : (
                                <FileText size={16} aria-hidden="true" />
                              )}
                              {isSelected ? "Vybráno" : "Vybrat TIP"}
                            </span>
                          </div>
                        </button>
                      );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {canOverrideOwnerOnSave && subordinatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSubordinatePickerOpen(false)}
          />
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Uložit smlouvu za poradce
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Vyber vlastníka smlouvy. Výpočet i uložení proběhne podle jeho profilu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubordinatePickerOpen(false)}
                className="rounded-full border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Zavřít výběr poradce"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="relative mt-4">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={subordinateSearchText}
                onChange={(event) => setSubordinateSearchText(event.target.value)}
                placeholder="Hledat podřízeného (jméno nebo e-mail)"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {subordinateLoading ? (
              <p className="mt-4 text-sm text-slate-600">Načítám podřízené…</p>
            ) : subordinateLoadError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {subordinateLoadError}
              </div>
            ) : (
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubordinateEmail(null);
                    setSubordinatePickerOpen(false);
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    !selectedSubordinateEmail
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users size={14} aria-hidden="true" />
                    <span className="font-semibold">Můj účet</span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-80">{normalizedUserEmail}</div>
                </button>

                {filteredSubordinateOptions.map((option) => {
                  const active = selectedSubordinateEmail === option.email;
                  return (
                    <button
                      key={option.email}
                      type="button"
                      onClick={() => {
                        setSelectedSubordinateEmail(option.email);
                        setSubordinatePickerOpen(false);
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-slate-900 bg-slate-950 text-white"
                          : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <div className="font-semibold">{option.name}</div>
                      <div className="mt-0.5 text-xs opacity-80">{option.email}</div>
                    </button>
                  );
                })}

                {filteredSubordinateOptions.length === 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    {subordinateSearchQuery
                      ? "Žádný podřízený neodpovídá hledání."
                      : "Zatím nejsou načtení žádní podřízení."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CalculatorProductPickerModal
        isOpen={productOpen}
        product={product}
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

        <div className="grid gap-6 items-start lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5 w-full lg:max-w-3xl">
            {/* Produkt + PDF import */}
            <CalculatorProductAndPdfSection
              canImportFromPdf={canImportFromPdf && isAddContractMode}
              productOpen={productOpen}
              currentProductLabel={currentProduct.label}
              productLogoSrc={productInstitutionLogo(product)}
              productInstitutionId={currentProductInstitutionId}
              productLogoImageClass={institutionLogoImageClass(currentProductInstitutionId)}
              productLogoFrameClass={institutionLogoFrameClass(currentProductInstitutionId, "chip")}
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

            <section className="rounded-[1.35rem] border border-slate-300 bg-white/90 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)] space-y-4">
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
                onComfortGradualChange={setComfortGradual}
                onAmountTextChange={setAmountText}
                onComfortPaymentTextChange={setComfortPaymentText}
                onComfortTargetAmountTextChange={setComfortTargetAmountText}
                onOpenTipContractModal={openTipContractModal}
                onToggleRefreshOriginal={() => setRefreshOriginalOpen((prev) => !prev)}
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
              positionDisabledHint={
                positionLockedToTimeline
                  ? isCommissionOnlyMode
                    ? "Pozice se řídí pouze timeline kariéry."
                    : "Pozice se řídí pouze timeline kariéry podle data sjednání."
                  : null
              }
              timelineHintText={positionTimelineHintText}
              timelineHintWarning={positionTimelineHintWarning}
              canChooseMode={canChooseMode}
              mode={mode}
              isNeonHistoricalBySignedDate={isNeonHistoricalBySignedDate}
              onPositionChange={canChoosePositionManually ? setPosition : () => {}}
              onModeChange={setMode}
            />
          </div>

          <CalculatorResultsSection
            topTools={
              canOverrideOwnerOnSave && isAddContractMode ? (
                <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Uložení smlouvy
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {selectedSaveOwnerLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubordinatePickerOpen(true)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-900 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
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
            paymentBasedTotalsMemo={paymentBasedTotalsMemo}
            tipContractImmediateGrossFirstYear={tipContractImmediateGrossFirstYear}
            tipContractTipsterAmountFirstYear={tipContractTipsterAmountFirstYear}
            tipContractImmediateNetFirstYear={tipContractImmediateNetFirstYear}
            tipContractTotalNet={tipContractTotalNet}
            total={total}
            saving={saving}
            canSaveContract={
              isAddContractMode &&
              !saving &&
              items.length > 0 &&
              parseNumber(amountText) > 0 &&
              (isSavingForSubordinate || positionTimeline.length > 0)
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
      </div>

      {showCoefModal && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít koeficienty"
            onClick={() => setShowCoefModal(false)}
          />
          <div
            className={`relative z-50 w-full max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-black/30 ${
              showAutoTermsPreview || showNeonTermsPreview ? "max-w-6xl" : "max-w-md"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Koeficienty</h3>
              <button
                type="button"
                onClick={() => setShowCoefModal(false)}
                className="rounded-full px-2 text-slate-500 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-slate-600">
                  {product ? productLabel(product) : "—"} · pozice {positionLabel(position)}{" "}
                  {product === "neon" && isNeonHistoricalInCoefModal
                    ? "· historické podmínky (bez režimu)"
                    : `· režim ${mode}`}
                </p>
                {product === "neon" && (
                  <p className="text-xs font-semibold text-rose-700">
                    {isNeonHistoricalInCoefModal
                      ? "Historické koeficienty – platnost 01.10.2019 až 30.06.2024"
                      : "Aktuální koeficienty – platnost od 01.07.2024"}
                  </p>
                )}
                {product && isAutoProduct(product) && (
                  <p className="text-xs font-semibold text-rose-700">
                    Provizní podmínky aktuální od 01.04.2026
                  </p>
                )}
              </div>

              {product === "neon" && (
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setNeonCoefficientView("current")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      neonCoefficientView === "current"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Aktuální
                  </button>
                  <button
                    type="button"
                    onClick={() => setNeonCoefficientView("historical")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      neonCoefficientView === "historical"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Historické
                  </button>
                </div>
              )}
            </div>

            <div
              className={`mt-4 ${
                showNeonTermsPreview
                  ? "grid gap-4 lg:grid-cols-[minmax(320px,0.68fr)_minmax(620px,1.32fr)]"
                  : ""
              }`}
            >
              <section className="order-1 rounded-xl border border-slate-300 bg-slate-50 p-3 space-y-3">
                {product === "neon" ? (
                  <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
                    <p className="font-bold uppercase tracking-wide text-slate-900">
                      JAK FUNGUJE VÝPOČET?
                    </p>
                    <p className="mt-1">
                      Měsíční pojistné x 12 x doba trvání smlouvy (maximálně{" "}
                      {isNeonHistoricalInCoefModal ? "20" : "15"}) x koeficient %.
                    </p>
                    <p className="mt-1">
                      Pro následnou a pečovatelskou provizi: pojistné x 12 x
                      koeficient %.
                    </p>
                  </div>
                ) : (
                  coefExplanation && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {coefExplanation}
                    </p>
                  )
                )}

                {product &&
                  (product === "neon" ||
                    product === "flexi" ||
                    product === "maximaMaxEfekt" ||
                    product === "pillowInjury") && (
                    <p className="text-xs font-semibold text-rose-700">
                      UPOZORNĚNÍ: Výpočet okamžité provize počítá s tím, že je
                      zpracována karta klienta dle podmínek!
                    </p>
                  )}
                {neonImmediatePayoutInfo && (
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {neonImmediatePayoutInfo}
                  </p>
                )}

                <div className="space-y-2 pt-1">
                  {coefList.length > 0 ? (
                    coefList.map((c, idx) => (
                      <div
                        key={`${c.label}-${idx}`}
                        className="flex w-full max-w-[500px] items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <span className="text-slate-600">{c.label}</span>
                        <span className="font-semibold">{formatCoefficientNumber(c.value)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">
                      Pro tento produkt nebo pozici nemám koeficienty k zobrazení.
                    </p>
                  )}
                </div>

                {showAutoTermsPreview && autoTermsPreviewUrl && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Provizní podmínky {product ? productLabel(product) : "Auto"} (náhled)
                      </p>
                      <a
                        href={autoTermsPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
                      >
                        Otevřít v nové kartě
                      </a>
                    </div>
                    <div className="h-[62vh] min-h-[460px] overflow-auto rounded-lg border border-slate-300 bg-slate-100 p-2">
                      <Image
                        src={autoTermsPreviewUrl}
                        alt={`Provizní podmínky ${product ? productLabel(product) : "Auto"}`}
                        width={1600}
                        height={2400}
                        className="mx-auto h-auto w-full rounded-md"
                        sizes="(max-width: 1024px) 100vw, 1200px"
                        priority
                      />
                    </div>
                  </div>
                )}
              </section>

              {showNeonTermsPreview && neonTermsPreviewUrl && (
                <aside className="order-2 rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Provizní podmínky NEON
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleNeonDocumentAction("download")}
                      disabled={neonDocAction !== null}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download size={12} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      {neonDocAction === "download"
                        ? "Stahuji..."
                        : "Stáhnout provizní podmínky"}
                    </button>
                  </div>
                  <div className="mb-2 text-[11px] text-slate-600">
                    <button
                      type="button"
                      onClick={() => void handleNeonDocumentAction("open")}
                      disabled={neonDocAction !== null}
                      className="font-semibold underline underline-offset-2 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {neonDocAction === "open"
                        ? "Otevírám PDF..."
                        : "Kompletní PDF: Otevřít v nové kartě"}
                    </button>
                  </div>

                  {neonPreviewError && (
                    <p className="mb-2 text-xs font-semibold text-rose-700">{neonPreviewError}</p>
                  )}

                  <div className="relative h-[70vh] min-h-[540px] overflow-hidden rounded-lg border border-slate-300 bg-white">
                    {neonPreviewLoading ? (
                      <div className="flex h-full items-center justify-center px-4 text-sm text-slate-600">
                        Načítám náhled provizních podmínek...
                      </div>
                    ) : neonPreviewBlobUrl ? (
                      <Image
                        src={neonPreviewBlobUrl}
                        alt={
                          neonCoefficientView === "historical"
                            ? "Náhled provizních podmínek NEON 2019"
                            : "Náhled provizních podmínek NEON 2024"
                        }
                        fill
                        sizes="100vw"
                        unoptimized
                        className="object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-600">
                        Náhled se nepodařilo načíst.
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </AppLayout>
  );
}
