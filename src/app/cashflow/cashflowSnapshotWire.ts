import type { CommissionMode, PaymentFrequency, Position } from "../types/domain";
import type {
  CashflowItem,
  CashflowPredictionAdjustment,
  CashflowProductKey,
  MonthGroup,
} from "./types";

export const CASHFLOW_SNAPSHOT_WIRE_VERSION = "cashflow-snapshot-wire-v2";
export const CASHFLOW_SNAPSHOT_MAX_ITEMS = 25_000;
export const CASHFLOW_SNAPSHOT_MAX_BYTES = 16 * 1024 * 1024;
const MAX_MONTHS = 2_400;
const MAX_TEXT_LENGTH = 16_384;

type WireValue<T> = T extends Date ? number
  : T extends readonly (infer Item)[] ? WireValue<Item>[]
  : T extends object ? { [Key in keyof T]: WireValue<T[Key]> }
  : T;

export type CashflowSnapshotResult = { items: CashflowItem[]; months: MonthGroup[] };
export type CashflowSnapshotWire = {
  version: typeof CASHFLOW_SNAPSHOT_WIRE_VERSION;
  items: WireValue<CashflowItem>[];
  months: WireValue<MonthGroup>[];
};

type Direction = "encode" | "decode";
type Budget = { textLength: number };
type Field = {
  kind: "text" | "number" | "boolean" | "date" | "strings" | "adjustment";
  optional?: boolean;
  nullable?: boolean;
  values?: readonly string[];
};

const products = {
  conseqzenit: true, neon: true, flexi: true, maximaMaxEfekt: true,
  maxcizinkomplex: true, pillowInjury: true, zamex: true, cppbytex: true,
  domex: true, domexneuron: true, cpphafan: true, pillowmajetek: true,
  koopmajetekobcan: true, koopfit: true, koopodzam: true, kooppmop: true,
  maxdomov: true, cppsimplex: true, cppAuto: true, slaviaauto: true,
  slaviaflotila: true, allianzAuto: true, allianzmujdomov: true,
  csobAuto: true, uniqaAuto: true, uniqaflotila: true, pillowAuto: true,
  kooperativaAuto: true, koopflotila: true, koopcestovko: true,
  cppcestovko: true, axacestovko: true, comfortcc: true, cppPPRs: true,
  cppPPRbez: true, unknown: true, subscription: true,
} satisfies Record<CashflowProductKey, true>;
const positions = {
  poradce1: true, poradce2: true, poradce3: true, poradce4: true,
  poradce5: true, poradce6: true, poradce7: true, poradce8: true,
  poradce9: true, poradce10: true, manazer4: true, manazer5: true,
  manazer6: true, manazer7: true, manazer8: true, manazer9: true, manazer10: true,
} satisfies Record<Position, true>;
const frequencies = {
  monthly: true, quarterly: true, semiannual: true, annual: true,
} satisfies Record<PaymentFrequency, true>;
const modes = { standard: true, accelerated: true } satisfies Record<CommissionMode, true>;
const optionalText = { kind: "text", optional: true, nullable: true } as const;
const optionalNumber = { kind: "number", optional: true, nullable: true } as const;
const optionalDate = { kind: "date", optional: true, nullable: true } as const;
const optionalBoolean = { kind: "boolean", optional: true } as const;
const optionalPosition = { ...optionalText, values: Object.keys(positions) };

