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
} from "../lib/productFormulas";

import Plasma from "@/components/Plasma";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
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

const PRODUCT_OPTIONS: { id: Product; label: string }[] = [
  { id: "neon", label: "ČPP ŽP NEON" },
  { id: "flexi", label: "Kooperativa ŽP FLEXI" },
  { id: "maximaMaxEfekt", label: "MAXIMA ŽP MaxEfekt" },
  { id: "pillowInjury", label: "Pillow Úraz / Nemoc" },
  { id: "zamex", label: "ČPP ZAMEX" },
  { id: "domex", label: "ČPP DOMEX" },
  { id: "maxdomov", label: "Maxima MAXDOMOV" },
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

  if (product === "domex" || product === "maxdomov" || product === "cppPPRbez") {
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
  const [contractSignedDate, setContractSignedDate] = useState<string>("");
  const [policyStartDate, setPolicyStartDate] = useState<string>("");
  const [contractNumber, setContractNumber] = useState<string>("");

  const [items, setItems] = useState<CommissionResultItemDTO[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [unsupported, setUnsupported] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [managerEmailSnapshot, setManagerEmailSnapshot] = useState<string | null>(null);
  const [managerPositionSnapshot, setManagerPositionSnapshot] = useState<Position | null>(null);
  const [managerModeSnapshot, setManagerModeSnapshot] = useState<CommissionMode | null>(null);
  const [managerChainSnapshot, setManagerChainSnapshot] = useState<
    { email: string | null; position: Position | null; commissionMode: CommissionMode | null }[]
  >([]);
  const [userCommissionMode, setUserCommissionMode] = useState<CommissionMode | null>(null);
  const [baseUserPosition, setBaseUserPosition] = useState<Position | null>(null);
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
      else if (product === "maximaMaxEfekt") setDurationYears(10);
      else setDurationYears(min);
    }

    // pokud uživatel má zrychlený režim, dovolíme přepnout pro konkrétní smlouvu
    // defaultně zůstává nastavený režim z profilu (mode)
  }, [product, frequency, durationYears]);

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
      const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
      setItems(filtered);
      setTotal(sum);
      setUnsupported(false);
      return;
    }

    if (product === "maxdomov") {
      const dto = calculateMaxdomov(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
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

  const handleSaveContract = async () => {
    if (!user) return;

    const value = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);
    if (value <= 0 || items.length === 0) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const email = (user.email ?? "").toLowerCase();
      const userRef = doc(db, "users", email);
      const entriesRef = collection(userRef, "entries");

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
        contractSignedDate: signed,
        policyStartDate: start,
        durationYears: shouldShowDuration(product) ? durationYears : null,
        userEmail: email,
        contractNumber: contractNumber || null,
        managerEmailSnapshot: mgrEmail ?? null,
        managerPositionSnapshot: mgrPos ?? null,
        managerModeSnapshot: mgrMode ?? null,
        managerChain: managerChainSnapshot,
      });

      setSaveMessage("Smlouva byla uložena mezi sepsané.");
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
      <main className="relative min-h-screen overflow-hidden bg-[#020014] text-slate-50">
        <div className="fixed inset-0 -z-10 bg-black">
          <Plasma
            color="#4f46e5"
            speed={0.6}
            direction="forward"
            scale={1.1}
            opacity={0.8}
            mouseInteractive={false}
            animated={false}
          />
        </div>

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

  return (
    <AppLayout active="calc">
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

            {/* Doba trvání + frekvence + režim */}
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

              {canChooseMode && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-sm font-medium">
                    Režim výplaty provize (jen pro životní produkty)
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
                  className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
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
            </section>

            {/* Detaily smlouvy */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Detaily smlouvy</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                Jméno klienta
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Např. Jan Novák"
                  autoComplete="off"
                />
                {filteredClientSuggestions.length > 0 && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-2xl shadow-[0_14px_40px_rgba(0,0,0,0.7)] overflow-hidden">
                    {filteredClientSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setClientName(name)}
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
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
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
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
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
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={policyStartDate}
                    onChange={(e) => setPolicyStartDate(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Výsledky + tlačítko Sepsáno */}
          <section className="rounded-3xl border border-emerald-400/40 bg-emerald-950/60 px-5 py-4 space-y-3 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.9)] h-full">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-emerald-50">
                Výsledky
              </h2>

              <button
                type="button"
                onClick={handleSaveContract}
                disabled={
                  saving || items.length === 0 || parseNumber(amountText) <= 0
                }
                className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/40 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? "Ukládám…" : "Sepsáno"}
              </button>
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
                    <span className="font-semibold text-emerald-50">Celkem</span>
                    <span className="text-xl sm:text-2xl font-bold text-emerald-200">
                      {formatMoney(total)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
