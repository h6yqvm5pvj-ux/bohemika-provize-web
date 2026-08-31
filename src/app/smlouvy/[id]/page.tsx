// src/app/smlouvy/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileSignature,
  FileText,
  IdCard,
  Package,
  PencilLine,
  RotateCcw,
  Search,
  Settings2,
  StickyNote,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { auth } from "../../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  isLifeProduct,
  productInstitutionLogo,
} from "@/app/lib/productCatalog";
import {
  resolveContractTerminationProductDefaults,
  storeContractTerminationPrefill,
} from "@/app/pomucky/vypoved-smlouvy/contractTerminationPrefill";
import {
  getTerminationReasonsForSelection,
  shouldShowContractTerminationAction,
  type TerminationReason,
} from "@/app/pomucky/vypoved-smlouvy/universalTermination";
import { parseTerminationPolicyholderPdf } from "@/app/lib/parseTerminationPolicyholderPdf";
import { parseUniqaAutoPdf } from "@/app/lib/parseUniqaAutoPdf";
import {
  isAnnualSeparatedPeriodProduct,
  isPerPaymentSeparatedPeriodProduct,
  isSeparatedPeriodCommissionProduct,
} from "@/app/lib/separatedPeriodCommissions";

import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
} from "../../types/domain";
import Image from "next/image";

