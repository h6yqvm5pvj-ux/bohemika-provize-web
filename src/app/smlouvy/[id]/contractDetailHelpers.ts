import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
} from "../../types/domain";
import { type ContractDoc, type FirestoreTimestamp } from "./contractDetailTypes";

export function nameFromEmail(email?: string | null): string {
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

export function preloadFormulaModule(product?: Product | null) {
  switch (product) {
    case "neon":
      import("../../lib/productFormulas/neon");
      break;
    case "flexi":
      import("../../lib/productFormulas/flexi");
      break;
    case "maximaMaxEfekt":
      import("../../lib/productFormulas/maximaMaxEfekt");
      break;
    case "pillowInjury":
      import("../../lib/productFormulas/pillowInjury");
      break;
    case "domex":
      import("../../lib/productFormulas/domex");
      break;
    case "cppPPRbez":
      import("../../lib/productFormulas/cppPPRbez");
      break;
    case "maxdomov":
      import("../../lib/productFormulas/maxdomov");
      break;
    case "cppsimplex":
      import("../../lib/productFormulas/cppsimplex");
      break;
    case "cppAuto":
      import("../../lib/productFormulas/cppAuto");
      break;
    case "cppPPRs":
      import("../../lib/productFormulas/cppPPRs");
      break;
    case "allianzAuto":
      import("../../lib/productFormulas/allianzAuto");
      break;
    case "csobAuto":
      import("../../lib/productFormulas/csobAuto");
      break;
    case "uniqaAuto":
      import("../../lib/productFormulas/uniqaAuto");
      break;
    case "pillowAuto":
      import("../../lib/productFormulas/pillowAuto");
      break;
    case "kooperativaAuto":
      import("../../lib/productFormulas/kooperativaAuto");
      break;
    case "zamex":
      import("../../lib/productFormulas/zamex");
      break;
    case "cppcestovko":
      import("../../lib/productFormulas/cppcestovko");
      break;
    case "axacestovko":
      import("../../lib/productFormulas/axacestovko");
      break;
    case "comfortcc":
      import("../../lib/productFormulas/comfortcc");
      break;
    default:
      break;
  }
}

export function toDate(value: unknown): Date | null {
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
    const ms = v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("cs-CZ");
}

export function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

export function productLabel(p?: Product): string {
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
    case "cppsimplex":
      return "ČPP Simplex";
    case "cppPPRbez":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "cppPPRs":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS";
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
    default:
      return "Neznámý produkt";
  }
}

export function isAutoProduct(p?: Product | null): boolean {
  return (
    p === "cppAuto" ||
    p === "allianzAuto" ||
    p === "csobAuto" ||
    p === "uniqaAuto" ||
    p === "pillowAuto" ||
    p === "kooperativaAuto"
  );
}

export function productIcon(p?: Product): string {
  if (
    p === "neon" ||
    p === "flexi" ||
    p === "maximaMaxEfekt" ||
    p === "pillowInjury"
  ) {
    return "/icons/zivot.png";
  }

  if (
    p === "cppAuto" ||
    p === "allianzAuto" ||
    p === "csobAuto" ||
    p === "uniqaAuto" ||
    p === "pillowAuto" ||
    p === "kooperativaAuto"
  ) {
    return "/icons/icon_auto.png";
  }

  if (p === "zamex") {
    return "/icons/icon_zamex.png";
  }

  if (
    p === "domex" ||
    p === "maxdomov" ||
    p === "cppPPRs" ||
    p === "cppPPRbez" ||
    p === "cppsimplex"
  ) {
    return "/icons/icon_domex.png";
  }

  if (p === "cppcestovko" || p === "axacestovko") {
    return "/icons/icon_cestovko.png";
  }

  if (p === "comfortcc") {
    return "/icons/trezor.png";
  }

  return "/icons/produkt.png";
}

export function positionLabel(pos?: Position | null): string {
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
  return pos ? map[pos] ?? pos : "—";
}

export function frequencyText(raw?: PaymentFrequency | null): string {
  switch (raw) {
    case "monthly":
      return "měsíční";
    case "quarterly":
      return "čtvrtletní";
    case "semiannual":
      return "pololetní";
    case "annual":
      return "roční";
    default:
      return "—";
  }
}

export function paymentsPerYear(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
}

