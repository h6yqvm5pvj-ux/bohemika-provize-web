// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { AutoAnniversaryModal } from "@/components/AutoAnniversaryModal";
import {
  type CommissionResultItemDTO,
  type Position,
  type Product,
  type PaymentFrequency,
  type CommissionMode,
} from "./types/domain";
import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculateMaxdomov,
  calculateCppAuto,
  calculateAllianzAuto,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateComfortCC,
} from "./lib/productFormulas";

// ---------- helpers ----------

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as any).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

function entrySignedDate(entry: { contractSignedDate?: any; createdAt?: any }): Date | null {
  return toDate(entry.contractSignedDate) ?? toDate(entry.createdAt) ?? null;
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function normalizeToMonthly(amount: number, frequency?: PaymentFrequency | null): number {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "semiannual":
      return amount / 6;
    case "annual":
    default:
      return amount / 12;
  }
}

function normalizeToAnnual(amount: number, frequency?: PaymentFrequency | null): number {
  switch (frequency) {
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "semiannual":
      return amount * 2;
    case "annual":
    default:
      return amount;
  }
}

function commissionItemsForPosition(
  entry: EntryDoc,
  pos: Position,
  modeOverride?: CommissionMode | null
): CommissionResultItemDTO[] {
  const product = entry.productKey;
  const amount = entry.inputAmount ?? 0;
  const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
  const duration =
    typeof entry.durationYears === "number" && !Number.isNaN(entry.durationYears)
      ? entry.durationYears
      : 15;
  const mode = (modeOverride ?? entry.commissionMode ?? "accelerated") as CommissionMode;

  switch (product) {
    case "neon":
      return calculateNeon(amount, pos, duration, mode).items;
    case "flexi":
      return calculateFlexi(amount, pos, mode).items;
    case "maximaMaxEfekt":
      return calculateMaxEfekt(amount, duration, pos, mode).items;
    case "pillowInjury":
      return calculatePillowInjury(amount, pos, mode).items;
    case "domex":
      return calculateDomex(amount, freq, pos).items;
    case "maxdomov":
      return calculateMaxdomov(amount, freq, pos).items;
    case "cppAuto":
      return calculateCppAuto(amount, freq, pos).items;
    case "allianzAuto":
      return calculateAllianzAuto(amount, freq, pos).items;
    case "csobAuto":
      return calculateCsobAuto(amount, freq, pos).items;
    case "uniqaAuto":
      return calculateUniqaAuto(amount, freq, pos).items;
    case "cppPPRs":
      return calculateCppPPRs(amount, freq, pos).items;
    case "cppPPRbez":
      return calculateCppPPRbez(amount, freq, pos).items;
    case "pillowAuto":
      return calculatePillowAuto(amount, freq, pos).items;
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, freq, pos).items;
    case "zamex":
      return calculateZamex(amount, freq, pos).items;
    case "cppcestovko":
      return calculateCppCestovko(amount, pos).items;
    case "axacestovko":
      return calculateAxaCestovko(amount, pos).items;
    case "comfortcc":
      return calculateComfortCC({
        fee: amount,
        payment: entry.comfortPayment ?? 0,
        isSavings: !!entry.comfortGradual,
        isGradualFee: !!entry.comfortGradual,
        position: pos,
      }).items;
    default:
      return [];
  }
}

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý poradce";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;

  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  return parts.map(cap).join(" ");
}

const MONTH_LABELS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

// ---------- typy ----------

type EntryDoc = {
  id: string;
  userEmail?: string | null;
  createdAt?: any;
  contractSignedDate?: any;
  items?: CommissionResultItemDTO[];

  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  durationYears?: number | null;
  commissionMode?: CommissionMode | null;
  position?: Position | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
};

type UserMeta = {
  position?: Position;
  commissionMode?: CommissionMode | null;
  monthlyGoal?: number | null;
  managerEmail?: string | null;
};

type LeaderboardProductFilter = "life" | "other";
type LeaderboardRange = "month" | "sixMonths" | "year";

type TeamLeaderboardEntry = {
  email: string;
  name: string;
  totalPremium: number;
};

// ---------- animace čísel ----------

function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const initial = value;
    const diff = target - initial;

    if (diff === 0) return;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = initial + diff * eased;
      setValue(Math.round(current));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

