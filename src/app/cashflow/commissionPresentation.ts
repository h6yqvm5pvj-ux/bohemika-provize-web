import { isAutoProduct, isLifeProduct, isPropertyProduct } from "@/app/lib/productCatalog";
import { commissionPeriodForCode } from "@/app/lib/commissionPeriodForCode";
import { lifeIncreaseItemCode, lifeIncreaseCommissionLabel } from "@/app/lib/lifePremiumIncrease";
import type { Product } from "@/app/types/domain";
import type { CashflowItem } from "./types";

export type CashflowDisplayGroup = {
  id: string;
  contractGroupId?: string;
  leadItem: CashflowItem;
  items: CashflowItem[];
  amount: number;
  stornoFundAmount: number;
  netAmount: number;
};

/** A cancelled contract can still have valid historical positive commissions. */
export function isCashflowCancellation(item: CashflowItem): boolean {
  if (item.isSubscriptionPayment || item.productKey === "subscription") return false;
  return item.amount < 0 || /(?:^|·)\s*storno z výpisu\s*$/i.test(item.note ?? "");
}

export function cashflowItemDisplayStatus(item: CashflowItem) {
  return isCashflowCancellation(item) ? "cancelled" : item.payoutStatus ?? "predicted";
}

export function isShiftedCashflowPayout(item: CashflowItem): boolean {
  return cashflowItemDisplayStatus(item) === "shifted";
}

export function commissionMeaning(
  label: string | null,
  isTipIncome: boolean,
  isSubscriptionIncome: boolean
): { title: string; text: string } {
  if (isSubscriptionIncome) {
    return {
      title: "Platba předplatného",
      text: "Zapsaná nebo očekávaná platba uživatele za aktivní předplatné aplikace. V cashflow se drží odděleně od smluvních provizí a nevstupuje do STORNO fondu.",
    };
  }

  const normalized = (label ?? "").toLowerCase();
  const deferredIncreaseCode = normalized.match(/\bNB\s*(?:3601|036|36|4801|048|48)\b/i)?.[0];
  if (deferredIncreaseCode) {
    const years = lifeIncreaseItemCode(deferredIncreaseCode) === "B3601" ? 3 : 4;
    return {
      title: lifeIncreaseCommissionLabel(deferredIncreaseCode)!,
      text: `Samostatná odložená provize navýšení. Porovnává se s provizí po ${years === 3 ? "třech" : "čtyřech"} letech příslušného dodatku.`,
    };
  }
  if (normalized.includes("b0301")) {
    return {
      title: "Karta klienta",
      text:
        "Druhá část okamžité provize. Je podmíněná zpracováním karty klienta; pokud ve výpisu nepřijde, cashflow ji drží odděleně a přesune ji do dalšího měsíce.",
    };
  }

  if (normalized.includes("a101")) {
    return {
      title: "Základ sjednávací provize",
      text:
        "První část okamžité provize. Tohle je část, která se běžně očekává v prvním výplatním měsíci po sjednání a počátku smlouvy.",
    };
  }

  if (normalized.includes("b3601") || normalized.includes("b36") || normalized.includes("50%")) {
    return {
      title: "Zrychlená část B36/B3601",
      text:
        "Část provize vyplacená hned ve zrychleném režimu. Je oddělená od A101 a B0301, aby bylo vidět, která konkrétní část už přišla ve výpisu.",
    };
  }

  if (isTipIncome) {
    return {
      title: "TIP provize",
      text: "Samostatná výplata za tip. V cashflow se drží odděleně od vlastních a týmových smluv.",
    };
  }

  return {
    title: "Výplata podle rozpisu",
    text:
      "Položka představuje očekávanou provizní výplatu podle produktu, frekvence platby a rozpisu provizí ve smlouvě.",
  };
}