import type { DomexFields } from "../components/DomexDetailPanel";
import type { AutoFields } from "../components/AutoDetailPanel";
import type { NeonFields } from "../components/NeonDetailPanel";
import type { FlexiFields } from "../components/FlexiDetailPanel";
import {
  AutoDetailPanel,
  DomexDetailPanel,
  FlexiDetailPanel,
  NeonDetailPanel,
} from "./ContractDetailPanels";
import { Spinner, Skeleton, Toasts } from "./ContractDetailUi";
import {
  type ContractCommissionStatementDetail,
  type ContractCommissionStatementSummary,
  type ContractDoc,
} from "./contractDetailTypes";
import {
  computeTotalWithMultipliers,
  formatDate,
  formatMoney,
  frequencyText,
  isAutoProduct,
  isFrequencyAutoPayoutProduct,
  isEmailInChain,
  isManagerPosition,
  nameFromEmail,
  normalizeEmail,
  normalizeTitleForCompare,
  paymentBasedTotals,
  paymentsPerYear,
  positionLabel,
  preloadFormulaModule,
  productIcon,
  productLabel,
  stripTotalRows,
  toDate,
  toDateInputValue,
} from "./contractDetailHelpers";
import { useToasts } from "./useToasts";
import {
  contractLifecycleStatus,
  contractMaturityDate,
} from "@/app/lib/contractLifecycle";
import {
  computeLegacyFrequencyOverrideTotal,
} from "@/app/lib/managerOverrideTotals";
import {
  LIFE_PRODUCT_KEYS,
  type ContractsApiError,
  type ContractsApiResponseBase,
  type ContractDetailApiResponse,
  type NeonImmediateBreakdown,
  toCommissionMode,
  buildNeonImmediateBreakdown,
} from "./contractDetailLogic";
import {
  ContractCommissionSection,
  type MeziprovisionCard,
} from "./ContractCommissionSection";
import { ContractCommissionHistory } from "./ContractCommissionHistory";
import { ContractAutoPremiumHistory } from "./ContractAutoPremiumHistory";
import {
  mergeEmptyContractFields,
  mergeEmptyNeonDetailFields,
  mergeEmptyPropertyDetailFields,
  mergeEmptySlaviaAutoDetailFields,
  PDF_REIMPORT_PARSERS,
} from "./contractDetailPdfReimport";
import { useContractDetails } from "./useContractDetails";
import { fetchAuthedBlob } from "@/app/lib/authenticatedApi";
import {
  ADMIN_IMPERSONATION_EVENT,
  ADMIN_IMPERSONATION_STORAGE_KEY,
  readAdminImpersonationState,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { CLIENT_CARDS_ENABLED } from "@/app/_klienti/clientFeature";
import { clientCardHrefForName } from "@/app/_klienti/clientAccess";
import {
  birthDateFromCzechBirthNumber,
  parseKooperativaAutoPdf,
} from "@/app/lib/parseKooperativaAutoPdf";
import { isSlaviaAutoSupportedForSignedDate } from "@/app/lib/productFormulas/slaviaAuto";

const CPP_EXTRANET_REDIRECT_URL =
  "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx";
const ALLIANZ_AUTO_PAYMENT_CHECK_URL =
  "https://www.allianz.cz/cs_CZ/apps/zaplacenost-pojistky.html";
const KOOPERATIVA_CONTRACT_STATUS_URL =
  "https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml";
const SLAVIA_CONTRACT_VERIFICATION_URL =
  "https://www.slavia-pojistovna.cz/over-ps/";
const UNIQA_ONLINE_TERMINATION_URL =
  "https://ivos.uniqa.cz/prod/ChangeCps?findType=Storno";
const SHOW_CONTRACT_PDF_PREVIEW_BUTTON = true;

type ContractTransferTarget = {
  email: string;
  name: string | null;
  position: Position | null;
};

const localIsoDay = (value = new Date()): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeTransferSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const transferTargetLabel = (target: ContractTransferTarget): string =>
  target.name?.trim() || nameFromEmail(target.email) || target.email;

function originalReplacementLabel(product?: Product | null): string {
  return product === "neon" ? "Refresh" : "Náhrada";
}

function ContractScanPaper({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_55px_rgba(15,23,42,0.18)] ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#020617_0%,#bd00c9_52%,#ff79f2_100%)]" />
      <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[20px] border-b border-l border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#e2e8f0_100%)] shadow-inner">
        <div className="absolute right-0 top-0 h-full w-full bg-white/70 [clip-path:polygon(100%_0,0_0,100%_100%)]" />
      </div>

      <div className="relative flex h-full flex-col px-7 py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.22)]">
            <FileText size={24} strokeWidth={2.1} aria-hidden="true" />
          </div>
          <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-700">
            Smlouva
          </span>
        </div>

        <div className="mt-8 space-y-3">
          <div className="h-4 w-28 rounded-full bg-slate-950" />
          <div className="h-3 w-44 rounded-full bg-slate-200" />
          <div className="h-3 w-36 rounded-full bg-fuchsia-300" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="h-2.5 w-12 rounded-full bg-slate-300" />
            <div className="mt-2 h-2.5 w-20 rounded-full bg-slate-200" />
          </div>
          <div className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="h-2.5 w-14 rounded-full bg-fuchsia-300" />
            <div className="mt-2 h-2.5 w-16 rounded-full bg-slate-200" />
          </div>
        </div>

        <div className="mt-7 space-y-3">
          {[0, 1, 2, 3].map((line) => (
            <div
              key={`contract-loader-line-${line}`}
              className="h-2.5 rounded-full bg-slate-200"
              style={{ width: `${88 - line * 12}%` }}
            />
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-5 border-t border-slate-200 pt-6">
          <div className="space-y-2">
            <div className="h-2.5 w-20 rounded-full bg-slate-300" />
            <div className="h-2.5 w-28 rounded-full bg-slate-200" />
          </div>
          <div className="h-9 w-28 rounded-full border border-fuchsia-200 bg-[linear-gradient(90deg,rgba(189,0,201,0.12),rgba(255,121,242,0.2))]">
            <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-fuchsia-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

const normalizeCppExtranetParam = (
  value: string | number | null | undefined
): string | null => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
};

const buildCppExtranetDetailUrl = (contract: ContractDoc | null): string | null => {
  const entityTypeId = normalizeCppExtranetParam(contract?.cppExtranetEntityTypeId);
  const entityId = normalizeCppExtranetParam(contract?.cppExtranetEntityId);
  if (!entityTypeId || !entityId) return null;

  const params = new URLSearchParams({
    type: "detail",
    p_EntityTypeID: entityTypeId,
    p_EntityID: entityId,
  });
  return `${CPP_EXTRANET_REDIRECT_URL}?${params.toString()}`;
};

const normalizeMaxxContractDetailUrl = (
  value: string | null | undefined
): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase().startsWith("javascript:")) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
};

type ContractPdfPreviewPage = {
  pageNumber: number;
  width: number;
  height: number;
};

type ContractPdfOption = {
  ownerEmail: string;
  entryId: string;
  fileName: string;
  label: string;
  meta: string;
  isCurrent: boolean;
};

const statementDisplayTitle = (statement: ContractCommissionStatementDetail): string => {
  if (statement.statementNumber) return `Provizní výpis ${statement.statementNumber}`;
  return statement.fileName || "Provizní výpis";
};

const buildInteractiveStatementHtml = (html: string): string => {
  const previewStyle = `<style>
html {
  background: #ffffff !important;
}
body {
  width: 715px !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  box-sizing: border-box !important;
  background: #ffffff !important;
}
body > table.vypis_table {
  margin: 0 auto !important;
}
a[href^="javascript:toggleLayer"] {
  cursor: pointer;
}
</style>`;
  const toggleScript = `<script>
(function () {
  window.toggleLayer = function (whichLayer) {
    var elem = document.getElementById(whichLayer);
    if (!elem) return false;
    var currentDisplay = elem.style.display || window.getComputedStyle(elem).display;
    elem.style.display = currentDisplay === "none" ? "block" : "none";
    return false;
  };

  document.addEventListener("click", function (event) {
    var target = event.target;
    var link = target && target.closest ? target.closest("a[href^='javascript:toggleLayer']") : null;
    if (!link) return;

    var href = link.getAttribute("href") || "";
    var match = href.match(/toggleLayer\\((?:'|")?([^'")]+)(?:'|")?\\)/);
    if (!match || !match[1]) return;

    event.preventDefault();
    window.toggleLayer(match[1]);
  });
})();
</script>`;
  const htmlWithStyle = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${previewStyle}</head>`)
    : `${previewStyle}${html}`;

  if (/<\/body>/i.test(htmlWithStyle)) {
    return htmlWithStyle.replace(/<\/body>/i, `${toggleScript}</body>`);
  }
  return `${htmlWithStyle}${toggleScript}`;
};

function CommissionStatementPreviewModal({
  statement,
  onClose,
}: {
  statement: ContractCommissionStatementDetail | null;
  onClose: () => void;
}) {
  if (!statement) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#08030f]/78 px-4 py-6 backdrop-blur-[7px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-[min(980px,96vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 text-slate-950 shadow-[0_38px_92px_rgba(2,6,23,0.38)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <FileText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Provizní výpis
            </div>
            <h3 className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">
              {statementDisplayTitle(statement)}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {statement.period ?? "Období nezjištěno"}
              {statement.statementDate ? ` · vystaveno ${statement.statementDate}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-focus inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
            aria-label="Zavřít náhled provizního výpisu"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 px-3 py-4 sm:px-5">
          <iframe
            title={statementDisplayTitle(statement)}
            srcDoc={buildInteractiveStatementHtml(statement.html)}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="mx-auto block h-[min(76vh,940px)] w-[840px] max-w-full rounded-xl border border-slate-300 bg-white shadow-[0_16px_38px_rgba(15,23,42,0.16)]"
          />
        </div>
      </div>
    </div>
  );
}



export default function ContractDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const isEmbedded = searchParams?.get("embedded") === "1";
  const backToContractsHref =
    searchParams?.get("from") === "list" ? "/smlouvy?restore=1" : "/smlouvy";
  const fromListSuffix =
    searchParams?.get("from") === "list"
      ? `?from=list${isEmbedded ? "&embedded=1" : ""}`
      : isEmbedded
        ? "?embedded=1"
        : "";

  // slug: email___entryId
  let ownerEmail: string | null = null;
  let entryId: string | null = null;

  if (typeof rawId === "string") {
    const decoded = decodeURIComponent(rawId);
    const parts = decoded.split("___");
    if (parts.length === 2) {
      ownerEmail = parts[0];
      entryId = parts[1];
    }
  }

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [adminImpersonation, setAdminImpersonation] =
    useState<AdminImpersonationState | null>(() =>
      typeof window === "undefined" ? null : readAdminImpersonationState()
    );
  const [managerPosition, setManagerPosition] = useState<Position | null>(
    null
  );

  const [contract, setContract] = useState<ContractDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [embeddedLoadProgress, setEmbeddedLoadProgress] = useState(0);
  const [showEmbeddedLoader, setShowEmbeddedLoader] = useState(isEmbedded);
  const [error, setError] = useState<string | null>(null);
  const [contractTimeline, setContractTimeline] = useState<ContractDoc[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [commissionStatements, setCommissionStatements] = useState<
    ContractCommissionStatementSummary[]
  >([]);
  const [commissionStatementsLoading, setCommissionStatementsLoading] = useState(false);
  const [commissionStatementsError, setCommissionStatementsError] = useState<string | null>(null);
  const [statementPreview, setStatementPreview] =
    useState<ContractCommissionStatementDetail | null>(null);
  const [statementPreviewLoadingId, setStatementPreviewLoadingId] =
    useState<string | null>(null);
  const [rebuildingFromStatements, setRebuildingFromStatements] = useState(false);

  const [overrideItems, setOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [overrideTotal, setOverrideTotal] = useState<number | null>(null);
  const [overrideMode, setOverrideMode] = useState<CommissionMode | null>(null);
  const [childOverrideItems, setChildOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [childOverrideTotal, setChildOverrideTotal] = useState<number | null>(null);
  const [childOverrideMode, setChildOverrideMode] = useState<CommissionMode | null>(null);
  const [childOverrideLabel, setChildOverrideLabel] = useState<string | null>(null);
  const [childOverrideEmail, setChildOverrideEmail] = useState<string | null>(null);
  const [childOverrideName, setChildOverrideName] = useState<string | null>(null);
  const [childOverridePosition, setChildOverridePosition] = useState<Position | null>(null);
  const [showProductPanel, setShowProductPanel] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showAdvisorDetails, setShowAdvisorDetails] = useState(false);
  const [expandedMeziprovisionKeys, setExpandedMeziprovisionKeys] = useState<string[]>([]);
  const [ownerPosition, setOwnerPosition] = useState<Position | null>(null);
  const [ownerManagerEmail, setOwnerManagerEmail] = useState<string | null>(null);
  const [ownerManagerPosition, setOwnerManagerPosition] = useState<Position | null>(null);
  const [currentChainEmails, setCurrentChainEmails] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [updatingPaid, setUpdatingPaid] = useState(false);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [updatingStorno, setUpdatingStorno] = useState(false);
  const [stornoError, setStornoError] = useState<string | null>(null);
  const [stornoDateInput, setStornoDateInput] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStornoModal, setShowStornoModal] = useState(false);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTerminationReasonModal, setShowTerminationReasonModal] =
    useState(false);
  const [showUniqaTerminationModal, setShowUniqaTerminationModal] =
    useState(false);
  const [uniqaTerminationPersonalId, setUniqaTerminationPersonalId] =
    useState("");
  const [uniqaTerminationPersonalIdLoading, setUniqaTerminationPersonalIdLoading] =
    useState(false);
  const [uniqaTerminationPersonalIdError, setUniqaTerminationPersonalIdError] =
    useState<string | null>(null);
  const [selectedTerminationReason, setSelectedTerminationReason] =
    useState<TerminationReason | null>(null);
  const [terminationPrefillLoading, setTerminationPrefillLoading] =
    useState(false);
  const [canTransferContracts, setCanTransferContracts] = useState(false);
  const [transferTargets, setTransferTargets] = useState<ContractTransferTarget[]>([]);
  const [transferTargetEmail, setTransferTargetEmail] = useState("");
  const [transferTargetQuery, setTransferTargetQuery] = useState("");
  const [transferTargetSearchOpen, setTransferTargetSearchOpen] = useState(false);
  const [transferEffectiveDate, setTransferEffectiveDate] = useState(() =>
    localIsoDay()
  );
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [showKooperativaStatusModal, setShowKooperativaStatusModal] = useState(false);
  const [kooperativaBirthNumber, setKooperativaBirthNumber] = useState<string | null>(null);
  const [kooperativaDirectBirthDate, setKooperativaDirectBirthDate] = useState<string | null>(null);
  const [kooperativaCompanyId, setKooperativaCompanyId] = useState<string | null>(null);
  const [kooperativaLegalEntity, setKooperativaLegalEntity] = useState(false);
  const [kooperativaBirthNumberLoading, setKooperativaBirthNumberLoading] = useState(false);
  const [kooperativaBirthNumberError, setKooperativaBirthNumberError] = useState<string | null>(null);
  const [kooperativaPdfTemplateIssue, setKooperativaPdfTemplateIssue] = useState(false);
  const [kooperativaStatusCountdown, setKooperativaStatusCountdown] = useState(3);
  const [kooperativaStatusRedirected, setKooperativaStatusRedirected] = useState(false);
  const [kooperativaStatusRedirectError, setKooperativaStatusRedirectError] = useState<string | null>(null);
  const [showContractPdfModal, setShowContractPdfModal] = useState(false);
  const [showContractPdfOptions, setShowContractPdfOptions] = useState(false);
  const [selectedContractPdf, setSelectedContractPdf] =
    useState<ContractPdfOption | null>(null);
  const [contractPdfBlobUrl, setContractPdfBlobUrl] = useState<string | null>(null);
  const [contractPdfPages, setContractPdfPages] = useState<ContractPdfPreviewPage[]>([]);
  const [contractPdfLoading, setContractPdfLoading] = useState(false);
  const [contractPdfError, setContractPdfError] = useState<string | null>(null);
  const [openContractPdfExternally, setOpenContractPdfExternally] = useState(false);
  const contractPdfObjectUrlRef = useRef<string | null>(null);
  const contractPdfCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const kooperativaStatusRedirectTimerRef = useRef<number | null>(null);
  const kooperativaBirthNumberRequestRef = useRef(0);
  const uniqaTerminationRequestRef = useRef(0);
  const [neonImmediateBreakdown, setNeonImmediateBreakdown] =
    useState<NeonImmediateBreakdown | null>(null);
  const [canOpenRefreshReplacement, setCanOpenRefreshReplacement] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();
  const [unauthorized, setUnauthorized] = useState(false);
  const [serverCanManageContract, setServerCanManageContract] = useState(false);
  const isNeonImmediateBreakdownOpen = neonImmediateBreakdown != null;
  const isStatementPreviewOpen = statementPreview != null;

  const clearKooperativaStatusRedirect = useCallback(() => {
    if (kooperativaStatusRedirectTimerRef.current != null) {
      window.clearInterval(kooperativaStatusRedirectTimerRef.current);
      kooperativaStatusRedirectTimerRef.current = null;
    }
  }, []);

  const closeKooperativaStatusModal = useCallback(() => {
    clearKooperativaStatusRedirect();
    kooperativaBirthNumberRequestRef.current += 1;
    setKooperativaBirthNumber(null);
    setKooperativaDirectBirthDate(null);
    setKooperativaCompanyId(null);
    setKooperativaLegalEntity(false);
    setKooperativaBirthNumberLoading(false);
    setKooperativaBirthNumberError(null);
    setKooperativaPdfTemplateIssue(false);
    setKooperativaStatusRedirectError(null);
    setShowKooperativaStatusModal(false);
  }, [clearKooperativaStatusRedirect]);

  const closeUniqaTerminationModal = useCallback(() => {
    uniqaTerminationRequestRef.current += 1;
    setUniqaTerminationPersonalIdLoading(false);
    setShowUniqaTerminationModal(false);
  }, []);

  useEffect(() => {
    return () => {
      if (kooperativaStatusRedirectTimerRef.current != null) {
        window.clearInterval(kooperativaStatusRedirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isEmbedded) return;

    if (loading) {
      setShowEmbeddedLoader(true);
      setEmbeddedLoadProgress(0);
      const timer = window.setInterval(() => {
        setEmbeddedLoadProgress((current) => {
          if (current < 32) return Math.min(current + 8, 32);
          if (current < 68) return Math.min(current + 5, 68);
          if (current < 92) return Math.min(current + 2, 92);
          return current;
        });
      }, 120);
      return () => window.clearInterval(timer);
    }

    setEmbeddedLoadProgress(100);
    const doneTimer = window.setTimeout(() => {
      setShowEmbeddedLoader(false);
    }, 280);
    return () => window.clearTimeout(doneTimer);
  }, [isEmbedded, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDeleteModal(false);
        setShowStornoModal(false);
        setShowManagementModal(false);
        setShowTransferModal(false);
        setShowTerminationReasonModal(false);
        closeUniqaTerminationModal();
        setSelectedTerminationReason(null);
        closeKooperativaStatusModal();
        setShowContractPdfModal(false);
        setShowContractPdfOptions(false);
        setSelectedContractPdf(null);
        setNeonImmediateBreakdown(null);
        setStatementPreview(null);
      }
    };
    if (
      showDeleteModal ||
      showStornoModal ||
      showManagementModal ||
      showTransferModal ||
      showTerminationReasonModal ||
      showUniqaTerminationModal ||
      showKooperativaStatusModal ||
      showContractPdfModal ||
      showContractPdfOptions ||
      isNeonImmediateBreakdownOpen ||
      isStatementPreviewOpen
    ) {
      window.addEventListener("keydown", onKey);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [
    showDeleteModal,
    showStornoModal,
    showManagementModal,
    showTransferModal,
    showTerminationReasonModal,
    showUniqaTerminationModal,
    showKooperativaStatusModal,
    showContractPdfModal,
    showContractPdfOptions,
    isNeonImmediateBreakdownOpen,
    isStatementPreviewOpen,
    closeKooperativaStatusModal,
    closeUniqaTerminationModal,
  ]);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const syncImpersonation = () => {
      setAdminImpersonation(readAdminImpersonationState());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ADMIN_IMPERSONATION_STORAGE_KEY) return;
      syncImpersonation();
    };

    syncImpersonation();
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px), (hover: none) and (pointer: coarse)");
    const sync = () => setOpenContractPdfExternally(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  const requestContractsApi = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!user) {
        const err = new Error("Nejsi přihlášený.") as ContractsApiError;
        err.status = 401;
        throw err;
      }

      const doRequest = async (token: string) => {
        const headers = new Headers(init?.headers ?? {});
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(path, {
          ...(init ?? {}),
          headers,
          cache: init?.cache ?? "no-store",
        });
      };

      let token = await user.getIdToken();
      let res = await doRequest(token);
      if (res.status === 401) {
        token = await user.getIdToken(true);
        res = await doRequest(token);
      }

      const payload = (await res.json().catch(() => ({}))) as ContractsApiResponseBase;
      if (!res.ok || payload?.ok === false) {
        const err = new Error(
          payload?.error || "Požadavek na API smluv selhal."
        ) as ContractsApiError;
        err.status = res.status;
        throw err;
      }

      return payload as T;
    },
    [user]
  );

  const clearContractPdfPreview = useCallback(() => {
    if (contractPdfObjectUrlRef.current) {
      URL.revokeObjectURL(contractPdfObjectUrlRef.current);
      contractPdfObjectUrlRef.current = null;
    }
    contractPdfCanvasRefs.current = [];
    setContractPdfBlobUrl(null);
    setContractPdfPages([]);
  }, []);

  const closeContractPdfModal = useCallback(() => {
    setShowContractPdfModal(false);
    setShowContractPdfOptions(false);
    setSelectedContractPdf(null);
    setContractPdfError(null);
    setContractPdfLoading(false);
    clearContractPdfPreview();
  }, [clearContractPdfPreview]);

  useEffect(() => {
    preloadFormulaModule(contract?.productKey ?? null);
  }, [contract?.productKey]);

  useEffect(() => {
    const existing = toDateInputValue(contract?.stornoDate ?? null);
    if (existing) {
      setStornoDateInput(existing);
      return;
    }
    setStornoDateInput(toDateInputValue(new Date()) ?? "");
  }, [contract?.stornoDate]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!ownerEmail || !entryId) {
        setError("Neplatný odkaz na smlouvu.");
        setLoading(false);
        setTimelineLoading(false);
        return;
      }
      if (!user) return;

      setLoading(true);
      setTimelineLoading(true);
      setError(null);
      setTimelineError(null);
      setUnauthorized(false);

      try {
        const params = new URLSearchParams({
          ownerEmail,
          entryId,
        });
        const payload = await requestContractsApi<ContractDetailApiResponse>(
          `/api/contracts/detail?${params.toString()}`
        );
        if (cancelled) return;

        if (!payload.contract) {
          setError("Smlouva nebyla nalezena.");
          setContract(null);
          setContractTimeline([]);
          setServerCanManageContract(false);
          setCanTransferContracts(false);
          setTransferTargets([]);
          setOwnerPosition(null);
          setOwnerManagerEmail(null);
          setOwnerManagerPosition(null);
          setCurrentChainEmails([]);
          setManagerPosition(null);
          return;
        }

        setContract(payload.contract);
        setServerCanManageContract(payload.canManageContract === true);
        setCanTransferContracts(payload.canTransferContracts === true);
        setTransferTargets(
          (Array.isArray(payload.transferTargets) ? payload.transferTargets : [])
            .map((target) => ({
              email: normalizeEmail(target.email),
              name: target.name?.trim() || null,
              position: target.position ?? null,
            }))
            .filter(
              (target): target is ContractTransferTarget => Boolean(target.email)
            )
        );
        const loadedNote = (payload.contract.note as string | undefined) ?? "";
        setNoteDraft(loadedNote);
        setNoteExpanded(loadedNote.trim().length > 0);
        const timeline =
          Array.isArray(payload.timeline) && payload.timeline.length > 0
            ? payload.timeline
            : [payload.contract];
        setContractTimeline(timeline);
        setOwnerPosition((payload.ownerMeta?.position as Position | null | undefined) ?? null);
        setOwnerManagerEmail(
          normalizeEmail(payload.ownerMeta?.managerEmail ?? null) || null
        );
        setOwnerManagerPosition(
          (payload.ownerMeta?.managerPosition as Position | null | undefined) ?? null
        );
        setCurrentChainEmails(
          Array.isArray(payload.ownerMeta?.currentChainEmails)
            ? payload.ownerMeta?.currentChainEmails
                .map((item) => normalizeEmail(item))
                .filter((item): item is string => Boolean(item))
            : []
        );
        setManagerPosition((payload.position as Position | null | undefined) ?? null);
      } catch (e) {
        console.error("Chyba při načítání detailu smlouvy:", e);
        if (cancelled) return;

        const status = (e as ContractsApiError).status;
        if (status === 403) {
          setUnauthorized(true);
          setError("Nemáš oprávnění zobrazit tuto smlouvu.");
        } else if (status === 404) {
          setError("Smlouva nebyla nalezena.");
        } else if (status === 401) {
          setUnauthorized(true);
          setError("Přihlášení vypršelo. Přihlas se prosím znovu.");
        } else {
          setError("Při načítání smlouvy došlo k chybě.");
        }
        setContract(null);
        setContractTimeline([]);
        setServerCanManageContract(false);
        setCanTransferContracts(false);
        setTransferTargets([]);
        setOwnerPosition(null);
        setOwnerManagerEmail(null);
        setOwnerManagerPosition(null);
        setCurrentChainEmails([]);
        setTimelineError("Timeline změn se nepodařilo načíst.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTimelineLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [adminImpersonation?.email, entryId, ownerEmail, requestContractsApi, user]);

  useEffect(() => {
    const contractNumber = contract?.contractNumber?.trim() ?? "";
    const shouldLoadStatements =
      Boolean(user) &&
      Boolean(contractNumber) &&
      isAutoProduct(contract?.productKey ?? null);

    if (!shouldLoadStatements || !user) {
      setCommissionStatements([]);
      setCommissionStatementsLoading(false);
      setCommissionStatementsError(null);
      return;
    }

    let cancelled = false;

    const loadStatements = async () => {
      setCommissionStatementsLoading(true);
      setCommissionStatementsError(null);

      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          shape: "premiumHistory",
          contractNumber,
          limit: "240",
        });
        const response = await fetch(`/api/commission-statements?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              items?: ContractCommissionStatementSummary[];
              error?: string;
            }
          | null;

        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
          throw new Error(payload?.error || "Provizní výpisy se nepodařilo načíst.");
        }

        if (!cancelled) {
          setCommissionStatements(payload.items);
        }
      } catch (statementError) {
        if (cancelled) return;
        console.warn(
          "Detail smlouvy: provizní výpisy pro historii pojistného se nepodařilo načíst.",
          statementError
        );
        setCommissionStatements([]);
        setCommissionStatementsError(
          statementError instanceof Error
            ? statementError.message
            : "Provizní výpisy se nepodařilo načíst."
        );
      } finally {
        if (!cancelled) {
          setCommissionStatementsLoading(false);
        }
      }
    };

    void loadStatements();

    return () => {
      cancelled = true;
    };
  }, [adminImpersonation?.email, contract?.contractNumber, contract?.productKey, user]);

  const handleOpenCommissionStatementPreview = useCallback(
    async (statementId: string) => {
      const normalizedStatementId = statementId.trim();
      if (!user || !normalizedStatementId) return;

      setStatementPreviewLoadingId(normalizedStatementId);

      try {
        const token = await user.getIdToken();
        const response = await fetch(
          `/api/commission-statements?id=${encodeURIComponent(normalizedStatementId)}&includeHtml=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; item?: ContractCommissionStatementDetail; error?: string }
          | null;

        if (!response.ok || payload?.ok !== true || !payload.item?.html) {
          throw new Error(payload?.error || "Provizní výpis se nepodařilo otevřít.");
        }

        setStatementPreview(payload.item);
      } catch (statementError) {
        console.warn(
          "Detail smlouvy: náhled provizního výpisu se nepodařilo otevřít.",
          statementError
        );
        pushToast(
          statementError instanceof Error
            ? statementError.message
            : "Provizní výpis se nepodařilo otevřít.",
          "error"
        );
      } finally {
        setStatementPreviewLoadingId(null);
      }
    },
    [pushToast, user]
  );

  const isEndorsement = contract?.entryType === "endorsement";
  const lifecycleInput = {
    status: contract?.status,
    productKey: contract?.productKey,
    policyStartDate: contract?.policyStartDate,
    policyEndDate: contract?.policyEndDate,
    durationYears:
      typeof contract?.durationYears === "number" && !Number.isNaN(contract.durationYears)
        ? contract.durationYears
        : null,
    durationMonths:
      typeof contract?.durationMonths === "number" && !Number.isNaN(contract.durationMonths)
        ? contract.durationMonths
        : null,
  };
  const lifecycleStatus = contractLifecycleStatus(lifecycleInput);
  const isStornoContract = lifecycleStatus === "storno";
  const isDozitaContract = lifecycleStatus === "dozita";
  const stornoDateLabel = contract?.stornoDate
    ? formatDate(contract.stornoDate)
    : "—";
  const stornoMinimumDate =
    toDate(contract?.policyStartDate ?? null) ??
    toDate(contract?.contractSignedDate ?? null) ??
    toDate(contract?.createdAt ?? null);
  const stornoMinimumDateInput = toDateInputValue(stornoMinimumDate);
  const maturityDate = contractMaturityDate(lifecycleInput);
  const maturityDateLabel = maturityDate ? formatDate(maturityDate) : "—";
  const contractLifecycleBadgeText = isStornoContract
    ? stornoDateLabel !== "—"
      ? `Storno od ${stornoDateLabel}`
      : "Storno"
    : isDozitaContract
    ? maturityDateLabel !== "—"
      ? `Dožitá od ${maturityDateLabel}`
      : "Dožitá"
    : "Aktivní";
  const contractLifecycleBadgeStyle = isStornoContract
    ? {
        wrapper:
          "border-amber-200/90 bg-[linear-gradient(135deg,#fffbeb_0%,#fef3c7_100%)] text-amber-900 shadow-[0_10px_24px_rgba(217,119,6,0.14)]",
        iconWrap:
          "border-amber-700/70 bg-[linear-gradient(135deg,#f59e0b_0%,#d97706_100%)] text-white shadow-[0_8px_16px_rgba(217,119,6,0.28)]",
        icon: (
          <CalendarDays
            size={14}
            strokeWidth={2.2}
            className="shrink-0"
            aria-hidden="true"
          />
        ),
      }
    : isDozitaContract
    ? {
        wrapper:
          "border-sky-200/90 bg-[linear-gradient(135deg,#f0f9ff_0%,#dbeafe_100%)] text-sky-900 shadow-[0_10px_24px_rgba(14,116,144,0.14)]",
        iconWrap:
          "border-sky-700/70 bg-[linear-gradient(135deg,#0ea5e9_0%,#0369a1_100%)] text-white shadow-[0_8px_16px_rgba(3,105,161,0.28)]",
        icon: (
          <CalendarDays
            size={14}
            strokeWidth={2.2}
            className="shrink-0"
            aria-hidden="true"
          />
        ),
      }
    : {
        wrapper:
          "border-emerald-200/90 bg-[linear-gradient(135deg,#ecfdf5_0%,#d1fae5_100%)] text-emerald-900 shadow-[0_10px_24px_rgba(5,150,105,0.14)]",
        iconWrap:
          "border-emerald-700/70 bg-[linear-gradient(135deg,#22c55e_0%,#059669_100%)] text-white shadow-[0_8px_16px_rgba(5,150,105,0.28)]",
        icon: (
          <span className="text-[14px] font-black leading-none" aria-hidden="true">
            ✓
          </span>
        ),
      };
  const refreshOriginalContractNumber =
    typeof contract?.refreshOriginalContractNumber === "string"
      ? contract.refreshOriginalContractNumber.trim()
      : "";
  const isRefreshContract =
    contract?.isRefresh === true || refreshOriginalContractNumber.length > 0;
  const originalReplacementLabelText = originalReplacementLabel(
    contract?.productKey
  );
  const isNeonRefreshContract =
    isRefreshContract && contract?.productKey === "neon";
  const refreshOriginalMissingInSystem =
    contract?.refreshOriginalMissingInSystem === true;
  const hasProvisionalRefreshCalculation =
    isNeonRefreshContract &&
    (contract?.requiresStatementRefresh === true ||
      contract?.commissionCalculationStatus ===
        "provisional_refresh_missing_original" ||
      (refreshOriginalMissingInSystem &&
        contract?.commissionBaseSource !== "commission_statement" &&
        contract?.commissionCalculationStatus !==
          "statement_resolved_refresh_missing_original"));
  const refreshReplacementEntryId =
    typeof contract?.refreshReplacedByEntryId === "string"
      ? contract.refreshReplacedByEntryId.trim()
      : "";
  const refreshReplacementOwnerEmail =
    normalizeEmail(contract?.refreshReplacedByOwnerEmail ?? null) ?? "";
  const hasRefreshReplacement =
    refreshReplacementEntryId.length > 0 && refreshReplacementOwnerEmail.length > 0;
  const refreshReplacementSignedLabel = contract?.refreshReplacedBySignedDate
    ? formatDate(contract.refreshReplacedBySignedDate)
    : "—";
  const refreshReplacementHref = hasRefreshReplacement
    ? `/smlouvy/${encodeURIComponent(
        `${refreshReplacementOwnerEmail}___${refreshReplacementEntryId}`
      )}${fromListSuffix}`
    : null;
  const latestTimelineEntry = useMemo(() => {
    const sourceEntries =
      contractTimeline.length > 0 ? contractTimeline : contract ? [contract] : [];
    if (sourceEntries.length === 0) return null;
    return sourceEntries[sourceEntries.length - 1] ?? null;
  }, [contract, contractTimeline]);
  const premiumEntry = latestTimelineEntry ?? contract;
  const premiumEntryIsEndorsement = premiumEntry?.entryType === "endorsement";
  const isShowingLatestTimelinePremium =
    !isEndorsement &&
    Boolean(premiumEntry?.id && contract?.id && premiumEntry.id !== contract.id);
  const premium = premiumEntryIsEndorsement
    ? Number(
        premiumEntry?.newInputAmount ??
          premiumEntry?.effectiveInputAmount ??
          premiumEntry?.inputAmount ??
          0
      )
    : Number(premiumEntry?.inputAmount ?? 0);
  const refreshCommissionBase = contract?.refreshCommissionBase ?? null;
  const refreshCalculationMonthlyPremium = Number(
    isNeonRefreshContract
      ? refreshCommissionBase?.calculationMonthlyPremium ?? Number.NaN
      : Number.NaN
  );
  const refreshCalculationAnnualPremium = Number(
    isNeonRefreshContract
      ? refreshCommissionBase?.calculationAnnualPremium ??
          (Number.isFinite(refreshCalculationMonthlyPremium)
            ? refreshCalculationMonthlyPremium * 12
            : Number.NaN)
      : Number.NaN
  );
  const refreshOriginalAnnualPremium = Number(
    refreshCommissionBase?.originalAnnualPremium ?? Number.NaN
  );
  const refreshStornoBaseAnnualPremium = Number(
    refreshCommissionBase?.stornoBaseAnnualPremium ??
      refreshCommissionBase?.originalAnnualPremium ??
      Number.NaN
  );
  const refreshCalculationMethod =
    typeof refreshCommissionBase?.calculationMethod === "string"
      ? refreshCommissionBase.calculationMethod
      : null;
  const isRefreshMotivationalBase =
    refreshCalculationMethod === "motivational_48_percent";
  const refreshMotivationalAnnualPremium = Number(
    refreshCommissionBase?.motivationalAnnualPremium ?? Number.NaN
  );
  const hasDifferentRefreshStornoBase =
    Number.isFinite(refreshOriginalAnnualPremium) &&
    Number.isFinite(refreshStornoBaseAnnualPremium) &&
    Math.abs(refreshOriginalAnnualPremium - refreshStornoBaseAnnualPremium) >= 0.01;
  const hasRefreshCommissionBase =
    isNeonRefreshContract &&
    Number.isFinite(refreshCalculationAnnualPremium) &&
    refreshCalculationAnnualPremium > 0;
  const endorsementDelta = (() => {
    if (!isEndorsement) return null;
    const explicit = Number(contract?.premiumDelta ?? Number.NaN);
    if (Number.isFinite(explicit)) return explicit;
    const prev = Number(contract?.previousInputAmount ?? Number.NaN);
    const next = Number(
      contract?.newInputAmount ??
        contract?.effectiveInputAmount ??
        contract?.inputAmount ??
        Number.NaN
    );
    if (Number.isFinite(prev) && Number.isFinite(next)) return next - prev;
    return null;
  })();
  const modeLabel = (value?: CommissionMode | null) => {
    if (value === "accelerated") return "Zrychlený";
    if (value === "standard") return "Běžný";
    return "—";
  };
  const timelineRows = useMemo(() => {
    const normalizedOwner = normalizeEmail(ownerEmail);
    const encodedFromList =
      searchParams?.get("from") === "list" ? "?from=list" : "";

    const premiumForEntry = (entry: ContractDoc): number => {
      const isEntryEndorsement = entry.entryType === "endorsement";
      const value = isEntryEndorsement
        ? Number(
            entry.newInputAmount ??
              entry.effectiveInputAmount ??
              entry.inputAmount ??
              0
          )
        : Number(entry.inputAmount ?? 0);
      return Number.isFinite(value) ? value : 0;
    };

    const deltaForEntry = (entry: ContractDoc): number | null => {
      if (entry.entryType !== "endorsement") return null;
      const explicit = Number(entry.premiumDelta ?? Number.NaN);
      if (Number.isFinite(explicit)) return explicit;
      const prev = Number(entry.previousInputAmount ?? Number.NaN);
      const next = Number(
        entry.newInputAmount ??
          entry.effectiveInputAmount ??
          entry.inputAmount ??
          Number.NaN
      );
      if (Number.isFinite(prev) && Number.isFinite(next)) return next - prev;
      return null;
    };

    return contractTimeline.map((entry, index) => {
      const isCurrent = entry.id === contract?.id;
      const isEntryEndorsement = entry.entryType === "endorsement";
      const delta = deltaForEntry(entry);
      const premiumAmount = premiumForEntry(entry);
      const dateForOrder =
        toDate(entry.policyStartDate) ??
        toDate(entry.contractSignedDate) ??
        toDate(entry.createdAt) ??
        null;

      return {
        id: entry.id,
        href: normalizedOwner
          ? `/smlouvy/${encodeURIComponent(`${normalizedOwner}___${entry.id}`)}${encodedFromList}`
          : null,
        isCurrent,
        step: index + 1,
        label: isEntryEndorsement ? "Dodatek" : "Původní smlouva",
        premiumAmount,
        delta,
        contractSignedText: formatDate(entry.contractSignedDate ?? entry.createdAt),
        policyStartText: formatDate(entry.policyStartDate),
        positionText: positionLabel(entry.position ?? null),
        modeText: modeLabel(entry.commissionMode ?? null),
        total: Number(entry.total ?? 0),
        orderDateText: dateForOrder ? dateForOrder.toLocaleDateString("cs-CZ") : "—",
      };
    });
  }, [contract?.id, contractTimeline, ownerEmail, searchParams]);
  const hasTimelineChange = useMemo(() => {
    if (isEndorsement) return true;
    return contractTimeline.some((entry) => entry.entryType === "endorsement");
  }, [contractTimeline, isEndorsement]);
  const contractTotal = contract?.total ?? 0;
  const tipContractTipsterEmail = normalizeEmail(
    contract?.tipContractTipsterEmail ?? null
  );
  const tipContractTipsterPercent =
    typeof contract?.tipContractTipsterPercent === "number" &&
    Number.isFinite(contract.tipContractTipsterPercent)
      ? contract.tipContractTipsterPercent
      : null;
  const hasTipContract = tipContractTipsterPercent != null;
  const tipContractTipsterName = hasTipContract
    ? (contract?.tipContractTipsterName ?? "").trim() ||
      (tipContractTipsterEmail ? nameFromEmail(tipContractTipsterEmail) : "")
    : null;
  const tipContractSourceLabel = hasTipContract
    ? tipContractTipsterEmail
      ? `Od uživatele ${tipContractTipsterName || tipContractTipsterEmail} (${tipContractTipsterEmail}).`
      : "Tipař nebyl označen."
    : null;
  const tipContractSourceTipId =
    hasTipContract && typeof contract?.tipContractSourceTipId === "string"
      ? contract.tipContractSourceTipId.trim()
      : "";
  const tipContractSourceProductLabel =
    hasTipContract && typeof contract?.tipContractSourceTipProductLabel === "string"
      ? contract.tipContractSourceTipProductLabel.trim()
      : "";
  const tipContractSourceClientName =
    hasTipContract && typeof contract?.tipContractSourceTipClientName === "string"
      ? contract.tipContractSourceTipClientName.trim()
      : "";
  const tipContractSourceCreatedAtMs =
    hasTipContract &&
    typeof contract?.tipContractSourceTipCreatedAtMs === "number" &&
    Number.isFinite(contract.tipContractSourceTipCreatedAtMs)
      ? contract.tipContractSourceTipCreatedAtMs
      : null;
  const hasTipContractSource = Boolean(tipContractSourceTipId);
  const tipContractImmediateGross =
    hasTipContract &&
    typeof contract?.tipContractImmediateFirstYearGross === "number" &&
    Number.isFinite(contract.tipContractImmediateFirstYearGross)
      ? contract.tipContractImmediateFirstYearGross
      : null;
  const tipContractImmediateNet =
    hasTipContract &&
    typeof contract?.tipContractImmediateFirstYearNet === "number" &&
    Number.isFinite(contract.tipContractImmediateFirstYearNet)
      ? contract.tipContractImmediateFirstYearNet
      : null;
  const tipContractTipsterAmount =
    hasTipContract &&
    typeof contract?.tipContractTipsterAmountFirstYear === "number" &&
    Number.isFinite(contract.tipContractTipsterAmountFirstYear)
      ? contract.tipContractTipsterAmountFirstYear
      : null;
  const freq =
    (premiumEntry?.frequencyRaw as PaymentFrequency | null | undefined) ??
    (contract?.frequencyRaw as PaymentFrequency | null | undefined) ??
    null;
  const prod = contract?.productKey as Product | undefined;
  const institutionLogo = productInstitutionLogo(prod);
  const tipContractLifeProduct = isLifeProduct(prod ?? null);
  const tipContractBaseText = tipContractLifeProduct
    ? "Tipař má nárok pouze na podíl z provize A101."
    : "Tipař má nárok pouze na podíl z okamžité provize v 1. roce.";
  const tipContractGrossLabel = tipContractLifeProduct ? "A101 základ" : "Brutto";
  const tipContractNetLabel = tipContractLifeProduct ? "Sjednatel z A101" : "Sjednatel";
  const maxxContractDetailUrl = normalizeMaxxContractDetailUrl(contract?.maxxContractDetailUrl);
  const cppExtranetDetailUrl = buildCppExtranetDetailUrl(contract);
  const contractPdfAttachment = contract?.contractPdfAttachment ?? null;
  const hasContractPdfAttachment = Boolean(
    contractPdfAttachment?.hasFile && contractPdfAttachment?.contentType === "application/pdf"
  );
  const contractPdfFileName =
    typeof contractPdfAttachment?.originalName === "string" &&
    contractPdfAttachment.originalName.trim()
      ? contractPdfAttachment.originalName.trim()
      : "smlouva.pdf";
  const contractPdfOptions = useMemo<ContractPdfOption[]>(() => {
    const normalizedOwnerEmail = normalizeEmail(ownerEmail) || "";
    if (!normalizedOwnerEmail) return [];

    const sourceEntries =
      contractTimeline.length > 0 ? contractTimeline : contract ? [contract] : [];
    const options: ContractPdfOption[] = [];
    const seenEntryIds = new Set<string>();
    let endorsementIndex = 0;

    sourceEntries.forEach((entry) => {
      const sourceEntryId = typeof entry.id === "string" ? entry.id.trim() : "";
      const attachment = entry.contractPdfAttachment;
      if (
        !sourceEntryId ||
        seenEntryIds.has(sourceEntryId) ||
        !attachment?.hasFile ||
        attachment.contentType !== "application/pdf"
      ) {
        return;
      }
      seenEntryIds.add(sourceEntryId);

      const isEntryEndorsement = entry.entryType === "endorsement";
      if (isEntryEndorsement) endorsementIndex += 1;

      const explicitDelta = Number(entry.premiumDelta ?? Number.NaN);
      const previousPremium = Number(entry.previousInputAmount ?? Number.NaN);
      const nextPremium = Number(
        entry.newInputAmount ??
          entry.effectiveInputAmount ??
          entry.inputAmount ??
          Number.NaN
      );
      const delta = Number.isFinite(explicitDelta)
        ? explicitDelta
        : Number.isFinite(previousPremium) && Number.isFinite(nextPremium)
          ? nextPremium - previousPremium
          : null;
      const changeText =
        isEntryEndorsement && delta != null
          ? `${delta >= 0 ? "Navýšení" : "Ponížení"} ${formatMoney(Math.abs(delta))}`
          : null;
      const dateText = formatDate(entry.contractSignedDate ?? entry.createdAt);
      const fileName =
        typeof attachment.originalName === "string" && attachment.originalName.trim()
          ? attachment.originalName.trim()
          : "smlouva.pdf";
      const meta = [dateText !== "—" ? dateText : null, changeText, fileName]
        .filter((value): value is string => Boolean(value))
        .join(" / ");

      options.push({
        ownerEmail: normalizedOwnerEmail,
        entryId: sourceEntryId,
        fileName,
        label: isEntryEndorsement ? `Dodatek ${endorsementIndex}` : "Původní smlouva",
        meta: meta || fileName,
        isCurrent: sourceEntryId === contract?.id,
      });
    });

    return options;
  }, [contract, contractTimeline, ownerEmail]);
  const hasAnyContractPdfAttachment = contractPdfOptions.length > 0;
  const selectedContractPdfFileName = selectedContractPdf?.fileName ?? contractPdfFileName;
  const downloadContractPdfBlob = useCallback(
    async (option: ContractPdfOption): Promise<Blob> => {
      if (!user) {
        throw new Error("Nejsi přihlášený.");
      }

      const params = new URLSearchParams({
        ownerEmail: option.ownerEmail,
        entryId: option.entryId,
      });
      const response = await fetchAuthedBlob(
        user,
        `/api/contracts/attachment?${params.toString()}`,
        { method: "GET" }
      );
      if (!response.ok) {
        let message = "PDF smlouvy se nepodařilo načíst.";
        try {
          const payload = (await response.json()) as unknown;
          if (
            payload &&
            typeof payload === "object" &&
            typeof (payload as Record<string, unknown>).error === "string"
          ) {
            message = (payload as Record<string, string>).error;
          }
        } catch {
          // Binary endpoint may fail before JSON is available.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      return blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" });
    },
    [user]
  );
  const openContractPdfOptionInNewTab = useCallback(
    async (option: ContractPdfOption) => {
      setShowContractPdfOptions(false);
      setContractPdfError(null);

      const popup = window.open("", "_blank");
      if (popup) {
        popup.document.title = option.fileName;
        popup.document.body.style.margin = "0";
        popup.document.body.style.fontFamily = "system-ui, -apple-system, sans-serif";
        popup.document.body.style.display = "grid";
        popup.document.body.style.placeItems = "center";
        popup.document.body.style.minHeight = "100vh";
        popup.document.body.style.background = "#f8fafc";
        popup.document.body.style.color = "#0f172a";
        popup.document.body.textContent = "Načítám PDF smlouvy...";
      }

      setContractPdfLoading(true);
      try {
        const pdfBlob = await downloadContractPdfBlob(option);
        const objectUrl = URL.createObjectURL(pdfBlob);
        window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 10 * 60 * 1000);

        if (popup) {
          popup.opener = null;
          popup.location.href = objectUrl;
          return;
        }

        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : "PDF smlouvy se nepodařilo otevřít.";
        if (popup) {
          popup.document.body.textContent = message;
        }
        pushToast(message, "error");
      } finally {
        setContractPdfLoading(false);
      }
    },
    [downloadContractPdfBlob, pushToast]
  );
  const openContractPdfOption = useCallback((option: ContractPdfOption) => {
    if (openContractPdfExternally) {
      void openContractPdfOptionInNewTab(option);
      return;
    }
    setSelectedContractPdf(option);
    setShowContractPdfOptions(false);
    setShowContractPdfModal(true);
  }, [openContractPdfExternally, openContractPdfOptionInNewTab]);
  const handleContractPdfButtonClick = useCallback(() => {
    if (contractPdfOptions.length === 1 && contractPdfOptions[0]) {
      openContractPdfOption(contractPdfOptions[0]);
      return;
    }
    setShowContractPdfOptions((prev) => !prev);
  }, [contractPdfOptions, openContractPdfOption]);
  const isLifeInsuranceContract = Boolean(prod && LIFE_PRODUCT_KEYS.has(prod));
  const showTimelineSection = isLifeInsuranceContract && hasTimelineChange;
  const isAutoCommissionProduct = isAutoProduct(prod ?? null);
  const isFrequencyAutoCommissionProduct = isFrequencyAutoPayoutProduct(prod ?? null);
  const signedPremiumEntry = useMemo(() => {
    const sourceEntries =
      contractTimeline.length > 0 ? contractTimeline : contract ? [contract] : [];
    return (
      sourceEntries.find((entry) => entry.entryType !== "endorsement") ??
      sourceEntries[0] ??
      null
    );
  }, [contract, contractTimeline]);
  const signedPremiumFrequency =
    (signedPremiumEntry?.frequencyRaw as PaymentFrequency | null | undefined) ??
    (contract?.frequencyRaw as PaymentFrequency | null | undefined) ??
    null;
  const signedPremiumAmount = Number(
    signedPremiumEntry?.entryType === "endorsement"
      ? signedPremiumEntry.previousInputAmount ??
          signedPremiumEntry.effectiveInputAmount ??
          signedPremiumEntry.inputAmount ??
          Number.NaN
      : signedPremiumEntry?.inputAmount ?? Number.NaN
  );
  const signedAnnualPremium =
    Number.isFinite(signedPremiumAmount) && signedPremiumAmount > 0
      ? Math.round(signedPremiumAmount * paymentsPerYear(signedPremiumFrequency) * 100) / 100
      : null;
  const statementInitialAnnualPremiumRaw = Number(contract?.initialCommissionBase?.annualPremium);
  const statementInitialAnnualPremium =
    Number.isFinite(statementInitialAnnualPremiumRaw) && statementInitialAnnualPremiumRaw > 0
      ? Math.round(statementInitialAnnualPremiumRaw * 100) / 100
      : null;
  const preferStatementInitialPremium =
    isAutoCommissionProduct &&
    (contract?.createdFromCommissionStatement === true ||
      Boolean(String(contract?.createdFromCommissionStatementId ?? "").trim()) ||
      contract?.commissionBaseSource === "commission_statement_auto_initial");
  const contractSignedDateIso = toDateInputValue(
    contract?.contractSignedDate ?? contract?.createdAt
  );
  const commissionWarning =
    prod === "slaviaauto" &&
    contractSignedDateIso &&
    !isSlaviaAutoSupportedForSignedDate(contractSignedDateIso)
      ? "U smluv Slavia Auto sjednaných před 01.04.2026 nebylo možné vypočítat správně provizi."
      : null;
  const isPaymentBasedProduct =
    isSeparatedPeriodCommissionProduct(prod) || isFrequencyAutoCommissionProduct;
  const hideSeparatedPeriodTotals = Boolean(
    (isAutoCommissionProduct && (freq === "annual" || !isFrequencyAutoCommissionProduct)) ||
      ((prod === "domex" || prod === "cppbytex") && freq === "annual")
  );
  const paymentMultiplier =
    isPaymentBasedProduct && !isAnnualSeparatedPeriodProduct(prod)
      ? paymentsPerYear(freq)
      : 1;
  const adjustLegacyPerPaymentTotal = useCallback(
    (items: CommissionResultItemDTO[], total: number): number => {
      if (!prod) return total;
      return computeLegacyFrequencyOverrideTotal({
        productKey: prod,
        frequencyRaw: freq,
        items,
        fallbackTotal: total,
      });
    },
    [freq, prod]
  );
  const durationYears =
    typeof contract?.durationYears === "number" && !Number.isNaN(contract.durationYears)
      ? contract.durationYears
      : null;
  const durationBounds: [number, number] | null =
    prod === "neon"
      ? [1, 99]
      : prod === "maximaMaxEfekt"
      ? [1, 20]
      : prod === "flexi"
      ? [1, 80]
      : null;
  const showDurationForProduct = durationBounds != null;
  const normalizedEffectiveUserEmail = useMemo(
    () => normalizeEmail(adminImpersonation?.email ?? user?.email ?? null),
    [adminImpersonation?.email, user?.email]
  );
  const normalizedOwnerEmail = useMemo(
    () => normalizeEmail(contract?.userEmail ?? null),
    [contract?.userEmail]
  );
  const isOwnContract = useMemo(() => {
    if (!normalizedEffectiveUserEmail || !normalizedOwnerEmail) return false;
    return normalizedEffectiveUserEmail === normalizedOwnerEmail;
  }, [normalizedEffectiveUserEmail, normalizedOwnerEmail]);

  const isManagerOnChain = useMemo(() => {
    if (!contract || !normalizedEffectiveUserEmail || !normalizedOwnerEmail) return false;
    if (normalizedEffectiveUserEmail === normalizedOwnerEmail) return false;
    if (normalizeEmail(contract.managerEmailSnapshot) === normalizedEffectiveUserEmail) return true;
    if (isEmailInChain(normalizedEffectiveUserEmail, contract.managerChain ?? null)) return true;
    if (isEmailInChain(normalizedEffectiveUserEmail, contract.managerOverrides ?? null)) return true;
    return false;
  }, [contract, normalizedEffectiveUserEmail, normalizedOwnerEmail]);

  const isManagerOnCurrentChain = useMemo(() => {
    if (!normalizedEffectiveUserEmail || !currentChainEmails.length) return false;
    if (normalizedOwnerEmail && normalizedEffectiveUserEmail === normalizedOwnerEmail) return false;
    return currentChainEmails.includes(normalizedEffectiveUserEmail);
  }, [currentChainEmails, normalizedEffectiveUserEmail, normalizedOwnerEmail]);

  const isManagerViewingSubordinate = useMemo(() => {
    if (!isManagerPosition(managerPosition)) return false;
    return isManagerOnChain || isManagerOnCurrentChain;
  }, [managerPosition, isManagerOnChain, isManagerOnCurrentChain]);
  const canManageContract = isOwnContract || serverCanManageContract;
  const canViewContract =
    canManageContract || isManagerOnChain || isManagerOnCurrentChain;

  const refreshContractDetail = useCallback(async (): Promise<ContractDoc> => {
    if (!ownerEmail || !entryId) {
      throw new Error("Chybí identifikace smlouvy.");
    }

    const params = new URLSearchParams({
      ownerEmail,
      entryId,
    });
    const payload = await requestContractsApi<ContractDetailApiResponse>(
      `/api/contracts/detail?${params.toString()}`
    );
    if (!payload.contract) {
      throw new Error("Smlouva nebyla nalezena.");
    }

    setContract(payload.contract);
    setServerCanManageContract(payload.canManageContract === true);
    setCanTransferContracts(payload.canTransferContracts === true);
    setTransferTargets(
      (Array.isArray(payload.transferTargets) ? payload.transferTargets : [])
        .map((target) => ({
          email: normalizeEmail(target.email),
          name: target.name?.trim() || null,
          position: target.position ?? null,
        }))
        .filter(
          (target): target is ContractTransferTarget => Boolean(target.email)
        )
    );
    const loadedNote = (payload.contract.note as string | undefined) ?? "";
    setNoteDraft(loadedNote);
    setNoteExpanded(loadedNote.trim().length > 0);
    const timeline =
      Array.isArray(payload.timeline) && payload.timeline.length > 0
        ? payload.timeline
        : [payload.contract];
    setContractTimeline(timeline);
    setOwnerPosition((payload.ownerMeta?.position as Position | null | undefined) ?? null);
    setOwnerManagerEmail(normalizeEmail(payload.ownerMeta?.managerEmail ?? null) || null);
    setOwnerManagerPosition(
      (payload.ownerMeta?.managerPosition as Position | null | undefined) ?? null
    );
    setCurrentChainEmails(
      Array.isArray(payload.ownerMeta?.currentChainEmails)
        ? payload.ownerMeta?.currentChainEmails
            .map((item) => normalizeEmail(item))
            .filter((item): item is string => Boolean(item))
        : []
    );
    setManagerPosition((payload.position as Position | null | undefined) ?? null);

    return payload.contract;
  }, [entryId, ownerEmail, requestContractsApi]);

  const handleRebuildContractFromStatements = useCallback(async () => {
    const contractNumber = String(contract?.contractNumber ?? "").trim();
    if (!canManageContract || !ownerEmail || !entryId || !contractNumber) return;

    setRebuildingFromStatements(true);

    try {
      const payload = await requestContractsApi<
        ContractsApiResponseBase & {
          matchedStatements?: number;
          processedStatements?: number;
          processingResult?: {
            contractsUpdated?: number;
            contractsWithPayoutChanges?: number;
            payoutRecordsAdded?: number;
            payoutRecordsUpdated?: number;
            premiumUpdates?: number;
            premiumHistoryBackfills?: number;
            errors?: string[];
          };
        }
      >("/api/commission-statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "rebuild-contract-from-statements",
          ownerEmail,
          entryId,
          contractNumber,
        }),
      });

      await refreshContractDetail();

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      const matchedStatements = Number(payload.matchedStatements ?? 0);
      const result = payload.processingResult ?? {};
      const changedCount =
        Number(result.payoutRecordsAdded ?? 0) +
        Number(result.payoutRecordsUpdated ?? 0) +
        Number(result.premiumUpdates ?? 0) +
        Number(result.premiumHistoryBackfills ?? 0);
      const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;

      if (matchedStatements === 0) {
        pushToast("Pro tuto smlouvu jsem v uložených výpisech nenašel žádný řádek.", "success");
      } else if (errorCount > 0) {
        pushToast(
          `Přepočet doběhl přes ${matchedStatements} výpisů, ale ${errorCount} řádků vyžaduje kontrolu.`,
          "error"
        );
      } else if (changedCount === 0) {
        pushToast(`Přepočet z ${matchedStatements} výpisů doběhl bez nových změn.`, "success");
      } else {
        pushToast(
          `Přepočet hotový: ${matchedStatements} výpisů, ${changedCount} změn.`,
          "success"
        );
      }
    } catch (rebuildError) {
      console.error("Přepočet smlouvy z výpisů selhal:", rebuildError);
      pushToast(
        rebuildError instanceof Error
          ? rebuildError.message
          : "Smlouvu se nepodařilo přepočítat z výpisů.",
        "error"
      );
    } finally {
      setRebuildingFromStatements(false);
    }
  }, [
    canManageContract,
    contract?.contractNumber,
    entryId,
    ownerEmail,
    pushToast,
    refreshContractDetail,
    requestContractsApi,
  ]);

  useEffect(() => {
    let cancelled = false;

    const checkRefreshReplacementAccess = async () => {
      if (!hasRefreshReplacement || !normalizedEffectiveUserEmail) {
        setCanOpenRefreshReplacement(false);
        return;
      }

      if (normalizedEffectiveUserEmail === refreshReplacementOwnerEmail) {
        setCanOpenRefreshReplacement(true);
        return;
      }

      try {
        const params = new URLSearchParams({
          ownerEmail: refreshReplacementOwnerEmail,
          entryId: refreshReplacementEntryId,
          includeTimeline: "0",
        });
        await requestContractsApi<ContractDetailApiResponse>(
          `/api/contracts/detail?${params.toString()}`
        );
        if (!cancelled) setCanOpenRefreshReplacement(true);
      } catch (refreshAccessErr) {
        const status = (refreshAccessErr as ContractsApiError).status;
        if (status !== 403 && status !== 404) {
          console.error(
            "Chyba při ověřování přístupu na refresh smlouvu:",
            refreshAccessErr
          );
        }
        if (!cancelled) setCanOpenRefreshReplacement(false);
      }
    };

    void checkRefreshReplacementAccess();
    return () => {
      cancelled = true;
    };
  }, [
    hasRefreshReplacement,
    normalizedEffectiveUserEmail,
    requestContractsApi,
    refreshReplacementOwnerEmail,
    refreshReplacementEntryId,
  ]);

  useEffect(() => {
    if (!showContractPdfModal) {
      clearContractPdfPreview();
      return;
    }
    if (
      !user ||
      !selectedContractPdf?.ownerEmail ||
      !selectedContractPdf?.entryId
    ) {
      return;
    }

    let cancelled = false;

    const waitForPdfCanvases = async (pageCount: number) => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (contractPdfCanvasRefs.current.slice(0, pageCount).every(Boolean)) return;
      }
    };

    const loadContractPdf = async () => {
      setContractPdfLoading(true);
      setContractPdfError(null);
      clearContractPdfPreview();

      try {
        const pdfBlob = await downloadContractPdfBlob(selectedContractPdf);
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(pdfBlob);
        contractPdfObjectUrlRef.current = objectUrl;
        setContractPdfBlobUrl(objectUrl);

        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
        const doc = await pdfjsLib.getDocument({
          data: pdfBytes,
          isEvalSupported: false,
        }).promise;

        const nextPages: ContractPdfPreviewPage[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          nextPages.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
          });
        }

        if (cancelled) return;
        contractPdfCanvasRefs.current = [];
        setContractPdfPages(nextPages);
        await waitForPdfCanvases(doc.numPages);

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2.35 });
          const canvas = contractPdfCanvasRefs.current[pageNumber - 1];
          const context = canvas?.getContext("2d", { alpha: false });
          if (!canvas || !context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;
        }
      } catch (pdfErr) {
        if (cancelled) return;
        console.error("PDF smlouvy se nepodařilo načíst:", pdfErr);
        setContractPdfError(
          pdfErr instanceof Error && pdfErr.message.trim()
            ? pdfErr.message.trim()
            : "PDF smlouvy se nepodařilo načíst."
        );
      } finally {
        if (!cancelled) setContractPdfLoading(false);
      }
    };

    void loadContractPdf();

    return () => {
      cancelled = true;
      clearContractPdfPreview();
    };
  }, [
    clearContractPdfPreview,
    downloadContractPdfBlob,
    selectedContractPdf,
    showContractPdfModal,
    user,
  ]);

  const effectiveManagerPosition = useMemo(() => {
    if (!contract) return managerPosition ?? null;

    const snapshotPosition =
      (contract.managerPositionSnapshot as Position | null | undefined) ?? null;
    const viewerEmail = normalizedEffectiveUserEmail;
    if (!viewerEmail) return snapshotPosition ?? managerPosition ?? null;

    const overrides = (contract.managerOverrides as ContractDoc["managerOverrides"]) ?? [];
    const overridePosition =
      overrides.find((o) => normalizeEmail(o.email) === viewerEmail)?.position ?? null;
    if (overridePosition) return overridePosition;

    const chain = (contract.managerChain as ContractDoc["managerChain"]) ?? [];
    const chainPosition =
      chain.find((node) => normalizeEmail(node.email) === viewerEmail)?.position ?? null;
    if (chainPosition) return chainPosition;

    const snapshotManagerEmail = normalizeEmail(contract.managerEmailSnapshot ?? null);
    if (snapshotManagerEmail === viewerEmail && snapshotPosition) {
      return snapshotPosition;
    }

    return snapshotPosition ?? managerPosition ?? null;
  }, [contract, managerPosition, normalizedEffectiveUserEmail]);

  const [editMode, setEditMode] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientAddress, setEditClientAddress] = useState("");
  const [editContractNumber, setEditContractNumber] = useState("");
  const [editContractSigned, setEditContractSigned] = useState("");
  const [editPolicyStart, setEditPolicyStart] = useState("");
  const [editPolicyEnd, setEditPolicyEnd] = useState("");
  const [editDuration, setEditDuration] = useState<number | null>(null);
  const [editCarMake, setEditCarMake] = useState("");
  const [editCarPlate, setEditCarPlate] = useState("");
  const [editCarVin, setEditCarVin] = useState("");
  const [editCarTp, setEditCarTp] = useState("");
  const [editCarOrv, setEditCarOrv] = useState("");
  const [editCarAnnualMileage, setEditCarAnnualMileage] = useState("");
  const [editCarAllianzScope, setEditCarAllianzScope] = useState("");
  const [editCarLiabilityLimit, setEditCarLiabilityLimit] = useState("");
  const [editCarHullSumInsured, setEditCarHullSumInsured] = useState("");
  const [editCarHullDeductible, setEditCarHullDeductible] = useState("");
  const [editCarHullRiskAccident, setEditCarHullRiskAccident] = useState(false);
  const [editCarHullRiskTheft, setEditCarHullRiskTheft] = useState(false);
  const [editCarHullRiskNatural, setEditCarHullRiskNatural] = useState(false);
  const [editCarHullRiskVandalism, setEditCarHullRiskVandalism] = useState(false);
  const [editCarHullRiskAnimalCollision, setEditCarHullRiskAnimalCollision] = useState(false);
  const [editCarAssistancePlan, setEditCarAssistancePlan] = useState("");
  const [editCarAddonEso, setEditCarAddonEso] = useState(false);
  const [editCarAddonNaturalRisks, setEditCarAddonNaturalRisks] = useState(false);
  const [editCarAddonKlika, setEditCarAddonKlika] = useState(false);
  const [editCarAddonGlass, setEditCarAddonGlass] = useState(false);
  const [editCarAddonGlassLimit, setEditCarAddonGlassLimit] = useState("");
  const [editCarAddonAnimalCollision, setEditCarAddonAnimalCollision] = useState(false);
  const [editCarAddonAnimalCollisionLimit, setEditCarAddonAnimalCollisionLimit] = useState("");
  const [editCarAddonAnimalDamage, setEditCarAddonAnimalDamage] = useState(false);
  const [editCarAddonAnimalDamageLimit, setEditCarAddonAnimalDamageLimit] = useState("");
  const [editCarAddonVandalism, setEditCarAddonVandalism] = useState(false);
  const [editCarAddonTheft, setEditCarAddonTheft] = useState(false);
  const [editCarAddonTheftLimit, setEditCarAddonTheftLimit] = useState("");
  const [editCarAddonNatural, setEditCarAddonNatural] = useState(false);
  const [editCarAddonNaturalLimit, setEditCarAddonNaturalLimit] = useState("");
  const [editCarAddonOwnDamage, setEditCarAddonOwnDamage] = useState(false);
  const [editCarAddonOwnDamageLimit, setEditCarAddonOwnDamageLimit] = useState("");
  const [editCarAddonPothole, setEditCarAddonPothole] = useState(false);
  const [editCarAddonNonFaultAccident, setEditCarAddonNonFaultAccident] = useState(false);
  const [editCarAddonGap, setEditCarAddonGap] = useState(false);
  const [editCarAddonGapLimit, setEditCarAddonGapLimit] = useState("");
  const [editCarAddonSmartGap, setEditCarAddonSmartGap] = useState(false);
  const [editCarAddonServisPro, setEditCarAddonServisPro] = useState(false);
  const [editCarAddonReplacementCar, setEditCarAddonReplacementCar] = useState(false);
  const [editCarAddonLuggage, setEditCarAddonLuggage] = useState(false);
  const [editCarAddonTransportedGoods, setEditCarAddonTransportedGoods] = useState(false);
  const [editCarAddonFireExplosion, setEditCarAddonFireExplosion] = useState(false);
  const [editCarAddonLegalAdvice, setEditCarAddonLegalAdvice] = useState(false);
  const [editCarAddonPassengerInjury, setEditCarAddonPassengerInjury] = useState(false);
  const [editCarAddonKeyLossTheft, setEditCarAddonKeyLossTheft] = useState(false);
  const [editNeonVersion, setEditNeonVersion] = useState("");
  const [editNeonDeathType, setEditNeonDeathType] = useState("");
  const [editNeonDeathAmount, setEditNeonDeathAmount] = useState("");
  const [editNeonDeath2Type, setEditNeonDeath2Type] = useState("");
  const [editNeonDeath2Amount, setEditNeonDeath2Amount] = useState("");
  const [editNeonDeathTerminalAmount, setEditNeonDeathTerminalAmount] = useState("");
  const [editNeonWaiverInvalidity, setEditNeonWaiverInvalidity] = useState(false);
  const [editNeonWaiverUnemployment, setEditNeonWaiverUnemployment] = useState(false);
  const [editNeonInvalidityAType, setEditNeonInvalidityAType] = useState("");
  const [editNeonInvalidityA1, setEditNeonInvalidityA1] = useState("");
  const [editNeonInvalidityA2, setEditNeonInvalidityA2] = useState("");
  const [editNeonInvalidityA3, setEditNeonInvalidityA3] = useState("");
  const [editNeonInvalidityBType, setEditNeonInvalidityBType] = useState("");
  const [editNeonInvalidityB1, setEditNeonInvalidityB1] = useState("");
  const [editNeonInvalidityB2, setEditNeonInvalidityB2] = useState("");
  const [editNeonInvalidityB3, setEditNeonInvalidityB3] = useState("");
  const [editNeonInvalidityPension, setEditNeonInvalidityPension] = useState(false);
  const [editNeonCriticalType, setEditNeonCriticalType] = useState("");
  const [editNeonCriticalVariant, setEditNeonCriticalVariant] = useState("");
  const [editNeonCriticalAmount, setEditNeonCriticalAmount] = useState("");
  const [editNeonChildSurgeryAmount, setEditNeonChildSurgeryAmount] = useState("");
  const [editNeonVaccinationCompAmount, setEditNeonVaccinationCompAmount] = useState("");
  const [editNeonDiabetesAmount, setEditNeonDiabetesAmount] = useState("");
  const [editNeonDeathAccidentAmount, setEditNeonDeathAccidentAmount] = useState("");
  const [editNeonInjuryPermanentAmount, setEditNeonInjuryPermanentAmount] = useState("");
  const [editNeonInjuryPermanentFulfillmentFrom, setEditNeonInjuryPermanentFulfillmentFrom] =
    useState("");
  const [editNeonInjuryPermanentProgression, setEditNeonInjuryPermanentProgression] =
    useState("");
  const [editNeonInjuryPermanent2Amount, setEditNeonInjuryPermanent2Amount] = useState("");
  const [
    editNeonInjuryPermanent2FulfillmentFrom,
    setEditNeonInjuryPermanent2FulfillmentFrom,
  ] = useState("");
  const [editNeonInjuryPermanent2Progression, setEditNeonInjuryPermanent2Progression] =
    useState("");
  const [editNeonHospitalizationAmount, setEditNeonHospitalizationAmount] = useState("");
  const [editNeonHospitalizationIllnessAmount, setEditNeonHospitalizationIllnessAmount] = useState("");
  const [editNeonHospitalizationInjuryAmount, setEditNeonHospitalizationInjuryAmount] = useState("");
  const [editNeonWorkIncapacityStart, setEditNeonWorkIncapacityStart] = useState("");
  const [editNeonWorkIncapacityBackpay, setEditNeonWorkIncapacityBackpay] = useState("");
  const [editNeonWorkIncapacityAmount, setEditNeonWorkIncapacityAmount] = useState("");
  const [editNeonWorkIncapacityInjury, setEditNeonWorkIncapacityInjury] = useState(false);
  const [editNeonWorkIncapacityIllness, setEditNeonWorkIncapacityIllness] = useState(false);
  const [editNeonWorkIncapacity2Start, setEditNeonWorkIncapacity2Start] = useState("");
  const [editNeonWorkIncapacity2Backpay, setEditNeonWorkIncapacity2Backpay] = useState("");
  const [editNeonWorkIncapacity2Amount, setEditNeonWorkIncapacity2Amount] = useState("");
  const [editNeonWorkIncapacity2Injury, setEditNeonWorkIncapacity2Injury] =
    useState(false);
  const [editNeonWorkIncapacity2Illness, setEditNeonWorkIncapacity2Illness] =
    useState(false);
  const [editNeonCareDependencyAmount, setEditNeonCareDependencyAmount] = useState("");
  const [editNeonSpecialAidAmount, setEditNeonSpecialAidAmount] = useState("");
  const [editNeonCaregivingAmount, setEditNeonCaregivingAmount] = useState("");
  const [editNeonReproductionCostAmount, setEditNeonReproductionCostAmount] = useState("");
  const [editNeonCppHelp, setEditNeonCppHelp] = useState(false);
  const [editNeonLiabilityCitizenLimit, setEditNeonLiabilityCitizenLimit] = useState("");
  const [editNeonLiabilityEmployeeLimit, setEditNeonLiabilityEmployeeLimit] = useState("");
  const [editNeonTravelInsurance, setEditNeonTravelInsurance] = useState(false);
  const [editNeonAccidentDailyBenefitStart, setEditNeonAccidentDailyBenefitStart] =
    useState("");
  const [editNeonAccidentDailyBenefitBackpay, setEditNeonAccidentDailyBenefitBackpay] =
    useState("");
  const [editNeonAccidentDailyBenefit, setEditNeonAccidentDailyBenefit] = useState("");
  const [editFlexiDeathAmount, setEditFlexiDeathAmount] = useState("");
  const [editFlexiDeathTypedType, setEditFlexiDeathTypedType] = useState("");
  const [editFlexiDeathTypedAmount, setEditFlexiDeathTypedAmount] = useState("");
  const [editFlexiDeathAccidentAmount, setEditFlexiDeathAccidentAmount] = useState("");
  const [editFlexiSeriousIllnessType, setEditFlexiSeriousIllnessType] = useState("");
  const [editFlexiSeriousIllnessAmount, setEditFlexiSeriousIllnessAmount] = useState("");
  const [editFlexiIllnessForHim, setEditFlexiIllnessForHim] = useState("");
  const [editFlexiIllnessForHer, setEditFlexiIllnessForHer] = useState("");
  const [editFlexiPermanentIllnessAmount, setEditFlexiPermanentIllnessAmount] = useState("");
  const [editFlexiInvalidityIllnessType, setEditFlexiInvalidityIllnessType] = useState("");
  const [editFlexiInvalidityIllness1, setEditFlexiInvalidityIllness1] = useState("");
  const [editFlexiInvalidityIllness2, setEditFlexiInvalidityIllness2] = useState("");
  const [editFlexiInvalidityIllness3, setEditFlexiInvalidityIllness3] = useState("");
  const [editFlexiHospitalGeneralAmount, setEditFlexiHospitalGeneralAmount] = useState("");
  const [editFlexiWorkIncapacityStart, setEditFlexiWorkIncapacityStart] = useState("");
  const [editFlexiWorkIncapacityBackpay, setEditFlexiWorkIncapacityBackpay] = useState("");
  const [editFlexiWorkIncapacityAmount, setEditFlexiWorkIncapacityAmount] = useState("");
  const [editFlexiCaregivingAmount, setEditFlexiCaregivingAmount] = useState("");
  const [editFlexiPermanentAccidentAmount, setEditFlexiPermanentAccidentAmount] = useState("");
  const [editFlexiInjuryDamageAmount, setEditFlexiInjuryDamageAmount] = useState("");
  const [editFlexiAccidentDailyBenefit, setEditFlexiAccidentDailyBenefit] = useState("");
  const [editFlexiHospitalAccidentAmount, setEditFlexiHospitalAccidentAmount] = useState("");
  const [editFlexiInvalidityAccidentType, setEditFlexiInvalidityAccidentType] = useState("");
  const [editFlexiInvalidityAccident1, setEditFlexiInvalidityAccident1] = useState("");
  const [editFlexiInvalidityAccident2, setEditFlexiInvalidityAccident2] = useState("");
  const [editFlexiInvalidityAccident3, setEditFlexiInvalidityAccident3] = useState("");
  const [editFlexiTrafficDeathAccidentAmount, setEditFlexiTrafficDeathAccidentAmount] = useState("");
  const [editFlexiTrafficPermanentAccidentAmount, setEditFlexiTrafficPermanentAccidentAmount] = useState("");
  const [editFlexiTrafficInjuryDamageAmount, setEditFlexiTrafficInjuryDamageAmount] = useState("");
  const [editFlexiTrafficAccidentDailyBenefit, setEditFlexiTrafficAccidentDailyBenefit] = useState("");
  const [editFlexiTrafficHospitalAccidentAmount, setEditFlexiTrafficHospitalAccidentAmount] = useState("");
  const [editFlexiTrafficWorkIncapacityAmount, setEditFlexiTrafficWorkIncapacityAmount] = useState("");
  const [editFlexiTrafficInvalidityAmount, setEditFlexiTrafficInvalidityAmount] = useState("");
  const [editFlexiLoanDeathAmount, setEditFlexiLoanDeathAmount] = useState("");
  const [editFlexiLoanInvalidityType, setEditFlexiLoanInvalidityType] = useState("");
  const [editFlexiLoanInvalidity1, setEditFlexiLoanInvalidity1] = useState("");
  const [editFlexiLoanInvalidity2, setEditFlexiLoanInvalidity2] = useState("");
  const [editFlexiLoanInvalidity3, setEditFlexiLoanInvalidity3] = useState("");
  const [editFlexiLoanIllnessAmount, setEditFlexiLoanIllnessAmount] = useState("");
  const [editFlexiLoanWorkIncapacityAmount, setEditFlexiLoanWorkIncapacityAmount] = useState("");
  const [editFlexiAddonMajakBasic, setEditFlexiAddonMajakBasic] = useState(false);
  const [editFlexiAddonMajakPlus, setEditFlexiAddonMajakPlus] = useState(false);
  const [editFlexiAddonLiabilityCitizen, setEditFlexiAddonLiabilityCitizen] = useState("");
  const [editFlexiAddonTravel, setEditFlexiAddonTravel] = useState(false);
  const [editDomexAddress, setEditDomexAddress] = useState("");
  const [editDomexPropertyType, setEditDomexPropertyType] = useState("");
  const [editDomexPropertyCoverage, setEditDomexPropertyCoverage] = useState("");
  const [editDomexSumInsured, setEditDomexSumInsured] = useState("");
  const [editDomexDeductible, setEditDomexDeductible] = useState("");
  const [editDomexHouseholdType, setEditDomexHouseholdType] = useState("");
  const [editDomexHouseholdCoverage, setEditDomexHouseholdCoverage] = useState("");
  const [editDomexHouseholdSumInsured, setEditDomexHouseholdSumInsured] = useState("");
  const [editDomexHouseholdDeductible, setEditDomexHouseholdDeductible] = useState("");
  const [editDomexOutbuildingSumInsured, setEditDomexOutbuildingSumInsured] = useState("");
  const [editDomexLiabilitySumInsured, setEditDomexLiabilitySumInsured] = useState("");
  const [editDomexLiabilityDeductible, setEditDomexLiabilityDeductible] = useState("");
  const [editDomexLiabilityMobile, setEditDomexLiabilityMobile] = useState(false);
  const [editDomexLiabilityTenant, setEditDomexLiabilityTenant] = useState(false);
  const [editDomexLiabilityLandlord, setEditDomexLiabilityLandlord] = useState(false);
  const [editDomexAssistancePlus, setEditDomexAssistancePlus] = useState(false);
  const [editDomexNote, setEditDomexNote] = useState("");

  const autoFields: AutoFields = {
    carMake: editCarMake,
    carPlate: editCarPlate,
    carVin: editCarVin,
    carTp: editCarTp,
    carOrv: editCarOrv,
    carAnnualMileage: editCarAnnualMileage,
    carAllianzScope: editCarAllianzScope,
    carLiabilityLimit: editCarLiabilityLimit,
    carHullSumInsured: editCarHullSumInsured,
    carHullDeductible: editCarHullDeductible,
    carHullRiskAccident: editCarHullRiskAccident,
    carHullRiskTheft: editCarHullRiskTheft,
    carHullRiskNatural: editCarHullRiskNatural,
    carHullRiskVandalism: editCarHullRiskVandalism,
    carHullRiskAnimalCollision: editCarHullRiskAnimalCollision,
    carAssistancePlan: editCarAssistancePlan,
    carAddonEso: editCarAddonEso,
    carAddonNaturalRisks: editCarAddonNaturalRisks,
    carAddonKlika: editCarAddonKlika,
    carAddonGlass: editCarAddonGlass,
    carAddonGlassLimit: editCarAddonGlassLimit,
    carAddonAnimalCollision: editCarAddonAnimalCollision,
    carAddonAnimalCollisionLimit: editCarAddonAnimalCollisionLimit,
    carAddonAnimalDamage: editCarAddonAnimalDamage,
    carAddonAnimalDamageLimit: editCarAddonAnimalDamageLimit,
    carAddonVandalism: editCarAddonVandalism,
    carAddonTheft: editCarAddonTheft,
    carAddonTheftLimit: editCarAddonTheftLimit,
    carAddonNatural: editCarAddonNatural,
    carAddonNaturalLimit: editCarAddonNaturalLimit,
    carAddonOwnDamage: editCarAddonOwnDamage,
    carAddonOwnDamageLimit: editCarAddonOwnDamageLimit,
    carAddonPothole: editCarAddonPothole,
    carAddonNonFaultAccident: editCarAddonNonFaultAccident,
    carAddonGap: editCarAddonGap,
    carAddonGapLimit: editCarAddonGapLimit,
    carAddonSmartGap: editCarAddonSmartGap,
    carAddonServisPro: editCarAddonServisPro,
    carAddonReplacementCar: editCarAddonReplacementCar,
    carAddonLuggage: editCarAddonLuggage,
    carAddonTransportedGoods: editCarAddonTransportedGoods,
    carAddonFireExplosion: editCarAddonFireExplosion,
    carAddonLegalAdvice: editCarAddonLegalAdvice,
    carAddonPassengerInjury: editCarAddonPassengerInjury,
    carAddonKeyLossTheft: editCarAddonKeyLossTheft,
  };

  const neonFields: NeonFields = {
    version: editNeonVersion,
    deathType: editNeonDeathType,
    deathAmount: editNeonDeathAmount,
    death2Type: editNeonDeath2Type,
    death2Amount: editNeonDeath2Amount,
    deathTerminalAmount: editNeonDeathTerminalAmount,
    waiverInvalidity: editNeonWaiverInvalidity,
    waiverUnemployment: editNeonWaiverUnemployment,
    invalidityAType: editNeonInvalidityAType,
    invalidityA1: editNeonInvalidityA1,
    invalidityA2: editNeonInvalidityA2,
    invalidityA3: editNeonInvalidityA3,
    invalidityBType: editNeonInvalidityBType,
    invalidityB1: editNeonInvalidityB1,
    invalidityB2: editNeonInvalidityB2,
    invalidityB3: editNeonInvalidityB3,
    invalidityPension: editNeonInvalidityPension,
    criticalType: editNeonCriticalType,
    criticalVariant: editNeonCriticalVariant,
    criticalAmount: editNeonCriticalAmount,
    childSurgeryAmount: editNeonChildSurgeryAmount,
    vaccinationCompAmount: editNeonVaccinationCompAmount,
    accidentDailyBenefit: editNeonAccidentDailyBenefit,
    diabetesAmount: editNeonDiabetesAmount,
    deathAccidentAmount: editNeonDeathAccidentAmount,
    injuryPermanentAmount: editNeonInjuryPermanentAmount,
    injuryPermanentFulfillmentFrom: editNeonInjuryPermanentFulfillmentFrom,
    injuryPermanentProgression: editNeonInjuryPermanentProgression,
    injuryPermanent2Amount: editNeonInjuryPermanent2Amount,
    injuryPermanent2FulfillmentFrom: editNeonInjuryPermanent2FulfillmentFrom,
    injuryPermanent2Progression: editNeonInjuryPermanent2Progression,
    hospitalizationAmount: editNeonHospitalizationAmount,
    hospitalizationIllnessAmount: editNeonHospitalizationIllnessAmount,
    hospitalizationInjuryAmount: editNeonHospitalizationInjuryAmount,
    workIncapacityStart: editNeonWorkIncapacityStart,
    workIncapacityBackpay: editNeonWorkIncapacityBackpay,
    workIncapacityAmount: editNeonWorkIncapacityAmount,
    workIncapacityInjury: editNeonWorkIncapacityInjury,
    workIncapacityIllness: editNeonWorkIncapacityIllness,
    workIncapacity2Start: editNeonWorkIncapacity2Start,
    workIncapacity2Backpay: editNeonWorkIncapacity2Backpay,
    workIncapacity2Amount: editNeonWorkIncapacity2Amount,
    workIncapacity2Injury: editNeonWorkIncapacity2Injury,
    workIncapacity2Illness: editNeonWorkIncapacity2Illness,
    accidentDailyBenefitStart: editNeonAccidentDailyBenefitStart,
    accidentDailyBenefitBackpay: editNeonAccidentDailyBenefitBackpay,
    careDependencyAmount: editNeonCareDependencyAmount,
    specialAidAmount: editNeonSpecialAidAmount,
    caregivingAmount: editNeonCaregivingAmount,
    reproductionCostAmount: editNeonReproductionCostAmount,
    cppHelp: editNeonCppHelp,
    liabilityCitizenLimit: editNeonLiabilityCitizenLimit,
    liabilityEmployeeLimit: editNeonLiabilityEmployeeLimit,
    travelInsurance: editNeonTravelInsurance,
  };

  const flexiFields: FlexiFields = {
    deathAmount: editFlexiDeathAmount,
    deathTypedType: editFlexiDeathTypedType,
    deathTypedAmount: editFlexiDeathTypedAmount,
    deathAccidentAmount: editFlexiDeathAccidentAmount,
    seriousIllnessType: editFlexiSeriousIllnessType,
    seriousIllnessAmount: editFlexiSeriousIllnessAmount,
    seriousIllnessForHim: editFlexiIllnessForHim,
    seriousIllnessForHer: editFlexiIllnessForHer,
    permanentIllnessAmount: editFlexiPermanentIllnessAmount,
    invalidityIllnessType: editFlexiInvalidityIllnessType,
    invalidityIllness1: editFlexiInvalidityIllness1,
    invalidityIllness2: editFlexiInvalidityIllness2,
    invalidityIllness3: editFlexiInvalidityIllness3,
    hospitalGeneralAmount: editFlexiHospitalGeneralAmount,
    workIncapacityStart: editFlexiWorkIncapacityStart,
    workIncapacityBackpay: editFlexiWorkIncapacityBackpay,
    workIncapacityAmount: editFlexiWorkIncapacityAmount,
    caregivingAmount: editFlexiCaregivingAmount,
    permanentAccidentAmount: editFlexiPermanentAccidentAmount,
    injuryDamageAmount: editFlexiInjuryDamageAmount,
    accidentDailyBenefit: editFlexiAccidentDailyBenefit,
    hospitalAccidentAmount: editFlexiHospitalAccidentAmount,
    invalidityAccidentType: editFlexiInvalidityAccidentType,
    invalidityAccident1: editFlexiInvalidityAccident1,
    invalidityAccident2: editFlexiInvalidityAccident2,
    invalidityAccident3: editFlexiInvalidityAccident3,
    trafficDeathAccidentAmount: editFlexiTrafficDeathAccidentAmount,
    trafficPermanentAccidentAmount: editFlexiTrafficPermanentAccidentAmount,
    trafficInjuryDamageAmount: editFlexiTrafficInjuryDamageAmount,
    trafficAccidentDailyBenefit: editFlexiTrafficAccidentDailyBenefit,
    trafficHospitalAccidentAmount: editFlexiTrafficHospitalAccidentAmount,
    trafficWorkIncapacityAmount: editFlexiTrafficWorkIncapacityAmount,
    trafficInvalidityAmount: editFlexiTrafficInvalidityAmount,
    loanDeathAmount: editFlexiLoanDeathAmount,
    loanInvalidityType: editFlexiLoanInvalidityType,
    loanInvalidity1: editFlexiLoanInvalidity1,
    loanInvalidity2: editFlexiLoanInvalidity2,
    loanInvalidity3: editFlexiLoanInvalidity3,
    loanIllnessAmount: editFlexiLoanIllnessAmount,
    loanWorkIncapacityAmount: editFlexiLoanWorkIncapacityAmount,
    addonMajakBasic: editFlexiAddonMajakBasic,
    addonMajakPlus: editFlexiAddonMajakPlus,
    addonLiabilityCitizen: editFlexiAddonLiabilityCitizen,
    addonTravel: editFlexiAddonTravel,
  };

  const domexFields: DomexFields = {
    address: editDomexAddress,
    propertyType: editDomexPropertyType,
    propertyCoverage: editDomexPropertyCoverage,
    sumInsured: editDomexSumInsured,
    deductible: editDomexDeductible,
    outbuildingSumInsured: editDomexOutbuildingSumInsured,
    householdType: editDomexHouseholdType,
    householdCoverage: editDomexHouseholdCoverage,
    householdSumInsured: editDomexHouseholdSumInsured,
    householdDeductible: editDomexHouseholdDeductible,
    liabilitySumInsured: editDomexLiabilitySumInsured,
    liabilityDeductible: editDomexLiabilityDeductible,
    liabilityMobile: editDomexLiabilityMobile,
    liabilityTenant: editDomexLiabilityTenant,
    liabilityLandlord: editDomexLiabilityLandlord,
    assistancePlus: editDomexAssistancePlus,
    note: editDomexNote,
  };

  const handleAutoFieldChange = useCallback(
    (key: keyof AutoFields, value: string | boolean) => {
      switch (key) {
        case "carMake":
          setEditCarMake(String(value));
          break;
        case "carPlate":
          setEditCarPlate(String(value));
          break;
        case "carVin":
          setEditCarVin(String(value));
          break;
        case "carTp":
          setEditCarTp(String(value));
          break;
        case "carOrv":
          setEditCarOrv(String(value));
          break;
        case "carAnnualMileage":
          setEditCarAnnualMileage(String(value));
          break;
        case "carAllianzScope":
          setEditCarAllianzScope(String(value));
          break;
        case "carLiabilityLimit":
          setEditCarLiabilityLimit(String(value));
          break;
        case "carHullSumInsured":
          setEditCarHullSumInsured(String(value));
          break;
        case "carHullDeductible":
          setEditCarHullDeductible(String(value));
          break;
        case "carHullRiskAccident":
          setEditCarHullRiskAccident(Boolean(value));
          break;
        case "carHullRiskTheft":
          setEditCarHullRiskTheft(Boolean(value));
          break;
        case "carHullRiskNatural":
          setEditCarHullRiskNatural(Boolean(value));
          break;
        case "carHullRiskVandalism":
          setEditCarHullRiskVandalism(Boolean(value));
          break;
        case "carHullRiskAnimalCollision":
          setEditCarHullRiskAnimalCollision(Boolean(value));
          break;
        case "carAssistancePlan":
          setEditCarAssistancePlan(String(value));
          break;
        case "carAddonEso":
          setEditCarAddonEso(Boolean(value));
          break;
        case "carAddonNaturalRisks":
          setEditCarAddonNaturalRisks(Boolean(value));
          break;
        case "carAddonKlika":
          setEditCarAddonKlika(Boolean(value));
          break;
        case "carAddonGlass":
          setEditCarAddonGlass(Boolean(value));
          break;
        case "carAddonGlassLimit":
          setEditCarAddonGlassLimit(String(value));
          break;
        case "carAddonAnimalCollision":
          setEditCarAddonAnimalCollision(Boolean(value));
          break;
        case "carAddonAnimalCollisionLimit":
          setEditCarAddonAnimalCollisionLimit(String(value));
          break;
        case "carAddonAnimalDamage":
          setEditCarAddonAnimalDamage(Boolean(value));
          break;
        case "carAddonAnimalDamageLimit":
          setEditCarAddonAnimalDamageLimit(String(value));
          break;
        case "carAddonVandalism":
          setEditCarAddonVandalism(Boolean(value));
          break;
        case "carAddonTheft":
          setEditCarAddonTheft(Boolean(value));
          break;
        case "carAddonTheftLimit":
          setEditCarAddonTheftLimit(String(value));
          break;
        case "carAddonNatural":
          setEditCarAddonNatural(Boolean(value));
          break;
        case "carAddonNaturalLimit":
          setEditCarAddonNaturalLimit(String(value));
          break;
        case "carAddonOwnDamage":
          setEditCarAddonOwnDamage(Boolean(value));
          break;
        case "carAddonOwnDamageLimit":
          setEditCarAddonOwnDamageLimit(String(value));
          break;
        case "carAddonPothole":
          setEditCarAddonPothole(Boolean(value));
          break;
        case "carAddonNonFaultAccident":
          setEditCarAddonNonFaultAccident(Boolean(value));
          break;
        case "carAddonGap":
          setEditCarAddonGap(Boolean(value));
          break;
        case "carAddonGapLimit":
          setEditCarAddonGapLimit(String(value));
          break;
        case "carAddonSmartGap":
          setEditCarAddonSmartGap(Boolean(value));
          break;
        case "carAddonServisPro":
          setEditCarAddonServisPro(Boolean(value));
          break;
        case "carAddonReplacementCar":
          setEditCarAddonReplacementCar(Boolean(value));
          break;
        case "carAddonLuggage":
          setEditCarAddonLuggage(Boolean(value));
          break;
        case "carAddonTransportedGoods":
          setEditCarAddonTransportedGoods(Boolean(value));
          break;
        case "carAddonFireExplosion":
          setEditCarAddonFireExplosion(Boolean(value));
          break;
        case "carAddonLegalAdvice":
          setEditCarAddonLegalAdvice(Boolean(value));
          break;
        case "carAddonPassengerInjury":
          setEditCarAddonPassengerInjury(Boolean(value));
          break;
        case "carAddonKeyLossTheft":
          setEditCarAddonKeyLossTheft(Boolean(value));
          break;
        default:
          break;
      }
    },
    []
  );

  const handleNeonFieldChange = useCallback(
    (key: keyof NeonFields, value: string | boolean) => {
      switch (key) {
        case "version":
          setEditNeonVersion(String(value));
          break;
        case "deathType":
          setEditNeonDeathType(String(value));
          break;
        case "deathAmount":
          setEditNeonDeathAmount(String(value));
          break;
        case "death2Type":
          setEditNeonDeath2Type(String(value));
          break;
        case "death2Amount":
          setEditNeonDeath2Amount(String(value));
          break;
        case "deathTerminalAmount":
          setEditNeonDeathTerminalAmount(String(value));
          break;
        case "waiverInvalidity":
          setEditNeonWaiverInvalidity(Boolean(value));
          break;
        case "waiverUnemployment":
          setEditNeonWaiverUnemployment(Boolean(value));
          break;
        case "invalidityAType":
          setEditNeonInvalidityAType(String(value));
          break;
        case "invalidityA1":
          setEditNeonInvalidityA1(String(value));
          break;
        case "invalidityA2":
          setEditNeonInvalidityA2(String(value));
          break;
        case "invalidityA3":
          setEditNeonInvalidityA3(String(value));
          break;
        case "invalidityBType":
          setEditNeonInvalidityBType(String(value));
          break;
        case "invalidityB1":
          setEditNeonInvalidityB1(String(value));
          break;
        case "invalidityB2":
          setEditNeonInvalidityB2(String(value));
          break;
        case "invalidityB3":
          setEditNeonInvalidityB3(String(value));
          break;
        case "invalidityPension":
          setEditNeonInvalidityPension(Boolean(value));
          break;
        case "criticalType":
          setEditNeonCriticalType(String(value));
          break;
        case "criticalVariant":
          setEditNeonCriticalVariant(String(value));
          break;
        case "criticalAmount":
          setEditNeonCriticalAmount(String(value));
          break;
        case "childSurgeryAmount":
          setEditNeonChildSurgeryAmount(String(value));
          break;
        case "vaccinationCompAmount":
          setEditNeonVaccinationCompAmount(String(value));
          break;
        case "diabetesAmount":
          setEditNeonDiabetesAmount(String(value));
          break;
        case "deathAccidentAmount":
          setEditNeonDeathAccidentAmount(String(value));
          break;
        case "injuryPermanentAmount":
          setEditNeonInjuryPermanentAmount(String(value));
          break;
        case "injuryPermanentFulfillmentFrom":
          setEditNeonInjuryPermanentFulfillmentFrom(String(value));
          break;
        case "injuryPermanentProgression":
          setEditNeonInjuryPermanentProgression(String(value));
          break;
        case "injuryPermanent2Amount":
          setEditNeonInjuryPermanent2Amount(String(value));
          break;
        case "injuryPermanent2FulfillmentFrom":
          setEditNeonInjuryPermanent2FulfillmentFrom(String(value));
          break;
        case "injuryPermanent2Progression":
          setEditNeonInjuryPermanent2Progression(String(value));
          break;
        case "hospitalizationAmount":
          setEditNeonHospitalizationAmount(String(value));
          break;
        case "hospitalizationIllnessAmount":
          setEditNeonHospitalizationIllnessAmount(String(value));
          break;
        case "hospitalizationInjuryAmount":
          setEditNeonHospitalizationInjuryAmount(String(value));
          break;
        case "workIncapacityStart":
          setEditNeonWorkIncapacityStart(String(value));
          break;
        case "workIncapacityBackpay":
          setEditNeonWorkIncapacityBackpay(String(value));
          break;
        case "workIncapacityAmount":
          setEditNeonWorkIncapacityAmount(String(value));
          break;
        case "workIncapacityInjury":
          setEditNeonWorkIncapacityInjury(Boolean(value));
          break;
        case "workIncapacityIllness":
          setEditNeonWorkIncapacityIllness(Boolean(value));
          break;
        case "workIncapacity2Start":
          setEditNeonWorkIncapacity2Start(String(value));
          break;
        case "workIncapacity2Backpay":
          setEditNeonWorkIncapacity2Backpay(String(value));
          break;
        case "workIncapacity2Amount":
          setEditNeonWorkIncapacity2Amount(String(value));
          break;
        case "workIncapacity2Injury":
          setEditNeonWorkIncapacity2Injury(Boolean(value));
          break;
        case "workIncapacity2Illness":
          setEditNeonWorkIncapacity2Illness(Boolean(value));
          break;
        case "careDependencyAmount":
          setEditNeonCareDependencyAmount(String(value));
          break;
        case "specialAidAmount":
          setEditNeonSpecialAidAmount(String(value));
          break;
        case "caregivingAmount":
          setEditNeonCaregivingAmount(String(value));
          break;
        case "reproductionCostAmount":
          setEditNeonReproductionCostAmount(String(value));
          break;
        case "cppHelp":
          setEditNeonCppHelp(Boolean(value));
          break;
        case "liabilityCitizenLimit":
          setEditNeonLiabilityCitizenLimit(String(value));
          break;
        case "liabilityEmployeeLimit":
          setEditNeonLiabilityEmployeeLimit(String(value));
          break;
        case "travelInsurance":
          setEditNeonTravelInsurance(Boolean(value));
          break;
        case "accidentDailyBenefitStart":
          setEditNeonAccidentDailyBenefitStart(String(value));
          break;
        case "accidentDailyBenefitBackpay":
          setEditNeonAccidentDailyBenefitBackpay(String(value));
          break;
        case "accidentDailyBenefit":
          setEditNeonAccidentDailyBenefit(String(value));
          break;
        default:
          break;
      }
    },
    []
  );

  const handleFlexiFieldChange = useCallback(
    (key: keyof FlexiFields, value: string | boolean) => {
      switch (key) {
        case "deathAmount":
          setEditFlexiDeathAmount(String(value));
          break;
        case "deathTypedType":
          setEditFlexiDeathTypedType(String(value));
          break;
        case "deathTypedAmount":
          setEditFlexiDeathTypedAmount(String(value));
          break;
        case "deathAccidentAmount":
          setEditFlexiDeathAccidentAmount(String(value));
          break;
        case "seriousIllnessType":
          setEditFlexiSeriousIllnessType(String(value));
          break;
        case "seriousIllnessAmount":
          setEditFlexiSeriousIllnessAmount(String(value));
          break;
        case "seriousIllnessForHim":
          setEditFlexiIllnessForHim(String(value));
          break;
        case "seriousIllnessForHer":
          setEditFlexiIllnessForHer(String(value));
          break;
        case "permanentIllnessAmount":
          setEditFlexiPermanentIllnessAmount(String(value));
          break;
        case "invalidityIllnessType":
          setEditFlexiInvalidityIllnessType(String(value));
          break;
        case "invalidityIllness1":
          setEditFlexiInvalidityIllness1(String(value));
          break;
        case "invalidityIllness2":
          setEditFlexiInvalidityIllness2(String(value));
          break;
        case "invalidityIllness3":
          setEditFlexiInvalidityIllness3(String(value));
          break;
        case "hospitalGeneralAmount":
          setEditFlexiHospitalGeneralAmount(String(value));
          break;
        case "workIncapacityStart":
          setEditFlexiWorkIncapacityStart(String(value));
          break;
        case "workIncapacityBackpay":
          setEditFlexiWorkIncapacityBackpay(String(value));
          break;
        case "workIncapacityAmount":
          setEditFlexiWorkIncapacityAmount(String(value));
          break;
        case "caregivingAmount":
          setEditFlexiCaregivingAmount(String(value));
          break;
        case "permanentAccidentAmount":
          setEditFlexiPermanentAccidentAmount(String(value));
          break;
        case "injuryDamageAmount":
          setEditFlexiInjuryDamageAmount(String(value));
          break;
        case "accidentDailyBenefit":
          setEditFlexiAccidentDailyBenefit(String(value));
          break;
        case "hospitalAccidentAmount":
          setEditFlexiHospitalAccidentAmount(String(value));
          break;
        case "invalidityAccidentType":
          setEditFlexiInvalidityAccidentType(String(value));
          break;
        case "invalidityAccident1":
          setEditFlexiInvalidityAccident1(String(value));
          break;
        case "invalidityAccident2":
          setEditFlexiInvalidityAccident2(String(value));
          break;
        case "invalidityAccident3":
          setEditFlexiInvalidityAccident3(String(value));
          break;
        case "trafficDeathAccidentAmount":
          setEditFlexiTrafficDeathAccidentAmount(String(value));
          break;
        case "trafficPermanentAccidentAmount":
          setEditFlexiTrafficPermanentAccidentAmount(String(value));
          break;
        case "trafficInjuryDamageAmount":
          setEditFlexiTrafficInjuryDamageAmount(String(value));
          break;
        case "trafficAccidentDailyBenefit":
          setEditFlexiTrafficAccidentDailyBenefit(String(value));
          break;
        case "trafficHospitalAccidentAmount":
          setEditFlexiTrafficHospitalAccidentAmount(String(value));
          break;
        case "trafficWorkIncapacityAmount":
          setEditFlexiTrafficWorkIncapacityAmount(String(value));
          break;
        case "trafficInvalidityAmount":
          setEditFlexiTrafficInvalidityAmount(String(value));
          break;
        case "loanDeathAmount":
          setEditFlexiLoanDeathAmount(String(value));
          break;
        case "loanInvalidityType":
          setEditFlexiLoanInvalidityType(String(value));
          break;
        case "loanInvalidity1":
          setEditFlexiLoanInvalidity1(String(value));
          break;
        case "loanInvalidity2":
          setEditFlexiLoanInvalidity2(String(value));
          break;
        case "loanInvalidity3":
          setEditFlexiLoanInvalidity3(String(value));
          break;
        case "loanIllnessAmount":
          setEditFlexiLoanIllnessAmount(String(value));
          break;
        case "loanWorkIncapacityAmount":
          setEditFlexiLoanWorkIncapacityAmount(String(value));
          break;
        case "addonMajakBasic":
          setEditFlexiAddonMajakBasic(Boolean(value));
          break;
        case "addonMajakPlus":
          setEditFlexiAddonMajakPlus(Boolean(value));
          break;
        case "addonLiabilityCitizen":
          setEditFlexiAddonLiabilityCitizen(String(value));
          break;
        case "addonTravel":
          setEditFlexiAddonTravel(Boolean(value));
          break;
        default:
          break;
      }
    },
    []
  );

  const handleDomexFieldChange = useCallback(
    (key: keyof DomexFields, value: string | boolean) => {
      switch (key) {
        case "address":
          setEditDomexAddress(String(value));
          break;
        case "propertyType":
          setEditDomexPropertyType(String(value));
          break;
        case "propertyCoverage":
          setEditDomexPropertyCoverage(String(value));
          break;
        case "sumInsured":
          setEditDomexSumInsured(String(value));
          break;
        case "deductible":
          setEditDomexDeductible(String(value));
          break;
        case "outbuildingSumInsured":
          setEditDomexOutbuildingSumInsured(String(value));
          break;
        case "householdType":
          setEditDomexHouseholdType(String(value));
          break;
        case "householdCoverage":
          setEditDomexHouseholdCoverage(String(value));
          break;
        case "householdSumInsured":
          setEditDomexHouseholdSumInsured(String(value));
          break;
        case "householdDeductible":
          setEditDomexHouseholdDeductible(String(value));
          break;
        case "liabilitySumInsured":
          setEditDomexLiabilitySumInsured(String(value));
          break;
        case "liabilityDeductible":
          setEditDomexLiabilityDeductible(String(value));
          break;
        case "liabilityMobile":
          setEditDomexLiabilityMobile(Boolean(value));
          break;
        case "liabilityTenant":
          setEditDomexLiabilityTenant(Boolean(value));
          break;
        case "liabilityLandlord":
          setEditDomexLiabilityLandlord(Boolean(value));
          break;
        case "assistancePlus":
          setEditDomexAssistancePlus(Boolean(value));
          break;
        case "note":
          setEditDomexNote(String(value));
          break;
        default:
          break;
      }
    },
    []
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [refreshingPdfDetails, setRefreshingPdfDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const resetEditFields = useCallback(() => {
    if (!contract) return;
    setEditClientName(contract.clientName ?? "");
    setEditClientEmail(contract.clientEmail ?? "");
    setEditClientPhone(contract.clientPhone ?? "");
    setEditClientAddress(contract.clientAddress ?? "");
    setEditContractNumber(contract.contractNumber ?? "");
    setEditContractSigned(toDateInputValue(contract.contractSignedDate ?? contract.createdAt));
    setEditPolicyStart(toDateInputValue(contract.policyStartDate));
    setEditPolicyEnd(toDateInputValue(contract.policyEndDate));
    setEditDuration(
      typeof contract.durationYears === "number" && !Number.isNaN(contract.durationYears)
        ? contract.durationYears
        : null
    );
    setEditCarMake(contract.carMake ?? "");
    setEditCarPlate(contract.carPlate ?? "");
    setEditCarVin(contract.carVin ?? "");
    setEditCarTp(contract.carTp ?? "");
    setEditCarOrv(contract.carOrv ?? "");
    setEditCarAnnualMileage(contract.carAnnualMileage ?? "");
    setEditCarAllianzScope(contract.carAllianzScope ?? "");
    setEditCarLiabilityLimit(
      contract.carLiabilityLimit != null && Number.isFinite(contract.carLiabilityLimit)
        ? String(contract.carLiabilityLimit)
        : ""
    );
    setEditCarHullSumInsured(
      (contract.carHullSumInsuredText ?? "").trim() ||
        (contract.carHullSumInsured != null && Number.isFinite(contract.carHullSumInsured)
          ? String(contract.carHullSumInsured)
          : "")
    );
    setEditCarHullDeductible(
      (contract.carHullDeductibleText ?? "").trim() ||
        (contract.carHullDeductible != null && Number.isFinite(contract.carHullDeductible)
          ? String(contract.carHullDeductible)
          : "")
    );
    setEditCarHullRiskAccident(!!contract.carHullRiskAccident);
    setEditCarHullRiskTheft(!!contract.carHullRiskTheft);
    setEditCarHullRiskNatural(!!contract.carHullRiskNatural);
    setEditCarHullRiskVandalism(!!contract.carHullRiskVandalism);
    setEditCarHullRiskAnimalCollision(!!contract.carHullRiskAnimalCollision);
    setEditCarAssistancePlan(contract.carAssistancePlan ?? "");
    setEditCarAddonEso(!!contract.carAddonEso);
    setEditCarAddonNaturalRisks(!!contract.carAddonNaturalRisks);
    setEditCarAddonKlika(!!contract.carAddonKlika);
    setEditCarAddonGlass(!!contract.carAddonGlass);
    setEditCarAddonGlassLimit(
      contract.carAddonGlassLimit != null && Number.isFinite(contract.carAddonGlassLimit)
        ? String(contract.carAddonGlassLimit)
        : ""
    );
    setEditCarAddonAnimalCollision(!!contract.carAddonAnimalCollision);
    setEditCarAddonAnimalCollisionLimit(
      contract.carAddonAnimalCollisionLimit != null &&
      Number.isFinite(contract.carAddonAnimalCollisionLimit)
        ? String(contract.carAddonAnimalCollisionLimit)
        : ""
    );
    setEditCarAddonAnimalDamage(!!contract.carAddonAnimalDamage);
    setEditCarAddonAnimalDamageLimit(
      contract.carAddonAnimalDamageLimit != null &&
      Number.isFinite(contract.carAddonAnimalDamageLimit)
        ? String(contract.carAddonAnimalDamageLimit)
        : ""
    );
    setEditCarAddonVandalism(!!contract.carAddonVandalism);
    setEditCarAddonTheft(!!contract.carAddonTheft);
    setEditCarAddonTheftLimit(
      contract.carAddonTheftLimit != null && Number.isFinite(contract.carAddonTheftLimit)
        ? String(contract.carAddonTheftLimit)
        : ""
    );
    setEditCarAddonNatural(!!contract.carAddonNatural);
    setEditCarAddonNaturalLimit(
      contract.carAddonNaturalLimit != null && Number.isFinite(contract.carAddonNaturalLimit)
        ? String(contract.carAddonNaturalLimit)
        : ""
    );
    setEditCarAddonOwnDamage(!!contract.carAddonOwnDamage);
    setEditCarAddonOwnDamageLimit(
      contract.carAddonOwnDamageLimit != null &&
      Number.isFinite(contract.carAddonOwnDamageLimit)
        ? String(contract.carAddonOwnDamageLimit)
        : ""
    );
    setEditCarAddonPothole(!!contract.carAddonPothole);
    setEditCarAddonNonFaultAccident(!!contract.carAddonNonFaultAccident);
    setEditCarAddonGap(!!contract.carAddonGap);
    setEditCarAddonGapLimit(
      contract.carAddonGapLimit != null && Number.isFinite(contract.carAddonGapLimit)
        ? String(contract.carAddonGapLimit)
        : ""
    );
    setEditCarAddonSmartGap(!!contract.carAddonSmartGap);
    setEditCarAddonServisPro(!!contract.carAddonServisPro);
    setEditCarAddonReplacementCar(!!contract.carAddonReplacementCar);
    setEditCarAddonLuggage(!!contract.carAddonLuggage);
    setEditCarAddonTransportedGoods(!!contract.carAddonTransportedGoods);
    setEditCarAddonFireExplosion(!!contract.carAddonFireExplosion);
    setEditCarAddonLegalAdvice(!!contract.carAddonLegalAdvice);
    setEditCarAddonPassengerInjury(!!contract.carAddonPassengerInjury);
    setEditCarAddonKeyLossTheft(!!contract.carAddonKeyLossTheft);
    setEditNeonVersion(contract.neonDetail?.version ?? "");
    setEditNeonDeathType(contract.neonDetail?.deathType ?? "");
    setEditNeonDeathAmount(
      contract.neonDetail?.deathAmount != null && Number.isFinite(contract.neonDetail.deathAmount)
        ? String(contract.neonDetail.deathAmount)
        : ""
    );
    setEditNeonDeath2Type(contract.neonDetail?.death2Type ?? "");
    setEditNeonDeath2Amount(
      contract.neonDetail?.death2Amount != null && Number.isFinite(contract.neonDetail.death2Amount)
        ? String(contract.neonDetail.death2Amount)
        : ""
    );
    setEditNeonDeathTerminalAmount(
      contract.neonDetail?.deathTerminalAmount != null &&
      Number.isFinite(contract.neonDetail.deathTerminalAmount)
        ? String(contract.neonDetail.deathTerminalAmount)
        : ""
    );
    setEditNeonWaiverInvalidity(!!contract.neonDetail?.waiverInvalidity);
    setEditNeonWaiverUnemployment(!!contract.neonDetail?.waiverUnemployment);
    setEditNeonInvalidityAType(contract.neonDetail?.invalidityAType ?? "");
    setEditNeonInvalidityA1(
      contract.neonDetail?.invalidityA1 != null && Number.isFinite(contract.neonDetail.invalidityA1)
        ? String(contract.neonDetail.invalidityA1)
        : ""
    );
    setEditNeonInvalidityA2(
      contract.neonDetail?.invalidityA2 != null && Number.isFinite(contract.neonDetail.invalidityA2)
        ? String(contract.neonDetail.invalidityA2)
        : ""
    );
    setEditNeonInvalidityA3(
      contract.neonDetail?.invalidityA3 != null && Number.isFinite(contract.neonDetail.invalidityA3)
        ? String(contract.neonDetail.invalidityA3)
        : ""
    );
    setEditNeonInvalidityBType(contract.neonDetail?.invalidityBType ?? "");
    setEditNeonInvalidityB1(
      contract.neonDetail?.invalidityB1 != null && Number.isFinite(contract.neonDetail.invalidityB1)
        ? String(contract.neonDetail.invalidityB1)
        : ""
    );
    setEditNeonInvalidityB2(
      contract.neonDetail?.invalidityB2 != null && Number.isFinite(contract.neonDetail.invalidityB2)
        ? String(contract.neonDetail.invalidityB2)
        : ""
    );
    setEditNeonInvalidityB3(
      contract.neonDetail?.invalidityB3 != null && Number.isFinite(contract.neonDetail.invalidityB3)
        ? String(contract.neonDetail.invalidityB3)
        : ""
    );
    setEditNeonInvalidityPension(!!contract.neonDetail?.invalidityPension);
    setEditNeonCriticalType(contract.neonDetail?.criticalIllnessType ?? "");
    setEditNeonCriticalVariant(contract.neonDetail?.criticalIllnessVariant ?? "");
    setEditNeonCriticalAmount(
      contract.neonDetail?.criticalIllnessAmount != null &&
      Number.isFinite(contract.neonDetail.criticalIllnessAmount)
        ? String(contract.neonDetail.criticalIllnessAmount)
        : ""
    );
    setEditNeonChildSurgeryAmount(
      contract.neonDetail?.childSurgeryAmount != null &&
      Number.isFinite(contract.neonDetail.childSurgeryAmount)
        ? String(contract.neonDetail.childSurgeryAmount)
        : ""
    );
    setEditNeonVaccinationCompAmount(
      contract.neonDetail?.vaccinationCompAmount != null &&
      Number.isFinite(contract.neonDetail.vaccinationCompAmount)
        ? String(contract.neonDetail.vaccinationCompAmount)
        : ""
    );
    setEditNeonDiabetesAmount(
      contract.neonDetail?.diabetesAmount != null && Number.isFinite(contract.neonDetail.diabetesAmount)
        ? String(contract.neonDetail.diabetesAmount)
        : ""
    );
    setEditNeonDeathAccidentAmount(
      contract.neonDetail?.deathAccidentAmount != null &&
      Number.isFinite(contract.neonDetail.deathAccidentAmount)
        ? String(contract.neonDetail.deathAccidentAmount)
        : ""
    );
    setEditNeonInjuryPermanentAmount(
      contract.neonDetail?.injuryPermanentAmount != null &&
      Number.isFinite(contract.neonDetail.injuryPermanentAmount)
        ? String(contract.neonDetail.injuryPermanentAmount)
        : ""
    );
    setEditNeonInjuryPermanentFulfillmentFrom(
      contract.neonDetail?.injuryPermanentFulfillmentFrom ?? ""
    );
    setEditNeonInjuryPermanentProgression(
      contract.neonDetail?.injuryPermanentProgression ?? ""
    );
    setEditNeonInjuryPermanent2Amount(
      contract.neonDetail?.injuryPermanent2Amount != null &&
      Number.isFinite(contract.neonDetail.injuryPermanent2Amount)
        ? String(contract.neonDetail.injuryPermanent2Amount)
        : ""
    );
    setEditNeonInjuryPermanent2FulfillmentFrom(
      contract.neonDetail?.injuryPermanent2FulfillmentFrom ?? ""
    );
    setEditNeonInjuryPermanent2Progression(
      contract.neonDetail?.injuryPermanent2Progression ?? ""
    );
    setEditNeonHospitalizationAmount(
      contract.neonDetail?.hospitalizationAmount != null &&
      Number.isFinite(contract.neonDetail.hospitalizationAmount)
        ? String(contract.neonDetail.hospitalizationAmount)
        : ""
    );
    setEditNeonHospitalizationIllnessAmount(
      contract.neonDetail?.hospitalizationIllnessAmount != null &&
      Number.isFinite(contract.neonDetail.hospitalizationIllnessAmount)
        ? String(contract.neonDetail.hospitalizationIllnessAmount)
        : ""
    );
    setEditNeonHospitalizationInjuryAmount(
      contract.neonDetail?.hospitalizationInjuryAmount != null &&
      Number.isFinite(contract.neonDetail.hospitalizationInjuryAmount)
        ? String(contract.neonDetail.hospitalizationInjuryAmount)
        : ""
    );
    setEditNeonWorkIncapacityStart(contract.neonDetail?.workIncapacityStart ?? "");
    setEditNeonWorkIncapacityBackpay(contract.neonDetail?.workIncapacityBackpay ?? "");
    setEditNeonWorkIncapacityAmount(
      contract.neonDetail?.workIncapacityAmount != null &&
      Number.isFinite(contract.neonDetail.workIncapacityAmount)
        ? String(contract.neonDetail.workIncapacityAmount)
        : ""
    );
    setEditNeonWorkIncapacityInjury(contract.neonDetail?.workIncapacityInjury ?? false);
    setEditNeonWorkIncapacityIllness(contract.neonDetail?.workIncapacityIllness ?? false);
    setEditNeonWorkIncapacity2Start(contract.neonDetail?.workIncapacity2Start ?? "");
    setEditNeonWorkIncapacity2Backpay(contract.neonDetail?.workIncapacity2Backpay ?? "");
    setEditNeonWorkIncapacity2Amount(
      contract.neonDetail?.workIncapacity2Amount != null &&
      Number.isFinite(contract.neonDetail.workIncapacity2Amount)
        ? String(contract.neonDetail.workIncapacity2Amount)
        : ""
    );
    setEditNeonWorkIncapacity2Injury(contract.neonDetail?.workIncapacity2Injury ?? false);
    setEditNeonWorkIncapacity2Illness(contract.neonDetail?.workIncapacity2Illness ?? false);
    setEditNeonCareDependencyAmount(
      contract.neonDetail?.careDependencyAmount != null &&
      Number.isFinite(contract.neonDetail.careDependencyAmount)
        ? String(contract.neonDetail.careDependencyAmount)
        : ""
    );
    setEditNeonSpecialAidAmount(
      contract.neonDetail?.specialAidAmount != null &&
      Number.isFinite(contract.neonDetail.specialAidAmount)
        ? String(contract.neonDetail.specialAidAmount)
        : ""
    );
    setEditNeonCaregivingAmount(
      contract.neonDetail?.caregivingAmount != null &&
      Number.isFinite(contract.neonDetail.caregivingAmount)
        ? String(contract.neonDetail.caregivingAmount)
        : ""
    );
    setEditNeonReproductionCostAmount(
      contract.neonDetail?.reproductionCostAmount != null &&
      Number.isFinite(contract.neonDetail.reproductionCostAmount)
        ? String(contract.neonDetail.reproductionCostAmount)
        : ""
    );
    setEditNeonCppHelp(!!contract.neonDetail?.cppHelp);
    setEditNeonLiabilityCitizenLimit(
      contract.neonDetail?.liabilityCitizenLimit != null &&
      Number.isFinite(contract.neonDetail.liabilityCitizenLimit)
        ? String(contract.neonDetail.liabilityCitizenLimit)
        : ""
    );
    setEditNeonLiabilityEmployeeLimit(
      contract.neonDetail?.liabilityEmployeeLimit != null &&
      Number.isFinite(contract.neonDetail.liabilityEmployeeLimit)
        ? String(contract.neonDetail.liabilityEmployeeLimit)
        : ""
    );
    setEditNeonTravelInsurance(!!contract.neonDetail?.travelInsurance);
    setEditNeonAccidentDailyBenefitStart(
      contract.neonDetail?.accidentDailyBenefitStart ?? ""
    );
    setEditNeonAccidentDailyBenefitBackpay(
      contract.neonDetail?.accidentDailyBenefitBackpay ?? ""
    );
    setEditNeonAccidentDailyBenefit(
      contract.neonDetail?.accidentDailyBenefit != null &&
      Number.isFinite(contract.neonDetail.accidentDailyBenefit)
        ? String(contract.neonDetail.accidentDailyBenefit)
        : ""
    );
    setEditFlexiDeathAmount(
      contract.flexiDetail?.deathAmount != null && Number.isFinite(contract.flexiDetail.deathAmount)
        ? String(contract.flexiDetail.deathAmount)
        : ""
    );
    setEditFlexiDeathTypedType(contract.flexiDetail?.deathTypedType ?? "");
    setEditFlexiDeathTypedAmount(
      contract.flexiDetail?.deathTypedAmount != null && Number.isFinite(contract.flexiDetail.deathTypedAmount)
        ? String(contract.flexiDetail.deathTypedAmount)
        : ""
    );
    setEditFlexiDeathAccidentAmount(
      contract.flexiDetail?.deathAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.deathAccidentAmount)
        ? String(contract.flexiDetail.deathAccidentAmount)
        : ""
    );
    setEditFlexiSeriousIllnessType(contract.flexiDetail?.seriousIllnessType ?? "");
    setEditFlexiSeriousIllnessAmount(
      contract.flexiDetail?.seriousIllnessAmount != null &&
      Number.isFinite(contract.flexiDetail.seriousIllnessAmount)
        ? String(contract.flexiDetail.seriousIllnessAmount)
        : ""
    );
    setEditFlexiIllnessForHim(
      contract.flexiDetail?.seriousIllnessForHim != null &&
      Number.isFinite(contract.flexiDetail.seriousIllnessForHim)
        ? String(contract.flexiDetail.seriousIllnessForHim)
        : ""
    );
    setEditFlexiIllnessForHer(
      contract.flexiDetail?.seriousIllnessForHer != null &&
      Number.isFinite(contract.flexiDetail.seriousIllnessForHer)
        ? String(contract.flexiDetail.seriousIllnessForHer)
        : ""
    );
    setEditFlexiPermanentIllnessAmount(
      contract.flexiDetail?.permanentIllnessAmount != null &&
      Number.isFinite(contract.flexiDetail.permanentIllnessAmount)
        ? String(contract.flexiDetail.permanentIllnessAmount)
        : ""
    );
    setEditFlexiInvalidityIllnessType(contract.flexiDetail?.invalidityIllnessType ?? "");
    setEditFlexiInvalidityIllness1(
      contract.flexiDetail?.invalidityIllness1 != null &&
      Number.isFinite(contract.flexiDetail.invalidityIllness1)
        ? String(contract.flexiDetail.invalidityIllness1)
        : ""
    );
    setEditFlexiInvalidityIllness2(
      contract.flexiDetail?.invalidityIllness2 != null &&
      Number.isFinite(contract.flexiDetail.invalidityIllness2)
        ? String(contract.flexiDetail.invalidityIllness2)
        : ""
    );
    setEditFlexiInvalidityIllness3(
      contract.flexiDetail?.invalidityIllness3 != null &&
      Number.isFinite(contract.flexiDetail.invalidityIllness3)
        ? String(contract.flexiDetail.invalidityIllness3)
        : ""
    );
    setEditFlexiHospitalGeneralAmount(
      contract.flexiDetail?.hospitalGeneralAmount != null &&
      Number.isFinite(contract.flexiDetail.hospitalGeneralAmount)
        ? String(contract.flexiDetail.hospitalGeneralAmount)
        : ""
    );
    setEditFlexiWorkIncapacityStart(contract.flexiDetail?.workIncapacityStart ?? "");
    setEditFlexiWorkIncapacityBackpay(contract.flexiDetail?.workIncapacityBackpay ?? "");
    setEditFlexiWorkIncapacityAmount(
      contract.flexiDetail?.workIncapacityAmount != null &&
      Number.isFinite(contract.flexiDetail.workIncapacityAmount)
        ? String(contract.flexiDetail.workIncapacityAmount)
        : ""
    );
    setEditFlexiCaregivingAmount(
      contract.flexiDetail?.caregivingAmount != null &&
      Number.isFinite(contract.flexiDetail.caregivingAmount)
        ? String(contract.flexiDetail.caregivingAmount)
        : ""
    );
    setEditFlexiPermanentAccidentAmount(
      contract.flexiDetail?.permanentAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.permanentAccidentAmount)
        ? String(contract.flexiDetail.permanentAccidentAmount)
        : ""
    );
    setEditFlexiInjuryDamageAmount(
      contract.flexiDetail?.injuryDamageAmount != null &&
      Number.isFinite(contract.flexiDetail.injuryDamageAmount)
        ? String(contract.flexiDetail.injuryDamageAmount)
        : ""
    );
    setEditFlexiAccidentDailyBenefit(
      contract.flexiDetail?.accidentDailyBenefit != null &&
      Number.isFinite(contract.flexiDetail.accidentDailyBenefit)
        ? String(contract.flexiDetail.accidentDailyBenefit)
        : ""
    );
    setEditFlexiHospitalAccidentAmount(
      contract.flexiDetail?.hospitalAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.hospitalAccidentAmount)
        ? String(contract.flexiDetail.hospitalAccidentAmount)
        : ""
    );
    setEditFlexiInvalidityAccidentType(contract.flexiDetail?.invalidityAccidentType ?? "");
    setEditFlexiInvalidityAccident1(
      contract.flexiDetail?.invalidityAccident1 != null &&
      Number.isFinite(contract.flexiDetail.invalidityAccident1)
        ? String(contract.flexiDetail.invalidityAccident1)
        : ""
    );
    setEditFlexiInvalidityAccident2(
      contract.flexiDetail?.invalidityAccident2 != null &&
      Number.isFinite(contract.flexiDetail.invalidityAccident2)
        ? String(contract.flexiDetail.invalidityAccident2)
        : ""
    );
    setEditFlexiInvalidityAccident3(
      contract.flexiDetail?.invalidityAccident3 != null &&
      Number.isFinite(contract.flexiDetail.invalidityAccident3)
        ? String(contract.flexiDetail.invalidityAccident3)
        : ""
    );
    setEditFlexiTrafficDeathAccidentAmount(
      contract.flexiDetail?.trafficDeathAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficDeathAccidentAmount)
        ? String(contract.flexiDetail.trafficDeathAccidentAmount)
        : ""
    );
    setEditFlexiTrafficPermanentAccidentAmount(
      contract.flexiDetail?.trafficPermanentAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficPermanentAccidentAmount)
        ? String(contract.flexiDetail.trafficPermanentAccidentAmount)
        : ""
    );
    setEditFlexiTrafficInjuryDamageAmount(
      contract.flexiDetail?.trafficInjuryDamageAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficInjuryDamageAmount)
        ? String(contract.flexiDetail.trafficInjuryDamageAmount)
        : ""
    );
    setEditFlexiTrafficAccidentDailyBenefit(
      contract.flexiDetail?.trafficAccidentDailyBenefit != null &&
      Number.isFinite(contract.flexiDetail.trafficAccidentDailyBenefit)
        ? String(contract.flexiDetail.trafficAccidentDailyBenefit)
        : ""
    );
    setEditFlexiTrafficHospitalAccidentAmount(
      contract.flexiDetail?.trafficHospitalAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficHospitalAccidentAmount)
        ? String(contract.flexiDetail.trafficHospitalAccidentAmount)
        : ""
    );
    setEditFlexiTrafficWorkIncapacityAmount(
      contract.flexiDetail?.trafficWorkIncapacityAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficWorkIncapacityAmount)
        ? String(contract.flexiDetail.trafficWorkIncapacityAmount)
        : ""
    );
    setEditFlexiTrafficInvalidityAmount(
      contract.flexiDetail?.trafficInvalidityAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficInvalidityAmount)
        ? String(contract.flexiDetail.trafficInvalidityAmount)
        : ""
    );
    setEditFlexiLoanDeathAmount(
      contract.flexiDetail?.loanDeathAmount != null &&
      Number.isFinite(contract.flexiDetail.loanDeathAmount)
        ? String(contract.flexiDetail.loanDeathAmount)
        : ""
    );
    setEditFlexiLoanInvalidityType(contract.flexiDetail?.loanInvalidityType ?? "");
    setEditFlexiLoanInvalidity1(
      contract.flexiDetail?.loanInvalidity1 != null &&
      Number.isFinite(contract.flexiDetail.loanInvalidity1)
        ? String(contract.flexiDetail.loanInvalidity1)
        : ""
    );
    setEditFlexiLoanInvalidity2(
      contract.flexiDetail?.loanInvalidity2 != null &&
      Number.isFinite(contract.flexiDetail.loanInvalidity2)
        ? String(contract.flexiDetail.loanInvalidity2)
        : ""
    );
    setEditFlexiLoanInvalidity3(
      contract.flexiDetail?.loanInvalidity3 != null &&
      Number.isFinite(contract.flexiDetail.loanInvalidity3)
        ? String(contract.flexiDetail.loanInvalidity3)
        : ""
    );
    setEditFlexiLoanIllnessAmount(
      contract.flexiDetail?.loanIllnessAmount != null &&
      Number.isFinite(contract.flexiDetail.loanIllnessAmount)
        ? String(contract.flexiDetail.loanIllnessAmount)
        : ""
    );
    setEditFlexiLoanWorkIncapacityAmount(
      contract.flexiDetail?.loanWorkIncapacityAmount != null &&
      Number.isFinite(contract.flexiDetail.loanWorkIncapacityAmount)
        ? String(contract.flexiDetail.loanWorkIncapacityAmount)
        : ""
    );
    setEditFlexiAddonMajakBasic(!!contract.flexiDetail?.addonMajakBasic);
    setEditFlexiAddonMajakPlus(!!contract.flexiDetail?.addonMajakPlus);
    setEditFlexiAddonLiabilityCitizen(
      contract.flexiDetail?.addonLiabilityCitizen != null &&
      Number.isFinite(contract.flexiDetail.addonLiabilityCitizen)
        ? String(contract.flexiDetail.addonLiabilityCitizen)
        : ""
    );
    setEditFlexiAddonTravel(!!contract.flexiDetail?.addonTravel);
    const propertyDetail =
      contract.productKey === "maxdomov"
        ? contract.maxdomovDetail
        : contract.domexDetail;
    setEditDomexAddress(propertyDetail?.address ?? "");
    setEditDomexPropertyType(propertyDetail?.propertyType ?? "");
    setEditDomexPropertyCoverage(propertyDetail?.propertyCoverage ?? "");
    setEditDomexSumInsured(
      propertyDetail?.sumInsured != null && Number.isFinite(propertyDetail.sumInsured)
        ? String(propertyDetail.sumInsured)
        : ""
    );
    setEditDomexDeductible(
      propertyDetail?.deductible != null && Number.isFinite(propertyDetail.deductible)
        ? String(propertyDetail.deductible)
        : ""
    );
    setEditDomexHouseholdType(propertyDetail?.householdType ?? "");
    setEditDomexHouseholdCoverage(propertyDetail?.householdCoverage ?? "");
    setEditDomexHouseholdSumInsured(
      propertyDetail?.householdSumInsured != null &&
      Number.isFinite(propertyDetail.householdSumInsured)
        ? String(propertyDetail.householdSumInsured)
        : ""
    );
    setEditDomexHouseholdDeductible(
      propertyDetail?.householdDeductible != null &&
      Number.isFinite(propertyDetail.householdDeductible)
        ? String(propertyDetail.householdDeductible)
        : ""
    );
    setEditDomexOutbuildingSumInsured(
      propertyDetail?.outbuildingSumInsured != null &&
      Number.isFinite(propertyDetail.outbuildingSumInsured)
        ? String(propertyDetail.outbuildingSumInsured)
        : ""
    );
    setEditDomexLiabilitySumInsured(
      propertyDetail?.liabilitySumInsured != null &&
      Number.isFinite(propertyDetail.liabilitySumInsured)
        ? String(propertyDetail.liabilitySumInsured)
        : ""
    );
    setEditDomexLiabilityDeductible(
      propertyDetail?.liabilityDeductible != null &&
      Number.isFinite(propertyDetail.liabilityDeductible)
        ? String(propertyDetail.liabilityDeductible)
        : ""
    );
    setEditDomexLiabilityMobile(!!propertyDetail?.liabilityMobile);
    setEditDomexLiabilityTenant(!!propertyDetail?.liabilityTenant);
    setEditDomexLiabilityLandlord(!!propertyDetail?.liabilityLandlord);
    setEditDomexAssistancePlus(!!propertyDetail?.assistancePlus);
    setEditDomexNote(propertyDetail?.note ?? "");
  }, [contract]);

  useEffect(() => {
    if (!contract) return;
    resetEditFields();
    setDetailsSaved(false);
    setDetailsError(null);
  }, [contract, resetEditFields]);

  const handleRefreshDetailsFromPdf = async () => {
    if (
      !user ||
      !ownerEmail ||
      !entryId ||
      !contract ||
      !prod ||
      !canManageContract ||
      !hasContractPdfAttachment
    ) {
      return;
    }

    const parser = PDF_REIMPORT_PARSERS[prod];
    if (!parser) {
      pushToast("Pro tento produkt tuto funkci připravujeme.", "success");
      return;
    }

    setRefreshingPdfDetails(true);
    setDetailsError(null);
    setDetailsSaved(false);

    try {
      const params = new URLSearchParams({
        ownerEmail,
        entryId,
      });
      const response = await fetchAuthedBlob(
        user,
        `/api/contracts/attachment?${params.toString()}`,
        { method: "GET" }
      );
      if (!response.ok) {
        let message = "PDF smlouvy se nepodařilo načíst.";
        try {
          const payload = (await response.json()) as unknown;
          if (
            payload &&
            typeof payload === "object" &&
            typeof (payload as Record<string, unknown>).error === "string"
          ) {
            message = (payload as Record<string, string>).error;
          }
        } catch {
          // Binary endpoint may fail before JSON is available.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const pdfBlob =
        blob.type === "application/pdf"
          ? blob
          : new Blob([blob], { type: "application/pdf" });
      const pdfFile = new File([pdfBlob], contractPdfFileName, {
        type: "application/pdf",
      });
      const parsedRaw = await parser(pdfFile);
      const parsed =
        parsedRaw && typeof parsedRaw === "object"
          ? (parsedRaw as Record<string, unknown>)
          : {};

      const apiUpdates: Record<string, unknown> = {};
      const contractPatch: Partial<ContractDoc> = {};
      let appliedCount = 0;

      const topLevelMerge = mergeEmptyContractFields(contract, parsed);
      Object.assign(apiUpdates, topLevelMerge.updates);
      Object.assign(contractPatch, topLevelMerge.updates);
      appliedCount += topLevelMerge.appliedCount;

      if (prod === "domex") {
        const propertyMerge = mergeEmptyPropertyDetailFields(contract.domexDetail, parsed);
        if (propertyMerge.appliedCount > 0) {
          apiUpdates.domexDetail = propertyMerge.detail;
          contractPatch.domexDetail = propertyMerge.detail;
          appliedCount += propertyMerge.appliedCount;
        }
      }

      if (prod === "maxdomov") {
        const propertyMerge = mergeEmptyPropertyDetailFields(contract.maxdomovDetail, parsed);
        if (propertyMerge.appliedCount > 0) {
          apiUpdates.maxdomovDetail = propertyMerge.detail;
          contractPatch.maxdomovDetail = propertyMerge.detail;
          appliedCount += propertyMerge.appliedCount;
        }
      }

      const parsedSlaviaDetail = parsed.carSlaviaDetail;
      if (
        prod === "slaviaauto" &&
        parsedSlaviaDetail &&
        typeof parsedSlaviaDetail === "object" &&
        !Array.isArray(parsedSlaviaDetail)
      ) {
        const slaviaMerge = mergeEmptySlaviaAutoDetailFields(
          contract.carSlaviaDetail,
          parsedSlaviaDetail as Record<string, unknown>
        );
        if (slaviaMerge.appliedCount > 0) {
          apiUpdates.carSlaviaDetail = slaviaMerge.detail;
          contractPatch.carSlaviaDetail = slaviaMerge.detail;
          appliedCount += slaviaMerge.appliedCount;
        }
      }

      const riskFields = parsed.riskFields;
      if (
        prod === "neon" &&
        riskFields &&
        typeof riskFields === "object" &&
        !Array.isArray(riskFields)
      ) {
        const neonMerge = mergeEmptyNeonDetailFields(
          contract.neonDetail,
          riskFields as Record<string, unknown>
        );
        if (neonMerge.appliedCount > 0) {
          apiUpdates.neonDetail = neonMerge.detail;
          contractPatch.neonDetail = neonMerge.detail;
          appliedCount += neonMerge.appliedCount;
        }
      }

      if (appliedCount === 0) {
        pushToast("PDF neobsahuje žádná nová prázdná pole k doplnění.", "success");
        return;
      }

      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryId,
          updates: apiUpdates,
        }),
      });

      setContract((prev) => (prev ? { ...prev, ...contractPatch } : prev));
      setDetailsSaved(true);
      pushToast(`Z PDF doplněno ${appliedCount} prázdných polí.`, "success");
    } catch (e) {
      console.error("Doplnění detailů z PDF selhalo:", e);
      const message =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "Data z PDF se nepodařilo doplnit.";
      setDetailsError(message);
      pushToast(message, "error");
    } finally {
      setRefreshingPdfDetails(false);
    }
  };

  const saveContractDetails = useContractDetails();

  const handleSaveDetails = async () => {
    if (!canManageContract || !ownerEmail || !entryId) return;
    setSavingDetails(true);
    setDetailsError(null);
    setDetailsSaved(false);

    try {
      const result = await saveContractDetails({
        product: prod,
        durationBounds,
        showDurationForProduct,
        ownerEmail,
        entryId,
        requestContractsApi,
        form: {
          editCarAddonAnimalCollision,
          editCarAddonAnimalCollisionLimit,
          editCarAddonAnimalDamage,
          editCarAddonAnimalDamageLimit,
          editCarAddonEso,
          editCarAddonFireExplosion,
          editCarAddonGap,
          editCarAddonGapLimit,
          editCarAddonGlass,
          editCarAddonGlassLimit,
          editCarAddonKeyLossTheft,
          editCarAddonKlika,
          editCarAddonLegalAdvice,
          editCarAddonLuggage,
          editCarAddonNatural,
          editCarAddonNaturalLimit,
          editCarAddonNaturalRisks,
          editCarAddonNonFaultAccident,
          editCarAddonOwnDamage,
          editCarAddonOwnDamageLimit,
          editCarAddonPassengerInjury,
          editCarAddonPothole,
          editCarAddonReplacementCar,
          editCarAddonServisPro,
          editCarAddonSmartGap,
          editCarAddonTheft,
          editCarAddonTheftLimit,
          editCarAddonTransportedGoods,
          editCarAddonVandalism,
          editCarAllianzScope,
          editCarAnnualMileage,
          editCarAssistancePlan,
          editCarHullDeductible,
          editCarHullRiskAccident,
          editCarHullRiskAnimalCollision,
          editCarHullRiskNatural,
          editCarHullRiskTheft,
          editCarHullRiskVandalism,
          editCarHullSumInsured,
          editCarLiabilityLimit,
          editCarMake,
          editCarOrv,
          editCarPlate,
          editCarTp,
          editCarVin,
          editClientAddress,
          editClientEmail,
          editClientName,
          editClientPhone,
          editContractNumber,
          editContractSigned,
          editDomexAddress,
          editDomexAssistancePlus,
          editDomexDeductible,
          editDomexHouseholdCoverage,
          editDomexHouseholdDeductible,
          editDomexHouseholdSumInsured,
          editDomexHouseholdType,
          editDomexLiabilityDeductible,
          editDomexLiabilityLandlord,
          editDomexLiabilityMobile,
          editDomexLiabilitySumInsured,
          editDomexLiabilityTenant,
          editDomexNote,
          editDomexOutbuildingSumInsured,
          editDomexPropertyCoverage,
          editDomexPropertyType,
          editDomexSumInsured,
          editDuration,
          editFlexiAccidentDailyBenefit,
          editFlexiAddonLiabilityCitizen,
          editFlexiAddonMajakBasic,
          editFlexiAddonMajakPlus,
          editFlexiAddonTravel,
          editFlexiCaregivingAmount,
          editFlexiDeathAccidentAmount,
          editFlexiDeathAmount,
          editFlexiDeathTypedAmount,
          editFlexiDeathTypedType,
          editFlexiHospitalAccidentAmount,
          editFlexiHospitalGeneralAmount,
          editFlexiIllnessForHer,
          editFlexiIllnessForHim,
          editFlexiInjuryDamageAmount,
          editFlexiInvalidityAccident1,
          editFlexiInvalidityAccident2,
          editFlexiInvalidityAccident3,
          editFlexiInvalidityAccidentType,
          editFlexiInvalidityIllness1,
          editFlexiInvalidityIllness2,
          editFlexiInvalidityIllness3,
          editFlexiInvalidityIllnessType,
          editFlexiLoanDeathAmount,
          editFlexiLoanIllnessAmount,
          editFlexiLoanInvalidity1,
          editFlexiLoanInvalidity2,
          editFlexiLoanInvalidity3,
          editFlexiLoanInvalidityType,
          editFlexiLoanWorkIncapacityAmount,
          editFlexiPermanentAccidentAmount,
          editFlexiPermanentIllnessAmount,
          editFlexiSeriousIllnessAmount,
          editFlexiSeriousIllnessType,
          editFlexiTrafficAccidentDailyBenefit,
          editFlexiTrafficDeathAccidentAmount,
          editFlexiTrafficHospitalAccidentAmount,
          editFlexiTrafficInjuryDamageAmount,
          editFlexiTrafficInvalidityAmount,
          editFlexiTrafficPermanentAccidentAmount,
          editFlexiTrafficWorkIncapacityAmount,
          editFlexiWorkIncapacityAmount,
          editFlexiWorkIncapacityBackpay,
          editFlexiWorkIncapacityStart,
          editNeonAccidentDailyBenefit,
          editNeonAccidentDailyBenefitBackpay,
          editNeonAccidentDailyBenefitStart,
          editNeonCareDependencyAmount,
          editNeonCaregivingAmount,
          editNeonChildSurgeryAmount,
          editNeonCppHelp,
          editNeonCriticalAmount,
          editNeonCriticalType,
          editNeonCriticalVariant,
          editNeonDeath2Amount,
          editNeonDeath2Type,
          editNeonDeathAccidentAmount,
          editNeonDeathAmount,
          editNeonDeathTerminalAmount,
          editNeonDeathType,
          editNeonDiabetesAmount,
          editNeonHospitalizationAmount,
          editNeonHospitalizationIllnessAmount,
          editNeonHospitalizationInjuryAmount,
          editNeonInjuryPermanent2Amount,
          editNeonInjuryPermanent2FulfillmentFrom,
          editNeonInjuryPermanent2Progression,
          editNeonInjuryPermanentAmount,
          editNeonInjuryPermanentFulfillmentFrom,
          editNeonInjuryPermanentProgression,
          editNeonInvalidityA1,
          editNeonInvalidityA2,
          editNeonInvalidityA3,
          editNeonInvalidityAType,
          editNeonInvalidityB1,
          editNeonInvalidityB2,
          editNeonInvalidityB3,
          editNeonInvalidityBType,
          editNeonInvalidityPension,
          editNeonLiabilityCitizenLimit,
          editNeonLiabilityEmployeeLimit,
          editNeonReproductionCostAmount,
          editNeonSpecialAidAmount,
          editNeonTravelInsurance,
          editNeonVaccinationCompAmount,
          editNeonVersion,
          editNeonWaiverInvalidity,
          editNeonWaiverUnemployment,
          editNeonWorkIncapacity2Amount,
          editNeonWorkIncapacity2Backpay,
          editNeonWorkIncapacity2Illness,
          editNeonWorkIncapacity2Injury,
          editNeonWorkIncapacity2Start,
          editNeonWorkIncapacityAmount,
          editNeonWorkIncapacityBackpay,
          editNeonWorkIncapacityIllness,
          editNeonWorkIncapacityInjury,
          editNeonWorkIncapacityStart,
          editPolicyEnd,
          editPolicyStart,
        },
      });

      if (!result.ok) {
        setDetailsError(result.error);
        return;
      }

      setContract((previous) =>
        previous ? result.applyToContract(previous) : previous
      );
      setEditMode(false);
      setDetailsSaved(true);
      pushToast("Detaily smlouvy byly uloženy.", "success");
    } catch (e) {
      console.error("Chyba při ukládání detailů smlouvy:", e);
      setDetailsError("Nepodařilo se uložit změny. Zkus to prosím znovu.");
      pushToast("Nepodařilo se uložit změny. Zkus to prosím znovu.", "error");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveNote = async () => {
    if (!ownerEmail || !entryId || !canManageContract) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSaved(false);

    try {
      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryId,
          updates: { note: noteDraft.trim() },
        }),
      });
      setContract((prev) => (prev ? { ...prev, note: noteDraft.trim() } : prev));
      setNoteSaved(true);
      pushToast("Poznámka byla uložena.", "success");
    } catch (e) {
      console.error("Chyba při ukládání poznámky:", e);
      setNoteError("Poznámku se nepodařilo uložit. Zkus to prosím znovu.");
      pushToast("Poznámku se nepodařilo uložit. Zkus to prosím znovu.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!ownerEmail || !entryId || !canManageContract) return;
    const nextValue = !(contract?.paid ?? false);
    setUpdatingPaid(true);
    setPaidError(null);
    try {
      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/set-paid", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: [{ ownerEmail, entryId }],
          paid: nextValue,
        }),
      });
      setContract((prev) => (prev ? { ...prev, paid: nextValue } : prev));
      pushToast(
        nextValue ? "Smlouva označena jako zaplacená." : "Platba označena jako neuhrazená.",
        "success"
      );
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }
    } catch (e) {
      console.error("Chyba při ukládání stavu platby:", e);
      setPaidError("Nepodařilo se uložit stav platby. Zkus to prosím znovu.");
      pushToast("Nepodařilo se uložit stav platby. Zkus to prosím znovu.", "error");
    } finally {
      setUpdatingPaid(false);
    }
  };

  const handleSetStorno = async () => {
    if (!ownerEmail || !entryId || !canSetStorno) return;
    const parsed = stornoDateInput ? new Date(stornoDateInput) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      setStornoError("Zadej platné datum storna.");
      return;
    }
    const minimumStornoDate =
      toDate(contract?.policyStartDate ?? null) ??
      toDate(contract?.contractSignedDate ?? null) ??
      toDate(contract?.createdAt ?? null);
    if (
      minimumStornoDate &&
      Math.floor(parsed.getTime() / 86_400_000) <
        Math.floor(minimumStornoDate.getTime() / 86_400_000)
    ) {
      setStornoError(
        `Datum storna nesmí být před datem počátku smlouvy (${formatDate(
          minimumStornoDate
        )}).`
      );
      return;
    }

    setUpdatingStorno(true);
    setStornoError(null);

    try {
      const targetIds = Array.from(
        new Set(
          (contractTimeline.length > 0
            ? contractTimeline.map((entry) => entry.id)
            : [entryId]).filter(Boolean)
        )
      ) as string[];

      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryIds: targetIds,
          updates: {
            status: "storno",
            stornoDate: parsed,
          },
        }),
      });

      setContract((prev) =>
        prev ? { ...prev, status: "storno", stornoDate: parsed } : prev
      );
      setContractTimeline((prev) =>
        prev.map((entry) => ({ ...entry, status: "storno", stornoDate: parsed }))
      );
      setShowStornoModal(false);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      pushToast("Smlouva byla označena jako storno.", "success");
    } catch (e) {
      console.error("Chyba při ukládání storna:", e);
      const message =
        e instanceof Error
          ? e.message
          : "Nepodařilo se uložit storno. Zkus to prosím znovu.";
      setStornoError(message);
      pushToast(message, "error");
    } finally {
      setUpdatingStorno(false);
    }
  };

  const handleClearStorno = async () => {
    if (!ownerEmail || !entryId || !canSetStorno) return;

    setUpdatingStorno(true);
    setStornoError(null);

    try {
      const targetIds = Array.from(
        new Set(
          (contractTimeline.length > 0
            ? contractTimeline.map((entry) => entry.id)
            : [entryId]).filter(Boolean)
        )
      ) as string[];

      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryIds: targetIds,
          updates: {
            status: "active",
            stornoDate: null,
          },
        }),
      });

      setContract((prev) =>
        prev ? { ...prev, status: "active", stornoDate: null } : prev
      );
      setContractTimeline((prev) =>
        prev.map((entry) => ({ ...entry, status: "active", stornoDate: null }))
      );
      setShowStornoModal(false);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      pushToast("Storno bylo zrušeno.", "success");
    } catch (e) {
      console.error("Chyba při rušení storna:", e);
      setStornoError("Nepodařilo se zrušit storno. Zkus to prosím znovu.");
      pushToast("Nepodařilo se zrušit storno. Zkus to prosím znovu.", "error");
    } finally {
      setUpdatingStorno(false);
    }
  };

  // meziprovize: pouze uložený snapshot při sepsání smlouvy (bez live přepočtu)
  useEffect(() => {
    if (!contract || !isManagerViewingSubordinate) {
      setOverrideItems(null);
      setOverrideTotal(null);
      setOverrideMode(null);
      setChildOverrideItems(null);
      setChildOverrideTotal(null);
      setChildOverrideMode(null);
      setChildOverrideLabel(null);
      setChildOverrideEmail(null);
      setChildOverrideName(null);
      setChildOverridePosition(null);
      return;
    }

    const normalizedUserEmail = normalizedEffectiveUserEmail;
    const managerOverrides = (contract.managerOverrides as ContractDoc["managerOverrides"]) ?? [];

    const storedOverride =
      managerOverrides.find((o) => (o.email ?? "").toLowerCase() === normalizedUserEmail) ?? null;
    const storedOverrideItems = stripTotalRows(storedOverride?.items);
    const storedOverrideTotal = computeTotalWithMultipliers(storedOverrideItems);
    const storedOverrideDisplayTotal = adjustLegacyPerPaymentTotal(
      storedOverrideItems,
      storedOverrideTotal
    );
    const hasStoredOverride =
      !!storedOverride && storedOverrideItems.length > 0 && storedOverrideDisplayTotal > 0;

    setOverrideItems(hasStoredOverride ? storedOverrideItems : null);
    setOverrideTotal(hasStoredOverride ? storedOverrideDisplayTotal : null);
    setOverrideMode(
      hasStoredOverride
        ? toCommissionMode(storedOverride?.commissionMode) ??
            toCommissionMode(contract.managerModeSnapshot) ??
            toCommissionMode(contract.commissionMode)
        : null
    );

    const chain = (contract.managerChain as ContractDoc["managerChain"]) ?? [];
    const idxByEmail = chain.findIndex(
      (c) => (c.email ?? "").toLowerCase() === normalizedUserEmail
    );
    const idxByPosition =
      idxByEmail < 0 && effectiveManagerPosition
        ? chain.findIndex((c) => c.position === effectiveManagerPosition)
        : -1;
    const resolvedIdx = idxByEmail >= 0 ? idxByEmail : idxByPosition;
    const fallbackChild =
      resolvedIdx < 0 && chain.length > 0 ? chain[chain.length - 1] : null;

    const childSnap =
      resolvedIdx > 0
        ? chain[resolvedIdx - 1]
        : resolvedIdx < 0
          ? fallbackChild ??
            (ownerManagerPosition
              ? {
                  email: ownerManagerEmail,
                  position: ownerManagerPosition,
                  commissionMode:
                    (contract.managerModeSnapshot as CommissionMode | null | undefined) ??
                    null,
                }
              : null)
          : null;

    const childEmail =
      (childSnap?.email as string | null | undefined)?.toLowerCase() ?? null;
    const storedChildOverride =
      managerOverrides.find((o) => (o.email ?? "").toLowerCase() === (childEmail ?? "")) ??
      null;
    const storedChildItems = stripTotalRows(storedChildOverride?.items);
    const storedChildTotal = computeTotalWithMultipliers(storedChildItems);
    const storedChildDisplayTotal = adjustLegacyPerPaymentTotal(
      storedChildItems,
      storedChildTotal
    );
    const hasStoredChildOverride =
      !!storedChildOverride && storedChildItems.length > 0 && storedChildDisplayTotal > 0;

    if (childSnap && childEmail && hasStoredChildOverride) {
      setChildOverrideItems(storedChildItems);
      setChildOverrideTotal(storedChildDisplayTotal);
      setChildOverrideMode(
        toCommissionMode(storedChildOverride?.commissionMode) ??
          toCommissionMode(childSnap.commissionMode) ??
          toCommissionMode(contract.commissionMode)
      );
      setChildOverrideLabel(
        (childSnap.position as Position | null | undefined) ??
          normalizeTitleForCompare(childSnap.email ?? childEmail)
      );
      setChildOverrideEmail(childEmail);
      setChildOverrideName(nameFromEmail(childSnap.email ?? childEmail));
      setChildOverridePosition((childSnap.position as Position | null | undefined) ?? null);
      return;
    }

    setChildOverrideItems(null);
    setChildOverrideTotal(null);
    setChildOverrideMode(null);
    setChildOverrideLabel(null);
    setChildOverrideEmail(null);
    setChildOverrideName(null);
    setChildOverridePosition(null);
  }, [
    contract,
    effectiveManagerPosition,
    isManagerViewingSubordinate,
    ownerManagerPosition,
    ownerManagerEmail,
    normalizedEffectiveUserEmail,
    adjustLegacyPerPaymentTotal,
  ]);

  // mazání smlouvy
  const handleDelete = async () => {
    if (!ownerEmail || !entryId || !canDelete) {
      setDeleteError("Nemáš oprávnění tuto smlouvu smazat.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    try {
      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: [{ ownerEmail, entryId }],
        }),
      });
      setShowDeleteModal(false);
      pushToast("Smlouva byla smazána.", "success");
      window.location.href = "/smlouvy";
    } catch (e) {
      console.error("Chyba při mazání smlouvy:", e);
      setDeleteError(
        "Smlouvu se nepodařilo smazat. Zkus to prosím znovu."
      );
      pushToast("Smlouvu se nepodařilo smazat. Zkus to prosím znovu.", "error");
      setDeleting(false);
    }
  };

  const handleRequestTransfer = async () => {
    if (
      !ownerEmail ||
      !entryId ||
      !transferTargetEmail ||
      !transferEffectiveDate ||
      !canManageContract
    ) {
      setTransferError("Vyber nového správce a datum účinnosti převodu.");
      return;
    }

    setSubmittingTransfer(true);
    setTransferError(null);
    try {
      const payload = await requestContractsApi<
        ContractsApiResponseBase & { contractCount?: number }
      >("/api/contracts/transfer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestAction: "submit",
          entries: [{ ownerEmail, entryId }],
          toOwnerEmail: transferTargetEmail,
          effectiveDate: transferEffectiveDate,
        }),
      });
      const selectedTarget = transferTargets.find(
        (target) => target.email === transferTargetEmail
      );
      const selectedLabel = selectedTarget
        ? transferTargetLabel(selectedTarget)
        : transferTargetEmail;
      const contractCount = Math.max(1, Number(payload.contractCount) || 1);
      setShowTransferModal(false);
      setShowManagementModal(false);
      setTransferTargetEmail("");
      setTransferTargetQuery("");
      setTransferTargetSearchOpen(false);
      setTransferEffectiveDate(localIsoDay());
      pushToast(
        `Žádost o převod ${contractCount === 1 ? "smlouvy" : `${contractCount} smluv`} na ${selectedLabel} byla odeslána administrátorovi.`,
        "success"
      );
    } catch (error) {
      console.error("Chyba při odesílání žádosti o převod smlouvy:", error);
      setTransferError(
        error instanceof Error && error.message
          ? error.message
          : "Žádost o převod se nepodařilo odeslat."
      );
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // vyfiltrované položky bez řádku "Celkem" a bez ročních součtů u produktů placených dle platby
  const filterPaymentBasedItems = (arr: CommissionResultItemDTO[]) => {
    if (isPerPaymentSeparatedPeriodProduct(prod)) {
      const perPaymentItems = arr.filter((it) =>
        (it.title ?? "").toLowerCase().includes("(z platby)")
      );
      if (perPaymentItems.length > 0) return perPaymentItems;
      if (prod === "zamex") {
        return arr.filter((it) => {
          const title = normalizeTitleForCompare(it.title);
          return title.includes("okamžitá provize") || title.includes("následná provize");
        });
      }
      return perPaymentItems;
    }
    return arr;
  };

  const filterAnnualYearlyDupes = (arr: CommissionResultItemDTO[]) => {
    if (isAutoCommissionProduct) {
      return arr.filter((it) => {
        const title = normalizeTitleForCompare(it.title);
        return !title.includes("provize za rok") && !title.includes("celkem za rok");
      });
    }
    if (prod !== "cppPPRs" || freq !== "annual") return arr;
    return arr.filter(
      (it) =>
        !normalizeTitleForCompare(it.title).includes("provize za rok")
    );
  };

  const adviserItems =
    filterAnnualYearlyDupes(
      filterPaymentBasedItems(
        (contract?.items ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const managerItems =
    filterAnnualYearlyDupes(
      filterPaymentBasedItems(
        (overrideItems ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const childManagerItems =
    filterAnnualYearlyDupes(
      filterPaymentBasedItems(
        (childOverrideItems ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const showMeziprovision =
    managerItems.length > 0 &&
    overrideTotal != null &&
    isManagerViewingSubordinate;

  const showChildMeziprovision =
    childManagerItems.length > 0 &&
    childOverrideTotal != null &&
    isManagerViewingSubordinate &&
    childOverrideLabel;

  const normalizedViewerEmail = normalizedEffectiveUserEmail;
  const otherManagerOverrideCards = (() => {
    if (!contract || !isManagerViewingSubordinate) return [];

    const overrides = (contract.managerOverrides as ContractDoc["managerOverrides"]) ?? [];
    const chain = (contract.managerChain as ContractDoc["managerChain"]) ?? [];
    const chainIdx = new Map<string, number>();
    chain.forEach((row, idx) => {
      const email = (row.email ?? "").trim().toLowerCase();
      if (!email) return;
      chainIdx.set(email, idx);
    });
    const viewerChainIndex =
      normalizedViewerEmail && chainIdx.has(normalizedViewerEmail)
        ? (chainIdx.get(normalizedViewerEmail) ?? -1)
        : -1;

    const excluded = new Set<string>();
    if (normalizedViewerEmail) excluded.add(normalizedViewerEmail);
    if (childOverrideEmail) excluded.add(childOverrideEmail);

    return overrides
      .map((override) => {
        const email = (override.email ?? "").trim().toLowerCase();
        if (!email || excluded.has(email)) return null;
        const overrideChainIndex = chainIdx.get(email) ?? -1;
        if (viewerChainIndex >= 0 && overrideChainIndex >= viewerChainIndex) {
          // Zobrazuj jen meziprovize pod přihlášeným manažerem, ne nad ním.
          return null;
        }

        const rawItems = stripTotalRows(override.items);
        const rawTotal = computeTotalWithMultipliers(rawItems);
        const adjustedRawTotal = adjustLegacyPerPaymentTotal(rawItems, rawTotal);
        if (rawItems.length === 0 || adjustedRawTotal <= 0) return null;

        const items = filterAnnualYearlyDupes(filterPaymentBasedItems(rawItems));
        const totalEligibleSum = items.reduce(
          (acc, item) => acc + (item.excludeFromTotal ? 0 : item.amount ?? 0),
          0
        );
        const totals = isPaymentBasedProduct
          ? paymentBasedTotals(items, paymentMultiplier)
          : null;

        const chainRow = chain.find(
          (row) => (row.email ?? "").trim().toLowerCase() === email
        );
        const position =
          (override.position as Position | null | undefined) ??
          (chainRow?.position as Position | null | undefined) ??
          null;
        const mode =
          toCommissionMode(override.commissionMode) ??
          toCommissionMode(chainRow?.commissionMode) ??
          toCommissionMode(contract.commissionMode);

        return {
          key: email,
          email,
          name: nameFromEmail(email),
          position,
          mode,
          items,
          totals,
          totalDisplay: isPaymentBasedProduct
            ? totalEligibleSum * paymentMultiplier
            : adjustedRawTotal,
          chainIndex: overrideChainIndex,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row)
      .sort((a, b) => {
        if (a.chainIndex !== b.chainIndex) return b.chainIndex - a.chainIndex;
        return a.name.localeCompare(b.name, "cs");
      });
  })();

  const showAnyMeziprovision = Boolean(
    isManagerViewingSubordinate &&
      (showMeziprovision || showChildMeziprovision || otherManagerOverrideCards.length > 0)
  );

  const canSetStorno = canManageContract || isManagerViewingSubordinate;
  const canDelete = canManageContract;
  const eligibleTransferTargets = transferTargets.filter(
    (target) => target.email !== normalizeEmail(ownerEmail)
  );
  const normalizedTransferTargetQuery = normalizeTransferSearch(transferTargetQuery);
  const matchingTransferTargets = eligibleTransferTargets
    .filter((target) => {
      if (!normalizedTransferTargetQuery) return true;
      return normalizeTransferSearch(
        `${transferTargetLabel(target)} ${target.email}`
      ).includes(normalizedTransferTargetQuery);
    })
    .slice(0, 8);
  const canRequestTransfer =
    canManageContract &&
    canTransferContracts &&
    eligibleTransferTargets.length > 0;
  const canOpenContractManagement =
    canSetStorno || canDelete || canRequestTransfer;

  const adviserSum = adviserItems.reduce(
    (sum, it) => sum + (it.excludeFromTotal ? 0 : it.amount ?? 0),
    0
  );
  const managerSum = managerItems.reduce(
    (sum, it) => sum + (it.excludeFromTotal ? 0 : it.amount ?? 0),
    0
  );
  const childManagerSum = childManagerItems.reduce(
    (sum, it) => sum + (it.excludeFromTotal ? 0 : it.amount ?? 0),
    0
  );

  const paymentBasedAdviserTotals = isPaymentBasedProduct
    ? paymentBasedTotals(adviserItems, paymentMultiplier)
    : null;
  const paymentBasedManagerTotals = isPaymentBasedProduct
    ? paymentBasedTotals(managerItems, paymentMultiplier)
    : null;
  const paymentBasedChildManagerTotals = isPaymentBasedProduct
    ? paymentBasedTotals(childManagerItems, paymentMultiplier)
    : null;

  const adviserTotalDisplay =
    isPaymentBasedProduct ? adviserSum * paymentMultiplier : contractTotal;
  const managerTotalDisplay =
    isPaymentBasedProduct ? managerSum * paymentMultiplier : overrideTotal ?? 0;
  const childManagerTotalDisplay =
    isPaymentBasedProduct ? childManagerSum * paymentMultiplier : childOverrideTotal ?? 0;
  const contractAuthorName = nameFromEmail(
    contract?.userEmail ?? ownerEmail ?? normalizedEffectiveUserEmail
  );
  const contractOriginalAdviserEmail =
    normalizeEmail(contract?.originalAdviserEmail) ||
    normalizeEmail(contract?.userEmail) ||
    normalizeEmail(ownerEmail);
  const contractServicingOwnerEmail =
    normalizeEmail(contract?.servicingOwnerEmail) ||
    normalizeEmail(contract?.commissionOwnerEmail) ||
    normalizeEmail(contract?.userEmail) ||
    normalizeEmail(ownerEmail);
  const contractWasTransferred = Boolean(
    contractOriginalAdviserEmail &&
      contractServicingOwnerEmail &&
      contractOriginalAdviserEmail !== contractServicingOwnerEmail
  );
  const contractOriginalAdviserName =
    contract?.originalAdviserName?.trim() ||
    nameFromEmail(contractOriginalAdviserEmail);
  const contractServicingOwnerName =
    contract?.servicingOwnerName?.trim() ||
    contract?.adviserName?.trim() ||
    nameFromEmail(contractServicingOwnerEmail);
  const contractOriginalPosition =
    contract?.originalPosition ?? contract?.position ?? null;
  const contractTransferDate = toDate(
    contract?.transferEffectiveDate ?? contract?.transferAt ?? null
  );
  const clientCardHref = CLIENT_CARDS_ENABLED
    ? clientCardHrefForName(contract?.clientName ?? null)
    : null;
  const terminationDefaults = resolveContractTerminationProductDefaults(prod);
  const terminationInsurer = terminationDefaults.insurer;
  const terminationInsuranceType = terminationDefaults.insuranceType;
  const terminationReasonOptions = getTerminationReasonsForSelection(
    terminationInsuranceType,
    terminationInsurer,
    prod,
  );
  const terminationPolicyStartDate = toDate(contract?.policyStartDate ?? null);
  const showTerminationAction = Boolean(terminationInsurer) &&
    shouldShowContractTerminationAction({
      product: prod,
      policyStartDay: terminationPolicyStartDate
        ? localIsoDay(terminationPolicyStartDate)
        : "",
      today: localIsoDay(),
    });
  const closeTerminationReasonModal = () => {
    setShowTerminationReasonModal(false);
    setSelectedTerminationReason(null);
  };
  const handleOpenUniqaTerminationModal = async () => {
    const requestId = uniqaTerminationRequestRef.current + 1;
    uniqaTerminationRequestRef.current = requestId;
    setUniqaTerminationPersonalId("");
    setUniqaTerminationPersonalIdError(null);
    setUniqaTerminationPersonalIdLoading(true);
    setShowUniqaTerminationModal(true);

    const sourcePdf =
      contractPdfOptions.find((option) => option.isCurrent) ??
      contractPdfOptions[0] ??
      null;
    if (!sourcePdf) {
      if (uniqaTerminationRequestRef.current === requestId) {
        setUniqaTerminationPersonalIdLoading(false);
        setUniqaTerminationPersonalIdError(
          "Ke smlouvě není uložené PDF, rodné číslo ani IČO proto nelze načíst.",
        );
      }
      return;
    }

    try {
      const pdfBlob = await downloadContractPdfBlob(sourcePdf);
      const pdfFile = new File([pdfBlob], sourcePdf.fileName, {
        type: "application/pdf",
      });
      const [uniqaPolicy, genericPolicyholder] = await Promise.all([
        parseUniqaAutoPdf(pdfFile),
        parseTerminationPolicyholderPdf(pdfFile),
      ]);
      if (uniqaTerminationRequestRef.current !== requestId) return;
      const personalId =
        uniqaPolicy.personalId?.trim() || genericPolicyholder.personalId.trim();
      if (personalId) {
        setUniqaTerminationPersonalId(personalId);
      } else {
        setUniqaTerminationPersonalIdError(
          "Rodné číslo ani IČO pojistníka se v PDF nepodařilo najít.",
        );
      }
    } catch (error) {
      console.warn("Rodné číslo nebo IČO pojistníka UNIQA se nepodařilo načíst", error);
      if (uniqaTerminationRequestRef.current === requestId) {
        setUniqaTerminationPersonalIdError(
          "PDF smlouvy se nepodařilo načíst. Rodné číslo nebo IČO zadejte na portálu ručně.",
        );
      }
    } finally {
      if (uniqaTerminationRequestRef.current === requestId) {
        setUniqaTerminationPersonalIdLoading(false);
      }
    }
  };
  const handleCreateTermination = async (reason: TerminationReason) => {
    if (!contract || !terminationInsurer || !showTerminationAction) return;
    setTerminationPrefillLoading(true);
    try {
      let pdfPolicyholder = {
        policyholderName: "",
        personalId: "",
        address: "",
        phone: "",
        email: "",
      };
      const sourcePdf =
        contractPdfOptions.find((option) => option.isCurrent) ??
        contractPdfOptions[0] ??
        null;
      if (sourcePdf) {
        try {
          const pdfBlob = await downloadContractPdfBlob(sourcePdf);
          const pdfFile = new File([pdfBlob], sourcePdf.fileName, {
            type: "application/pdf",
          });
          const productParser = prod ? PDF_REIMPORT_PARSERS[prod] : null;
          const [genericPolicyholder, productParseResult] = await Promise.all([
            parseTerminationPolicyholderPdf(pdfFile).catch((error) => {
              console.warn("Doplňkový parser kontaktních údajů selhal", error);
              return pdfPolicyholder;
            }),
            productParser
              ? productParser(pdfFile).catch((error) => {
                  console.warn("Produktový parser PDF nenačetl pojistníka", error);
                  return null;
                })
              : Promise.resolve(null),
          ]);
          const parsedProduct =
            productParseResult &&
            typeof productParseResult === "object" &&
            !Array.isArray(productParseResult)
              ? (productParseResult as Record<string, unknown>)
              : null;
          const parsedProductClientName =
            typeof parsedProduct?.clientName === "string"
              ? parsedProduct.clientName.trim()
              : "";
          const parsedProductPersonalId =
            typeof parsedProduct?.personalId === "string"
              ? parsedProduct.personalId.trim()
              : "";
          const parsedProductEmail =
            typeof parsedProduct?.clientEmail === "string"
              ? parsedProduct.clientEmail.trim()
              : typeof parsedProduct?.email === "string"
                ? parsedProduct.email.trim()
                : "";
          pdfPolicyholder = {
            ...genericPolicyholder,
            policyholderName:
              parsedProductClientName || genericPolicyholder.policyholderName,
            personalId:
              parsedProductPersonalId || genericPolicyholder.personalId,
            email: parsedProductEmail || genericPolicyholder.email,
          };
        } catch (error) {
          console.warn("Identifikační údaje z PDF se nepodařilo načíst", error);
        }
      }

      const prefillKey = storeContractTerminationPrefill({
        sourcePath: `${window.location.pathname}${window.location.search}`,
        sourceProduct: prod ?? null,
        contractNumber: contract.contractNumber ?? "",
        policyholderName:
          pdfPolicyholder.policyholderName || contract.clientName || "",
        personalId: pdfPolicyholder.personalId,
        address: pdfPolicyholder.address || contract.clientAddress || "",
        phone: pdfPolicyholder.phone || contract.clientPhone || "",
        email: pdfPolicyholder.email || contract.clientEmail || "",
        policyStartDate: toDateInputValue(contract.policyStartDate) ?? "",
        contractSignedDate:
          toDateInputValue(contract.contractSignedDate ?? contract.createdAt) ?? "",
        insurer: terminationInsurer,
        insuranceType: terminationInsuranceType,
        reason,
      });
      if (!prefillKey) {
        pushToast(
          "Předvyplnění se nepodařilo připravit. Otevírám prázdný formulář.",
          "error",
        );
      }
      router.push(
        `/pomucky/vypoved-smlouvy${
          prefillKey
            ? `?prefill=${encodeURIComponent(prefillKey)}&embedded=1`
            : "?embedded=1"
        }`,
      );
      closeTerminationReasonModal();
    } finally {
      setTerminationPrefillLoading(false);
    }
  };
  const uniqaTerminationContractNumber = contract?.contractNumber?.trim() ?? "";
  const uniqaTerminationCarPlate = contract?.carPlate?.trim() ?? "";
  const uniqaTerminationPersonalIdLabel = /^\d{8}$/.test(
    uniqaTerminationPersonalId.replace(/\s+/g, ""),
  )
    ? "IČO pojistníka"
    : uniqaTerminationPersonalId
      ? "Rodné číslo pojistníka"
      : "Rodné číslo / IČO pojistníka";

  const meziprovisionCards: MeziprovisionCard[] = [
    ...(showMeziprovision
      ? [
          {
            key: `self:${normalizedViewerEmail || "manager"}`,
            email: normalizedViewerEmail || null,
            userName: nameFromEmail(normalizedEffectiveUserEmail),
            position: effectiveManagerPosition ?? null,
            mode: overrideMode ?? null,
            items: managerItems,
            totals: paymentBasedManagerTotals,
            totalDisplay: managerTotalDisplay,
          },
        ]
      : []),
    ...(showChildMeziprovision
      ? [
          {
            key: `child:${childOverrideEmail || childOverrideName || "manager"}`,
            email: childOverrideEmail ?? null,
            userName: childOverrideName ?? nameFromEmail(childOverrideEmail),
            position: childOverridePosition ?? null,
            mode: childOverrideMode ?? null,
            items: childManagerItems,
            totals: paymentBasedChildManagerTotals,
            totalDisplay: childManagerTotalDisplay,
          },
        ]
      : []),
    ...otherManagerOverrideCards.map((card) => ({
      key: `other:${card.key}`,
      email: card.email,
      userName: card.name,
      position: card.position ?? null,
      mode: card.mode ?? null,
      items: card.items,
      totals: card.totals,
      totalDisplay: card.totalDisplay,
    })),
  ];

  useEffect(() => {
    setExpandedMeziprovisionKeys([]);
  }, [contract?.id, normalizedEffectiveUserEmail, isManagerViewingSubordinate]);

  const toggleMeziprovisionCard = (key: string) => {
    setExpandedMeziprovisionKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  // pokud je načtený kontrakt a uživatel nemá oprávnění, schovej data a přesměruj
  useEffect(() => {
    if (loading || !user || !contract) return;
    const canView = canViewContract;
    if (!canView && !unauthorized) {
      setUnauthorized(true);
      setContract(null);
      setError("Nemáš oprávnění tuto smlouvu zobrazit.");
      setShowDeleteModal(false);
      setShowManagementModal(false);
      setShowTransferModal(false);
      router.replace(backToContractsHref);
    }
  }, [loading, user, contract, canViewContract, unauthorized, router, backToContractsHref]);

  const shellCardClass = "min-w-0 space-y-6 px-2 py-2 font-mono";
  const surfaceCardClass =
    "rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)]";
  const surfaceSoftClass =
    "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3";
  const successPanelClass =
    "rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.08)]";
  const noteCardClass =
    "rounded-[20px] border border-slate-300 bg-[linear-gradient(165deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]";
  const monoHeadingClass = "font-mono tracking-tight text-slate-900";
  const monoChipClass =
    "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-mono tracking-tight text-slate-900";
  const monoChipDarkClass =
    "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-mono tracking-tight text-white";
  const ghostButtonClass =
    "rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm sm:text-base font-mono tracking-tight text-white transition hover:bg-black disabled:opacity-60";
  const headerActionButtonClass =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold font-mono tracking-tight text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60";
  const saveButtonClass =
    "inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm sm:text-base font-semibold font-mono tracking-tight text-white transition hover:bg-black disabled:opacity-60";
  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300";
  const inputCompactClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300";
  const metaLabelClass = "text-xs uppercase tracking-[0.18em] text-slate-600";
  const keyValueLabelClass = "text-base text-slate-600";
  const keyValueValueClass = "text-base font-semibold text-right text-slate-900";
  const statusErrorClass = "px-1 text-sm text-slate-700";
  const statusSuccessClass = "px-1 text-sm text-slate-900";
  const sectionPanelClass = "space-y-3 px-1 py-1";
  const adviserBreakdownPosition =
    ((contract?.position as Position | null | undefined) ?? ownerPosition ?? null);
  const adviserBreakdownMode = toCommissionMode(contract?.commissionMode);
  const contractSignedDateIsoForBreakdown = toDateInputValue(
    contract?.contractSignedDate ?? contract?.createdAt
  );

  const handleOpenNeonImmediateBreakdown = useCallback(
    (
      item: CommissionResultItemDTO,
      position: Position | null | undefined,
      commissionMode: CommissionMode | null | undefined
    ) => {
      const breakdown = buildNeonImmediateBreakdown(
        item.amount ?? 0,
        position,
        commissionMode,
        contractSignedDateIsoForBreakdown
      );
      if (!breakdown) {
        pushToast("Rozpad okamžité provize pro tuto pozici zatím není dostupný.", "error");
        return;
      }
      setNeonImmediateBreakdown(breakdown);
    },
    [contractSignedDateIsoForBreakdown, pushToast]
  );

  const handleAllianzPaymentCheckClick = useCallback(() => {
    const contractNumber = String(contract?.contractNumber ?? "").trim();
    const openAllianzPaymentCheck = () => {
      window.open(ALLIANZ_AUTO_PAYMENT_CHECK_URL, "_blank", "noopener,noreferrer");
    };

    if (!contractNumber) {
      pushToast("Číslo smlouvy není vyplněné. Allianz otevřu za 3 sekundy.", "error");
      window.setTimeout(openAllianzPaymentCheck, 3000);
      return;
    }

    const notifyCopied = () => {
      pushToast(
        `Číslo smlouvy ${contractNumber} je zkopírované. Allianz otevřu za 3 sekundy.`,
        "success"
      );
    };
    const notifyCopyFailed = () => {
      pushToast(
        "Číslo smlouvy se nepodařilo zkopírovat. Allianz otevřu za 3 sekundy.",
        "error"
      );
    };

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(contractNumber).then(notifyCopied, notifyCopyFailed);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = contractNumber;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (document.execCommand("copy")) {
          notifyCopied();
        } else {
          notifyCopyFailed();
        }
      } catch {
        notifyCopyFailed();
      } finally {
        textarea.remove();
      }
    }

    window.setTimeout(openAllianzPaymentCheck, 3000);
  }, [contract?.contractNumber, pushToast]);

  const startKooperativaStatusRedirect = useCallback(() => {
    clearKooperativaStatusRedirect();
    setKooperativaStatusCountdown(3);
    setKooperativaStatusRedirected(false);
    setKooperativaStatusRedirectError(null);

    const redirectAt = Date.now() + 3000;
    const updateRedirectCountdown = () => {
      const remainingMs = redirectAt - Date.now();
      setKooperativaStatusCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs > 0) return;

      clearKooperativaStatusRedirect();
      const popup = window.open(KOOPERATIVA_CONTRACT_STATUS_URL, "_blank");
      if (popup) {
        popup.opener = null;
        setKooperativaStatusRedirected(true);
      } else {
        setKooperativaStatusRedirectError(
          "Prohlížeč automatické otevření zablokoval. Otevři Kooperativu tlačítkem vpravo."
        );
      }
    };

    updateRedirectCountdown();
    kooperativaStatusRedirectTimerRef.current = window.setInterval(
      updateRedirectCountdown,
      100
    );
  }, [clearKooperativaStatusRedirect]);

  const handleKooperativaStatusCheckClick = useCallback(() => {
    if (prod !== "kooperativaAuto") return;

    clearKooperativaStatusRedirect();
    const requestId = kooperativaBirthNumberRequestRef.current + 1;
    kooperativaBirthNumberRequestRef.current = requestId;
    setKooperativaBirthNumber(null);
    setKooperativaDirectBirthDate(null);
    setKooperativaCompanyId(null);
    setKooperativaLegalEntity(false);
    setKooperativaBirthNumberError(null);
    setKooperativaPdfTemplateIssue(false);
    setKooperativaBirthNumberLoading(true);
    setKooperativaStatusCountdown(3);
    setKooperativaStatusRedirected(false);
    setKooperativaStatusRedirectError(null);
    setShowKooperativaStatusModal(true);

    if (!user || !ownerEmail || !entryId || !hasContractPdfAttachment) {
      setKooperativaBirthNumberLoading(false);
      setKooperativaBirthNumberError(
        "Potřebný identifikační údaj lze automaticky načíst jen z originálního PDF smlouvy uloženého u této smlouvy."
      );
      startKooperativaStatusRedirect();
      return;
    }

    void (async () => {
      try {
        const pdfBlob = await downloadContractPdfBlob({
          ownerEmail,
          entryId,
          fileName: contractPdfFileName,
          label: "Původní smlouva",
          meta: contractPdfFileName,
          isCurrent: true,
        });
        const parsed = await parseKooperativaAutoPdf(
          new File([pdfBlob], contractPdfFileName, { type: "application/pdf" })
        );
        if (kooperativaBirthNumberRequestRef.current !== requestId) return;

        const isLegalEntity = parsed.policyholderType === "legal_entity";
        setKooperativaLegalEntity(isLegalEntity);
        if (isLegalEntity) {
          if (!parsed.companyId) {
            setKooperativaBirthNumberError(
              "IČO se z originálního PDF nepodařilo načíst."
            );
            setKooperativaPdfTemplateIssue(true);
            return;
          }
          setKooperativaCompanyId(parsed.companyId);
          return;
        }

        if (parsed.policyholderBirthDate) {
          setKooperativaDirectBirthDate(parsed.policyholderBirthDate);
          return;
        }

        if (!parsed.birthNumber) {
          setKooperativaBirthNumberError(
            "Datum narození se z originálního PDF nepodařilo určit."
          );
          setKooperativaPdfTemplateIssue(true);
          return;
        }
        setKooperativaBirthNumber(parsed.birthNumber);
      } catch (error) {
        if (kooperativaBirthNumberRequestRef.current !== requestId) return;
        setKooperativaBirthNumberError(
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Datum narození se z PDF nepodařilo určit."
        );
      } finally {
        if (kooperativaBirthNumberRequestRef.current === requestId) {
          setKooperativaBirthNumberLoading(false);
          startKooperativaStatusRedirect();
        }
      }
    })();
  }, [
    clearKooperativaStatusRedirect,
    contractPdfFileName,
    downloadContractPdfBlob,
    entryId,
    hasContractPdfAttachment,
    ownerEmail,
    prod,
    startKooperativaStatusRedirect,
    user,
  ]);

  const kooperativaBirthDate = useMemo(
    () => {
      if (kooperativaDirectBirthDate) {
        const [year, month, day] = kooperativaDirectBirthDate.split("-");
        if (year && month && day) return `${day}.${month}.${year}`;
      }
      return birthDateFromCzechBirthNumber(kooperativaBirthNumber);
    },
    [kooperativaBirthNumber, kooperativaDirectBirthDate]
  );

  const copyContractActionValue = useCallback(
    (value: string | null | undefined, label: string) => {
      const text = String(value ?? "").trim();
      if (!text) return;
      if (!navigator.clipboard?.writeText) {
        pushToast(`${label} se nepodařilo zkopírovat.`, "error");
        return;
      }
      void navigator.clipboard.writeText(text).then(
        () => pushToast(`${label} je zkopírované.`, "success"),
        () => pushToast(`${label} se nepodařilo zkopírovat.`, "error")
      );
    },
    [pushToast]
  );

  const renderProductPanelContent = () => (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`flex items-center gap-2 text-base font-semibold ${monoHeadingClass}`}>
          <span className={monoChipDarkClass}>
            <Package size={13} strokeWidth={2} aria-hidden="true" />
            Produkt
          </span>
          Detail produktu
        </h3>
        <span className="text-sm font-semibold text-slate-600">{productLabel(prod)}</span>
      </div>
      {canManageContract && !editMode && hasContractPdfAttachment && (
        <button
          type="button"
          onClick={handleRefreshDetailsFromPdf}
          disabled={refreshingPdfDetails}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:opacity-60"
        >
          {refreshingPdfDetails ? (
            <Spinner className="h-3.5 w-3.5 border-2 border-slate-300 border-t-slate-700" />
          ) : (
            <FileText size={14} strokeWidth={2} aria-hidden="true" />
          )}
          <span>{refreshingPdfDetails ? "Načítám…" : "Načíst z PDF"}</span>
        </button>
      )}
      {isAutoProduct(prod) && (
        <AutoDetailPanel
          prod={prod}
          editMode={editMode}
          fields={autoFields}
          contract={contract}
          onChange={handleAutoFieldChange}
        />
      )}
      {prod === "neon" && (
        <NeonDetailPanel
          prod={prod}
          editMode={editMode}
          fields={neonFields}
          contract={contract?.neonDetail ?? null}
          onChange={handleNeonFieldChange}
        />
      )}
      {(prod === "domex" || prod === "maxdomov") && (
        <DomexDetailPanel
          prod={prod}
          editMode={editMode}
          fields={domexFields}
          domexDetail={
            prod === "maxdomov"
              ? contract?.maxdomovDetail ?? null
              : contract?.domexDetail ?? null
          }
          onChange={handleDomexFieldChange}
        />
      )}
      {prod === "flexi" && (
        <FlexiDetailPanel
          prod={prod}
          editMode={editMode}
          fields={flexiFields}
          contract={contract?.flexiDetail ?? null}
          onChange={handleFlexiFieldChange}
        />
      )}
    </>
  );

  const renderLoadingSkeleton = () => (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={surfaceCardClass}>
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className={surfaceCardClass}>
          <Skeleton className="h-3 w-20 mb-2" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-6 w-36" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={surfaceSoftClass}>
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`s-basic-${i}`} className="flex justify-between gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className={surfaceSoftClass}>
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`s-dates-${i}`} className="flex justify-between gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={successPanelClass}>
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="divide-y divide-slate-200">
          {[1, 2, 3].map((i) => (
            <div key={`s-provize-${i}`} className="flex items-center justify-between gap-3 py-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </section>

      <section className={surfaceCardClass}>
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-24 w-full" />
      </section>
    </div>
  );

  if (isEmbedded && showEmbeddedLoader) {
    const scanProgress = Math.max(0, Math.min(100, embeddedLoadProgress));
    const scanClipPath = `inset(${100 - scanProgress}% 0 0 0)`;
    const loaderStatus =
      scanProgress < 34
        ? "Načítám základní údaje"
        : scanProgress < 72
          ? "Skládám provize a historii"
          : "Finalizuji detail smlouvy";

    return (
      <main className="relative min-h-screen overflow-hidden bg-white font-mono text-slate-950">
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_22%_20%,rgba(189,0,201,0.1),transparent_32%),radial-gradient(circle_at_78%_76%,rgba(15,23,42,0.08),transparent_34%),#ffffff]" />
        <Toasts items={toasts} onDismiss={dismissToast} />
        <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
          <section className="relative w-full max-w-5xl overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.14)]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,#ffffff_0%,#ffffff_38%,#fff2ff_38%,#fff7ff_56%,#ffffff_56%,#ffffff_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#020617_0%,#bd00c9_54%,#ff79f2_100%)]" />

            <div className="relative grid min-h-[430px] grid-cols-1 gap-8 px-7 py-8 sm:px-10 sm:py-10 md:grid-cols-[0.9fr_1.1fr] md:items-center">
              <div className="flex flex-col justify-center">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-700 shadow-[0_10px_24px_rgba(189,0,201,0.1)]">
                  <FileText size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>Detail smlouvy</span>
                </div>

                <div className="mt-8 flex items-end gap-2">
                  <span className="text-[92px] font-black leading-[0.82] tracking-tight text-black sm:text-[118px]">
                    {scanProgress}
                  </span>
                  <span className="pb-2 text-4xl font-black leading-none text-[#bd00c9] sm:text-5xl">
                    %
                  </span>
                </div>

                <div className="mt-7 space-y-2">
                  <h1 className="max-w-sm text-3xl font-black leading-tight tracking-tight text-black sm:text-4xl">
                    Načítám smlouvu
                  </h1>
                  <p className="text-base font-bold text-slate-500">
                    {loaderStatus}
                  </p>
                </div>

                <div className="mt-8 max-w-md">
                  <div className="h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#020617_0%,#bd00c9_62%,#ff79f2_100%)] transition-[width] duration-200 ease-out"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <div className="mt-3 h-px w-full bg-[linear-gradient(90deg,rgba(2,6,23,0.22),rgba(189,0,201,0.34),rgba(2,6,23,0))]" />
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="relative h-[310px] w-[226px] sm:h-[360px] sm:w-[262px]">
                  <div className="absolute inset-4 rotate-[-5deg] rounded-[28px] bg-fuchsia-300/25 blur-3xl" />
                  <div className="absolute inset-0 rotate-[-3deg]">
                    <ContractScanPaper className="scale-[0.98] blur-[7px] opacity-45" />
                  </div>
                  <div
                    className="absolute inset-0 rotate-[-3deg] overflow-hidden transition-[clip-path] duration-200 ease-out"
                    style={{ clipPath: scanClipPath }}
                  >
                    <ContractScanPaper />
                  </div>
                  <div
                    className="absolute left-[-14%] right-[-14%] z-10 h-1 rotate-[-3deg] rounded-full bg-[#bd00c9] shadow-[0_0_24px_rgba(189,0,201,0.55),0_0_48px_rgba(255,121,242,0.38)] transition-[bottom] duration-200 ease-out"
                    style={{
                      bottom: `${scanProgress}%`,
                      transform: "translateY(50%)",
                    }}
                    aria-hidden="true"
                  >
                    <div className="absolute inset-x-0 -top-4 h-8 rounded-full bg-fuchsia-300/45 blur-xl" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const savedNoteText = contract?.note?.trim() ?? "";
  const notePreviewText = noteDraft.trim() || savedNoteText;
  const noteContentId = "contract-note-content";

  return (
    <main className="relative min-h-screen overflow-hidden font-mono text-slate-900">
      <div className="fixed inset-0 -z-10 bg-white" />
      <div className="fixed inset-0 -z-10 bg-slate-50" />

      <Toasts items={toasts} onDismiss={dismissToast} />

      <div className="relative flex min-h-screen items-start justify-center px-3 py-5 sm:px-5 sm:py-9">
        <div className="w-full max-w-[1220px]">
          <div className="min-w-0">
            <div className={shellCardClass}>
            {/* HEADER */}
            <header className="relative isolate px-1 py-1">
              {institutionLogo ? (
                <div
                  className="pointer-events-none absolute right-0 top-[-0.8rem] z-0 h-[120px] w-[230px] select-none overflow-hidden opacity-[0.075] mix-blend-multiply [mask-image:linear-gradient(to_left,black_58%,transparent_100%)] sm:right-1 sm:top-[-1.4rem] sm:h-[170px] sm:w-[420px]"
                  aria-hidden="true"
                >
                  <Image
                    src={institutionLogo}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 420px, 230px"
                    className="object-contain object-right [filter:grayscale(1)_contrast(0.78)]"
                  />
                </div>
              ) : null}

              <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                {!isEmbedded && (
                  <Link
                    href={backToContractsHref}
                    className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white"
                  >
                    <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
                    <span>Zpět na smlouvy</span>
                  </Link>
                )}
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Detail smlouvy
                  </span>
                  {isEndorsement && (
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                      Dodatek
                    </span>
                  )}
                  {isRefreshContract && !isNeonRefreshContract && (
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                      {originalReplacementLabelText}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-1 py-0.5 pr-2 text-xs font-semibold leading-none tracking-[0.01em] ${contractLifecycleBadgeStyle.wrapper}`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ring-1 ring-white/45 ${contractLifecycleBadgeStyle.iconWrap}`}
                    >
                      {contractLifecycleBadgeStyle.icon}
                    </span>
                    <span>{contractLifecycleBadgeText}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="text-4xl font-black leading-none tracking-tight text-slate-950 sm:text-5xl">
                    {contract?.contractNumber?.trim()
                      ? contract.contractNumber.trim()
                      : "Číslo smlouvy není uvedené"}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-lg font-bold text-slate-800 sm:text-xl">
                    <span className="inline-flex items-center gap-2">
                      <UserRound size={19} strokeWidth={2.1} aria-hidden="true" />
                      {contract?.clientName ?? "—"}
                    </span>
                    <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
                    <span className="inline-flex items-center gap-2">
                      <Package size={19} strokeWidth={2.1} aria-hidden="true" />
                      {productLabel(prod)}
                      <Image
                        src={productIcon(prod)}
                        alt="Produkt"
                        width={40}
                        height={40}
                        className="h-9 w-auto flex-shrink-0"
                      />
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canManageContract && (
                  <button
                    type="button"
                    onClick={handleTogglePaid}
                    disabled={updatingPaid}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold tracking-tight shadow-sm transition ${
                      contract?.paid
                        ? "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                        : "border-rose-700 bg-rose-600 text-white hover:bg-rose-700"
                    } ${updatingPaid ? "opacity-60" : ""}`}
                  >
                    {updatingPaid && <Spinner className="h-4 w-4 border-2 border-white/70 border-t-slate-500" />}
                    <span>{contract?.paid ? "Zaplaceno" : "Nezaplaceno"}</span>
                  </button>
                )}

                {canManageContract && !editMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailsSaved(false);
                      setEditMode(true);
                    }}
                    className={headerActionButtonClass}
                  >
                    <PencilLine size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Upravit údaje</span>
                  </button>
                )}

                {clientCardHref && (
                  <Link
                    href={clientCardHref}
                    className={headerActionButtonClass}
                  >
                    <IdCard size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Karta klienta</span>
                  </Link>
                )}

                {showTerminationAction ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (prod === "uniqaAuto") {
                        void handleOpenUniqaTerminationModal();
                        return;
                      }
                      setSelectedTerminationReason(null);
                      setShowTerminationReasonModal(true);
                    }}
                    className={headerActionButtonClass}
                  >
                    <FileSignature size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Vytvořit výpověď</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowProductPanel((v) => !v)}
                  className={headerActionButtonClass}
                >
                  <Package size={14} strokeWidth={2} aria-hidden="true" />
                  <span>{showProductPanel ? "Skrýt detail" : "Detail produktu"}</span>
                </button>

                {prod === "allianzAuto" && (
                  <button
                    type="button"
                    onClick={handleAllianzPaymentCheckClick}
                    className={headerActionButtonClass}
                  >
                    <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Ověřit zaplacení</span>
                  </button>
                )}

                {prod === "kooperativaAuto" && (
                  <button
                    type="button"
                    onClick={handleKooperativaStatusCheckClick}
                    className={headerActionButtonClass}
                  >
                    <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Ověření stavu smlouvy</span>
                  </button>
                )}

                {prod === "slaviaauto" && (
                  <a
                    href={SLAVIA_CONTRACT_VERIFICATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={headerActionButtonClass}
                  >
                    <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Ověřit smlouvu</span>
                  </a>
                )}

                {SHOW_CONTRACT_PDF_PREVIEW_BUTTON && hasAnyContractPdfAttachment && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={handleContractPdfButtonClick}
                      disabled={contractPdfLoading}
                      aria-expanded={
                        contractPdfOptions.length > 1 ? showContractPdfOptions : undefined
                      }
                      className={`${headerActionButtonClass} ${contractPdfLoading ? "opacity-60" : ""}`}
                    >
                      <Eye size={14} strokeWidth={2} aria-hidden="true" />
                      <span>
                        {openContractPdfExternally ? "Otevřít smlouvu" : "Zobrazit smlouvu"}
                      </span>
                      {contractPdfOptions.length > 1 && (
                        <ChevronDown
                          size={15}
                          strokeWidth={2}
                          className={`transition ${
                            showContractPdfOptions ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                    {showContractPdfOptions && contractPdfOptions.length > 1 && (
                      <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_18px_48px_rgba(15,23,42,0.22)]">
                        {contractPdfOptions.map((option) => (
                          <button
                            key={option.entryId}
                            type="button"
                            onClick={() => openContractPdfOption(option)}
                            className="block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-900">
                                {option.label}
                              </span>
                              {option.isCurrent && (
                                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  Aktuální
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-600">
                              {option.meta}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {maxxContractDetailUrl && (
                  <a
                    href={maxxContractDetailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={headerActionButtonClass}
                  >
                    <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Otevřít smlouvu v MAXX</span>
                  </a>
                )}

                {cppExtranetDetailUrl && (
                  <a
                    href={cppExtranetDetailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={headerActionButtonClass}
                  >
                    <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Otevřít extranet</span>
                  </a>
                )}

                {canManageContract && editMode && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={savingDetails}
                      className={saveButtonClass}
                    >
                      {savingDetails && (
                        <Spinner className="h-3.5 w-3.5 border-black/35 border-t-black" />
                      )}
                      <span>{savingDetails ? "Ukládám…" : "Uložit změny"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetEditFields();
                        setEditMode(false);
                      }}
                      disabled={savingDetails}
                      className={ghostButtonClass}
                    >
                      Zrušit
                    </button>
                  </>
                )}
              </div>
              </div>
            </header>

            {detailsError && (
              <div className={statusErrorClass}>
                {detailsError}
              </div>
            )}
            {detailsSaved && (
              <div className={statusSuccessClass}>
                Změny byly uloženy.
              </div>
            )}

            {loading ? (
              renderLoadingSkeleton()
            ) : error ? (
              <div className={statusErrorClass}>
                {error}
              </div>
            ) : contract ? (
              <>
                {editMode && (
                  <section className={`${surfaceCardClass} grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]`}>
                    <div className="space-y-2.5">
                      <div className={`${metaLabelClass} inline-flex items-center gap-2`}>
                        <UserRound size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Klient</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={editClientName}
                          onChange={(e) => setEditClientName(e.target.value)}
                          className={`${inputClass} font-semibold`}
                          placeholder="Jméno klienta"
                        />
                        <input
                          type="email"
                          value={editClientEmail}
                          onChange={(e) => setEditClientEmail(e.target.value)}
                          className={inputClass}
                          placeholder="E-mail klienta"
                        />
                        <input
                          type="tel"
                          value={editClientPhone}
                          onChange={(e) => setEditClientPhone(e.target.value)}
                          className={inputClass}
                          placeholder="Telefon"
                        />
                        <input
                          type="text"
                          value={editClientAddress}
                          onChange={(e) => setEditClientAddress(e.target.value)}
                          className={inputClass}
                          placeholder="Adresa"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="min-w-0">
                        <div className={`${metaLabelClass} inline-flex items-center gap-2`}>
                          <Package size={14} strokeWidth={2} aria-hidden="true" />
                          <span>Produkt</span>
                        </div>
                        <div className="mt-1 truncate text-xl font-bold tracking-tight text-slate-950">
                          {productLabel(prod)}
                        </div>
                      </div>
                      <Image
                        src={productIcon(prod)}
                        alt="Produkt"
                        width={56}
                        height={56}
                        className="h-9 w-auto flex-shrink-0"
                      />
                    </div>
                  </section>
                )}

                {showProductPanel && (
                  <section className={`${surfaceCardClass} space-y-4`}>
                    {renderProductPanelContent()}
                  </section>
                )}

                {/* U převedené smlouvy vždy oddělujeme sjednatele a správce. */}
                {contract && (contractWasTransferred || isManagerViewingSubordinate) && (
                  <section className={sectionPanelClass}>
                    <h3 className={`mb-2 flex items-center gap-2 text-base font-semibold ${monoHeadingClass}`}>
                      <span className={monoChipClass}>
                        {contractWasTransferred ? "Správa smlouvy" : "Sjednatel"}
                      </span>
                    </h3>
                    <dl className="grid max-w-[520px] grid-cols-[112px_minmax(0,1fr)] gap-x-5 gap-y-2 text-base text-slate-800">
                      <dt className={keyValueLabelClass}>Sjednal</dt>
                      <dd className="text-base font-semibold text-slate-900">
                        {contractOriginalAdviserName}
                      </dd>

                      <dt className={keyValueLabelClass}>Pozice při sjednání</dt>
                      <dd className="text-base font-semibold text-slate-900">
                        {positionLabel(contractOriginalPosition)}
                      </dd>

                      {contractWasTransferred && (
                        <>
                          <dt className={keyValueLabelClass}>Správce</dt>
                          <dd className="text-base font-semibold text-slate-900">
                            {contractServicingOwnerName}
                            <span className="block text-sm font-normal text-slate-600">
                              Čerpá dosud nevyplacené a budoucí provize
                            </span>
                          </dd>

                          {contractTransferDate && (
                            <>
                              <dt className={keyValueLabelClass}>Převedeno</dt>
                              <dd className="text-base font-semibold text-slate-900">
                                {contractTransferDate.toLocaleDateString("cs-CZ")}
                              </dd>
                            </>
                          )}
                        </>
                      )}

                      {ownerManagerEmail && (
                        <>
                          <dt className={keyValueLabelClass}>Nadřízený</dt>
                          <dd className="text-base font-semibold text-slate-900">
                            {nameFromEmail(ownerManagerEmail)}
                            {ownerManagerPosition && (
                              <span className="block text-sm text-slate-600">
                                {positionLabel(ownerManagerPosition)}
                              </span>
                            )}
                          </dd>
                        </>
                      )}
                    </dl>
                    {contractWasTransferred && (
                      <p className="mt-3 max-w-[620px] rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm leading-relaxed text-violet-950">
                        Již vyplacené provize zůstávají původnímu sjednateli. Správce čerpá pouze dosud nevyplacené a budoucí provize, vždy podle pozice při sjednání uvedené výše.
                      </p>
                    )}
                  </section>
                )}

                {paidError && (
                  <div className={statusErrorClass}>
                    {paidError}
                  </div>
                )}
                <div className="space-y-5">
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className={sectionPanelClass}>
                    <h3 className={`mb-2.5 flex items-center gap-2 text-lg font-semibold ${monoHeadingClass}`}>
                      <span className={monoChipDarkClass}>
                        <FileText size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Základní údaje</span>
                      </span>
                    </h3>
                    <dl className="space-y-2.5 text-base text-slate-800">
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Sjednána jako</dt>
                        <dd className={keyValueValueClass}>
                          {positionLabel(contract.position)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>
                          {isEndorsement
                            ? "Nové pojistné"
                            : isShowingLatestTimelinePremium
                              ? "Aktuální pojistné"
                              : "Pojistné"}
                        </dt>
                        <dd className={keyValueValueClass}>
                          {formatMoney(premium)}
                        </dd>
                      </div>
                      {isEndorsement && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Základ pro provizi dodatku</dt>
                          <dd className={keyValueValueClass}>
                            {formatMoney(contract.inputAmount ?? 0)}
                          </dd>
                        </div>
                      )}
                      {isEndorsement && endorsementDelta != null && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Rozdíl pojistného</dt>
                          <dd
                            className={`${keyValueValueClass} ${
                              endorsementDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {endorsementDelta >= 0 ? "+" : "−"}
                            {formatMoney(Math.abs(endorsementDelta))}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>
                          Frekvence platby
                        </dt>
                        <dd className={keyValueValueClass}>
                          {frequencyText(freq)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Stav smlouvy</dt>
                        <dd
                          className={`${keyValueValueClass} ${
                            isStornoContract
                              ? "text-amber-700"
                              : isDozitaContract
                              ? "text-sky-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {isStornoContract
                            ? stornoDateLabel !== "—"
                              ? `Storno (${stornoDateLabel})`
                              : "Storno"
                            : isDozitaContract
                            ? maturityDateLabel !== "—"
                              ? `Dožitá (${maturityDateLabel})`
                              : "Dožitá"
                            : "Aktivní"}
                        </dd>
                      </div>
                      {hasTipContract && (
                        <div className="rounded-2xl border border-fuchsia-200 bg-[linear-gradient(160deg,#fff7ff_0%,#f6f3ff_100%)] px-3 py-3 shadow-[0_8px_20px_rgba(147,51,234,0.1)]">
                          <div className="flex items-center justify-between gap-3">
                            <dt className="inline-flex items-center gap-2 text-base font-semibold text-fuchsia-900">
                              <Tag size={15} strokeWidth={2} aria-hidden="true" />
                              <span>Smlouva z TIPU</span>
                            </dt>
                            <span className="inline-flex items-center rounded-full border border-fuchsia-300 bg-fuchsia-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-fuchsia-800">
                              {tipContractTipsterPercent} % tipař
                            </span>
                          </div>

                          <dd className="mt-2 space-y-2 text-sm text-slate-700">
                            <p className="leading-snug">{tipContractSourceLabel}</p>
                            {hasTipContractSource && (
                              <div className="rounded-xl border border-fuchsia-200 bg-white/75 px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <Tag
                                    size={15}
                                    className="mt-0.5 text-fuchsia-700"
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-fuchsia-950">
                                      Vybraný TIP
                                    </p>
                                    <p className="mt-0.5 leading-snug text-slate-800">
                                      {tipContractSourceProductLabel || "Tip"}
                                      {tipContractSourceClientName
                                        ? ` • ${tipContractSourceClientName}`
                                        : ""}
                                    </p>
                                    {tipContractSourceCreatedAtMs != null && (
                                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                                        <CalendarDays
                                          size={13}
                                          strokeWidth={2}
                                          aria-hidden="true"
                                        />
                                        Vytvořeno {formatDate(tipContractSourceCreatedAtMs)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            <p className="text-xs text-fuchsia-800/90">
                              {tipContractBaseText}
                            </p>

                            {tipContractImmediateGross != null &&
                              tipContractTipsterAmount != null &&
                              tipContractImmediateNet != null && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <div className="rounded-xl border border-fuchsia-200 bg-white/70 px-3 py-2 text-center">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700">
                                      {tipContractGrossLabel}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                      {formatMoney(tipContractImmediateGross)}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-fuchsia-200 bg-white/70 px-3 py-2 text-center">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700">
                                      Tipař
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-fuchsia-900">
                                      {formatMoney(tipContractTipsterAmount)}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-fuchsia-200 bg-white/70 px-3 py-2 text-center">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700">
                                      {tipContractNetLabel}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                      {formatMoney(tipContractImmediateNet)}
                                    </p>
                                  </div>
                                </div>
                              )}
                          </dd>
                        </div>
                      )}
                      {isNeonRefreshContract && (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-3 py-3">
                          <div className="flex justify-between gap-2">
                            <dt className={keyValueLabelClass}>
                              {originalReplacementLabelText}
                            </dt>
                            <dd className={`${keyValueValueClass} max-w-[70%] text-right text-sm leading-snug`}>
                              <span className="block">
                                Tato smlouva je označena jako {originalReplacementLabelText}.
                              </span>
                              {refreshOriginalContractNumber && (
                                <span className="mt-1 block text-xs text-slate-500">
                                  Původní č. smlouvy: {refreshOriginalContractNumber}
                                </span>
                              )}
                              {refreshOriginalMissingInSystem && (
                                <span className="mt-1 block text-xs text-amber-700">
                                  Původní smlouva není v systému.
                                </span>
                              )}
                            </dd>
                          </div>
                          {hasProvisionalRefreshCalculation && (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-900">
                              <AlertTriangle
                                size={15}
                                strokeWidth={2.2}
                                className="mt-0.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span>
                                Provize je zatím orientační. U smlouvy typu{" "}
                                {originalReplacementLabelText} bez původní smlouvy v
                                systému se správná základna musí sladit podle provizního
                                výpisu.
                              </span>
                            </div>
                          )}
                          {hasRefreshCommissionBase && (
                            <div className="mt-3 rounded-xl border border-sky-200 bg-white/80 px-3 py-2 text-sm text-slate-700">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-sky-950">
                                  Základna pro provizi
                                </span>
                                <span className="font-mono font-bold text-slate-950">
                                  {formatMoney(refreshCalculationAnnualPremium)} ročně
                                </span>
                              </div>
                              <div className="mt-1 text-right text-xs text-slate-500">
                                měsíčně {formatMoney(refreshCalculationMonthlyPremium)}
                              </div>
                              {refreshCommissionBase && (
                                <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                                  <div>
                                    Nové pojistné:{" "}
                                    <span className="font-semibold text-slate-900">
                                      {formatMoney(
                                        Number(refreshCommissionBase.newAnnualPremium)
                                      )}{" "}
                                      ročně
                                    </span>
                                  </div>
                                  <div>
                                    Původní základna:{" "}
                                    <span className="font-semibold text-slate-900">
                                      {formatMoney(
                                        refreshOriginalAnnualPremium
                                      )}{" "}
                                      ročně
                                    </span>
                                  </div>
                                  {hasDifferentRefreshStornoBase && (
                                    <div>
                                      Storno základna:{" "}
                                      <span className="font-semibold text-slate-900">
                                        {formatMoney(
                                          refreshStornoBaseAnnualPremium
                                        )}{" "}
                                        ročně
                                      </span>
                                    </div>
                                  )}
                                  <div>
                                    {isRefreshMotivationalBase
                                      ? "Motivační základna 48 %:"
                                      : "Stornovaná část základny:"}{" "}
                                    <span className="font-semibold text-slate-900">
                                      {formatMoney(
                                        isRefreshMotivationalBase
                                          ? refreshMotivationalAnnualPremium
                                          : Number(
                                              refreshCommissionBase.stornedOriginalAnnualPremium
                                            )
                                      )}
                                    </span>
                                  </div>
                                  <div>
                                    Odžito:{" "}
                                    <span className="font-semibold text-slate-900">
                                      {Number(refreshCommissionBase.elapsedMonths)}/
                                      {Number(refreshCommissionBase.stornoMonths) || 60} měsíců
                                    </span>
                                  </div>
                                </div>
                              )}
                              <p className="mt-2 text-xs leading-snug text-sky-900">
                                Tahle základna se ukládá ke smlouvě a používá se pro kontrolu provizního výpisu.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {(contract?.refreshReplacedBySignedDate || hasRefreshReplacement) && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Navazující smlouva</dt>
                          <dd className={`${keyValueValueClass} max-w-[70%] text-right text-sm leading-snug`}>
                            <span className="block">
                              Na tuto smlouvu navazuje smlouva typu{" "}
                              {originalReplacementLabelText} ze dne{" "}
                              {refreshReplacementSignedLabel !== "—"
                                ? refreshReplacementSignedLabel
                                : "—"}
                              .
                            </span>
                            {refreshReplacementHref && canOpenRefreshReplacement ? (
                              <Link
                                href={refreshReplacementHref}
                                className="mt-1 inline-flex items-center rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                Otevřít novou smlouvu
                              </Link>
                            ) : hasRefreshReplacement ? (
                              <span className="mt-1 block text-xs text-slate-500">
                                Na novou smlouvu nemáš oprávnění.
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* DATA SMLOUVY */}
                  <div className={sectionPanelClass}>
                    <h3 className={`mb-2.5 flex items-center gap-2 text-lg font-semibold ${monoHeadingClass}`}>
                      <span className={monoChipDarkClass}>
                        <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Data smlouvy</span>
                      </span>
                    </h3>
                    <dl className="space-y-2.5 text-base text-slate-800">
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Datum sjednání</dt>
                        <dd className={keyValueValueClass}>
                          {editMode ? (
                            <input
                              type="date"
                              value={editContractSigned}
                              onChange={(e) => setEditContractSigned(e.target.value)}
                              className={inputCompactClass}
                            />
                          ) : (
                            formatDate(contract.contractSignedDate ?? contract.createdAt)
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>
                          Počátek smlouvy
                        </dt>
                        <dd className={keyValueValueClass}>
                          {editMode ? (
                            <input
                              type="date"
                              value={editPolicyStart}
                              onChange={(e) => setEditPolicyStart(e.target.value)}
                              className={inputCompactClass}
                            />
                          ) : (
                            formatDate(contract.policyStartDate)
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Pojištění do</dt>
                        <dd className={keyValueValueClass}>
                          {editMode ? (
                            <input
                              type="date"
                              value={editPolicyEnd}
                              onChange={(e) => setEditPolicyEnd(e.target.value)}
                              className={inputCompactClass}
                            />
                          ) : (
                            formatDate(contract.policyEndDate)
                          )}
                        </dd>
                      </div>
                      {showDurationForProduct && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Doba trvání (provize)</dt>
                          <dd className={keyValueValueClass}>
                            {editMode ? (
                              <input
                                type="number"
                                min={durationBounds?.[0] ?? 1}
                                max={durationBounds?.[1] ?? 80}
                                value={editDuration ?? ""}
                                onChange={(e) =>
                                  setEditDuration(e.target.value ? Number(e.target.value) : null)
                                }
                                className={`w-20 ${inputCompactClass}`}
                              />
                            ) : (
                              durationYears != null
                                ? `${durationYears} ${durationYears === 1 ? "rok" : "let"}`
                                : "—"
                            )}
                          </dd>
                        </div>
                      )}
                      {editMode && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Číslo smlouvy</dt>
                          <dd className={`${keyValueValueClass} w-40`}>
                            <input
                              type="text"
                              value={editContractNumber}
                              onChange={(e) => setEditContractNumber(e.target.value)}
                              className={`w-full ${inputCompactClass}`}
                              placeholder="Číslo smlouvy"
                            />
                          </dd>
                        </div>
                      )}
                </dl>
              </div>
            </section>

            {showTimelineSection && (
              <section className={sectionPanelClass}>
                <h3 className={`mb-2.5 flex items-center gap-2 text-lg font-semibold ${monoHeadingClass}`}>
                  <span className={monoChipDarkClass}>
                    <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Timeline smlouvy</span>
                  </span>
                </h3>

                {timelineLoading && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Načítám historii změn…
                  </div>
                )}
                {timelineError && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {timelineError}
                  </div>
                )}

                {!timelineLoading && !timelineError && timelineRows.length > 0 && (
                  <div className="space-y-2">
                    {timelineRows.map((row) => {
                      const rowContent = (
                        <div
                          className={`rounded-xl border px-4 py-3 transition ${
                            row.isCurrent
                              ? "border-slate-900 bg-slate-100"
                              : "border-slate-200 bg-slate-50 hover:bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                Krok {row.step}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  row.label === "Dodatek"
                                    ? "border-sky-300 bg-sky-100 text-sky-800"
                                    : "border-slate-300 bg-slate-200 text-slate-800"
                                }`}
                              >
                                {row.label}
                              </span>
                              {row.isCurrent && (
                                <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                  Otevřeno
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatMoney(row.total)}
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
                            <p>
                              Počátek: <span className="font-semibold text-slate-800">{row.policyStartText}</span>
                            </p>
                            <p>
                              Sjednáno:{" "}
                              <span className="font-semibold text-slate-800">
                                {row.contractSignedText}
                              </span>
                            </p>
                            <p>
                              Pozice: <span className="font-semibold text-slate-800">{row.positionText}</span>
                            </p>
                            <p>
                              Režim: <span className="font-semibold text-slate-800">{row.modeText}</span>
                            </p>
                            <p>
                              Pojistné:{" "}
                              <span className="font-semibold text-slate-800">
                                {formatMoney(row.premiumAmount)}
                              </span>
                            </p>
                            {row.delta != null ? (
                              <p>
                                Změna:{" "}
                                <span
                                  className={`font-semibold ${
                                    row.delta >= 0 ? "text-emerald-700" : "text-rose-700"
                                  }`}
                                >
                                  {row.delta >= 0 ? "+" : "−"}
                                  {formatMoney(Math.abs(row.delta))}
                                </span>
                              </p>
                            ) : (
                              <p>
                                Datum kroku:{" "}
                                <span className="font-semibold text-slate-800">
                                  {row.orderDateText}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      );

                      if (row.href && !row.isCurrent) {
                        return (
                          <Link key={row.id} href={row.href} className="block">
                            {rowContent}
                          </Link>
                        );
                      }

                      return <div key={row.id}>{rowContent}</div>;
                    })}
                  </div>
                )}
              </section>
            )}

            <div className="space-y-5">
              <ContractCommissionSection
                product={prod}
                isOwnContract={isOwnContract}
                isPaymentBasedProduct={isPaymentBasedProduct}
                hideAnnualAutoTotals={hideSeparatedPeriodTotals}
                showAnyMeziprovision={showAnyMeziprovision}
                meziprovisionCards={meziprovisionCards}
                expandedMeziprovisionKeys={expandedMeziprovisionKeys}
                onToggleMeziprovisionCard={toggleMeziprovisionCard}
                adviserItems={adviserItems}
                commissionWarning={commissionWarning}
                commissionPayouts={contract?.commissionPayouts ?? []}
                viewerEmail={normalizedViewerEmail}
                contractOwnerEmail={contract?.userEmail ?? ownerEmail ?? null}
                contractDurationYears={contract?.durationYears ?? null}
                adviserBreakdownPosition={adviserBreakdownPosition}
                adviserBreakdownMode={adviserBreakdownMode}
                paymentBasedAdviserTotals={paymentBasedAdviserTotals}
                adviserTotalDisplay={adviserTotalDisplay}
                contractAuthorName={contractAuthorName}
                showAdvisorDetails={showAdvisorDetails}
                onToggleAdvisorDetails={() => setShowAdvisorDetails((v) => !v)}
                onOpenNeonImmediateBreakdown={handleOpenNeonImmediateBreakdown}
              />

              <ContractAutoPremiumHistory
                product={prod}
                contractNumber={contract?.contractNumber ?? null}
                policyStartDate={contract?.policyStartDate ?? null}
                signedAnnualPremium={signedAnnualPremium}
                statementInitialAnnualPremium={statementInitialAnnualPremium}
                preferStatementInitialPremium={preferStatementInitialPremium}
                systemAnnualPremium={premium * paymentsPerYear(freq)}
                paymentFrequency={freq}
                contractPaymentFrequency={freq}
                statements={commissionStatements}
                storedHistory={contract?.premiumStatementHistory ?? []}
                loading={commissionStatementsLoading}
                error={commissionStatementsError}
              />

              <ContractCommissionHistory
                product={contract?.productKey ?? null}
                payouts={contract?.commissionPayouts ?? []}
                viewerEmail={normalizedViewerEmail}
                contractOwnerEmail={contract?.userEmail ?? ownerEmail ?? null}
                onOpenStatement={handleOpenCommissionStatementPreview}
                statementPreviewLoadingId={statementPreviewLoadingId}
                onRebuildFromStatements={handleRebuildContractFromStatements}
                rebuildingFromStatements={rebuildingFromStatements}
                canRebuildFromStatements={Boolean(
                  canManageContract && contract?.contractNumber
                )}
              />

              {/* POZNÁMKA */}
              <section className={`${noteCardClass} space-y-3`}>
                <button
                  type="button"
                  aria-controls={noteContentId}
                  aria-expanded={noteExpanded}
                  onClick={() => setNoteExpanded((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={monoChipDarkClass}>
                      <StickyNote size={14} strokeWidth={2} aria-hidden="true" />
                      <span>Poznámka</span>
                    </span>
                    <div className="min-w-0">
                      <h3 className={`text-base font-semibold ${monoHeadingClass}`}>
                        Poznámka ke smlouvě
                      </h3>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                        {notePreviewText || "Bez poznámky"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {noteSaved && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        Uloženo
                      </span>
                    )}
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
                      <ChevronDown
                        size={16}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className={`transition-transform ${
                          noteExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </div>
                </button>

                {noteExpanded && (
                  <div id={noteContentId} className="space-y-2.5">
                    {noteError && (
                      <p className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {noteError}
                      </p>
                    )}

                    {canManageContract ? (
                      <>
                        <textarea
                          value={noteDraft}
                          onChange={(e) => {
                            setNoteDraft(e.target.value);
                            setNoteSaved(false);
                          }}
                          rows={4}
                          className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
                          placeholder="Sem si můžeš napsat poznámku jen pro sebe…"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveNote}
                            disabled={savingNote}
                            className="inline-flex items-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold font-mono tracking-tight text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingNote && (
                              <Spinner className="h-4 w-4 border-slate-400 border-t-slate-900" />
                            )}
                            <span>{savingNote ? "Ukládám…" : "Uložit poznámku"}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900">
                        {savedNoteText ||
                          "Autor smlouvy zatím žádnou poznámku nepřidal."}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

                {canOpenContractManagement && (
                  <section className="flex justify-end border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setStornoError(null);
                        setTransferError(null);
                        setShowManagementModal(true);
                      }}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-5 text-sm font-semibold font-mono tracking-tight text-white shadow-[0_12px_26px_rgba(15,23,42,0.2)] transition hover:bg-black"
                    >
                      <Settings2 size={17} strokeWidth={2.2} aria-hidden="true" />
                      <span>Správa smlouvy</span>
                    </button>
                  </section>
                )}
              </div>
              </>
            ) : null}
            </div>

          </div>
        </div>
      </div>

      <CommissionStatementPreviewModal
        statement={statementPreview}
        onClose={() => setStatementPreview(null)}
      />

      {neonImmediateBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
            aria-label="Zavřít rozpis okamžité provize"
            onClick={() => setNeonImmediateBreakdown(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rozpis okamžité provize"
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  Rozpis okamžité provize
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  ČPP ŽP NEON • {positionLabel(neonImmediateBreakdown.position)}
                </p>
                <p className="text-sm text-slate-600">
                  Režim:{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.includeB3601 ? "Zrychlený" : "Běžný"}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Koeficient (okamžitá):{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.totalCoefficient.toLocaleString("cs-CZ", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3,
                    })} %
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Koeficient (101A):{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.a101Coefficient.toLocaleString("cs-CZ", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4,
                    })} %
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Koeficient (B0301):{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.b0301Coefficient.toLocaleString("cs-CZ", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3,
                    })} %
                  </span>
                </p>
                {neonImmediateBreakdown.includeB3601 && (
                  <p className="text-sm text-slate-600">
                    Koeficient (50% z B3601):{" "}
                    <span className="font-semibold text-slate-800">
                      {neonImmediateBreakdown.b3601HalfCoefficient.toLocaleString("cs-CZ", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4,
                      })} %
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setNeonImmediateBreakdown(null)}
                className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {neonImmediateBreakdown.parts.map((part) => (
                <div
                  key={part.label}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="min-w-0 text-sm font-medium text-slate-800">
                    <span>{part.label}</span>
                    {part.label === "Provize B0301" && (
                      <span className="mt-1 block text-xs font-semibold text-red-600">
                        Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap pt-0.5 text-base font-semibold text-slate-900">
                    {formatMoney(part.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-900 bg-slate-900 px-3 py-2">
              <span className="text-sm font-semibold text-white">Celkem okamžitá provize</span>
              <span className="text-xl font-bold text-emerald-300">
                {formatMoney(neonImmediateBreakdown.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {canOpenContractManagement && showManagementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít správu smlouvy"
            onClick={() => setShowManagementModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-management-title"
            className="relative z-10 w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/30 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  <Settings2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  Akce smlouvy
                </div>
                <h3
                  id="contract-management-title"
                  className="mt-3 text-xl font-semibold tracking-tight text-slate-950"
                >
                  Správa smlouvy
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Vyber, co chceš s touto smlouvou provést.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManagementModal(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                aria-label="Zavřít správu smlouvy"
              >
                <X size={17} strokeWidth={2.3} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-2.5">
              {canSetStorno && (
                <button
                  type="button"
                  onClick={() => {
                    setStornoError(null);
                    setShowManagementModal(false);
                    setShowDeleteModal(false);
                    setShowStornoModal(true);
                  }}
                  disabled={updatingStorno}
                  className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-60"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
                    <AlertTriangle size={19} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-amber-950">
                      Storno
                    </span>
                    <span className="mt-0.5 block text-xs text-amber-800">
                      {isStornoContract
                        ? "Upravit datum nebo zrušit stávající storno."
                        : "Nastavit datum storna smlouvy."}
                    </span>
                  </span>
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setShowManagementModal(false);
                    setShowStornoModal(false);
                    setShowDeleteModal(true);
                  }}
                  disabled={deleting}
                  className="flex w-full items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-left transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-700">
                    <Trash2 size={19} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-rose-950">
                      Smazání smlouvy
                    </span>
                    <span className="mt-0.5 block text-xs text-rose-800">
                      Trvale odstranit smlouvu po dalším potvrzení.
                    </span>
                  </span>
                </button>
              )}

              {canRequestTransfer && (
                <button
                  type="button"
                  onClick={() => {
                    setTransferError(null);
                    setTransferTargetEmail("");
                    setTransferTargetQuery("");
                    setTransferTargetSearchOpen(false);
                    setTransferEffectiveDate(localIsoDay());
                    setShowManagementModal(false);
                    setShowTransferModal(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3.5 text-left transition hover:border-violet-300 hover:bg-violet-100"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-700">
                    <ArrowRightLeft size={19} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-violet-950">
                      Převod smlouvy
                    </span>
                    <span className="mt-0.5 block text-xs text-violet-800">
                      Odeslat administrátorovi žádost o změnu správce.
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {canRequestTransfer && showTransferModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít žádost o převod smlouvy"
            disabled={submittingTransfer}
            onClick={() => setShowTransferModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-transfer-detail-title"
            className="relative z-10 w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/30 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="contract-transfer-detail-title"
                  className="text-xl font-semibold tracking-tight text-slate-950"
                >
                  Převod smlouvy
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Žádost se odešle administrátorovi ke schválení.
                </p>
              </div>
              <button
                type="button"
                disabled={submittingTransfer}
                onClick={() => setShowTransferModal(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
                aria-label="Zavřít žádost o převod smlouvy"
              >
                <X size={17} strokeWidth={2.3} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-950">
              Novému správci budou od data účinnosti náležet dosud nevyplacené a budoucí provize. Již vyplacené provize zůstávají beze změny.
            </div>

            <div className="relative mt-5">
              <label
                htmlFor="contract-detail-transfer-target"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                Nový správce
              </label>
              <div className="relative">
                <Search
                  size={17}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="contract-detail-transfer-target"
                  type="search"
                  role="combobox"
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={transferTargetSearchOpen}
                  aria-controls="contract-detail-transfer-results"
                  value={transferTargetQuery}
                  disabled={submittingTransfer}
                  placeholder="Hledat podle jména nebo e-mailu"
                  onFocus={() => setTransferTargetSearchOpen(true)}
                  onBlur={() => setTransferTargetSearchOpen(false)}
                  onChange={(event) => {
                    setTransferTargetQuery(event.target.value);
                    setTransferTargetEmail("");
                    setTransferTargetSearchOpen(true);
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                />
              </div>
              {transferTargetSearchOpen && (
                <div
                  id="contract-detail-transfer-results"
                  role="listbox"
                  className="absolute inset-x-0 top-full z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.18)]"
                >
                  {matchingTransferTargets.length ? (
                    matchingTransferTargets.map((target) => {
                      const label = transferTargetLabel(target);
                      return (
                        <button
                          key={target.email}
                          type="button"
                          role="option"
                          aria-selected={target.email === transferTargetEmail}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setTransferTargetEmail(target.email);
                            setTransferTargetQuery(`${label} · ${target.email}`);
                            setTransferTargetSearchOpen(false);
                          }}
                          className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition hover:bg-violet-50"
                        >
                          <span className="text-sm font-semibold text-slate-950">{label}</span>
                          <span className="text-xs text-slate-500">{target.email}</span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-4 text-center text-sm text-slate-500">
                      Žádný poradce neodpovídá hledání.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              <label
                htmlFor="contract-detail-transfer-date"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                Datum účinnosti převodu
              </label>
              <input
                id="contract-detail-transfer-date"
                type="date"
                value={transferEffectiveDate}
                disabled={submittingTransfer}
                onChange={(event) => setTransferEffectiveDate(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
              />
            </div>

            {transferError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {transferError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                disabled={submittingTransfer}
                onClick={() => setShowTransferModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={
                  submittingTransfer ||
                  !transferTargetEmail ||
                  !transferEffectiveDate
                }
                onClick={() => void handleRequestTransfer()}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-700 bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingTransfer ? (
                  <Spinner className="h-4 w-4 border-violet-300 border-t-white" />
                ) : (
                  <ArrowRightLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                <span>{submittingTransfer ? "Odesílám…" : "Odeslat žádost"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showTerminationReasonModal &&
      showTerminationAction &&
      terminationInsurer &&
      terminationInsuranceType ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-slate-950/70 backdrop-blur-sm"
            aria-label="Zavřít výběr důvodu výpovědi"
            onClick={closeTerminationReasonModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="termination-reason-title"
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]"
          >
            <div className="relative overflow-hidden border-b border-violet-100 bg-[linear-gradient(130deg,#ffffff_0%,#faf7ff_55%,#eee7ff_100%)] px-6 py-6 sm:px-7">
              <span className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-300/25" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)]">
                    <FileSignature size={23} strokeWidth={2.1} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
                      Vytvořit výpověď
                    </p>
                    <h3
                      id="termination-reason-title"
                      className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950"
                    >
                      Z jakého důvodu smlouvu ukončujete?
                    </h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                      Podle produktu jsme automaticky rozpoznali pojišťovnu i typ
                      pojištění.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeTerminationReasonModal}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="Zavřít"
                >
                  <X size={18} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
              <div className="relative mt-4 flex flex-wrap gap-2 pl-0 sm:pl-16">
                <span className="rounded-full border border-violet-200 bg-white/90 px-3 py-1.5 text-xs font-black text-violet-800 shadow-sm">
                  {terminationInsurer}
                </span>
                <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">
                  {terminationInsuranceType === "life"
                    ? "Životní pojištění"
                    : "Neživotní pojištění"}
                </span>
              </div>
            </div>

            <div className="px-6 py-5 sm:px-7">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {terminationReasonOptions.map((option) => {
                  const selected = selectedTerminationReason === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedTerminationReason(option.id)}
                      className={`group flex min-h-[78px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-violet-500 bg-violet-50 shadow-[0_10px_24px_rgba(109,40,217,0.12)]"
                          : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"
                      }`}
                    >
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          selected
                            ? "bg-violet-700 text-white"
                            : "bg-slate-100 text-slate-500 group-hover:bg-violet-100 group-hover:text-violet-700"
                        }`}
                      >
                        <CalendarDays size={17} strokeWidth={2.1} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-bold leading-5 text-slate-800">
                        {option.label}
                      </span>
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-[5px] ${
                          selected
                            ? "border-violet-700 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeTerminationReasonModal}
                  disabled={terminationPrefillLoading}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  disabled={!selectedTerminationReason || terminationPrefillLoading}
                  onClick={() => {
                    if (selectedTerminationReason) {
                      void handleCreateTermination(selectedTerminationReason);
                    }
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(109,40,217,0.25)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {terminationPrefillLoading ? (
                    <>
                      <Spinner className="h-4 w-4 border-violet-200/70 border-t-white" />
                      Načítám údaje z PDF…
                    </>
                  ) : (
                    <>
                      Pokračovat do výpovědi
                      <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showUniqaTerminationModal ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-slate-950/70 backdrop-blur-sm"
            aria-label="Zavřít informace k online výpovědi UNIQA"
            onClick={closeUniqaTerminationModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="uniqa-termination-title"
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.38)]"
          >
            <div className="relative overflow-hidden border-b border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_48%,#e8f4ff_100%)] px-6 py-6 sm:px-7">
              <span className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-sky-300/25" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-white p-2 shadow-[0_12px_28px_rgba(2,132,199,0.16)]">
                    <Image
                      src="/icons/uniqa.png"
                      alt="UNIQA"
                      width={72}
                      height={40}
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">
                      UNIQA Auto
                    </p>
                    <h3
                      id="uniqa-termination-title"
                      className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950"
                    >
                      Výpověď vyřídíte online
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeUniqaTerminationModal}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="Zavřít"
                >
                  <X size={18} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-7">
              <p className="text-sm font-semibold leading-6 text-slate-700">
                Vypovězení smlouvy proveďte online na portálu UNIQA. Pro
                zahájení stačí zadat tyto tři údaje:
              </p>

              <div className="mt-4 space-y-2.5">
                {[
                  {
                    label: "Číslo smlouvy",
                    value: uniqaTerminationContractNumber,
                    emptyText: "Není uvedeno v detailu smlouvy",
                    loading: false,
                  },
                  {
                    label: uniqaTerminationPersonalIdLabel,
                    value: uniqaTerminationPersonalId,
                    emptyText: "Nepodařilo se načíst z PDF",
                    loading: uniqaTerminationPersonalIdLoading,
                  },
                  {
                    label: "RZ vozidla",
                    value: uniqaTerminationCarPlate,
                    emptyText: "Není uvedena v detailu smlouvy",
                    loading: false,
                  },
                ].map((item, index) => (
                    <div
                      key={item.label}
                      className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3"
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-xs font-black text-white shadow-sm">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          {item.label}
                        </p>
                        <p
                          className={`mt-0.5 break-all font-mono text-base font-black ${
                            item.value ? "text-slate-950" : "text-slate-500"
                          }`}
                        >
                          {item.loading ? (
                            <span className="inline-flex items-center gap-2 font-sans text-sm font-bold">
                              <Spinner className="h-4 w-4 border-sky-200 border-t-sky-700" />
                              Načítám z PDF…
                            </span>
                          ) : (
                            item.value || item.emptyText
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!item.value || item.loading}
                        onClick={() =>
                          copyContractActionValue(item.value, item.label)
                        }
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Kopírovat: ${item.label}`}
                      >
                        <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
                        <span className="hidden sm:inline">Kopírovat</span>
                      </button>
                    </div>
                  ))}
              </div>

              {uniqaTerminationPersonalIdError ? (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold leading-5 text-amber-950"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <p>{uniqaTerminationPersonalIdError}</p>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3.5">
                <p className="text-sm font-semibold leading-6 text-violet-950">
                  Výpověď lze podepsat potvrzením pomocí SMS bez fyzického
                  podpisu žádosti. Kód obdrží klient prostřednictvím SMS,
                  zároveň se zobrazí na obrazovce, takže proces můžete dokončit
                  bez další asistence klienta.
                </p>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeUniqaTerminationModal}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Zavřít
                </button>
                <a
                  href={UNIQA_ONLINE_TERMINATION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(3,105,161,0.24)] transition hover:bg-sky-800"
                >
                  Přejít na online výpověď
                  <ExternalLink size={16} strokeWidth={2.2} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {canSetStorno && showStornoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít potvrzení storna"
            onClick={() => {
              setStornoError(null);
              setShowStornoModal(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Potvrzení storna smlouvy"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-7 shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  {isStornoContract ? "Upravit storno smlouvy" : "Stornovat smlouvu?"}
                </h3>
                <p className="mt-1 text-base text-slate-700">
                  Zadej datum storna a potvrď akci.
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Datum storna si ověř v MAXXu nebo Extranetu u dané smlouvy.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStornoError(null);
                  setShowStornoModal(false);
                }}
                className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Datum storna
              </label>
              <input
                type="date"
                value={stornoDateInput}
                min={stornoMinimumDateInput ?? undefined}
                onChange={(e) => setStornoDateInput(e.target.value)}
                disabled={updatingStorno}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
              />
              {stornoMinimumDateInput ? (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Nejdříve možné datum: {formatDate(stornoMinimumDate)}
                </p>
              ) : null}
            </div>

            {stornoError && (
              <p className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {stornoError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              {isStornoContract && (
                <button
                  type="button"
                  onClick={() => void handleClearStorno()}
                  disabled={updatingStorno}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <RotateCcw size={15} strokeWidth={2.2} aria-hidden="true" />
                  Zrušit storno
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStornoError(null);
                  setShowStornoModal(false);
                }}
                className={ghostButtonClass}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSetStorno}
                disabled={updatingStorno}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(180,83,9,0.25)] transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
              >
                {updatingStorno && (
                  <Spinner className="h-5 w-5 border-amber-200/70 border-t-white" />
                )}
                <span>{isStornoContract ? "Uložit storno" : "Potvrdit storno"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showKooperativaStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít ověření stavu smlouvy"
            onClick={closeKooperativaStatusModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kooperativa-status-title"
            className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  <IdCard size={14} strokeWidth={2.2} aria-hidden="true" />
                  Kooperativa Auto
                </div>
                <h3
                  id="kooperativa-status-title"
                  className="mt-3 text-xl font-semibold tracking-tight text-slate-900"
                >
                  Ověření stavu smlouvy
                </h3>
              </div>
              <button
                type="button"
                onClick={closeKooperativaStatusModal}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950"
                aria-label="Zavřít ověření stavu smlouvy"
              >
                <X size={18} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Číslo smlouvy
                  </p>
                  <p className="mt-1 break-all font-mono text-base font-semibold text-slate-900">
                    {contract?.contractNumber?.trim() || "Není uvedeno"}
                  </p>
                </div>
                {contract?.contractNumber?.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      copyContractActionValue(contract.contractNumber, "Číslo smlouvy")
                    }
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    aria-label="Kopírovat číslo smlouvy"
                    title="Kopírovat číslo smlouvy"
                  >
                    <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    {kooperativaLegalEntity ? "IČO" : "Datum narození"}
                  </p>
                  <p className="mt-1 font-mono text-base font-semibold text-slate-900">
                    {kooperativaBirthNumberLoading
                      ? "Načítám..."
                      : kooperativaLegalEntity
                        ? kooperativaCompanyId ?? "Nepodařilo se načíst"
                        : kooperativaBirthDate ?? "Nepodařilo se určit"}
                  </p>
                </div>
                {(kooperativaLegalEntity ? kooperativaCompanyId : kooperativaBirthDate) && (
                  <button
                    type="button"
                    onClick={() =>
                      copyContractActionValue(
                        kooperativaLegalEntity ? kooperativaCompanyId : kooperativaBirthDate,
                        kooperativaLegalEntity ? "IČO" : "Datum narození"
                      )
                    }
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    aria-label={kooperativaLegalEntity ? "Kopírovat IČO" : "Kopírovat datum narození"}
                    title={kooperativaLegalEntity ? "Kopírovat IČO" : "Kopírovat datum narození"}
                  >
                    <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
              {kooperativaBirthNumberError && (
                <p className="text-sm text-rose-700">{kooperativaBirthNumberError}</p>
              )}
              {kooperativaPdfTemplateIssue && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <p>
                    Identifikátor se v PDF nepodařilo najít. Může jít o novou šablonu;
                    pro doplnění parseru předej originální PDF a číslo smlouvy.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <p>
                {kooperativaLegalEntity
                  ? "IČO dokážeme automaticky zobrazit pouze z originálního PDF smlouvy uloženého u této smlouvy."
                  : "Datum narození dokážeme automaticky zobrazit pouze z originálního PDF smlouvy uloženého u této smlouvy."}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-700" aria-live="polite">
                {kooperativaBirthNumberLoading
                  ? "Načítám údaje z originálního PDF..."
                  : kooperativaStatusRedirectError
                    ? kooperativaStatusRedirectError
                    : kooperativaStatusRedirected
                      ? "Kooperativa je otevřená v nové záložce."
                      : `Kooperativa se otevře za ${kooperativaStatusCountdown} s.`}
              </p>
              {!kooperativaBirthNumberLoading && (
                <a
                  href={KOOPERATIVA_CONTRACT_STATUS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>Otevřít nyní</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {showContractPdfModal && selectedContractPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít náhled smlouvy"
            onClick={closeContractPdfModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Náhled PDF smlouvy"
            className="relative z-10 flex h-[94vh] w-full max-w-[min(96vw,1680px)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  PDF smlouvy
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-600 sm:text-sm">
                  {selectedContractPdfFileName}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {contractPdfBlobUrl && (
                  <>
                    <a
                      href={contractPdfBlobUrl}
                      download={selectedContractPdfFileName}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      <Download size={15} strokeWidth={2.2} aria-hidden="true" />
                      <span>Stáhnout</span>
                    </a>
                    <a
                      href={contractPdfBlobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
                      <span>Otevřít v nové kartě</span>
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={closeContractPdfModal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Zavřít
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto bg-slate-100 px-2 py-3 sm:px-4">
              {contractPdfLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85">
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                    <Spinner className="h-4 w-4" />
                    <span>Načítám PDF smlouvy…</span>
                  </div>
                </div>
              )}

              {contractPdfError && (
                <div className="flex h-full items-center justify-center px-4">
                  <div className="max-w-lg rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-center text-sm text-rose-800">
                    {contractPdfError}
                  </div>
                </div>
              )}

              {!contractPdfError && contractPdfPages.length > 0 && (
                <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
                  {contractPdfPages.map((page, pageIndex) => (
                    <div
                      key={page.pageNumber}
                      className="relative mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]"
                      style={{ aspectRatio: `${page.width} / ${page.height}` }}
                    >
                      <canvas
                        ref={(node) => {
                          contractPdfCanvasRefs.current[pageIndex] = node;
                        }}
                        className="absolute inset-0 h-full w-full"
                        aria-label={`Stránka PDF smlouvy ${page.pageNumber}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!contractPdfLoading &&
                !contractPdfError &&
                contractPdfBlobUrl &&
                contractPdfPages.length === 0 && (
                  <div className="flex h-full items-center justify-center px-4">
                    <div className="max-w-lg rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center text-sm text-slate-700">
                      PDF se načetlo, ale nepodařilo se připravit stránky pro náhled.
                      Zkus ho otevřít v nové kartě.
                    </div>
                  </div>
              )}
            </div>
          </div>
        </div>
      )}

      {canDelete && showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít potvrzení mazání"
            onClick={() => setShowDeleteModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Potvrzení smazání smlouvy"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-7 shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  Opravdu smazat smlouvu?
                </h3>
                <p className="mt-1 text-base text-slate-700">
                  Akce je nevratná. Potvrď prosím kliknutím na tlačítko Smazat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            {deleteError && (
              <p className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className={ghostButtonClass}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-700 bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(190,24,93,0.28)] transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
              >
                {deleting && (
                  <Spinner className="h-5 w-5 border-rose-200/70 border-t-white" />
                )}
                <span>{deleting ? "Mažu…" : "Smazat"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
