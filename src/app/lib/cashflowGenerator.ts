// src/app/lib/cashflowGenerator.ts
import { type Product, type PaymentFrequency } from "../types/domain";

/**
 * Minimální verze CommissionEntry pro cashflow.
 * Klidně si to napoj na svůj existující typ (pokud už ho máš),
 * jen musí obsahovat tyhle fieldy.
 */
export interface CommissionEntryForCashflow {
  productKey: Product | string;
  createdAt: Date;                      // datum výpočtu / sjednání
  policyStartDate?: Date | null;        // počátek smlouvy (pokud není, bere se createdAt)
  durationYears?: number | null;        // pro životky
  frequencyRaw?: PaymentFrequency | null;
  result: {
    items: { title: string; amount: number }[];
  };
}

/** Jedna očekávaná výplata provize. */
export interface CashflowItem {
  id: string;
  date: Date;
  amount: number;
  sourceProduct: string;    // např. "neon", "flexi", "cppAuto"…
  note?: string | null;
}

/* ------------------------------------------------------- */
/* Pomocné funkce pro datum                               */
/* ------------------------------------------------------- */

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * Pravidlo výplaty první (a obecně základní) provize.
 *
 * - standardně:
 *   - den počátku 1–28 → výplata k 1. dni následujícího měsíce,
 *   - den počátku > 28 → výplata k 1. dni za 2 měsíce.
 *
 * - výjimka (stejná jako ve Swift verzi):
 *   Pokud:
 *   - máme agreementDate,
 *   - měsíc počátku je > měsíce sjednání (nebo pozdější rok),
 *   - den počátku je 1,
 *   → výplata jde do měsíce počátku (1. den).
 */
export function estimatePayoutDate(
  policyStart: Date,
  agreementDate?: Date,
  cutoffDay = 28
): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth(); // 0–11
  const day = policyStart.getDate();

  // Výjimka: počátek je 1. den v pozdějším měsíci než sjednání
  if (agreementDate) {
    const aYear = agreementDate.getFullYear();
    const aMonth = agreementDate.getMonth();

    const isLaterMonth =
      year > aYear || (year === aYear && month > aMonth);

    if (day === 1 && isLaterMonth) {
      // výplata v měsíci počátku (např. 1.11., 1.1. atd.)
      return new Date(year, month, 1);
    }
  }

  // Standard: 1–28 → +1 měsíc, >28 → +2 měsíce
  const monthsToAdd = day > cutoffDay ? 2 : 1;
  const firstOfMonth = new Date(year, month, 1);
  return addMonths(firstOfMonth, monthsToAdd);
}

/**
 * Krok pro produkty s opakovanými platbami (ZAMEX, MAXDOMOV, auta…)
 */
