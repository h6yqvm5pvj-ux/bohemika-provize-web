import { type PaymentFrequency, type Position, type Product } from "../../types/domain";
import {
  allianzAutoSubsequentCoefficient,
} from "./allianzAuto";
import {
  cppAutoSubsequentCoefficient,
} from "./cppAuto";
import {
  csobAutoSubsequentCoefficient,
} from "./csobAuto";
import {
  kooperativaAutoSubsequentCoefficient,
  koopFlotilaSubsequentCoefficient,
} from "./kooperativaAuto";
import {
  pillowAutoSubsequentCoefficient,
} from "./pillowAuto";
import {
  slaviaAutoCoefficient,
  slaviaFlotilaSubsequentCoefficient,
} from "./slaviaAuto";
import {
  uniqaFlotilaSubsequentCoefficient,
  uniqaAutoSubsequentCoefficient,
} from "./uniqaAuto";

export function isAutoInstallmentCommissionCode(code: string): boolean {
  return /^(?:B30|B70|B03|B36|B42)\d*$/.test(code);
}

export function isAutoSubsequentCommissionCode(
  value: string | null | undefined
): boolean {
  const code = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code || isAutoInstallmentCommissionCode(code)) return false;
  return /^BC\d+/.test(code) || /^B\d+/.test(code);
}

export type InstallmentCommissionSchedule = {
  code: string;
  phase: "initial" | "subsequent";
  paymentIndex: number;
  paymentsPerYear: number;
  policyYearNumber: number;
  installmentInPolicyYear: number;
  anniversaryNumber: number | null;
  isAnniversaryPayment: boolean;
};

export function installmentPaymentsPerYear(
  frequency: PaymentFrequency | string | null | undefined
): number {
  switch (String(frequency ?? "").trim().toLowerCase()) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
    default:
      return 1;
  }
}

const installmentSequenceFromCode = (
  code: string,
  prefixes: string[]
): number | null => {
  const normalizedPrefixes = prefixes
    .map((prefix) => prefix.trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const prefix of normalizedPrefixes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (/^\d$/.test(suffix)) return Number(suffix);
    if (/^\d{3}$/.test(suffix)) {
      const sequence = Number(suffix) - 100;
      return sequence >= 1 ? sequence : null;
    }
  }
  return null;
};

export function installmentCommissionScheduleFromCode(
  value: string | null | undefined,
  frequency: PaymentFrequency | string | null | undefined
): InstallmentCommissionSchedule | null {
  const code = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code || code.includes("-") || isAutoInstallmentCommissionCode(code)) return null;

  const paymentsPerYear = installmentPaymentsPerYear(frequency);
  const initialPaymentIndex = installmentSequenceFromCode(code, ["AC", "A"]);
  if (initialPaymentIndex != null) {
    const zeroBased = initialPaymentIndex - 1;
    return {
      code,
      phase: "initial",
      paymentIndex: initialPaymentIndex,
      paymentsPerYear,
      policyYearNumber: 1,
      installmentInPolicyYear: (zeroBased % paymentsPerYear) + 1,
      anniversaryNumber: null,
      isAnniversaryPayment: initialPaymentIndex === 1,
    };
  }

  const subsequentPaymentIndex = installmentSequenceFromCode(code, ["BC", "B"]);
  if (subsequentPaymentIndex == null) return null;

  const zeroBased = subsequentPaymentIndex - 1;
  const anniversaryNumber = Math.floor(zeroBased / paymentsPerYear) + 1;
  const installmentInPolicyYear = (zeroBased % paymentsPerYear) + 1;

  return {
    code,
    phase: "subsequent",
    paymentIndex: subsequentPaymentIndex,
    paymentsPerYear,
    policyYearNumber: anniversaryNumber + 1,
    installmentInPolicyYear,
    anniversaryNumber,
    isAnniversaryPayment: installmentInPolicyYear === 1,
  };
}

export function anniversaryNumberFromInstallmentCommissionCode(
  value: string | null | undefined,
  frequency: PaymentFrequency | string | null | undefined
): number | null {
  const schedule = installmentCommissionScheduleFromCode(value, frequency);
  if (!schedule || schedule.phase !== "subsequent" || !schedule.isAnniversaryPayment) {
    return null;
  }
  return schedule.anniversaryNumber;
}

export function addUtcYearsClamped(dayMs: number, years: number): number | null {
  if (!Number.isFinite(dayMs) || !Number.isInteger(years) || years < 0) return null;
  const date = new Date(dayMs);
  if (Number.isNaN(date.getTime())) return null;

  const targetYear = date.getUTCFullYear() + years;
  const targetMonth = date.getUTCMonth();
  const targetDay = date.getUTCDate();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(targetYear, targetMonth, Math.min(targetDay, lastDay));
}

export function autoSubsequentCoefficientForProduct(
  product: Product | null | undefined,
  position: Position,
  contractSignedDateIso?: string | null
): number | null {
  switch (product) {
    case "cppAuto":
      return cppAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "allianzAuto":
      return allianzAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "csobAuto":
      return csobAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "uniqaAuto":
      return uniqaAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "uniqaflotila":
      return uniqaFlotilaSubsequentCoefficient(position, contractSignedDateIso);
    case "pillowAuto":
      return pillowAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "slaviaauto":
      return slaviaAutoCoefficient(position);
    case "slaviaflotila":
      return slaviaFlotilaSubsequentCoefficient(position);
    case "kooperativaAuto":
      return kooperativaAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "koopflotila":
      return koopFlotilaSubsequentCoefficient(position);
    default:
      return null;
  }
}
