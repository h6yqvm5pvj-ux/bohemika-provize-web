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

export function generateCashflow(
  entries: EntryDoc[],
  horizonYears = 10
): CashflowItem[] {
  const out: CashflowItem[] = [];

  for (const entry of entries) {
    const baseEntryId = entry.originalEntryId ?? entry.id;
    const ownerEmail = entry.userEmail ?? null;
    const normalizedOwnerEmail = ownerEmail
      ? ownerEmail.toLowerCase()
      : null;

    const start =
      toDate(entry.policyStartDate) ??
      toDate(entry.contractSignedDate) ??
      new Date();
    const agreement =
      toDate(entry.contractSignedDate) ??
      toDate(entry.policyStartDate) ??
      start;
    const product = entry.productKey;

    const horizonEnd = new Date(
      start.getFullYear() + horizonYears,
      start.getMonth() + 1,
      start.getDate()
    );

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
    const naslMaxdomov = items.find((item) =>
      item.title.includes("následná provize (z platby)")
    );

    const pushItem = (amount: number, date: Date, note?: string) => {
      if (!Number.isFinite(amount) || amount === 0) return;
      if (date > horizonEnd) return;

      out.push({
        id: `${entry.id}-${date.getTime()}-${note ?? ""}`,
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
      case "maximaMaxEfekt": {
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
          for (let year = 2; year <= 5 && year <= maxYears; year++) {
            pushItem(nasl25.amount, annPlusYears(year), "ročně");
          }
        }
        if (nasl510) {
          for (let year = 5; year <= 10 && year <= maxYears; year++) {
            pushItem(nasl510.amount, annPlusYears(year), "ročně");
          }
        }
        break;
      }

      case "flexi": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));

        if (naslOd6) {
          let year = 6;
          while (true) {
            const date = annPlusYears(year);
            if (date > horizonEnd) break;
            pushItem(naslOd6.amount, date, "ročně");
            year += 1;
          }
        }
        break;
      }

      case "domex":
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
        const subsequentStart = new Date(
          start.getFullYear() + 1,
          start.getMonth(),
          start.getDate()
        );

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
              `${notePrefix}${product === "domex" ? "DOMEX" : "ČPP PPR"}, ${
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

      case "allianzAuto":
      case "pillowAuto":
      case "uniqaAuto": {
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

        if (subsequentComfort) {
          let payout = first;
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
