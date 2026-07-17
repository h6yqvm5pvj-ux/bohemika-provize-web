"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileUp,
  Loader2,
  ReceiptText,
  RotateCcw,
  UploadCloud,
} from "lucide-react";

import { PRODUCT_CATALOG, type ProductPrimaryCategory } from "@/app/lib/productCatalog";
import { type CommissionResultItemDTO, type Product } from "@/app/types/domain";
import { auth } from "@/app/firebase";
import { AppLayout } from "@/components/AppLayout";

type StatementHeader = {
  advisorNumber: string | null;
  period: string | null;
  statementNumber: string | null;
  statementDate: string | null;
};

type LifeSplitCommissionKind =
  | "a101"
  | "b0301"
  | "b3601"
  | "b4801"
  | "subsequent"
  | "care"
  | "tip"
  | "unknown";

type GeneralCommissionKind =
  | "closing"
  | "tip"
  | "subsequent"
  | "installment"
  | "unexpected"
  | "increase"
  | "office"
  | "penalty"
  | "compensation"
  | "gradual"
  | "troyOunce"
  | "unknown";

type StatementProductCategory = ProductPrimaryCategory | "investment" | "unknown";

type StatementProductMeta = {
  rawCode: string;
  label: string;
  productKey: Product | null;
  category: StatementProductCategory;
  usesAnnualPremiumBase: boolean;
  note?: string;
};

type CommissionRow = {
  id: string;
  contractNumber: string;
  signedAt: string;
  validFrom: string;
  client: string;
  role: string;
  product: string;
  type: string;
  base: number;
  percent: string;
  career: string;
  commission: number;
  reserveFund: number;
  lifeSplitKind: LifeSplitCommissionKind;
  lifeSplitLabel: string;
};

type OtherPayment = {
  description: string;
  contractNumber: string | null;
  amount: number;
  isB36Half: boolean;
  isStorno: boolean;
};

type ContractStatusCategory =
  | "active"
  | "pending"
  | "matured"
  | "transferred"
  | "storno"
  | "invalid"
  | "unknown";

type ContractStatusRule = {
  code: string;
  label: string;
  category: ContractStatusCategory;
  importDecision: string;
};

type LifeSplitContractPreview = {
  productCode: string;
  productLabel: string;
  contractNumber: string;
  client: string;
  signedAt: string;
  validFrom: string;
  annualPremium: number;
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
};

type OtherProductContractPreview = {
  key: string;
  contractNumber: string;
  client: string;
  signedAt: string;
  validFrom: string;
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
};

type ManagerCommissionRow = {
  id: string;
  contractNumber: string;
  signedAt: string;
  client: string;
  role: string;
  product: string;
  type: string;
  base: number;
  percent: string;
  career: string;
  commission: number;
  reserveFund: number;
  isStorno: boolean;
};

type ManagerCommissionAdvisor = {
  advisorNumber: string;
  advisorName: string;
  position: string;
  contractCount: number;
  commission: number;
  stornos: number;
  deductions: number;
  reserveFund: number;
  rows: ManagerCommissionRow[];
};

type ParsedStatement = {
  fileName: string;
  header: StatementHeader;
  commissionRows: CommissionRow[];
  otherPayments: OtherPayment[];
  contractStatusRules: ContractStatusRule[];
  managerCommissions: ManagerCommissionAdvisor[];
  lifeSplitContracts: LifeSplitContractPreview[];
  otherProductContracts: OtherProductContractPreview[];
  unmatchedB36Payments: OtherPayment[];
  parseWarnings: string[];
};

type MatchedSystemContract = {
  id: string;
  adviserEmail: string | null;
  adviserName?: string | null;
  productKey?: Product | null;
  clientName?: string | null;
  contractNumber?: string | null;
  inputAmount?: number | null;
  frequencyRaw?: string | null;
  items?: CommissionResultItemDTO[] | null;
  contractSignedDate?: number | string | null;
  policyStartDate?: number | string | null;
  status?: string | null;
  paid?: boolean | null;
};

type ContractMatchState =
  | { status: "idle"; contracts: MatchedSystemContract[] }
  | { status: "loading"; contracts: MatchedSystemContract[] }
  | { status: "matched"; contracts: MatchedSystemContract[] }
  | { status: "not_found"; contracts: MatchedSystemContract[] }
  | { status: "error"; contracts: MatchedSystemContract[]; error: string };

type ContractMatchScope = "my" | "team";

type ContractMatchRequest = {
  contractNumber: string;
  scope: ContractMatchScope;
};

type ContractMatchesByNumber = Record<string, ContractMatchState>;

type ContractMatchStats = {
  total: number;
  matched: number;
  loading: number;
  notFound: number;
  errors: number;
  pending: number;
  completed: number;
  progress: number;
};

type CommissionAmountComparisonStatus =
  | "ok"
  | "diff"
  | "missing_statement"
  | "missing_expected";

type CommissionAmountComparison = {
  key: string;
  label: string;
  statementAmount: number;
  expectedAmount: number;
  difference: number;
  status: CommissionAmountComparisonStatus;
};

type MissingAcceleratedB36Warning = {
  contractNumber: string;
  client: string;
  productLabels: string;
};

const LIFE_SPLIT_PRODUCT_CODES = new Set(["CPP_N_LIFE", "CPP_N_RISK", "KOOP_FLEXI"]);

type KnownStatementProduct = {
  product?: Product;
  label?: string;
  category?: StatementProductCategory;
  usesAnnualPremiumBase?: boolean;
  note?: string;
};

const KNOWN_STATEMENT_PRODUCTS: Record<string, KnownStatementProduct> = {
  CPP_N_LIFE: {
    product: "neon",
    usesAnnualPremiumBase: true,
  },
  KOOP_FLEXI: {
    product: "flexi",
    usesAnnualPremiumBase: true,
    note: "Životní pojištění. Pokud výpis uvádí základnu, bereme ji jako roční pojistné. V testovaném lednu ale KOOP_FLEXI posílá základnu 0, takže měsíční pojistné doplníme až ze spárované smlouvy.",
  },
  CPP_N_RISK: {
    product: "neon",
    label: "ČPP ŽP NEON RISK",
    usesAnnualPremiumBase: true,
  },
  CPP_DOMX: {
    product: "domex",
  },
  "CPP_DOMX+2": {
    product: "domex",
  },
  CPP_SIMPLE: {
    product: "cppsimplex",
  },
  CPP_HAFAN: {
    product: "cpphafan",
  },
  CPP_ACPIII: {
    product: "cppAuto",
  },
  CPP_ACPIV: {
    product: "cppAuto",
  },
  CPP_ACPIVZ: {
    product: "cppAuto",
  },
  ALLMOJEAUT: {
    product: "allianzAuto",
  },
  "ČSOBP_AU_Z": {
    product: "csobAuto",
  },
  CSOBP_AU_Z: {
    product: "csobAuto",
  },
  UNIQA_AUTO: {
    product: "uniqaAuto",
  },
  PIL_AUTOZ: {
    product: "pillowAuto",
  },
  SLA_AUTOZ: {
    product: "slaviaauto",
  },
  KOO_NAMIRU: {
    product: "kooperativaAuto",
  },
  KOO_OBCAN: {
    product: "koopmajetekobcan",
  },
  KOO_OD_ZAM: {
    product: "koopodzam",
    label: "Kooperativa odpovědnost zaměstnance",
    category: "property",
  },
  MAX_CIZIN: {
    product: "maxcizinkomplex",
  },
  INVESTIKA: {
    label: "Investika",
    category: "investment",
  },
  EFEKTIKA: {
    label: "Efektika",
    category: "investment",
  },
  CON_INV2_C: {
    label: "Conseq investice",
    category: "investment",
  },
  TU_ZLATO: {
    label: "Troyská unce - zlato",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  },
  TU_ESHOPJN: {
    label: "Troyská unce - nákup",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  },
};

const normalizeText = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeProductCode = (value: string | null | undefined): string =>
  normalizeText(value).toUpperCase();

const normalizeContractNumberForMatch = (value: string | null | undefined): string =>
  normalizeText(value).replace(/\s+/g, "").toUpperCase();

const isLifeSplitProductCode = (product: string | null | undefined): boolean =>
  LIFE_SPLIT_PRODUCT_CODES.has(normalizeProductCode(product));

const b36HalfLabelForProduct = (product: string): string =>
  normalizeProductCode(product) === "KOOP_FLEXI" ? "50% z B36" : "50% z B3601";

const b36DeferredCodeForProduct = (product: string): string =>
  normalizeProductCode(product) === "KOOP_FLEXI" ? "B36" : "B3601";

const COMMISSION_AMOUNT_TOLERANCE = 1;

const normalizeCommissionTitle = (value: string | null | undefined): string =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}%]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const inferStatementProductCategory = (rawCode: string): StatementProductCategory => {
  if (/^(?:TU_|INVESTIKA|EFEKTIKA|CON_)/.test(rawCode)) return "investment";
  if (/FLEXI|N_LIFE|N_RISK/.test(rawCode)) return "life";
  if (/AUTO|AU_|ACP|PIL_AUTO|MOJEAUT|AUTOZ|NAMIRU/.test(rawCode)) return "auto";
  if (/DOM|SIMPLE|HAFAN|OBCAN|OD_ZAM/.test(rawCode)) return "property";
  if (/CEST|CIZIN/.test(rawCode)) return "travel";
  if (/COMFORT|CC/.test(rawCode)) return "comfort";
  return "unknown";
};

const statementProductCategoryLabel = (category: StatementProductCategory): string => {
  switch (category) {
    case "life":
      return "Životní";
    case "auto":
      return "Auto";
    case "property":
      return "Majetek / odpovědnost";
    case "travel":
      return "Cestovní";
    case "comfort":
      return "Comfort";
    case "investment":
      return "Investice";
    default:
      return "Nezařazeno";
  }
};

const resolveStatementProduct = (product: string): StatementProductMeta => {
  const rawCode = normalizeProductCode(product) || "NEZNAMY_PRODUKT";
  const known = KNOWN_STATEMENT_PRODUCTS[rawCode];
  const catalogMeta = known?.product ? PRODUCT_CATALOG[known.product] : null;
  const category = known?.category ?? catalogMeta?.category ?? inferStatementProductCategory(rawCode);

  return {
    rawCode,
    label: known?.label ?? catalogMeta?.label ?? rawCode,
    productKey: known?.product ?? null,
    category,
    usesAnnualPremiumBase: known?.usesAnnualPremiumBase ?? category === "life",
    note: known?.note,
  };
};

