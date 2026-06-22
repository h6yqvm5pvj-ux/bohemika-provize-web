export type SubscriptionEffectiveState = "active" | "grace" | "blocked";
export type SubscriptionStatusValue = "active" | "expired" | "unpaid" | "none";
export type SubscriptionPlanValue = "monthly" | "semiannual" | "yearly" | "unlimited";

export type SubscriptionPaymentRow = {
  id: string;
  plan: string;
  amountCzk: number;
  periodFrom: string;
  periodUntil: string;
  note: string | null;
  createdAtMs: number | null;
  createdByEmail: string | null;
};

export type SubscriptionSnapshot = {
  status: SubscriptionStatusValue;
  effectiveState: SubscriptionEffectiveState;
  plan: SubscriptionPlanValue | null;
  paidFrom: string | null;
  paidUntil: string | null;
  graceUntil: string | null;
};

export type SubscriptionMeResponse = {
  ok?: boolean;
  subscription?: {
    status?: SubscriptionStatusValue;
    effectiveState?: SubscriptionEffectiveState;
    reason?: string;
    plan?: SubscriptionPlanValue | null;
    paidFrom?: string | null;
    paidUntil?: string | null;
    graceUntil?: string | null;
  };
  payments?: SubscriptionPaymentRow[];
};

export const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ");
};

export const formatIsoDay = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
};

export const formatMoneyCzk = (value: number): string =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);

export const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlanValue, string> = {
  monthly: "Měsíční",
  semiannual: "Pololetní",
  yearly: "Roční",
  unlimited: "Neomezený",
};

export type SubscriptionPriceCard = {
  id: Exclude<SubscriptionPlanValue, "unlimited">;
  title: string;
  description: string;
  priceLabel: string;
  cadenceLabel: string;
  footerLabel: string;
  footerEmphasis: string;
};

export const SUBSCRIPTION_PRICE_CARDS: readonly SubscriptionPriceCard[] = [
  {
    id: "monthly",
    title: "Měsíční předplatné",
    description: "Flexibilní přístup ke všem funkcím aplikace bez dlouhého závazku.",
    priceLabel: "300 Kč",
    cadenceLabel: "za měsíc",
    footerLabel: "Délka období",
    footerEmphasis: "1 měsíc",
  },
  {
    id: "semiannual",
    title: "Pololetní předplatné",
    description: "Šest měsíců přístupu s nižší cenou oproti měsíční platbě.",
    priceLabel: "1.590 Kč",
    cadenceLabel: "na 6 měsíců",
    footerLabel: "Úspora proti měsíčnímu",
    footerEmphasis: "210 Kč",
  },
  {
    id: "yearly",
    title: "Roční předplatné",
    description: "Celoroční přístup za nejlepší cenu pro pravidelné používání.",
    priceLabel: "2.800 Kč",
    cadenceLabel: "na 12 měsíců",
    footerLabel: "Úspora proti měsíčnímu",
    footerEmphasis: "800 Kč",
  },
];
