import type { PaymentFrequency } from "../types/domain";
import { domexSubsequentPayoutYears } from "../lib/productFormulas/domex";
import { toDate } from "./helpers";
import type { CashflowItem, EntryDoc } from "./types";

type ImmediateCashflowPart = {
  title: string;
  amount: number;
  commissionCode: string;
  commissionCodeAliases: string[];
  commissionLabel: string;
};

type EntryCommissionPayout = NonNullable<EntryDoc["commissionPayouts"]>[number];

type IndexedCommissionPayout = {
  payout: EntryCommissionPayout;
  key: string;
  date: Date;
};

export function estimatePayoutDate(
  policyStart: Date,
  agreementDate?: Date | null,
  cutoffDay = 25,
  payoutDay = 25
): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth();
  // Cutoff řídíme primárně datem sjednání.
  // Pokud datum sjednání chybí, použijeme den počátku.
  const dayForCutoff = agreementDate
    ? agreementDate.getDate()
    : policyStart.getDate();

  if (dayForCutoff > cutoffDay) {
    return new Date(year, month + 2, payoutDay);
  }

  return new Date(year, month + 1, payoutDay);
}

function isSameCalendarMonth(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function estimateAutoFirstPayoutDate(
  policyStart: Date,
  agreementDate?: Date | null,
  payoutDay = 25
): Date {
  if (agreementDate && isSameCalendarMonth(policyStart, agreementDate)) {
    return new Date(policyStart.getFullYear(), policyStart.getMonth() + 1, payoutDay);
  }

  return estimatePayoutDate(policyStart, agreementDate, 25, payoutDay);
}

const AUTO_CASHFLOW_PRODUCTS = new Set<EntryDoc["productKey"]>([
  "allianzAuto",
  "cppAuto",
  "csobAuto",
  "kooperativaAuto",
  "pillowAuto",
  "slaviaauto",
  "uniqaAuto",
  "uniqaflotila",
]);

function isAutoCashflowProduct(product: EntryDoc["productKey"]): boolean {
  return AUTO_CASHFLOW_PRODUCTS.has(product);
}

export function monthsBetweenPayments(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semiannual":
      return 6;
    case "annual":
      return 12;
    default:
      return 12;
  }
}

function normalizeContractStatus(status: unknown): "active" | "storno" | "dozita" {
  if (typeof status !== "string") return "active";
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
  ) {
    return "storno";
  }
  if (
    normalized === "dozita" ||
    normalized === "dožitá" ||
    normalized === "dozito" ||
    normalized === "dožito"
  ) {
    return "dozita";
  }
  return "active";
}

function monthSerial(value: Date): number {
  return value.getFullYear() * 12 + value.getMonth();
}

function isFromStornoMonth(date: Date, stornoDate: Date): boolean {
  return monthSerial(date) >= monthSerial(stornoDate);
}

function earlierDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function dateToIsoDay(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSplitImmediateProduct(product: EntryDoc["productKey"]): boolean {
  return (
    product === "neon" ||
    product === "flexi" ||
    product === "maximaMaxEfekt" ||
    product === "pillowInjury"
  );
}

const normalizeCommissionCode = (code: string | null | undefined): string =>
  String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeEmail = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const firstYearInstallmentCommissionCode = (
  prefix: "A" | "B",
  installmentIndex: number
): string | null => {
  if (!Number.isInteger(installmentIndex) || installmentIndex < 1) {
    return null;
  }
  if (prefix === "A" && installmentIndex > 12) return null;
  return `${prefix}${String(100 + installmentIndex)}`;
};

const commissionCodeAliasesForCashflow = (code: string): string[] => {
  const installmentRangeMatch = code.match(/^([AB])(\d{3})-\1(\d{3})$/);
  if (installmentRangeMatch) {
    const prefix = installmentRangeMatch[1] ?? "";
    const start = Number(installmentRangeMatch[2]);
    const end = Number(installmentRangeMatch[3]);
    if (
      prefix &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start <= 24
    ) {
      return [
        code,
        ...Array.from({ length: end - start + 1 }, (_, index) =>
          `${prefix}${String(start + index).padStart(3, "0")}`
        ),
      ];
    }
  }
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRoleMatch) return [code, `A${closingRoleMatch[1]}`];
  if (/^A\d+$/.test(code)) return [code];
  if (code === "B301") return ["B0301", "B301"];
  if (code === "B101-B104") return ["B101-B104", "B101", "B102", "B103", "B104"];
  if (/^B1\d+$/.test(code)) return [code];
  if (code === "B201-B206") {
    return ["B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"];
  }
  if (/^B20[1-6]$/.test(code)) return [code, "B201-B206"];
  if (code === "B36_HALF" || code === "B036_HALF" || code === "B3601_HALF") {
    return ["B36_HALF", "B036_HALF", "B3601_HALF"];
  }
  if (code === "B36" || code === "B036" || code === "B3601") {
    return ["B36", "B036", "B3601"];
  }
  if (code === "B48" || code === "B048" || code === "B4801") {
    return ["B48", "B048", "B4801"];
  }
  return [code];
};