const parseMoney = (value: string | null | undefined): number => {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatWholeMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const formatSystemDate = (value: number | string | null | undefined): string => {
  if (value == null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const productLabelFromKey = (productKey: Product | null | undefined): string =>
  productKey ? PRODUCT_CATALOG[productKey]?.label ?? productKey : "—";

const classifyLifeSplitCommissionCode = (
  code: string
): { kind: LifeSplitCommissionKind; label: string } => {
  const cleanCode = code.trim().toUpperCase();

  if (cleanCode === "A101") return { kind: "a101", label: "Provize A101" };
  if (cleanCode === "B0301") return { kind: "b0301", label: "Provize B0301" };
  if (cleanCode === "B3601" || cleanCode === "B36") {
    return { kind: "b3601", label: `Provize ${cleanCode}` };
  }
  if (cleanCode === "B4801" || cleanCode === "B48") {
    return { kind: "b4801", label: `Provize ${cleanCode}` };
  }
  if (/^B10[1-4]$/.test(cleanCode)) {
    return { kind: "subsequent", label: `Následná provize ${cleanCode}` };
  }
  if (/^B20[1-5]$/.test(cleanCode)) {
    return { kind: "care", label: `Pečovatelská provize ${cleanCode}` };
  }
  if (cleanCode === "ATP101") return { kind: "tip", label: "Provize z TIPU" };
  return { kind: "unknown", label: `Nezařazený kód ${cleanCode || "-"}` };
};

const classifyGeneralCommissionCode = (
  product: string,
  code: string
): { kind: GeneralCommissionKind; label: string } => {
  const cleanCode = code.trim().toUpperCase();
  const cleanProduct = product.trim().toUpperCase();

  if (!cleanCode) return { kind: "unknown", label: "Nezařazený kód" };
  if (cleanCode === "ATP101") return { kind: "tip", label: "Provize z TIPU" };
  if (cleanProduct.startsWith("TU_")) {
    return {
      kind: "troyOunce",
      label: "Troyská unce - význam kódu závisí na variantě produktu",
    };
  }
  if (cleanCode === "KOMP") return { kind: "compensation", label: "Kompenzační provize" };
  if (cleanCode === "PK") return { kind: "office", label: "Prémie na kancelář" };
  if (cleanCode === "POK") return { kind: "penalty", label: "Pokuta" };
  if (/^PVYP[12]$/.test(cleanCode)) {
    return { kind: "gradual", label: "Provize s postupným vyplácením" };
  }
  if (/^NV(?:PZ?|Z)?[1-3]\d*$/.test(cleanCode)) {
    return { kind: "increase", label: "Provize za navýšení smlouvy" };
  }
  if (/^(?:APZ|AP|AZ)\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření - rozdělená role sjednatele" };
  }
  if (/^AC\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření - auta" };
  }
  if (/^A\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření smlouvy" };
  }
  if (/^(?:CPZ|CP|CZ)\d+/.test(cleanCode)) {
    return { kind: "unexpected", label: "Neočekávaná provize - rozdělená role sjednatele" };
  }
  if (/^C\d+/.test(cleanCode)) {
    return { kind: "unexpected", label: "Neočekávaná provize" };
  }
  if (/^BC\d+/.test(cleanCode)) {
    return { kind: "subsequent", label: "Následná provize - auta" };
  }
  if (/^(?:B30|B70|B03|B36|B42)\d*$/.test(cleanCode)) {
    return { kind: "installment", label: "Splátka provize" };
  }
  if (/^B\d+/.test(cleanCode)) {
    return { kind: "subsequent", label: "Následná provize" };
  }

  return { kind: "unknown", label: `Nezařazený kód ${cleanCode}` };
};

const classifyContractStatusCode = (
  code: string
): Pick<ContractStatusRule, "category" | "importDecision"> => {
  if (code === "A001") {
    return {
      category: "active",
      importDecision: "Lze párovat jako běžnou aktivní smlouvu.",
    };
  }
  if (code.startsWith("C") || code.startsWith("N")) {
    return {
      category: "pending",
      importDecision: "Nová nebo čekající smlouva. Před automatickým uložením ověřit stav.",
    };
  }
  if (code === "H001") {
    return {
      category: "matured",
      importDecision: "Dožitá smlouva. Nepárovat jako novou sjednávací provizi.",
    };
  }
  if (code === "Q001") {
    return {
      category: "transferred",
      importDecision: "Převedená smlouva. Vyžaduje kontrolu vlastníka a původu provize.",
    };
  }
  if (code.startsWith("S")) {
    return {
      category: "storno",
      importDecision: "Storno. Ukládat jako storno/korekci, ne jako běžné vyplacení.",
    };
  }
  if (code.startsWith("X")) {
    return {
      category: "invalid",
      importDecision: "Chybná nebo nerealizovaná smlouva. Blokovat automatické uložení.",
    };
  }
  return {
    category: "unknown",
    importDecision: "Neznámý stav. Ruční kontrola.",
  };
};

const extractHeader = (html: string, doc: Document): StatementHeader => {
  const plainText = normalizeText(doc.body.textContent);

  return {
    advisorNumber: plainText.match(/Číslo poradce:\s*([0-9]+)/i)?.[1] ?? null,
    period:
      plainText.match(
        /Období:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4}\s*-\s*[0-9]{2}\.[0-9]{2}\.[0-9]{4})/i
      )?.[1] ?? null,
    statementNumber: plainText.match(/Číslo výpisu:\s*([0-9]+)/i)?.[1] ?? null,
    statementDate: html.match(/ze dne\s+([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i)?.[1] ?? null,
  };
};

const rowCells = (row: HTMLTableRowElement): string[] =>
  Array.from(row.cells).map((cell) => normalizeText(cell.textContent));

const parseContractStatusRules = (doc: Document): ContractStatusRule[] => {
  const section = doc.getElementById("kody_stavu_smluv");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => /^[A-Z][A-Z0-9]{3,5}$/.test((cells[0] ?? "").trim()))
    .map((cells) => {
      const code = (cells[0] ?? "").trim();
      return {
        code,
        label: cells[1] ?? "",
        ...classifyContractStatusCode(code),
      };
    });
};

const parseCommissionRows = (doc: Document): CommissionRow[] => {
  const section = doc.getElementById("provize");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 14)
    .map((cells) => {
      const type = (cells[7] ?? "").trim().toUpperCase();
      const lifeSplitClassification = classifyLifeSplitCommissionCode(type);

      return {
        id: cells[0] ?? "",
        contractNumber: cells[1] ?? "",
        signedAt: cells[2] ?? "",
        validFrom: cells[3] ?? "",
        client: cells[4] ?? "",
        role: cells[5] ?? "",
        product: (cells[6] ?? "").trim(),
        type,
        base: parseMoney(cells[8]),
        percent: cells[10] ?? "",
        career: cells[11] ?? "",
        commission: parseMoney(cells[12]),
        reserveFund: parseMoney(cells[13]),
        lifeSplitKind: lifeSplitClassification.kind,
        lifeSplitLabel: lifeSplitClassification.label,
      };
    });
};

const parseOtherPayments = (doc: Document): OtherPayment[] => {
  const section = doc.getElementById("ostatni_platby");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => {
      const description = cells[0] ?? "";
      return (
        cells.length >= 2 &&
        !/^Popis$/i.test(description) &&
        !/^Počet položek:/i.test(description)
      );
    })
    .map((cells) => {
      const description = cells[0] ?? "";
      return {
        description,
        contractNumber: description.match(/smlouvy\s+(\d+)/i)?.[1] ?? null,
        amount: parseMoney(cells[1]),
        isB36Half: /50\s*%\s*provize\s*B36/i.test(description),
        isStorno: /^Storno/i.test(description),
      };
    });
};

const parseManagerCommissionRows = (
  table: HTMLTableElement,
  isStorno: boolean
): ManagerCommissionRow[] =>
  Array.from(table.tBodies[0]?.rows ?? [])
    .map(rowCells)
    .filter((cells) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 13)
    .map((cells) => ({
      id: cells[0] ?? "",
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[7]),
      percent: cells[9] ?? "",
      career: cells[10] ?? "",
      commission: parseMoney(cells[11]),
      reserveFund: parseMoney(cells[12]),
      isStorno,
    }))
    .filter((row) => row.contractNumber.length > 0);

const parseManagerCommissions = (doc: Document): ManagerCommissionAdvisor[] => {
  const section = doc.getElementById("manazer");
  const table = section?.querySelector("table");
  const tbody = table?.tBodies[0];
  if (!tbody) return [];

  const directRows = Array.from(tbody.rows);
  const advisors: ManagerCommissionAdvisor[] = [];

  for (const row of directRows) {
    if (row.classList.contains("toggle")) continue;
    const cells = rowCells(row);
    const advisorNumber = cells[0]?.match(/\d{6,}/)?.[0] ?? "";
    if (!advisorNumber || cells.length < 8) continue;

    const detailId = row.querySelector("a")?.getAttribute("href")?.match(/manazer\d+/)?.[0] ?? "";
    const detailRow = detailId
      ? (doc.getElementById(detailId) as HTMLTableRowElement | null)
      : null;
    const detailCell = detailRow?.cells[0];
    const rows: ManagerCommissionRow[] = [];
    let detailTableIsStorno = false;

    for (const child of Array.from(detailCell?.children ?? [])) {
      if (child.tagName === "B") {
        detailTableIsStorno = normalizeText(child.textContent).toUpperCase().includes("STORNA");
      }

      if (child.tagName === "TABLE") {
        rows.push(...parseManagerCommissionRows(child as HTMLTableElement, detailTableIsStorno));
      }
    }

    advisors.push({
      advisorNumber,
      advisorName: cells[1] ?? "",
      position: cells[2] ?? "",
      contractCount: Number.parseInt((cells[3] ?? "0").replace(/\D/g, ""), 10) || 0,
      commission: parseMoney(cells[4]),
      stornos: parseMoney(cells[5]),
      deductions: parseMoney(cells[6]),
      reserveFund: parseMoney(cells[7]),
      rows,
    });
  }

  return advisors;
};

