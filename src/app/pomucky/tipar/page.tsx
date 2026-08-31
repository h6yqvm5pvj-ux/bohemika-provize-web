"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  CarFront,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  HandCoins,
  HeartPulse,
  Info,
  Loader2,
  Mail,
  Phone,
  Plane,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ADMIN_IMPERSONATION_HEADER } from "@/app/lib/adminImpersonation";
import { positionLabel } from "@/app/lib/formatters";
import { getProductMetadata } from "@/app/lib/productCatalog";
import {
  POSITION_ORDER,
  parsePositionTimeline,
  resolveCurrentPositionTimelineRow,
} from "@/app/kalkulacka/calculatorHelpers";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import type { Position } from "@/app/types/domain";
import { systemSansFont } from "@/lib/fonts";
import {
  TIP_OFFER_GROUPS,
  TIP_OFFER_PRODUCTS,
  calculateTipOfferProduct,
  type TipOfferCalculation,
  type TipOfferGroupId,
  type TipOfferProductDefinition,
  type TipOfferProductId,
} from "./tipOfferCalculation";

const pageFont = systemSansFont;

const DEFAULT_PRODUCT_DRAFT: ProductDraft = {
  premium: "",
  tipPercent: 30,
  durationYears: 30,
};

type ProductDraft = {
  premium: string;
  tipPercent: number;
  durationYears: number;
};

type AdvisorInfo = {
  fullName: string;
  email: string;
  phone: string;
  ico: string;
  position: Position | null;
  onlineCardSlug: string;
};

type UserProfileApiResponse = {
  ok?: boolean;
  profile?: Record<string, unknown>;
};

type ProductResult = {
  definition: TipOfferProductDefinition;
  draft: ProductDraft;
  premium: number;
  calculation: TipOfferCalculation;
};

type CategoryFilter = "all" | TipOfferGroupId;

const GROUP_VISUALS: Record<
  TipOfferGroupId,
  {
    icon: typeof HeartPulse;
    tint: string;
    iconTint: string;
  }
