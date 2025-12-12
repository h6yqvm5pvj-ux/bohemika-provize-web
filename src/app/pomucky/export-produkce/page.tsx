// src/app/pomucky/export-produkce/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "../../firebase";

import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { type Position } from "../../types/domain";
import SplitTitle from "../plan-produkce/SplitTitle";

/* -------------------- lazy import html2pdf.js (kvůli Next/SSR) -------------------- */

let html2pdfPromise: Promise<any> | null = null;

async function getHtml2Pdf() {
  if (!html2pdfPromise) {
    html2pdfPromise = import("html2pdf.js").then(
      // knihovna nemá oficiální typy
      (mod: unknown) =>
        (mod as { default?: unknown }).default ??
        (mod as Record<string, unknown>)
    );
  }
  return html2pdfPromise;
}

/* --------------------------------- typy --------------------------------- */

// Lokální definice typu Product – stačí to, co tahle stránka používá
type Product =
  | "neon"
  | "flexi"
  | "maximaMaxEfekt"
  | "pillowInjury"
  | "zamex"
  | "domex"
  | "maxdomov"
  | "cppAuto"
  | "allianzAuto"
  | "csobAuto"
  | "uniqaAuto"
  | "pillowAuto"
  | "kooperativaAuto"
  | "cppcestovko"
  | "axacestovko"
  | "comfortcc";

type DateRangeOption =
  | "currentMonth"
  | "last3"
  | "last6"
  | "last12"
  | "currentYear";

type ScopeOption = "own" | "team" | "selected";

type ProductCategory = "life" | "nonlife" | "auto" | "property";

type EntryDoc = {
  id: string;
  userEmail?: string | null;
  createdAt?: any;
  contractSignedDate?: any;
  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: string | null;
};

type Subordinate = {
  email: string;
  name: string;
  position?: Position | null;
};

type AggregatedStats = {
  lifeMonthly: number;
  lifeAnnual: number;
  lifeContracts: number;
  nonLifeAnnual: number;
  nonLifeContracts: number;
  autoAnnual: number;
  autoContracts: number;
  propertyAnnual: number;
  propertyContracts: number;
};

type PerUserStats = AggregatedStats & {
  email: string;
  name: string;
  positionLabel?: string | null;
};

/* ---------------------------- produktové skupiny ------------------------ */

const LIFE_PRODUCTS: Product[] = [
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
];

const AUTO_PRODUCTS: Product[] = [
  "cppAuto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
];

const PROPERTY_PRODUCTS: Product[] = [
  "domex",
  "maxdomov",
  "zamex",
  "cppcestovko",
  "axacestovko",
];

function productCategory(p: Product): ProductCategory {
  if (LIFE_PRODUCTS.includes(p)) return "life";
  if (AUTO_PRODUCTS.includes(p)) return "auto";
  if (PROPERTY_PRODUCTS.includes(p)) return "property";
  return "nonlife";
}

const POSITION_LABELS: Record<Position, string> = {
  poradce1: "Poradce 1",
  poradce2: "Poradce 2",
  poradce3: "Poradce 3",
  poradce4: "Poradce 4",
  poradce5: "Poradce 5",
  poradce6: "Poradce 6",
  poradce7: "Poradce 7",
  poradce8: "Poradce 8",
  poradce9: "Poradce 9",
  poradce10: "Poradce 10",
  manazer4: "Manažer 4",
  manazer5: "Manažer 5",
  manazer6: "Manažer 6",
  manazer7: "Manažer 7",
  manazer8: "Manažer 8",
  manazer9: "Manažer 9",
  manazer10: "Manažer 10",
};

function productLabel(p: Product): string {
  switch (p) {
    case "neon":
      return "ČPP ŽP NEON";
    case "flexi":
      return "Kooperativa ŽP FLEXI";
    case "maximaMaxEfekt":
      return "MAXIMA ŽP MaxEfekt";
    case "pillowInjury":
      return "Pillow Úraz / Nemoc";
    case "zamex":
      return "ČPP ZAMEX";
    case "domex":
      return "ČPP DOMEX";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "allianzAuto":
      return "Allianz Auto";
    case "csobAuto":
      return "ČSOB Auto";
    case "uniqaAuto":
      return "UNIQA Auto";
    case "pillowAuto":
      return "Pillow Auto";
    case "kooperativaAuto":
      return "Kooperativa Auto";
    case "cppcestovko":
      return "ČPP Cestovko";
    case "axacestovko":
      return "AXA Cestovko";
    case "comfortcc":
      return "Comfort Commodity";
  }
}

/* -------------------------------- helpers ------------------------------- */