// The exhaustive field maps make a newly added model field a compiler error.
// A changed payload must get a reviewed codec instead of silently losing data.
const itemFields = {
  id: { kind: "text" }, date: { kind: "date" }, amount: { kind: "number" },
  productKey: { kind: "text", values: Object.keys(products) },
  note: optionalText,
  frequency: { ...optionalText, values: Object.keys(frequencies) },
  source: { kind: "text", optional: true, values: ["own", "manager"] },
  contractNumber: optionalText, clientName: optionalText, inputAmount: optionalNumber,
  currentMonthlyPremium: optionalNumber, lifeStornoBaseMonthlyPremium: optionalNumber,
  policyStartDate: optionalDate, contractSignedDate: optionalDate,
  lifeRevisionBaseDate: optionalDate, contractStatus: optionalText,
  stornoDate: optionalDate, ownerEmail: { kind: "text", nullable: true },
  entryId: { kind: "text", nullable: true }, entryType: optionalText,
  rootContractEntryId: optionalText, parentContractEntryId: optionalText,
  isManagerOverride: optionalBoolean, predictionPosition: optionalPosition,
  predictionBaselinePosition: optionalPosition,
  predictionCommissionMode: { ...optionalText, values: Object.keys(modes) },
  durationYears: optionalNumber, commissionCode: optionalText,
  commissionCodeAliases: { kind: "strings", optional: true }, commissionLabel: optionalText,
  isTipPayout: optionalBoolean, tipSourceAdviserEmail: optionalText,
  tipSourceAdviserName: optionalText, isSubscriptionPayment: optionalBoolean,
  subscriptionPlan: { ...optionalText, values: ["monthly", "semiannual", "yearly"] },
  subscriptionUserEmail: optionalText, subscriptionUserName: optionalText,
  subscriptionPeriodFrom: optionalText, subscriptionPeriodUntil: optionalText,
  payoutStatus: { kind: "text", optional: true, values: ["predicted", "paid", "shifted"] },
  predictedAmount: optionalNumber, isStatementOnly: optionalBoolean,
  commissionPayoutKey: optionalText, commissionStatementNumber: optionalText,
  commissionPeriodStart: optionalText, matchedPlannedCode: optionalText,
  payoutPlanStatus: { kind: "text", optional: true, values: ["matched", "unmatched", "correction"] },
  commissionStatementPeriod: optionalText, originalDate: optionalDate,
  missedStatementPeriods: { kind: "strings", optional: true },
  predictionAdjustment: { kind: "adjustment", optional: true, nullable: true },
} satisfies Record<keyof CashflowItem, Field>;

const adjustmentFields = {
  kind: { kind: "text", values: ["autoPremiumGrowth", "propertyRevaluation", "lifePremiumReview"] },
  baseAmount: { kind: "number" }, adjustedAmount: { kind: "number" },
  multiplier: { kind: "number" }, steps: { kind: "number" },
  label: { kind: "text" }, reason: { kind: "text" },
  premiumDeltaMonthly: { kind: "number", optional: true },
  calculationMonthlyPremium: { kind: "number", optional: true },
  grossPotentialAmount: { kind: "number", optional: true },
  acceptanceProbability: { kind: "number", optional: true },
  reviewDate: { kind: "text", optional: true }, position: optionalPosition,
} satisfies Record<keyof CashflowPredictionAdjustment, Field>;

const monthFields = {
  key: { kind: "text" }, year: { kind: "number" }, monthIndex: { kind: "number" },
  label: { kind: "text" }, total: { kind: "number" }, predictedTotal: { kind: "number" },
  totalSource: { kind: "text", values: ["predicted", "paid"] },
  statementPayoutTotal: { kind: "number", nullable: true },
} satisfies Record<Exclude<keyof MonthGroup, "items">, Field>;

function invalid(): never { throw new Error("Invalid cashflow snapshot."); }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, budget: Budget): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) return invalid();
  budget.textLength += value.length;
  if (budget.textLength > CASHFLOW_SNAPSHOT_MAX_BYTES) return invalid();
  return value;
}

