// src/app/pomucky/export-produkce/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import {
  POSITION_LABELS,
  formatMoney,
  toDate,
} from "@/app/lib/formatters";
import {
  PRODUCT_ORDER,
  hasProductGroup,
  isAutoProduct,
  isComfortProduct,
  isLifeProduct,
  isPropertyProduct,
  isTravelProduct,
  productInstitutionLabel,
  productInstitutionLogo,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import { auth } from "../../firebase";

import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { type Position, type Product } from "../../types/domain";
import SplitTitle from "../plan-produkce/SplitTitle";
import { CalendarDays, Search, Tags, UsersRound } from "lucide-react";

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

type DateRangeOption =
  | "currentMonth"
  | "last3"
  | "last6"
  | "last12"
  | "currentYear";

type ScopeOption = "own" | "team" | "selected";

type ProductCategory = "life" | "nonlife" | "auto" | "property" | "gold";

type EntryDoc = {
  id: string;
  userEmail?: string | null;
  createdAt?: any;
  contractSignedDate?: any;
  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: string | null;
};

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: (EntryDoc & { adviserEmail?: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

type TeamOverviewMember = {
  email: string;
  name?: string | null;
  position?: Position | null;
  managerEmail?: string | null;
  docId?: string;
};

type TeamOverviewApiResponse = {
  ok?: boolean;
  error?: string;
  position?: Position | null;
  members?: TeamOverviewMember[];
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
  goldTotal: number;
  goldContracts: number;
};

type PerUserStats = AggregatedStats & {
  email: string;
  name: string;
  positionLabel?: string | null;
};

const DATE_RANGE_OPTIONS: [DateRangeOption, string][] = [
  ["currentMonth", "Aktuální měsíc"],
  ["last3", "Poslední 3 měsíce"],
  ["last6", "Posledních 6 měsíců"],
  ["currentYear", "Aktuální rok"],
];

const CATEGORY_FILTERS: { key: ProductCategory; label: string }[] = [
  { key: "life", label: "Životní pojištění" },
  { key: "nonlife", label: "Neživotní pojištění" },
  { key: "auto", label: "Auto" },
  { key: "property", label: "Majetek" },
  { key: "gold", label: "Zlato" },
];

const ALL_CATEGORY_KEYS: ProductCategory[] = CATEGORY_FILTERS.map((c) => c.key);
const PRODUCT_ICON_PATHS: Partial<Record<Product, string>> = Object.fromEntries(
  PRODUCT_ORDER.map((product) => [
    product,
    productInstitutionLogo(product),
  ]).filter((entry): entry is [Product, string] => Boolean(entry[1]))
) as Partial<Record<Product, string>>;

function productCategory(p: Product): ProductCategory {
  if (isLifeProduct(p)) return "life";
  if (isAutoProduct(p)) return "auto";
  if (isPropertyProduct(p) || isTravelProduct(p) || hasProductGroup(p, "liability")) {
    return "property";
  }
  if (isComfortProduct(p)) return "gold";
  return "nonlife";
}

function productLabel(p: Product): string {
  return productLabelFromCatalog(p, p);
}

function institutionLabel(p: Product): string {
  return productInstitutionLabel(p, p) ?? p;
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
    goldTotal: 0,
    goldContracts: 0,
  };
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCursorToken(
  token: string | null | undefined,
  legacyCursor: number | null | undefined
): string | null {
  if (typeof token === "string" && token.trim()) {
    return token.trim();
  }
  if (typeof legacyCursor === "number" && Number.isFinite(legacyCursor)) {
    return String(legacyCursor);
  }
  return null;
}

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Nepodařilo se převést obrázek na data URL."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Nepodařilo se načíst obrázek."));
    };
    reader.readAsDataURL(blob);
  });
}

type ThemeIconKind = "life" | "nonlife" | "auto" | "property" | "gold";