function emptyStats(): AggregatedStats {
  return {
    lifeMonthly: 0,
    lifeAnnual: 0,
    lifeContracts: 0,
    nonLifeAnnual: 0,
    nonLifeContracts: 0,
    autoAnnual: 0,
    autoContracts: 0,
    propertyAnnual: 0,
    propertyContracts: 0,
  };
}

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
    const v = value as { seconds: number; nanoseconds?: number };
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
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

function labelForDateRange(option: DateRangeOption): string {
  switch (option) {
    case "currentMonth":
      return "Aktuální měsíc";
    case "last3":
      return "Poslední 3 měsíce";
    case "last6":
      return "Posledních 6 měsíců";
    case "last12":
      return "Posledních 12 měsíců";
    case "currentYear":
      return "Aktuální rok";
  }
}

function labelForScope(option: ScopeOption): string {
  switch (option) {
    case "own":
      return "Vlastní produkce";
    case "team":
      return "Týmová produkce";
    case "selected":
      return "Vybraní podřízení";
  }
}

function positionLabel(pos?: Position | null): string | null {
  if (!pos) return null;
  return POSITION_LABELS[pos] ?? null;
}

function toAnnualPremium(
  amount: number,
  frequency: string | null | undefined
): number {
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

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// html2canvas neumí lab/oklch barvy → nahradíme je běžnými hex/barvami
function stripUnsupportedColors(html: string): string {
  return html.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");
}

function contractDate(entry: EntryDoc): Date | null {
  return (
    toDate((entry as any).contractSignedDate) ??
    toDate(entry.createdAt)
  );
}

function getDateRange(option: DateRangeOption): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (option) {
    case "currentMonth": {
      from.setDate(1);
      break;
    }
    case "last3": {
      from.setMonth(from.getMonth() - 3);
      break;
    }
    case "last6": {
      from.setMonth(from.getMonth() - 6);
      break;
    }
    case "last12": {
      from.setFullYear(from.getFullYear() - 1);
      break;
    }
    case "currentYear": {
      from.setMonth(0, 1);
      break;
    }
  }

  return { from, to };
}

/* ------------------------------- komponenta ----------------------------- */

