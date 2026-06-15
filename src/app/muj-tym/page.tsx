"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  Check,
  Copy,
  LoaderCircle,
  Mail,
  MessageSquare,
  Network,
  Search,
  Trophy,
  UsersRound,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  formatMoney as formatMoneyValue,
  positionLabel,
} from "@/app/lib/formatters";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromPath,
} from "@/app/lib/institutionLogoDisplay";
import { type Position } from "@/app/types/domain";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import introStyles from "../cashflow/cashflowIntro.module.css";

type AccountType = "advisor" | "tipster";

type Member = {
  email: string;
  name: string;
  accountType?: AccountType | null;
  position?: Position | null;
  managerEmail?: string | null;
  tipRecipientEmail?: string | null;
  teamParentEmail?: string | null;
  agencyNumber?: string | null;
  docId?: string;
};

type PositionTimelineItem = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string;
};

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý uživatel";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  const cap = (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
  return parts.map(cap).join(" ");
}

const POSITION_OPTIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

const POSITION_SET = new Set<Position>(POSITION_OPTIONS.map((p) => p.id));
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const createTimelineRowId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
};

const hasInvalidRangeOrder = (validFrom: string, validTo: string): boolean => {
  if (!validFrom || !validTo) return false;
  if (!isIsoDay(validFrom) || !isIsoDay(validTo)) return false;
  return validTo < validFrom;
};

const parsePositionTimeline = (value: unknown): PositionTimelineItem[] => {
  if (!Array.isArray(value)) return [];
  const rows: PositionTimelineItem[] = [];

  value.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const position = row.position as Position;
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || "";

    if (!POSITION_SET.has(position)) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : createTimelineRowId(),
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo || "9999-12-31";
    const bTo = b.validTo || "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
};

type PositionTimelineResolvedRow = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};

const currentIsoDay = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
};

const resolvePositionTimelineMatch = (
  signedDateIso: string,
  timeline: PositionTimelineResolvedRow[]
): PositionTimelineResolvedRow | null => {
  if (!isIsoDay(signedDateIso) || timeline.length === 0) return null;

  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDateIso) return false;
    if (row.validTo && row.validTo < signedDateIso) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });
  return candidates[0] ?? null;
};

const resolveCurrentPositionFromTimeline = (
  timeline: PositionTimelineResolvedRow[]
): Position | null => {
  if (timeline.length === 0) return null;

  const match = resolvePositionTimelineMatch(currentIsoDay(), timeline);
  if (match) return match.position;

  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const row = timeline[i];
    if (!row.validTo) return row.position;
  }

  return timeline[timeline.length - 1]?.position ?? null;
};

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

const resolveMemberAccountType = (value: unknown): AccountType =>
  typeof value === "string" && value.trim().toLowerCase() === "tipster"
    ? "tipster"
    : "advisor";

const memberTeamParentEmail = (member: Member): string | null =>
  (member.teamParentEmail ?? member.managerEmail ?? "").trim().toLowerCase() || null;

const memberRoleLabel = (member: Member): string =>
  member.accountType === "tipster" ? "Tipař" : positionLabel(member.position);

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minut
const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 den

type Category =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "foreigners"
  | "comfort"
  | "other";
type ProductionCategory =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "foreigners"
  | "comfort";
type AggregateMetrics = { contracts: number; annualPremium: number; monthlyPremium: number };
type ContractStats = {
  total: number;
  month: number;
  previousMonth: number;
  monthMetrics: AggregateMetrics;
  previousMonthMetrics: AggregateMetrics;
  categories: Record<Category, number>;
  categoryMetrics: Record<Category, AggregateMetrics>;
  institutionMetrics: Record<string, AggregateMetrics>;
  institutionByCategory: Record<Category, Record<string, AggregateMetrics>>;
};
type TipStats = {
  total: number;
  month: number;
  previousMonth: number;
  contracted: number;
};
const PRODUCTION_CATEGORY_TABS: { key: ProductionCategory; label: string }[] = [
  { key: "life", label: "Životní pojištění" },
  { key: "auto", label: "Auta" },
  { key: "property", label: "Majetek" },
  { key: "comfort", label: "Zlato" },
  { key: "foreigners", label: "Cizinci" },
  { key: "travel", label: "Cestovko" },
];

function insurerLogoPath(insurer: string): string | null {
  const normalized = insurer.toLowerCase();
  if (normalized.includes("čpp") || normalized.includes("cpp")) return "/icons/cpp.png";
  if (normalized.includes("kooperativa")) return "/icons/koop-v2.png";
  if (normalized.includes("maxima")) return "/icons/maxima.png";
  if (normalized.includes("allianz")) return "/icons/allianz.png";
  if (normalized.includes("slavia")) return "/icons/slavialogo.png";
  if (normalized.includes("comfort") || normalized.includes("commodity")) {
    return "/icons/cclogo.png";
  }
  if (normalized.includes("uniqa")) return "/icons/uniqa.png";
  if (normalized.includes("čsob") || normalized.includes("csob")) return "/icons/csob.png";
  if (normalized.includes("pillow")) return "/icons/pillow.png";
  if (normalized.includes("generali")) return "/icons/generali.png";
  if (normalized.includes("metlife")) return "/icons/metlife.png";
  if (normalized.includes("nn")) return "/icons/nn.png";
  return null;
}

function formatMoney(value: number): string {
  return formatMoneyValue(value, { nonPositiveAsEmpty: true });
}

function formatMetricMoney(value: number): string {
  return formatMoney(value) || "0 Kč";
}

