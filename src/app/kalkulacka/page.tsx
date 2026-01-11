// src/app/kalkulacka/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

import {
  type Product,
  type Position,
  type PaymentFrequency,
  type CommissionMode,
  type CommissionResultItemDTO,
} from "../types/domain";

import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculateMaxdomov,
  calculateCppAuto,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateAllianzAuto,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateComfortCC,
  SUPPORTED_PRODUCTS,
  getCoefficientSummary,
} from "../lib/productFormulas";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";

// ---------- Pomocné ----------

const LIFE_PRODUCTS: Product[] = ["neon", "flexi", "pillowInjury", "maximaMaxEfekt"];

function formatMoney(value: number): string {
  if (Number.isNaN(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function formatCoefficientNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 6 });
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

const PRODUCT_OPTIONS: { id: Product; label: string }[] = [
  { id: "neon", label: "ČPP ŽP NEON" },
  { id: "flexi", label: "Kooperativa ŽP FLEXI" },
  { id: "maximaMaxEfekt", label: "MAXIMA ŽP MaxEfekt" },
  { id: "pillowInjury", label: "Pillow Úraz / Nemoc" },
  { id: "zamex", label: "ČPP ZAMEX" },
  { id: "domex", label: "ČPP DOMEX" },
  { id: "maxdomov", label: "Maxima MAXDOMOV" },
  { id: "cppsimplex", label: "ČPP Simplex" },
  { id: "cppAuto", label: "ČPP Auto" },
  {
    id: "cppPPRs",
    label: "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS",
  },
  {
    id: "cppPPRbez",
    label: "ČPP Pojištění majetku a odpovědnosti podnikatelů",
  },
  { id: "allianzAuto", label: "Allianz Auto" },
  { id: "csobAuto", label: "ČSOB Auto" },
  { id: "uniqaAuto", label: "UNIQA Auto" },
  { id: "pillowAuto", label: "Pillow Auto" },
  { id: "kooperativaAuto", label: "Kooperativa Auto" },
  { id: "cppcestovko", label: "ČPP Cestovko" },
  { id: "axacestovko", label: "AXA Cestovko" },
  { id: "comfortcc", label: "Comfort Commodity" },
];

const REPLACEMENT_ELIGIBLE_PRODUCTS: Product[] = [
  "zamex",
  "domex",
  "cppPPRbez",
  "maxdomov",
  "cppsimplex",
  "cppAuto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
];

const productLabel = (p: Product | null) =>
  PRODUCT_OPTIONS.find((o) => o.id === p)?.label ?? (p ?? "—");

const POSITION_ORDER: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];

function positionLabel(pos: Position): string {
  const map: Record<Position, string> = {
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
  return map[pos] ?? pos;
}

function normalizeTitleKey(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("z platby")) return `payment-${t}`;
  if (t.includes("za rok")) return `annual-${t}`;
  if (t.includes("okamžitá")) return "immediate";
  if (t.includes("po 3")) return "po3";
  if (t.includes("po 4")) return "po4";
  if (t.includes("2.–5.")) return "nasl25";
  if (t.includes("5.–10.")) return "nasl510";
  if (t.includes("od 6.")) return "nasl6plus";
  if (t.includes("z platby")) return "subsequentByPayment";
  return t;
}

function stripTotalRows(items: CommissionResultItemDTO[] = []): CommissionResultItemDTO[] {
  return items.filter((it) => !normalizeTitleKey(it.title ?? "").includes("celkem"));
}

function allowedPositionsForUser(base: Position | null): Position[] {
  if (!base) return POSITION_ORDER;

  const idx = POSITION_ORDER.indexOf(base);
  if (idx === -1) return POSITION_ORDER;

  if (base.startsWith("poradce")) {
    // Poradce → jen poradci až do své úrovně
    return POSITION_ORDER.filter(
      (p) => p.startsWith("poradce") && POSITION_ORDER.indexOf(p) <= idx
    );
  }

  // Manažer → poradci 1..level a manažeři 4..level
  const level = Number(base.replace("manazer", ""));
  return POSITION_ORDER.filter((p) => {
    if (p.startsWith("poradce")) {
      const lv = Number(p.replace("poradce", ""));
      return lv <= level;
    }
    if (p.startsWith("manazer")) {
      const lv = Number(p.replace("manazer", ""));
      return lv <= level;
    }
    return false;
  });
}

function productIcon(product: Product): string {
  if (
    product === "neon" ||
    product === "flexi" ||
    product === "maximaMaxEfekt" ||
    product === "pillowInjury"
  ) {
    return "/icons/zivot.png";
  }

  if (
    product === "cppAuto" ||
    product === "allianzAuto" ||
    product === "csobAuto" ||
    product === "uniqaAuto" ||
    product === "pillowAuto" ||
    product === "kooperativaAuto"
  ) {
    return "/icons/icon_auto.png";
  }

  if (product === "zamex") {
    return "/icons/icon_zamex.png";
  }

  if (product === "domex" || product === "maxdomov" || product === "cppPPRbez" || product === "cppsimplex") {
    return "/icons/icon_domex.png";
  }
  if (product === "cppPPRs") {
    return "/icons/icon_domex.png";
  }

  if (product === "cppcestovko" || product === "axacestovko") {
    return "/icons/icon_cestovko.png";
  }

  if (product === "comfortcc") {
    return "/icons/trezor.png";
  }

  return "/icons/produkt.png";
}

function shouldShowDuration(product: Product): boolean {
  return product === "neon" || product === "maximaMaxEfekt";
}

function durationRange(product: Product): [number, number] {
  switch (product) {
    case "neon":
      return [1, 15];
    case "maximaMaxEfekt":
      return [1, 20];
    default:
      return [1, 1];
  }
}

