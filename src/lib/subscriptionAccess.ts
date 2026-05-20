const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SubscriptionStatusValue = "active" | "expired" | "unpaid" | "none";
export type SubscriptionPlan = "monthly" | "semiannual" | "yearly" | "unlimited";
export type SubscriptionEffectiveState = "active" | "grace" | "blocked";

export type EvaluatedSubscriptionAccess = {
  status: SubscriptionStatusValue;
  plan: SubscriptionPlan | null;
  paidFrom: string | null;
  paidUntil: string | null;
  graceUntil: string | null;
  state: SubscriptionEffectiveState;
  reason:
    | "active"
    | "grace"
    | "unpaid"
    | "expired"
    | "none"
    | "legacy-active-without-period";
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeSubscriptionStatus = (value: unknown): SubscriptionStatusValue => {
  const normalized = normalizeText(value);
  if (!normalized) return "none";
  if (normalized === "active") return "active";
  if (normalized === "expired") return "expired";
  if (normalized === "unpaid" || normalized === "nezaplaceno") return "unpaid";
  return "none";
};

export const normalizeSubscriptionPlan = (value: unknown): SubscriptionPlan | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized === "monthly") return "monthly";
  if (normalized === "semiannual" || normalized === "halfyear" || normalized === "pololetni") {
    return "semiannual";
  }
  if (normalized === "yearly" || normalized === "annual" || normalized === "rocni") {
    return "yearly";
  }
  if (normalized === "unlimited" || normalized === "forever" || normalized === "neomezeny" || normalized === "neomezený") {
    return "unlimited";
  }
  return null;
};

export const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
};

export const normalizeIsoDay = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isIsoDay(trimmed) ? trimmed : null;
};

const toUtcDayIndex = (isoDay: string): number => {
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  return Math.floor(date.getTime() / MS_PER_DAY);
};

export const addDaysIso = (isoDay: string, days: number): string => {
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const getTodayIsoInPrague = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((item) => item.type === "year")?.value ?? "1970";
  const month = parts.find((item) => item.type === "month")?.value ?? "01";
  const day = parts.find((item) => item.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
};

export const evaluateSubscriptionAccess = ({
  subscriptionStatus,
  subscriptionPaidFrom,
  subscriptionPaidUntil,
  subscriptionPlan,
  now,
}: {
  subscriptionStatus: unknown;
  subscriptionPaidFrom: unknown;
  subscriptionPaidUntil: unknown;
  subscriptionPlan?: unknown;
  now?: Date;
}): EvaluatedSubscriptionAccess => {
  const status = normalizeSubscriptionStatus(subscriptionStatus);
  const paidFrom = normalizeIsoDay(subscriptionPaidFrom);
  const paidUntil = normalizeIsoDay(subscriptionPaidUntil);
  const plan = normalizeSubscriptionPlan(subscriptionPlan);
  const todayIso = getTodayIsoInPrague(now);

  if (status === "unpaid") {
    return {
      status,
      plan,
      paidFrom,
      paidUntil,
      graceUntil: paidUntil ? addDaysIso(paidUntil, 3) : null,
      state: "blocked",
      reason: "unpaid",
    };
  }

  if (plan === "unlimited") {
    return {
      status: status === "none" ? "active" : status,
      plan,
      paidFrom,
      paidUntil: null,
      graceUntil: null,
      state: "active",
      reason: "active",
    };
  }

  if (paidUntil) {
    const graceUntil = addDaysIso(paidUntil, 3);
    const todayDay = toUtcDayIndex(todayIso);
    const paidUntilDay = toUtcDayIndex(paidUntil);
    const graceUntilDay = toUtcDayIndex(graceUntil);

    if (todayDay <= paidUntilDay) {
      return {
        status,
        plan,
        paidFrom,
        paidUntil,
        graceUntil,
        state: "active",
        reason: "active",
      };
    }

    if (todayDay <= graceUntilDay) {
      return {
        status,
        plan,
        paidFrom,
        paidUntil,
        graceUntil,
        state: "grace",
        reason: "grace",
      };
    }

    return {
      status,
      plan,
      paidFrom,
      paidUntil,
      graceUntil,
      state: "blocked",
      reason: "expired",
    };
  }

  if (status === "active") {
    return {
      status,
      plan,
      paidFrom,
      paidUntil,
      graceUntil: null,
      state: "active",
      reason: "legacy-active-without-period",
    };
  }

  if (status === "expired") {
    return {
      status,
      plan,
      paidFrom,
      paidUntil,
      graceUntil: null,
      state: "blocked",
      reason: "expired",
    };
  }

  return {
    status,
    plan,
    paidFrom,
    paidUntil,
    graceUntil: null,
    state: "blocked",
    reason: "none",
  };
};

export const evaluateSubscriptionFromProfile = (
  profile: Record<string, unknown> | null | undefined,
  now?: Date
): EvaluatedSubscriptionAccess => {
  const source = profile ?? {};
  return evaluateSubscriptionAccess({
    subscriptionStatus: source.subscriptionStatus ?? source.subscriptionstatus,
    subscriptionPlan: source.subscriptionPlan ?? source.subscriptionplan,
    subscriptionPaidFrom: source.subscriptionPaidFrom ?? source.subscriptionpaidfrom,
    subscriptionPaidUntil: source.subscriptionPaidUntil ?? source.subscriptionpaiduntil,
    now,
  });
};
