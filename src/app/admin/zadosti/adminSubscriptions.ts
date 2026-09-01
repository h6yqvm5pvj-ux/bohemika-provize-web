import { nameFromEmail } from "./adminFormatters";

export type SubscriptionPlanValue =
  | "monthly"
  | "semiannual"
  | "yearly"
  | "unlimited";
export type PaidSubscriptionPlanValue = Exclude<SubscriptionPlanValue, "unlimited">;

export type AdminSubscriptionPaymentRow = {
  id: string;
  plan: string;
  amountCzk: number;
  periodFrom: string;
  periodUntil: string;
  note: string | null;
  createdAtMs: number | null;
  createdByEmail: string | null;
};

export type AdminSubscriptionLookupResponse = {
  ok?: boolean;
  user?: {
    email?: string;
    fullName?: string | null;
  };
  subscription?: {
    status?: string;
    effectiveState?: "active" | "grace" | "blocked";
    reason?: string;
    plan?: SubscriptionPlanValue | null;
    paidFrom?: string | null;
    paidUntil?: string | null;
    graceUntil?: string | null;
  };
  payments?: AdminSubscriptionPaymentRow[];
};

export type AdminSubscriptionDirectoryFilter = "all" | "overdue" | "dueSoon";

export type AdminSubscriptionDirectoryRow = {
  email: string;
  fullName: string | null;
  managerEmail: string | null;
  position: string | null;
  subscription: {
    status?: string;
    effectiveState?: "active" | "grace" | "blocked";
    reason?: string;
    plan?: SubscriptionPlanValue | null;
    paidFrom?: string | null;
    paidUntil?: string | null;
    graceUntil?: string | null;
  };
  flags?: {
    isOverdue?: boolean;
    isDueSoon?: boolean;
    daysUntilDue?: number | null;
  };
};

export type AdminSubscriptionDirectoryResponse = {
  ok?: boolean;
  users?: AdminSubscriptionDirectoryRow[];
};

export type AdminSubscriptionStatus = {
  type: "success" | "error" | "info";
  message: string;
};

export const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlanValue, string> = {
  monthly: "Měsíční",
  semiannual: "Pololetní",
  yearly: "Roční",
  unlimited: "Neomezený",
};

export const PAID_SUBSCRIPTION_PLAN_KEYS: PaidSubscriptionPlanValue[] = [
  "monthly",
  "semiannual",
  "yearly",
];

export const SUBSCRIPTION_DIRECTORY_FILTERS: Array<{
  id: AdminSubscriptionDirectoryFilter;
  label: string;
}> = [
  { id: "all", label: "Všichni" },
  { id: "overdue", label: "Po splatnosti" },
  { id: "dueSoon", label: "Blížící se platba (7 dní)" },
];

export const isPaidSubscriptionPlanValue = (
  value: string | null | undefined
): value is PaidSubscriptionPlanValue =>
  value === "monthly" || value === "semiannual" || value === "yearly";

export const getSubscriptionStateLabel = (row: {
  subscription?: { effectiveState?: string; status?: string };
}) => {
  if (row.subscription?.effectiveState === "active") return "Aktivní";
  if (row.subscription?.effectiveState === "grace") return "Po splatnosti";
  if (row.subscription?.status === "unpaid") return "Nezaplaceno";
  return "Blokováno";
};

export const getSubscriptionStatePillClass = (row: {
  subscription?: { effectiveState?: string; status?: string };
}) => {
  if (row.subscription?.effectiveState === "active") {
    return "border-violet-500 bg-violet-500 text-white";
  }
  if (row.subscription?.effectiveState === "grace") {
    return "border-amber-600 bg-amber-500 text-slate-950";
  }
  if (row.subscription?.status === "unpaid") {
    return "border-rose-600 bg-rose-500 text-white";
  }
  return "border-slate-700 bg-slate-600 text-white";
};

export const getSubscriptionPlanPillClass = (plan: unknown): string => {
  const normalized = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (normalized === "unlimited") {
    return "border-amber-600 bg-amber-400 text-amber-950";
  }
  if (normalized === "monthly") {
    return "border-sky-600 bg-sky-500 text-white";
  }
  if (normalized === "semiannual") {
    return "border-indigo-600 bg-indigo-500 text-white";
  }
  if (normalized === "yearly") {
    return "border-cyan-600 bg-cyan-500 text-white";
  }
  return "border-slate-600 bg-slate-500 text-white";
};

export const formatDaysUntilDue = (days: number | null | undefined): string => {
  if (typeof days !== "number" || !Number.isFinite(days)) return "";
  if (days <= 0) return "Končí dnes";
  if (days === 1) return "Končí za 1 den";
  if (days < 5) return `Končí za ${days} dny`;
  return `Končí za ${days} dní`;
};

export const formatMoneyCzk = (value: number): string =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);

export const filterAdminSubscriptionDirectory = (
  rows: AdminSubscriptionDirectoryRow[],
  filter: AdminSubscriptionDirectoryFilter,
  search: string
): AdminSubscriptionDirectoryRow[] => {
  const query = search.trim().toLowerCase();

  return rows.filter((row) => {
    if (filter === "overdue" && row.flags?.isOverdue !== true) return false;
    if (filter === "dueSoon" && row.flags?.isDueSoon !== true) return false;
    if (!query) return true;

    const name = (row.fullName || nameFromEmail(row.email)).toLowerCase();
    const email = row.email.toLowerCase();
    const managerEmail = (row.managerEmail || "").toLowerCase();
    return name.includes(query) || email.includes(query) || managerEmail.includes(query);
  });
};

export const summarizeAdminSubscriptionDirectory = (
  rows: AdminSubscriptionDirectoryRow[]
) => ({
  total: rows.length,
  overdue: rows.filter((row) => row.flags?.isOverdue === true).length,
  dueSoon: rows.filter((row) => row.flags?.isDueSoon === true).length,
  active: rows.filter((row) => row.subscription.effectiveState === "active").length,
});

export type AdminSubscriptionPaymentUpdateBody = {
  action: "updatePayment";
  email: string;
  paymentId: string;
  plan: PaidSubscriptionPlanValue;
  amountCzk: number;
  periodFrom: string;
  periodUntil: string;
  note?: string;
};

export const prepareAdminSubscriptionPaymentUpdate = ({
  email,
  paymentId,
  plan,
  amount,
  periodFrom,
  periodUntil,
  note,
}: {
  email: string;
  paymentId: string;
  plan: PaidSubscriptionPlanValue;
  amount: string;
  periodFrom: string;
  periodUntil: string;
  note: string;
}):
  | { body: null; error: string }
  | { body: AdminSubscriptionPaymentUpdateBody; error: null } => {
  const amountCzk = Number(amount.trim().replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(amountCzk) || amountCzk <= 0) {
    return { body: null, error: "Částka musí být kladné číslo v Kč." };
  }
  if (!periodFrom || !periodUntil) {
    return { body: null, error: "Vyplň začátek i konec období platby." };
  }
  if (periodUntil < periodFrom) {
    return { body: null, error: "Konec období nesmí být před začátkem." };
  }

  return {
    error: null,
    body: {
      action: "updatePayment",
      email,
      paymentId,
      plan,
      amountCzk: Math.round(amountCzk),
      periodFrom,
      periodUntil,
      note: note || undefined,
    },
  };
};