const SETTLED_COMMISSION_PAYOUT_STATUSES = new Set(["paid", "difference"]);

function uniqueCommissionCodes(codes: Array<string | null | undefined>): string[] {
  const result = new Set<string>();

  for (const code of codes) {
    const normalizedCode = normalizeCommissionCode(code);
    if (!normalizedCode || normalizedCode === "TOTAL") continue;
    for (const alias of commissionCodeAliasesForCashflow(normalizedCode)) {
      const normalizedAlias = normalizeCommissionCode(alias);
      if (normalizedAlias && normalizedAlias !== "TOTAL") {
        result.add(normalizedAlias);
      }
    }
  }

  return [...result];
}

function amountsMatchExpectedPayout(
  expectedAmount: number,
  candidateAmount: number | null | undefined
): boolean {
  const expected = Math.abs(Number(expectedAmount));
  const candidate = Math.abs(Number(candidateAmount));
  if (!Number.isFinite(expected) || !Number.isFinite(candidate)) return false;

  const tolerance = Math.max(10, expected * 0.03);
  return Math.abs(candidate - expected) <= tolerance;
}

function payoutMonthDateFromKey(value: string | null | undefined): Date | null {
  const match = String(value ?? "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 25);
}

function payoutSortValue(payout: IndexedCommissionPayout): number {
  const chronology = Number(payout.payout.statementChronologyMs);
  if (Number.isFinite(chronology)) return chronology;
  return payout.date.getTime();
}

function isSettledCommissionPayout(payout: EntryCommissionPayout): boolean {
  const status = String(payout.status ?? "").trim().toLowerCase();
  if (!SETTLED_COMMISSION_PAYOUT_STATUSES.has(status)) return false;
  const amount = Number(payout.amount);
  return Number.isFinite(amount) && amount > 0;
}

function indexSettledCommissionPayouts(
  payouts: EntryDoc["commissionPayouts"] | undefined | null
): IndexedCommissionPayout[] {
  return (payouts ?? [])
    .map((payout, index): IndexedCommissionPayout | null => {
      if (!isSettledCommissionPayout(payout)) return null;
      const date = payoutMonthDateFromKey(payout.payoutMonthKey);
      if (!date) return null;
      return {
        payout,
        key:
          payout.key ??
          [
            payout.code ?? "commission",
            payout.payoutMonthKey ?? "month",
            payout.amount ?? index,
            index,
          ].join(":"),
        date,
      };
    })
    .filter((payout): payout is IndexedCommissionPayout => Boolean(payout))
    .sort((a, b) => payoutSortValue(a) - payoutSortValue(b));
}

function cashflowCommissionPayoutsForViewer(
  entry: EntryDoc,
  viewerEmail?: string | null
): EntryDoc["commissionPayouts"] {
  const payouts = entry.commissionPayouts ?? [];
  const normalizedViewerEmail = normalizeEmail(viewerEmail);

  return payouts.filter((payout) => {
    const writtenBy = normalizeEmail(payout.writtenBy);
    if (writtenBy) return writtenBy === normalizedViewerEmail;

    return entry.source !== "manager";
  });
}

function findSettledCommissionPayout(
  payouts: IndexedCommissionPayout[],
  consumedPayoutKeys: Set<string>,
  amount: number,
  metadata: Partial<
    Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
  >,
  expectedDate: Date
): IndexedCommissionPayout | null {
  const itemCodes = uniqueCommissionCodes([
    metadata.commissionCode,
    ...(metadata.commissionCodeAliases ?? []),
  ]);
  if (itemCodes.length === 0) return null;

  const itemCodeSet = new Set(itemCodes);
  const matchingPayouts = payouts.filter((indexedPayout) => {
    if (consumedPayoutKeys.has(indexedPayout.key)) return false;

    const payoutCodes = uniqueCommissionCodes([indexedPayout.payout.code]);
    return payoutCodes.some((code) => itemCodeSet.has(code));
  });
  if (matchingPayouts.length === 0) return null;

  const expectedMonth = monthSerial(expectedDate);
  return matchingPayouts
    .sort((a, b) => {
      const aDistance = Math.abs(monthSerial(a.date) - expectedMonth);
      const bDistance = Math.abs(monthSerial(b.date) - expectedMonth);
      if (aDistance !== bDistance) return aDistance - bDistance;
      const aAmountMatches =
        amountsMatchExpectedPayout(amount, a.payout.expectedAmount) ||
        amountsMatchExpectedPayout(amount, a.payout.amount);
      const bAmountMatches =
        amountsMatchExpectedPayout(amount, b.payout.expectedAmount) ||
        amountsMatchExpectedPayout(amount, b.payout.amount);
      if (aAmountMatches !== bAmountMatches) return aAmountMatches ? -1 : 1;
      return payoutSortValue(a) - payoutSortValue(b);
    })[0] ?? null;
}

function commissionLabelFromCode(code: string | null | undefined): string | null {
  const normalizedCode = normalizeCommissionCode(code);
  if (!normalizedCode) return null;
  if (/^A\d+$/.test(normalizedCode)) return `Provize ${normalizedCode}`;
  if (normalizedCode === "B0301") return "Provize B0301";
  if (normalizedCode === "B101-B104" || /^B1\d+$/.test(normalizedCode)) {
    return "Následná provize";
  }
  if (normalizedCode === "B201-B206" || /^B20[1-6]$/.test(normalizedCode)) {
    return "Pečovatelská provize";
  }
  if (
    normalizedCode === "B36_HALF" ||
    normalizedCode === "B036_HALF" ||
    normalizedCode === "B3601_HALF"
  ) {
    return "Provize 50% z B3601";
  }
  if (
    normalizedCode === "B36" ||
    normalizedCode === "B036" ||
    normalizedCode === "B3601"
  ) return "Provize po 3 letech";
  if (
    normalizedCode === "B48" ||
    normalizedCode === "B048" ||
    normalizedCode === "B4801"
  ) return "Provize po 4 letech";
  return `Provize ${normalizedCode}`;
}

const commissionMetadataFromCode = (
  code: string | null | undefined,
  label: string
):
  | Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
  | Record<string, never> => {
  const normalizedCode = normalizeCommissionCode(code);
  if (!normalizedCode || normalizedCode === "TOTAL") return {};
  return {
    commissionCode: normalizedCode,
    commissionCodeAliases: commissionCodeAliasesForCashflow(normalizedCode),
    commissionLabel: label,
  };
};

function splitImmediatePartFromTitle(
  title: string,
  amount: number,
  product: EntryDoc["productKey"],
  code?: string | null
): ImmediateCashflowPart | null {
  if (!isSplitImmediateProduct(product)) return null;
  if (!Number.isFinite(amount) || amount === 0) return null;
  const normalizedCode = normalizeCommissionCode(code);

  if (normalizedCode === "A101" || title.includes("provize a101")) {
    return {
      title,
      amount,
      commissionCode: "A101",
      commissionCodeAliases: ["A101", "A102"],
      commissionLabel: "Provize A101",
    };
  }

  if (normalizedCode === "B0301" || title.includes("provize b0301")) {
    return {
      title,
      amount,
      commissionCode: "B0301",
      commissionCodeAliases: ["B0301"],
      commissionLabel: "Provize B0301",
    };
  }

  if (
    normalizedCode === "B3601_HALF" ||
    normalizedCode === "B036_HALF" ||
    normalizedCode === "B36_HALF" ||
    title.includes("50% z b3601") ||
    title.includes("50% z b036") ||
    title.includes("50% z b36")
  ) {
    const useB36Code = product === "flexi" || product === "pillowInjury";
    const label = useB36Code ? "Provize 50% z B36" : "Provize 50% z B3601";
    const halfCode = useB36Code ? "B36_HALF" : "B3601_HALF";
    return {
      title,
      amount,
      commissionCode: halfCode,
      commissionCodeAliases: ["B36_HALF", "B036_HALF", "B3601_HALF"],
      commissionLabel: label,
    };
  }

  return null;
}

export function generateCashflow(
  entries: EntryDoc[],
  horizonYears = 10,
  viewerEmail?: string | null
): CashflowItem[] {
  const out: CashflowItem[] = [];
  let globalItemSequence = 0;
  const now = new Date();
  const horizonEnd = new Date(
    now.getFullYear() + horizonYears,
    now.getMonth(),
    now.getDate()
  );

  for (const entry of entries) {
    const baseEntryId = entry.originalEntryId ?? entry.id;
    const ownerEmail = entry.userEmail ?? null;
    const normalizedOwnerEmail = ownerEmail
      ? ownerEmail.toLowerCase()
      : null;
    const status = normalizeContractStatus(entry.status);
    const isStorno = status === "storno";
    const parsedStornoDate = toDate(entry.stornoDate);
    const stornoCutoffDate = isStorno ? parsedStornoDate ?? now : null;
    const scopedPayouts = cashflowCommissionPayoutsForViewer(entry, viewerEmail);
    const settledPayouts = indexSettledCommissionPayouts(scopedPayouts);
    const consumedPayoutKeys = new Set<string>();

    const start =
      toDate(entry.policyStartDate) ??
      toDate(entry.contractSignedDate) ??
      toDate(entry.createdAt) ??
      new Date();
    const agreement =
      toDate(entry.contractSignedDate) ??
      toDate(entry.createdAt) ??
      toDate(entry.policyStartDate) ??
      start;
    const contractSignedDateIso = dateToIsoDay(toDate(entry.contractSignedDate));
    const policyEnd = toDate(entry.policyEndDate);
    const policyEndPayoutDate = policyEnd ? estimatePayoutDate(policyEnd) : null;
    const entryHorizonEnd = earlierDate(
      horizonEnd,
      policyEndPayoutDate ?? (status === "dozita" ? now : horizonEnd)
    );
    const product = entry.productKey;

    const items = (entry.items ?? []).map((it) => ({
      title: (it.title ?? "").toLowerCase(),
      amount: it.amount ?? 0,
      code: it.code ?? null,
    }));

    const immediateItems = items.filter(
      (item) =>
        item.title.includes("okamžitá provize") ||
        item.title.includes("provize a101") ||
        item.title.includes("provize b0301") ||
        item.title.includes("50% z b3601") ||
        item.title.includes("50% z b36")
    );
    const immediate =
      immediateItems.length > 0
        ? {
            title: "okamžitá provize",
            amount: immediateItems.reduce((sum, item) => sum + item.amount, 0),
          }
        : null;
    const immediateCodes = uniqueCommissionCodes(
      immediateItems.map((item) => item.code)
    );
    const immediateMetadata: Partial<
      Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
    > =
      immediateCodes.length > 0
        ? {
            commissionCode: immediateCodes[0],
            commissionCodeAliases: immediateCodes,
            commissionLabel: "Okamžitá provize",
          }
        : {
            commissionLabel: "Okamžitá provize",
          };
    const splitImmediateParts = items
      .map((item) => splitImmediatePartFromTitle(item.title, item.amount, product, item.code))
      .filter((item): item is ImmediateCashflowPart => Boolean(item));
    const po3 = items.find((item) => item.title.includes("po 3 letech"));
    const po4 = items.find((item) => item.title.includes("po 4 letech"));
    const nasl25 = items.find((item) =>
      item.title.includes("následná provize (2.–5. rok)")
    );
    const nasl510 = items.find((item) => item.title.includes("5.–10."));
    const naslOd6 = items.find((item) =>
      item.title.includes("následná provize (od 6. roku)")
    );
    const naslOd5 = items.find((item) =>
      item.title.includes("následná provize (od 5. roku)")
    );
    const naslMaxdomov = items.find((item) =>
      item.title.includes("následná provize (z platby)")
    );
    const naslGeneric = items.find(
      (item) =>
        item.title.includes("následná provize") &&
        !item.title.includes("(2.–5. rok)") &&
        !item.title.includes("(5.–10. rok)") &&
        !item.title.includes("(od 6. roku)") &&
        !item.title.includes("(od 5. roku)") &&
        !item.title.includes("(z platby)")
    );
    const nasl25Metadata = nasl25
      ? commissionMetadataFromCode(nasl25.code, "Následná provize")
      : {};
    const nasl510Metadata = nasl510
      ? commissionMetadataFromCode(nasl510.code, "Následná provize")
      : {};
    const naslOd5Metadata = naslOd5
      ? commissionMetadataFromCode(naslOd5.code, "Následná provize")
      : {};
    const naslOd6Metadata = naslOd6
      ? commissionMetadataFromCode(naslOd6.code, "Následná provize")
      : {};

    const pushItem = (
      amount: number,
      date: Date,
      note?: string,
      horizonLimit: Date = entryHorizonEnd,
      metadata: Partial<
        Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
      > = {}
    ) => {
      if (!Number.isFinite(amount) || amount === 0) return;
      if (date > horizonLimit) return;
      if (stornoCutoffDate && isFromStornoMonth(date, stornoCutoffDate)) return;

      const settledPayout = findSettledCommissionPayout(
        settledPayouts,
        consumedPayoutKeys,
        amount,
        metadata,
        date
      );
      if (settledPayout) {
        consumedPayoutKeys.add(settledPayout.key);
      }
      const outputDate = settledPayout?.date ?? date;
      const outputAmount =
        settledPayout && Number.isFinite(Number(settledPayout.payout.amount))
          ? Number(settledPayout.payout.amount)
          : amount;

      out.push({
        id: `${entry.id}-${outputDate.getTime()}-${metadata.commissionCode ?? ""}-${settledPayout?.key ?? note ?? ""}-${globalItemSequence++}`,
        date: outputDate,
        amount: outputAmount,
        productKey: product ?? "unknown",
        frequency: entry.frequencyRaw ?? null,
        note:
          entry.source === "manager"
            ? note
              ? `Manažerská · ${note}`
              : "Manažerská"
            : note
            ? `Vlastní · ${note}`
            : "Vlastní",
        source: entry.source,
        contractNumber: entry.contractNumber ?? null,
        clientName: entry.clientName ?? null,
        inputAmount: Number.isFinite(Number(entry.inputAmount)) ? Number(entry.inputAmount) : null,
        policyStartDate: start,
        contractStatus: status,
        stornoDate: stornoCutoffDate,
        ownerEmail: normalizedOwnerEmail,
        entryId: baseEntryId ?? null,
        isManagerOverride: entry.source === "manager",
        payoutStatus: settledPayout ? "paid" : undefined,
        predictedAmount: settledPayout ? amount : null,
        originalDate:
          settledPayout && monthSerial(outputDate) !== monthSerial(date)
            ? date
            : null,
        commissionPayoutKey: settledPayout?.key ?? null,
        commissionStatementNumber: settledPayout?.payout.statementNumber ?? null,
        commissionStatementPeriod: settledPayout?.payout.statementPeriod ?? null,
        ...metadata,
      });
    };

    const pushUnmatchedStatementPayouts = () => {
      for (const indexedPayout of settledPayouts) {
        if (consumedPayoutKeys.has(indexedPayout.key)) continue;
        if (indexedPayout.date > horizonEnd) continue;

        const amount = Number(indexedPayout.payout.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        consumedPayoutKeys.add(indexedPayout.key);
        const code = normalizeCommissionCode(indexedPayout.payout.code);
        const commissionLabel = commissionLabelFromCode(code);
        const aliases = uniqueCommissionCodes([code]);

        out.push({
          id: `${entry.id}-${indexedPayout.date.getTime()}-${code || "statement"}-${indexedPayout.key}-${globalItemSequence++}`,
          date: indexedPayout.date,
          amount,
          productKey: product ?? "unknown",
          frequency: entry.frequencyRaw ?? null,
          note:
            entry.source === "manager"
              ? "Manažerská · vyplaceno z výpisu"
              : "Vlastní · vyplaceno z výpisu",
          source: entry.source,
          contractNumber: entry.contractNumber ?? null,
          clientName: entry.clientName ?? null,
          inputAmount: Number.isFinite(Number(entry.inputAmount)) ? Number(entry.inputAmount) : null,
          policyStartDate: start,
          contractStatus: status,
          stornoDate: stornoCutoffDate,
          ownerEmail: normalizedOwnerEmail,
          entryId: baseEntryId ?? null,
          isManagerOverride: entry.source === "manager",
          commissionCode: code || null,
          commissionCodeAliases: aliases,
          commissionLabel,
          payoutStatus: "paid",
          predictedAmount: 0,
          isStatementOnly: true,
          originalDate: null,
          commissionPayoutKey: indexedPayout.key,
          commissionStatementNumber: indexedPayout.payout.statementNumber ?? null,
          commissionStatementPeriod: indexedPayout.payout.statementPeriod ?? null,
        });
      }
    };

    const pushImmediateCashflowItems = (
      horizonLimit: Date = entryHorizonEnd
    ) => {
      const payoutDate = estimatePayoutDate(start, agreement);
      if (splitImmediateParts.length > 0) {
        for (const part of splitImmediateParts) {
          pushItem(part.amount, payoutDate, part.commissionLabel, horizonLimit, {
            commissionCode: part.commissionCode,
            commissionCodeAliases: part.commissionCodeAliases,
            commissionLabel: part.commissionLabel,
          });
        }
        return;
      }

      if (immediate) {
        pushItem(immediate.amount, payoutDate, undefined, horizonLimit, immediateMetadata);
      }
    };

    const annPlusYears = (years: number) =>
      estimatePayoutDate(
        new Date(
          start.getFullYear() + years,
          start.getMonth(),
          start.getDate()
        )
      );

    switch (product) {
      case "neon":
      {
        pushImmediateCashflowItems();
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po3.code, "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po4.code, "Provize po 4 letech")
          );
        }

        const maxYears = Math.max(1, entry.durationYears ?? 10);
        if (nasl25) {
          // ČPP NEON: položka "2.–5. rok" se v praxi vyplácí už od 1. výročí.
          for (let year = 1; year <= 4 && year <= maxYears; year++) {
            pushItem(
              nasl25.amount,
              annPlusYears(year),
              "ročně",
              entryHorizonEnd,
              Object.keys(nasl25Metadata).length > 0
                ? nasl25Metadata
                : commissionMetadataFromCode("B101-B104", "Následná provize")
            );
          }
        }
        if (nasl510) {
          // Stejné posunutí o 1 rok i pro blok "5.–10. rok".
          for (let year = 4; year <= 9 && year <= maxYears; year++) {
            pushItem(
              nasl510.amount,
              annPlusYears(year),
              "ročně",
              entryHorizonEnd,
              Object.keys(nasl510Metadata).length > 0
                ? nasl510Metadata
                : commissionMetadataFromCode("B201-B206", "Pečovatelská provize")
            );
          }
        }
        break;
      }

      case "maximaMaxEfekt": {
        pushImmediateCashflowItems();
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po3.code ?? "B3601", "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po4.code ?? "B4801", "Provize po 4 letech")
          );
        }

        const maxYears = Math.max(1, entry.durationYears ?? 30);
        if (naslOd5) {
          for (let year = 5; year <= maxYears; year++) {
            const date = annPlusYears(year);
            if (date > entryHorizonEnd) break;
            const code = firstYearInstallmentCommissionCode("B", year - 4);
            pushItem(
              naslOd5.amount,
              date,
              "ročně",
              entryHorizonEnd,
              code
                ? commissionMetadataFromCode(code, "Následná provize")
                : Object.keys(naslOd5Metadata).length > 0
                  ? naslOd5Metadata
                  : commissionMetadataFromCode("B101-B104", "Následná provize")
            );
          }
        }
        break;
      }

      case "flexi": {
        const hasDuration =
          typeof entry.durationYears === "number" &&
          Number.isFinite(entry.durationYears);
        const maxYears = hasDuration
          ? Math.max(1, Math.floor(entry.durationYears as number))
          : null;
        const flexiContractEnd =
          maxYears != null ? annPlusYears(maxYears) : entryHorizonEnd;
        const flexiHorizonEnd = earlierDate(flexiContractEnd, entryHorizonEnd);

        pushImmediateCashflowItems(flexiHorizonEnd);
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            flexiHorizonEnd,
            commissionMetadataFromCode(po3.code, "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            flexiHorizonEnd,
            commissionMetadataFromCode(po4.code, "Provize po 4 letech")
          );
        }

        if (naslOd6) {
          let year = 6;
          while (true) {
            const date = annPlusYears(year);
            if (date > flexiHorizonEnd) break;
            const code = firstYearInstallmentCommissionCode("B", year - 5);
            pushItem(
              naslOd6.amount,
              date,
              "ročně",
              flexiHorizonEnd,
              code
                ? commissionMetadataFromCode(code, "Následná provize")
                : Object.keys(naslOd6Metadata).length > 0
                  ? naslOd6Metadata
                  : commissionMetadataFromCode("B201-B206", "Následná provize")
            );
            year += 1;
          }
        }
        break;
      }

      case "domex":
      case "cpphafan":
      case "koopmajetekobcan":
      case "koopfit":
      case "koopodzam":
      case "kooppmop":
      case "cppPPRbez":
      case "cppsimplex":
      case "cppPPRs":
      case "zamex": {
        const immediateDomexItem = items.find((item) =>
          item.title.includes("okamžitá") && item.title.includes("(z platby)")
        );
        const immediateDomexAmount = immediateDomexItem?.amount ?? immediate?.amount;
        const subsequentDomex = items.find((item) =>
          item.title.includes("následná provize (z platby)")
        );
        const immediateDomexMetadata =
          normalizeCommissionCode(immediateDomexItem?.code)
            ? commissionMetadataFromCode(immediateDomexItem?.code, "Okamžitá provize")
            : immediateMetadata;
        const subsequentDomexMetadata =
          normalizeCommissionCode(subsequentDomex?.code)
            ? commissionMetadataFromCode(subsequentDomex?.code, "Následná provize")
            : {};

        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const firstPayout = estimatePayoutDate(start, agreement);
        // Přechod na následnou provizi musí být navázaný na výplatní kalendář
        // (stejné cutoff pravidlo jako u první výplaty), ne na holé výročí.
        const subsequentStart = annPlusYears(1);
        const domexHistoricalSubsequentYears =
          product === "domex" ? domexSubsequentPayoutYears(contractSignedDateIso) : null;
        const subsequentEnd =
          domexHistoricalSubsequentYears != null
            ? annPlusYears(1 + domexHistoricalSubsequentYears)
            : null;

        let payout = firstPayout;
        let immediateDomexInstallmentIndex = 0;
        let subsequentDomexInstallmentIndex = 0;
        while (payout <= entryHorizonEnd) {
          const isImmediatePayout = payout < subsequentStart;
          const isWithinSubsequentWindow =
            subsequentEnd == null || payout < subsequentEnd;
          if (isImmediatePayout) {
            immediateDomexInstallmentIndex += 1;
          } else if (isWithinSubsequentWindow) {
            subsequentDomexInstallmentIndex += 1;
          }
          const amount =
            isImmediatePayout
              ? immediateDomexAmount
              : isWithinSubsequentWindow
              ? subsequentDomex?.amount ?? (product === "zamex" ? immediateDomexAmount : undefined)
              : undefined;
          if (amount && Number.isFinite(amount) && amount !== 0) {
            pushItem(
              amount,
              payout,
              `${
                product === "domex"
                  ? "DOMEX"
                  : product === "cpphafan"
                  ? "HAFAN"
                  : product === "koopmajetekobcan"
                  ? "Kooperativa majetek/odpovědnost"
                  : product === "koopfit"
                  ? "Kooperativa Sportovní výbava FIT"
                  : product === "koopodzam"
                  ? "Kooperativa odpovědnost zaměstnance"
                  : product === "kooppmop"
                  ? "Kooperativa PMOP"
                  : product === "zamex"
                  ? "ZAMEX"
                  : product === "cppsimplex"
                  ? "ČPP Simplex"
                  : product === "cppPPRs"
                  ? "ČPP PPR ÚPIS"
                  : product === "cppPPRbez"
                  ? "ČPP PPR bez ÚPIS"
                  : "ČPP PPR"
              }, ${
                stepMonths === 1 ? "měsíčně" : `každých ${stepMonths} měsíců`
              }`,
              entryHorizonEnd,
              isImmediatePayout
                ? firstYearInstallmentCommissionCode("A", immediateDomexInstallmentIndex)
                  ? commissionMetadataFromCode(
                      firstYearInstallmentCommissionCode(
                        "A",
                        immediateDomexInstallmentIndex
                      ),
                      `Provize ${firstYearInstallmentCommissionCode(
                        "A",
                        immediateDomexInstallmentIndex
                      )}`
                    )
                  : immediateDomexMetadata
                : firstYearInstallmentCommissionCode("B", subsequentDomexInstallmentIndex)
                  ? commissionMetadataFromCode(
                      firstYearInstallmentCommissionCode(
                        "B",
                        subsequentDomexInstallmentIndex
                      ),
                      "Následná provize"
                    )
                  : subsequentDomexMetadata
            );
          }
          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      case "pillowInjury": {
        pushImmediateCashflowItems();
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po3.code ?? "B36", "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po4.code ?? "B48", "Provize po 4 letech")
          );
        }
        break;
      }

      case "maxdomov": {
        if (!immediate) break;

        const perPaymentImmediate = immediate.amount;
        const perPaymentSub = naslMaxdomov?.amount;
        const subsequentMaxdomovMetadata = naslMaxdomov
          ? commissionMetadataFromCode(naslMaxdomov.code, "Následná provize")
          : {};
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const endFirstYear = annPlusYears(1);

        let payout = estimatePayoutDate(start, agreement);
        while (payout <= entryHorizonEnd) {
          if (payout < endFirstYear) {
            pushItem(
              perPaymentImmediate,
              payout,
              "získatelská z platby",
              entryHorizonEnd,
              immediateMetadata
            );
          } else if (perPaymentSub != null) {
            pushItem(
              perPaymentSub,
              payout,
              "následná z platby",
              entryHorizonEnd,
              subsequentMaxdomovMetadata
            );
          } else {
            pushItem(perPaymentImmediate, payout, undefined, entryHorizonEnd, immediateMetadata);
          }

          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      case "pillowmajetek":
      case "allianzmujdomov": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement),
            "roční provize",
            entryHorizonEnd,
            immediateMetadata
          );
        }

        if (naslGeneric) {
          let year = 1;
          while (true) {
            const date = annPlusYears(year);
            if (date > entryHorizonEnd) break;
            const code = firstYearInstallmentCommissionCode("B", year);
            pushItem(
              naslGeneric.amount,
              date,
              "roční následná provize",
              entryHorizonEnd,
              code
                ? commissionMetadataFromCode(code, "Následná provize")
                : commissionMetadataFromCode(naslGeneric.code, "Následná provize")
            );
            year += 1;
          }
        }
        break;
      }

      case "allianzAuto":
      case "pillowAuto":
      case "uniqaAuto":
      case "uniqaflotila": {
        if (!immediate) break;
        const anniversaryAmount = naslGeneric?.amount ?? immediate.amount;
        const anniversaryNote = naslGeneric
          ? "roční následná provize"
          : "ročně k výročí";
        const anniversaryMetadata = naslGeneric
          ? commissionMetadataFromCode(naslGeneric.code, "Následná provize")
          : {};

        const first = isAutoCashflowProduct(product)
          ? estimateAutoFirstPayoutDate(start, agreement)
          : estimatePayoutDate(start, agreement);
        if (first <= entryHorizonEnd) {
          pushItem(
            immediate.amount,
            first,
            "okamžitá provize",
            entryHorizonEnd,
            immediateMetadata
          );
        }

        let year = 1;
        while (true) {
          const date = annPlusYears(year);
          if (date > entryHorizonEnd) break;
          const subsequentCode = firstYearInstallmentCommissionCode("B", year);
          pushItem(
            anniversaryAmount,
            date,
            anniversaryNote,
            entryHorizonEnd,
            naslGeneric && subsequentCode
              ? commissionMetadataFromCode(subsequentCode, "Následná provize")
              : anniversaryMetadata
          );
          year += 1;
        }
        break;
      }

      case "cppAuto":
      case "slaviaauto":
      case "csobAuto":
      case "kooperativaAuto": {
        if (!immediate) break;

        const subsequentMetadata = naslGeneric
          ? commissionMetadataFromCode(naslGeneric.code, "Následná provize")
          : {};
        const firstAnniversary = new Date(
          start.getFullYear() + 1,
          start.getMonth(),
          start.getDate()
        );
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        let payout = isAutoCashflowProduct(product)
          ? estimateAutoFirstPayoutDate(start, agreement)
          : estimatePayoutDate(start, agreement);
        let firstYearInstallmentIndex = 0;
        let subsequentInstallmentIndex = 0;

        while (payout <= entryHorizonEnd) {
          const isSubsequent = monthSerial(payout) >= monthSerial(firstAnniversary);
          if (isSubsequent) {
            subsequentInstallmentIndex += 1;
          } else {
            firstYearInstallmentIndex += 1;
          }
          const amount = isSubsequent ? naslGeneric?.amount ?? immediate.amount : immediate.amount;
          const immediateInstallmentCode = isSubsequent
            ? null
            : firstYearInstallmentCommissionCode("A", firstYearInstallmentIndex);
          const subsequentInstallmentCode = isSubsequent
            ? firstYearInstallmentCommissionCode("B", subsequentInstallmentIndex)
            : null;
          pushItem(
            amount,
            payout,
            isSubsequent ? "následná provize" : "okamžitá provize",
            entryHorizonEnd,
            isSubsequent
              ? subsequentInstallmentCode
                ? commissionMetadataFromCode(
                    subsequentInstallmentCode,
                    `Provize ${subsequentInstallmentCode}`
                  )
                : subsequentMetadata
              : immediateInstallmentCode
                ? commissionMetadataFromCode(
                    immediateInstallmentCode,
                    `Provize ${immediateInstallmentCode}`
                  )
                : immediateMetadata
          );
          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      case "comfortcc": {
        const immediateComfort = items.find((item) =>
          item.title.includes("okamžitá provize")
        );
        const subsequentComfort = items.find((item) =>
          item.title.includes("následná provize")
        );

        const first = estimatePayoutDate(start, agreement);

        if (immediateComfort && first <= entryHorizonEnd) {
          pushItem(
            immediateComfort.amount,
            first,
            "Comfort Commodity – okamžitá provize"
          );
        }

        if (subsequentComfort && first <= entryHorizonEnd) {
          // 1. výplatní měsíc: následná jde zároveň s okamžitou
          pushItem(
            subsequentComfort.amount,
            first,
            "Comfort Commodity – následná (měsíčně)"
          );

          // další měsíce: už jen následná
          let payout = new Date(
            first.getFullYear(),
            first.getMonth() + 1,
            first.getDate()
          );
          while (payout <= entryHorizonEnd) {
            pushItem(
              subsequentComfort.amount,
              payout,
              "Comfort Commodity – následná (měsíčně)"
            );
            payout = new Date(
              payout.getFullYear(),
              payout.getMonth() + 1,
              payout.getDate()
            );
          }
        }
        break;
      }

      default: {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement),
            undefined,
            entryHorizonEnd,
            product === "maxcizinkomplex" && immediateCodes.length === 0
              ? commissionMetadataFromCode("A101", "Okamžitá provize")
              : immediateMetadata
          );
        }
        break;
      }
    }

    pushUnmatchedStatementPayouts();
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