function allowedFrequencies(product: Product): PaymentFrequency[] {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return ["monthly"];
    case "domex":
      return ["quarterly", "semiannual", "annual"];
    case "pillowAuto":
    case "maxdomov":
    case "kooperativaAuto":
    case "allianzAuto":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "cppAuto":
    case "csobAuto":
    case "uniqaAuto":
    case "zamex":
    case "cppsimplex":
    case "cppPPRbez":
    case "cppPPRs":
      return ["quarterly", "semiannual", "annual"];
    case "cppcestovko":
    case "axacestovko":
    case "comfortcc":
      return ["annual"];
  }
}

function titleForFrequency(f: PaymentFrequency): string {
  switch (f) {
    case "monthly":
      return "Měsíční";
    case "quarterly":
      return "Čtvrtletní";
    case "semiannual":
      return "Pololetní";
    case "annual":
      return "Roční";
  }
}

function defaultFrequencyText(product: Product): string {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return "Frekvence: měsíční";
    case "cppcestovko":
    case "axacestovko":
    case "comfortcc":
      return "Frekvence: jednorázově";
    default:
      return "";
  }
}

function placeholderForAmount(
  product: Product,
  freq: PaymentFrequency
): string {
  if (product === "comfortcc") {
    return "Zadejte výši poplatku / platby";
  }
  if (product === "cppcestovko" || product === "axacestovko") {
    return "Zadejte jednorázové pojistné";
  }
  if (
    product === "neon" ||
    product === "flexi" ||
    product === "pillowInjury" ||
    product === "maximaMaxEfekt"
  ) {
    return "Zadejte měsíční částku";
  }
  const allowed = allowedFrequencies(product);
  if (allowed.length > 1 && freq !== "annual") {
    return "Zadejte částku za platbu";
  }
  return "Zadejte roční částku";
}

function durationTooltip(product: Product): string | null {
  if (product === "neon") {
    return "Zadej dobu trvání smlouvy, maximálně však 15 let. Pokud je smlouva uzavřena na déle než 15 let, zadej 15.";
  }
  if (product === "maximaMaxEfekt") {
    return "Zadej dobu trvání smlouvy, maximálně však 20 let. Pokud je smlouva uzavřena na déle než 20 let, zadej 20.";
  }
  return null;
}

function parseNumber(text: string): number {
  if (!text) return 0;
  const value = parseFloat(text.replace(",", "."));
  return Number.isNaN(value) ? 0 : value;
}

const SUPPORTED_LABEL =
  "Tento produkt zatím není na webu dopočítaný – aktuálně počítáme všechny produkty kromě Comfort Commodity.";

function paymentBasedTotals(
  items: CommissionResultItemDTO[],
  multiplier: number
): { immediate: number; subsequent: number } {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((it) => {
    const t = (it.title ?? "").toLowerCase();
    if (t.includes("okamžitá")) {
      immediate += it.amount ?? 0;
    } else if (t.includes("následná")) {
      subsequent += it.amount ?? 0;
    }
  });

  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
}

function cleanResultTitle(title: string): string {
  const match = title.match(/[\p{L}\p{N}]/u);
  if (!match) return title.trim();
  return title.slice(title.indexOf(match[0])).trim();
}

function resultIconForTitle(title: string): string | null {
  const t = cleanResultTitle(title).toLowerCase();

  if (t.startsWith("okamžitá provize") || t.startsWith("získatelská provize")) {
    return "/icons/penize2.png";
  }

  if (t.includes("po 3 letech") || t.includes("po 4 letech")) {
    return "/icons/kalendar.png";
  }

  if (t.startsWith("následná provize")) {
    return "/icons/nasledna.png";
  }

  return null;
}

// ---------- Kalkulačka ----------