function monthsBetweenPayments(frequencyRaw?: PaymentFrequency | null): number {
  switch (frequencyRaw) {
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

/* ------------------------------------------------------- */
/* Cashflow generator                                      */
/* ------------------------------------------------------- */

export const CashflowGenerator = {
  generate(entries: CommissionEntryForCashflow[]): CashflowItem[] {
    const out: CashflowItem[] = [];
    const horizonEnd = addYears(new Date(), 12); // horizont 12 let dopředu

    const makeId = () => {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    for (const entry of entries) {
      const agreement = entry.createdAt;
      const start = entry.policyStartDate ?? agreement;
      const product = entry.productKey as Product | string;

      // Rozparsuj řádky výsledku
      const items = (entry.result?.items ?? []).map((i) => ({
        titleLower: i.title.toLowerCase(),
        amount: i.amount,
      }));

      const immediate = items.find(
        (i) =>
          i.titleLower.includes("okamžitá") ||
          i.titleLower.includes("získatelská")
      );
      const po3 = items.find((i) => i.titleLower.includes("po 3 letech"));
      const po4 = items.find((i) => i.titleLower.includes("po 4 letech"));
      const nasl25 = items.find((i) =>
        i.titleLower.includes("následná provize (2.–5. rok)")
      );
      const nasl510 = items.find((i) =>
        i.titleLower.includes("následná provize (5.–10. rok)")
      );
      const naslOd6 = items.find((i) =>
        i.titleLower.includes("následná provize (od 6. roku)")
      ); // FLEXI
      const naslMaxdomov = items.find((i) =>
        i.titleLower.includes("následná provize (z platby)")
      ); // MAXDOMOV

      const addItem = (amount: number, date: Date, note?: string) => {
        out.push({
          id: makeId(),
          date,
          amount,
          sourceProduct: String(entry.productKey),
          note,
        });
      };

      const anniversaryPlusYears = (years: number): Date => {
        const ann = addYears(start, years);
        // pro výročí nepoužíváme speciální exception – jen standardní pravidlo
        return estimatePayoutDate(ann);
      };

      switch (product) {
        // ============= ŽIVOTKA: NEON + MaxEfekt =============
        case "neon":
        case "maximaMaxEfekt": {
          if (immediate) {
            addItem(
              immediate.amount,
              estimatePayoutDate(start, agreement)
            );
          }
          if (po3) addItem(po3.amount, anniversaryPlusYears(3));
          if (po4) addItem(po4.amount, anniversaryPlusYears(4));

          const maxYears = Math.max(1, entry.durationYears ?? 10);

          if (nasl25) {
            for (let y = 2; y <= 5 && y <= maxYears; y++) {
              addItem(
                nasl25.amount,
                anniversaryPlusYears(y),
                "ročně"
              );
            }
          }
          if (nasl510) {
            for (let y = 5; y <= 10 && y <= maxYears; y++) {
              addItem(
                nasl510.amount,
                anniversaryPlusYears(y),
                "ročně"
              );
            }
          }
          break;
        }

        // ============= ŽIVOTKA: FLEXI =============
        case "flexi": {
          if (immediate) {
            addItem(
              immediate.amount,
              estimatePayoutDate(start, agreement)
            );
          }
          if (po3) addItem(po3.amount, anniversaryPlusYears(3));
          if (po4) addItem(po4.amount, anniversaryPlusYears(4));

          if (naslOd6) {
            let y = 6;
            // ročně od 6. výročí v rámci horizontu
            while (true) {
              const date = anniversaryPlusYears(y);
              if (date > horizonEnd) break;
              addItem(naslOd6.amount, date, "ročně");
              y += 1;
            }
          }
          break;
        }

        // ============= ŽIVOTKA: Pillow Úraz / Nemoc =============
        case "pillowInjury": {
          if (immediate) {
            addItem(
              immediate.amount,
              estimatePayoutDate(start, agreement)
            );
          }
          if (po3) addItem(po3.amount, anniversaryPlusYears(3));
          if (po4) addItem(po4.amount, anniversaryPlusYears(4));
          // bez následných
          break;
        }

        // ============= Maxima MAXDOMOV – z platby =============
        case "maxdomov": {
          if (!immediate) break;

          const perPaymentImmediate = immediate.amount;
          const perPaymentSubsequent = naslMaxdomov?.amount;

          const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
          const endOfFirstYear = anniversaryPlusYears(1);

          let payout = estimatePayoutDate(start, agreement);
          while (payout <= horizonEnd) {
            if (payout < endOfFirstYear) {
              // 1. rok – získatelská z každé platby
              addItem(
                perPaymentImmediate,
                payout,
                "získatelská z platby"
              );
            } else if (perPaymentSubsequent != null) {
              // od 2. roku – následná z každé platby
              addItem(
                perPaymentSubsequent,
                payout,
                "následná z platby"
              );
            } else {
              // fallback kdyby následná chyběla
              addItem(perPaymentImmediate, payout);
            }

            const next = addMonths(payout, stepMonths);
            payout = next;
          }
          break;
        }

        // ============= Allianz / Pillow / UNIQA Auto – okamžitá + ročně k výročí =============
        case "allianzAuto":
        case "pillowAuto":
        case "uniqaAuto": {
          if (!immediate) break;

          const firstPayout = estimatePayoutDate(start, agreement);
          if (firstPayout <= horizonEnd) {
            addItem(
              immediate.amount,
              firstPayout,
              "okamžitá provize"
            );
          }

          let y = 1;
          while (true) {
            const payout = anniversaryPlusYears(y);
            if (payout > horizonEnd) break;
            addItem(immediate.amount, payout, "ročně k výročí");
            y += 1;
          }
          break;
        }

        // ============= DOMEX / ČPP PPR bez ÚPIS – dle frekvence, po 1. výročí následná =============
        case "domex":
        case "cppPPRbez": {
          const immediateDomex =
            items.find((i) =>
              i.titleLower.includes("okamžitá provize (z platby)")
            ) ?? immediate;
          const subsequentDomex = items.find((i) =>
            i.titleLower.includes("následná provize (z platby)")
          );

          const monthsStep = monthsBetweenPayments(entry.frequencyRaw);
          const firstPayout = estimatePayoutDate(start, agreement);
          const subsequentStart = anniversaryPlusYears(1);

          let payout = firstPayout;
          while (payout <= horizonEnd) {
            const amount =
              payout < subsequentStart
                ? immediateDomex?.amount
                : subsequentDomex?.amount ?? immediateDomex?.amount;
            if (amount && Number.isFinite(amount) && amount !== 0) {
              addItem(amount, payout);
            }
            payout = addMonths(payout, monthsStep);
          }
          break;
        }

        // ============= ZAMEX – opakovaně dle frekvence =============
        case "zamex": {
          if (!immediate) break;
          const amount = immediate.amount;
          const monthsStep = monthsBetweenPayments(entry.frequencyRaw);

          let payout = estimatePayoutDate(start, agreement);
          while (payout <= horizonEnd) {
            addItem(amount, payout);
            payout = addMonths(payout, monthsStep);
          }
          break;
        }

        // ============= OSTATNÍ AUTO – podle frekvence (ČPP, ČSOB, Kooperativa) =============
        case "cppAuto":
        case "cppPPRs":
        case "csobAuto":
        case "kooperativaAuto": {
          if (!immediate) break;
          const amount = immediate.amount;
          const stepMonths = monthsBetweenPayments(entry.frequencyRaw);

          let payout = estimatePayoutDate(start, agreement);
          while (payout <= horizonEnd) {
            addItem(amount, payout);
            payout = addMonths(payout, stepMonths);
          }
          break;
        }

        // ============= Comfort Commodity – okamžitá + měsíční následná =============
        case "comfortcc": {
          const immediateComfort = items.find((i) =>
            i.titleLower.includes("okamžitá provize")
          );
          const subsequentComfort = items.find((i) =>
            i.titleLower.includes("následná provize")
          );

          const firstPayout = estimatePayoutDate(start, agreement);

          if (immediateComfort && firstPayout <= horizonEnd) {
            addItem(
              immediateComfort.amount,
              firstPayout,
              "Comfort Commodity – okamžitá provize"
            );
          }

          if (subsequentComfort) {
            let payout = firstPayout;
            while (payout <= horizonEnd) {
              addItem(
                subsequentComfort.amount,
                payout,
                "Comfort Commodity – následná provize (měsíčně)"
              );
              payout = addMonths(payout, 1);
            }
          }
          break;
        }

        // ============= OSTATNÍ – pouze „okamžitá“ =============
        default: {
          if (immediate) {
            addItem(
              immediate.amount,
              estimatePayoutDate(start, agreement)
            );
          }
        }
      }
    }

    // seřadit podle data
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  },
};