export default function ExportProductionPage() {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("last3");
  const [scopeOption, setScopeOption] = useState<ScopeOption>("own");
  const [categories, setCategories] = useState<Set<ProductCategory>>(
    () => new Set<ProductCategory>(["life", "nonlife", "auto", "property"])
  );

  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingSubs, setLoadingSubs] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const hasTeam = subordinates.length > 0;
  const isTeamScope =
    scopeOption === "team" || scopeOption === "selected";

  /* ----------------------------- auth ----------------------------- */

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        router.push("/login");
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, [router]);

  /* ------------------------- podřízení --------------------------- */

  useEffect(() => {
    const loadSubs = async () => {
      if (!user?.email) return;

      const email = user.email.trim().toLowerCase();

      setLoadingSubs(true);
      setErrorText(null);

      try {
        // aktuální uživatel – kvůli pozici
        const meDoc = await getDocs(
          query(collection(db, "users"), where("email", "==", email))
        );
        const meData = meDoc.docs[0]?.data() as { position?: Position } | undefined;
        setCurrentUserPosition(meData?.position ?? null);

        const usersRef = collection(db, "users");
        const subsQ = query(
          usersRef,
          where("managerEmail", "==", email)
        );
        const subsSnap = await getDocs(subsQ);

        const list: Subordinate[] = subsSnap.docs.map((d) => {
          const data = d.data() as any;
          const e = (data.email as string | undefined) ?? d.id;
          return {
            email: e.toLowerCase(),
            name: (data.fullName as string | undefined) ?? nameFromEmail(e),
            position: data.position ?? null,
          };
        });

        list.sort((a, b) => a.name.localeCompare(b.name, "cs"));
        setSubordinates(list);
      } catch (e) {
        console.error("Chyba při načítání podřízených", e);
        setErrorText("Nepodařilo se načíst podřízené poradce.");
      } finally {
        setLoadingSubs(false);
      }
    };

    loadSubs();
  }, [user]);

  /* --------------------------- logo ------------------------------ */

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const res = await fetch("/icons/bohemika_logo.png");
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            setLogoDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error("Nepodařilo se načíst logo:", e);
      }
    };
    loadLogo();
  }, []);

  const selectedCategories = useMemo(
    () => categories,
    [categories]
  );

  /* -------------------------- UI helpers ------------------------- */

  const handleToggleCategory = (cat: ProductCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleToggleSubordinate = (email: string) => {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const validateScopeConfig = (): boolean => {
    if (scopeOption === "selected" && selectedSubs.size === 0) {
      setErrorText(
        "Vyber alespoň jednoho podřízeného pro rozsah „Vybraní podřízení“."
      );
      return false;
    }
    return true;
  };

  /* ---------------------- logika reportu ------------------------- */

  const buildReportHtml = async (): Promise<{
    html: string;
    filenameBase: string;
  }> => {
    if (!user?.email) {
      throw new Error("Uživatel není přihlášený.");
    }

    const email = user.email.trim().toLowerCase();
    const generatedAt = new Date();

    const { from, to } = getDateRange(dateRangeOption);

    // e-maily zahrnuté do exportu
    let emailsToLoad: string[] = [];

    if (scopeOption === "own") {
      emailsToLoad = [email];
    } else if (scopeOption === "team") {
      const subs = subordinates.map((s) => s.email);
      emailsToLoad = [email, ...subs];
    } else {
      emailsToLoad = Array.from(selectedSubs);
    }

    emailsToLoad = Array.from(new Set(emailsToLoad));

    // načíst smlouvy (entries)
    const allEntries: EntryDoc[] = [];

    await Promise.all(
      emailsToLoad.map(async (e) => {
        const qEntries = query(
          collectionGroup(db, "entries"),
          where("userEmail", "==", e)
        );
        const snap = await getDocs(qEntries);
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          allEntries.push({
            ...(data as any),
            id: docSnap.id,
          });
        });
      })
    );

    // filtrovat podle období
    const entriesInRange = allEntries.filter((entry) => {
      const signed = contractDate(entry);
      if (!signed) return false;
      return signed >= from && signed <= to;
    });

    // statistiky pro každého poradce
    const perUser = new Map<string, PerUserStats>();
    const perProduct = new Map<Product, { annual: number; contracts: number }>();
    const perMonth = new Map<string, { label: string; value: number }>();

    for (const entry of entriesInRange) {
      const e = (entry.userEmail ?? "").toLowerCase();
      if (!e) continue;

      const p = entry.productKey;
      if (!p) continue;
      // Comfort Commodity se do PDF neexportuje
      if ((p as any) === "comfortcc") continue;

      // filtr podle zvolených kategorií
      const cat = productCategory(p);
      if (!categories.has(cat)) continue;

      const created = contractDate(entry);
      if (!created) continue;

      const amount = entry.inputAmount ?? 0;
      if (!amount || !Number.isFinite(amount)) continue;

      const isLife = LIFE_PRODUCTS.includes(p);
      const isAuto = AUTO_PRODUCTS.includes(p);
      const isProperty = PROPERTY_PRODUCTS.includes(p);
      const isNonLife = !isLife;

      const annualForProduct = isLife
        ? amount * 12
        : toAnnualPremium(amount, entry.frequencyRaw);
      const prevProd = perProduct.get(p) ?? { annual: 0, contracts: 0 };
      perProduct.set(p, {
        annual: prevProd.annual + annualForProduct,
        contracts: prevProd.contracts + 1,
      });

      // měsíční agregace (podle data vytvoření)
      const ym = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = created.toLocaleDateString("cs-CZ", {
        month: "short",
        year: "numeric",
      });
      const prevMonth = perMonth.get(ym) ?? { label: monthLabel, value: 0 };
      perMonth.set(ym, {
        label: monthLabel,
        value: prevMonth.value + annualForProduct,
      });

      let stats = perUser.get(e);
      if (!stats) {
        const pos =
          e === email
            ? currentUserPosition
            : subordinates.find((s) => s.email === e)?.position ?? null;
        stats = {
          email: e,
          name:
            e === email
              ? nameFromEmail(e)
              : (subordinates.find((s) => s.email === e)?.name ??
                nameFromEmail(e)),
          positionLabel: positionLabel(pos),
          ...emptyStats(),
        };
        perUser.set(e, stats);
      }

      if (isLife) {
        stats.lifeMonthly += amount;
        stats.lifeContracts += 1;
      } else if (isNonLife) {
        const annual = toAnnualPremium(amount, entry.frequencyRaw);
        stats.nonLifeAnnual += annual;
        stats.nonLifeContracts += 1;

        if (isAuto) {
          stats.autoAnnual += annual;
          stats.autoContracts += 1;
        } else if (isProperty) {
          stats.propertyAnnual += annual;
          stats.propertyContracts += 1;
        }
      }
    }

    // dopočítat roční pojistné z life
    for (const stats of perUser.values()) {
      stats.lifeAnnual = stats.lifeMonthly * 12;
    }

    // souhrn
    const summary: AggregatedStats = emptyStats();

    for (const stats of perUser.values()) {
      summary.lifeMonthly += stats.lifeMonthly;
      summary.lifeAnnual += stats.lifeAnnual;
      summary.lifeContracts += stats.lifeContracts;
      summary.nonLifeAnnual += stats.nonLifeAnnual;
      summary.nonLifeContracts += stats.nonLifeContracts;
      summary.autoAnnual += stats.autoAnnual;
      summary.autoContracts += stats.autoContracts;
      summary.propertyAnnual += stats.propertyAnnual;
      summary.propertyContracts += stats.propertyContracts;
    }

    // hezký HTML layout (glassy cards)

    const adviserName = escapeHtml(nameFromEmail(email));
    const adviserEmail = escapeHtml(email);
    const dateLabel = escapeHtml(labelForDateRange(dateRangeOption));
    const scopeLabel = escapeHtml(labelForScope(scopeOption));
    const generatedLabel = escapeHtml(
      generatedAt.toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    );
    const periodFrom = escapeHtml(from.toLocaleDateString("cs-CZ"));
    const periodTo = escapeHtml(to.toLocaleDateString("cs-CZ"));

    const cats = selectedCategories;

    const includeLife = cats.has("life");
    const includeNonLife = cats.has("nonlife");
    const includeAuto = cats.has("auto");
    const includeProperty = cats.has("property");

    const perUserList = Array.from(perUser.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "cs")
    );

    // připravíme měsíční osu pro celé zvolené období (i když je hodnota 0)
    const monthKeys: { key: string; label: string }[] = [];
    const cursor = new Date(from);
    cursor.setDate(1);
    while (cursor <= to) {
      const key = `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}`;
      const label = cursor.toLocaleDateString("cs-CZ", {
        month: "short",
        year: "numeric",
      });
      monthKeys.push({ key, label });
      cursor.setMonth(cursor.getMonth() + 1);
      cursor.setDate(1);
    }

    const monthlyTotals = monthKeys.map(({ key, label }) => {
      const m = perMonth.get(key);
      return { label, value: m?.value ?? 0 };
    });

    const monthlyMax =
      monthlyTotals.length > 0
        ? Math.max(...monthlyTotals.map((m) => m.value))
        : 0;

    const logoHtml =
      logoDataUrl != null
        ? `<div class="logo"><img src="${logoDataUrl}" class="logo-img" /></div>`
        : `<div class="logo-placeholder">B</div>`;

    const summarySections: string[] = [];

    if (includeLife && (summary.lifeContracts > 0 || summary.lifeMonthly > 0)) {
      summarySections.push(`
        <div class="card">
          <div class="card-title">Životní pojištění</div>
          <div class="card-row">
            <span>Měsíční pojistné celkem</span>
            <span>${formatMoney(summary.lifeMonthly)}</span>
          </div>
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.lifeAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.lifeContracts}</span>
          </div>
        </div>
      `);
    }

    if (
      includeNonLife &&
      (summary.nonLifeContracts > 0 || summary.nonLifeAnnual > 0)
    ) {
      summarySections.push(`
        <div class="card">
          <div class="card-title">Neživotní pojištění</div>
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.nonLifeAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.nonLifeContracts}</span>
          </div>
        </div>
      `);
    }

    if (
      includeAuto &&
      (summary.autoContracts > 0 || summary.autoAnnual > 0)
    ) {
      summarySections.push(`
        <div class="card">
          <div class="card-title">Pojištění vozidel</div>
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.autoAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.autoContracts}</span>
          </div>
        </div>
      `);
    }

    if (
      includeProperty &&
      (summary.propertyContracts > 0 || summary.propertyAnnual > 0)
    ) {
      summarySections.push(`
        <div class="card">
          <div class="card-title">Majetek &amp; ostatní neživot</div>
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.propertyAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.propertyContracts}</span>
          </div>
        </div>
      `);
    }

    const teamCards: string[] = [];

    if (isTeamScope) {
      for (const stats of perUserList) {
        const userSections: string[] = [];

        if (includeLife && (stats.lifeContracts > 0 || stats.lifeMonthly > 0)) {
          userSections.push(`
            <div class="card-inner">
              <div class="card-subtitle">Životní pojištění</div>
              <div class="card-row">
                <span>Měsíční pojistné</span>
                <span>${formatMoney(stats.lifeMonthly)}</span>
              </div>
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.lifeAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.lifeContracts}</span>
              </div>
            </div>
          `);
        }

        if (
          includeNonLife &&
          (stats.nonLifeContracts > 0 || stats.nonLifeAnnual > 0)
        ) {
          userSections.push(`
            <div class="card-inner">
              <div class="card-subtitle">Neživotní pojištění</div>
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.nonLifeAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.nonLifeContracts}</span>
              </div>
            </div>
          `);
        }

        if (
          includeAuto &&
          (stats.autoContracts > 0 || stats.autoAnnual > 0)
        ) {
          userSections.push(`
            <div class="card-inner">
              <div class="card-subtitle">Pojištění vozidel</div>
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.autoAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.autoContracts}</span>
              </div>
            </div>
          `);
        }

        if (
          includeProperty &&
          (stats.propertyContracts > 0 || stats.propertyAnnual > 0)
        ) {
          userSections.push(`
            <div class="card-inner">
              <div class="card-subtitle">Majetek &amp; ostatní neživot</div>
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.propertyAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.propertyContracts}</span>
              </div>
            </div>
          `);
        }

        if (userSections.length === 0) continue;

        teamCards.push(`
          <div class="card card-user">
            <div class="card-user-header">
              <div class="avatar">${escapeHtml(
                stats.name.charAt(0).toUpperCase()
              )}</div>
              <div>
                <div class="card-user-name">${escapeHtml(stats.name)}</div>
                <div class="card-user-email">${escapeHtml(stats.email)}</div>
                ${
                  stats.positionLabel
                    ? `<div class="card-user-position">Pozice: ${escapeHtml(
                        stats.positionLabel
                      )}</div>`
                    : ""
                }
              </div>
            </div>
            <div class="card-user-body">
              ${userSections.join("")}
            </div>
          </div>
        `);
      }
    }

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px 0;
              background: linear-gradient(180deg,#e6ebfb 0%,#e9eefc 40%,#eef2ff 100%);
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                system-ui, -system-ui, sans-serif;
              color: #0f172a;
              -webkit-font-smoothing: antialiased;
            }
            .page {
              width: 760px;
              margin: 0 auto;
              background: #f8fbff;
              border-radius: 26px;
              border: 1px solid #d9e2f7;
              box-shadow:
                0 24px 80px rgba(15, 23, 42, 0.2),
                0 0 0 1px rgba(255,255,255,0.7) inset;
              padding: 32px 34px 36px;
            }
            .page-header {
              display: flex;
              align-items: center;
              gap: 16px;
              margin-bottom: 20px;
            }
            .logo {
              width: 52px;
              height: 52px;
              border-radius: 20px;
              background: linear-gradient(135deg,#e0f2fe,#dbeafe);
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 10px 30px rgba(37, 99, 235, 0.45);
            }
            .logo-img {
              max-width: 36px;
              max-height: 36px;
            }
            .logo-placeholder {
              font-weight: 700;
              font-size: 26px;
              color: #1d4ed8;
            }
            .title-block h1 {
              margin: 0;
              font-size: 22px;
              letter-spacing: 0.02em;
            }
            .title-block p {
              margin: 2px 0 0;
              font-size: 12px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: #64748b;
            }
            .info-card {
              margin-top: 8px;
              padding: 14px 16px;
              border-radius: 18px;
              background: rgba(255,255,255,0.95);
              border: 1px solid rgba(148, 163, 184, 0.35);
              box-shadow: 0 14px 40px rgba(15, 23, 42, 0.2);
              font-size: 12px;
              line-height: 1.6;
            }
            .info-card strong { font-weight: 600; }
            .divider {
              margin: 20px 0;
              border-bottom: 1px solid rgba(148, 163, 184, 0.5);
            }
            .section-title {
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 10px;
            }
            .card-grid {
              display: flex;
              flex-direction: column;
              gap: 10px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .card-grid > * {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .card {
              border-radius: 18px;
              background: linear-gradient(135deg,#ffffff,#f5f7fb);
              border: 1px solid #d6e0f2;
              box-shadow:
                0 18px 55px rgba(15, 23, 42, 0.15),
                0 0 0 1px rgba(255,255,255,0.9) inset;
              padding: 14px 16px 14px;
              font-size: 12px;
            }
            .card-title {
              font-size: 14px;
              font-weight: 600;
              margin-bottom: 6px;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: #1d4ed8;
            }
            .card-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin-top: 3px;
              align-items: center;
            }
            .card-row span:first-child { color: #475569; }
            .card-row span:last-child {
              font-weight: 600;
              color: #0f172a;
            }
            .card-row.subtle span:last-child {
              font-weight: 500;
              color: #1e293b;
            }
            .card-user { margin-top: 10px; }
            .card-user-header {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 6px;
            }
            .card-user,
            .card {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .card-user-body,
            .card-inner {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .avatar {
              width: 26px;
              height: 26px;
              border-radius: 999px;
              background: linear-gradient(135deg,#22c55e,#16a34a);
              color: #ecfdf5;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
              font-weight: 600;
            }
            .card-user-name {
              font-size: 13px;
              font-weight: 600;
            }
            .card-user-email {
              font-size: 11px;
              color: #64748b;
            }
            .card-user-position {
              font-size: 11px;
              color: #475569;
              font-weight: 600;
            }
            .product-table {
              width: 100%;
              border-spacing: 0;
              margin-top: 10px;
              font-size: 12px;
              border-radius: 14px;
              overflow: hidden;
              box-shadow: 0 10px 28px rgba(15,23,42,0.12);
            }
            .product-table thead {
              background: linear-gradient(135deg,#eef2ff,#e6ecfd);
              color: #1e293b;
            }
            .product-table th {
              padding: 10px 12px;
              text-align: left;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-transform: uppercase;
              font-size: 11px;
              border-bottom: 1px solid #dde5f7;
            }
            .product-table tbody tr:nth-child(odd) { background: #ffffff; }
            .product-table tbody tr:nth-child(even) { background: #f7f9ff; }
            .product-table td {
              padding: 10px 12px;
              border-bottom: 1px solid #e4eaf7;
              color: #334155;
              vertical-align: top;
            }
            .product-table td.product { width: 55%; text-align: left; }
            .product-table td.count { width: 15%; text-align: center; font-weight: 700; color: #0f172a; }
            .product-table td.amount { width: 30%; text-align: right; font-weight: 700; color: #0f172a; }
            .monthly-chart {
              display: flex;
              align-items: flex-end;
              gap: 10px;
              padding: 12px 10px 4px;
              border-radius: 14px;
              background: linear-gradient(180deg,#f7f9ff 0%,#eef3ff 100%);
              border: 1px solid #d6e0f2;
              box-shadow: 0 10px 28px rgba(15,23,42,0.08);
              min-height: 140px;
            }
            .monthly-bar {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 6px;
            }
            .monthly-bar .bar {
              width: 100%;
              max-width: 44px;
              border-radius: 12px 12px 6px 6px;
              background: linear-gradient(135deg,#60a5fa,#2563eb);
              box-shadow: 0 8px 16px rgba(37,99,235,0.25);
              transition: transform 0.2s ease;
            }
            .monthly-bar .value {
              font-size: 10px;
              color: #0f172a;
              font-weight: 700;
            }
            .monthly-bar .label {
              font-size: 10px;
              color: #475569;
              text-align: center;
            }
            .card-user-body {
              border-top: 1px solid rgba(148,163,184,0.45);
              margin-top: 6px;
              padding-top: 6px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 6px 16px;
            }
            .card-inner {
              border-radius: 12px;
              background: #ffffff;
              padding: 6px 8px;
              border: 1px solid #d7e1f3;
            }
            .card-subtitle {
              font-size: 11px;
              font-weight: 600;
              color: #1d4ed8;
              margin-bottom: 3px;
            }
            .footer-note {
              margin-top: 14px;
              font-size: 10px;
              color: #94a3b8;
            }
            @media print {
              body { background: #eef2ff; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="page-header">
              ${logoHtml}
              <div class="title-block">
                <h1>Produkce</h1>
                <p>${dateLabel}</p>
              </div>
            </div>

            <div class="info-card">
              <div><strong>Poradce:</strong> ${adviserName}</div>
              <div><strong>E-mail:</strong> ${adviserEmail}</div>
              <div><strong>Rozsah:</strong> ${scopeLabel}</div>
              <div><strong>Období:</strong> ${periodFrom} – ${periodTo}</div>
              <div><strong>Vygenerováno:</strong> ${generatedLabel}</div>
            </div>

            <div class="divider"></div>

            <div>
              <div class="section-title">Souhrn vybrané produkce</div>
              <div class="card-grid">
                ${
                  summarySections.length > 0
                    ? summarySections.join("")
                    : `<div class="card"><div class="card-row"><span>V zadaném období nebyly nalezeny žádné smlouvy.</span></div></div>`
                }
              </div>
            </div>

            ${
              perProduct.size > 0
                ? `
                  <div class="divider"></div>
                  <div>
                    <div class="section-title">Přehled podle produktu (roční pojistné)</div>
                    <table class="product-table">
                      <thead>
                        <tr>
                          <th>Produkt</th>
                          <th>Počet smluv</th>
                          <th>Sjednané pojistné</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${Array.from(perProduct.entries())
                          .sort((a, b) => b[1].annual - a[1].annual)
                          .map(
                            ([prod, vals]) => `
                              <tr>
                                <td class="product">${escapeHtml(productLabel(prod))}</td>
                                <td class="count">${vals.contracts}</td>
                                <td class="amount">${formatMoney(vals.annual)}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `
                : ""
            }

            ${
              monthlyTotals.length > 0
                ? `
                  <div class="divider"></div>
                  <div>
                    <div class="section-title">Vývoj produkce podle měsíců</div>
                    <div class="monthly-chart">
                      ${monthlyTotals
                        .map((m) => {
                          const height =
                            monthlyMax > 0
                              ? Math.max(12, Math.round((m.value / monthlyMax) * 100))
                              : 12;
                          return `
                            <div class="monthly-bar">
                              <div class="value">${formatMoney(m.value)}</div>
                              <div class="bar" style="height:${height}px"></div>
                              <div class="label">${escapeHtml(m.label)}</div>
                            </div>
                          `;
                        })
                        .join("")}
                    </div>
                  </div>
                `
                : ""
            }

            ${
              isTeamScope && teamCards.length > 0
                ? `
                  <div class="divider"></div>
                  <div>
                    <div class="section-title">Výkony jednotlivých poradců</div>
                    <div class="card-grid">
                      ${teamCards.join("")}
                    </div>
                  </div>
                `
                : ""
            }

            <div class="footer-note">
              PDF bylo vygenerováno z interní webové aplikace Bohemika Provize.
              Čísla jsou orientační a mohou se lišit od údajů v systémech
              jednotlivých společností.
            </div>
          </div>
        </body>
      </html>
    `;

    const filenameBase =
      scopeOption === "own"
        ? "produkce_own"
        : scopeOption === "team"
        ? "produkce_team"
        : "produkce_team_selected";

    return { html, filenameBase };
  };

  /* ---------------- akce: PDF + náhled ---------------- */

  const handleGeneratePdf = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    setGenerating(true);
    setErrorText(null);

    try {
      const { html, filenameBase } = await buildReportHtml();
      const safeHtml = stripUnsupportedColors(html);
      const html2pdf = await getHtml2Pdf();

      const opt: any = {
        margin: [10, 10, 10, 10],
        filename: `${filenameBase}_${dateRangeOption}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          onclone: (doc: Document) => {
            // Odstraníme všechny externí styly/linky kromě těch vygenerovaných v HTML
            doc.querySelectorAll("link[rel='stylesheet']").forEach((n) => n.remove());
            doc.querySelectorAll("style").forEach((n) => {
              const text = n.textContent ?? "";
              if (/(oklch|lab)\(/i.test(text)) n.remove();
            });
          },
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      };

      await (html2pdf() as any).set(opt).from(safeHtml).save();
    } catch (e) {
      console.error("Chyba při generování PDF", e);
      setErrorText(
        "Nepodařilo se vygenerovat PDF. Zkus to prosím znovu nebo později."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    setGenerating(true);
    setErrorText(null);

    try {
      const { html } = await buildReportHtml();
      setPreviewHtml(html);
    } catch (e) {
      console.error("Chyba při generování náhledu", e);
      setErrorText(
        "Nepodařilo se připravit náhled PDF. Zkus to prosím znovu."
      );
    } finally {
      setGenerating(false);
    }
  };

  /* ----------------------------- render ----------------------------- */

  if (!user) {
    return (
      <AppLayout active="tools">
        <div className="w-full max-w-3xl mx-auto">
          <p className="text-sm text-slate-200">
            Pro použití exportu produkce se nejprve přihlas.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-4xl space-y-6">
        <header className="mb-2">
          <SplitTitle text="Statistika" />
          <p className="text-sm text-slate-300 mt-1">
            Vygeneruj přehled produkce do PDF – podle období, rozsahu a typu
            produktů.
          </p>
        </header>

        {/* Nastavení exportu */}
        <section className="space-y-4">
          {/* Volba období */}
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)]">
            <h2 className="text-sm font-semibold text-slate-50 mb-2">
              Volba období
            </h2>
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              {([
                ["currentMonth", "Aktuální měsíc"],
                ["last3", "Poslední 3 měsíce"],
                ["last6", "Posledních 6 měsíců"],
                ["last12", "Posledních 12 měsíců"],
                ["currentYear", "Aktuální rok"],
              ] as [DateRangeOption, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDateRangeOption(value)}
                  className={`px-3 py-1.5 rounded-full border text-xs sm:text-sm transition ${
                    dateRangeOption === value
                      ? "bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/40"
                      : "border-white/20 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Rozsah */}
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
            <h2 className="text-sm font-semibold text-slate-50">
              Rozsah exportu
            </h2>
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() => setScopeOption("own")}
                className={`px-3 py-1.5 rounded-full border transition ${
                  scopeOption === "own"
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                    : "border-white/20 text-slate-200 hover:bg-white/5"
                }`}
              >
                Vlastní produkce
              </button>

              <button
                type="button"
                disabled={!hasTeam}
                onClick={() => setScopeOption("team")}
                className={`px-3 py-1.5 rounded-full border transition ${
                  scopeOption === "team"
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                    : "border-white/20 text-slate-200 hover:bg-white/5"
                } ${!hasTeam ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Týmová produkce
              </button>

              <button
                type="button"
                disabled={!hasTeam}
                onClick={() => setScopeOption("selected")}
                className={`px-3 py-1.5 rounded-full border transition ${
                  scopeOption === "selected"
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                    : "border-white/20 text-slate-200 hover:bg-white/5"
                } ${!hasTeam ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Vybraní podřízení
              </button>
            </div>

            {loadingSubs && (
              <p className="text-xs text-slate-300">Načítám podřízené…</p>
            )}

            {!loadingSubs && !hasTeam && (
              <p className="text-xs text-slate-300">
                Nemáš v databázi nastavené podřízené (pole{" "}
                <code>managerEmail</code>), proto je dostupná pouze vlastní
                produkce.
              </p>
            )}

            {scopeOption === "selected" && hasTeam && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-300">
                  Vyber konkrétní podřízené, pro které chceš produkci
                  zahrnout do PDF.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 space-y-1 text-xs">
                  {subordinates.map((sub) => {
                    const active = selectedSubs.has(sub.email);
                    return (
                      <button
                        key={sub.email}
                        type="button"
                        onClick={() => handleToggleSubordinate(sub.email)}
                        className={`w-full flex items-center justify-between py-1.5 text-left rounded-xl px-2 transition ${
                          active
                            ? "bg-emerald-500/20 text-emerald-100"
                            : "text-slate-200 hover:bg-white/5"
                        }`}
                      >
                        <span>{sub.name}</span>
                        <span className="text-[10px] text-slate-400">
                          {sub.email}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  Vybráno:{" "}
                  <span className="font-semibold">
                    {selectedSubs.size} poradců
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Volba produktů */}
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
            <h2 className="text-sm font-semibold text-slate-50">
              Volba produktů
            </h2>
            <p className="text-xs text-slate-300">
              Zvol, které typy produktů se mají v PDF objevit.
            </p>
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() =>
                  setCategories(
                    new Set<ProductCategory>([
                      "life",
                      "nonlife",
                      "auto",
                      "property",
                    ])
                  )
                }
                className="px-3 py-1.5 rounded-full border border-white/25 text-slate-100 hover:bg-white/10 transition"
              >
                Všechny
              </button>

              <CheckboxChip
                label="Životní pojištění"
                active={categories.has("life")}
                onClick={() => handleToggleCategory("life")}
              />
              <CheckboxChip
                label="Neživotní pojištění"
                active={categories.has("nonlife")}
                onClick={() => handleToggleCategory("nonlife")}
              />
              <CheckboxChip
                label="Auto"
                active={categories.has("auto")}
                onClick={() => handleToggleCategory("auto")}
              />
              <CheckboxChip
                label="Majetek"
                active={categories.has("property")}
                onClick={() => handleToggleCategory("property")}
              />
            </div>
          </div>
        </section>

        {errorText && (
          <p className="text-xs text-amber-300 bg-amber-900/40 border border-amber-500/60 rounded-2xl px-4 py-2">
            {errorText}
          </p>
        )}

        {/* Tlačítka */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-sky-500/25 px-7 py-2.5 text-sm sm:text-base font-semibold text-sky-50 shadow-[0_0_22px_rgba(56,189,248,0.55)] hover:bg-sky-500/35 hover:border-sky-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? "Připravuji náhled…" : "Náhled PDF"}
          </button>

          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/70 bg-emerald-500/30 px-8 py-2.5 text-sm sm:text-base font-semibold text-emerald-50 shadow-[0_0_25px_rgba(16,185,129,0.55)] hover:bg-emerald-500/40 hover:border-emerald-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? "Generuji PDF…" : "Vygenerovat PDF"}
          </button>
        </div>

        {/* Náhled PDF na stránce */}
        {previewHtml && (
          <section className="mt-4 rounded-3xl border border-white/15 bg-slate-950/70 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.9)] space-y-3">
            <h2 className="text-sm font-semibold text-slate-50">
              Náhled PDF
            </h2>
            <p className="text-xs text-slate-300">
              Náhled odpovídá tomu, co se stáhne jako PDF. V prohlížeči se
              může lehce lišit od výsledného PDF (kvůli renderingu fontů).
            </p>
            <div className="mt-2 h-[640px] rounded-2xl border border-white/10 overflow-hidden bg-slate-900/60">
              <iframe
                srcDoc={previewHtml}
                title="Náhled PDF produkce"
                className="w-full h-full bg-slate-900"
              />
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}

/* ---------------------- pomocné chip tlačítko ---------------------- */

function CheckboxChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs sm:text-sm transition flex items-center gap-1 ${
        active
          ? "bg-sky-500 text-white border-sky-400 shadow-sm shadow-sky-500/40"
          : "border-white/20 text-slate-200 hover:bg-white/5"
      }`}
    >
      <span
        className={`inline-flex h-3 w-3 items-center justify-center rounded-full border text-[9px] ${
          active
            ? "border-white bg-white text-sky-600"
            : "border-slate-400"
        }`}
      >
        {active ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