function AnimatedNumber({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const animated = useAnimatedNumber(value, duration);
  return (
    <span>
      {animated.toLocaleString("cs-CZ", {
        maximumFractionDigits: 0,
      })}
    </span>
  );
}

function AnimatedMoney({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const animated = useAnimatedNumber(value, duration);
  return <span>{formatMoney(animated)}</span>;
}

function SplitTextHeading({ text }: { text: string }) {
  const words = text.split(" ").filter(Boolean);
  return (
    <div className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight flex flex-wrap">
      <style jsx>{`
        @keyframes splitRise {
          0% {
            opacity: 0;
            transform: translateY(110%) skewY(6deg);
            filter: blur(6px);
          }
          60% {
            opacity: 1;
            transform: translateY(-6%) skewY(0deg);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) skewY(0deg);
            filter: blur(0);
          }
        }
      `}</style>
      {words.map((word, idx) => (
        <span
          key={`${word}-${idx}`}
          className="relative flex overflow-hidden mr-3 last:mr-0 gap-[2px]"
        >
          {Array.from(word).map((char, charIdx) => (
            <span
              key={`${word}-${idx}-${char}-${charIdx}`}
              className="inline-block text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.6)]"
              style={{
                animation:
                  "splitRise 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                animationDelay: `${(idx * 8 + charIdx) * 38}ms`,
                transform: "translateY(120%) skewY(8deg)",
                opacity: 0,
              }}
            >
              {char}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

type PersonalSeriesPoint = {
  label: string;
  lifeMonthly: number;
  otherAnnual: number;
  totalCombined: number;
};

type ChartMode = "personal" | "team" | "combined" | "specific";

function PersonalProductionChart({ data }: { data: PersonalSeriesPoint[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const plotWidth = Math.max(640, data.length * 48);
  const plotHeight = 180;
  const paddingX = 36;
  const paddingY = 24;
  const viewWidth = plotWidth + paddingX * 2;
  const viewHeight = plotHeight + paddingY * 2 + 26;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const maxValue = Math.max(...data.map((d) => d.totalCombined), 1);
  const hasData = data.some((d) => d.totalCombined > 0);

  const yFor = (value: number) =>
    paddingY + plotHeight - (Math.min(maxValue, value) / maxValue) * plotHeight;

  const points = data.map((d, i) => ({
    x: paddingX + step * i,
    y: yFor(d.totalCombined),
  }));

  const totalPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 1
      ? [
          `M${points[0].x.toFixed(1)},${paddingY + plotHeight}`,
          ...points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
          `L${points[points.length - 1].x.toFixed(1)},${paddingY + plotHeight}`,
          "Z",
        ].join(" ")
      : "";

  const latest = data[data.length - 1] ?? { lifeMonthly: 0, otherAnnual: 0, totalCombined: 0 };
  const selected =
    selectedIdx != null && selectedIdx >= 0 && selectedIdx < data.length
      ? data[selectedIdx]
      : null;
  const tooltipX = selectedIdx != null ? paddingX + step * selectedIdx : 0;
  const tooltipY =
    selected != null
      ? yFor(selected.totalCombined)
      : 0;
  const tooltipWidth = 220;
  const tooltipHeight = 74;
  const tooltipXClamped = Math.max(
    8,
    Math.min(tooltipX - tooltipWidth / 2, viewWidth - tooltipWidth - 8)
  );
  const tooltipYClamped = Math.max(
    8,
    Math.min(tooltipY - tooltipHeight - 12, viewHeight - tooltipHeight - 8)
  );

  return (
    <div className="rounded-3xl border border-white/12 bg-white/4 backdrop-blur-2xl p-6 shadow-[0_22px_80px_rgba(0,0,0,0.85)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            Graf produkce — posledních 12 měsíců
          </h2>
          <p className="text-xs text-slate-300">
            Život = měsíční pojistné, vedlejší produkty = roční pojistné
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-200">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            Celkem (život měsíčně + vedlejší ročně)
            <span className="font-semibold text-white">
              {formatMoney(latest.totalCombined)}
            </span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label="Graf osobní produkce za 12 měsíců"
            className="w-full"
          >
            <defs>
              <linearGradient id="totalLine" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(103,232,249,0.25)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.03)" />
              </linearGradient>
              <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.35)" />
              </filter>
            </defs>

            <g>
              {points.map((p, i) => {
                return (
                  <line
                    key={`grid-${i}`}
                    x1={p.x}
                    x2={p.x}
                    y1={paddingY}
                    y2={paddingY + plotHeight}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>

            {/* horizontální grid */}
            {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = paddingY + plotHeight * ratio;
              const value = maxValue * (1 - ratio);
              return (
                <g key={`hgrid-${idx}`}>
                  <line
                    x1={paddingX}
                    x2={paddingX + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                  <text
                    x={paddingX + plotWidth + 8}
                    y={y + 4}
                    fontSize="10"
                    fill="rgba(148,163,184,0.75)"
                  >
                    {formatMoney(Math.round(value))}
                  </text>
                </g>
              );
            })}

            {hasData && areaPath && (
              <path d={areaPath} fill="url(#areaFill)" stroke="none" />
            )}

            <path
              d={totalPath}
              fill="none"
              stroke="url(#totalLine)"
              strokeWidth={4}
              strokeLinecap="round"
            />

            {points.map((p, i) => {
              const d = data[i];
              const { x, y: yTotal } = p;
              return (
                <g
                  key={`pt-${i}`}
                  className="cursor-pointer"
                  onClick={() => setSelectedIdx(i)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedIdx(i);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <circle cx={x} cy={yTotal} r={12} fill="transparent" />
                  <circle
                    cx={x}
                    cy={yTotal}
                    r={4}
                    fill="#67e8f9"
                    stroke={selectedIdx === i ? "#a5f3fc" : "#0ea5e9"}
                    strokeWidth={1.5}
                  />
                  {selectedIdx === i && (
                    <circle
                      cx={x}
                      cy={yTotal}
                      r={7.5}
                      fill="none"
                      stroke="rgba(103,232,249,0.4)"
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={x}
                    y={paddingY + plotHeight + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgba(226,232,240,0.8)"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {selected && (
              <g transform={`translate(${tooltipXClamped}, ${tooltipYClamped})`}>
                <rect
                  x={0}
                  y={0}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={10}
                  ry={10}
                  fill="rgba(15,23,42,0.9)"
                  stroke="rgba(148,163,184,0.4)"
                  strokeWidth={1}
                  filter="url(#tooltipShadow)"
                />
                <text
                  x={12}
                  y={18}
                  fontSize="11"
                  fill="rgba(226,232,240,0.9)"
                >
                  {selected.label}
                </text>
                <text
                  x={12}
                  y={36}
                  fontSize="12"
                  fill="#67e8f9"
                  fontWeight={600}
                >
                  Celkem: {formatMoney(selected.totalCombined)}
                </text>
                <text
                  x={12}
                  y={52}
                  fontSize="12"
                  fill="#6ee7b7"
                  fontWeight={600}
                >
                  Život: {formatMoney(selected.lifeMonthly)}
                </text>
                <text
                  x={12}
                  y={68}
                  fontSize="12"
                  fill="#a5f3fc"
                  fontWeight={600}
                >
                  Vedlejší: {formatMoney(selected.otherAnnual)}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {!hasData && (
        <p className="mt-3 text-xs text-slate-300">
          Zatím žádná osobní produkce v posledních 12 měsících – jakmile přibydou
          smlouvy, graf se vyplní.
        </p>
      )}
    </div>
  );
}


// ---------- komponenta ----------

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);

  const [myContractsCount, setMyContractsCount] = useState(0);
  const [myImmediateSum, setMyImmediateSum] = useState(0);
  const [myEntries, setMyEntries] = useState<EntryDoc[]>([]);

  const [teamContractsCount, setTeamContractsCount] = useState(0);
  const [teamImmediateSum, setTeamImmediateSum] = useState(0);

  const [teamEntries, setTeamEntries] = useState<EntryDoc[]>([]);
  const [hasTeam, setHasTeam] = useState(false);

  const [lbProductFilter, setLbProductFilter] =
    useState<LeaderboardProductFilter>("life");
  const [lbRange, setLbRange] = useState<LeaderboardRange>("month");
  const [chartMode, setChartMode] = useState<ChartMode>("personal");
  const [selectedSubordinate, setSelectedSubordinate] = useState<string | null>(null);
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subSearch, setSubSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const now = new Date();
  const monthLabel = MONTH_LABELS[now.getMonth()];
  const monthLabelCapitalized =
    monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const year = now.getFullYear();

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        router.push("/login");
        return;
      }
      setUser(fbUser);
      setAuthReady(true);
    });

    return () => unsub();
  }, [router]);

  type HomeCache = {
    myContractsCount: number;
    myImmediateSum: number;
    myEntries: EntryDoc[];
    teamContractsCount: number;
    teamImmediateSum: number;
    teamEntries: EntryDoc[];
    userMeta: UserMeta | null;
    hasTeam: boolean;
    cachedAt: number;
  };

  const applyCache = (cache: HomeCache) => {
    setUserMeta(cache.userMeta);
    setMyContractsCount(cache.myContractsCount);
    setMyImmediateSum(cache.myImmediateSum);
    setMyEntries(cache.myEntries ?? []);
    setTeamContractsCount(cache.teamContractsCount);
    setTeamImmediateSum(cache.teamImmediateSum);
    setTeamEntries(cache.teamEntries ?? []);
    setHasTeam(cache.hasTeam);
  };

  // načtení statistik
  useEffect(() => {
    if (!user?.email) return;

    const nowDate = new Date();
    const cacheKey = `home-prod-${user.email.toLowerCase()}-${nowDate.getFullYear()}-${nowDate.getMonth()}`;
    let cached: HomeCache | null = null;

    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(cacheKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as HomeCache;
        if (parsed && typeof parsed.cachedAt === "number") {
          cached = parsed;
          applyCache(parsed);
          setLoading(false);
        }
      }
    } catch (e) {
      console.warn("Nešlo načíst cache produkce", e);
    }

    const load = async () => {
      setLoading(!cached);

      try {
        const email = user.email!;
        const usersRef = collection(db, "users");

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 1) meta o uživateli
        const meSnap = await getDoc(doc(usersRef, email));
        let position: Position | undefined;
        let monthlyGoal: number | null | undefined;
        let myMode: CommissionMode | null = null;
        if (meSnap.exists()) {
          const d = meSnap.data() as any;
          position = d.position as Position | undefined;
          monthlyGoal = (d.monthlyGoal as number | undefined) ?? null;
          myMode = (d.commissionMode as CommissionMode | undefined) ?? null;
        }

        setUserMeta({
          position,
          commissionMode: myMode,
          monthlyGoal: monthlyGoal ?? null,
        });

        const isManager = isManagerPosition(position);
        const managerMode = (myMode as CommissionMode | null) ?? null;

        // 2) moje smlouvy
        const myQ = query(
          collectionGroup(db, "entries"),
          where("userEmail", "==", email)
        );
        const mySnap = await getDocs(myQ);
        const myEntriesList: EntryDoc[] = [];

        let myCount = 0;
        let myImmediate = 0;

        mySnap.forEach((docSnap) => {
          const data = docSnap.data() as any as EntryDoc;
          myEntriesList.push({
            ...data,
            id: docSnap.id,
          });
          const signed = entrySignedDate(data);
          if (!signed) return;
          if (
            signed.getFullYear() !== currentYear ||
            signed.getMonth() !== currentMonth
          ) {
            return;
          }

          myCount += 1;

          const items = (data.items ?? []) as CommissionResultItemDTO[];
          const immediate = items.find((it) =>
            (it.title ?? "").toLowerCase().includes("okamžitá provize")
          );
          if (immediate?.amount) {
            myImmediate += immediate.amount;
          }
        });

        setMyContractsCount(myCount);
        setMyImmediateSum(myImmediate);
        setMyEntries(myEntriesList);

        // 3) tým – jen pokud je manažer
        if (!isManager) {
          setTeamContractsCount(0);
          setTeamImmediateSum(0);
          setTeamEntries([]);
          setHasTeam(false);
          setLoading(false);
          return;
        }

        const subsQ = query(
          usersRef,
          where("managerEmail", "==", email)
        );
        const subsSnap = await getDocs(subsQ);
        const directSubs = subsSnap.docs.map((d) => d.data() as any);

        // BFS pro celý strom podřízených (podřízený manažer má své další)
        const visited = new Set<string>();
        const subPositionMap = new Map<string, Position | undefined>();
        const managerOf = new Map<string, string | null>();
        const queue: string[] = [];

        for (const u of directSubs) {
          const em = (u.email as string | undefined)?.toLowerCase();
          if (!em) continue;
          visited.add(em);
          queue.push(em);
          subPositionMap.set(em, u.position as Position | undefined);
          managerOf.set(em, email.toLowerCase());
        }

        while (queue.length > 0) {
          const currentManager = queue.shift()!;
          const subSnap = await getDocs(
            query(usersRef, where("managerEmail", "==", currentManager))
          );
          subSnap.forEach((docSnap) => {
            const d = docSnap.data() as any;
            const em = (d.email as string | undefined)?.toLowerCase();
            if (!em || visited.has(em)) return;
            visited.add(em);
            queue.push(em);
            subPositionMap.set(em, d.position as Position | undefined);
            managerOf.set(em, currentManager);
          });
        }

        const subEmails = Array.from(visited);

        if (subEmails.length === 0) {
          setHasTeam(false);
          setTeamContractsCount(0);
          setTeamImmediateSum(0);
          setTeamEntries([]);
          setLoading(false);
          return;
        }

        setHasTeam(true);

        let teamCount = 0;
        let teamImmediate = 0;
        const teamEntriesAll: EntryDoc[] = [];

        const chunks: string[][] = [];
        for (let i = 0; i < subEmails.length; i += 10) {
          chunks.push(subEmails.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const teamQ = query(
            collectionGroup(db, "entries"),
            where("userEmail", "in", chunk)
          );

          const teamSnap = await getDocs(teamQ);

          teamSnap.forEach((docSnap) => {
            const data = docSnap.data() as any as EntryDoc;
            const ownerEmail = (data.userEmail ?? "").toLowerCase();

            // pro leaderboard ukládáme všechny záznamy
            teamEntriesAll.push({
              ...(data as any),
              id: docSnap.id,
            } as EntryDoc);

            // pro horní "Týmovou produkci" počítáme jen aktuální měsíc
            const signed = entrySignedDate(data);
            if (!signed) return;
            if (
              signed.getFullYear() !== currentYear ||
              signed.getMonth() !== currentMonth
            ) {
              return;
            }

            teamCount += 1;

            const items = (data.items ?? []) as CommissionResultItemDTO[];
            const immediate = items.find((it) =>
              (it.title ?? "").toLowerCase().includes("okamžitá provize")
            );

            if (immediate?.amount) {
              const mgrPos = position;
              const subPos =
                subPositionMap.get(ownerEmail) ??
                (data.position as Position | undefined) ??
                null;
              const ownerManagerEmail = managerOf.get(ownerEmail) ?? null;
              const ownerManagerPos = ownerManagerEmail
                ? subPositionMap.get(ownerManagerEmail) ?? null
                : null;
              const comparePos = ownerManagerPos ?? subPos;
              if (mgrPos && subPos) {
                const mgrImmediate =
                  commissionItemsForPosition(
                    data,
                    mgrPos,
                    managerMode
                  ).find((i) =>
                    (i.title ?? "").toLowerCase().includes("okamžitá")
                  )?.amount ?? 0;
                const subImmediate =
                  commissionItemsForPosition(
                    data,
                    comparePos ?? subPos,
                    managerMode
                  ).find((i) =>
                    (i.title ?? "").toLowerCase().includes("okamžitá")
                  )?.amount ?? 0;
                const diff = Math.max(0, mgrImmediate - subImmediate);
                teamImmediate += diff;
              } else {
                teamImmediate += immediate.amount;
              }
            }
          });
        }

        setTeamContractsCount(teamCount);
        setTeamImmediateSum(teamImmediate);
        setTeamEntries(teamEntriesAll);
        setHasTeam(teamCount > 0);

        const cachePayload: HomeCache = {
          myContractsCount: myCount,
          myImmediateSum: myImmediate,
          myEntries: myEntriesList,
          teamContractsCount: teamCount,
          teamImmediateSum: teamImmediate,
          teamEntries: teamEntriesAll,
          userMeta: {
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          },
          hasTeam: teamCount > 0,
          cachedAt: Date.now(),
        };
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          } catch (err) {
            console.warn("Cache produkce se nepodařilo uložit", err);
          }
        }
      } catch (e) {
        console.error("Chyba při načítání produkce:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  useEffect(() => {
    if (!hasTeam) {
      setChartMode("personal");
      setSelectedSubordinate(null);
    }
  }, [hasTeam]);

  const isManager = isManagerPosition(userMeta?.position ?? null);
  const showTeamBox = isManager && hasTeam;

  const baseProduction = myImmediateSum;
  const totalWithTeam =
    baseProduction + (isManager ? teamImmediateSum : 0);
  const totalContractsCount =
    myContractsCount + (showTeamBox ? teamContractsCount : 0);

  const monthlyGoal = userMeta?.monthlyGoal ?? null;
  const hasGoal = monthlyGoal != null && monthlyGoal > 0;
  const progress = hasGoal
    ? Math.min(100, Math.round((totalWithTeam / monthlyGoal) * 100))
    : 0;
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const remainingToGoal = hasGoal
    ? Math.max(0, monthlyGoal - totalWithTeam)
    : 0;
  const dailyNeeded =
    hasGoal && daysLeft > 0 && remainingToGoal > 0
      ? Math.ceil(remainingToGoal / daysLeft)
      : 0;
  const dailyPace =
    dayOfMonth > 0 ? Math.round(totalWithTeam / dayOfMonth) : 0;
  const projectedMonthTotal =
    dayOfMonth > 0 ? Math.round(dailyPace * daysInMonth) : 0;
  const progressTone =
    progress >= 90
      ? "from-emerald-400 via-lime-300 to-emerald-200"
      : progress >= 60
      ? "from-amber-400 via-orange-300 to-yellow-200"
      : "from-rose-500 via-red-400 to-orange-300";

  const subordinates = useMemo(() => {
    const map = new Map<string, { email: string; name: string }>();
    for (const entry of teamEntries) {
      const email = (entry.userEmail ?? "").toLowerCase();
      if (!email) continue;
      if (map.has(email)) continue;
      map.set(email, { email, name: nameFromEmail(email) });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "cs")
    );
  }, [teamEntries]);

  const chartEntries = useMemo(() => {
    if (!hasTeam) return myEntries;
    switch (chartMode) {
      case "team":
        return teamEntries;
      case "combined":
        return [...myEntries, ...teamEntries];
      case "specific":
        if (!selectedSubordinate) return [];
        return teamEntries.filter(
          (e) => (e.userEmail ?? "").toLowerCase() === selectedSubordinate
        );
      case "personal":
      default:
        return myEntries;
    }
  }, [chartMode, hasTeam, myEntries, teamEntries, selectedSubordinate]);

  const personalProductionSeries = useMemo(() => {
    const lifeProducts: Product[] = [
      "neon",
      "flexi",
      "maximaMaxEfekt",
      "pillowInjury",
    ];

    type MonthRow = PersonalSeriesPoint & { key: string };
    const months: MonthRow[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const shortMonth = MONTH_LABELS[d.getMonth()].slice(0, 3);
      months.push({
        key,
        label: `${shortMonth} ${String(d.getFullYear()).slice(2)}`,
        lifeMonthly: 0,
        otherAnnual: 0,
        totalCombined: 0,
      });
    }

    const monthIndex = new Map(months.map((m, idx) => [m.key, idx]));

    for (const entry of chartEntries) {
      const signed = entrySignedDate(entry);
      if (!signed) continue;

      const key = `${signed.getFullYear()}-${signed.getMonth()}`;
      const idx = monthIndex.get(key);
      if (idx === undefined) continue;

      const amount =
        entry.inputAmount ??
        (entry.comfortPayment != null ? entry.comfortPayment : 0);
      if (!amount || !Number.isFinite(amount)) continue;

      const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
      const isLife =
        entry.productKey != null &&
        lifeProducts.includes(entry.productKey as Product);

      if (isLife) {
        months[idx].lifeMonthly += normalizeToMonthly(amount, freq);
      } else {
        months[idx].otherAnnual += normalizeToAnnual(amount, freq);
      }
      months[idx].totalCombined =
        months[idx].lifeMonthly + months[idx].otherAnnual;
    }

    return months as PersonalSeriesPoint[];
  }, [chartEntries]);

  // ---------- žebříček týmu ----------

  const leaderboardEntries: TeamLeaderboardEntry[] = useMemo(() => {
    if (!isManager || !hasTeam || teamEntries.length === 0) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const lifeProducts: Product[] = [
      "neon",
      "flexi",
      "maximaMaxEfekt",
      "pillowInjury",
    ];

    const sums = new Map<string, number>();

    for (const entry of teamEntries) {
      const signed = entrySignedDate(entry);
      if (!signed) continue;

      // filtr rozsahu
      if (lbRange === "month") {
        if (
          signed.getFullYear() !== currentYear ||
          signed.getMonth() !== currentMonth
        ) {
          continue;
        }
      } else if (lbRange === "year") {
        if (signed.getFullYear() !== currentYear) continue;
      } else if (lbRange === "sixMonths") {
        if (signed < sixMonthsAgo) continue;
      }

      const pk = entry.productKey;
      const isLife =
        pk != null && lifeProducts.includes(pk as Product);

      if (lbProductFilter === "life" && !isLife) continue;
      if (lbProductFilter === "other" && isLife) continue;

      const email = entry.userEmail ?? "";
      if (!email) continue;

      const premium = entry.inputAmount ?? 0;
      if (!premium || !Number.isFinite(premium)) continue;

      const prev = sums.get(email) ?? 0;
      sums.set(email, prev + premium);
    }

    const rows: TeamLeaderboardEntry[] = Array.from(sums.entries())
      .map(([email, totalPremium]) => ({
        email,
        name: nameFromEmail(email),
        totalPremium,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium);

    return rows;
  }, [isManager, hasTeam, teamEntries, lbProductFilter, lbRange]);

  const leaderboardLabel =
    lbProductFilter === "life"
      ? "Životní pojištění"
      : "Vedlejší produkty";

  if (!authReady || !user) return null;

  return (
    <AppLayout active="home">
      {user && <AutoAnniversaryModal userId={user.uid} />}
      <div className="w-full max-w-5xl space-y-6">
        <div className="pt-2">
          <SplitTextHeading
            text={`Produkce ${monthLabelCapitalized} ${year}`}
          />
        </div>

        {/* PRODUKCE BOX */}
        <section className="rounded-3xl border border-white/12 bg-white/2 backdrop-blur-2xl px-5 py-5 sm:px-8 sm:py-7 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
          <div
            className={`grid gap-6 ${
              showTeamBox ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            {/* VLASTNÍ PRODUKCE */}
            <div className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-50">
                Vlastní produkce
              </h2>

              {loading ? (
                <p className="text-xs sm:text-sm text-slate-300">
                  Načítám…
                </p>
              ) : (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">
                      Počet smluv
                    </dt>
                    <dd className="text-2xl sm:text-3xl font-semibold text-slate-50 mt-0.5">
                      <AnimatedNumber value={myContractsCount} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">
                      Provize
                    </dt>
                    <dd className="text-2xl sm:text-3xl font-semibold text-slate-50 mt-0.5">
                      <AnimatedMoney value={myImmediateSum} />
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* TÝMOVÁ PRODUKCE – jen manažer S týmem */}
            {showTeamBox && (
              <div className="space-y-3">
                <h2 className="text-lg sm:text-xl font-semibold text-emerald-200">
                  Týmová produkce
                </h2>

                {loading ? (
                  <p className="text-xs sm:text-sm text-emerald-100/80">
                    Načítám…
                  </p>
                ) : (
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                        Počet smluv
                      </dt>
                      <dd className="text-2xl sm:text-3xl font-semibold text-emerald-100 mt-0.5">
                        <AnimatedNumber value={teamContractsCount} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                        Provize
                      </dt>
                      <dd className="text-2xl sm:text-3xl font-semibold text-emerald-100 mt-0.5">
                        <AnimatedMoney value={teamImmediateSum} />
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            )}

            {/* CELKOVÁ PRODUKCE */}
            <div className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-cyan-100">
                Celková produkce
              </h2>

              {loading ? (
                <p className="text-xs sm:text-sm text-cyan-100/80">
                  Načítám…
                </p>
              ) : (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-cyan-200/80">
                      Počet smluv
                    </dt>
                    <dd className="text-2xl sm:text-3xl font-semibold text-cyan-50 mt-0.5">
                      <AnimatedNumber value={totalContractsCount} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-cyan-200/80">
                      Provize
                    </dt>
                    <dd className="text-2xl sm:text-3xl font-semibold text-cyan-50 mt-0.5">
                      <AnimatedMoney value={totalWithTeam} />
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
        </section>

        <div
          className={`grid gap-6 ${
            isManager && hasTeam ? "md:grid-cols-2" : "md:grid-cols-1"
          }`}
        >
          {/* MĚSÍČNÍ CÍL */}
          <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-6 sm:px-10 sm:py-7 shadow-[0_24px_80px_rgba(0,0,0,0.85)] h-full">
            <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.25),transparent_60%)]" />
            <div className="pointer-events-none absolute right-0 bottom-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.2),transparent_65%)]" />

            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">
                  Měsíční cíl
                </h2>
                <p className="mt-1 text-xs text-slate-300">
                  Aktuálně{" "}
                  <span className="font-semibold text-slate-50">
                    <AnimatedMoney value={totalWithTeam} />
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-right text-xs sm:text-sm">
                  <div className="text-slate-400">Plnění cíle</div>
                  <div className="text-base sm:text-lg font-semibold">
                    {progress}%
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Cíl na měsíc:{" "}
                    <span className="font-medium text-slate-100">
                      {monthlyGoal ? formatMoney(monthlyGoal) : "—"}
                    </span>
                  </div>
                </div>
                <Link
                  href="/nastaveni"
                  className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white/90 hover:bg-white/10 transition backdrop-blur-sm"
                >
                  Upravit cíl
                </Link>
              </div>
            </div>

            <div className="relative mt-3 grid gap-3 sm:grid-cols-3 text-xs text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.55)] backdrop-blur">
                <div className="text-[11px] uppercase tracking-wide text-slate-300">
                  Do cíle zbývá
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {hasGoal
                    ? remainingToGoal === 0
                      ? "Splněno"
                      : formatMoney(remainingToGoal)
                    : "Nastav cíl"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {hasGoal ? `${progress}% hotovo` : "Cíl není nastaven"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.55)] backdrop-blur">
                <div className="text-[11px] uppercase tracking-wide text-slate-300">
                  Denní tempo k cíli
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {hasGoal
                    ? dailyNeeded > 0
                      ? formatMoney(dailyNeeded)
                      : "Hotovo"
                    : "—"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {daysLeft > 0 ? `Zbývá ${daysLeft} dní` : "Konec měsíce"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.55)] backdrop-blur">
                <div className="text-[11px] uppercase tracking-wide text-slate-300">
                  Odhad na konec měsíce
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {projectedMonthTotal > 0
                    ? formatMoney(projectedMonthTotal)
                    : "—"}
                </div>
                <div className="text-[11px] text-slate-400">
                  Tempo za {dayOfMonth}. den měsíce
                </div>
              </div>
            </div>

            {/* progress bar */}
            <div className="relative mt-4 h-3 w-full rounded-full bg-white/10 border border-white/15 backdrop-blur-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/4 to-transparent" />
              <div
                className={`relative h-full rounded-full bg-gradient-to-r ${progressTone} transition-all duration-500 ease-out shadow-[0_0_24px_rgba(255,255,255,0.35)]`}
                style={{
                  width: `${progress}%`,
                  boxShadow:
                    progress >= 90
                      ? "0 0 28px rgba(52, 211, 153, 0.45)"
                      : progress >= 60
                      ? "0 0 24px rgba(251, 146, 60, 0.4)"
                      : "0 0 22px rgba(248, 113, 113, 0.45)",
                }}
              />
            </div>
          </section>

          {/* ŽEBŘÍČEK TÝMU – pouze manažer s podřízenými */}
          {isManager && hasTeam && (
            <section className="rounded-3xl border border-emerald-400/40 bg-emerald-500/5 backdrop-blur-2xl px-6 py-6 sm:px-10 sm:py-7 shadow-[0_30px_90px_rgba(0,0,0,0.9)] h-full">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-emerald-100">
                    Žebříček týmu
                  </h2>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-2 text-[11px] sm:text-xs">
                  <div className="inline-flex rounded-full bg-emerald-900/50 border border-emerald-400/50 p-1">
                    <button
                      type="button"
                      onClick={() => setLbProductFilter("life")}
                      className={`px-3 py-1.5 rounded-full transition ${
                        lbProductFilter === "life"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-emerald-100 hover:bg-white/5"
                      }`}
                    >
                      Život
                    </button>
                    <button
                      type="button"
                      onClick={() => setLbProductFilter("other")}
                      className={`px-3 py-1.5 rounded-full transition ${
                        lbProductFilter === "other"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-emerald-100 hover:bg-white/5"
                      }`}
                    >
                      Vedlejší produkty
                    </button>
                  </div>

                  <div className="inline-flex rounded-full bg-emerald-900/50 border border-emerald-400/50 p-1">
                    <button
                      type="button"
                      onClick={() => setLbRange("month")}
                      className={`px-3 py-1.5 rounded-full transition ${
                        lbRange === "month"
                          ? "bg-emerald-400 text-slate-900 shadow-md"
                          : "text-emerald-100 hover:bg-white/5"
                      }`}
                    >
                      Aktuální měsíc
                    </button>
                    <button
                      type="button"
                      onClick={() => setLbRange("sixMonths")}
                      className={`px-3 py-1.5 rounded-full transition ${
                        lbRange === "sixMonths"
                          ? "bg-emerald-400 text-slate-900 shadow-md"
                          : "text-emerald-100 hover:bg-white/5"
                      }`}
                    >
                      Posledních 6 měsíců
                    </button>
                    <button
                      type="button"
                      onClick={() => setLbRange("year")}
                      className={`px-3 py-1.5 rounded-full transition ${
                        lbRange === "year"
                          ? "bg-emerald-400 text-slate-900 shadow-md"
                          : "text-emerald-100 hover:bg-white/5"
                      }`}
                    >
                      Aktuální rok
                    </button>
                  </div>
                </div>
              </div>

              {leaderboardEntries.length === 0 ? (
                <p className="text-xs sm:text-sm text-emerald-100/80">
                  Pro zvolené období a typ produktu zatím nemá tým žádnou
                  produkci.
                </p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {leaderboardEntries.slice(0, 10).map((row, idx) => (
                    <li
                      key={row.email}
                      className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-slate-950/80 to-slate-950/90 px-4 py-3 sm:px-5 sm:py-4"
                    >
                      <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.35),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.3),transparent_55%)]" />

                      <div className="relative flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                              idx === 0
                                ? "bg-amber-400 text-slate-900"
                                : idx === 1
                                ? "bg-slate-300 text-slate-900"
                                : idx === 2
                                ? "bg-amber-700 text-slate-50"
                                : "bg-emerald-900/70 text-emerald-200"
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div>
                            <div className="text-sm sm:text-base font-semibold text-slate-50">
                              {row.name}
                            </div>
                            <div className="text-[11px] text-emerald-200/80">
                              {leaderboardLabel}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-emerald-300/90">
                            Pojistné
                          </div>
                          <div className="text-lg sm:text-xl font-semibold text-emerald-100">
                            <AnimatedMoney value={row.totalPremium} />
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/3 backdrop-blur-2xl px-5 py-5 sm:px-7 sm:py-6 shadow-[0_22px_80px_rgba(0,0,0,0.85)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-white">
                Osobní produkce — posledních 12 měsíců
              </h2>
              <p className="text-xs text-slate-300">
                Život = měsíční pojistné, vedlejší produkty = roční pojistné
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-slate-900/60 border border-white/10 p-1 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setChartMode("personal")}
                  className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                    chartMode === "personal"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Osobní
                </button>
                {hasTeam && (
                  <>
                    <button
                      type="button"
                      onClick={() => setChartMode("team")}
                      className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                        chartMode === "team"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      Týmová
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode("combined")}
                      className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                        chartMode === "combined"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      Souhrnná
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSubPickerOpen(true);
                        setChartMode("specific");
                      }}
                      className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                        chartMode === "specific"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      Konkrétní
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-200">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-300" />
                  Celkem (život měsíčně + vedlejší ročně)
                  <span className="font-semibold text-white">
                    {formatMoney(
                      personalProductionSeries[personalProductionSeries.length - 1]
                        ?.totalCombined ?? 0
                    )}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {chartMode === "specific" && hasTeam && (
            <div className="mb-3 rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-slate-200">
                  {selectedSubordinate
                    ? `Vybraný podřízený: ${
                        subordinates.find((s) => s.email === selectedSubordinate)?.name ??
                        selectedSubordinate
                      }`
                    : "Vyber podřízeného"}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubPickerOpen(true)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10 transition"
                  >
                    Změnit výběr
                  </button>
                  {selectedSubordinate && (
                    <button
                      type="button"
                      onClick={() => setSelectedSubordinate(null)}
                      className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/5 transition"
                    >
                      Vymazat
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <PersonalProductionChart data={personalProductionSeries} />
        </section>

        {subPickerOpen && hasTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setSubPickerOpen(false)}
            />
            <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/90 shadow-[0_26px_90px_rgba(0,0,0,0.9)] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Vyber podřízeného</h3>
                  <p className="text-xs text-slate-300">
                    Filtruješ graf pouze na zvoleného člověka.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubPickerOpen(false)}
                  className="text-slate-200 hover:text-white text-lg leading-none"
                  aria-label="Zavřít"
                >
                  ×
                </button>
              </div>

              <input
                type="text"
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                placeholder="Hledej podle jména nebo e-mailu"
                className="w-full rounded-xl bg-slate-800/80 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />

              <div className="max-h-72 overflow-auto space-y-2">
                {subordinates
                  .filter(
                    (s) =>
                      !subSearch ||
                      s.name.toLowerCase().includes(subSearch.toLowerCase()) ||
                      s.email.toLowerCase().includes(subSearch.toLowerCase())
                  )
                  .map((s) => (
                    <button
                      key={s.email}
                      type="button"
                      onClick={() => {
                        setSelectedSubordinate(s.email);
                        setSubPickerOpen(false);
                        setChartMode("specific");
                      }}
                      className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                        selectedSubordinate === s.email
                          ? "bg-sky-500/15 border-sky-400/50 text-white"
                          : "bg-white/5 border-white/10 text-slate-200 hover:border-sky-400/60 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-300">{s.email}</div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
