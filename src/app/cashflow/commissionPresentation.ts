import { isAutoProduct, isPropertyProduct } from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import type { CashflowItem } from "./types";

export type CashflowDisplayGroup = {
  id: string;
  leadItem: CashflowItem;
  items: CashflowItem[];
  amount: number;
  stornoFundAmount: number;
  netAmount: number;
};

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


export function commissionLabelForItem(item: CashflowItem): string | null {
  return (
    item.commissionLabel?.trim() ||
    item.commissionCode?.trim() ||
    nonLifeCommissionDetail(item)?.commissionTypeLabel ||
    null
  );
}

export function payoutStatusLabel(status: CashflowItem["payoutStatus"] | undefined): string {
  if (status === "paid") return "Vyplaceno";
  if (status === "shifted") return "Přesunuto";
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
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
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

  const policyStart = item.policyStartDate ?? null;
  const firstAnniversary = policyStart ? addYears(policyStart, 1) : null;
  const firstAnniversaryPayout = firstAnniversary
    ? estimatedPayoutDateForPolicyDate(firstAnniversary)
    : null;
  const effectiveDate = item.originalDate ?? item.date;
  const note = (item.note ?? "").toLocaleLowerCase("cs-CZ");
  const isSubsequent =
    note.includes("násled") ||
    note.includes("ročně k výročí") ||
    Boolean(firstAnniversaryPayout && effectiveDate >= firstAnniversaryPayout);
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
