"use client";

import {
  createContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import Image from "next/image";

import { PRODUCT_CATALOG } from "@/app/lib/productCatalog";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import type { PaymentFrequency, Product } from "@/app/types/domain";
import { allowedFrequencies as calculatorAllowedFrequencies } from "../kalkulacka/calculatorHelpers";
import {
  normalizeProductCode,
  normalizeText,
  parseLocalDate,
  toDateInputValue,
} from "./statementParsing";
import type {
  BohemkaContractDetailModalPayload,
  StatementProductMeta,
} from "./statementTypes";

export const BohemkaContractDetailModalContext =
  createContext<Dispatch<SetStateAction<BohemkaContractDetailModalPayload | null>> | null>(
    null
  );

export type StatementCalculatorPrefill = {
  product: Product;
  productLabel: string;
  sourceProductCode: string;
  contractNumber: string;
  clientName: string;
  contractSignedDate: string;
  policyStartDate: string;
  amountText: string;
  frequency: PaymentFrequency;
  statementId: string | null;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  statementChronologyMs: number | null;
  cppAutoQueueEligible?: boolean;
};

export type StatementCalculatorPrefillSource = {
  statementId?: string | null;
  statementNumber?: string | null;
  statementPeriod?: string | null;
  statementDate?: string | null;
  statementChronologyMs?: number | null;
};

export const StatementCalculatorPrefillContext =
  createContext<Dispatch<SetStateAction<StatementCalculatorPrefill | null>> | null>(null);

const statementDateToIsoDay = (value: string | null | undefined): string => {
  const date = parseLocalDate(value);
  return date ? toDateInputValue(date) : "";
};

const statementClientNameForCalculator = (value: string | null | undefined): string => {
  const name = normalizeText(value);
  if (!name) return "";
  if (
    /\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.|firma|obec|město|mesto|úřad|urad)\b/i.test(
      name
    )
  ) {
    return name;
  }

  const commaParts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length === 2) return `${commaParts[1]} ${commaParts[0]}`;

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return name;
  const [surname, ...givenNames] = parts;
  return [...givenNames, surname].join(" ");
};

const statementCalculatorAmountText = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
};

const statementCalculatorAmountAndFrequency = (
  product: StatementProductMeta,
  statementBase: number
): { amountText: string; frequency: PaymentFrequency } | null => {
  if (!product.productKey) return null;
  const allowedFrequencies = calculatorAllowedFrequencies(product.productKey);
  const frequency =
    product.usesAnnualPremiumBase && allowedFrequencies.includes("monthly")
      ? "monthly"
      : allowedFrequencies[0];
  if (!frequency) return null;

  const amount = product.usesAnnualPremiumBase
    ? statementBase / periodsPerYear(frequency)
    : statementBase;

  return {
    amountText: statementCalculatorAmountText(amount),
    frequency,
  };
};

export const statementCalculatorPrefill = ({
  product,
  contractNumber,
  clientName,
  signedAt,
  validFrom,
  statementBase,
  source,
}: {
  product: StatementProductMeta;
  contractNumber: string | null | undefined;
  clientName: string | null | undefined;
  signedAt: string | null | undefined;
  validFrom: string | null | undefined;
  statementBase: number;
  source?: StatementCalculatorPrefillSource;
}): StatementCalculatorPrefill | null => {
  if (!product.productKey || !PRODUCT_CATALOG[product.productKey]) return null;
  const amountAndFrequency = statementCalculatorAmountAndFrequency(product, statementBase);
  if (!amountAndFrequency) return null;
  const statementChronologyMs =
    typeof source?.statementChronologyMs === "number" &&
    Number.isFinite(source.statementChronologyMs)
      ? Math.round(source.statementChronologyMs)
      : null;

  return {
    product: product.productKey,
    productLabel: PRODUCT_CATALOG[product.productKey].label,
    sourceProductCode: product.rawCode,
    contractNumber: normalizeText(contractNumber),
    clientName: statementClientNameForCalculator(clientName),
    contractSignedDate: statementDateToIsoDay(signedAt),
    policyStartDate: statementDateToIsoDay(validFrom),
    amountText: amountAndFrequency.amountText,
    frequency: amountAndFrequency.frequency,
    statementId: normalizeText(source?.statementId),
    statementNumber: normalizeText(source?.statementNumber),
    statementPeriod: normalizeText(source?.statementPeriod),
    statementDate: normalizeText(source?.statementDate),
    statementChronologyMs,
  };
};

type StatementProductLogoMeta = {
  src: string;
  alt: string;
};

const statementProductLogoMeta = (product: StatementProductMeta): StatementProductLogoMeta => {
  const catalogMeta = product.productKey ? PRODUCT_CATALOG[product.productKey] : null;
  if (catalogMeta?.institutionLogo) {
    return {
      src: catalogMeta.institutionLogo,
      alt: catalogMeta.institutionLabel,
    };
  }

  const rawCode = normalizeProductCode(product.rawCode);
  if (rawCode.startsWith("TU_")) return { src: "/icons/gold.png", alt: "Troyská unce" };
  if (rawCode.startsWith("CON_")) return { src: "/icons/conseq.png", alt: "Conseq" };
  if (rawCode === "INVESTIKA" || rawCode === "EFEKTIKA" || rawCode === "MONETIKA") {
    return { src: "/icons/invstk.png", alt: product.label };
  }
  if (rawCode.startsWith("CPP")) return { src: "/icons/cpp.png", alt: "ČPP" };
  if (rawCode.startsWith("KOO")) return { src: "/icons/koop-v2.png", alt: "Kooperativa" };
  if (rawCode.startsWith("UNIQA")) return { src: "/icons/uniqa.png", alt: "UNIQA" };
  if (rawCode.startsWith("CSOB") || rawCode.startsWith("ČSOB")) {
    return { src: "/icons/csob.png", alt: "ČSOB" };
  }
  if (rawCode.startsWith("ALL")) return { src: "/icons/allianz.png", alt: "Allianz" };
  if (rawCode.startsWith("PIL")) return { src: "/icons/pillow.png", alt: "Pillow" };
  if (rawCode.startsWith("SLA")) return { src: "/icons/slavialogo.png", alt: "SLAVIA" };
  if (rawCode.includes("COMFORT") || rawCode === "CC") {
    return { src: "/icons/cclogo.png", alt: "Comfort Commodity" };
  }

  switch (product.category) {
    case "life":
      return { src: "/icons/zivot.webp", alt: "Životní pojištění" };
    case "auto":
      return { src: "/icons/icon_auto.webp", alt: "Auto" };
    case "property":
      return { src: "/icons/icon_domex.webp", alt: "Majetek" };
    case "travel":
      return { src: "/icons/icon_cestovko.webp", alt: "Cestovní pojištění" };
    case "foreigners":
      return { src: "/icons/maxima.png", alt: "Cizinci" };
    default:
      return { src: "/icons/produkt.png", alt: product.label };
  }
};

export function StatementProductLogo({
  product,
  size = "sm",
}: {
  product: StatementProductMeta;
  size?: "xs" | "sm";
}) {
  const logo = statementProductLogoMeta(product);
  const boxClass = size === "xs" ? "h-5 w-5" : "h-6 w-6";
  const imageClass = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      className={`inline-flex ${boxClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white`}
      title={logo.alt}
    >
      <Image
        src={logo.src}
        alt=""
        width={24}
        height={24}
        className={`${imageClass} object-contain`}
      />
    </span>
  );
}