export default function CalculatorPage() {
  const [user, setUser] = useState<User | null>(null);

  const [product, setProduct] = useState<Product>("neon");
  const [productOpen, setProductOpen] = useState(false);
  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [frequency, setFrequency] = useState<PaymentFrequency>("monthly");
  const [durationYears, setDurationYears] = useState<number>(15);
  const [amountText, setAmountText] = useState<string>("");
  const [comfortGradual, setComfortGradual] = useState<boolean>(false);
  const [comfortPaymentText, setComfortPaymentText] = useState<string>("");

  const [clientName, setClientName] = useState<string>("");
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [contractSignedDate, setContractSignedDate] = useState<string>("");
  const [policyStartDate, setPolicyStartDate] = useState<string>("");
  const [contractNumber, setContractNumber] = useState<string>("");
  const [refreshOriginalOpen, setRefreshOriginalOpen] = useState(false);
  const [originalContractNumber, setOriginalContractNumber] = useState<string>("");
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [replacementContractNumber, setReplacementContractNumber] = useState<string>("");

  const [items, setItems] = useState<CommissionResultItemDTO[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [unsupported, setUnsupported] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [duplicateModal, setDuplicateModal] = useState<{
    contractNumber: string;
    count: number;
    entries: { id: string; path: string }[];
  } | null>(null);

  const paymentBasedTotalsMemo = useMemo(() => {
    if ((product !== "domex" && product !== "maxdomov") || items.length === 0) return null;
    const multiplier = paymentsPerYear(frequency);
    return paymentBasedTotals(items, multiplier);
  }, [product, items, frequency]);
  const [managerEmailSnapshot, setManagerEmailSnapshot] = useState<string | null>(null);
  const [managerPositionSnapshot, setManagerPositionSnapshot] = useState<Position | null>(null);
  const [managerModeSnapshot, setManagerModeSnapshot] = useState<CommissionMode | null>(null);
  const [managerChainSnapshot, setManagerChainSnapshot] = useState<
    { email: string | null; position: Position | null; commissionMode: CommissionMode | null }[]
  >([]);
  const [managerOverridesSnapshot, setManagerOverridesSnapshot] = useState<
    {
      email: string | null;
      position: Position | null;
      commissionMode: CommissionMode | null;
      items: CommissionResultItemDTO[];
      total: number;
    }[]
  >([]);
  const [userCommissionMode, setUserCommissionMode] = useState<CommissionMode | null>(null);
  const [baseUserPosition, setBaseUserPosition] = useState<Position | null>(null);
  const [showCoefModal, setShowCoefModal] = useState(false);
  const replacementEligible = useMemo(
    () => REPLACEMENT_ELIGIBLE_PRODUCTS.includes(product),
    [product]
  );

  const coefList = useMemo(
    () => getCoefficientSummary(product ?? null, position ?? null, mode ?? null),
    [product, position, mode]
  );
  const coefExplanation = useMemo(() => {
    if (!product) return "";
    const payLabel = frequencyLabel(frequency);
    const payPerYear = paymentsPerYear(frequency);
    switch (product) {
      case "neon":
        return "Výpočet: měsíční pojistné × 12 × doba trvání × koeficient. Následné provize jsou roční: roční pojistné × koeficient (2.–5. rok a 5.–10. rok).";
      case "flexi":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro každou položku; následná se vyplácí ročně od 6. roku.";
      case "maximaMaxEfekt":
        return "Výpočet: roční pojistné × doba trvání × koeficient pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 5. roku.";
      case "pillowInjury":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro jednotlivé položky.";
      case "domex":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}).`;
      case "maxdomov":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská i následná). Roční částka = × počet plateb (${payPerYear}).`;
      case "cppAuto":
      case "cppsimplex":
      case "allianzAuto":
      case "csobAuto":
      case "uniqaAuto":
      case "pillowAuto":
      case "kooperativaAuto":
      case "zamex":
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "cppPPRbez":
      case "cppPPRs":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská / následná). Roční varianta = × počet plateb (${payPerYear}).`;
      case "cppcestovko":
      case "axacestovko":
        return "Výpočet: pojistné × koeficient (jednorázově).";
      case "comfortcc":
        return "Výpočet: jednorázový poplatek × koeficient (okamžitá). U postupného poplatku se přičítá pravidelná platba × koeficient × počet plateb.";
      default:
        return "";
    }
  }, [product, frequency]);
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
        const entries = collectionGroup(db, "entries");
        const q = query(
          entries,
          where("userEmail", "==", user.email.toLowerCase()),
          orderBy("createdAt", "desc"),
          limit(200)
        );
        const snap = await getDocs(q);
        const names = snap.docs
          .map((d) => (d.data() as any).clientName as string | undefined)
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
    if (typeof window === "undefined") return;

    const storedPosition = window.localStorage.getItem(
      "settings.position"
    ) as Position | null;
    if (storedPosition) {
      setPosition(storedPosition);
      setBaseUserPosition(storedPosition);
    }

    const storedMode = window.localStorage.getItem(
      "settings.mode"
    ) as CommissionMode | null;
    if (storedMode) {
      setMode(storedMode);
    }
  }, []);

  useEffect(() => {
    const loadUserPosition = async () => {
      if (!user?.email) return;
      try {
        const email = user.email.toLowerCase();
        const userSnap = await getDoc(doc(db, "users", email));
        const data = userSnap.data() as any;
        const pos = (data?.position as Position | undefined) ?? null;
        if (pos) {
          setPosition(pos);
          setBaseUserPosition(pos);
          if (typeof window !== "undefined") {
            window.localStorage.setItem("settings.position", pos);
          }
        }

        const mgrEmail = (data?.managerEmail as string | undefined)?.toLowerCase() ?? null;
        setManagerEmailSnapshot(mgrEmail ?? null);
        const userMode = (data?.commissionMode as CommissionMode | undefined) ?? null;
        if (userMode) {
          setUserCommissionMode(userMode);
          setMode(userMode);
          if (typeof window !== "undefined") {
            window.localStorage.setItem("settings.mode", userMode);
          }
        }

        const chain: { email: string | null; position: Position | null; commissionMode: CommissionMode | null }[] = [];

        if (mgrEmail) {
          try {
            const mgrSnap = await getDoc(doc(db, "users", mgrEmail));
            if (mgrSnap.exists()) {
              const mgrData = mgrSnap.data() as any;
              const mgrPos = (mgrData.position as Position | undefined) ?? null;
              const mgrMode = (mgrData.commissionMode as CommissionMode | undefined) ?? null;
              setManagerPositionSnapshot(mgrPos);
              setManagerModeSnapshot(mgrMode ?? null);

              chain.push({
                email: mgrEmail,
                position: mgrPos,
                commissionMode: mgrMode ?? null,
              });

              // projít hierarchii výš (max 5 úrovní, proti cyklům)
              let currentEmail = (mgrData.managerEmail as string | undefined)?.toLowerCase() ?? null;
              let depth = 0;
              const visited = new Set<string>();
              visited.add(mgrEmail);
              while (currentEmail && depth < 5 && !visited.has(currentEmail)) {
                visited.add(currentEmail);
                const upperSnap = await getDoc(doc(db, "users", currentEmail));
                if (!upperSnap.exists()) break;
                const upperData = upperSnap.data() as any;
                const upperPos = (upperData.position as Position | undefined) ?? null;
                const upperMode =
                  (upperData.commissionMode as CommissionMode | undefined) ?? null;
                chain.push({
                  email: currentEmail,
                  position: upperPos,
                  commissionMode: upperMode,
                });
                currentEmail =
                  (upperData.managerEmail as string | undefined)?.toLowerCase() ?? null;
                depth += 1;
              }
            }
          } catch (mgrErr) {
            console.error("Failed to load manager snapshot", mgrErr);
          }
        }

        setManagerChainSnapshot(chain);
      } catch (err) {
        console.error("Failed to load user position", err);
      }
    };

    loadUserPosition();
  }, [user]);

  useEffect(() => {
    const allowed = allowedFrequencies(product);
    if (!allowed.includes(frequency)) {
      setFrequency(allowed[0]);
    }

    if (product !== "comfortcc") {
      setComfortGradual(false);
      setComfortPaymentText("");
    }

    const [min, max] = durationRange(product);
    if (durationYears < min || durationYears > max) {
      if (product === "neon") setDurationYears(15);
      else if (product === "maximaMaxEfekt") setDurationYears(20);
      else setDurationYears(min);
    }

    // pokud uživatel má zrychlený režim, dovolíme přepnout pro konkrétní smlouvu
    // defaultně zůstává nastavený režim z profilu (mode)
  }, [product, frequency, durationYears]);

  // ČPP ŽP NEON má být vždy předvyplněno na 15 let
  useEffect(() => {
    if (product === "neon") {
      setDurationYears(15);
    }
    if (product === "maximaMaxEfekt") {
      setDurationYears(20);
    }
  }, [product]);

  useEffect(() => {
    if (!replacementEligible) {
      setReplacementOpen(false);
      setReplacementContractNumber("");
    }
  }, [product, replacementEligible]);

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
        return true;
      })
    );
  }, [amountText, clientName, contractNumber, contractSignedDate, policyStartDate, comfortPaymentText, product, comfortGradual]);

  const recalc = () => {
    const val = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);

    if (val <= 0) {
      setItems([]);
      setTotal(0);
      setUnsupported(false);
      return;
    }

    if (product === "neon") {
      const [min, max] = durationRange("neon");
      const y = Math.min(max, Math.max(min, durationYears));
      const dto = calculateNeon(val, position, y, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "flexi") {
      const dto = calculateFlexi(val, position, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "maximaMaxEfekt") {
      const [min, max] = durationRange("maximaMaxEfekt");
      const y = Math.min(max, Math.max(min, durationYears));
      const dto = calculateMaxEfekt(val, y, position, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowInjury") {
      const dto = calculatePillowInjury(val, position, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "domex") {
      const dto = calculateDomex(val, frequency, position);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate + totals.subsequent);
      setUnsupported(false);
      return;
    }

    if (product === "maxdomov") {
      const dto = calculateMaxdomov(val, frequency, position);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate + totals.subsequent);
      setUnsupported(false);
      return;
    }

    if (product === "cppAuto") {
      const dto = calculateCppAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppsimplex") {
      const dto = calculateCppSimplex(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRbez") {
      const dto = calculateCppPPRbez(val, frequency, position);
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
      const dto = calculateCppPPRs(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "allianzAuto") {
      const dto = calculateAllianzAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "csobAuto") {
      const dto = calculateCsobAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "uniqaAuto") {
      const dto = calculateUniqaAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowAuto") {
      const dto = calculatePillowAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "kooperativaAuto") {
      const dto = calculateKooperativaAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "zamex") {
      const dto = calculateZamex(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppcestovko") {
      const dto = calculateCppCestovko(val, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "axacestovko") {
      const dto = calculateAxaCestovko(val, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "comfortcc") {
      const dto = calculateComfortCC({
        fee: val,
        payment: comfortGradual ? comfortPayment : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position,
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
  }, [product, position, mode, frequency, durationYears, amountText, comfortGradual, comfortPaymentText]);

  useEffect(() => {
    if (product !== "neon") {
      setRefreshOriginalOpen(false);
      setOriginalContractNumber("");
    }
  }, [product]);

  const handleSaveContract = async (skipDuplicateCheck = false) => {
    if (!user) return;

    const value = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);
    const missing: string[] = [];
    if (value <= 0) missing.push("částku");
    if (!clientName.trim()) missing.push("jméno klienta");
    if (!contractNumber.trim()) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (!policyStartDate.trim()) missing.push("datum počátku");
    if (product === "comfortcc" && comfortGradual && comfortPayment <= 0) {
      missing.push("pravidelnou platbu");
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

    const email = (user.email ?? "").toLowerCase();
    const uid = user.uid ?? null;
    const userRef = doc(db, "users", email);
    const entriesRef = collection(userRef, "entries");

    // kontrola duplicitního čísla smlouvy
    const trimmedContractNumber = contractNumber.trim();
    if (!skipDuplicateCheck) {
      try {
        if (trimmedContractNumber) {
          const dupSnap = await getDocs(
            query(entriesRef, where("contractNumber", "==", trimmedContractNumber))
          );
          if (!dupSnap.empty) {
            const entries = dupSnap.docs.map((d) => ({
              id: d.id,
              path: d.ref.path,
            }));
            setDuplicateModal({
              contractNumber: trimmedContractNumber,
              count: dupSnap.size,
              entries,
            });
            setSaving(false);
            return;
          }
        }
      } catch (dupErr) {
        console.error("Kontrola duplicitních smluv selhala", dupErr);
      }
    }

    if (replacementEligible) {
      const trimmedReplacement = replacementContractNumber.trim();
      if (trimmedReplacement) {
        try {
          const toDelete = await getDocs(
            query(entriesRef, where("contractNumber", "==", trimmedReplacement))
          );
          if (!toDelete.empty) {
            await Promise.all(toDelete.docs.map((d) => deleteDoc(d.ref)));
          }
        } catch (delErr) {
          console.error("Smazání nahrazované smlouvy selhalo", delErr);
        }
      }
    }

    setSaving(true);
    setSaveMessage(null);
    setValidationError(null);
    setMissingFields([]);

    try {
      const signed =
        contractSignedDate.trim().length > 0
          ? new Date(contractSignedDate)
          : null;
      const start =
        policyStartDate.trim().length > 0 ? new Date(policyStartDate) : null;

      // Snapshot aktuálního nadřízeného a jeho pozice/režimu – uložíme k záznamu
      let mgrEmail = managerEmailSnapshot;
      let mgrPos = managerPositionSnapshot;
      let mgrMode = managerModeSnapshot;
      let overridesForChain: typeof managerOverridesSnapshot = [];
      try {
        const userSnap = await getDoc(userRef);
        const data = userSnap.data() as any;
        mgrEmail =
          (data?.managerEmail as string | undefined)?.toLowerCase() ??
          mgrEmail ??
          null;
        if (mgrEmail) {
          const mgrSnap = await getDoc(doc(db, "users", mgrEmail));
          if (mgrSnap.exists()) {
            const md = mgrSnap.data() as any;
            mgrPos = (md.position as Position | undefined) ?? mgrPos ?? null;
            mgrMode =
              (md.commissionMode as CommissionMode | undefined) ??
              mgrMode ??
              null;
          }
        }
      } catch (snapshotErr) {
        console.error("Failed to snapshot manager info", snapshotErr);
      }

      // předpočítej meziprovize pro celý chain (od poradce výš)
      const diffs: typeof managerOverridesSnapshot = [];
      let childPositionForBaseline: Position | null = position;

      managerChainSnapshot.forEach((mgr) => {
        if (!mgr.position) return;
        const mgrMode = mgr.commissionMode ?? mode;

        // Výsledek aktuálního manažera v jeho režimu
        const mgrRes = computeItemsForPositionAndMode(mgr.position, mgrMode);
        // Baseline: podřízený (poradce nebo nižší manažer) spočítaný ve stejném režimu, i když má zrychlený
        const baselineRes = childPositionForBaseline
          ? computeItemsForPositionAndMode(childPositionForBaseline, mgrMode)
          : null;

        if (!mgrRes || !baselineRes) {
          childPositionForBaseline = mgr.position;
          return;
        }

        const mgrItems = stripTotalRows(mgrRes.items);
        const baselineItems = stripTotalRows(baselineRes.items);

        const mgrMap = new Map<string, { title: string; amount: number }>();
        mgrItems.forEach((it) => {
          const key = normalizeTitleKey(it.title ?? "");
          const prev = mgrMap.get(key);
          mgrMap.set(key, {
            title: it.title ?? prev?.title ?? key,
            amount: (prev?.amount ?? 0) + (it.amount ?? 0),
          });
        });

        const diffItems: CommissionResultItemDTO[] = [];
        let diffTotal = 0;

        baselineItems.forEach((it) => {
          const key = normalizeTitleKey(it.title ?? "");
          const mgrVal = mgrMap.get(key);
          const mgrAmt = mgrVal?.amount ?? 0;
          const subAmt = it.amount ?? 0;
          const rem = mgrAmt - subAmt;
          if (rem > 0) {
            diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
            diffTotal += rem;
          }
          mgrMap.delete(key);
        });

        mgrMap.forEach((val) => {
          if (val.amount > 0) {
            diffItems.push({ title: val.title, amount: val.amount });
            diffTotal += val.amount;
          }
        });

        if (diffItems.length > 0 && diffTotal > 0) {
          diffs.push({
            email: mgr.email ?? null,
            position: mgr.position,
            commissionMode: mgrMode,
            items: diffItems,
            total: diffTotal,
          });
        }

        // podřízený pro další iteraci je aktuální manažer
        childPositionForBaseline = mgr.position;
      });

      overridesForChain = diffs;

      setManagerOverridesSnapshot(overridesForChain);

      await addDoc(entriesRef, {
        productKey: product,
        createdAt: serverTimestamp(),
        position,
        commissionMode: mode,
        inputAmount: product === "comfortcc" ? value : value,
        comfortPayment: product === "comfortcc" && comfortGradual ? comfortPayment : null,
        comfortGradual: product === "comfortcc" ? comfortGradual : null,
        frequencyRaw: frequency,

        // 🔹 Hlavní data výsledku – stejně jako v mobilní appce
        items,
        total,

        // 🔹 Zároveň necháváme i původní objekt result
        result: {
          items,
          total,
        },

        clientName: clientName || null,
        userId: uid,
        contractSignedDate: signed,
        policyStartDate: start,
        durationYears: shouldShowDuration(product) ? durationYears : null,
        userEmail: email,
        contractNumber: contractNumber || null,
        managerEmailSnapshot: mgrEmail ?? null,
        managerPositionSnapshot: mgrPos ?? null,
        managerModeSnapshot: mgrMode ?? null,
        managerChain: managerChainSnapshot,
        managerOverrides: overridesForChain,
      });

      setSaveMessage("Smlouva byla uložena mezi sepsané.");
      setOriginalContractNumber("");
      setRefreshOriginalOpen(false);
    } catch (error) {
      console.error("Chyba při ukládání smlouvy", error);
      setSaveMessage(
        "Nepodařilo se uložit smlouvu. Zkus to prosím za chvíli znovu."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-black text-slate-50">
        <div className="fixed inset-0 -z-10 bg-black" />

        <div className="relative flex min-h-screen items-center justify-center px-4">
          <div className="bg-slate-950/90 border border-white/10 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl p-6 w-full max-w-md space-y-4 text-center">
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
  const hasFrequencyPicker = allowed.length > 1;
  const currentProduct = PRODUCT_OPTIONS.find((p) => p.id === product)!;
  const durationHelp = durationTooltip(product);
  const canChooseMode = LIFE_PRODUCTS.includes(product) && userCommissionMode === "accelerated";

  const computeItemsForPositionAndMode = (
    pos: Position | null,
    customMode?: CommissionMode | null
  ): { items: CommissionResultItemDTO[]; total: number } | null => {
    if (!pos) return null;
    const val = parseNumber(amountText);
    const freq = frequency;
    const years = durationYears;
    const usedMode = (customMode ?? mode) as CommissionMode;

    switch (product) {
      case "neon": {
        const [min, max] = durationRange("neon");
        const y = Math.min(max, Math.max(min, years));
        return calculateNeon(val, pos, y, usedMode);
      }
      case "flexi":
        return calculateFlexi(val, pos, usedMode);
      case "maximaMaxEfekt": {
        const [min, max] = durationRange("maximaMaxEfekt");
        const y = Math.min(max, Math.max(min, years));
        return calculateMaxEfekt(val, y, pos, usedMode);
      }
      case "pillowInjury":
        return calculatePillowInjury(val, pos, usedMode);
      case "domex": {
        const dto = calculateDomex(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "maxdomov": {
        const dto = calculateMaxdomov(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "cppAuto":
        return calculateCppAuto(val, freq, pos);
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
      case "comfortcc":
        return calculateComfortCC({
          fee: val,
          payment: comfortGradual ? parseNumber(comfortPaymentText) : 0,
          isSavings: comfortGradual,
          isGradualFee: comfortGradual,
          position: pos,
        });
      default:
        return null;
    }
  };

  return (
    <AppLayout active="calc">
      {validationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setValidationError(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-slate-900/95 shadow-[0_20px_70px_rgba(0,0,0,0.8)] p-5 space-y-4">
            <div className="text-sm text-emerald-50">
              {validationError}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
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
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-400/40 bg-slate-900/95 shadow-[0_20px_70px_rgba(0,0,0,0.8)] p-5 space-y-4">
            <div className="text-sm text-emerald-50 space-y-2">
              <p>
                Smlouva s číslem <strong>{duplicateModal.contractNumber}</strong> už existuje ({duplicateModal.count}×).
              </p>
              <p>Chceš ji přepsat, nebo uložit jako novou?</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-100 hover:bg-white/10 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!user || !duplicateModal) return;
                  setDuplicateModal(null);
                  try {
                    const email = (user.email ?? "").toLowerCase();
                    const userRef = doc(db, "users", email);
                    const entriesRef = collection(userRef, "entries");
                    // smaž existující s tímto číslem
                    const dupSnap = await getDocs(
                      query(entriesRef, where("contractNumber", "==", duplicateModal.contractNumber))
                    );
                    await Promise.all(dupSnap.docs.map((d) => deleteDoc(d.ref)));
                    // ulož znovu bez další kontroly duplicit
                    await handleSaveContract(true);
                  } catch (err) {
                    console.error("Přepsání smlouvy selhalo", err);
                    setSaveMessage("Přepsání smlouvy se nepodařilo. Zkus to znovu.");
                    setSaving(false);
                  }
                }}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
              >
                Přepsat
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDuplicateModal(null);
                  await handleSaveContract(true);
                }}
                className="rounded-full border border-emerald-400/50 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15 transition"
              >
                Uložit novou
              </button>
            </div>
          </div>
        </div>
      )}

      {/* vnější glassy box je pryč – jen čistý container */}
      <div className="w-full max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SplitTitle text="Kalkulačka provizí" />
        </header>

        <div className="grid gap-6 items-start lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6 w-full lg:max-w-3xl">
            {/* Produkt */}
            <section className="space-y-1">
              <label className="block text-sm font-medium mb-1">
                Produkt
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProductOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <span className="flex items-center gap-3">
                    <div className="relative h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                      <Image
                        src={productIcon(product)}
                        alt=""
                        fill
                        className="object-contain"
                      />
                    </div>
                    <span className="font-medium">{currentProduct.label}</span>
                  </span>
                  <span className="ml-3 text-xs text-slate-400">
                    {productOpen ? "▲" : "▼"}
                  </span>
                </button>

                {productOpen && (
                  <div className="absolute z-30 mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/95 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.9)] max-h-80 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRODUCT_OPTIONS.map((p) => {
                      const isActive = p.id === product;
                      const iconSrc = productIcon(p.id);
                      const unsupportedText = SUPPORTED_PRODUCTS.includes(p.id)
                        ? null
                        : "zatím bez výpočtu";

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setProduct(p.id);
                            setProductOpen(false);
                          }}
                          className={`flex h-full w-full items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-left text-sm transition ${
                            isActive
                              ? "bg-white/10 text-slate-50 shadow-inner shadow-emerald-400/30"
                              : "text-slate-100 hover:bg-white/5"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <div className="relative h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                              <Image
                                src={iconSrc}
                                alt=""
                                fill
                                className="object-contain"
                              />
                            </div>
                            <span>{p.label}</span>
                          </span>
                          {unsupportedText && (
                            <span className="ml-2 rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                              {unsupportedText}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Doba trvání + frekvence */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shouldShowDuration(product) && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    <span className="inline-flex items-center gap-2">
                      Doba trvání smlouvy
                      {durationHelp && (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] text-slate-50"
                          title={durationHelp}
                        >
                          i
                        </span>
                      )}
                    </span>
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={durationYears}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 1;
                      const [min, max] = durationRange(product);
                      setDurationYears(Math.min(max, Math.max(min, val)));
                    }}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Parametry platby
                </label>
                {hasFrequencyPicker ? (
                  <select
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={frequency}
                    onChange={(e) =>
                      setFrequency(e.target.value as PaymentFrequency)
                    }
                  >
                    {allowed.map((f) => (
                      <option key={f} value={f}>
                        {titleForFrequency(f)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-slate-200">
                    {defaultFrequencyText(product)}
                  </p>
                )}
              </div>
            </section>

            {/* Comfort Commodity – toggle poplatku */}
            {product === "comfortcc" && (
              <section className="space-y-2">
                <div className="text-sm font-medium">Comfort Commodity</div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400 mb-1">
                      Poplatek
                    </div>
                    <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1">
                      <button
                        type="button"
                        onClick={() => setComfortGradual(false)}
                        className={`px-3 py-1.5 rounded-full text-sm transition ${
                          !comfortGradual
                            ? "bg-white text-slate-900 shadow"
                            : "text-slate-100"
                        }`}
                      >
                        Jednorázový poplatek
                      </button>
                      <button
                        type="button"
                        onClick={() => setComfortGradual(true)}
                        className={`px-3 py-1.5 rounded-full text-sm transition ${
                          comfortGradual
                            ? "bg-white text-slate-900 shadow"
                            : "text-slate-100"
                        }`}
                      >
                        Postupný poplatek
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Poplatky / částka */}
            <section className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  {product === "comfortcc"
                    ? "Poplatek (zde se určuje provize z poplatku klienta)"
                    : "Částka"}
                </label>
                <input
                  type="number"
                  className={`w-full rounded-xl border bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                    missingFields.includes("částku") ? "border-rose-400/70" : "border-white/15"
                  }`}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder={
                    product === "comfortcc"
                      ? "Zadejte poplatek"
                      : placeholderForAmount(product, frequency)
                  }
                />
              </div>

              {product === "comfortcc" && comfortGradual && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    Pravidelná platba
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={comfortPaymentText}
                    onChange={(e) => setComfortPaymentText(e.target.value)}
                    placeholder="Zadejte pravidelnou platbu"
                  />
                </div>
              )}

              {product === "neon" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRefreshOriginalOpen((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-50 shadow-[0_12px_36px_rgba(16,185,129,0.25)] hover:border-emerald-200 hover:bg-emerald-500/25 transition"
                    >
                      Refresh smlouvy
                    </button>
                    {refreshOriginalOpen && (
                      <input
                        type="text"
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Číslo původní smlouvy"
                        value={originalContractNumber}
                        onChange={(e) => setOriginalContractNumber(e.target.value)}
                        className="flex-1 min-w-[220px] rounded-full border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-300"
                      />
                    )}
                  </div>
                  {refreshOriginalOpen && (
                    <p className="text-[11px] text-emerald-200/80">
                      Při uložení nahradíme původní smlouvu se stejným číslem (smažeme starý záznam).
                    </p>
                  )}
                </div>
              )}

              {replacementEligible && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReplacementOpen((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-50 shadow-[0_12px_36px_rgba(16,185,129,0.25)] hover:border-emerald-200 hover:bg-emerald-500/25 transition"
                    >
                      Náhrada smlouvy
                    </button>
                    {replacementOpen && (
                      <input
                        type="text"
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Číslo nahrazované smlouvy"
                        value={replacementContractNumber}
                        onChange={(e) => setReplacementContractNumber(e.target.value)}
                        className="flex-1 min-w-[220px] rounded-full border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-300"
                      />
                    )}
                  </div>
                  {replacementOpen && (
                    <p className="text-[11px] text-emerald-200/80">
                      Při uložení smažeme nahrazovanou smlouvu se stejným číslem.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Detaily smlouvy */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Detaily smlouvy</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                Jméno a příjmení klienta
              </label>
              <div className="relative">
                <input
                  type="text"
                  className={`w-full rounded-xl border bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                    missingFields.includes("jméno klienta") ? "border-rose-400/70" : "border-white/15"
                  }`}
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setClientSuggestionsOpen(true);
                  }}
                  placeholder="Např. Jan Novák"
                  autoComplete="off"
                  onFocus={() => setClientSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setClientSuggestionsOpen(false), 100)}
                />
                {filteredClientSuggestions.length > 0 && clientSuggestionsOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-2xl shadow-[0_14px_40px_rgba(0,0,0,0.7)] overflow-hidden">
                    {filteredClientSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setClientName(name);
                          setMissingFields((prev) => prev.filter((k) => k !== "jméno klienta"));
                          setClientSuggestionsOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
                      >
                        <span>{name}</span>
                        <span className="text-xs text-slate-400">vložit</span>
                      </button>
                        ))}
                      </div>
                    )}
                </div>
            </div>

                <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Datum sjednání smlouvy
                </label>
                <input
                  type="date"
                  className={`w-full rounded-xl border bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 [color-scheme:dark] ${
                    missingFields.includes("datum sjednání") ? "border-rose-400/70" : "border-white/15"
                  }`}
                  value={contractSignedDate}
                  onChange={(e) => setContractSignedDate(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Číslo smlouvy
                </label>
                <input
                  type="text"
                  className={`w-full rounded-xl border bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                    missingFields.includes("číslo smlouvy") ? "border-rose-400/70" : "border-white/15"
                  }`}
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="Např. 7503027088"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Datum počátku smlouvy
                </label>
                <input
                  type="date"
                  className={`w-full rounded-xl border bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 [color-scheme:dark] ${
                    missingFields.includes("datum počátku") ? "border-rose-400/70" : "border-white/15"
                  }`}
                  value={policyStartDate}
                  onChange={(e) => setPolicyStartDate(e.target.value)}
                />
              </div>
            </div>
            </section>

            {/* Pozice a režim pro tuto smlouvu */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Sjednána jako (pozice)
                </label>
                <select
                  className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as Position)}
                >
                  {allowedPositionsForUser(baseUserPosition ?? position).map((p) => (
                    <option key={p} value={p}>
                      {positionLabel(p)}
                    </option>
                  ))}
                </select>
              </div>

              {canChooseMode && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    Režim provize
                  </label>
                  <select
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as CommissionMode)}
                  >
                    <option value="accelerated">Zrychlený</option>
                    <option value="standard">Běžný</option>
                  </select>
                  <p className="text-[11px] text-slate-400">
                    Předvyplněno tvým režimem, ale můžeš přepnout pro tuto konkrétní smlouvu.
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Výsledky + tlačítko Sepsáno */}
          <section className="rounded-3xl border border-emerald-400/40 bg-emerald-950/60 px-5 py-4 space-y-3 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.9)] h-full">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-emerald-50">
                Výsledky
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCoefModal(true)}
                  disabled={unsupported}
                  className={`inline-flex items-center gap-2 rounded-xl border border-emerald-400/70 bg-emerald-500/20 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.3)] hover:bg-emerald-500/30 transition ${
                    unsupported ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  Zobrazit koeficienty
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveContract()}
                  disabled={
                    saving || items.length === 0 || parseNumber(amountText) <= 0
                  }
                  className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/40 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Ukládám…" : "Sepsáno"}
                </button>
              </div>
            </div>

            {saveMessage && (
              <p className="text-xs text-emerald-50/80">{saveMessage}</p>
            )}

            {unsupported && (
              <p className="text-sm text-amber-200 bg-amber-900/40 border border-amber-500/50 rounded-xl px-3 py-2">
                {SUPPORTED_LABEL}
              </p>
            )}

            {!unsupported && items.length === 0 && (
              <p className="text-sm text-emerald-50/70">
                Zadej částku a produkt, hned vypočítáme jednotlivé provize.
              </p>
            )}

            {items.length > 0 && !unsupported && (() => {
              const displayItems = items.filter((item) => {
                const t = cleanResultTitle(item.title).toLowerCase();
                return !(
                  t === "celkem" ||
                  t.startsWith("celková provize")
                );
              });

              return (
                <div className="space-y-2">
                  {displayItems.map((item, idx) => {
                    const iconSrc = resultIconForTitle(item.title);
                    const title = cleanResultTitle(item.title);

                    return (
                      <div
                        key={idx}
                        className="flex items-baseline justify-between gap-3 border-b last:border-b-0 border-emerald-300/15 py-1.5"
                      >
                        <span className="flex items-center gap-3 text-sm text-emerald-50">
                          {iconSrc && (
                            <div className="relative h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0">
                              <Image
                                src={iconSrc}
                                alt=""
                                fill
                                className="object-contain"
                              />
                            </div>
                          )}
                          <span>{title}</span>
                        </span>
                        <span className="text-base sm:text-lg font-semibold text-emerald-200">
                          {formatMoney(item.amount)}
                        </span>
                      </div>
                    );
                  })}

                  <div className="pt-2 flex items-center justify-between">
                    {(product === "domex" || product === "maxdomov") && paymentBasedTotalsMemo ? (
                      <div className="w-full space-y-1 text-emerald-50">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Celkem v 1. roce</span>
                          <span className="text-xl sm:text-2xl font-bold text-emerald-200">
                            {formatMoney(paymentBasedTotalsMemo.immediate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Celkem ročně následně</span>
                          <span className="text-xl sm:text-2xl font-bold text-emerald-200">
                            {formatMoney(paymentBasedTotalsMemo.subsequent)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-emerald-50">Celkem</span>
                        <span className="text-xl sm:text-2xl font-bold text-emerald-200">
                          {formatMoney(total)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
        </div>
      </div>

      {showCoefModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít koeficienty"
            onClick={() => setShowCoefModal(false)}
          />
          <div className="relative z-50 w-full max-w-md rounded-2xl border border-emerald-400/60 bg-slate-950/95 p-6 shadow-2xl shadow-emerald-900/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-50">Koeficienty</h3>
                <p className="mt-1 text-sm text-slate-300">
                  {product ? productLabel(product) : "—"} · pozice {positionLabel(position)} · režim {mode}
                </p>
                {coefExplanation && (
                  <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                    {coefExplanation}
                  </p>
                )}
                {product && (product === "neon" || product === "flexi" || product === "maximaMaxEfekt" || product === "pillowInjury") && (
                  <p className="mt-2 text-xs font-semibold text-rose-300">
                    UPOZORNĚNÍ: Výpočet okamžité provize počítá s tím, že je zpracována karta klienta dle podmínek!
                  </p>
                )}
                {product === "neon" && (
                  <p className="mt-1 text-xs font-semibold text-rose-300">
                    Aktuální koeficienty – platnost od 01.07.2024
                  </p>
                )}
                {product === "allianzAuto" && (
                  <p className="mt-1 text-xs font-semibold text-rose-300">
                    Aktuální koeficienty – platnost od 01.08.2019
                  </p>
                )}
                {product === "csobAuto" && (
                  <p className="mt-1 text-xs font-semibold text-rose-300">
                    Aktuální koeficienty – platnost od 01.11.2024
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCoefModal(false)}
                className="rounded-full px-2 text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {coefList.length > 0 ? (
                coefList.map((c, idx) => (
                  <div
                    key={`${c.label}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
                  >
                    <span className="text-slate-300">{c.label}</span>
                    <span className="font-semibold">{formatCoefficientNumber(c.value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-300">
                  Pro tento produkt nebo pozici nemám koeficienty k zobrazení.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