export function paymentBasedTotals(
  items: CommissionResultItemDTO[],
  multiplier: number
): { immediate: number; subsequent: number } {
  let immediate = 0;
  let subsequent = 0;
  items.forEach((it) => {
    const norm = normalizeTitleForCompare(it.title);
    if (norm.includes("okamžitá provize")) {
      immediate += it.amount ?? 0;
    } else if (norm.includes("následná provize")) {
      subsequent += it.amount ?? 0;
    }
  });
  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
}

export function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

export function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export function isEmailInChain(
  email: string | null,
  chain?: { email: string | null }[] | null
): boolean {
  if (!email || !chain) return false;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return chain.some((c) => normalizeEmail(c.email) === normalized);
}

export function toDateInputValue(value: unknown): string {
  const d = toDate(value);
  if (!d) return "";
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

export function normalizeTitleForCompare(title: string | undefined | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

export function cleanResultTitle(title: string): string {
  const match = title.match(/[\p{L}\p{N}]/u);
  if (!match) return title.trim();
  return title.slice(title.indexOf(match[0])).trim();
}

export function resultIconForTitle(title: string): string | null {
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

export function stripTotalRows(
  arr: CommissionResultItemDTO[] | null | undefined
): CommissionResultItemDTO[] {
  return (arr ?? []).filter(
    (it) => !normalizeTitleForCompare(it.title).includes("celkem")
  );
}

export function itemMultiplier(title: string | undefined | null): number {
  const norm = normalizeTitleForCompare(title);
  if (norm.includes("2.–5.")) return 4; // roky 2–5
  if (norm.includes("5.–10.")) return 6; // roky 5–10
  return 1;
}

export function computeTotalWithMultipliers(
  items: CommissionResultItemDTO[] | null | undefined
): number {
  const cleaned = stripTotalRows(items);
  const hasYearly = cleaned.some((it) =>
    normalizeTitleForCompare(it.title).includes("provize za rok")
  );
  const source = hasYearly
    ? cleaned.filter((it) =>
        normalizeTitleForCompare(it.title).includes("provize za rok")
      )
    : cleaned;

  return source.reduce((sum, it) => {
    const amt = it.amount ?? 0;
    return sum + amt * itemMultiplier(it.title);
  }, 0);
}

export function diffItemsByTitle(
  upper: CommissionResultItemDTO[] | null | undefined,
  lower: CommissionResultItemDTO[] | null | undefined
): { items: CommissionResultItemDTO[]; total: number } {
  const upperClean = stripTotalRows(upper);
  const lowerClean = stripTotalRows(lower);

  const upperMap = new Map<string, { title: string; amount: number }>();
  upperClean.forEach((it) => {
    const key = normalizeTitleForCompare(it.title);
    const prev = upperMap.get(key);
    upperMap.set(key, {
      title: it.title ?? prev?.title ?? key,
      amount: (prev?.amount ?? 0) + (it.amount ?? 0),
    });
  });

  const diffs: CommissionResultItemDTO[] = [];

  let runningTotal = 0;
  lowerClean.forEach((it) => {
    const key = normalizeTitleForCompare(it.title);
    const up = upperMap.get(key);
    const diff = (up?.amount ?? 0) - (it.amount ?? 0);
    if (diff > 0) {
      const titleVal = up?.title ?? it.title;
      diffs.push({ title: titleVal, amount: diff });
      runningTotal += diff * itemMultiplier(titleVal);
    }
    upperMap.delete(key);
  });

  upperMap.forEach((val) => {
    if (val.amount > 0) {
      diffs.push({ title: val.title, amount: val.amount });
      runningTotal += val.amount * itemMultiplier(val.title);
    }
  });

  const hasYearly = diffs.some((it) =>
    normalizeTitleForCompare(it.title).includes("provize za rok")
  );
  const total = hasYearly
    ? diffs
        .filter((it) => normalizeTitleForCompare(it.title).includes("provize za rok"))
        .reduce((sum, it) => sum + (it.amount ?? 0) * itemMultiplier(it.title), 0)
    : runningTotal;

  return { items: diffs, total };
}

// spočítá kompletní výsledek pro danou pozici (stejné formule jako v kalkulačce)
export async function calculateResultForPosition(
  c: ContractDoc,
  position: Position,
  mode: CommissionMode | null
): Promise<{ items: CommissionResultItemDTO[]; total: number } | null> {
  const product = c.productKey;
  if (!product) return null;

  const amount = c.inputAmount ?? 0;
  const freq = (c.frequencyRaw ?? "annual") as PaymentFrequency;
  const comfortPayment = c.comfortPayment ?? 0;
  const comfortGradual = !!c.comfortGradual;

  const years =
    typeof c.durationYears === "number" && !Number.isNaN(c.durationYears)
      ? c.durationYears
      : 30;

  const usedMode = (mode ?? "standard") as CommissionMode;

  switch (product) {
    case "neon": {
      const { calculateNeon } = await import("../../lib/productFormulas/neon");
      return calculateNeon(amount, position, years, usedMode);
    }
    case "flexi": {
      const { calculateFlexi } = await import("../../lib/productFormulas/flexi");
      return calculateFlexi(amount, position, usedMode);
    }
    case "maximaMaxEfekt": {
      const { calculateMaxEfekt } = await import(
        "../../lib/productFormulas/maximaMaxEfekt"
      );
      return calculateMaxEfekt(amount, years, position, usedMode);
    }
    case "pillowInjury": {
      const { calculatePillowInjury } = await import(
        "../../lib/productFormulas/pillowInjury"
      );
      return calculatePillowInjury(amount, position, usedMode);
    }
    case "domex": {
      const { calculateDomex } = await import("../../lib/productFormulas/domex");
      return calculateDomex(amount, freq, position);
    }
    case "cppPPRbez": {
      const { calculateCppPPRbez } = await import(
        "../../lib/productFormulas/cppPPRbez"
      );
      return calculateCppPPRbez(amount, freq, position);
    }
    case "maxdomov": {
      const { calculateMaxdomov } = await import(
        "../../lib/productFormulas/maxdomov"
      );
      return calculateMaxdomov(amount, freq, position);
    }
    case "cppsimplex": {
      const { calculateCppSimplex } = await import(
        "../../lib/productFormulas/cppsimplex"
      );
      return calculateCppSimplex(amount, freq, position);
    }
    case "cppAuto": {
      const { calculateCppAuto } = await import("../../lib/productFormulas/cppAuto");
      return calculateCppAuto(amount, freq, position);
    }
    case "cppPPRs": {
      const { calculateCppPPRs } = await import("../../lib/productFormulas/cppPPRs");
      return calculateCppPPRs(amount, freq, position);
    }
    case "allianzAuto": {
      const { calculateAllianzAuto } = await import(
        "../../lib/productFormulas/allianzAuto"
      );
      return calculateAllianzAuto(amount, freq, position);
    }
    case "csobAuto": {
      const { calculateCsobAuto } = await import("../../lib/productFormulas/csobAuto");
      return calculateCsobAuto(amount, freq, position);
    }
    case "uniqaAuto": {
      const { calculateUniqaAuto } = await import(
        "../../lib/productFormulas/uniqaAuto"
      );
      return calculateUniqaAuto(amount, freq, position);
    }
    case "pillowAuto": {
      const { calculatePillowAuto } = await import(
        "../../lib/productFormulas/pillowAuto"
      );
      return calculatePillowAuto(amount, freq, position);
    }
    case "kooperativaAuto": {
      const { calculateKooperativaAuto } = await import(
        "../../lib/productFormulas/kooperativaAuto"
      );
      return calculateKooperativaAuto(amount, freq, position);
    }
    case "zamex": {
      const { calculateZamex } = await import("../../lib/productFormulas/zamex");
      return calculateZamex(amount, freq, position);
    }
    case "cppcestovko": {
      const { calculateCppCestovko } = await import(
        "../../lib/productFormulas/cppcestovko"
      );
      return calculateCppCestovko(amount, position);
    }
    case "axacestovko": {
      const { calculateAxaCestovko } = await import(
        "../../lib/productFormulas/axacestovko"
      );
      return calculateAxaCestovko(amount, position);
    }
    case "comfortcc": {
      const { calculateComfortCC } = await import(
        "../../lib/productFormulas/comfortcc"
      );
      return calculateComfortCC({
        fee: amount,
        payment: comfortGradual ? comfortPayment : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position,
      });
    }
    default:
      return null;
  }
}
