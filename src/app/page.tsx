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
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
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

function commissionItemsForPosition(
  entry: EntryDoc,
  pos: Position
): CommissionResultItemDTO[] {
  const product = entry.productKey;
  const amount = entry.inputAmount ?? 0;
  const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
  const duration =
    typeof entry.durationYears === "number" && !Number.isNaN(entry.durationYears)
      ? entry.durationYears
      : 15;
  const mode = (entry.commissionMode ?? "accelerated") as CommissionMode;

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
  items?: CommissionResultItemDTO[];

  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  durationYears?: number | null;
  commissionMode?: CommissionMode | null;
  position?: Position | null;
};

type UserMeta = {
  position?: Position;
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

// ---------- komponenta ----------

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);

  const [myContractsCount, setMyContractsCount] = useState(0);
  const [myImmediateSum, setMyImmediateSum] = useState(0);

  const [teamContractsCount, setTeamContractsCount] = useState(0);
  const [teamImmediateSum, setTeamImmediateSum] = useState(0);

  const [teamEntries, setTeamEntries] = useState<EntryDoc[]>([]);
  const [hasTeam, setHasTeam] = useState(false);

  const [lbProductFilter, setLbProductFilter] =
    useState<LeaderboardProductFilter>("life");
  const [lbRange, setLbRange] = useState<LeaderboardRange>("month");

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

  // načtení statistik
  useEffect(() => {
    if (!user?.email) return;

    const load = async () => {
      setLoading(true);

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
        if (meSnap.exists()) {
          const d = meSnap.data() as any;
          position = d.position as Position | undefined;
          monthlyGoal = (d.monthlyGoal as number | undefined) ?? null;
        }

        setUserMeta({
          position,
          monthlyGoal: monthlyGoal ?? null,
        });

        const isManager = isManagerPosition(position);

        // 2) moje smlouvy
        const myQ = query(
          collectionGroup(db, "entries"),
          where("userEmail", "==", email)
        );
        const mySnap = await getDocs(myQ);

        let myCount = 0;
        let myImmediate = 0;

        mySnap.forEach((docSnap) => {
          const data = docSnap.data() as any as EntryDoc;
          const signed = toDate((data as any).contractSignedDate) ?? toDate(data.createdAt);
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
            const signed = toDate((data as any).contractSignedDate) ?? toDate(data.createdAt);
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
                  commissionItemsForPosition(data, mgrPos).find((i) =>
                    (i.title ?? "").toLowerCase().includes("okamžitá")
                  )?.amount ?? 0;
                const subImmediate =
                  commissionItemsForPosition(data, comparePos ?? subPos).find((i) =>
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
      } catch (e) {
        console.error("Chyba při načítání produkce:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

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
      const signed =
        toDate((entry as any).contractSignedDate) ??
        toDate(entry.createdAt);
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
      </div>
    </AppLayout>
  );
}