function field(value: unknown, spec: Field, direction: Direction, budget: Budget): unknown {
  if (value === null && spec.nullable) return null;
  switch (spec.kind) {
    case "text": {
      const result = text(value, budget);
      if (spec.values && !spec.values.includes(result)) return invalid();
      return result;
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : invalid();
    case "boolean": return typeof value === "boolean" ? value : invalid();
    case "date": {
      const ms = direction === "encode" && value instanceof Date ? value.getTime() : value;
      if ((direction === "encode" && !(value instanceof Date)) ||
        typeof ms !== "number" || !Number.isSafeInteger(ms) ||
        !Number.isFinite(new Date(ms).getTime())) return invalid();
      return direction === "encode" ? ms : new Date(ms);
    }
    case "strings":
      if (!Array.isArray(value) || value.length > 1_000) return invalid();
      return Array.from(value, item => text(item, budget));
    case "adjustment": return record(value, adjustmentFields, direction, budget);
  }
}

function record(
  value: unknown,
  fields: Record<string, Field>,
  direction: Direction,
  budget: Budget,
  extraKeys: readonly string[] = [],
): Record<string, unknown> {
  const input = object(value);
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(fields, key) && !extraKeys.includes(key)) return invalid();
  }
  const result: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(fields)) {
    const value = Object.hasOwn(input, key) ? input[key] : undefined;
    if (value === undefined && spec.optional) continue;
    result[key] = field(value, spec, direction, budget);
  }
  return result;
}

function transform(value: unknown, direction: Direction): CashflowSnapshotWire | CashflowSnapshotResult {
  const input = object(value);
  const keys = direction === "encode" ? ["items", "months"] : ["version", "items", "months"];
  if (Object.keys(input).some(key => !keys.includes(key)) ||
    (direction === "decode" && input.version !== CASHFLOW_SNAPSHOT_WIRE_VERSION) ||
    !Array.isArray(input.items) || input.items.length > CASHFLOW_SNAPSHOT_MAX_ITEMS ||
    !Array.isArray(input.months) || input.months.length > MAX_MONTHS) return invalid();
  const budget = { textLength: 0 };
  const items = Array.from(input.items, item => record(item, itemFields, direction, budget));
  let monthItemCount = 0;
  const monthKeys = new Set<string>();
  const months = Array.from(input.months, value => {
    const raw = object(value);
    const month = record(raw, monthFields, direction, budget, ["items"]);
    // Generated groups use M; statement-only groups may retain MM. Preserve
    // the exact existing key instead of changing the view while serializing.
    const keyParts = (month.key as string).match(/^(\d{4})-(\d{1,2})$/);
    if (!Number.isSafeInteger(month.year) || (month.year as number) < 1 || (month.year as number) > 9999 ||
      !Number.isInteger(month.monthIndex) || (month.monthIndex as number) < 0 || (month.monthIndex as number) > 11 ||
      !keyParts || Number(keyParts[1]) !== month.year || Number(keyParts[2]) !== (month.monthIndex as number) + 1 ||
      monthKeys.has(month.key as string) || !Array.isArray(raw.items)) return invalid();
    monthKeys.add(month.key as string);
    monthItemCount += raw.items.length;
    if (monthItemCount > CASHFLOW_SNAPSHOT_MAX_ITEMS) return invalid();
    month.items = Array.from(raw.items, item => record(item, itemFields, direction, budget));
    return month;
  });
  const result = direction === "encode"
    ? { version: CASHFLOW_SNAPSHOT_WIRE_VERSION, items, months }
    : { items, months };
  if (new TextEncoder().encode(JSON.stringify(result)).length > CASHFLOW_SNAPSHOT_MAX_BYTES) return invalid();
  return result as CashflowSnapshotWire | CashflowSnapshotResult;
}

/** Metadata and authorization belong to the enclosing server record, never this codec. */
export function serializeCashflowSnapshot(result: CashflowSnapshotResult): CashflowSnapshotWire {
  return transform(result, "encode") as CashflowSnapshotWire;
}

/** Reject the whole result on corruption or a schema change; never return partial data. */
export function parseCashflowSnapshot(value: unknown): CashflowSnapshotResult | null {
  try { return transform(value, "decode") as CashflowSnapshotResult; }
  catch { return null; }
}