function themeIconSvg(kind: ThemeIconKind): string {
  const base =
    'xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  switch (kind) {
    case "life":
      return `<svg ${base}><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/></svg>`;
    case "auto":
      return `<svg ${base}><path d="M3 13h18l-1.5-4.5a2 2 0 0 0-1.9-1.4H6.4a2 2 0 0 0-1.9 1.4L3 13Zm0 0v4m18-4v4M7 17a1.5 1.5 0 1 0 0 .01M17 17a1.5 1.5 0 1 0 0 .01"/></svg>`;
    case "property":
      return `<svg ${base}><path d="m3 11 9-7 9 7M5 10.5V20h14v-9.5M10 20v-5h4v5"/></svg>`;
    case "gold":
      return `<svg ${base}><path d="M4 8h16l-2 8H6L4 8Zm3-3h10l1 3H6l1-3Zm1 11h8v3H8v-3Z"/></svg>`;
    case "nonlife":
    default:
      return `<svg ${base}><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>`;
  }
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
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("last3");
  const [scopeOption, setScopeOption] = useState<ScopeOption>("own");
  const [categories, setCategories] = useState<Set<ProductCategory>>(
    () => new Set<ProductCategory>(ALL_CATEGORY_KEYS)
  );

  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingSubs, setLoadingSubs] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<
    { type: "ok" | "error"; msg: string } | null
  >(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [subordinatesPickerOpen, setSubordinatesPickerOpen] = useState(false);
  const [subordinateSearch, setSubordinateSearch] = useState("");

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [productIconDataUrls, setProductIconDataUrls] = useState<
    Partial<Record<Product, string>>
  >({});

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const subordinatesPickerRef = useRef<HTMLDivElement | null>(null);

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const hasTeam = subordinates.length > 0;
  const isTeamScope =
    scopeOption === "team" || scopeOption === "selected";
  const allCategoriesSelected = ALL_CATEGORY_KEYS.every((key) =>
    categories.has(key)
  );
  const activeFiltersSummary = [
    `Rozsah: ${labelForScope(scopeOption)}`,
    `Období: ${labelForDateRange(dateRangeOption)}`,
    allCategoriesSelected
      ? "Kategorie: Všechny"
      : `Kategorie: ${categories.size}/${ALL_CATEGORY_KEYS.length}`,
    scopeOption === "selected" && hasTeam
      ? `Poradci: ${selectedSubs.size}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const filteredSubordinates = useMemo(() => {
    const q = normalizeForSearch(subordinateSearch);
    if (!q) return subordinates;
    return subordinates.filter((sub) =>
      normalizeForSearch(`${sub.name} ${sub.email}`).includes(q)
    );
  }, [subordinates, subordinateSearch]);

  /* ----------------------------- auth ----------------------------- */

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  /* ------------------------- podřízení --------------------------- */

  useEffect(() => {
    const loadSubs = async () => {
      if (!user?.email) return;

      const email = normalizeEmail(user.email);

      setLoadingSubs(true);
      setErrorText(null);

      try {
        let bearerToken = await user.getIdToken();
        const requestWithToken = async (token: string) =>
          fetch("/api/team-overview", {
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

        const payload = (await res.json()) as TeamOverviewApiResponse;
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || "Nepodařilo se načíst tým.");
        }

        const membersRaw = Array.isArray(payload.members) ? payload.members : [];
        const members = membersRaw
          .map((member) => {
            const memberEmail = normalizeEmail(member.email);
            if (!memberEmail) return null;
            return {
              email: memberEmail,
              name:
                typeof member.name === "string" && member.name.trim()
                  ? member.name.trim()
                  : nameFromEmail(memberEmail),
              position: (member.position as Position | null | undefined) ?? null,
            };
          })
          .filter((member): member is { email: string; name: string; position: Position | null } =>
            Boolean(member)
          );

        setCurrentUserPosition((payload.position as Position | null | undefined) ?? null);

        const list: Subordinate[] = members
          .filter((member) => member.email !== email)
          .map((member) => ({
            email: member.email,
            name: member.name,
            position: member.position,
          }));

        list.sort((a, b) => a.name.localeCompare(b.name, "cs"));
        setSubordinates(list);
        const allowedEmails = new Set(list.map((s) => s.email));
        setSelectedSubs((prev) => {
          const next = new Set<string>();
          for (const subEmail of prev) {
            if (allowedEmails.has(subEmail)) next.add(subEmail);
          }
          return next;
        });
      } catch (e) {
        console.error("Chyba při načítání podřízených", e);
        setErrorText("Nepodařilo se načíst podřízené (včetně celého týmu).");
      } finally {
        setLoadingSubs(false);
      }
    };

    loadSubs();
  }, [user]);

  useEffect(() => {
    if (scopeOption !== "selected" || !hasTeam) {
      setSubordinatesPickerOpen(false);
      setSubordinateSearch("");
    }
  }, [scopeOption, hasTeam]);

  useEffect(() => {
    if (!subordinatesPickerOpen) return;
    const onDown = (ev: MouseEvent) => {
      const el = subordinatesPickerRef.current;
      if (!el) return;
      if (!el.contains(ev.target as Node)) {
        setSubordinatesPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [subordinatesPickerOpen]);

  useEffect(() => {
    if (!subordinatesPickerOpen) {
      setSubordinateSearch("");
    }
  }, [subordinatesPickerOpen]);

  /* --------------------------- logo ------------------------------ */

  useEffect(() => {
    let cancelled = false;

    const readAsset = async (path: string): Promise<string | null> => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await blobToDataUrl(blob);
      } catch {
        return null;
      }
    };

    const loadBrandAssets = async () => {
      try {
        const [logo, iconEntries] = await Promise.all([
          readAsset("/icons/bohemika_logo.png"),
          Promise.all(
            (Object.entries(PRODUCT_ICON_PATHS) as [Product, string][]).map(
              async ([product, path]) =>
                [product, await readAsset(path)] as const
            )
          ),
        ]);

        if (cancelled) return;

        if (logo) {
          setLogoDataUrl(logo);
        }

        const nextIcons: Partial<Record<Product, string>> = {};
        for (const [product, dataUrl] of iconEntries) {
          if (!dataUrl) continue;
          nextIcons[product] = dataUrl;
        }
        setProductIconDataUrls(nextIcons);
      } catch (e) {
        console.error("Nepodařilo se načíst brand assety pro export:", e);
      }
    };

    void loadBrandAssets();
    return () => {
      cancelled = true;
    };
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

    // načíst smlouvy (entries) přes API
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Uživatel není přihlášený.");
    }

    let bearerToken = await currentUser.getIdToken();
    const fetchContractsPage = async (
      scope: "my" | "team",
      cursor?: string | null
    ): Promise<ContractsApiResponse> => {
      const params = new URLSearchParams({
        scope,
        limit: "50",
      });
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
        bearerToken = await currentUser.getIdToken(true);
        res = await requestWithToken(bearerToken);
      }
      const payload = (await res.json()) as ContractsApiResponse;
      if (res.status === 403 && scope === "team") {
        return {
          ok: true,
          contracts: [],
          hasMore: false,
          nextCursorToken: null,
          nextCursor: null,
        };
      }
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Nepodařilo se načíst smlouvy.");
      }
      return payload;
    };

    const fetchContractsScope = async (scope: "my" | "team"): Promise<EntryDoc[]> => {
      const collected: EntryDoc[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let hasMore = true;
      let pages = 0;

      while (hasMore && pages < 120) {
        pages += 1;
        const payload = await fetchContractsPage(scope, cursor);
        const contracts = (payload.contracts ?? []) as (EntryDoc & {
          adviserEmail?: string | null;
        })[];
        contracts.forEach((item) => {
          const owner = (
            item.adviserEmail ??
            item.userEmail ??
            email
          )
            .toString()
            .trim()
            .toLowerCase();
          const id = String(item.id ?? "").trim();
          if (!owner || !id) return;
          const key = `${owner}___${id}`;
          if (seen.has(key)) return;
          seen.add(key);
          collected.push({
            ...(item as EntryDoc),
            id,
            userEmail: owner,
          });
        });
        cursor = normalizeCursorToken(payload.nextCursorToken, payload.nextCursor);
        hasMore = Boolean(payload.hasMore) && Boolean(cursor);
      }
      return collected;
    };

    const scopeNeedsOwn = scopeOption === "own" || scopeOption === "team";
    const scopeNeedsTeam = scopeOption === "team" || scopeOption === "selected";

    const [ownEntries, teamEntries] = await Promise.all([
      scopeNeedsOwn ? fetchContractsScope("my") : Promise.resolve([]),
      scopeNeedsTeam ? fetchContractsScope("team") : Promise.resolve([]),
    ]);

    const allowedEmails = new Set(emailsToLoad.map((item) => item.toLowerCase()));
    const allEntries = [...ownEntries, ...teamEntries].filter((entry) =>
      allowedEmails.has((entry.userEmail ?? "").toLowerCase())
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

      // filtr podle zvolených kategorií
      const cat = productCategory(p);
      if (!categories.has(cat)) continue;

      const created = contractDate(entry);
      if (!created) continue;

      const amount = entry.inputAmount ?? 0;
      if (!amount || !Number.isFinite(amount)) continue;

      const isLife = isLifeProduct(p);
      const isAuto = isAutoProduct(p);
      const isProperty =
        isPropertyProduct(p) || isTravelProduct(p) || hasProductGroup(p, "liability");
      const isGold = isComfortProduct(p);
      const isNonLife = !isLife && !isGold;

      const annualForProduct = isGold
        ? amount
        : isLife
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
      } else if (isGold) {
        stats.goldTotal += amount;
        stats.goldContracts += 1;
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
      summary.goldTotal += stats.goldTotal;
      summary.goldContracts += stats.goldContracts;
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
    const includeGold = cats.has("gold");

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
    const themedHeading = (
      label: string,
      kind: ThemeIconKind,
      className = "card-title"
    ) => `
      <div class="${className}">
        <span class="theme-icon" aria-hidden="true">${themeIconSvg(kind)}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    `;

    if (includeLife && (summary.lifeContracts > 0 || summary.lifeMonthly > 0)) {
      summarySections.push(`
        <div class="card">
          ${themedHeading("Životní pojištění", "life")}
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
          ${themedHeading("Neživotní pojištění", "nonlife")}
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
          ${themedHeading("Pojištění vozidel", "auto")}
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
          ${themedHeading("Majetek & ostatní neživot", "property")}
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

    if (includeGold && (summary.goldContracts > 0 || summary.goldTotal > 0)) {
      summarySections.push(`
        <div class="card">
          ${themedHeading("Zlato (Comfort Commodity)", "gold")}
          <div class="card-row">
            <span>Objem (poplatek)</span>
            <span>${formatMoney(summary.goldTotal)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.goldContracts}</span>
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
              ${themedHeading("Životní pojištění", "life", "card-subtitle")}
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
              ${themedHeading("Neživotní pojištění", "nonlife", "card-subtitle")}
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
              ${themedHeading("Pojištění vozidel", "auto", "card-subtitle")}
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
              ${themedHeading("Majetek & ostatní neživot", "property", "card-subtitle")}
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

        if (includeGold && (stats.goldContracts > 0 || stats.goldTotal > 0)) {
          userSections.push(`
            <div class="card-inner">
              ${themedHeading("Zlato (Comfort Commodity)", "gold", "card-subtitle")}
              <div class="card-row">
                <span>Objem (poplatek)</span>
                <span>${formatMoney(stats.goldTotal)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.goldContracts}</span>
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

    const productRowsHtml = Array.from(perProduct.entries())
      .sort((a, b) => b[1].annual - a[1].annual)
      .map(([prod, vals]) => {
        const provider = institutionLabel(prod);
        const iconDataUrl = productIconDataUrls[prod] ?? null;
        const iconPath = PRODUCT_ICON_PATHS[prod] ?? null;
        const iconSrc =
          iconDataUrl ??
          (iconPath
            ? (() => {
                try {
                  return new URL(iconPath, window.location.origin).toString();
                } catch {
                  return iconPath;
                }
              })()
            : null);
        const iconMarkup = iconSrc
          ? `<span class="product-logo"><img src="${escapeHtml(
              iconSrc
            )}" alt="${escapeHtml(provider)}" /></span>`
          : `<span class="product-logo product-logo-fallback">${escapeHtml(
              provider.charAt(0).toUpperCase()
            )}</span>`;

        return `
          <tr>
            <td class="product">
              <div class="product-cell">
                ${iconMarkup}
                <div class="product-meta">
                  <div class="product-name">${escapeHtml(productLabel(prod))}</div>
                  <div class="product-provider">${escapeHtml(provider)}</div>
                </div>
              </div>
            </td>
            <td class="count">${vals.contracts}</td>
            <td class="amount">${formatMoney(vals.annual)}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px 0;
              background: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                system-ui, -system-ui, sans-serif;
              color: #0f172a;
              -webkit-font-smoothing: antialiased;
            }
            .page {
              width: 760px;
              margin: 0 auto;
              background: #ffffff;
              border-radius: 22px;
              border: 1.5px solid #0f172a;
              box-shadow:
                0 20px 60px rgba(15, 23, 42, 0.16),
                0 0 0 1px rgba(15, 23, 42, 0.04) inset;
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
              border-radius: 16px;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
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
              font-size: 26px;
              font-weight: 700;
              letter-spacing: 0.02em;
            }
            .title-block p {
              margin: 2px 0 0;
              font-size: 12px;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: #334155;
            }
            .info-card {
              margin-top: 8px;
              padding: 14px 16px;
              border-radius: 14px;
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              font-size: 12px;
              line-height: 1.6;
            }
            .info-card strong { font-weight: 600; }
            .divider {
              margin: 20px 0;
              border-bottom: 1px solid #cbd5e1;
            }
            .section-title {
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: #0f172a;
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
              border-radius: 14px;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
              padding: 14px 16px 14px;
              font-size: 12px;
            }
            .card-title {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 14px;
              font-weight: 600;
              margin-bottom: 6px;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: #111827;
            }
            .theme-icon {
              width: 18px;
              height: 18px;
              border-radius: 6px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              color: #0f172a;
              flex-shrink: 0;
              overflow: hidden;
              line-height: 0;
            }
            .theme-icon svg {
              width: 12px;
              height: 12px;
              fill: none;
              stroke: currentColor;
              stroke-width: 1.8;
              stroke-linecap: round;
              stroke-linejoin: round;
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
              background: #0f172a;
              color: #ffffff;
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
              border-radius: 12px;
              overflow: hidden;
              border: 1px solid #cbd5e1;
              box-shadow: 0 8px 20px rgba(15,23,42,0.08);
            }
            .product-table thead {
              background: #e2e8f0;
              color: #0f172a;
            }
            .product-table th {
              padding: 10px 12px;
              text-align: left;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-transform: uppercase;
              font-size: 11px;
              border-bottom: 1px solid #cbd5e1;
            }
            .product-table tbody tr:nth-child(odd) { background: #ffffff; }
            .product-table tbody tr:nth-child(even) { background: #f8fafc; }
            .product-table td {
              padding: 10px 12px;
              border-bottom: 1px solid #e2e8f0;
              color: #334155;
              vertical-align: top;
            }
            .product-table td.product { width: 62%; text-align: left; }
            .product-table td.count { width: 12%; text-align: center; font-weight: 700; color: #0f172a; }
            .product-table td.amount { width: 26%; text-align: right; font-weight: 700; color: #0f172a; }
            .product-cell {
              display: flex;
              align-items: center;
              gap: 10px;
              min-height: 34px;
            }
            .product-logo {
              width: 30px;
              height: 30px;
              border-radius: 8px;
              border: 1px solid #cbd5e1;
              background: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              flex-shrink: 0;
            }
            .product-logo img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              padding: 3px;
            }
            .product-logo-fallback {
              font-size: 11px;
              font-weight: 700;
              color: #334155;
              background: #f1f5f9;
            }
            .product-meta {
              min-width: 0;
            }
            .product-name {
              color: #0f172a;
              line-height: 1.3;
              font-weight: 600;
            }
            .product-provider {
              margin-top: 2px;
              font-size: 10px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
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
              border: 1px solid #cbd5e1;
            }
            .card-subtitle {
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              font-weight: 600;
              color: #0f172a;
              margin-bottom: 3px;
            }
            .card-subtitle .theme-icon {
              width: 16px;
              height: 16px;
            }
            .card-subtitle .theme-icon svg {
              width: 10px;
              height: 10px;
            }
            .footer-note {
              margin-top: 14px;
              font-size: 10px;
              color: #94a3b8;
            }
            @media print {
              body { background: #f1f5f9; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="page-header">
              ${logoHtml}
              <div class="title-block">
                <h1>Bohemika.App - Produkce</h1>
                <p>${dateLabel} - ${scopeLabel}</p>
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
                        ${productRowsHtml}
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
              PDF bylo vygenerováno z interní webové aplikace Bohemka.App .
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

  const handleSendEmail = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    if (!recipient.trim()) {
      setSendStatus({ type: "error", msg: "Vyplň e-mail příjemce." });
      return;
    }

    setSending(true);
    setSendStatus(null);

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
            doc.querySelectorAll("link[rel='stylesheet']").forEach((n) => n.remove());
            doc.querySelectorAll("style").forEach((n) => {
              const text = n.textContent ?? "";
              if (/(oklch|lab)\(/i.test(text)) n.remove();
            });
          },
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      };

      const worker = (html2pdf() as any).from(safeHtml).set(opt).toPdf();
      const blob = await worker.output("blob");
      const base64 = await blobToBase64(blob);

      const rangeLabelMap: Record<DateRangeOption, string> = {
        currentMonth: "aktuální měsíc",
        last3: "poslední 3 měsíce",
        last6: "posledních 6 měsíců",
        last12: "posledních 12 měsíců",
        currentYear: "aktuální rok",
      };
      const subject = `Statistika produkce – ${rangeLabelMap[dateRangeOption] ?? dateRangeOption}`;
      const filename = `${filenameBase}_${dateRangeOption}.pdf`;
      const token = await user.getIdToken();

      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: recipient.trim(),
          subject,
          text: "V příloze posílám export produkce.",
          pdfBase64: base64,
          filename,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Odeslání selhalo");
      }

      setSendStatus({ type: "ok", msg: "E-mail odeslán." });
    } catch (e) {
      console.error("Chyba při odesílání e-mailu", e);
      setSendStatus({
        type: "error",
        msg: "Odeslání se nepovedlo. Zkontroluj údaje a zkus to znovu.",
      });
    } finally {
      setSending(false);
    }
  };

  /* ----------------------------- render ----------------------------- */

  if (!user) {
    return (
      <AppLayout active="tools">
        <div className="w-full max-w-3xl mx-auto">
          <p className="text-sm text-slate-800">
            Pro použití exportu produkce se nejprve přihlas.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-[1500px] space-y-4">
        <header className="relative">
          <div className="flex items-end justify-between gap-4">
            <SplitTitle
              text="Statistika"
              className="text-5xl sm:text-6xl lg:text-7xl"
            />
          </div>

          <div className="hidden sm:block">
            <Image
              src="/icons/export-produkce.png"
              alt="Export produkce"
              width={320}
              height={320}
              className="h-52 w-auto object-contain absolute right-0 -top-4 opacity-90 pointer-events-none"
              priority
            />
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[264px_minmax(0,1fr)] lg:items-start xl:grid-cols-[284px_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-2">
            {/* Nastavení exportu */}
            <section className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/95 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-slate-50/85">
              <div className="space-y-1.5">
                <div className="ui-kicker inline-flex items-center gap-1.5">
                  <UsersRound
                    size={12}
                    strokeWidth={2.2}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                  <span>Rozsah exportu</span>
                </div>
                <div className="grid gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setScopeOption("own")}
                    className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                      scopeOption === "own"
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Vlastní produkce
                  </button>
                  <button
                    type="button"
                    disabled={!hasTeam}
                    onClick={() => setScopeOption("team")}
                    className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                      scopeOption === "team"
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    } ${!hasTeam ? "cursor-not-allowed opacity-45" : ""}`}
                  >
                    Týmová produkce
                  </button>
                  <button
                    type="button"
                    disabled={!hasTeam}
                    onClick={() => setScopeOption("selected")}
                    className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                      scopeOption === "selected"
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    } ${!hasTeam ? "cursor-not-allowed opacity-45" : ""}`}
                  >
                    Vybraní podřízení
                  </button>
                </div>

                {loadingSubs && (
                  <p className="text-xs text-slate-600">Načítám podřízené…</p>
                )}
                {!loadingSubs && !hasTeam && (
                  <p className="text-xs text-slate-600">
                    Nemáš nastavené podřízené, proto je dostupná jen vlastní
                    produkce.
                  </p>
                )}

                {scopeOption === "selected" && hasTeam && (
                  <div ref={subordinatesPickerRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setSubordinatesPickerOpen((v) => !v)}
                      className={`ui-focus inline-flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        subordinatesPickerOpen
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      <span>Vybraní podřízení ({selectedSubs.size})</span>
                      <span>{subordinatesPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {subordinatesPickerOpen && (
                      <div className="absolute left-0 top-full z-40 mt-2 w-full rounded-2xl border border-slate-300 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
                        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                          <div className="text-xs font-semibold text-slate-700">
                            Vyber poradce
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedSubs(
                                  new Set(subordinates.map((s) => s.email))
                                )
                              }
                              className="ui-focus rounded-xl border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Vše
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSubs(new Set())}
                              className="ui-focus rounded-xl border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Nic
                            </button>
                          </div>
                        </div>
                        <div className="border-b border-slate-200 px-2.5 py-2">
                          <label className="relative block">
                            <Search
                              size={14}
                              strokeWidth={2}
                              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                              aria-hidden="true"
                            />
                            <input
                              type="text"
                              value={subordinateSearch}
                              onChange={(e) => setSubordinateSearch(e.target.value)}
                              placeholder="Hledat poradce nebo e-mail"
                              className="ui-focus w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400"
                            />
                          </label>
                        </div>
                        <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                          {filteredSubordinates.length === 0 ? (
                            <p className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                              Nenašel se žádný podřízený pro zadaný filtr.
                            </p>
                          ) : (
                            filteredSubordinates.map((sub) => {
                              const active = selectedSubs.has(sub.email);
                              return (
                                <button
                                  key={sub.email}
                                  type="button"
                                  onClick={() => handleToggleSubordinate(sub.email)}
                                  className={`ui-focus w-full rounded-xl border px-2.5 py-1.5 text-left transition ${
                                    active
                                      ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.18)]"
                                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                                  }`}
                                >
                                  <span className="block text-[12px] font-semibold">
                                    {sub.name}
                                  </span>
                                  <span
                                    className={`block text-[10px] ${
                                      active ? "text-slate-300" : "text-slate-500"
                                    }`}
                                  >
                                    {sub.email}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="ui-kicker inline-flex items-center gap-1.5">
                  <CalendarDays
                    size={12}
                    strokeWidth={2.2}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                  <span>Období</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 text-xs">
                  {DATE_RANGE_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDateRangeOption(value)}
                      className={`ui-focus rounded-xl border px-2.5 py-2 text-center text-xs font-semibold transition ${
                        dateRangeOption === value
                          ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="ui-kicker inline-flex items-center gap-1.5">
                  <Tags
                    size={12}
                    strokeWidth={2.2}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                  <span>Kategorie produktu</span>
                </div>
                <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setCategories(new Set<ProductCategory>(ALL_CATEGORY_KEYS))
                    }
                    className={`ui-focus inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                      allCategoriesSelected
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Všechny
                  </button>
                  {CATEGORY_FILTERS.map((category) => (
                    <CheckboxChip
                      key={category.key}
                      label={category.label}
                      active={categories.has(category.key)}
                      onClick={() => handleToggleCategory(category.key)}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                {activeFiltersSummary}
              </div>
            </section>
          </aside>

          <div className="space-y-4">
            {errorText && (
              <p className="rounded-2xl border border-rose-300 bg-rose-100 px-4 py-2 text-xs text-rose-800">
                {errorText}
              </p>
            )}

            {/* Tlačítka */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={generating}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? "Připravuji náhled…" : "Náhled PDF"}
                </button>

                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={generating}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-7 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? "Generuji PDF…" : "Vygenerovat PDF"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm((v) => !v);
                    setSendStatus(null);
                  }}
                  disabled={generating || sending}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending
                    ? "Odesílám…"
                    : showEmailForm
                    ? "Skrýt odeslání"
                    : "Odeslat e‑mailem"}
                </button>
              </div>

              {showEmailForm && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="grid items-end gap-3 sm:grid-cols-1">
                    <label className="space-y-1 text-sm text-slate-800">
                      <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                        E-mail příjemce
                      </span>
                      <input
                        type="email"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="w-full rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                        placeholder="klient@example.com"
                      />
                    </label>
                  </div>
                  {sendStatus && (
                    <p
                      className={`mt-2 text-xs ${
                        sendStatus.type === "ok"
                          ? "text-emerald-800"
                          : "text-rose-700"
                      }`}
                    >
                      {sendStatus.msg}
                    </p>
                  )}
                  <div className="mt-3 text-right">
                    <button
                      type="button"
                      onClick={handleSendEmail}
                      disabled={generating || sending}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sending ? "Odesílám…" : "Odeslat e‑mailem"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Náhled PDF na stránce */}
            {previewHtml && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Náhled PDF
                </h2>
                <p className="text-xs text-slate-600">
                  Náhled odpovídá tomu, co se stáhne jako PDF. V prohlížeči se
                  může lehce lišit od výsledného PDF (kvůli renderingu fontů).
                </p>
                <div className="h-[640px] overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                  <iframe
                    srcDoc={previewHtml}
                    title="Náhled PDF produkce"
                    className="h-full w-full bg-white"
                  />
                </div>
              </section>
            )}
          </div>
        </div>
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
      className={`ui-focus inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] ${
          active
            ? "border-white bg-white text-slate-900"
            : "border-slate-300 text-transparent"
        }`}
      >
        {active ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