export function lifeRecurringCommission(item: CashflowItem): { code: string; policyYear: number } | null {
  const product = item.productKey;
  if (item.isTipPayout || item.isExtraPayout || item.isSubscriptionPayment ||
    product === "unknown" || product === "subscription" || !isLifeProduct(product)) return null;
  const code = item.commissionCode?.trim().toUpperCase() ?? "";
  const start = item.policyStartDate;
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())) return null;
  const entry = { productKey: product, policyStartDate: localIsoDay(start) };
  let exactCode = /^B[12]\d{2}$/.test(code) ? code : null;
  if (!exactCode) {
    const range = code.match(/^B([12])(\d{2})\s*[-–]\s*B\1(\d{2})$/);
    if (!range || !isValidIsoDay(item.commissionPeriodStart)) return null;
    const first = Number(range[2]);
    const last = Number(range[3]);
    if (last < first || last - first > 24) return null;
    // A shifted payday does not change which contractual installment is due.
    for (let index = first; index <= last; index++) {
      const candidate = `B${range[1]}${String(index).padStart(2, "0")}`;
      if (commissionPeriodForCode(entry, candidate) === item.commissionPeriodStart) {
        exactCode = candidate;
        break;
      }
    }
  }
  if (!exactCode) return null;
  const period = commissionPeriodForCode(entry, exactCode);
  if (!period) return null;
  return { code: exactCode, policyYear: Number(period.slice(0, 4)) - start.getFullYear() + 1 };
}

export function commissionLabelForItem(item: CashflowItem): string | null {
  const recurring = lifeRecurringCommission(item);
  if (recurring) {
    const label = item.productKey === "neon" && recurring.code.startsWith("B2")
      ? "Pečovatelská provize" : "Následná provize";
    return `${label} (${recurring.code} · ${recurring.policyYear}. rok)`;
  }
  const label = item.commissionLabel?.trim() || null;
  const code = item.commissionCode?.trim() || null;
  if (label && code) {
    const escapedCode = code
      .split(/\s+/)
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s*");
    const codeIsAlreadyShown = new RegExp(`(^|[^A-Z0-9_-])${escapedCode}($|[^A-Z0-9_-])`, "i").test(label);
    return codeIsAlreadyShown ? label : `${label} (${code})`;
  }
  return label || code || nonLifeCommissionDetail(item)?.commissionTypeLabel || null;
}

export function payoutStatusLabel(
  status: CashflowItem["payoutStatus"] | "cancelled" | undefined,
  items: CashflowItem[] = []
): string {
  if (status === "cancelled") return "Stornováno";
  if (status === "paid") return "Vyplaceno";
  if (status === "shifted") {
    const offsets = items.map(({ date, originalDate }) =>
      date instanceof Date && originalDate instanceof Date
        ? (date.getFullYear() - originalDate.getFullYear()) * 12 + date.getMonth() - originalDate.getMonth()
        : NaN
    );
    if (offsets.length === 0 || offsets.some(months => !Number.isFinite(months) || months <= 0)) return "Přesunuto";
    const min = Math.min(...offsets);
    const max = Math.max(...offsets);
    const count = min === max ? String(min) : `${min}–${max}`;
    const unit = max === 1 ? "měsíc" : max <= 4 ? "měsíce" : "měsíců";
    return `Přesunuto o ${count} ${unit}`;
  }
  return "Předpoklad";
}