function emptyAggregateMetrics(): AggregateMetrics {
  return { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
}

function normalizeAggregateMetrics(value: Partial<AggregateMetrics> | null | undefined): AggregateMetrics {
  return {
    contracts: Number.isFinite(Number(value?.contracts)) ? Number(value?.contracts) : 0,
    annualPremium: Number.isFinite(Number(value?.annualPremium))
      ? Number(value?.annualPremium)
      : 0,
    monthlyPremium: Number.isFinite(Number(value?.monthlyPremium))
      ? Number(value?.monthlyPremium)
      : 0,
  };
}

function sumAggregateMetrics(values: Array<Partial<AggregateMetrics> | null | undefined>): AggregateMetrics {
  return values.reduce<AggregateMetrics>(
    (acc, value) => {
      const metrics = normalizeAggregateMetrics(value);
      return {
        contracts: acc.contracts + metrics.contracts,
        annualPremium: acc.annualPremium + metrics.annualPremium,
        monthlyPremium: acc.monthlyPremium + metrics.monthlyPremium,
      };
    },
    emptyAggregateMetrics()
  );
}

function monthTrendSummary(current: number, previous: number): {
  label: string;
  className: string;
} {
  if (previous <= 0 && current <= 0) {
    return {
      label: "beze změny vs minulý měsíc",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  if (previous <= 0) {
    return {
      label: `+${current} vs minulý měsíc`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  const prefix = diff > 0 ? "+" : "";
  if (diff === 0) {
    return {
      label: `0 % vs minulý měsíc`,
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  return {
    label: `${prefix}${diff} (${prefix}${pct} %) vs minulý měsíc`,
    className:
      diff > 0
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-rose-200 bg-rose-50 text-rose-700",
  };
}

const formatRelative = (ts: number | null | undefined): string => {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "právě teď";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "před chvílí";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  return `před ${days} dny`;
};

type TeamCachePayload = {
  members: Member[];
  lastActive: Record<string, number | null>;
  contractCounts: Record<string, ContractStats>;
  tipCounts: Record<string, TipStats>;
  contractsLoaded: boolean;
  contractsError: boolean;
  userPosition: Position | null;
  canManagePositions: boolean;
};

type TeamOverviewApiSuccess = {
  ok: true;
  position?: Position | null;
  canManagePositions?: boolean;
  members?: Array<{
    email?: string | null;
    name?: string | null;
    accountType?: AccountType | null;
    position?: Position | null;
    managerEmail?: string | null;
    tipRecipientEmail?: string | null;
    teamParentEmail?: string | null;
    agencyNumber?: string | null;
    docId?: string | null;
  }>;
  lastActive?: Record<string, number | null>;
  contractCounts?: Record<string, ContractStats>;
  tipCounts?: Record<string, TipStats>;
};

type TeamOverviewApiError = {
  ok: false;
  error?: string;
};

type TeamOverviewEndCollaborationSuccess = {
  ok: true;
  targetEmail: string;
  updated: Array<
    | "collaborationEnded"
    | "collaborationPreview"
    | "position"
    | "positionTimeline"
    | "agencyNumber"
    | "collaborationRequestQueued"
    | "collaborationRequestApproved"
    | "collaborationRequestRejected"
  >;
  summary?: {
    successorEmail?: string | null;
    transferredContracts?: number | null;
    reassignedSubordinates?: number | null;
  };
  request?: {
    id?: string | null;
    successorEmail?: string | null;
    transferableContracts?: number | null;
    directSubordinates?: number | null;
  };
  preview?: {
    successorEmail?: string | null;
    transferableContracts?: number | null;
    directSubordinates?: number | null;
    generatedAtMs?: number | null;
  };
};

type TeamOverviewPositionTimelineReadSuccess = {
  ok: true;
  targetEmail?: string;
  updated?: Array<"positionTimelineRead">;
  positionTimeline?: unknown;
};

type TeamOverviewUpdateSuccess = {
  ok: true;
  targetEmail: string;
  updated?: Array<"agencyNumber" | "position" | "positionTimeline">;
};

const TEAM_CACHE_TTL_MS = 60 * 1000;
const TEAM_MIN_LOADING_MS = 1800;
const teamDataCache: Record<string, { ts: number; payload: TeamCachePayload }> = {};

type SortKey = "activity" | "month" | "total" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "activity", label: "Nejaktivnější" },
  { key: "month", label: "Smlouvy tento měsíc" },
  { key: "total", label: "Celkem smluv" },
  { key: "name", label: "Jméno A-Z" },
];

const MEMBER_LIST_ESTIMATED_ROW_HEIGHT = 76;
const MEMBER_LIST_OVERSCAN = 6;
const AGENCY_NUMBER_MAX_LEN = 80;

function teamRevealStyle(delayMs: number): CSSProperties {
  return {
    ["--cf-delay" as string]: `${delayMs}ms`,
  };
}

export default function TeamPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(16);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState<Record<string, number | null>>({});
  const [contractCounts, setContractCounts] = useState<Record<string, ContractStats>>({});
  const [tipCounts, setTipCounts] = useState<Record<string, TipStats>>({});
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [userPosition, setUserPosition] = useState<Position | null>(null);
  const [canManagePositions, setCanManagePositions] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [productionCategory, setProductionCategory] = useState<ProductionCategory>("life");
  const [detailTab, setDetailTab] = useState<"overview" | "subordinates" | "career">("overview");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [careerTimelineDraft, setCareerTimelineDraft] = useState<PositionTimelineItem[]>([]);
  const [careerTimelineLoading, setCareerTimelineLoading] = useState(false);
  const [careerTimelineSaving, setCareerTimelineSaving] = useState(false);
  const [careerTimelineError, setCareerTimelineError] = useState<string | null>(null);
  const [careerTimelineSaved, setCareerTimelineSaved] = useState(false);
  const [careerTimelineEditing, setCareerTimelineEditing] = useState(false);
  const [agencyNumberDraft, setAgencyNumberDraft] = useState("");
  const [agencyNumberSaving, setAgencyNumberSaving] = useState(false);
  const [agencyNumberStatus, setAgencyNumberStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [endCollaborationModalOpen, setEndCollaborationModalOpen] = useState(false);
  const [endCollaborationConfirmEmail, setEndCollaborationConfirmEmail] = useState("");
  const [endCollaborationConfirmCascade, setEndCollaborationConfirmCascade] =
    useState(false);
  const [endCollaborationPreviewLoading, setEndCollaborationPreviewLoading] =
    useState(false);
  const [endCollaborationPreviewError, setEndCollaborationPreviewError] =
    useState<string | null>(null);
  const [endCollaborationPreview, setEndCollaborationPreview] = useState<{
    successorEmail: string;
    transferableContracts: number;
    directSubordinates: number;
    generatedAtMs: number;
  } | null>(null);
  const [endingCollaboration, setEndingCollaboration] = useState(false);
  const [endCollaborationError, setEndCollaborationError] = useState<string | null>(
    null
  );
  const [endCollaborationSuccess, setEndCollaborationSuccess] = useState<string | null>(
    null
  );
  const copyEmailTimerRef = useRef<number | null>(null);
  const careerSaveTimerRef = useRef<number | null>(null);
  const endCollaborationTimerRef = useRef<number | null>(null);
  const agencyNumberSelectedEmailRef = useRef<string | null>(null);
  const membersListRef = useRef<HTMLDivElement | null>(null);
  const [membersScrollTop, setMembersScrollTop] = useState(0);
  const [membersViewportHeight, setMembersViewportHeight] = useState(0);

  const cacheKey = useMemo(() => (userEmail ? `team:${userEmail}` : null), [userEmail]);
  const clampedLoadingProgress = Math.max(8, Math.min(97, loadingProgress));

  const applyCachedTeamState = (payload: TeamCachePayload) => {
    setMembers(payload.members);
    setLastActive(payload.lastActive);
    setContractCounts(payload.contractCounts);
    setTipCounts(payload.tipCounts ?? {});
    setContractsLoaded(payload.contractsLoaded);
    setContractsError(payload.contractsError);
    setUserPosition(payload.userPosition);
    setCanManagePositions(payload.canManagePositions);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u?.email) {
        setUserEmail(null);
        setAuthReady(true);
        return;
      }
      const em = u.email.toLowerCase();
      setUserEmail(em);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let finishLoadingTimer: number | null = null;

    const loadTeam = async () => {
      if (!authReady) return;
      if (!userEmail) {
	        setMembers([]);
	        setLastActive({});
	        setContractCounts({});
	        setTipCounts({});
	        setContractsLoaded(true);
        setContractsError(false);
        setUserPosition(null);
        setCanManagePositions(false);
        setLoading(false);
        return;
      }

      let pos: Position | null = null;
      let canManage = false;
      let lastActiveMap: Record<string, number | null> = {};
      let all: Member[] = [];
      let stats: Record<string, ContractStats> = {};
      let tipStats: Record<string, TipStats> = {};
      let nextContractsLoaded = true;
      let nextContractsError = false;
      const fallbackPayload = cacheKey ? teamDataCache[cacheKey]?.payload ?? null : null;

      if (cacheKey) {
        const cached = teamDataCache[cacheKey];
        if (cached && Date.now() - cached.ts < TEAM_CACHE_TTL_MS) {
          applyCachedTeamState(cached.payload);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      const loadingStartedAt = Date.now();
      setContractsLoaded(false);
      setContractsError(false);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Nejsi přihlášený.");
        }

        let bearerToken = await currentUser.getIdToken();
        const requestWithToken = async (token: string) =>
          fetch("/api/team-overview", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });

        let response = await requestWithToken(bearerToken);
        if (response.status === 401) {
          bearerToken = await currentUser.getIdToken(true);
          response = await requestWithToken(bearerToken);
        }

        const responseData = (await response.json()) as
          | TeamOverviewApiSuccess
          | TeamOverviewApiError;

        if (!response.ok) {
          const message =
            "error" in responseData && typeof responseData.error === "string"
              ? responseData.error
              : "Nepodařilo se načíst tým.";
          throw new Error(message);
        }
        if (responseData.ok === false) {
          throw new Error(responseData.error || "Nepodařilo se načíst tým.");
        }

        pos = responseData.position ?? null;
        canManage = responseData.canManagePositions === true;

        const rawMembers = Array.isArray(responseData.members)
          ? responseData.members
          : [];
        const membersByEmail = new Map<string, Member>();
        rawMembers.forEach((raw) => {
          const email = (raw.email ?? "").trim().toLowerCase();
          if (!email) return;
          const accountType = resolveMemberAccountType(raw.accountType);
          const managerEmail = (raw.managerEmail ?? "").trim().toLowerCase() || null;
          const tipRecipientEmail =
            (raw.tipRecipientEmail ?? "").trim().toLowerCase() || null;
          const teamParentEmail =
            (raw.teamParentEmail ?? "").trim().toLowerCase() ||
            (accountType === "tipster" ? tipRecipientEmail : managerEmail) ||
            null;
          const agencyNumber = (raw.agencyNumber ?? "").trim() || null;
          membersByEmail.set(email, {
            email,
            name: (raw.name ?? "").trim() || nameFromEmail(email),
            accountType,
            position: (raw.position as Position | null | undefined) ?? null,
            managerEmail,
            tipRecipientEmail,
            teamParentEmail,
            agencyNumber,
            docId: (raw.docId ?? "").trim() || email,
          });
        });

        if (!membersByEmail.has(userEmail)) {
          membersByEmail.set(userEmail, {
            email: userEmail,
            name: nameFromEmail(userEmail),
            accountType: "advisor",
            position: null,
            managerEmail: null,
            tipRecipientEmail: null,
            teamParentEmail: null,
            agencyNumber: null,
            docId: userEmail,
          });
        }

        all = Array.from(membersByEmail.values());
        all.sort((a, b) => {
          if (a.email === userEmail) return -1;
          if (b.email === userEmail) return 1;
          return a.name.localeCompare(b.name, "cs");
        });

        const rawLastActive =
          responseData.lastActive && typeof responseData.lastActive === "object"
            ? responseData.lastActive
            : {};
        lastActiveMap = {};
        all.forEach((member) => {
          const value = rawLastActive[member.email];
          lastActiveMap[member.email] =
            typeof value === "number" && Number.isFinite(value) ? value : null;
        });

        stats = responseData.contractCounts ?? {};
        tipStats = responseData.tipCounts ?? {};
        nextContractsLoaded = true;
        nextContractsError = false;

        setUserPosition(pos);
        setCanManagePositions(canManage);
        setMembers(all);
        setLastActive(lastActiveMap);
        setContractCounts(stats);
        setTipCounts(tipStats);
        setContractsLoaded(true);
        setContractsError(false);
        if (all.length) {
          setSelectedEmail((prev) => prev ?? all[0]?.email ?? null);
        }
      } catch (e) {
        console.error("Chyba při načítání týmu", e);
        if (fallbackPayload) {
          applyCachedTeamState(fallbackPayload);
          pos = fallbackPayload.userPosition;
          canManage = fallbackPayload.canManagePositions;
          all = fallbackPayload.members;
          lastActiveMap = fallbackPayload.lastActive;
          stats = fallbackPayload.contractCounts;
          tipStats = fallbackPayload.tipCounts ?? {};
          nextContractsLoaded = fallbackPayload.contractsLoaded;
          nextContractsError = fallbackPayload.contractsError;
        } else {
          setMembers([]);
          setLastActive({});
          setContractCounts({});
          setTipCounts({});
          setContractsLoaded(true);
          setContractsError(true);
          setUserPosition(null);
          setCanManagePositions(false);
          nextContractsLoaded = true;
          nextContractsError = true;
        }
      } finally {
        if (cacheKey) {
          teamDataCache[cacheKey] = {
            ts: Date.now(),
            payload: {
	              members: all,
	              lastActive: lastActiveMap,
	              contractCounts: stats,
	              tipCounts: tipStats,
	              contractsLoaded: nextContractsLoaded,
              contractsError: nextContractsError,
              userPosition: pos,
              canManagePositions: canManage,
            },
          };
        }
        const elapsed = Date.now() - loadingStartedAt;
        const remaining = Math.max(0, TEAM_MIN_LOADING_MS - elapsed);
        if (remaining > 0) {
          finishLoadingTimer = window.setTimeout(() => {
            if (cancelled) return;
            setLoading(false);
          }, remaining);
          return;
        }
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTeam();
    return () => {
      cancelled = true;
      if (finishLoadingTimer != null) {
        window.clearTimeout(finishLoadingTimer);
      }
    };
    // only depends on signed-in user; selection should not retrigger fetch
  }, [authReady, userEmail, cacheKey, refreshNonce]);

  useEffect(() => {
    if (!loading) {
      const resetFrame = window.requestAnimationFrame(() => setLoadingProgress(16));
      return () => window.cancelAnimationFrame(resetFrame);
    }

    const startedAt = performance.now();
    let frame = 0;

    const animate = () => {
      const elapsed = performance.now() - startedAt;
      const phase = Math.min(1, elapsed / 3400);
      const eased = 1 - Math.pow(1 - phase, 2.1);
      const target = Math.round(16 + eased * 80);
      setLoadingProgress((prev) => (target > prev ? target : prev));
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();

    const base = members.filter((m) => {
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.email.toLowerCase().includes(term) ||
        (m.agencyNumber ?? "").toLowerCase().includes(term) ||
        memberRoleLabel(m).toLowerCase().includes(term)
      );
    });

    const toActivityRank = (email: string) => {
      const ts = lastActive[email];
      if (!ts) return Number.NEGATIVE_INFINITY;
      return ts;
    };
    const metricValue = (member: Member, key: "month" | "total") => {
      if (member.accountType === "tipster") {
        return key === "month"
          ? tipCounts[member.email]?.month ?? 0
          : tipCounts[member.email]?.total ?? 0;
      }
      return key === "month"
        ? contractCounts[member.email]?.month ?? 0
        : contractCounts[member.email]?.total ?? 0;
    };

    return base.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "cs");
      if (sortBy === "month") {
        const aVal = metricValue(a, "month");
        const bVal = metricValue(b, "month");
        if (aVal !== bVal) return bVal - aVal;
      }
      if (sortBy === "total") {
        const aVal = metricValue(a, "total");
        const bVal = metricValue(b, "total");
        if (aVal !== bVal) return bVal - aVal;
      }
      // default i fallback: nejaktivnější první
      const actDiff = toActivityRank(b.email) - toActivityRank(a.email);
      if (actDiff !== 0) return actDiff;
      return a.name.localeCompare(b.name, "cs");
    });
  }, [members, search, sortBy, lastActive, contractCounts, tipCounts]);

  const loadingStage =
    clampedLoadingProgress < 34
      ? "Stahuju členy týmu z organizační struktury…"
      : clampedLoadingProgress < 68
        ? "Mapuju aktivitu a páruju data smluv…"
        : "Finalizuji produkční statistiky a přehledy…";
  const loadingPhaseIndex =
    clampedLoadingProgress < 34 ? 0 : clampedLoadingProgress < 68 ? 1 : 2;
  const loadingPhaseItems = [
    {
      label: "Členové",
      caption: "Organizační struktura",
      Icon: UsersRound,
    },
    {
      label: "Aktivita",
      caption: "Poslední přihlášení",
      Icon: Network,
    },
    {
      label: "Statistiky",
      caption: "Produkční přehled",
      Icon: BarChart3,
    },
  ];
  const loadingStatusItems = [
    ["Profil manažera", "ověřeno"],
    ["Týmová struktura", loadingPhaseIndex > 0 ? "hotovo" : "běží"],
    ["Produkce a tipy", loadingPhaseIndex >= 2 ? "běží" : "čeká"],
  ];

  useEffect(() => {
    const el = membersListRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const syncNow = () => {
      setMembersScrollTop(el.scrollTop);
      setMembersViewportHeight(el.clientHeight);
    };
    const onScroll = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setMembersScrollTop(el.scrollTop);
      });
    };

    syncNow();
    el.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            setMembersViewportHeight(el.clientHeight);
          })
        : null;
    resizeObserver?.observe(el);

    const onWindowResize = () => {
      setMembersViewportHeight(el.clientHeight);
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
      el.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [filteredMembers.length]);

  const virtualizedMembers = useMemo(() => {
    const total = filteredMembers.length;
    const enabled = total > 60 && membersViewportHeight > 0;

    if (!enabled) {
      return {
        enabled: false,
        topPadding: 0,
        bottomPadding: 0,
        items: filteredMembers,
      };
    }

    const startIndex = Math.max(
      0,
      Math.floor(membersScrollTop / MEMBER_LIST_ESTIMATED_ROW_HEIGHT) -
        MEMBER_LIST_OVERSCAN
    );
    const endIndex = Math.min(
      total - 1,
      Math.ceil(
        (membersScrollTop + membersViewportHeight) /
          MEMBER_LIST_ESTIMATED_ROW_HEIGHT
      ) + MEMBER_LIST_OVERSCAN
    );

    const topPadding = startIndex * MEMBER_LIST_ESTIMATED_ROW_HEIGHT;
    const bottomPadding = Math.max(
      0,
      (total - endIndex - 1) * MEMBER_LIST_ESTIMATED_ROW_HEIGHT
    );

    return {
      enabled: true,
      topPadding,
      bottomPadding,
      items: filteredMembers.slice(startIndex, endIndex + 1),
    };
  }, [
    filteredMembers,
    membersScrollTop,
    membersViewportHeight,
  ]);

  useEffect(() => {
    if (!filteredMembers.length) {
      setSelectedEmail(null);
      return;
    }
    setSelectedEmail((prev) => (prev && filteredMembers.some((m) => m.email === prev) ? prev : filteredMembers[0].email));
  }, [filteredMembers]);

  useEffect(() => {
    setDetailTab("overview");
    setCareerTimelineDraft([]);
    setCareerTimelineError(null);
    setCareerTimelineSaved(false);
    setCareerTimelineEditing(false);
    setEndCollaborationModalOpen(false);
    setEndCollaborationConfirmEmail("");
    setEndCollaborationConfirmCascade(false);
    setEndCollaborationPreview(null);
    setEndCollaborationPreviewLoading(false);
    setEndCollaborationPreviewError(null);
    setEndCollaborationError(null);
    setEndCollaborationSuccess(null);
  }, [selectedEmail]);

  useEffect(() => {
    if (detailTab !== "career") {
      setCareerTimelineEditing(false);
    }
  }, [detailTab]);

  useEffect(() => {
    return () => {
      if (copyEmailTimerRef.current) window.clearTimeout(copyEmailTimerRef.current);
      if (careerSaveTimerRef.current) window.clearTimeout(careerSaveTimerRef.current);
      if (endCollaborationTimerRef.current) {
        window.clearTimeout(endCollaborationTimerRef.current);
      }
    };
  }, []);

  const selected = members.find((m) => m.email === selectedEmail) ?? null;
  const selectedAgencyNumber = selected?.agencyNumber?.trim() ?? "";
  const selectedIsTipster = selected?.accountType === "tipster";
  const selectedContractStats = selected ? contractCounts[selected.email] ?? null : null;
  const selectedTipStats = selected ? tipCounts[selected.email] ?? null : null;
  const showMonthlyPremiumInProduction = productionCategory === "life";
  const productionGridColsClass = showMonthlyPremiumInProduction
    ? "sm:grid-cols-[minmax(180px,1fr)_110px_150px_150px]"
    : "sm:grid-cols-[minmax(180px,1fr)_110px_150px]";
  const selectedProductionRows = useMemo(() => {
    if (!selected) return [] as { name: string; contracts: number; annualPremium: number; monthlyPremium: number }[];
    const stats = selectedContractStats;
    const raw = stats?.institutionByCategory?.[productionCategory] ?? {};
    return Object.entries(raw)
      .map(([name, row]) => ({
        name,
        contracts: row?.contracts ?? 0,
        annualPremium: row?.annualPremium ?? 0,
        monthlyPremium: row?.monthlyPremium ?? (row?.annualPremium ?? 0) / 12,
      }))
      .filter((row) => row.contracts > 0 || row.annualPremium > 0 || row.monthlyPremium > 0)
      .sort((a, b) => b.annualPremium - a.annualPremium || b.contracts - a.contracts || a.name.localeCompare(b.name, "cs"));
	  }, [selected, productionCategory, selectedContractStats]);
  const selectedProductionTotals = useMemo(
    () =>
      selectedProductionRows.reduce(
        (acc, row) => ({
          contracts: acc.contracts + row.contracts,
          annualPremium: acc.annualPremium + row.annualPremium,
          monthlyPremium: acc.monthlyPremium + row.monthlyPremium,
        }),
        { contracts: 0, annualPremium: 0, monthlyPremium: 0 }
      ),
    [selectedProductionRows]
  );
  const selectedTotalProduction = useMemo(
    () =>
      selectedContractStats
        ? sumAggregateMetrics(Object.values(selectedContractStats.categoryMetrics ?? {}))
        : emptyAggregateMetrics(),
    [selectedContractStats]
  );
  const selectedMonthMetrics = normalizeAggregateMetrics(selectedContractStats?.monthMetrics);
  const productionBoxTitle = selectedIsTipster ? "Sjednané smlouvy z tipů" : "Produkce";
  const emptyProductionMessage = selectedIsTipster
    ? "V této kategorii zatím nejsou sjednané smlouvy z tipů."
    : "V této kategorii zatím nejsou smlouvy.";
  const subordinatesOfSelected = useMemo(() => {
    if (!selected) {
      return [] as Array<Member & { depth: number; managerName: string | null }>;
    }

    const selectedEmailKey = selected.email.toLowerCase();
    const membersByEmail = new Map<string, Member>();
    const childrenByManager = new Map<string, Member[]>();

    members.forEach((member) => {
      const emailKey = member.email.toLowerCase();
      if (!membersByEmail.has(emailKey)) {
        membersByEmail.set(emailKey, member);
      }

      const managerKey = memberTeamParentEmail(member);
      if (!managerKey) return;
      const existing = childrenByManager.get(managerKey) ?? [];
      existing.push(member);
      childrenByManager.set(managerKey, existing);
    });
    membersByEmail.set(selectedEmailKey, selected);

    const queue: Array<{ email: string; depth: number }> = [
      { email: selectedEmailKey, depth: 0 },
    ];
    const visited = new Set<string>([selectedEmailKey]);
    const allSubordinates: Array<Member & { depth: number; managerName: string | null }> = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      const children = [...(childrenByManager.get(current.email) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "cs")
      );

      children.forEach((child) => {
        const childEmailKey = child.email.toLowerCase();
        if (visited.has(childEmailKey)) return;
        visited.add(childEmailKey);

        const managerKey = memberTeamParentEmail(child);
        const managerFromMap = managerKey ? membersByEmail.get(managerKey) : null;
        const managerName = managerKey
          ? managerFromMap?.name ?? nameFromEmail(managerKey)
          : null;

        allSubordinates.push({
          ...child,
          depth: current.depth + 1,
          managerName,
        });

        queue.push({
          email: childEmailKey,
          depth: current.depth + 1,
        });
      });
    }

    return allSubordinates;
  }, [selected, members]);
  const selectedMonthCount = selectedIsTipster
    ? selectedTipStats?.month ?? 0
    : selectedContractStats?.month ?? 0;
  const selectedPreviousMonthCount = selectedIsTipster
    ? selectedTipStats?.previousMonth ?? 0
    : selectedContractStats?.previousMonth ?? 0;
  const selectedMonthTrend = monthTrendSummary(
    selectedMonthCount,
    selectedPreviousMonthCount
  );
  const selectedStatsUnavailable =
    contractsError ||
    (!contractsLoaded &&
      Object.keys(contractCounts).length === 0 &&
      Object.keys(tipCounts).length === 0);
  const isSelectedSubordinate = useMemo(
    () => !!selected?.email && !!userEmail && selected.email.toLowerCase() !== userEmail.toLowerCase(),
    [selected, userEmail]
  );
  const canEditSelectedCareer =
    isSelectedSubordinate && selected?.accountType !== "tipster";
  const canFillSelectedAgencyNumber = isSelectedSubordinate && !selectedAgencyNumber;
  const canEndSelectedCollaboration =
    canManagePositions &&
    isSelectedSubordinate &&
    selected?.accountType !== "tipster" &&
    Boolean((selected?.managerEmail ?? "").trim());

  useEffect(() => {
    const currentSelectedEmail = selected?.email ?? null;
    if (agencyNumberSelectedEmailRef.current === currentSelectedEmail) return;
    agencyNumberSelectedEmailRef.current = currentSelectedEmail;
    setAgencyNumberDraft(selectedAgencyNumber);
    setAgencyNumberStatus(null);
    setAgencyNumberSaving(false);
  }, [selected?.email, selectedAgencyNumber]);

  useEffect(() => {
    const loadSelectedCareerTimeline = async () => {
      if (!selected) {
        setCareerTimelineDraft([]);
        setCareerTimelineLoading(false);
        return;
      }

      setCareerTimelineLoading(true);
      setCareerTimelineError(null);

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Nejsi přihlášený.");
        const payload =
          await fetchAuthedJsonOrThrow<TeamOverviewPositionTimelineReadSuccess>(
            currentUser,
            `/api/team-overview?action=positionTimelineRead&targetEmail=${encodeURIComponent(selected.email)}`
          );
        setCareerTimelineDraft(parsePositionTimeline(payload.positionTimeline));
      } catch (error) {
        console.error("Chyba při načítání kariéry člena týmu přes API:", error);
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message.trim()
            : "Nepodařilo se načíst kariéru vybraného člena.";
        setCareerTimelineError(message);
        setCareerTimelineDraft([]);
      } finally {
        setCareerTimelineLoading(false);
      }
    };

    void loadSelectedCareerTimeline();
  }, [selected]);

  const handleCopySelectedEmail = async () => {
    if (!selected?.email) return;
    try {
      await navigator.clipboard.writeText(selected.email);
      setCopiedEmail(true);
      if (copyEmailTimerRef.current) window.clearTimeout(copyEmailTimerRef.current);
      copyEmailTimerRef.current = window.setTimeout(() => setCopiedEmail(false), 1500);
    } catch {
      // clipboard může být blokovaný browserem
    }
  };

  const formatLastActive = (email: string): string => {
    const ts = lastActive[email];
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return d.toLocaleString("cs-CZ");
    } catch {
      return "—";
    }
  };

  const lastActiveBadge = (email: string) => {
    const ts = lastActive[email];
    const now = Date.now();
    if (!ts) {
      return {
        statusLabel: "Aktivní před delší dobou",
        className: "bg-white text-slate-600 border-slate-300",
        dotClassName: "bg-slate-400",
        title: "Bez záznamu o aktivitě",
      };
    }
    const diff = now - ts;
    if (diff <= ONLINE_THRESHOLD_MS) {
      return {
        statusLabel: "Online",
        className: "bg-violet-50 text-violet-700 border-violet-300",
        dotClassName: "bg-violet-500",
        title: `Aktivní ${new Date(ts).toLocaleString("cs-CZ")}`,
      };
    }
    if (diff <= RECENT_THRESHOLD_MS) {
      return {
        statusLabel: `Aktivní ${formatRelative(ts)}`,
        className: "bg-purple-50 text-purple-700 border-purple-300",
        dotClassName: "bg-purple-500",
        title: `Naposledy ${new Date(ts).toLocaleString("cs-CZ")}`,
      };
    }
    return {
      statusLabel: `Aktivní ${formatRelative(ts)}`,
      className: "bg-white text-slate-600 border-slate-300",
      dotClassName: "bg-slate-400",
      title: `Naposledy ${new Date(ts).toLocaleString("cs-CZ")}`,
    };
  };

  const contractCountLabel = (email: string, key: "total" | "month") => {
    if (contractsError) return "—";
    if (!contractsLoaded && Object.keys(contractCounts).length === 0) return "—";
    const stats = contractCounts[email];
    const value = key === "total" ? stats?.total : stats?.month;
    return value != null ? String(value) : "0";
  };

  const tipCountLabel = (email: string, key: "total" | "month" | "contracted") => {
    if (contractsError) return "—";
    if (!contractsLoaded && Object.keys(tipCounts).length === 0) return "—";
    const stats = tipCounts[email];
    const value =
      key === "total"
        ? stats?.total
        : key === "month"
          ? stats?.month
          : stats?.contracted;
    return value != null ? String(value) : "0";
  };

  const hasTeamListMembers = members.some(
    (member) => !userEmail || member.email.toLowerCase() !== userEmail.toLowerCase()
  );
  const showManagerTeamTools = isManagerPosition(userPosition);
  const canSendTeamMessage = showManagerTeamTools && hasTeamListMembers;
  const showTeamSidebar = showManagerTeamTools || hasTeamListMembers;
  const teamListTitle = showManagerTeamTools ? "Podřízení" : "Tipaři";

  const saveSelectedAgencyNumber = async () => {
    if (!selected) return;
    if (!canFillSelectedAgencyNumber) {
      setAgencyNumberStatus({
        type: "error",
        message: "Agenturní číslo lze tady doplnit jen podřízenému, který ho ještě nemá.",
      });
      return;
    }

    const nextAgencyNumber = agencyNumberDraft.trim();
    if (!nextAgencyNumber) {
      setAgencyNumberStatus({
        type: "error",
        message: "Vyplň agenturní číslo.",
      });
      return;
    }
    if (nextAgencyNumber.length > AGENCY_NUMBER_MAX_LEN) {
      setAgencyNumberStatus({
        type: "error",
        message: `Agenturní číslo může mít maximálně ${AGENCY_NUMBER_MAX_LEN} znaků.`,
      });
      return;
    }

    setAgencyNumberSaving(true);
    setAgencyNumberStatus(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Nejsi přihlášený.");

      await fetchAuthedJsonOrThrow<TeamOverviewUpdateSuccess>(
        currentUser,
        "/api/team-overview",
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "update",
            targetEmail: selected.email,
            agencyNumber: nextAgencyNumber,
          }),
        }
      );

      setMembers((prev) =>
        prev.map((member) =>
          member.email === selected.email
            ? {
                ...member,
                agencyNumber: nextAgencyNumber,
              }
            : member
        )
      );
      if (cacheKey && teamDataCache[cacheKey]) {
        teamDataCache[cacheKey] = {
          ...teamDataCache[cacheKey],
          payload: {
            ...teamDataCache[cacheKey].payload,
            members: teamDataCache[cacheKey].payload.members.map((member) =>
              member.email === selected.email
                ? {
                    ...member,
                    agencyNumber: nextAgencyNumber,
                  }
                : member
            ),
          },
        };
      }
      setAgencyNumberDraft(nextAgencyNumber);
      setAgencyNumberStatus({
        type: "success",
        message: "Agenturní číslo bylo uloženo.",
      });
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.trim()) {
        setAgencyNumberStatus({ type: "error", message: e.message.trim() });
      } else {
        console.error("Chyba při ukládání agenturního čísla:", e);
        setAgencyNumberStatus({
          type: "error",
          message: "Agenturní číslo se nepodařilo uložit.",
        });
      }
    } finally {
      setAgencyNumberSaving(false);
    }
  };

  const loadEndCollaborationPreview = async (member: Member) => {
    setEndCollaborationPreviewLoading(true);
    setEndCollaborationPreviewError(null);
    setEndCollaborationPreview(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Nejsi přihlášený.");

      const payload = await fetchAuthedJsonOrThrow<TeamOverviewEndCollaborationSuccess>(
        currentUser,
        "/api/team-overview",
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "endCollaborationPreview",
            targetEmail: member.email,
            expectedManagerEmail: member.managerEmail ?? null,
          }),
        }
      );

      const preview = payload.preview;
      const successorEmail = (preview?.successorEmail ?? member.managerEmail ?? "")
        .trim()
        .toLowerCase();
      const transferableContracts = Number(preview?.transferableContracts ?? NaN);
      const directSubordinates = Number(preview?.directSubordinates ?? NaN);
      const generatedAtMs = Number(preview?.generatedAtMs ?? Date.now());

      if (
        !successorEmail ||
        !Number.isFinite(transferableContracts) ||
        !Number.isFinite(directSubordinates)
      ) {
        throw new Error("Nepodařilo se načíst přesný náhled převodu.");
      }

      setEndCollaborationPreview({
        successorEmail,
        transferableContracts,
        directSubordinates,
        generatedAtMs: Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now(),
      });
    } catch (e: any) {
      if (e?.status === 409) {
        setEndCollaborationPreviewError(
          "Struktura týmu se změnila. Obnov stránku a načti náhled znovu."
        );
      } else if (typeof e?.message === "string" && e.message.trim()) {
        setEndCollaborationPreviewError(e.message.trim());
      } else {
        setEndCollaborationPreviewError(
          "Nepodařilo se načíst přesný náhled převodu. Zkus to prosím znovu."
        );
      }
    } finally {
      setEndCollaborationPreviewLoading(false);
    }
  };

  const openEndCollaborationModal = () => {
    if (!selected || !canEndSelectedCollaboration) return;
    setEndCollaborationError(null);
    setEndCollaborationConfirmEmail("");
    setEndCollaborationConfirmCascade(false);
    setEndCollaborationPreview(null);
    setEndCollaborationPreviewError(null);
    setEndCollaborationModalOpen(true);
    void loadEndCollaborationPreview(selected);
  };

  const closeEndCollaborationModal = () => {
    if (endingCollaboration) return;
    setEndCollaborationModalOpen(false);
    setEndCollaborationError(null);
    setEndCollaborationPreviewError(null);
  };

  const confirmEndCollaboration = async () => {
    if (!selected || !canEndSelectedCollaboration) return;

    const selectedEmailNormalized = selected.email.trim().toLowerCase();
    const confirmNormalized = endCollaborationConfirmEmail.trim().toLowerCase();

    if (confirmNormalized !== selectedEmailNormalized) {
      setEndCollaborationError("Pro potvrzení opiš přesně e-mail podřízeného.");
      return;
    }
    if (!endCollaborationConfirmCascade) {
      setEndCollaborationError("Potvrď převod podřízených i smluv.");
      return;
    }
    if (!endCollaborationPreview) {
      setEndCollaborationError("Nejdřív načti přesný náhled převodu z backendu.");
      return;
    }

    setEndingCollaboration(true);
    setEndCollaborationError(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Nejsi přihlášený.");

      const payload = await fetchAuthedJsonOrThrow<TeamOverviewEndCollaborationSuccess>(
        currentUser,
        "/api/team-overview",
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "endCollaboration",
            targetEmail: selected.email,
            confirmEmail: endCollaborationConfirmEmail,
            confirmCascade: true,
            expectedManagerEmail: endCollaborationPreview.successorEmail ?? null,
          }),
        }
      );

      const queuedSuccessorEmail =
        (payload.request?.successorEmail ?? selected.managerEmail ?? "").trim().toLowerCase();
      const queuedContracts = Number(payload.request?.transferableContracts ?? 0);
      const queuedSubordinates = Number(payload.request?.directSubordinates ?? 0);
      const successMessage = `Žádost o ukončení spolupráce byla odeslána ke schválení (${queuedContracts} smluv, ${queuedSubordinates} podřízených, převod na ${queuedSuccessorEmail || "nadřízeného"}).`;
      setEndCollaborationSuccess(successMessage);
      setEndCollaborationModalOpen(false);
      setEndCollaborationConfirmEmail("");
      setEndCollaborationConfirmCascade(false);

      if (cacheKey) {
        delete teamDataCache[cacheKey];
      }
      setRefreshNonce((prev) => prev + 1);

      if (endCollaborationTimerRef.current) {
        window.clearTimeout(endCollaborationTimerRef.current);
      }
      endCollaborationTimerRef.current = window.setTimeout(() => {
        setEndCollaborationSuccess(null);
      }, 5000);
    } catch (e: any) {
      if (e?.status === 409) {
        setEndCollaborationError(
          "Struktura týmu se změnila. Obnov stránku a akci zopakuj."
        );
      } else if (typeof e?.message === "string" && e.message.trim()) {
        setEndCollaborationError(e.message.trim());
      } else {
        setEndCollaborationError("Ukončení spolupráce se nepovedlo. Zkus to prosím znovu.");
      }
    } finally {
      setEndingCollaboration(false);
    }
  };

  const addCareerTimelineRow = () => {
    if (!selected || !careerTimelineEditing) return;
    setCareerTimelineError(null);
    setCareerTimelineSaved(false);
    setCareerTimelineDraft((prev) => [
      ...prev,
      {
        id: createTimelineRowId(),
        position: selected.position ?? "poradce1",
        validFrom: "",
        validTo: "",
      },
    ]);
  };

  const updateCareerTimelineRow = (
    rowId: string,
    patch: Partial<PositionTimelineItem>
  ) => {
    if (!careerTimelineEditing) return;
    setCareerTimelineError(null);
    setCareerTimelineSaved(false);
    setCareerTimelineDraft((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };

  const removeCareerTimelineRow = (rowId: string) => {
    if (!careerTimelineEditing) return;
    setCareerTimelineError(null);
    setCareerTimelineSaved(false);
    setCareerTimelineDraft((prev) => prev.filter((row) => row.id !== rowId));
  };

  const saveCareerTimeline = async () => {
    if (!selected) return;
    if (!canEditSelectedCareer) {
      setCareerTimelineError("Nemáš oprávnění upravovat kariéru tohoto uživatele.");
      return;
    }
    if (!careerTimelineEditing) {
      return;
    }

    setCareerTimelineSaving(true);
    setCareerTimelineError(null);
    setCareerTimelineSaved(false);

    try {
      const normalized = careerTimelineDraft
        .map((row) => ({
          ...row,
          validFrom: row.validFrom.trim(),
          validTo: row.validTo.trim(),
        }))
        .filter(
          (row) =>
            row.position ||
            row.validFrom.length > 0 ||
            row.validTo.length > 0
        );

      for (let i = 0; i < normalized.length; i += 1) {
        const row = normalized[i];
        const rowNo = i + 1;
        if (!POSITION_SET.has(row.position)) {
          setCareerTimelineError(`Řádek ${rowNo}: vyber platnou pozici v timeline.`);
          return;
        }
        if (!row.validFrom) {
          setCareerTimelineError(`Řádek ${rowNo}: vyplň datum OD.`);
          return;
        }
        if (!isIsoDay(row.validFrom)) {
          setCareerTimelineError(`Řádek ${rowNo}: datum OD musí být platné.`);
          return;
        }
        if (row.validTo && !isIsoDay(row.validTo)) {
          setCareerTimelineError(`Řádek ${rowNo}: datum DO musí být platné.`);
          return;
        }
        if (hasInvalidRangeOrder(row.validFrom, row.validTo)) {
          setCareerTimelineError(`Řádek ${rowNo}: datum DO nemůže být dřív než datum OD.`);
          return;
        }
      }

      const sorted = [...normalized].sort((a, b) => {
        if (a.validFrom !== b.validFrom) {
          return a.validFrom.localeCompare(b.validFrom);
        }
        const aTo = a.validTo || "9999-12-31";
        const bTo = b.validTo || "9999-12-31";
        return aTo.localeCompare(bTo);
      });

      const openEndedIndexes = sorted
        .map((row, index) => (!row.validTo ? index : -1))
        .filter((index) => index >= 0);

      if (openEndedIndexes.length > 1) {
        setCareerTimelineError(
          "Současnost (prázdné datum DO) může být jen u jedné poslední pozice."
        );
        return;
      }

      if (
        openEndedIndexes.length === 1 &&
        openEndedIndexes[0] !== sorted.length - 1
      ) {
        setCareerTimelineError(
          "Současnost (prázdné datum DO) je povolena jen u poslední aktuální pozice."
        );
        return;
      }

      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const current = sorted[i];
        const prevTo = prev.validTo || "9999-12-31";
        if (prevTo > current.validFrom) {
          setCareerTimelineError(
            `Rozsahy se překrývají mezi řádky ${i} a ${i + 1}. Uprav datum OD/DO.`
          );
          return;
        }
      }

      const payload = sorted.map((row) => ({
        id: row.id,
        position: row.position,
        validFrom: row.validFrom,
        validTo: row.validTo || null,
      }));
      const nextResolvedPosition = resolveCurrentPositionFromTimeline(payload);

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Nejsi přihlášený.");
      await fetchAuthedJsonOrThrow(currentUser, "/api/team-overview", {
        method: "PATCH",
        body: JSON.stringify({
          targetEmail: selected.email,
          positionTimeline: payload,
        }),
      });

      setCareerTimelineDraft(
        payload.map((row) => ({
          id: row.id,
          position: row.position,
          validFrom: row.validFrom,
          validTo: row.validTo ?? "",
        }))
      );
      setMembers((prev) =>
        prev.map((member) =>
          member.email === selected.email
            ? {
                ...member,
                position: nextResolvedPosition,
              }
            : member
        )
      );
      if (cacheKey && teamDataCache[cacheKey]) {
        teamDataCache[cacheKey] = {
          ...teamDataCache[cacheKey],
          payload: {
            ...teamDataCache[cacheKey].payload,
            members: teamDataCache[cacheKey].payload.members.map((member) =>
              member.email === selected.email
                ? {
                    ...member,
                    position: nextResolvedPosition,
                  }
                : member
            ),
          },
        };
      }
      setCareerTimelineSaved(true);
      setCareerTimelineEditing(false);
      if (careerSaveTimerRef.current) window.clearTimeout(careerSaveTimerRef.current);
      careerSaveTimerRef.current = window.setTimeout(
        () => setCareerTimelineSaved(false),
        3000
      );
    } catch (e: any) {
      if (Number(e?.status) === 403) {
        setCareerTimelineError("Nemáš oprávnění měnit kariéru tohoto uživatele.");
      } else if (typeof e?.message === "string" && e.message.trim()) {
        setCareerTimelineError(e.message.trim());
      } else {
        console.error("Chyba při ukládání kariéry člena týmu:", e);
        setCareerTimelineError("Uložení kariéry se nepovedlo. Zkus to prosím znovu.");
      }
    } finally {
      setCareerTimelineSaving(false);
    }
  };

  return (
    <AppLayout active="team">
      <div
        className={`${introStyles.pageEnter} team-panel-root w-full max-w-6xl space-y-6 rounded-[34px] bg-[linear-gradient(180deg,#fbfaff_0%,#ffffff_46%,#fbfaff_100%)] px-1 py-1 text-slate-900 sm:px-2 sm:py-2`}
      >
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SplitTitle text="Můj tým" className="team-panel-title !text-slate-900" />
        </header>

        {!authReady ? (
          <p className="text-sm text-slate-600">Načítám přihlášení…</p>
        ) : loading ? (
          <div className={`${introStyles.loadingShell} rounded-[32px] border border-violet-100/90 bg-white/92 px-4 py-5 shadow-[0_24px_64px_rgba(76,29,149,0.12)] backdrop-blur-xl sm:px-6 sm:py-6`}>
            <span className={introStyles.loadingAuraA} aria-hidden="true" />
            <span className={introStyles.loadingAuraB} aria-hidden="true" />
            <span className={introStyles.loadingSweep} aria-hidden="true" />

            <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-stretch">
              <div className="space-y-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800 shadow-[0_8px_20px_rgba(109,40,217,0.10)]">
                      <span className="relative inline-flex h-2 w-2">
                        <span className="absolute inset-0 rounded-full bg-violet-500/80 animate-ping" />
                        <span className="relative h-2 w-2 rounded-full bg-violet-600" />
                      </span>
                      Synchronizace týmu
                    </span>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                      Připravuju týmový přehled
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                      Načítám členy, poslední aktivitu a produkční data. Přehled se zobrazí hned, jak budou hotové hlavní statistiky.
                    </p>
                  </div>

	                  <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-violet-100 bg-white/86 px-4 py-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)]">
	                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700">
                      <UsersRound className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Průběh
                      </div>
                      <div className="text-2xl font-bold text-slate-950">
                        {clampedLoadingProgress}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {loadingPhaseItems.map(({ label, caption, Icon }, index) => {
                    const state =
                      index < loadingPhaseIndex
                        ? "done"
                        : index === loadingPhaseIndex
                          ? "active"
                          : "idle";

                    return (
                      <div
                        key={label}
                        className={`rounded-2xl border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
                          state === "done"
	                            ? "border-violet-200 bg-violet-50/88"
                            : state === "active"
	                              ? "border-purple-200 bg-purple-50/92"
                              : "border-slate-200 bg-white/76"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid h-9 w-9 place-items-center rounded-xl ${
                              state === "done"
	                                ? "bg-violet-100 text-violet-700"
                                : state === "active"
	                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {state === "done" ? (
                              <Check className="h-4 w-4" />
                            ) : state === "active" ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <Icon className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-950">
                              {label}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-slate-500">
                              {caption}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span>Aktuální krok</span>
                    <span>{clampedLoadingProgress}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
                    <div
	                      className="relative h-full rounded-full bg-gradient-to-r from-violet-400 via-purple-500 to-indigo-500 transition-[width] duration-300 ease-out"
                      style={{ width: `${clampedLoadingProgress}%` }}
                    >
                      <span className="absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-90 animate-pulse" />
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-500" />
                    {loadingStage}
                  </div>
                </div>
              </div>

	              <aside className="rounded-[26px] border border-violet-100 bg-white/86 p-4 shadow-[0_16px_38px_rgba(76,29,149,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Stav načítání
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-950">
                      Týmový panel
                    </div>
                  </div>
	                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                    <Check className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {loadingStatusItems.map(([label, state]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          state === "ověřeno" || state === "hotovo"
	                            ? "bg-violet-100 text-violet-700"
                            : state === "běží"
	                              ? "bg-purple-100 text-purple-700"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {state}
                      </span>
                    </div>
                  ))}
                </div>

	                <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-3 text-sm leading-relaxed text-slate-700">
                  <div className="font-semibold text-slate-950">Připravuju data pro seznam i detail člena.</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Po načtení se automaticky vybere první osoba v týmu.
                  </div>
                </div>
              </aside>
            </div>

	              <div className="relative z-10 mt-5 rounded-[26px] border border-violet-100 bg-white/72 p-3 shadow-[0_14px_34px_rgba(76,29,149,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Náhled seznamu
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">
                    Členové týmu se řadí podle aktivity
                  </div>
                </div>
                <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 sm:inline-flex">
                  Synchronizuji
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className={`${introStyles.loadingSkeletonCard} rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]`}
                  >
	                    <div className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                      Člen týmu
                    </div>
                    <div className="mt-2 h-7 w-28 rounded-lg bg-slate-200/90" />
                    <div className="mt-3 space-y-2">
                      <div className="h-3 w-5/6 rounded-full bg-slate-200/85" />
                      <div className="h-3 w-3/4 rounded-full bg-slate-200/85" />
                      <div className="h-3 w-2/3 rounded-full bg-slate-200/85" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className={introStyles.bodyReveal} style={teamRevealStyle(70)}>
            <p className="text-sm text-slate-600">Nemáš nastavené žádné podřízené.</p>
          </div>
        ) : (
          <div className={introStyles.bodyReveal} style={teamRevealStyle(70)}>
            <div
              className={`grid grid-cols-1 gap-4 ${
                showTeamSidebar ? "lg:grid-cols-[340px_minmax(0,1fr)] lg:items-stretch" : ""
              }`}
            >
              {showTeamSidebar ? (
	              <aside className="ui-card team-panel-sidebar relative h-full overflow-hidden rounded-3xl border border-violet-100/90 bg-white p-3 shadow-[0_18px_48px_rgba(76,29,149,0.08)]">
	                <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-300 via-purple-400 to-indigo-300" />
                <div className="flex h-full flex-col gap-3">
	                  <div className="flex min-w-0 sm:min-w-[220px] items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2 shadow-[0_6px_14px_rgba(76,29,149,0.05)]">
	                    <Search className="h-4 w-4 text-violet-500" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Jméno nebo e-mail"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                    />
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
	                    className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition hover:bg-violet-50/50 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-1 gap-2">
                    <Link
                      href="/pomucky/struktura"
	                      className="ui-focus inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 shadow-[0_10px_24px_rgba(76,29,149,0.10)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-100"
                    >
                      <Network size={14} strokeWidth={2} aria-hidden="true" />
                      Struktura
                    </Link>
                    {canSendTeamMessage ? (
                      <Link
                        href="/pomucky/zprava-tymu"
	                        className="ui-focus inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-800 shadow-[0_10px_24px_rgba(76,29,149,0.08)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
                      >
                        <MessageSquare size={14} strokeWidth={2} aria-hidden="true" />
                        Zpráva týmu
                      </Link>
	                    ) : null}
	                    {showManagerTeamTools ? (
	                      <Link
                        href="/muj-tym/sin-slavy"
	                        className="ui-focus inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-800 shadow-[0_10px_24px_rgba(76,29,149,0.08)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
                      >
                        <Trophy size={14} strokeWidth={2} aria-hidden="true" />
                        Síň slávy
                      </Link>
                    ) : null}
                  </div>

	                  <div className="space-y-2 border-t border-violet-100 pt-3">
	                    <div className="flex items-center justify-between">
	                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{teamListTitle}</div>
	                      <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
                        {filteredMembers.length} osob
                      </span>
                    </div>
                    <div
                      ref={membersListRef}
                      className="grid grid-cols-1 gap-2 max-h-[58vh] overflow-auto pr-1 lg:max-h-none lg:overflow-visible"
                    >
                      {filteredMembers.length === 0 && (
	                        <div className="col-span-full rounded-2xl border border-violet-100 bg-violet-50/50 px-3 py-2 text-sm text-slate-500">
                          Pro zadané vyhledávání nejsou žádní členové.
                        </div>
                      )}
                      {virtualizedMembers.enabled && virtualizedMembers.topPadding > 0 && (
                        <div
                          aria-hidden="true"
                          className="col-span-full"
                          style={{ height: virtualizedMembers.topPadding }}
                        />
                      )}
                      {virtualizedMembers.items.map((m) => {
                        const isSelected = m.email === selectedEmail;
                        const last = lastActiveBadge(m.email);
                        return (
                          <button
                            key={m.email}
                            onClick={() => setSelectedEmail(m.email)}
	                            className={[
	                              "team-member-card relative w-full min-h-[72px] overflow-hidden rounded-xl border px-3 py-1.5 text-left transition",
	                              isSelected
	                                ? "border-violet-300 bg-violet-50/70 text-slate-900 shadow-[0_12px_28px_rgba(76,29,149,0.12)]"
	                                : "border-violet-100 bg-white text-slate-900 hover:border-violet-200 hover:bg-violet-50/40",
	                            ].join(" ")}
                          >
                            {isSelected ? (
	                              <span className="absolute inset-y-0 left-0 w-1 bg-violet-500" />
                            ) : null}
                            <div className="flex w-full items-start gap-2">
                              <div
                                className={[
                                  "relative h-7 w-7 shrink-0 overflow-hidden rounded-full border bg-white",
                                  isSelected
	                                    ? "border-violet-300 shadow-[0_0_0_1px_rgba(109,40,217,0.20)]"
	                                    : "border-violet-100",
                                ].join(" ")}
                                aria-hidden="true"
                              >
                                <Image
                                  src="/icons/klient.png"
                                  alt=""
                                  fill
                                  sizes="28px"
                                  className="object-cover"
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="truncate text-[13px] font-semibold leading-tight">
                                    {m.name}
                                  </div>
                                </div>

                                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                  {m.accountType === "tipster" ? (
	                                    <span className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                                      Tipař
                                    </span>
                                  ) : null}
                                  <span
                                    className={`text-[10px] inline-flex items-center justify-center gap-1 rounded-full border px-1.5 py-0.5 ${last.className}`}
                                    aria-label={last.title}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${last.dotClassName}`} />
                                    {last.statusLabel}
                                  </span>
                                  {m.agencyNumber ? (
	                                    <span className="inline-flex max-w-full items-center justify-center rounded-full border border-violet-100 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                                      <span className="max-w-[150px] truncate">{m.agencyNumber}</span>
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {virtualizedMembers.enabled &&
                        virtualizedMembers.bottomPadding > 0 && (
                          <div
                            aria-hidden="true"
                            className="col-span-full"
                            style={{ height: virtualizedMembers.bottomPadding }}
                          />
                        )}
                    </div>
                  </div>
                </div>
              </aside>
              ) : null}

	              <div className="relative">
	                  {selected ? (
	                    <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_24px_58px_rgba(76,29,149,0.10)]">
		                      <div className="relative overflow-hidden border-b border-violet-200/30 bg-[linear-gradient(135deg,#2e1065_0%,#6d28d9_52%,#a855f7_100%)] px-4 py-4 !text-white sm:px-5">
		                        <span className="pointer-events-none absolute -right-20 -top-28 h-44 w-44 rounded-full bg-white/18 blur-3xl" />
		                        <span className="pointer-events-none absolute -left-20 -bottom-24 h-40 w-40 rounded-full bg-fuchsia-300/18 blur-3xl" />
		                        <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	                          <div className="min-w-0">
	                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] !text-violet-100/80">Detail</div>
	                            <div className="break-words text-3xl font-bold leading-tight !text-white sm:text-4xl">{selected.name}</div>
	                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
	                              <div className="inline-flex min-w-0 items-center gap-2 text-sm !text-violet-50/86 sm:text-base">
	                                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] !text-violet-100/72">
	                                {selected.accountType === "tipster" ? "Role" : "Pozice"}
	                                </span>
	                                <span className="font-bold leading-tight !text-white">
	                                {memberRoleLabel(selected)}
	                                </span>
	                              </div>
	                              <span className="hidden h-1 w-1 rounded-full bg-white/35 sm:inline-flex" aria-hidden="true" />
	                              <p className="min-w-0 break-all text-sm !text-violet-50/80">{selected.email}</p>
	                            </div>
	                          </div>
	                          <div className="flex flex-wrap items-center gap-2 lg:max-w-[300px] lg:justify-end">
	                            <span
	                              className={[
	                                "inline-flex max-w-full items-start gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur",
	                                selectedAgencyNumber
		                                  ? "border-white/24 bg-white/15 !text-white"
		                                : "border-white/18 bg-white/10 !text-violet-100/75",
	                              ].join(" ")}
	                            >
	                              <span className="min-w-0 break-all">
	                                Agenturní číslo: {selectedAgencyNumber || "Nevyplněno"}
	                              </span>
	                            </span>
	                          </div>
	                        </div>
	                      </div>

	                      <div className="space-y-3 bg-white px-4 py-4 sm:px-5">
	                        <div className="space-y-2.5">
	                          {canFillSelectedAgencyNumber ? (
		                            <div className="mt-3 max-w-2xl rounded-2xl border border-violet-100 bg-white px-3 py-3 shadow-[0_8px_22px_rgba(76,29,149,0.05)]">
                              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Doplnit agenturní číslo
                              </label>
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input
                                  type="text"
                                  value={agencyNumberDraft}
                                  onChange={(event) => {
                                    setAgencyNumberDraft(event.target.value);
                                    setAgencyNumberStatus(null);
                                  }}
                                  maxLength={AGENCY_NUMBER_MAX_LEN}
                                  placeholder="Agenturní číslo"
	                                  className="ui-input ui-focus min-h-[40px] flex-1 rounded-xl border-violet-100 px-3 py-2 text-sm focus:border-violet-300 focus:ring-violet-100"
                                  disabled={agencyNumberSaving}
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveSelectedAgencyNumber()}
                                  disabled={agencyNumberSaving}
                                  className="ui-btn-primary ui-focus inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {agencyNumberSaving ? "Ukládám..." : "Uložit"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {agencyNumberStatus ? (
                            <div
                              className={`mt-2 text-sm font-semibold ${
	                                agencyNumberStatus.type === "success"
	                                  ? "text-violet-700"
                                  : "text-rose-700"
                              }`}
                            >
                              {agencyNumberStatus.message}
                            </div>
                          ) : null}
                          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={handleCopySelectedEmail}
	                                className="ui-focus inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_6px_16px_rgba(76,29,149,0.05)] transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                              >
                                <Copy size={12} strokeWidth={2} aria-hidden="true" />
                                {copiedEmail ? "Zkopírováno" : "Kopírovat e-mail"}
                              </button>
                              <a
                                href={`mailto:${selected.email}`}
	                                className="ui-focus inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_6px_16px_rgba(76,29,149,0.05)] transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                              >
                                <Mail size={12} strokeWidth={2} aria-hidden="true" />
                                Napsat e-mail
                              </a>
                              <Link
                                href={`/pomucky/statistika?user=${encodeURIComponent(selected.email)}`}
	                                className="ui-focus inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_6px_16px_rgba(76,29,149,0.05)] transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                              >
                                <BarChart3 size={12} strokeWidth={2} aria-hidden="true" />
                                Statistiky
                              </Link>
                            </div>
                            {canEndSelectedCollaboration ? (
                              <button
                                type="button"
                                onClick={openEndCollaborationModal}
                                className="ui-focus inline-flex items-center justify-center rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                              >
                                Ukončit spolupráci
                              </button>
                            ) : null}
                          </div>
                          {endCollaborationSuccess ? (
	                            <div className="mt-2 text-sm font-semibold text-violet-700">
                              {endCollaborationSuccess}
                            </div>
                          ) : null}
	                          <div className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-full border border-violet-100 bg-violet-50/70 p-1">
                            <button
                              type="button"
                              onClick={() => setDetailTab("overview")}
                              className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                                detailTab === "overview"
		                                  ? "bg-violet-700 !text-white shadow-[0_6px_14px_rgba(109,40,217,0.24)]"
	                                  : "text-slate-600 hover:bg-white hover:text-violet-800"
                              }`}
                            >
                              Přehled
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetailTab("subordinates")}
                              className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                                detailTab === "subordinates"
		                                  ? "bg-violet-700 !text-white shadow-[0_6px_14px_rgba(109,40,217,0.24)]"
	                                  : "text-slate-600 hover:bg-white hover:text-violet-800"
                              }`}
                            >
                              Podřízení ({subordinatesOfSelected.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetailTab("career")}
                              className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                                detailTab === "career"
		                                  ? "bg-violet-700 !text-white shadow-[0_6px_14px_rgba(109,40,217,0.24)]"
	                                  : "text-slate-600 hover:bg-white hover:text-violet-800"
                              }`}
                            >
                              Kariéra
	                            </button>
	                          </div>
	                        </div>

	                      {detailTab === "overview" ? (
                        <>
	                          <div className="relative z-10 grid grid-cols-1 gap-3 border-b border-violet-100 py-4 sm:grid-cols-2 xl:grid-cols-4">
	                            <div className="team-stat-card relative overflow-hidden rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,#4c1d95_0%,#7c3aed_100%)] px-3 py-3 !text-white shadow-[0_16px_34px_rgba(76,29,149,0.20)]">
	                              <span className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-white/18 blur-2xl" />
                              <div className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.16em] !text-violet-100/80">
                                {selectedIsTipster ? "Celkem tipů" : "Celkem smluv"}
                              </div>
                              <div className="relative z-10 mt-1 text-3xl font-bold leading-none !text-white">
                                {selectedStatsUnavailable
                                  ? "—"
                                  : selectedIsTipster
                                    ? tipCountLabel(selected.email, "total")
                                    : contractCountLabel(selected.email, "total")}
                              </div>
                              <div
                                className="relative z-10 mt-2 truncate text-xs font-semibold !text-violet-100/80"
                                title={formatLastActive(selected.email)}
                              >
                                {selectedIsTipster
                                  ? `${tipCountLabel(selected.email, "contracted")} sjednaných`
                                  : `Naposledy ${formatRelative(lastActive[selected.email])}`}
                              </div>
                            </div>
	                            <div className="team-stat-card rounded-2xl border border-violet-100 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {selectedIsTipster ? "Tipů tento měsíc" : "Smluv tento měsíc"}
                              </div>
                              <div className="mt-1 text-3xl font-bold leading-none text-slate-950">
                                {selectedStatsUnavailable
                                  ? "—"
                                  : selectedIsTipster
                                    ? tipCountLabel(selected.email, "month")
                                    : contractCountLabel(selected.email, "month")}
                              </div>
                              <span
                                className={`mt-2 inline-flex max-w-full rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  selectedStatsUnavailable
                                    ? "border-slate-200 bg-slate-50 text-slate-600"
                                    : selectedMonthTrend.className
                                }`}
                              >
                                {selectedStatsUnavailable ? "čekám na data" : selectedMonthTrend.label}
                              </span>
                            </div>
	                            <div className="team-stat-card rounded-2xl border border-violet-100 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Měsíční produkce
                              </div>
                              <div className="mt-1 text-2xl font-bold leading-tight text-violet-700">
                                {selectedStatsUnavailable
                                  ? "—"
                                  : formatMetricMoney(selectedMonthMetrics.monthlyPremium)}
                              </div>
                              <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                                {selectedStatsUnavailable
                                  ? "bez dat"
                                  : `${selectedMonthMetrics.contracts} smluv tento měsíc`}
                              </div>
                            </div>
	                            <div className="team-stat-card rounded-2xl border border-violet-100 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Roční produkce
                              </div>
                              <div className="mt-1 text-2xl font-bold leading-tight text-violet-700">
                                {selectedStatsUnavailable
                                  ? "—"
                                  : formatMetricMoney(selectedTotalProduction.annualPremium)}
                              </div>
                              <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                                {selectedStatsUnavailable
                                  ? "bez dat"
                                  : `${selectedTotalProduction.contracts} smluv celkem`}
                              </div>
                            </div>
                          </div>

	                          <div className="relative overflow-hidden space-y-3 rounded-2xl border border-violet-100 bg-white px-3 py-4 shadow-[0_16px_38px_rgba(76,29,149,0.07)]">
	                            <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-300 via-purple-400 to-indigo-300" />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{productionBoxTitle}</div>
                              <div className="text-xs font-semibold text-slate-500">
                                {showMonthlyPremiumInProduction
                                  ? "Pojišťovna / počet smluv / měsíční / roční"
                                  : "Pojišťovna / počet smluv / roční"}
                              </div>
                            </div>

	                            <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-full border border-violet-100 bg-violet-50/70 p-1">
                              {PRODUCTION_CATEGORY_TABS.map((tab) => {
                                const active = productionCategory === tab.key;
                                return (
                                  <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setProductionCategory(tab.key)}
                                    className={`ui-focus rounded-full px-3 py-1 text-xs font-semibold transition ${
                                      active
	                                        ? "bg-violet-700 !text-white shadow-[0_6px_14px_rgba(109,40,217,0.22)]"
	                                        : "text-slate-600 hover:bg-white hover:text-violet-800"
                                    }`}
                                  >
                                    {tab.label}
                                  </button>
                                );
                              })}
                            </div>

	                            <div className="ui-card ui-card-quiet rounded-2xl border border-violet-100 bg-violet-50/30 px-4 py-4">
                              {selectedProductionRows.length === 0 ? (
	                                <div className="text-sm text-slate-500">{emptyProductionMessage}</div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div
                                    className={`hidden sm:grid ${productionGridColsClass} items-center gap-3 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500`}
                                  >
                                    <div>Pojišťovna</div>
                                    <div className="text-right">Smluv</div>
                                    {showMonthlyPremiumInProduction ? (
                                      <div className="text-right">Měsíční</div>
                                    ) : null}
                                    <div className="text-right">Roční</div>
                                  </div>
                                  {selectedProductionRows.map((row) => {
                                    const logo = insurerLogoPath(row.name);
                                    const logoKey = institutionLogoKeyFromPath(logo);
                                    return (
                                  <div
                                    key={row.name}
	                                      className={`team-production-row grid grid-cols-1 gap-1 rounded-xl border border-violet-100 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(76,29,149,0.05)] ${productionGridColsClass} sm:items-center sm:gap-3`}
                                    >
                                      <div className="min-w-0 flex items-center gap-2">
                                        {logo ? (
                                          <span
                                            className={`relative inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm ${institutionLogoFrameClass(
                                              logoKey,
                                              "compact"
                                            )}`}
                                          >
                                            <Image
                                              src={logo}
                                              alt={row.name}
                                              fill
                                              sizes="64px"
                                              className={institutionLogoImageClass(logoKey)}
                                            />
                                          </span>
                                        ) : null}
                                        <span className="min-w-0 text-base font-bold text-slate-900 sm:text-lg">{row.name}</span>
                                      </div>
                                      <div className="text-sm font-semibold text-slate-700 sm:text-right sm:text-base">{row.contracts}x smluv</div>
                                      {showMonthlyPremiumInProduction ? (
	                                        <div className="text-base font-bold text-violet-700 sm:text-right sm:text-xl">{formatMoney(row.monthlyPremium)}</div>
                                      ) : null}
	                                      <div className="text-base font-bold text-violet-700 sm:text-right sm:text-xl">{formatMoney(row.annualPremium)}</div>
                                    </div>
                                  );
                                  })}
                                  <div
	                                    className={`relative grid grid-cols-1 gap-1 overflow-hidden rounded-2xl border border-violet-700/90 bg-[linear-gradient(135deg,#4c1d95_0%,#6d28d9_54%,#312e81_100%)] px-4 py-3 !text-white shadow-[0_20px_48px_rgba(76,29,149,0.34)] ${productionGridColsClass} sm:items-center sm:gap-3`}
                                  >
	                                    <span className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet-300/24 blur-3xl" />
	                                    <span className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-fuchsia-300/16 blur-3xl" />
                                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
                                    <div className="relative z-10 text-base font-bold !text-white drop-shadow-none sm:text-lg">Celkem</div>
                                    <div className="relative z-10 text-sm font-semibold !text-white drop-shadow-none sm:text-right sm:text-base">{selectedProductionTotals.contracts}x smluv</div>
                                    {showMonthlyPremiumInProduction ? (
	                                      <div className="relative z-10 text-base font-bold tracking-tight text-violet-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] sm:text-right sm:text-xl">{formatMoney(selectedProductionTotals.monthlyPremium)}</div>
                                    ) : null}
	                                    <div className="relative z-10 text-base font-bold tracking-tight text-violet-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] sm:text-right sm:text-xl">{formatMoney(selectedProductionTotals.annualPremium)}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      ) : detailTab === "subordinates" ? (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Podřízení</div>
                            <span className="text-[11px] text-slate-500">
                              {subordinatesOfSelected.length} {subordinatesOfSelected.length === 1 ? "osoba" : "osob"}
                            </span>
                          </div>
                          {subordinatesOfSelected.length === 0 ? (
	                            <div className="text-sm text-slate-500 rounded-2xl border border-violet-100 bg-violet-50/50 px-3 py-2">
                              Nemá podřízené ani v dalších úrovních.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {subordinatesOfSelected.map((sub) => (
	                                <div
	                                  key={sub.email}
		                                  className="rounded-2xl border border-violet-100 bg-white px-3 py-3 shadow-[0_8px_20px_rgba(76,29,149,0.05)]"
	                                >
	                                  <div className="text-base font-semibold text-slate-900">{sub.name}</div>
	                                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
		                                    <span className="rounded-full border border-violet-100 bg-violet-50/60 px-2 py-0.5 font-semibold text-violet-800">
	                                      {memberRoleLabel(sub)}
	                                    </span>
	                                    <span
	                                      className={[
	                                        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 font-semibold",
	                                        sub.agencyNumber
		                                          ? "border-violet-200 bg-violet-50 text-violet-800"
	                                          : "border-slate-200 bg-slate-50 text-slate-500",
	                                      ].join(" ")}
	                                    >
	                                      <span className="min-w-0 break-all">
	                                        {sub.agencyNumber || "Bez agenturního čísla"}
	                                      </span>
	                                    </span>
	                                    {sub.depth > 1 ? (
	                                      <span>{sub.depth}. úroveň</span>
	                                    ) : null}
	                                  </div>
	                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                              Historie kariéry
                            </div>
                            {canEditSelectedCareer ? (
                              <div className="flex flex-wrap items-center gap-2">
                                {!careerTimelineEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCareerTimelineEditing(true);
                                      setCareerTimelineError(null);
                                      setCareerTimelineSaved(false);
                                    }}
                                    className="ui-btn-primary ui-focus rounded-full px-3 py-1.5 text-xs"
                                  >
                                    Upravit
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={addCareerTimelineRow}
                                    className="ui-btn-primary ui-focus rounded-full px-3 py-1.5 text-xs"
                                  >
                                    Přidat pozici
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>

                          {careerTimelineLoading ? (
	                            <div className="rounded-2xl border border-violet-100 bg-violet-50/50 px-3 py-2 text-sm text-slate-500">
                              Načítám kariéru…
                            </div>
                          ) : careerTimelineDraft.length === 0 ? (
	                            <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-5 text-sm text-slate-500">
                              Vybraný člen zatím nemá vyplněnou historii kariéry.
                            </div>
                          ) : canEditSelectedCareer && careerTimelineEditing ? (
                            <div className="space-y-2.5">
                              {careerTimelineDraft.map((row, rowIndex) => {
                                const rowRangeError = hasInvalidRangeOrder(
                                  row.validFrom.trim(),
                                  row.validTo.trim()
                                );
                                const isLastDraftRow =
                                  rowIndex === careerTimelineDraft.length - 1;
                                const rowOpenEndedNotLast =
                                  !row.validTo.trim() && !isLastDraftRow;

                                return (
                                  <div
                                    key={row.id}
	                                    className={`rounded-2xl border bg-white px-3 py-3 shadow-[0_6px_16px_rgba(76,29,149,0.05)] ${
                                      rowRangeError || rowOpenEndedNotLast
                                        ? "border-rose-300"
	                                        : "border-violet-100"
                                    }`}
                                  >
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
                                      <select
                                        value={row.position}
                                        onChange={(e) =>
                                          updateCareerTimelineRow(row.id, {
                                            position: e.target.value as Position,
                                          })
                                        }
	                                        className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                                      >
                                        {POSITION_OPTIONS.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.label}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="date"
                                        value={row.validFrom}
                                        onChange={(e) =>
                                          updateCareerTimelineRow(row.id, {
                                            validFrom: e.target.value,
                                          })
                                        }
	                                        className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                                        title="Platí od"
                                      />
                                      <input
                                        type="date"
                                        value={row.validTo}
                                        onChange={(e) =>
                                          updateCareerTimelineRow(row.id, {
                                            validTo: e.target.value,
                                          })
                                        }
	                                        className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                                        title="Platí do"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeCareerTimelineRow(row.id)}
	                                        className="rounded-xl border border-violet-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
                                      >
                                        Smazat
                                      </button>
                                    </div>
                                    {rowRangeError ? (
                                      <p className="mt-2 text-xs font-medium text-rose-700">
                                        Datum DO nemůže být dřív než datum OD.
                                      </p>
                                    ) : null}
                                    {rowOpenEndedNotLast ? (
                                      <p className="mt-2 text-xs font-medium text-rose-700">
                                        Současnost (prázdné DO) může být jen u posledního řádku.
                                      </p>
                                    ) : null}
                                    {isLastDraftRow ? (
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {row.validTo.trim() ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateCareerTimelineRow(row.id, {
                                                validTo: "",
                                              })
                                            }
	                                            className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100"
                                          >
                                            Nastavit DO: současnost
                                          </button>
                                        ) : (
	                                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                                            Poslední pozice běží do současnosti
                                          </span>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {careerTimelineDraft.map((row) => (
                                <div
                                  key={row.id}
	                                  className="rounded-2xl border border-violet-100 bg-white px-3 py-3 shadow-[0_6px_16px_rgba(76,29,149,0.05)]"
                                >
                                  <div className="text-sm font-semibold text-slate-900">
                                    {positionLabel(row.position)}
                                  </div>
                                  <div className="text-xs text-slate-600">
                                    {row.validFrom} — {row.validTo || "současnost"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {careerTimelineError ? (
                            <p className="text-xs font-medium text-rose-700">
                              {careerTimelineError}
                            </p>
                          ) : null}

                          {canEditSelectedCareer && careerTimelineEditing ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {careerTimelineSaved ? (
	                                <span className="text-xs font-semibold text-violet-700">
                                  Uloženo
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void saveCareerTimeline()}
                                disabled={careerTimelineSaving}
	                                className="rounded-xl border border-violet-700 bg-violet-700 px-3 py-2 text-xs font-semibold !text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {careerTimelineSaving ? "Ukládám..." : "Uložit kariéru"}
                              </button>
                            </div>
                          ) : canEditSelectedCareer ? (
                            <p className="text-xs text-slate-500">
                              Kariéra je uzamčená. Klikni na Upravit pro změny.
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500">
                              Tento profil můžeš jen zobrazit.
                            </p>
                          )}
                        </div>
                      )}
	                      </div>
	                    </section>
	                  ) : (
	                    <section className="rounded-[32px] border border-violet-100 bg-white px-5 py-5 text-sm text-slate-500 shadow-[0_24px_58px_rgba(76,29,149,0.10)]">
	                      Vyber podřízeného v levém panelu.
	                    </section>
	                  )}
                </div>
            </div>
          </div>
        )}
      </div>
      {endCollaborationModalOpen && selected ? (
        <div className="team-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="team-modal-panel w-full max-w-lg rounded-2xl border border-rose-300 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase tracking-[0.14em] text-rose-700">
                Ukončit spolupráci
              </div>
              <button
                type="button"
                onClick={() => void loadEndCollaborationPreview(selected)}
                disabled={endCollaborationPreviewLoading || endingCollaboration}
                className="rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {endCollaborationPreviewLoading ? "Načítám..." : "Obnovit náhled"}
              </button>
            </div>
            <div className="mt-2 text-lg font-bold text-slate-900">{selected.name}</div>
            <div className="text-sm text-slate-500">{selected.email}</div>

            <div className="mt-4 space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
              <div>
                Smlouvy k převodu:{" "}
                <span className="font-semibold">
                  {endCollaborationPreview
                    ? endCollaborationPreview.transferableContracts
                    : "—"}
                </span>
              </div>
              <div>
                Přímí podřízení k přeřazení:{" "}
                <span className="font-semibold">
                  {endCollaborationPreview
                    ? endCollaborationPreview.directSubordinates
                    : "—"}
                </span>
              </div>
              <div>
                Převod na nadřízeného:{" "}
                <span className="font-semibold">
                  {(endCollaborationPreview?.successorEmail ?? "—").toLowerCase()}
                </span>
              </div>
              {endCollaborationPreview ? (
                <div className="text-xs text-rose-700">
                  Náhled načten:{" "}
                  {new Date(endCollaborationPreview.generatedAtMs).toLocaleString("cs-CZ")}
                </div>
              ) : null}
            </div>

            {endCollaborationPreviewError ? (
              <div className="mt-3 text-sm font-medium text-rose-700">
                {endCollaborationPreviewError}
              </div>
            ) : null}

            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Potvrď e-mail podřízeného
            </label>
            <input
              type="text"
              value={endCollaborationConfirmEmail}
              onChange={(e) => setEndCollaborationConfirmEmail(e.target.value)}
              disabled={endingCollaboration}
              placeholder={selected.email}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
            />

            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={endCollaborationConfirmCascade}
                onChange={(e) => setEndCollaborationConfirmCascade(e.target.checked)}
                disabled={endingCollaboration}
                className="mt-1"
              />
              <span>
                Potvrzuji ukončení spolupráce, převod všech smluv na přímého nadřízeného a
                přeřazení přímých podřízených na tohoto nadřízeného.
              </span>
            </label>

            {endCollaborationError ? (
              <div className="mt-3 text-sm font-medium text-rose-700">
                {endCollaborationError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeEndCollaborationModal}
                className="ui-btn-secondary ui-focus rounded-xl px-3 py-2 text-sm"
                disabled={endingCollaboration}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => void confirmEndCollaboration()}
                className="rounded-xl border border-rose-800 bg-rose-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  endingCollaboration ||
                  endCollaborationPreviewLoading ||
                  !endCollaborationPreview
                }
              >
                {endingCollaboration ? "Provádím převod..." : "Ukončit a převést"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