const buildLifeSplitContracts = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): LifeSplitContractPreview[] => {
  const grouped = new Map<string, LifeSplitContractPreview>();
  const splitRows = commissionRows.filter((row) => isLifeSplitProductCode(row.product));

  for (const row of splitRows) {
    const product = resolveStatementProduct(row.product);
    const key = `${product.rawCode}:${row.contractNumber || row.id}`;
    const existing =
      grouped.get(key) ??
      ({
        productCode: product.rawCode,
        productLabel: product.label,
        contractNumber: row.contractNumber,
        client: row.client,
        signedAt: row.signedAt,
        validFrom: row.validFrom,
        annualPremium: row.base,
        rows: [],
        b36Payments: [],
      } satisfies LifeSplitContractPreview);

    existing.rows.push(row);
    if (!existing.annualPremium && row.base) existing.annualPremium = row.base;
    grouped.set(key, existing);
  }

  const keysByContractNumber = [...grouped.entries()].reduce<Record<string, string[]>>(
    (groups, [key, contract]) => {
      if (!contract.contractNumber) return groups;
      groups[contract.contractNumber] = [...(groups[contract.contractNumber] ?? []), key];
      return groups;
    },
    {}
  );

  for (const payment of otherPayments) {
    if (!payment.isB36Half) continue;
    const contractNumber = payment.contractNumber;
    if (!contractNumber) continue;

    for (const key of keysByContractNumber[contractNumber] ?? []) {
      grouped.get(key)?.b36Payments.push(payment);
    }
  }

  return [...grouped.values()].sort((a, b) =>
    a.contractNumber.localeCompare(b.contractNumber, "cs") ||
    a.productLabel.localeCompare(b.productLabel, "cs")
  );
};

const buildOtherProductContracts = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): OtherProductContractPreview[] => {
  const grouped = new Map<string, OtherProductContractPreview>();
  const rows = commissionRows.filter((row) => !isLifeSplitProductCode(row.product));

  for (const row of rows) {
    const key = row.contractNumber || row.id;
    const existing =
      grouped.get(key) ??
      ({
        key,
        contractNumber: row.contractNumber,
        client: row.client,
        signedAt: row.signedAt,
        validFrom: row.validFrom,
        rows: [],
        b36Payments: [],
      } satisfies OtherProductContractPreview);

    existing.rows.push(row);
    grouped.set(key, existing);
  }

  for (const payment of otherPayments) {
    if (!payment.isB36Half || !payment.contractNumber) continue;

    const existing = grouped.get(payment.contractNumber);
    if (!existing) continue;

    existing.b36Payments.push(payment);
  }

  return [...grouped.values()].sort((a, b) => {
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });
};

const findUnmatchedB36Payments = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): OtherPayment[] => {
  const contractNumbersInRows = new Set(commissionRows.map((row) => row.contractNumber));

  return otherPayments.filter(
    (payment) =>
      payment.isB36Half &&
      (!payment.contractNumber || !contractNumbersInRows.has(payment.contractNumber))
  );
};

const parseStatementHtml = (html: string, fileName: string): ParsedStatement => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const commissionRows = parseCommissionRows(doc);
  const otherPayments = parseOtherPayments(doc);
  const contractStatusRules = parseContractStatusRules(doc);
  const managerCommissions = parseManagerCommissions(doc);
  const lifeSplitContracts = buildLifeSplitContracts(commissionRows, otherPayments);
  const otherProductContracts = buildOtherProductContracts(commissionRows, otherPayments);
  const unmatchedB36Payments = findUnmatchedB36Payments(commissionRows, otherPayments);
  const parseWarnings: string[] = [];

  if (!doc.getElementById("provize")) {
    parseWarnings.push("Ve výpisu nebyla nalezena sekce Záloha za smlouvy.");
  }
  if (!doc.getElementById("ostatni_platby")) {
    parseWarnings.push("Ve výpisu nebyla nalezena sekce Ostatní platby.");
  }
  if (!doc.getElementById("kody_stavu_smluv")) {
    parseWarnings.push("Ve výpisu nebyla nalezena legenda kódů stavů smluv.");
  }

  return {
    fileName,
    header: extractHeader(html, doc),
    commissionRows,
    otherPayments,
    contractStatusRules,
    managerCommissions,
    lifeSplitContracts,
    otherProductContracts,
    unmatchedB36Payments,
    parseWarnings,
  };
};

const readStatementFile = async (file: File): Promise<ParsedStatement> => {
  const buffer = await file.arrayBuffer();
  const html = new TextDecoder("iso-8859-2").decode(buffer);
  return parseStatementHtml(html, file.name);
};

const contractMatchKey = (
  scope: ContractMatchScope,
  contractNumber: string | null | undefined
): string | null => {
  const normalized = normalizeContractNumberForMatch(contractNumber);
  return normalized ? `${scope}:${normalized}` : null;
};

const collectStatementContractMatchRequests = (
  statements: ParsedStatement[]
): ContractMatchRequest[] => {
  const requests = new Map<string, ContractMatchRequest>();

  const addRequest = (
    contractNumber: string | null | undefined,
    scope: ContractMatchScope
  ) => {
    const key = contractMatchKey(scope, contractNumber);
    if (!key || !contractNumber || requests.has(key)) return;
    requests.set(key, { contractNumber, scope });
  };

  for (const statement of statements) {
    for (const row of statement.commissionRows) {
      addRequest(row.contractNumber, "my");
    }
    for (const payment of statement.otherPayments) {
      addRequest(payment.contractNumber, "my");
    }
    for (const advisor of statement.managerCommissions) {
      for (const row of advisor.rows) {
        addRequest(row.contractNumber, "team");
      }
    }
  }

  return [...requests.values()];
};

const contractMatchForNumber = (
  matches: ContractMatchesByNumber,
  contractNumber: string | null | undefined,
  scope: ContractMatchScope = "my"
): ContractMatchState | null => {
  const key = contractMatchKey(scope, contractNumber);
  return key ? matches[key] ?? null : null;
};

const isUnpairedContractMatch = (match: ContractMatchState | null): boolean =>
  match?.status === "not_found" ||
  match?.status === "error" ||
  (match?.status === "matched" && match.contracts.length !== 1);

