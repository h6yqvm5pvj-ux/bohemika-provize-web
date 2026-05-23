import type { PaymentFrequency } from "../types/domain";
import { toDate } from "./helpers";
import type { CashflowItem, EntryDoc } from "./types";

export function estimatePayoutDate(
  policyStart: Date,
  agreementDate?: Date | null,
  cutoffDay = 25
): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth();
  const day = policyStart.getDate();
  let dayForCutoff = day;

  if (agreementDate) {
    dayForCutoff = Math.max(dayForCutoff, agreementDate.getDate());
  }

  const monthsToAdd = dayForCutoff > cutoffDay ? 2 : 1;
  return new Date(year, month + monthsToAdd, 1);
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

function normalizeStornoStatus(status: unknown): "active" | "storno" {
  if (typeof status !== "string") return "active";
  const normalized = status.trim().toLowerCase();
  return normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
    ? "storno"
    : "active";
}

function monthSerial(value: Date): number {
  return value.getFullYear() * 12 + value.getMonth();
}

function isFromStornoMonth(date: Date, stornoDate: Date): boolean {
  return monthSerial(date) >= monthSerial(stornoDate);
}

export function generateCashflow(
  entries: EntryDoc[],
  horizonYears = 10
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
    const status = normalizeStornoStatus(entry.status);
    const isStorno = status === "storno";
    const parsedStornoDate = toDate(entry.stornoDate);
    const stornoCutoffDate = isStorno ? parsedStornoDate ?? now : null;

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
    const product = entry.productKey;

    const items = (entry.items ?? []).map((it) => ({
      title: (it.title ?? "").toLowerCase(),
      amount: it.amount ?? 0,
    }));

    const immediate = items.find((item) =>
      item.title.includes("okamžitá provize")
    );
    const po3 = items.find((item) => item.title.includes("po 3 letech"));
    const po4 = items.find((item) => item.title.includes("po 4 letech"));
    const nasl25 = items.find((item) =>
      item.title.includes("následná provize (2.–5. rok)")
    );
    const nasl510 = items.find((item) =>
      item.title.includes("následná provize (5.–10. rok)")
    );
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

    const pushItem = (
      amount: number,
      date: Date,
      note?: string,
      horizonLimit: Date = horizonEnd
    ) => {
      if (!Number.isFinite(amount) || amount === 0) return;
      if (date > horizonLimit) return;
      if (stornoCutoffDate && isFromStornoMonth(date, stornoCutoffDate)) return;

      out.push({
        id: `${entry.id}-${date.getTime()}-${note ?? ""}-${globalItemSequence++}`,
        date,
        amount,
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
        ownerEmail: normalizedOwnerEmail,
        entryId: baseEntryId ?? null,
        isManagerOverride: entry.source === "manager",
      });
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
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));

        const maxYears = Math.max(1, entry.durationYears ?? 10);
        if (nasl25) {
          // ČPP NEON: položka "2.–5. rok" se v praxi vyplácí už od 1. výročí.
          for (let year = 1; year <= 4 && year <= maxYears; year++) {
            pushItem(nasl25.amount, annPlusYears(year), "ročně");
          }
        }
        if (nasl510) {
          // Stejné posunutí o 1 rok i pro blok "5.–10. rok".
          for (let year = 4; year <= 9 && year <= maxYears; year++) {
            pushItem(nasl510.amount, annPlusYears(year), "ročně");
          }
        }
        break;
      }

      case "maximaMaxEfekt": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));

        const maxYears = Math.max(1, entry.durationYears ?? 15);
        if (naslOd5) {
          for (let year = 5; year <= maxYears; year++) {
            const date = annPlusYears(year);
            if (date > horizonEnd) break;
            pushItem(naslOd5.amount, date, "ročně");
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
          maxYears != null ? annPlusYears(maxYears) : horizonEnd;
        const flexiHorizonEnd =
          flexiContractEnd.getTime() < horizonEnd.getTime()
            ? flexiContractEnd
            : horizonEnd;

        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement),
            undefined,
            flexiHorizonEnd
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3), undefined, flexiHorizonEnd);
        if (po4) pushItem(po4.amount, annPlusYears(4), undefined, flexiHorizonEnd);

        if (naslOd6) {
          let year = 6;
          while (true) {
            if (maxYears != null && year > maxYears) break;
            const date = annPlusYears(year);
            if (date > flexiHorizonEnd) break;
            pushItem(naslOd6.amount, date, "ročně", flexiHorizonEnd);
            year += 1;
          }
        }
        break;
      }

      case "domex":
      case "cpphafan":
      case "koopmajetekobcan":
      case "cppPPRbez": {
        const immediateDomex =
          items.find((item) =>
            item.title.includes("okamžitá provize (z platby)")
          ) ?? immediate;
        const subsequentDomex = items.find((item) =>
          item.title.includes("následná provize (z platby)")
        );

        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const firstPayout = estimatePayoutDate(start, agreement);
        // Přechod na následnou provizi musí být navázaný na výplatní kalendář
        // (stejné cutoff pravidlo jako u první výplaty), ne na holé výročí.
        const subsequentStart = annPlusYears(1);

        let payout = firstPayout;
        while (payout <= horizonEnd) {
          const amount =
            payout < subsequentStart
              ? immediateDomex?.amount
              : subsequentDomex?.amount;
          const notePrefix =
            entry.source === "manager" ? "Manažerská · " : "Vlastní · ";
          if (amount && Number.isFinite(amount) && amount !== 0) {
            pushItem(
              amount,
              payout,
              `${notePrefix}${
                product === "domex"
                  ? "DOMEX"
                  : product === "cpphafan"
                  ? "HAFAN"
                  : product === "koopmajetekobcan"
                  ? "Kooperativa majetek/odpovědnost"
                  : "ČPP PPR"
              }, ${
                stepMonths === 1 ? "měsíčně" : `každých ${stepMonths} měsíců`
              }`
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
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));
        break;
      }

      case "maxdomov": {
        if (!immediate) break;

        const perPaymentImmediate = immediate.amount;
        const perPaymentSub = naslMaxdomov?.amount;
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const endFirstYear = annPlusYears(1);

        let payout = estimatePayoutDate(start, agreement);
        while (payout <= horizonEnd) {
          if (payout < endFirstYear) {
            pushItem(
              perPaymentImmediate,
              payout,
              "získatelská z platby"
            );
          } else if (perPaymentSub != null) {
            pushItem(perPaymentSub, payout, "následná z platby");
          } else {
            pushItem(perPaymentImmediate, payout);
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
            "roční provize"
          );
        }

        if (naslGeneric) {
          let year = 1;
          while (true) {
            const date = annPlusYears(year);
            if (date > horizonEnd) break;
            pushItem(naslGeneric.amount, date, "roční následná provize");
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

        const first = estimatePayoutDate(start, agreement);
        if (first <= horizonEnd) {
          pushItem(
            immediate.amount,
            first,
            "okamžitá provize"
          );
        }

        let year = 1;
        while (true) {
          const date = annPlusYears(year);
          if (date > horizonEnd) break;
          pushItem(immediate.amount, date, "ročně k výročí");
          year += 1;
        }
        break;
      }

      case "zamex": {
        if (!immediate) break;

        const amount = immediate.amount;
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);

        let payout = estimatePayoutDate(start, agreement);
        while (payout <= horizonEnd) {
          pushItem(amount, payout);
          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      case "cppAuto":
      case "slaviaauto":
      case "cppsimplex":
      case "cppPPRs":
      case "csobAuto":
      case "kooperativaAuto": {
        if (!immediate) break;

        const amount = immediate.amount;
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        let payout = estimatePayoutDate(start, agreement);

        while (payout <= horizonEnd) {
          pushItem(amount, payout);
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

        if (immediateComfort && first <= horizonEnd) {
          pushItem(
            immediateComfort.amount,
            first,
            "Comfort Commodity – okamžitá provize"
          );
        }

        if (subsequentComfort && first <= horizonEnd) {
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
          while (payout <= horizonEnd) {
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
            estimatePayoutDate(start, agreement)
          );
        }
        break;
      }
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