export function dateRangeLabel(items: CashflowItem[]): string {
  const dates = items
    .map((item) => item.date)
    .filter((date) => date instanceof Date && Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "—";
  const firstLabel = first.toLocaleDateString("cs-CZ");
  const lastLabel = last.toLocaleDateString("cs-CZ");
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} - ${lastLabel}`;
}


const COMMISSION_BY_PAYMENT_FREQUENCY_PRODUCTS = new Set<Product>([
  "cppAuto",
  "slaviaauto",
  "slaviaflotila",
  "csobAuto",
  "kooperativaAuto",
  "koopflotila",
  "domexneuron",
  "domex",
  "cppbytex",
  "cpphafan",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "zamex",
  "cppsimplex",
  "cppPPRs",
  "cppPPRbez",
]);

const COMMISSION_ANNUAL_ADVANCE_PRODUCTS = new Set<Product>([
  "allianzAuto",
  "pillowAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowmajetek",
  "allianzmujdomov",
]);

type NonLifeCommissionDetail = {
  commissionTypeLabel: string;
  commissionText: string;
  payoutModeLabel: string;
  firstAnniversaryLabel: string | null;
};

function addYears(date: Date, years: number): Date {
  const year = date.getFullYear() + years;
  const lastDayOfMonth = new Date(year, date.getMonth() + 1, 0).getDate();
  return new Date(year, date.getMonth(), Math.min(date.getDate(), lastDayOfMonth));
}

function localIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isValidIsoDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return localIsoDay(parsed) === value;
}

function estimatedPayoutDateForPolicyDate(date: Date): Date {
  const payoutMonthOffset = date.getDate() > 25 ? 2 : 1;
  return new Date(date.getFullYear(), date.getMonth() + payoutMonthOffset, 25);
}

export function nonLifeCommissionDetail(item: CashflowItem): NonLifeCommissionDetail | null {
  const product =
    item.productKey === "unknown" || item.productKey === "subscription"
      ? null
      : item.productKey;
  if (!product || (!isAutoProduct(product) && !isPropertyProduct(product))) return null;

  if (item.payoutPlanStatus) {
    return {
      commissionTypeLabel: item.payoutPlanStatus === "matched" ? "Následná provize" : item.payoutPlanStatus === "correction" ? "Storno / srážka z výpisu" : item.commissionLabel || "C výplata z výpisu",
      commissionText: item.payoutPlanStatus === "matched"
        ? `Výplata ${item.commissionCode} automaticky nahrazuje položku plánu ${item.matchedPlannedCode}. Původní odhad se už nezapočítává.`
        : item.payoutPlanStatus === "correction"
        ? "Oprava zůstává samostatnou položkou se skutečnou částkou z výpisu."
        : "Výplata je započítaná ve skutečné částce z výpisu.",
      payoutModeLabel: "Skutečná částka z výpisu",
      firstAnniversaryLabel: null,
    };
  }

  const policyStart = item.policyStartDate ?? null;
  const firstAnniversary = policyStart ? addYears(policyStart, 1) : null;
  const firstAnniversaryPayout = firstAnniversary
    ? estimatedPayoutDateForPolicyDate(firstAnniversary)
    : null;
  const effectiveDate = item.originalDate ?? item.date;
  const note = (item.note ?? "").toLocaleLowerCase("cs-CZ");
  const commissionLabel = (item.commissionLabel ?? "").toLocaleLowerCase("cs-CZ");
  const explicitSubsequent =
    note.includes("násled") ||
    note.includes("ročně k výročí") ||
    commissionLabel.includes("násled");
  const commissionPeriodStart = isValidIsoDay(item.commissionPeriodStart)
    ? item.commissionPeriodStart
    : null;
  const isSubsequent = explicitSubsequent || (commissionPeriodStart && firstAnniversary
    ? commissionPeriodStart >= localIsoDay(firstAnniversary)
    : Boolean(firstAnniversaryPayout && effectiveDate >= firstAnniversaryPayout));
  const isAuto = isAutoProduct(product);
  const commissionTypeLabel = isSubsequent ? "Následná provize" : "Vzniková provize";
  const firstAnniversaryLabel = firstAnniversary
    ? firstAnniversary.toLocaleDateString("cs-CZ")
    : null;

  const commissionText = isSubsequent
    ? `Položka patří do období od 1. výročí smlouvy, proto je vedená jako následná provize.`
    : isAuto
    ? `Položka patří do prvního roku smlouvy, proto je vedená jako vzniková provize. U auta tak zůstává označená i při měsíční nebo čtvrtletní platbě klienta.`
    : `Položka patří do prvního roku smlouvy, proto je vedená jako vzniková provize.`;

  if (COMMISSION_BY_PAYMENT_FREQUENCY_PRODUCTS.has(product)) {
    return {
      commissionTypeLabel,
      commissionText,
      payoutModeLabel: "Dle frekvence platby",
      firstAnniversaryLabel,
    };
  }

  if (COMMISSION_ANNUAL_ADVANCE_PRODUCTS.has(product)) {
    return {
      commissionTypeLabel,
      commissionText,
      payoutModeLabel: "Zálohově za roční pojistné",
      firstAnniversaryLabel,
    };
  }

  return {
    commissionTypeLabel,
    commissionText,
    payoutModeLabel: "Podle rozpisu produktu",
    firstAnniversaryLabel,
  };
}