const fetchSystemContractMatch = async (
  user: FirebaseUser,
  matchRequest: ContractMatchRequest
): Promise<ContractMatchState> => {
  const params = new URLSearchParams({
    scope: matchRequest.scope,
    q: matchRequest.contractNumber,
  });

  const sendRequest = async (token: string) =>
    fetch(`/api/contracts/find?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  let token = await user.getIdToken();
  let response = await sendRequest(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await sendRequest(token);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        contracts?: MatchedSystemContract[];
      }
    | null;

  if (!response.ok || payload?.ok === false) {
    return {
      status: "error",
      contracts: [],
      error: payload?.error ?? `Nepodařilo se dohledat smlouvu (HTTP ${response.status}).`,
    };
  }

  const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
  if (contracts.length === 0) return { status: "not_found", contracts: [] };
  return { status: "matched", contracts };
};

const fetchSystemContractMatches = async (
  user: FirebaseUser,
  requests: ContractMatchRequest[],
  onMatch: (request: ContractMatchRequest, match: ContractMatchState) => void
) => {
  const queue = [...requests];
  const workerCount = Math.min(8, Math.max(1, queue.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const request = queue.shift();
        if (!request) continue;
        const match = await fetchSystemContractMatch(user, request).catch((err) => ({
          status: "error" as const,
          contracts: [],
          error:
            err instanceof Error
              ? err.message
              : "Nepodařilo se dohledat smlouvu v systému.",
        }));
        onMatch(request, match);
      }
    })
  );
};

const sumRows = (rows: CommissionRow[]): number =>
  rows.reduce((sum, row) => sum + row.commission, 0);

const sumPayments = (payments: OtherPayment[]): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

const rowsByKind = (
  contract: LifeSplitContractPreview,
  kind: LifeSplitCommissionKind
): CommissionRow[] => contract.rows.filter((row) => row.lifeSplitKind === kind);

const statusForContract = (contract: LifeSplitContractPreview): {
  label: string;
  tone: "ok" | "warn" | "info";
} => {
  const hasA101 = rowsByKind(contract, "a101").length > 0;
  const hasB0301 = rowsByKind(contract, "b0301").length > 0;
  const hasTip = rowsByKind(contract, "tip").length > 0;
  const hasOnlyLaterItems =
    !hasA101 &&
    !hasTip &&
    contract.rows.some((row) =>
      ["b3601", "b4801", "subsequent", "care"].includes(row.lifeSplitKind)
    );
  const hasStornoB36 = contract.b36Payments.some(
    (payment) => payment.isStorno || payment.amount < 0
  );

  if (hasStornoB36) return { label: "Obsahuje storno B36", tone: "warn" };
  if (contract.rows.length === 0 && contract.b36Payments.length > 0) {
    return { label: "Jen B36 z ostatních plateb", tone: "info" };
  }
  if (hasTip) return { label: "Provize z TIPU", tone: "info" };
  if (hasOnlyLaterItems) return { label: "Pozdější položky", tone: "info" };
  if (hasA101 && hasB0301) return { label: "Sjednávací část OK", tone: "ok" };
  if (hasA101 && !hasB0301) return { label: "B0301 nenalezeno v tomto výpisu", tone: "warn" };
  return { label: "Ke kontrole", tone: "warn" };
};

const statusClass = (tone: "ok" | "warn" | "info"): string => {
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-800";
};

const contractStatusCategoryLabel = (category: ContractStatusCategory): string => {
  switch (category) {
    case "active":
      return "Aktivní";
    case "pending":
      return "Nová / čekárna";
    case "matured":
      return "Dožitá";
    case "transferred":
      return "Převedená";
    case "storno":
      return "Storno";
    case "invalid":
      return "Chybná";
    default:
      return "Neznámá";
  }
};

const contractStatusCategoryClass = (category: ContractStatusCategory): string => {
  switch (category) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending":
    case "transferred":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "matured":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "storno":
    case "invalid":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
};

const generalCommissionKindClass = (kind: GeneralCommissionKind): string => {
  switch (kind) {
    case "closing":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "tip":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "subsequent":
    case "installment":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "increase":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "unexpected":
    case "troyOunce":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "penalty":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "office":
    case "compensation":
    case "gradual":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const uniqueProductMetasForRows = (rows: CommissionRow[]): StatementProductMeta[] => {
  const seen = new Set<string>();
  const products: StatementProductMeta[] = [];

  for (const row of rows) {
    const product = resolveStatementProduct(row.product);
    if (seen.has(product.rawCode)) continue;
    seen.add(product.rawCode);
    products.push(product);
  }

  return products;
};

const contractHasProductCategory = (
  contract: OtherProductContractPreview,
  category: StatementProductCategory
): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) => product.category === category);

const hasCommissionType = (rows: CommissionRow[], type: string): boolean =>
  rows.some((row) => row.type.trim().toUpperCase() === type);

const missingAcceleratedB36Warning = (
  rows: CommissionRow[],
  b36Payments: OtherPayment[]
): MissingAcceleratedB36Warning | null => {
  const splitProducts = uniqueProductMetasForRows(rows).filter((product) =>
    isLifeSplitProductCode(product.rawCode)
  );

  if (splitProducts.length === 0) return null;
  if (!hasCommissionType(rows, "A101") || !hasCommissionType(rows, "B0301")) return null;
  if (b36Payments.some((payment) => payment.isB36Half && payment.amount > 0)) return null;

  return {
    contractNumber: rows[0]?.contractNumber ?? "",
    client: rows[0]?.client ?? "",
    productLabels: splitProducts
      .map((product) => `${product.label} (${product.rawCode})`)
      .join(", "),
  };
};

const statementMissingAcceleratedB36Warnings = (
  statement: ParsedStatement
): MissingAcceleratedB36Warning[] => [
  ...statement.lifeSplitContracts.flatMap((contract) => {
    const warning = missingAcceleratedB36Warning(contract.rows, contract.b36Payments);
    return warning ? [warning] : [];
  }),
  ...statement.otherProductContracts.flatMap((contract) => {
    const warning = missingAcceleratedB36Warning(contract.rows, contract.b36Payments);
    return warning ? [warning] : [];
  }),
];

const isTotalCommissionItem = (item: CommissionResultItemDTO): boolean =>
  ["celkem", "celkova provize"].includes(normalizeCommissionTitle(item.title));

const expectedAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  matcher: (title: string) => boolean
): number =>
  (items ?? [])
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => matcher(normalizeCommissionTitle(item.title)))
    .reduce((sum, item) => sum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0), 0);

const expectedClosestAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  statementAmount: number,
  matcher: (title: string) => boolean
): number => {
  const candidates = (items ?? [])
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => matcher(normalizeCommissionTitle(item.title)))
    .map((item) => Number(item.amount))
    .filter((amount) => Number.isFinite(amount));

  if (candidates.length === 0) return 0;
  const summed = candidates.reduce((sum, amount) => sum + amount, 0);
  const options = candidates.length > 1 ? [...candidates, summed] : candidates;

  return options.reduce((best, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(best - statementAmount) ? amount : best
  );
};

const paymentPeriodsPerYear = (frequency: string | null | undefined): number => {
  const normalized = normalizeCommissionTitle(frequency);
  if (normalized === "monthly" || normalized.includes("mesic")) return 12;
  if (normalized === "quarterly" || normalized.includes("ctvrt")) return 4;
  if (normalized === "semiannual" || normalized.includes("pololet")) return 2;
  return 1;
};

const closestAmount = (amounts: number[], statementAmount: number): number => {
  const candidates = amounts.filter((amount) => Number.isFinite(amount));
  if (candidates.length === 0) return 0;
  return candidates.reduce((best, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(best - statementAmount) ? amount : best
  );
};

const expectedAutoPerPaymentAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  statementAmount: number,
  frequency: string | null | undefined
): number => {
  const periods = paymentPeriodsPerYear(frequency);
  const candidates = (items ?? []).flatMap((item) => {
    if (isTotalCommissionItem(item)) return [];
    const title = normalizeCommissionTitle(item.title);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) return [];

    const isImmediate =
      title.includes("okamzita") ||
      title.includes("ziskatelska") ||
      title.includes("uzavreni");
    const isAnnual =
      title.includes("provize za rok") ||
      title.includes("celkem za rok") ||
      title.includes("za rok");
    if (!isImmediate && !isAnnual) return [];

    return periods > 1 ? [amount, amount / periods] : [amount];
  });

  return closestAmount(candidates, statementAmount);
};

const comparisonStatus = (
  statementAmount: number,
  expectedAmount: number
): CommissionAmountComparisonStatus => {
  const difference = statementAmount - expectedAmount;
  if (Math.abs(difference) <= COMMISSION_AMOUNT_TOLERANCE) return "ok";
  if (statementAmount <= COMMISSION_AMOUNT_TOLERANCE && expectedAmount > COMMISSION_AMOUNT_TOLERANCE) {
    return "missing_statement";
  }
  if (expectedAmount <= COMMISSION_AMOUNT_TOLERANCE && statementAmount > COMMISSION_AMOUNT_TOLERANCE) {
    return "missing_expected";
  }
  return "diff";
};

const buildLifeSplitAmountComparisons = (
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract
): CommissionAmountComparison[] => {
  const items = systemContract.items ?? [];
  if (items.length === 0) return [];
  const hasA101InStatement = rowsByKind(contract, "a101").length > 0;
  const hasB0301InStatement = rowsByKind(contract, "b0301").length > 0;

  const statementParts = [
    {
      key: "a101",
      label: "A101",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "a101")),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("a101")),
    },
    {
      key: "b0301",
      label: "B0301",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "b0301")),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("b0301")),
    },
    {
      key: "b36-half",
      label: b36HalfLabelForProduct(contract.productCode),
      requiredNow: hasA101InStatement && hasB0301InStatement,
      statementAmount: sumPayments(contract.b36Payments),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
      ),
    },
    {
      key: "b3601",
      label: b36DeferredCodeForProduct(contract.productCode),
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "b3601")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          !title.includes("50") &&
          (title.includes("b3601") || title.includes("b36") || title.includes("po 3 letech"))
      ),
    },
    {
      key: "b4801",
      label: "B4801",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "b4801")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) => title.includes("b4801") || title.includes("b48") || title.includes("po 4 letech")
      ),
    },
    {
      key: "subsequent",
      label: "B101-B104",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "subsequent")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          title.includes("nasledna") &&
          (title.includes("2 5") || title.includes("2 5 rok"))
      ),
    },
    {
      key: "care",
      label: "B201-B205",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "care")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          title.includes("pecovatelska") ||
          (title.includes("nasledna") && title.includes("5 10"))
      ),
    },
  ];

  return statementParts
    .filter(
      (part) =>
        part.statementAmount > COMMISSION_AMOUNT_TOLERANCE ||
        (part.requiredNow && part.expectedAmount > COMMISSION_AMOUNT_TOLERANCE)
    )
    .map((part) => ({
      ...part,
      difference: part.statementAmount - part.expectedAmount,
      status: comparisonStatus(part.statementAmount, part.expectedAmount),
    }));
};

const rowsByGeneralKinds = (
  contract: OtherProductContractPreview,
  kinds: GeneralCommissionKind[]
): CommissionRow[] =>
  contract.rows.filter((row) =>
    kinds.includes(classifyGeneralCommissionCode(row.product, row.type).kind)
  );

const buildOtherProductAmountComparisons = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract
): CommissionAmountComparison[] => {
  const items = systemContract.items ?? [];
  if (items.length === 0) return [];
  const isAutoContract = contractHasProductCategory(contract, "auto");

  if (isAutoContract) {
    const autoRows = rowsByGeneralKinds(contract, ["closing", "subsequent", "installment"]);
    const statementAmount = sumRows(autoRows);
    const expectedAmount = expectedAutoPerPaymentAmountFromItems(
      items,
      statementAmount,
      systemContract.frequencyRaw
    );
    const comparisons: CommissionAmountComparison[] =
      statementAmount > COMMISSION_AMOUNT_TOLERANCE
        ? [
            {
              key: "auto-immediate",
              label: "Okamžitá provize",
              statementAmount,
              expectedAmount,
              difference: statementAmount - expectedAmount,
              status: comparisonStatus(statementAmount, expectedAmount),
            },
          ]
        : [];

    const b36Amount = sumPayments(contract.b36Payments);
    if (b36Amount > COMMISSION_AMOUNT_TOLERANCE) {
      const expectedB36 = expectedClosestAmountFromItems(
        items,
        b36Amount,
        (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
      );
      comparisons.push({
        key: "b36-half",
        label: "50% z B36",
        statementAmount: b36Amount,
        expectedAmount: expectedB36,
        difference: b36Amount - expectedB36,
        status: comparisonStatus(b36Amount, expectedB36),
      });
    }

    return comparisons;
  }

  const groups = [
    {
      key: "closing",
      label: "Sjednávací / okamžitá",
      rows: rowsByGeneralKinds(contract, ["closing", "tip"]),
      matcher: (title: string) =>
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni"),
    },
    {
      key: "subsequent",
      label: "Následná / splátka",
      rows: rowsByGeneralKinds(contract, ["subsequent", "installment"]),
      matcher: (title: string) =>
        title.includes("nasledna") ||
        title.includes("provize za rok") ||
        title.includes("celkem za rok"),
    },
    {
      key: "increase",
      label: "Navýšení",
      rows: rowsByGeneralKinds(contract, ["increase"]),
      matcher: (title: string) => title.includes("navyseni"),
    },
    {
      key: "unexpected",
      label: "Neočekávaná",
      rows: rowsByGeneralKinds(contract, ["unexpected"]),
      matcher: (title: string) => title.includes("neocekavana"),
    },
  ];

  const comparisons = groups
    .map((group) => {
      const statementAmount = sumRows(group.rows);
      const expectedAmount = expectedClosestAmountFromItems(
        items,
        statementAmount,
        group.matcher
      );
      return {
        key: group.key,
        label: group.label,
        statementAmount,
        expectedAmount,
        difference: statementAmount - expectedAmount,
        status: comparisonStatus(statementAmount, expectedAmount),
      };
    })
    .filter((comparison) => comparison.statementAmount > COMMISSION_AMOUNT_TOLERANCE);

  const b36Amount = sumPayments(contract.b36Payments);
  if (b36Amount > COMMISSION_AMOUNT_TOLERANCE) {
    const expectedB36 = expectedClosestAmountFromItems(
      items,
      b36Amount,
      (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
    );
    comparisons.push({
      key: "b36-half",
      label: "50% z B36",
      statementAmount: b36Amount,
      expectedAmount: expectedB36,
      difference: b36Amount - expectedB36,
      status: comparisonStatus(b36Amount, expectedB36),
    });
  }

  return comparisons;
};

const amountComparisonStatusLabel = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "Sedí";
    case "missing_statement":
      return "Chybí ve výpisu";
    case "missing_expected":
      return "Chybí v systému";
    default:
      return "Rozdíl";
  }
};

const amountComparisonStatusClass = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "missing_statement":
    case "missing_expected":
    case "diff":
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
};

const amountIssueCountLabel = (count: number): string => {
  if (count === 1) return "1 rozdíl";
  if (count >= 2 && count <= 4) return `${count} rozdíly`;
  return `${count} rozdílů`;
};

function AmountPill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap text-sm font-bold text-slate-950">
        {value === null ? "—" : `${formatMoney(value)} Kč`}
      </div>
    </div>
  );
}

function AmountComparisonPanel({
  comparisons,
}: {
  comparisons: CommissionAmountComparison[];
}) {
  if (comparisons.length === 0) return null;

  const issueCount = comparisons.filter((comparison) => comparison.status !== "ok").length;

  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-3 ${
        issueCount === 0
          ? "border-emerald-200 bg-emerald-50"
          : "border-rose-200 bg-rose-50"
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-bold text-slate-950">
          Kontrola vyplacených částek
        </div>
        <div
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            issueCount === 0
              ? "border-emerald-200 bg-white text-emerald-800"
              : "border-rose-200 bg-white text-rose-800"
          }`}
        >
          {issueCount === 0 ? "Vše sedí" : amountIssueCountLabel(issueCount)}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-white/70 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Položka</th>
              <th className="px-3 py-2 text-right">Výpis</th>
              <th className="px-3 py-2 text-right">Systém</th>
              <th className="px-3 py-2 text-right">Rozdíl</th>
              <th className="px-3 py-2 text-right">Stav</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparisons.map((comparison) => (
              <tr key={comparison.key}>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {comparison.label}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(comparison.statementAmount)} Kč
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(comparison.expectedAmount)} Kč
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    Math.abs(comparison.difference) <= COMMISSION_AMOUNT_TOLERANCE
                      ? "text-slate-700"
                      : "text-rose-800"
                  }`}
                >
                  {comparison.difference > 0 ? "+" : ""}
                  {formatMoney(comparison.difference)} Kč
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${amountComparisonStatusClass(comparison.status)}`}
                  >
                    {amountComparisonStatusLabel(comparison.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SystemMatchBadge({
  match,
  scope = "my",
}: {
  match: ContractMatchState | null;
  scope?: ContractMatchScope;
}) {
  if (!match || match.status === "idle") return null;

  const badgeClass =
    match.status === "matched"
      ? match.contracts.length === 1
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-900"
      : match.status === "loading"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : match.status === "not_found"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-rose-200 bg-rose-50 text-rose-800";

  const label =
    match.status === "matched"
      ? match.contracts.length === 1
        ? "Spárováno v systému"
        : `Více shod v systému (${match.contracts.length})`
      : match.status === "loading"
        ? scope === "team"
          ? "Páruji v týmu"
          : "Páruji se systémem"
        : match.status === "not_found"
          ? scope === "team"
            ? "Nenalezeno v týmu"
            : "Nenalezeno v mých smlouvách"
          : "Chyba párování";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
      {label}
    </span>
  );
}

function SystemMatchPanel({
  match,
  expectedProductKey,
}: {
  match: ContractMatchState | null;
  expectedProductKey?: Product | null;
}) {
  if (!match || match.status === "idle") return null;

  if (match.status === "loading") {
    return (
      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
        Páruji číslo smlouvy s mými uloženými smlouvami.
      </div>
    );
  }

  if (match.status === "not_found") {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        Smlouva nebyla nalezena mezi mými uloženými smlouvami. Náhled výpisu je zatím bez zápisu.
      </div>
    );
  }

  if (match.status === "error") {
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
        Párování se systémem selhalo: {match.error}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
      {match.contracts.map((contract) => {
        const productMismatch =
          Boolean(expectedProductKey && contract.productKey) &&
          expectedProductKey !== contract.productKey;

        return (
          <div key={`${contract.adviserEmail ?? "owner"}-${contract.id}`}>
            <div className="font-bold">
              Shoda v systému: {contract.clientName || "klient bez názvu"}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-emerald-900">
              <span>{productLabelFromKey(contract.productKey)}</span>
              <span>Poradce: {contract.adviserName || contract.adviserEmail || "—"}</span>
              <span>
                Měsíčně:{" "}
                {Number.isFinite(Number(contract.inputAmount))
                  ? `${formatWholeMoney(Number(contract.inputAmount))} Kč`
                  : "—"}
              </span>
              <span>Sjednáno: {formatSystemDate(contract.contractSignedDate)}</span>
              <span>Počátek: {formatSystemDate(contract.policyStartDate)}</span>
            </div>
            {productMismatch && (
              <div className="mt-1 font-semibold text-amber-900">
                Pozor: produkt ve výpisu nesedí s produktem uložené smlouvy.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchingProgressBar({
  stats,
  hasUser,
}: {
  stats: ContractMatchStats;
  hasUser: boolean;
}) {
  if (stats.total === 0) return null;

  const isComplete = stats.completed >= stats.total;
  const activeCount = stats.loading + stats.pending;
  const fillClass =
    stats.errors > 0 && isComplete
      ? "bg-rose-500"
      : isComplete
        ? "bg-emerald-500"
        : "bg-slate-950";
  const statusText = !hasUser
    ? "Čekám na přihlášení"
    : isComplete
      ? "Párování dokončeno"
      : `Páruji ${activeCount} smluv`;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            isComplete
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-950">Párování smluv</h2>
            <p className="text-sm text-slate-600">
              {statusText} · {stats.completed}/{stats.total} hotovo
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-slate-950">
            {stats.progress} %
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {stats.matched} shod · {stats.notFound} nenalezeno · {stats.errors} chyby
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-full bg-slate-100 p-1">
        <div
          className={`h-3 rounded-full transition-all duration-500 ease-out ${fillClass}`}
          style={{
            width: `${stats.progress}%`,
            minWidth: stats.progress > 0 ? "1.25rem" : undefined,
          }}
        >
          {!isComplete && stats.progress > 0 && (
            <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
          )}
        </div>
      </div>
    </section>
  );
}

function StatementSummary({ statement }: { statement: ParsedStatement }) {
  const totalCommission = useMemo(
    () => sumRows(statement.commissionRows),
    [statement.commissionRows]
  );
  const totalOtherPayments = useMemo(
    () => sumPayments(statement.otherPayments),
    [statement.otherPayments]
  );
  const lifeSplitRowCount = statement.commissionRows.filter((row) =>
    isLifeSplitProductCode(row.product)
  ).length;
  const flexiRowCount = statement.commissionRows.filter(
    (row) => normalizeProductCode(row.product) === "KOOP_FLEXI"
  ).length;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Výpis
        </div>
        <div className="mt-1 text-lg font-bold text-slate-950">
          {statement.header.statementNumber ?? "—"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {statement.header.statementDate ?? "datum nezjištěno"}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Období
        </div>
        <div className="mt-1 text-lg font-bold text-slate-950">
          {statement.header.period ?? "—"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Poradce {statement.header.advisorNumber ?? "—"}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Záloha za smlouvy
        </div>
        <div className="mt-1 text-lg font-bold text-slate-950">
          {formatMoney(totalCommission)} Kč
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {statement.commissionRows.length} řádků, ŽP split {lifeSplitRowCount}
          {flexiRowCount > 0 ? `, FLEXI ${flexiRowCount}` : ""}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ostatní platby
        </div>
        <div className="mt-1 text-lg font-bold text-slate-950">
          {formatMoney(totalOtherPayments)} Kč
        </div>
        <div className="mt-1 text-sm text-slate-600">
          B36 položky {statement.otherPayments.filter((payment) => payment.isB36Half).length}
        </div>
      </div>
    </div>
  );
}

function LifeSplitContractCard({
  contract,
  match,
}: {
  contract: LifeSplitContractPreview;
  match: ContractMatchState | null;
}) {
  const status = statusForContract(contract);
  const a101 = sumRows(rowsByKind(contract, "a101"));
  const b0301 = sumRows(rowsByKind(contract, "b0301"));
  const b3601 = sumRows(rowsByKind(contract, "b3601"));
  const b4801 = sumRows(rowsByKind(contract, "b4801"));
  const subsequent = sumRows(rowsByKind(contract, "subsequent"));
  const care = sumRows(rowsByKind(contract, "care"));
  const tip = sumRows(rowsByKind(contract, "tip"));
  const b36Half = sumPayments(contract.b36Payments);
  const total = a101 + b0301 + b3601 + b4801 + subsequent + care + tip + b36Half;
  const monthlyPremium = contract.annualPremium > 0 ? contract.annualPremium / 12 : null;
  const unknownRows = rowsByKind(contract, "unknown");
  const missingB36Warning = missingAcceleratedB36Warning(contract.rows, contract.b36Payments);
  const b36HalfLabel = b36HalfLabelForProduct(contract.productCode);
  const b36DeferredCode = b36DeferredCodeForProduct(contract.productCode);
  const expectedProductKey = resolveStatementProduct(contract.productCode).productKey;
  const systemContract =
    match?.status === "matched" && match.contracts.length === 1
      ? match.contracts[0]
      : null;
  const amountComparisons = systemContract
    ? buildLifeSplitAmountComparisons(contract, systemContract)
    : [];
  const amountIssueCount = amountComparisons.filter((comparison) => comparison.status !== "ok").length;
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-950">
              Smlouva {contract.contractNumber}
            </h3>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status.tone)}`}>
              {status.label}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
              {contract.productLabel} · {contract.productCode}
            </span>
            <SystemMatchBadge match={match} />
            {amountComparisons.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  amountIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {amountIssueCount === 0 ? "Provize sedí" : amountIssueCountLabel(amountIssueCount)}
              </span>
            )}
            {missingB36Warning && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Chybí 50% z B36
              </span>
            )}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-slate-800">
            {contract.client || "Klient se doplní po spárování se systémem"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Uzavřeno: {contract.signedAt || "—"}</span>
            <span>Počátek: {contract.validFrom || "—"}</span>
            <span>
              Roční základna: {contract.annualPremium > 0 ? `${formatWholeMoney(contract.annualPremium)} Kč` : "—"}
            </span>
            <span>
              Měsíčně: {monthlyPremium === null ? "—" : `${formatWholeMoney(monthlyPremium)} Kč`}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
          <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Nalezeno celkem
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-300">
              {formatMoney(total)} Kč
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {tip > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
              ATP101: provize z TIPU. Párovat přes TIP vazbu, ne jako vlastní sjednání smlouvy.
            </div>
          )}

          <SystemMatchPanel match={match} expectedProductKey={expectedProductKey} />
          <AmountComparisonPanel comparisons={amountComparisons} />

          {missingB36Warning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>
                Zrychlený režim: k A101 a B0301 chybí 50% z B36 v ostatních platbách.
              </span>
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AmountPill label="A101" value={a101 || null} />
            <AmountPill label="B0301" value={b0301 || null} />
            <AmountPill label={b36HalfLabel} value={b36Half || null} />
            <AmountPill label="B4801" value={b4801 || null} />
          </div>

          {(b3601 || subsequent || care || tip || unknownRows.length > 0) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <AmountPill label={b36DeferredCode} value={b3601 || null} />
              <AmountPill label="B101-B104" value={subsequent || null} />
              <AmountPill label="B201-B205" value={care || null} />
              <AmountPill label="ATP101 / TIP" value={tip || null} />
              {unknownRows.length > 0 && (
                <AmountPill label="Nezařazeno" value={sumRows(unknownRows)} />
              )}
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Kód</th>
                  <th className="px-3 py-2">Význam</th>
                  <th className="px-3 py-2 text-right">Základna</th>
                  <th className="px-3 py-2 text-right">Procento</th>
                  <th className="px-3 py-2 text-right">Provize</th>
                  <th className="px-3 py-2 text-right">Rez. fond</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contract.rows.map((row) => (
                  <tr key={`${row.id}-${row.type}-${row.commission}`}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.type}</td>
                    <td className="px-3 py-2 text-slate-700">{row.lifeSplitLabel}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatMoney(row.base)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.percent || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-950">
                      {formatMoney(row.commission)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatMoney(row.reserveFund)}
                    </td>
                  </tr>
                ))}
                {contract.b36Payments.map((payment, index) => (
                  <tr key={`${payment.contractNumber}-b36-${index}`} className="bg-emerald-50/60">
                    <td className="px-3 py-2 font-semibold text-slate-900">B36</td>
                    <td className="px-3 py-2 text-slate-700">
                      {b36HalfLabel} z ostatních plateb
                      {payment.isStorno ? " / storno" : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">—</td>
                    <td className="px-3 py-2 text-right text-slate-700">—</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-950">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

function OtherProductContractCard({
  contract,
  match,
}: {
  contract: OtherProductContractPreview;
  match: ContractMatchState | null;
}) {
  const productMetas = uniqueProductMetasForRows(contract.rows);
  const notes = productMetas.map((product) => product.note).filter(Boolean);
  const totalCommission = sumRows(contract.rows) + sumPayments(contract.b36Payments);
  const totalReserve = contract.rows.reduce((sum, row) => sum + row.reserveFund, 0);
  const hasUnknown = contract.rows.some(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
  );
  const annualBaseRow = contract.rows.find(
    (row) => resolveStatementProduct(row.product).usesAnnualPremiumBase && row.base > 0
  );
  const annualBase = annualBaseRow?.base ?? 0;
  const monthlyBase = annualBase > 0 ? annualBase / 12 : null;
  const missingB36Warning = missingAcceleratedB36Warning(contract.rows, contract.b36Payments);
  const expectedProductKey =
    productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;
  const systemContract =
    match?.status === "matched" && match.contracts.length === 1
      ? match.contracts[0]
      : null;
  const amountComparisons = systemContract
    ? buildOtherProductAmountComparisons(contract, systemContract)
    : [];
  const amountIssueCount = amountComparisons.filter((comparison) => comparison.status !== "ok").length;
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-slate-950">
              Smlouva {contract.contractNumber || "—"}
            </h4>
            {productMetas.map((product) => (
              <span
                key={product.rawCode}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
              >
                {product.label} · {product.rawCode} · {statementProductCategoryLabel(product.category)}
              </span>
            ))}
            {hasUnknown && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Neznámý kód
              </span>
            )}
            <SystemMatchBadge match={match} />
            {amountComparisons.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  amountIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {amountIssueCount === 0 ? "Provize sedí" : amountIssueCountLabel(amountIssueCount)}
              </span>
            )}
            {missingB36Warning && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Chybí 50% z B36
              </span>
            )}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-slate-800">
            {contract.client || "Klient nezjištěn"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Uzavřeno: {contract.signedAt || "—"}</span>
            <span>Platnost: {contract.validFrom || "—"}</span>
            <span>{contract.rows.length} řádků</span>
            {contract.b36Payments.length > 0 && (
              <span>{contract.b36Payments.length} B36 z ostatních plateb</span>
            )}
            {productMetas.some((product) => product.usesAnnualPremiumBase) && (
              <>
                <span>
                  Roční základna: {annualBase > 0 ? `${formatWholeMoney(annualBase)} Kč` : "—"}
                </span>
                <span>
                  Měsíčně: {monthlyBase === null ? "—" : `${formatWholeMoney(monthlyBase)} Kč`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
          <div className="grid grid-cols-2 gap-2 text-right">
            <div className="rounded-xl bg-slate-950 px-3 py-2 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Provize
              </div>
              <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-300">
                {formatMoney(totalCommission)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Rez. fond
              </div>
              <div className="mt-1 whitespace-nowrap text-lg font-bold text-slate-950">
                {formatMoney(totalReserve)} Kč
              </div>
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {notes.length > 0 && (
            <div className="space-y-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
              {notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}

          <SystemMatchPanel match={match} expectedProductKey={expectedProductKey} />
          <AmountComparisonPanel comparisons={amountComparisons} />

          {missingB36Warning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>
                Zrychlený režim: k A101 a B0301 chybí 50% z B36 v ostatních platbách.
              </span>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produkt</th>
                  <th className="px-3 py-2">Kód</th>
                  <th className="px-3 py-2">Význam</th>
                  <th className="px-3 py-2 text-right">Základna</th>
                  <th className="px-3 py-2 text-right">Procento</th>
                  <th className="px-3 py-2 text-right">Provize</th>
                  <th className="px-3 py-2 text-right">Rez. fond</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contract.rows.map((row) => {
                  const classification = classifyGeneralCommissionCode(row.product, row.type);
                  const rowProductMeta = resolveStatementProduct(row.product);
                  return (
                    <tr key={`${row.id}-${row.type}-${row.commission}`}>
                      <td className="px-3 py-2 text-slate-700">
                        <div className="font-semibold text-slate-900">{rowProductMeta.label}</div>
                        <div className="text-xs text-slate-500">{rowProductMeta.rawCode}</div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.type || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${generalCommissionKindClass(classification.kind)}`}>
                          {classification.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        <div>{formatMoney(row.base)}</div>
                        {rowProductMeta.usesAnnualPremiumBase && row.base > 0 && (
                          <div className="text-xs text-slate-500">
                            měs. {formatWholeMoney(row.base / 12)} Kč
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.percent || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-950">
                        {formatMoney(row.commission)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {formatMoney(row.reserveFund)}
                      </td>
                    </tr>
                  );
                })}
                {contract.b36Payments.map((payment, index) => (
                  <tr key={`${payment.contractNumber}-b36-${index}`} className="bg-emerald-50/60">
                    <td className="px-3 py-2 text-slate-700">
                      <div className="font-semibold text-slate-900">Ostatní platby</div>
                      <div className="text-xs text-slate-500">bez produktového kódu</div>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">B36</td>
                    <td className="px-3 py-2 text-slate-700">
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                        50% z B36 z ostatních plateb
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">—</td>
                    <td className="px-3 py-2 text-right text-slate-700">—</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-950">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

function LifeSplitProductsSection({
  contracts,
  matchesByContractNumber,
}: {
  contracts: LifeSplitContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
}) {
  const [expanded, setExpanded] = useState(false);
  if (contracts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <h3 className="text-lg font-bold text-slate-950">Životní pojištění</h3>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          {contracts.length} smluv
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
          {contracts.map((contract) => (
            <LifeSplitContractCard
              key={`${contract.productCode}-${contract.contractNumber}`}
              contract={contract}
              match={contractMatchForNumber(matchesByContractNumber, contract.contractNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UnpairedContractsSection({
  lifeContracts,
  otherContracts,
  matchesByContractNumber,
}: {
  lifeContracts: LifeSplitContractPreview[];
  otherContracts: OtherProductContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalContracts = lifeContracts.length + otherContracts.length;
  if (totalContracts === 0) return null;

  const totalCommission =
    lifeContracts.reduce(
      (sum, contract) => sum + sumRows(contract.rows) + sumPayments(contract.b36Payments),
      0
    ) +
    otherContracts.reduce(
      (sum, contract) => sum + sumRows(contract.rows) + sumPayments(contract.b36Payments),
      0
    );

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-lg font-bold text-amber-950">Nespárované smlouvy</h3>
          <p className="text-sm text-amber-900">
            Smlouvy bez jednoznačné shody v systému. Před zápisem budou vyžadovat ruční kontrolu.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-950">
          {totalContracts} smluv · {formatMoney(totalCommission)} Kč
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-amber-200 px-4 py-4">
          {lifeContracts.map((contract) => (
            <LifeSplitContractCard
              key={`unpaired-life-${contract.productCode}-${contract.contractNumber}`}
              contract={contract}
              match={contractMatchForNumber(matchesByContractNumber, contract.contractNumber)}
            />
          ))}
          {otherContracts.map((contract) => (
            <OtherProductContractCard
              key={`unpaired-other-${contract.key}`}
              contract={contract}
              match={contractMatchForNumber(matchesByContractNumber, contract.contractNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerCommissionsSection({
  advisors = [],
  matchesByContractNumber,
}: {
  advisors?: ManagerCommissionAdvisor[];
  matchesByContractNumber: ContractMatchesByNumber;
}) {
  const [expanded, setExpanded] = useState(false);
  if (advisors.length === 0) return null;

  const rowCount = advisors.reduce((sum, advisor) => sum + advisor.rows.length, 0);
  const totalCommission = advisors.reduce(
    (sum, advisor) => sum + advisor.commission + advisor.stornos + advisor.deductions,
    0
  );
  const totalReserveFund = advisors.reduce((sum, advisor) => sum + advisor.reserveFund, 0);
  const uniqueContractNumberMap = new Map<string, string>();
  for (const row of advisors.flatMap((advisor) => advisor.rows)) {
    const key = normalizeContractNumberForMatch(row.contractNumber);
    if (key && !uniqueContractNumberMap.has(key)) {
      uniqueContractNumberMap.set(key, row.contractNumber);
    }
  }
  const uniqueContractNumbers = [...uniqueContractNumberMap.values()];
  const matchedContractCount = uniqueContractNumbers.filter((contractNumber) => {
    const match = contractMatchForNumber(matchesByContractNumber, contractNumber, "team");
    return match?.status === "matched" && match.contracts.length === 1;
  }).length;
  const unpairedContractCount = uniqueContractNumbers.filter((contractNumber) =>
    isUnpairedContractMatch(contractMatchForNumber(matchesByContractNumber, contractNumber, "team"))
  ).length;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-lg font-bold text-indigo-950">Provize manažera</h3>
          <p className="text-sm text-indigo-900">
            Meziprovize ze smluv podřízených poradců. Nejde o vlastní sjednané smlouvy.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-950">
          {advisors.length} poradců · {uniqueContractNumbers.length} smluv ·{" "}
          {matchedContractCount} spárováno
          {unpairedContractCount > 0 ? ` · ${unpairedContractCount} nespárováno` : ""} ·{" "}
          {formatMoney(totalCommission)} Kč
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-indigo-200 px-4 py-4">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Manažerská provize
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(totalCommission)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Rez. fond
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(totalReserveFund)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Rozpad
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {advisors.length} poradců / {rowCount} řádků
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2 md:col-span-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Párování týmových smluv
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {matchedContractCount}/{uniqueContractNumbers.length} spárováno
                {unpairedContractCount > 0 ? ` · ${unpairedContractCount} k ruční kontrole` : ""}
              </div>
            </div>
          </div>

          {advisors.map((advisor) => {
            const advisorTotal = advisor.commission + advisor.stornos + advisor.deductions;

            return (
              <article
                key={advisor.advisorNumber}
                className="rounded-2xl border border-indigo-200 bg-white px-4 py-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-slate-950">
                        {advisor.advisorName || "Poradce bez jména"}
                      </h4>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                        {advisor.advisorNumber}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {advisor.position || "Pozice nezjištěna"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{advisor.contractCount} smluv dle výpisu</span>
                      <span>{advisor.rows.length} detailních řádků</span>
                      <span>Storna {formatMoney(advisor.stornos)} Kč</span>
                      <span>Odpočty {formatMoney(advisor.deductions)} Kč</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Celkem
                    </div>
                    <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-300">
                      {formatMoney(advisorTotal)} Kč
                    </div>
                  </div>
                </div>

                {advisor.rows.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Smlouva</th>
                          <th className="px-3 py-2">Klient</th>
                          <th className="px-3 py-2">Produkt</th>
                          <th className="px-3 py-2">Typ</th>
                          <th className="px-3 py-2 text-right">Základna</th>
                          <th className="px-3 py-2 text-right">Procento</th>
                          <th className="px-3 py-2 text-right">Provize</th>
                          <th className="px-3 py-2 text-right">Rez. fond</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {advisor.rows.map((row) => {
                          const product = resolveStatementProduct(row.product);
                          const classification = classifyGeneralCommissionCode(row.product, row.type);
                          const match = contractMatchForNumber(
                            matchesByContractNumber,
                            row.contractNumber,
                            "team"
                          );
                          const matchedContract =
                            match?.status === "matched" && match.contracts.length === 1
                              ? match.contracts[0]
                              : null;

                          return (
                            <tr
                              key={`${advisor.advisorNumber}-${row.id}-${row.contractNumber}-${row.type}-${row.isStorno ? "storno" : "commission"}`}
                              className={row.isStorno ? "bg-rose-50/60" : undefined}
                            >
                              <td className="px-3 py-2 text-slate-700">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-950">
                                    {row.contractNumber}
                                  </span>
                                  <SystemMatchBadge match={match} scope="team" />
                                </div>
                                <div className="text-xs text-slate-500">{row.signedAt || "—"}</div>
                                {matchedContract && (
                                  <div className="mt-1 text-xs font-medium text-emerald-800">
                                    Systém: {matchedContract.clientName || "klient bez názvu"} ·{" "}
                                    {matchedContract.adviserName ||
                                      matchedContract.adviserEmail ||
                                      "poradce nezjištěn"}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-800">
                                {row.client || "—"}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                <div className="font-semibold text-slate-900">{product.label}</div>
                                <div className="text-xs text-slate-500">{product.rawCode}</div>
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                <div className="flex flex-wrap gap-1">
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${generalCommissionKindClass(classification.kind)}`}>
                                    {row.type || "—"}
                                  </span>
                                  {row.isStorno && (
                                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">
                                      Storno
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {formatMoney(row.base)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {row.percent || "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-950">
                                {formatMoney(row.commission)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {formatMoney(row.reserveFund)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OtherProductsSection({
  title = "Ostatní smlouvy",
  description = "Primárně seskupeno podle čísla smlouvy. Produkt je doplňující kontrola z výpisu.",
  showTitle = true,
  showDescription = false,
  contracts,
  matchesByContractNumber,
}: {
  title?: string;
  description?: string;
  showTitle?: boolean;
  showDescription?: boolean;
  contracts?: OtherProductContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
}) {
  const [expanded, setExpanded] = useState(false);
  const safeContracts = contracts ?? [];
  if (safeContracts.length === 0) return null;

  const productCount = uniqueProductMetasForRows(
    safeContracts.flatMap((contract) => contract.rows)
  ).length;
  const rowCount = safeContracts.reduce((sum, contract) => sum + contract.rows.length, 0);
  const totalB36Payments = safeContracts.reduce(
    (sum, contract) => sum + contract.b36Payments.length,
    0
  );
  const totalCommission = safeContracts.reduce(
    (sum, contract) => sum + sumRows(contract.rows) + sumPayments(contract.b36Payments),
    0
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex w-full px-4 py-4 text-left ${
          showTitle
            ? "flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            : "justify-end"
        }`}
        aria-expanded={expanded}
      >
        {showTitle && (
          <div>
            <h3 className="text-lg font-bold text-slate-950">{title}</h3>
            {showDescription && (
              <p className="text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
        )}
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          {productCount} produktů · {safeContracts.length} smluv · {rowCount} řádků · B36 {totalB36Payments} · {formatMoney(totalCommission)} Kč
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4">
          {safeContracts.map((contract) => (
            <OtherProductContractCard
              key={contract.key}
              contract={contract}
              match={contractMatchForNumber(matchesByContractNumber, contract.contractNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContractStatusRulesPanel({ rules }: { rules?: ContractStatusRule[] }) {
  const [expanded, setExpanded] = useState(false);
  const safeRules = rules ?? [];
  if (safeRules.length === 0) return null;

  const groupedRules = safeRules.reduce<Record<ContractStatusCategory, ContractStatusRule[]>>(
    (groups, rule) => {
      groups[rule.category].push(rule);
      return groups;
    },
    {
      active: [],
      pending: [],
      matured: [],
      transferred: [],
      storno: [],
      invalid: [],
      unknown: [],
    }
  );
  const visibleGroups = Object.entries(groupedRules).filter(([, groupRules]) => groupRules.length > 0) as [
    ContractStatusCategory,
    ContractStatusRule[],
  ][];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-base font-bold text-slate-950">Kódy stavů smluv</h3>
          <p className="text-sm text-slate-600">
            Obecná pravidla pro všechny produkty. Konkrétní stav smlouvy se při ostrém importu vezme z našeho systému nebo ČPP synchronizace.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          {safeRules.length} kódů
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="grid gap-3 border-t border-slate-200 px-4 py-4 xl:grid-cols-2">
        {visibleGroups.map(([category, groupRules]) => (
          <div key={category} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${contractStatusCategoryClass(category)}`}>
                {contractStatusCategoryLabel(category)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {groupRules.length} kódů
              </span>
            </div>
            <div className="space-y-2">
              {groupRules.map((rule) => (
                <div key={rule.code} className="grid gap-1 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-sm font-bold text-slate-950">{rule.code}</span>
                    <span className="text-sm text-slate-700">{rule.label}</span>
                  </div>
                  <div className="text-xs text-slate-500">{rule.importDecision}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}

function StatementPreview({
  statement,
  matchesByContractNumber,
}: {
  statement: ParsedStatement;
  matchesByContractNumber: ContractMatchesByNumber;
}) {
  const missingB36Warnings = statementMissingAcceleratedB36Warnings(statement);
  const unpairedLifeSplitContracts = statement.lifeSplitContracts.filter((contract) =>
    isUnpairedContractMatch(contractMatchForNumber(matchesByContractNumber, contract.contractNumber))
  );
  const pairedLifeSplitContracts = statement.lifeSplitContracts.filter(
    (contract) =>
      !isUnpairedContractMatch(contractMatchForNumber(matchesByContractNumber, contract.contractNumber))
  );
  const unpairedOtherProductContracts = statement.otherProductContracts.filter((contract) =>
    isUnpairedContractMatch(contractMatchForNumber(matchesByContractNumber, contract.contractNumber))
  );
  const pairedOtherProductContracts = statement.otherProductContracts.filter(
    (contract) =>
      !isUnpairedContractMatch(contractMatchForNumber(matchesByContractNumber, contract.contractNumber))
  );
  const autoProductContracts = pairedOtherProductContracts.filter((contract) =>
    contractHasProductCategory(contract, "auto")
  );
  const remainingOtherProductContracts = pairedOtherProductContracts.filter(
    (contract) => !contractHasProductCategory(contract, "auto")
  );

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            <span className="truncate">{statement.fileName}</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            Výpis {statement.header.statementNumber ?? "bez čísla"}
          </h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Náhled bez zápisu
        </span>
      </div>

      {statement.parseWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {statement.parseWarnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <StatementSummary statement={statement} />

      {missingB36Warnings.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" strokeWidth={2.2} aria-hidden="true" />
            <div>
              <h3 className="text-base font-bold text-rose-950">
                Chybí 50% z B36 pro zrychlený režim
              </h3>
              <p className="mt-1 text-sm text-rose-900">
                Ve výpisu je A101 a B0301, ale není nalezená odpovídající položka v ostatních platbách.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {missingB36Warnings.map((warning) => (
              <div
                key={warning.contractNumber}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm"
              >
                <div className="font-bold text-slate-950">
                  Smlouva {warning.contractNumber || "—"}
                </div>
                <div className="text-slate-700">
                  {warning.client || "Klient nezjištěn"} · {warning.productLabels}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <LifeSplitProductsSection
        contracts={pairedLifeSplitContracts}
        matchesByContractNumber={matchesByContractNumber}
      />

      <OtherProductsSection
        title="Auta"
        description="Auto produkty se párují primárně podle čísla smlouvy. Produkt z výpisu je doplňující kontrola."
        contracts={autoProductContracts}
        matchesByContractNumber={matchesByContractNumber}
      />

      <OtherProductsSection
        contracts={remainingOtherProductContracts}
        matchesByContractNumber={matchesByContractNumber}
      />

      <ManagerCommissionsSection
        advisors={statement.managerCommissions}
        matchesByContractNumber={matchesByContractNumber}
      />

      <UnpairedContractsSection
        lifeContracts={unpairedLifeSplitContracts}
        otherContracts={unpairedOtherProductContracts}
        matchesByContractNumber={matchesByContractNumber}
      />

      {statement.unmatchedB36Payments.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <h3 className="text-base font-bold text-amber-950">
            B36 bez detailního řádku ve výpisu
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            Tyto položky se mají při ostrém importu dopárovat podle čísla smlouvy v našem systému.
          </p>
          <div className="mt-3 space-y-2">
            {statement.unmatchedB36Payments.map((payment, index) => {
              const match = contractMatchForNumber(matchesByContractNumber, payment.contractNumber);

              return (
                <div
                  key={`${payment.contractNumber}-${index}`}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                        <span>Smlouva {payment.contractNumber ?? "—"}</span>
                        <SystemMatchBadge match={match} />
                      </div>
                      <div className="text-slate-600">{payment.description}</div>
                    </div>
                    <div className="whitespace-nowrap font-bold text-slate-950">
                      {formatMoney(payment.amount)} Kč
                    </div>
                  </div>
                  <SystemMatchPanel match={match} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ContractStatusRulesPanel rules={statement.contractStatusRules} />
    </section>
  );
}

export default function CommissionStatementsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [statements, setStatements] = useState<ParsedStatement[]>([]);
  const [matchesByContractNumber, setMatchesByContractNumber] =
    useState<ContractMatchesByNumber>({});
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
  }, []);

  const statementContractMatchRequests = useMemo(
    () => collectStatementContractMatchRequests(statements),
    [statements]
  );

  useEffect(() => {
    let cancelled = false;

    setMatchingError(null);

    if (statements.length === 0 || statementContractMatchRequests.length === 0) {
      setMatchesByContractNumber({});
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setMatchesByContractNumber({});
      return () => {
        cancelled = true;
      };
    }

    setMatchesByContractNumber((previous) => {
      const next: ContractMatchesByNumber = {};
      for (const request of statementContractMatchRequests) {
        const key = contractMatchKey(request.scope, request.contractNumber);
        if (!key) continue;
        next[key] = previous[key]?.status === "matched" ? previous[key] : { status: "loading", contracts: [] };
      }
      return next;
    });

    void fetchSystemContractMatches(user, statementContractMatchRequests, (request, match) => {
      if (cancelled) return;
      const key = contractMatchKey(request.scope, request.contractNumber);
      if (!key) return;
      setMatchesByContractNumber((previous) => ({
        ...previous,
        [key]: match,
      }));
    }).catch((err) => {
      if (cancelled) return;
      setMatchingError(
        err instanceof Error
          ? err.message
          : "Nepodařilo se spustit párování smluv se systémem."
      );
    });

    return () => {
      cancelled = true;
    };
  }, [statementContractMatchRequests, statements.length, user]);

  const matchStats = useMemo<ContractMatchStats>(() => {
    let matched = 0;
    let loading = 0;
    let notFound = 0;
    let errors = 0;

    for (const request of statementContractMatchRequests) {
      const match = contractMatchForNumber(
        matchesByContractNumber,
        request.contractNumber,
        request.scope
      );
      if (match?.status === "matched") matched += 1;
      else if (match?.status === "loading") loading += 1;
      else if (match?.status === "not_found") notFound += 1;
      else if (match?.status === "error") errors += 1;
    }

    const total = statementContractMatchRequests.length;
    const completed = matched + notFound + errors;
    const pending = Math.max(0, total - completed - loading);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      matched,
      loading,
      notFound,
      errors,
      pending,
      completed,
      progress,
    };
  }, [matchesByContractNumber, statementContractMatchRequests]);

  const overviewTotals = useMemo(() => {
    const unpairedContractNumbers = new Set<string>();
    const issueContractNumbers = new Set<string>();

    for (const request of statementContractMatchRequests) {
      const key = contractMatchKey(request.scope, request.contractNumber);
      if (!key) continue;
      if (
        isUnpairedContractMatch(
          contractMatchForNumber(matchesByContractNumber, request.contractNumber, request.scope)
        )
      ) {
        unpairedContractNumbers.add(key);
      }
    }

    const markIssue = (
      contractNumber: string | null | undefined,
      hasIssue: boolean,
      scope: ContractMatchScope = "my"
    ) => {
      if (!hasIssue) return;
      const key = contractMatchKey(scope, contractNumber);
      if (!key || unpairedContractNumbers.has(key)) return;
      issueContractNumbers.add(key);
    };

    for (const statement of statements) {
      for (const contract of statement.lifeSplitContracts) {
        const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber);
        const systemContract =
          match?.status === "matched" && match.contracts.length === 1
            ? match.contracts[0]
            : null;
        const expectedProductKey = resolveStatementProduct(contract.productCode).productKey;
        const productMismatch =
          Boolean(expectedProductKey && systemContract?.productKey) &&
          expectedProductKey !== systemContract?.productKey;
        const amountIssue =
          systemContract != null &&
          buildLifeSplitAmountComparisons(contract, systemContract).some(
            (comparison) => comparison.status !== "ok"
          );
        const missingB36Issue = Boolean(
          missingAcceleratedB36Warning(contract.rows, contract.b36Payments)
        );

        markIssue(
          contract.contractNumber,
          productMismatch || amountIssue || missingB36Issue
        );
      }

      for (const contract of statement.otherProductContracts) {
        const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber);
        const systemContract =
          match?.status === "matched" && match.contracts.length === 1
            ? match.contracts[0]
            : null;
        const productMetas = uniqueProductMetasForRows(contract.rows);
        const expectedProductKey =
          productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;
        const productMismatch =
          Boolean(expectedProductKey && systemContract?.productKey) &&
          expectedProductKey !== systemContract?.productKey;
        const amountIssue =
          systemContract != null &&
          buildOtherProductAmountComparisons(contract, systemContract).some(
            (comparison) => comparison.status !== "ok"
          );
        const missingB36Issue = Boolean(
          missingAcceleratedB36Warning(contract.rows, contract.b36Payments)
        );

        markIssue(
          contract.contractNumber,
          productMismatch || amountIssue || missingB36Issue
        );
      }

      for (const advisor of statement.managerCommissions) {
        for (const row of advisor.rows) {
          const match = contractMatchForNumber(
            matchesByContractNumber,
            row.contractNumber,
            "team"
          );
          markIssue(row.contractNumber, match?.status === "matched" && match.contracts.length !== 1, "team");
        }
      }
    }

    return {
      contractCount: statementContractMatchRequests.length,
      issueContractCount: issueContractNumbers.size,
      unpairedContractCount: unpairedContractNumbers.size,
    };
  }, [matchesByContractNumber, statementContractMatchRequests, statements]);

  const parseFiles = async (files: FileList | File[]) => {
    const htmlFiles = Array.from(files).filter((file) =>
      /\.html?$/i.test(file.name)
    );
    if (htmlFiles.length === 0) {
      setError("Vyber HTML soubor provizního výpisu.");
      return;
    }

    setParsing(true);
    setError(null);
    setMatchingError(null);
    setMatchesByContractNumber({});

    try {
      const parsed = await Promise.all(htmlFiles.map(readStatementFile));
      setStatements(parsed);
    } catch (parseError) {
      console.error("Provizní výpisy: importní náhled selhal.", parseError);
      setError("Soubor se nepodařilo přečíst. Zkontroluj, že jde o uložený HTML výpis.");
    } finally {
      setParsing(false);
    }
  };

  return (
    <AppLayout active="statements">
      <div className="w-full max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Provizní výpisy
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Importní náhled výpisu
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                První verze pouze čte HTML výpis a ukazuje, co by šlo spárovat ke smlouvám.
                Do databáze se nic neukládá.
              </p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:min-w-[40rem]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Celkem smluv
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-950">
                  {overviewTotals.contractCount}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {statements.length > 0 ? `${statements.length} výpisů` : "Bez nahraného výpisu"}
                </div>
              </div>
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  overviewTotals.issueContractCount > 0
                    ? "border-rose-200 bg-rose-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                    overviewTotals.issueContractCount > 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  Něco nesedí
                </div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    overviewTotals.issueContractCount > 0 ? "text-rose-950" : "text-emerald-950"
                  }`}
                >
                  {overviewTotals.issueContractCount}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    overviewTotals.issueContractCount > 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  Rozdíly nebo varování
                </div>
              </div>
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  overviewTotals.unpairedContractCount > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    overviewTotals.unpairedContractCount > 0 ? "text-amber-700" : "text-slate-500"
                  }`}
                >
                  Nespárované
                </div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    overviewTotals.unpairedContractCount > 0 ? "text-amber-950" : "text-slate-950"
                  }`}
                >
                  {overviewTotals.unpairedContractCount}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    overviewTotals.unpairedContractCount > 0 ? "text-amber-700" : "text-slate-600"
                  }`}
                >
                  Nenalezeno / více shod / chyba
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void parseFiles(event.dataTransfer.files);
          }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                <UploadCloud className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Nahrát HTML výpis</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Podporuje uložené soubory z výpisu, například Leden2026.html nebo Duben2026.html.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,text/html"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    void parseFiles(event.target.files);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <FileUp className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                )}
                Vybrat soubor
              </button>
              {statements.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatements([]);
                    setError(null);
                    setMatchingError(null);
                    setMatchesByContractNumber({});
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Vymazat
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
              {error}
            </div>
          )}
          {matchingError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
              {matchingError}
            </div>
          )}
        </section>

        <MatchingProgressBar stats={matchStats} hasUser={Boolean(user)} />

        {statements.length === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600">
            Nahraj HTML výpis a zobrazí se náhled položek.
          </section>
        ) : (
          <div className="space-y-5">
            {statements.map((statement) => (
              <StatementPreview
                key={`${statement.fileName}-${statement.header.statementNumber ?? "bez-cisla"}`}
                statement={statement}
                matchesByContractNumber={matchesByContractNumber}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