> = {
  life: {
    icon: HeartPulse,
    tint: "from-rose-50 via-white to-violet-50",
    iconTint: "bg-rose-50 text-rose-600 ring-rose-100",
  },
  property: {
    icon: ShieldCheck,
    tint: "from-cyan-50 via-white to-violet-50",
    iconTint: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  },
  auto: {
    icon: CarFront,
    tint: "from-blue-50 via-white to-violet-50",
    iconTint: "bg-blue-50 text-blue-700 ring-blue-100",
  },
  business: {
    icon: BriefcaseBusiness,
    tint: "from-amber-50 via-white to-violet-50",
    iconTint: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  travel: {
    icon: Plane,
    tint: "from-sky-50 via-white to-violet-50",
    iconTint: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  other: {
    icon: UserRound,
    tint: "from-emerald-50 via-white to-violet-50",
    iconTint: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
};

const PRINT_GROUP_LABELS: Record<TipOfferGroupId, string> = {
  life: "ŽIVOTNÍ POJIŠTĚNÍ",
  auto: "POJIŠTĚNÍ VOZIDEL",
  property: "POJIŠTĚNÍ MAJETKU A ODPOVĚDNOSTI OBČANŮ",
  business: "POJIŠTĚNÍ PODNIKATELŮ",
  travel: "CESTOVNÍ POJIŠTĚNÍ",
  other: "POJIŠTĚNÍ CIZINCŮ",
};

const getTipOfferGroup = (productId: TipOfferProductId) =>
  TIP_OFFER_GROUPS.find((item) =>
    item.products.some((productDefinition) => productDefinition.id === productId)
  );

const getPrintGroupLabel = (productId: TipOfferProductId): string => {
  const group = getTipOfferGroup(productId);
  return group ? PRINT_GROUP_LABELS[group.id] : "POJIŠTĚNÍ";
};

const advisorRoleLabel = (position: Position | null): "Poradce" | "Manažer" =>
  position?.startsWith("manazer") ? "Manažer" : "Poradce";

const initialDrafts = (): Record<TipOfferProductId, ProductDraft> =>
  Object.fromEntries(
    TIP_OFFER_PRODUCTS.map((item) => [
      item.id,
      { ...DEFAULT_PRODUCT_DRAFT },
    ])
  ) as Record<TipOfferProductId, ProductDraft>;

const moneyFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const decimalMoneyFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const generatedDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const normalizeSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const parsePremium = (value: string): number => {
  const parsed = Number(value.replace(/[\s.]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
};

const currentIsoDay = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
};

const resolveProfilePosition = (
  profile: Record<string, unknown> | null
): Position | null => {
  const timeline = parsePositionTimeline(profile?.positionTimeline);
  const currentTimelinePosition = resolveCurrentPositionTimelineRow(timeline)?.position;
  if (currentTimelinePosition) return currentTimelinePosition;

  const direct = profile?.position;
  return POSITION_ORDER.includes(direct as Position) ? (direct as Position) : null;
};

const advisorFromProfile = ({
  profile,
  email,
}: {
  profile: Record<string, unknown> | null;
  email: string;
}): AdvisorInfo => {
  const onlineCard = readObject(profile?.onlineCard);
  return {
    fullName:
      readText(onlineCard?.fullName) ||
      readText(profile?.fullName) ||
      readText(profile?.name) ||
      nameFromEmail(email) ||
      "Poradce Bohemika",
    email: readText(onlineCard?.email) || readText(profile?.email) || email,
    phone:
      readText(onlineCard?.phone) ||
      readText(profile?.phoneNumber) ||
      readText(profile?.phone),
    ico:
      readText(onlineCard?.ico) ||
      readText(profile?.ico) ||
      readText(profile?.companyId),
    position: resolveProfilePosition(profile),
    onlineCardSlug:
      onlineCard?.enabled === true ? readText(onlineCard.slug) : "",
  };
};

function PremiumInput({
  definition,
  value,
  onChange,
}: {
  definition: TipOfferProductDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[0.68rem] font-black uppercase tracking-[0.13em] text-slate-500">
        {definition.premiumLabel}
      </span>
      <span className="mt-1.5 flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-3 shadow-[inset_0_2px_5px_rgba(15,23,42,0.04),0_6px_15px_rgba(15,23,42,0.04)] transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          aria-label={`${definition.premiumLabel} – ${definition.label}`}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent text-base font-black tabular-nums text-slate-950 outline-none placeholder:text-slate-300"
        />
        <span className="ml-2 text-xs font-bold text-slate-500">Kč</span>
      </span>
    </label>
  );
}

function PercentControl({
  definition,
  value,
  disabled,
  onChange,
}: {
  definition: TipOfferProductDefinition;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const update = (value: number) =>
    onChange(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));

  return (
    <label className={`block min-w-0 ${disabled ? "opacity-50" : ""}`}>
      <span className="flex items-center justify-between gap-2 text-[0.68rem] font-black uppercase tracking-[0.13em] text-slate-500">
        Podíl tipaře
        {value <= 30 ? (
          <span className="inline-flex items-center gap-1 text-[0.6rem] tracking-normal text-emerald-700">
            <Check className="h-3 w-3" strokeWidth={3} /> doporučeno
          </span>
        ) : (
          <span className="text-[0.6rem] tracking-normal text-amber-700">nad doporučením</span>
        )}
      </span>
      <span className="mt-2 flex h-10 items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          value={value}
          onChange={(event) => update(Number(event.target.value))}
          aria-label={`Podíl tipaře – ${definition.label}`}
          className="min-w-0 flex-1 accent-violet-700"
        />
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          value={value}
          onChange={(event) => update(Number(event.target.value))}
          aria-label={`Podíl tipaře v procentech – ${definition.label}`}
          className="w-12 bg-transparent text-right text-sm font-black tabular-nums text-violet-800 outline-none"
        />
        <span className="text-xs font-black text-violet-700">%</span>
      </span>
    </label>
  );
}

function ProductCard({
  groupId,
  result,
  supportsCommission,
  positionReady,
  selectedForPrint,
  onDraftChange,
  onTogglePrint,
}: {
  groupId: TipOfferGroupId;
  result: ProductResult;
  supportsCommission: boolean;
  positionReady: boolean;
  selectedForPrint: boolean;
  onDraftChange: (patch: Partial<ProductDraft>) => void;
  onTogglePrint: () => void;
}) {
  const { definition, draft, premium, calculation } = result;
  const visual = GROUP_VISUALS[groupId];
  const GroupIcon = visual.icon;
  const metadata = getProductMetadata(definition.calculatorProduct);
  const hasValue = premium > 0;
  const commissionCode = definition.commissionCode ?? "A101";

  return (
    <article
      className={`group relative isolate overflow-hidden rounded-[28px] border border-white bg-gradient-to-br ${visual.tint} p-4 shadow-[0_20px_45px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(76,29,149,0.15),inset_0_1px_0_rgba(255,255,255,1)] sm:p-5`}
    >
      <span
        className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl"
        aria-hidden="true"
      />
      {definition.id === "life" ? (
        <HeartPulse
          className="pointer-events-none absolute -right-3 top-7 h-28 w-28 rotate-[-8deg] text-rose-700/[0.06] transition duration-300 group-hover:scale-105"
          strokeWidth={1.15}
          aria-hidden="true"
        />
      ) : definition.id === "travel" ? (
        <Plane
          className="pointer-events-none absolute -right-3 top-7 h-28 w-28 rotate-[-8deg] text-sky-700/[0.06] transition duration-300 group-hover:scale-105"
          strokeWidth={1.15}
          aria-hidden="true"
        />
      ) : definition.id === "auto" ? (
        <CarFront
          className="pointer-events-none absolute -right-3 top-7 h-28 w-28 rotate-[-8deg] text-blue-700/[0.07] transition duration-300 group-hover:scale-105"
          strokeWidth={1.2}
          aria-hidden="true"
        />
      ) : metadata?.institutionLogo ? (
        <Image
          src={metadata.institutionLogo}
          alt=""
          width={170}
          height={80}
          className="pointer-events-none absolute -right-4 top-7 h-20 w-40 object-contain opacity-[0.055] grayscale transition duration-300 group-hover:opacity-[0.085]"
          aria-hidden="true"
        />
      ) : null}

      <div className="relative z-10">
        <button
          type="button"
          disabled={!hasValue}
          aria-pressed={selectedForPrint}
          onClick={onTogglePrint}
          className={`absolute right-0 top-0 z-20 inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[0.68rem] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
            selectedForPrint
              ? "border-violet-700 bg-violet-700 !text-white shadow-[0_8px_18px_rgba(109,40,217,0.22)]"
              : "border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700"
          }`}
          title={hasValue ? "Zahrnout nebo vyřadit produkt z tisku" : "Nejdřív vyplň pojistné"}
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-[5px] border ${
              selectedForPrint
                ? "border-white/60 bg-white/15"
                : "border-slate-300 bg-white"
            }`}
          >
            {selectedForPrint ? <Check className="h-3 w-3 !text-white" strokeWidth={3} /> : null}
          </span>
          Do tisku
        </button>

        <div className="flex min-h-[54px] items-start gap-3 pr-28">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 shadow-[0_10px_22px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] ${visual.iconTint}`}
          >
            <GroupIcon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {definition.id !== "life" ? (
              <p className="text-[0.64rem] font-black uppercase tracking-[0.15em] text-violet-600">
                {definition.id === "travel"
                  ? "Průměr ČPP + AXA + Kooperativa"
                  : definition.id === "auto"
                    ? "Všechny spolupracující pojišťovny"
                    : metadata?.institutionLabel ?? "Bohemika"}
              </p>
            ) : null}
            <h3 className="mt-1 text-base font-black leading-tight tracking-[-0.025em] text-slate-950 sm:text-lg">
              {definition.label}
            </h3>
            <p className="mt-1 text-[0.7rem] font-semibold text-slate-500">
              {definition.premiumPeriodLabel}
              {definition.supportsDuration ? ` • model ${draft.durationYears} let` : ""}
            </p>
          </div>
        </div>

        <div className={`mt-4 grid gap-3 ${definition.supportsDuration ? "sm:grid-cols-[1fr_0.64fr]" : "sm:grid-cols-2"}`}>
          <PremiumInput
            definition={definition}
            value={draft.premium}
            onChange={(premiumValue) => onDraftChange({ premium: premiumValue })}
          />
          {definition.supportsDuration ? (
            <label className="block min-w-0">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.13em] text-slate-500">
                Doba pojištění
              </span>
              <span className="mt-1.5 flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-3 shadow-[inset_0_2px_5px_rgba(15,23,42,0.04),0_6px_15px_rgba(15,23,42,0.04)] focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={draft.durationYears}
                  onChange={(event) =>
                    onDraftChange({
                      durationYears: Math.min(
                        80,
                        Math.max(1, Number(event.target.value) || 1)
                      ),
                    })
                  }
                  aria-label={`Doba pojištění – ${definition.label}`}
                  className="min-w-0 flex-1 bg-transparent text-base font-black tabular-nums text-slate-950 outline-none"
                />
                <span className="ml-2 text-xs font-bold text-slate-500">let</span>
              </span>
            </label>
          ) : (
            <PercentControl
              definition={definition}
              value={draft.tipPercent}
              disabled={!supportsCommission}
              onChange={(tipPercent) => onDraftChange({ tipPercent })}
            />
          )}
        </div>

        {definition.supportsDuration ? (
          <div className="mt-3">
            <PercentControl
              definition={definition}
              value={draft.tipPercent}
              disabled={!supportsCommission}
              onChange={(tipPercent) => onDraftChange({ tipPercent })}
            />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-[22px] border border-white/90 bg-white/80 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur">
          <div className="rounded-[16px] bg-slate-50/90 px-3 py-3">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.13em] text-slate-500">
              Provize {commissionCode}
            </p>
            <p className="mt-1 text-lg font-black tabular-nums tracking-[-0.035em] text-slate-950">
              {!positionReady
                ? "—"
                : hasValue && supportsCommission
                  ? moneyFormatter.format(calculation.baseCommission)
                  : hasValue
                    ? `Bez ${commissionCode}`
                    : "0 Kč"}
            </p>
          </div>
          <div className="rounded-[16px] bg-[linear-gradient(145deg,#6d28d9_0%,#8b5cf6_58%,#a855f7_100%)] px-3 py-3 text-white shadow-[0_12px_24px_rgba(109,40,217,0.22),inset_0_1px_0_rgba(255,255,255,0.26)]">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.13em] !text-violet-100">
              Provize tipaře
            </p>
            <p className="mt-1 text-lg font-black tabular-nums tracking-[-0.035em] !text-white">
              {hasValue && supportsCommission
                ? moneyFormatter.format(calculation.tipCommission)
                : "0 Kč"}
            </p>
          </div>
        </div>

        {hasValue && positionReady && !supportsCommission ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900 ring-1 ring-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Tento produkt nemá ve stávajícím provizním modelu samostatnou složku{" "}
            {commissionCode}.
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default function TipOfferPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [advisor, setAdvisor] = useState<AdvisorInfo>({
    fullName: "",
    email: "",
    phone: "",
    ico: "",
    position: null,
    onlineCardSlug: "",
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [onlineCardQrDataUrl, setOnlineCardQrDataUrl] = useState("");
  const [onlineCardQrLoading, setOnlineCardQrLoading] = useState(false);
  const [onlineCardRequiredOpen, setOnlineCardRequiredOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<TipOfferProductId, ProductDraft>>(
    initialDrafts
  );
  const [printSelection, setPrintSelection] = useState<Set<TipOfferProductId>>(
    () => new Set()
  );
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const signedDateIso = useMemo(() => currentIsoDay(), []);
  const generatedDate = useMemo(() => generatedDateFormatter.format(new Date()), []);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user || !effectiveEmail) {
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setProfileLoading(true);
      setProfileError(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
          user,
          "/api/user/profile",
          { headers: { [ADMIN_IMPERSONATION_HEADER]: effectiveEmail } }
        );
        if (cancelled) return;
        const profile = payload.profile ?? null;
        setAdvisor(advisorFromProfile({ profile, email: effectiveEmail }));
      } catch (error) {
        if (cancelled) return;
        console.warn("Načtení profilu pro nabídku TIP selhalo:", error);
        setAdvisor(advisorFromProfile({ profile: null, email: effectiveEmail }));
        setProfileError("Nepodařilo se načíst aktuální pozici. Obnov stránku a zkus to znovu.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [effectiveEmail, user]);

  useEffect(() => {
    let cancelled = false;
    const generateQrCode = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const slug = advisor.onlineCardSlug.trim();
      if (!slug) {
        setOnlineCardQrDataUrl("");
        setOnlineCardQrLoading(false);
        return;
      }

      setOnlineCardQrDataUrl("");
      setOnlineCardQrLoading(true);
      try {
        const qrCodeModule = await import("qrcode");
        const origin = window.location.origin;
        const dataUrl = await qrCodeModule.default.toDataURL(
          `${origin}/vizitka/${encodeURIComponent(slug)}`,
          {
            width: 600,
            margin: 1,
            errorCorrectionLevel: "M",
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          }
        );
        if (!cancelled) setOnlineCardQrDataUrl(dataUrl);
      } catch (error) {
        console.error("Generování QR kódu online vizitky selhalo:", error);
        if (!cancelled) setOnlineCardQrDataUrl("");
      } finally {
        if (!cancelled) setOnlineCardQrLoading(false);
      }
    };

    void generateQrCode();
    return () => {
      cancelled = true;
    };
  }, [advisor.onlineCardSlug]);

  const productResults = useMemo(() => {
    const entries = TIP_OFFER_PRODUCTS.map((definition): [TipOfferProductId, ProductResult] => {
      const draft = drafts[definition.id] ?? DEFAULT_PRODUCT_DRAFT;
      const premium = parsePremium(draft.premium);
      return [
        definition.id,
        {
          definition,
          draft,
          premium,
          calculation: calculateTipOfferProduct({
            definition,
            position: advisor.position,
            premium,
            tipPercent: draft.tipPercent,
            durationYears: draft.durationYears,
            signedDateIso,
          }),
        },
      ];
    });
    return Object.fromEntries(entries) as Record<TipOfferProductId, ProductResult>;
  }, [advisor.position, drafts, signedDateIso]);

  const commissionSupport = useMemo(() => {
    const entries = TIP_OFFER_PRODUCTS.map((definition) => [
      definition.id,
      calculateTipOfferProduct({
        definition,
        position: advisor.position,
        premium: 1_000,
        tipPercent: 30,
        durationYears: 30,
        signedDateIso,
      }).hasCommission,
    ]);
    return Object.fromEntries(entries) as Record<TipOfferProductId, boolean>;
  }, [advisor.position, signedDateIso]);

  const filledResults = useMemo(
    () =>
      TIP_OFFER_PRODUCTS.map((definition) => productResults[definition.id]).filter(
        (result) => result.premium > 0
      ),
    [productResults]
  );

  const printResults = useMemo(
    () =>
      filledResults.filter((result) => printSelection.has(result.definition.id)),
    [filledResults, printSelection]
  );

  const totals = useMemo(
    () =>
      filledResults.reduce(
        (sum, result) => ({
          tip: sum.tip + result.calculation.tipCommission,
        }),
        { tip: 0 }
      ),
    [filledResults]
  );

  const normalizedQuery = normalizeSearch(search);
  const visibleGroups = useMemo(
    () =>
      TIP_OFFER_GROUPS.map((group) => ({
        ...group,
        products: group.products.filter((definition) => {
          if (activeCategory !== "all" && group.id !== activeCategory) return false;
          if (!normalizedQuery) return true;
          const metadata = getProductMetadata(definition.calculatorProduct);
          return normalizeSearch(
            `${definition.label} ${metadata?.institutionLabel ?? ""} ${group.label}`
          ).includes(normalizedQuery);
        }),
      })).filter((group) => group.products.length > 0),
    [activeCategory, normalizedQuery]
  );

  const updateDraft = (id: TipOfferProductId, patch: Partial<ProductDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? DEFAULT_PRODUCT_DRAFT), ...patch },
    }));
    if (patch.premium !== undefined) {
      const previouslyHadPremium = productResults[id].premium > 0;
      const hasPremium = parsePremium(patch.premium) > 0;
      setPrintSelection((current) => {
        const next = new Set(current);
        if (!previouslyHadPremium && hasPremium) next.add(id);
        if (!hasPremium) next.delete(id);
        return next;
      });
    }
  };

  const togglePrintSelection = (id: TipOfferProductId) => {
    if (productResults[id].premium <= 0) return;
    setPrintSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllTipPercents = (tipPercent: number) => {
    setDrafts((current) =>
      Object.fromEntries(
        TIP_OFFER_PRODUCTS.map((definition) => [
          definition.id,
          {
            ...(current[definition.id] ?? DEFAULT_PRODUCT_DRAFT),
            tipPercent,
          },
        ])
      ) as Record<TipOfferProductId, ProductDraft>
    );
  };

  const printOffer = () => {
    if (!advisor.onlineCardSlug) {
      setOnlineCardRequiredOpen(true);
      return;
    }
    if (
      printResults.length === 0 ||
      !advisor.position ||
      !onlineCardQrDataUrl
    ) {
      return;
    }
    window.setTimeout(() => window.print(), 0);
  };

  const printButtonDisabled =
    printResults.length === 0 ||
    !advisor.position ||
    onlineCardQrLoading ||
    (Boolean(advisor.onlineCardSlug) && !onlineCardQrDataUrl);

  return (
    <AppLayout active="tools">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          body {
            background: #ffffff !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden !important;
          }

          body aside,
          body header {
            display: none !important;
          }

          .app-content {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
          }

          #tip-offer-print,
          #tip-offer-print * {
            visibility: visible !important;
          }

          #tip-offer-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            box-sizing: border-box !important;
            padding: 10mm !important;
            color: #0f172a !important;
            font-family: Arial, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #tip-offer-print > header {
            display: block !important;
          }

          #tip-offer-screen {
            display: none !important;
          }

          #tip-offer-print .tip-print-card,
          #tip-offer-print .tip-print-advisor {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <main
        id="tip-offer-screen"
        className={`${pageFont.className} min-h-screen bg-white px-4 pb-20 pt-5 text-slate-950 sm:px-6 lg:px-8`}
      >
        <div className="mx-auto w-full max-w-[1480px]">
          <Link
            href="/pomucky"
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-800"
          >
            <ArrowLeft className="h-4 w-4" /> Zpět na pomůcky
          </Link>

          <section className="relative isolate overflow-hidden rounded-[34px] border border-violet-100 bg-[linear-gradient(128deg,#ffffff_0%,#fbfaff_46%,#f1ebff_100%)] px-5 py-6 shadow-[0_28px_80px_rgba(76,29,149,0.13),inset_0_1px_0_rgba(255,255,255,1)] sm:px-8 sm:py-8 lg:px-10">
            <span className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
            <span className="pointer-events-none absolute bottom-[-10rem] left-[35%] h-72 w-72 rounded-full bg-fuchsia-300/15 blur-3xl" />
            <HandCoins
              className="pointer-events-none absolute right-8 top-1/2 hidden h-48 w-48 -translate-y-1/2 rotate-[-8deg] text-violet-700/[0.055] lg:block"
              strokeWidth={1.1}
              aria-hidden="true"
            />

            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-[0.7rem] font-black uppercase tracking-[0.18em] text-violet-700 shadow-sm backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" /> Finance • kalkulace spolupráce
                </span>
                <h1 className="mt-4 text-4xl font-black tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-6xl">
                  TIPAŘ
                </h1>
                <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg">
                  Připrav přehlednou nabídku odměn za doporučení. Každý výpočet vychází
                  z příslušné základní provize pro tvoji aktuální pozici.
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="rounded-[20px] border border-white bg-white/82 px-4 py-3 shadow-[0_14px_30px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur">
                  <p className="text-[0.64rem] font-black uppercase tracking-[0.14em] text-slate-500">
                    Aktuální pozice
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-black text-slate-950">
                    {profileLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                    ) : (
                      <UserRound className="h-4 w-4 text-violet-700" />
                    )}
                    {profileLoading
                      ? "Načítám…"
                      : positionLabel(advisor.position, { emptyLabel: "Nenastavena" })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={printOffer}
                  disabled={printButtonDisabled}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[20px] border border-violet-600 bg-[linear-gradient(145deg,#6d28d9_0%,#8b5cf6_58%,#a855f7_100%)] px-5 text-sm font-black !text-white shadow-[0_16px_30px_rgba(109,40,217,0.30),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(109,40,217,0.36)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                >
                  <Printer className="h-5 w-5" /> Tisk nabídky
                </button>
              </div>
            </div>
          </section>

          {profileError ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
              {profileError}
            </p>
          ) : null}

          <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-3 rounded-[24px] border border-violet-200 bg-violet-50/70 px-5 py-4 shadow-[0_14px_30px_rgba(109,40,217,0.07)]">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm ring-1 ring-violet-100">
                <Info className="h-5 w-5" />
              </span>
              <div>
                <p className="font-black text-slate-950">Doporučený podíl je do 30 %</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  TIP provize se počítá pouze z A101; výjimkou je pojištění cizinců MAXIMA,
                  kde se počítá z provize A501. U neživotních produktů počítáme s roční
                  frekvencí placení. U života používáme průměr NEON a FLEXI, u cestovního
                  pojištění průměr ČPP, AXA a Kooperativy.
                </p>
              </div>
            </div>
            <div className="flex min-w-[245px] items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.07)]">
              <div>
                <p className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-slate-500">
                  Součet TIP provizí
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums tracking-[-0.04em] text-violet-800">
                  {moneyFormatter.format(totals.tip)}
                </p>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <BadgeDollarSign className="h-6 w-6" />
              </span>
            </div>
          </section>

          <section className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/75 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1 lg:max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Hledat produkt nebo instituci"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                    activeCategory === "all"
                      ? "border-violet-700 bg-violet-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.2)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
                  }`}
                >
                  Všechny
                </button>
                {TIP_OFFER_GROUPS.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveCategory(group.id)}
                    className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                      activeCategory === group.id
                        ? "border-violet-700 bg-violet-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.2)]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAllTipPercents(30)}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 text-xs font-black text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
              >
                <BadgeDollarSign className="h-4 w-4" /> Nastavit všude 30 %
              </button>
            </div>
          </section>

          <div className="mt-8 space-y-9">
            {visibleGroups.map((group) => {
              const visual = GROUP_VISUALS[group.id];
              const GroupIcon = visual.icon;
              return (
                <section key={group.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${visual.iconTint}`}>
                      <GroupIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-xl font-black tracking-[-0.035em] text-slate-950">
                        {group.label}
                      </h2>
                      <p className="text-xs font-semibold text-slate-500">
                        {group.products.length} {group.products.length === 1 ? "produkt" : "produktů"}
                      </p>
                    </div>
                    <span className="h-px flex-1 bg-gradient-to-r from-violet-200 to-transparent" />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.products.map((definition) => (
                      <ProductCard
                        key={definition.id}
                        groupId={group.id}
                        result={productResults[definition.id]}
                        supportsCommission={commissionSupport[definition.id]}
                        positionReady={Boolean(advisor.position)}
                        selectedForPrint={printSelection.has(definition.id)}
                        onDraftChange={(patch) => updateDraft(definition.id, patch)}
                        onTogglePrint={() => togglePrintSelection(definition.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {visibleGroups.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-violet-200 bg-violet-50/40 px-6 py-12 text-center">
                <Search className="mx-auto h-8 w-8 text-violet-400" />
                <p className="mt-3 font-black text-slate-900">Žádný produkt neodpovídá hledání.</p>
              </div>
            ) : null}
          </div>

          <section className="mt-8 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <FileText className="h-6 w-6" />
              </span>
              <div>
                <p className="font-black text-slate-950">Nabídka TIP spolupráce</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Do tisku se vloží {printResults.length} označených produktů, logo Bohemika
                  a tvoje kontaktní vizitka s QR kódem. Vyplněno máš celkem{" "}
                  {filledResults.length} produktů.
                </p>
                {!profileLoading && !advisor.onlineCardSlug ? (
                  <p className="mt-2 text-xs font-bold text-amber-700">
                    Pro tisk nejdřív publikuj svou online vizitku v Nastavení.
                  </p>
                ) : onlineCardQrLoading ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-violet-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Připravuji QR kód…
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={printOffer}
              disabled={printButtonDisabled}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black !text-white shadow-[0_12px_26px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <Printer className="h-4.5 w-4.5" /> Vytisknout nabídku
              <ChevronRight className="h-4 w-4" />
            </button>
          </section>
        </div>
      </main>

      {onlineCardRequiredOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Zavřít upozornění"
            onClick={() => setOnlineCardRequiredOpen(false)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tipar-online-card-required-title"
            className={`${pageFont.className} relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.36)]`}
          >
            <div className="relative overflow-hidden bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_58%,#a855f7_100%)] px-6 py-6 text-white">
              <span className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                <QrCode className="h-6 w-6 !text-white" />
              </span>
              <h2
                id="tipar-online-card-required-title"
                className="mt-4 text-2xl font-black tracking-[-0.035em] !text-white"
              >
                Zapni si online vizitku
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 !text-violet-100">
                Každá vytištěná nabídka musí obsahovat QR kód na tvoji online vizitku.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                <p className="text-sm font-semibold leading-6 text-slate-700">
                  V Nastavení vyplň a publikuj online vizitku. Po návratu se QR kód načte
                  automaticky a tisk se zpřístupní.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setOnlineCardRequiredOpen(false)}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Zůstat zde
                </button>
                <Link
                  href="/nastaveni?tab=onlineCard"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black !text-white shadow-[0_12px_24px_rgba(109,40,217,0.25)] transition hover:-translate-y-0.5 hover:bg-violet-800"
                >
                  Nastavit vizitku <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <section id="tip-offer-print" className="hidden">
        <header className="relative mb-5 overflow-hidden rounded-[22px] border border-violet-200 bg-[linear-gradient(125deg,#ffffff_0%,#f7f3ff_56%,#eee7ff_100%)] p-5">
          <span className="absolute -right-12 -top-20 h-48 w-48 rounded-full bg-violet-300/30" />
          <span className="absolute bottom-0 left-0 h-1.5 w-full bg-[linear-gradient(90deg,#6d28d9_0%,#8b5cf6_55%,#c084fc_100%)]" />
          <div className="relative flex items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <div
                role="img"
                aria-label="Bohemika – kovové B"
                className="h-[86px] w-[62px] shrink-0"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #0f172a 0%, #64748b 16%, #f8fafc 30%, #94a3b8 43%, #ffffff 54%, #475569 69%, #e2e8f0 82%, #111827 100%)",
                  WebkitMaskImage: "url('/icons/bohemika_logo.png')",
                  WebkitMaskPosition: "center",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskSize: "contain",
                  maskImage: "url('/icons/bohemika_logo.png')",
                  maskPosition: "center",
                  maskRepeat: "no-repeat",
                  maskSize: "contain",
                }}
              />
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-700">
                  Bohemika • odměna za doporučení
                </p>
                <h1 className="mt-1.5 text-[27px] font-black tracking-[-0.04em] text-slate-950">
                  Nabídka TIP spolupráce
                </h1>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  Přehled odměn podle vybraného pojištění a pojistného
                </p>
              </div>
            </div>
            <div className="shrink-0 overflow-hidden rounded-2xl border border-violet-200 bg-white/85 px-4 py-3 text-right shadow-sm">
                <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Připraveno
                </p>
                <p className="mt-1 text-[12px] font-black text-slate-950">{generatedDate}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2.5">
          {printResults.map((result) => {
            const metadata = getProductMetadata(result.definition.calculatorProduct);
            const printGroup = getTipOfferGroup(result.definition.id);
            const PrintGroupIcon = printGroup
              ? GROUP_VISUALS[printGroup.id].icon
              : ShieldCheck;
            const groupLabel = getPrintGroupLabel(result.definition.id);
            const showProductLabel =
              normalizeSearch(result.definition.label) !== normalizeSearch(groupLabel);
            return (
              <article
                key={result.definition.id}
                className="tip-print-card relative overflow-hidden rounded-[15px] border border-slate-200 bg-white p-2.5 pt-3"
              >
                <span className="absolute left-0 top-0 h-[3px] w-full bg-[linear-gradient(90deg,#6d28d9_0%,#a855f7_100%)]" />
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                    <PrintGroupIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase leading-tight tracking-[0.07em] text-violet-700">
                      {groupLabel}
                    </p>
                    {showProductLabel ? (
                      <h2 className="mt-1 text-[12px] font-black leading-tight text-slate-950">
                        {result.definition.label}
                      </h2>
                    ) : null}
                    {showProductLabel && metadata?.institutionLabel ? (
                      <p className="mt-0.5 text-[7px] font-bold text-slate-500">
                        {metadata.institutionLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 items-center gap-1.5 border-t border-slate-100 pt-2">
                  <div>
                    <dt className="text-[7px] font-bold uppercase tracking-[0.1em] text-slate-500">
                      {result.definition.premiumLabel}
                    </dt>
                    <dd className="mt-0.5 text-[10px] font-black text-slate-950">
                      {moneyFormatter.format(result.premium)}
                    </dd>
                    <dd className="text-[6.5px] font-semibold text-slate-500">
                      {result.definition.premiumPeriodLabel}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-violet-700 px-2 py-1.5 text-white">
                    <dt className="text-[6.5px] font-bold uppercase tracking-[0.09em] !text-violet-100">
                      TIP provize
                    </dt>
                    <dd className="mt-0.5 text-[11px] font-black !text-white">
                      {decimalMoneyFormatter.format(result.calculation.tipCommission)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>

        <section className="tip-print-advisor mt-6 overflow-hidden rounded-[20px] border border-violet-200 bg-[linear-gradient(135deg,#ffffff_0%,#f5f3ff_100%)]">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white">
              <UserRound className="h-7 w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-violet-700">
                Nabídku připravil/a
              </p>
              <p className="mt-1 text-lg font-black text-slate-950">{advisor.fullName}</p>
              <p className="text-[10px] font-bold text-slate-500">
                {advisorRoleLabel(advisor.position)} • Bohemika a.s.
              </p>
            </div>
            <div className="space-y-2 text-[10px] font-bold text-slate-700">
              {advisor.phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-violet-700" /> {advisor.phone}
                </p>
              ) : null}
              {advisor.email ? (
                <p className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-violet-700" /> {advisor.email}
                </p>
              ) : null}
              {advisor.ico ? (
                <p className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-3.5 w-3.5 text-violet-700" /> IČO:{" "}
                  {advisor.ico}
                </p>
              ) : null}
            </div>
            {onlineCardQrDataUrl ? (
              <div className="ml-2 shrink-0 text-center">
                <Image
                  src={onlineCardQrDataUrl}
                  alt={`QR kód online vizitky ${advisor.fullName}`}
                  width={88}
                  height={88}
                  unoptimized
                  className="h-[74px] w-[74px] rounded-lg border border-slate-200 bg-white p-1"
                />
                <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.08em] text-violet-700">
                  Online vizitka
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between bg-violet-700 px-5 py-2.5 text-[9px] font-bold text-white">
            <span className="!text-white">Bohemika a.s. • finance srozumitelně</span>
            <span className="flex items-center gap-1.5 !text-violet-100">
              <Clock3 className="h-3 w-3" /> Nabídka je orientační
            </span>
          </div>
        </section>
      </section>
    </AppLayout>
  );
}
