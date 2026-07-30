// src/app/lib/cashflowGenerator.ts
import { type Product, type PaymentFrequency } from "../types/domain";
import { cppBytexSubsequentPayoutYears } from "./productFormulas/cppbytex";
import { domexSubsequentPayoutYears } from "./productFormulas/domex";

/**
 * Minimální verze CommissionEntry pro cashflow.
 * Klidně si to napoj na svůj existující typ (pokud už ho máš),
 * jen musí obsahovat tyhle fieldy.
 */
export interface CommissionEntryForCashflow {
  productKey: Product | string;
  createdAt: Date;                      // datum výpočtu (kalendář ho pro cutoff neřeší)
  contractSignedDate?: Date | string | null;
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

function parseCzDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateFromUnknown(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const parsedCz = parseCzDate(trimmed);
  if (parsedCz) return parsedCz;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!isoMatch) return null;

  const parsedIso = new Date(
    Number(isoMatch[1]),
    Number(isoMatch[2]) - 1,
    Number(isoMatch[3])
  );
  return Number.isNaN(parsedIso.getTime()) ? null : parsedIso;
}

function isoDayFromUnknown(value: unknown): string | null {
  const parsed = parseDateFromUnknown(value);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Pravidlo výplaty první (a obecně základní) provize.
 *
 * - vezme se den počátku a sjednání, použije se vyšší z nich,
 * - den ≤ 25 → výplata k 1. dni následujícího měsíce,
 * - den > 25 → výplata k 1. dni za 2 měsíce.
 */
export function estimatePayoutDate(
  policyStart: Date,
  agreementDate?: Date,
  cutoffDay = 25,
  payoutDay = 25
): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth(); // 0–11
  const day = policyStart.getDate();
  let dayForCutoff = day;

  // Výjimka: počátek je 1. den v pozdějším měsíci než sjednání
  if (agreementDate) {
    dayForCutoff = Math.max(dayForCutoff, agreementDate.getDate());
  }

  // Standard: 1–25 → +1 měsíc, >25 → +2 měsíce
  const monthsToAdd = dayForCutoff > cutoffDay ? 2 : 1;
  return new Date(year, month + monthsToAdd, payoutDay);
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
      const parsedStart = parseDateFromUnknown(entry.policyStartDate);
      const parsedSigned = parseDateFromUnknown(entry.contractSignedDate);
      const parsedCreated = parseDateFromUnknown(entry.createdAt);

      const start =
        parsedStart ??
        parsedSigned ??
        parsedCreated ??
        new Date();
      const agreement =
        parsedSigned ??
        parsedStart ??
        parsedCreated ??
        start;
      const contractSignedDateIso = isoDayFromUnknown(entry.contractSignedDate);
      const product = entry.productKey as Product | string;

      // Rozparsuj řádky výsledku
      const items = (entry.result?.items ?? []).map((i) => ({
        titleLower: i.title.toLowerCase(),
        amount: i.amount,
      }));

      const immediateItems = items.filter(
        (i) =>
          i.titleLower.includes("okamžitá") ||
          i.titleLower.includes("získatelská") ||
          i.titleLower.includes("provize a101") ||
          i.titleLower.includes("provize b0301") ||
          i.titleLower.includes("50% z b3601") ||
          i.titleLower.includes("50% z b36")
      );
      const immediate =
        immediateItems.length > 0
          ? {
              titleLower: "okamžitá provize",
              amount: immediateItems.reduce((sum, item) => sum + item.amount, 0),
            }
          : null;
      const po3 = items.find((i) => i.titleLower.includes("po 3 letech"));
      const po4 = items.find((i) => i.titleLower.includes("po 4 letech"));
      const nasl25 = items.find((i) =>
        i.titleLower.includes("následná provize (2.–5. rok)")
      );
      const nasl510 = items.find((i) => i.titleLower.includes("5.–10."));
      const naslOd6 = items.find((i) =>
        i.titleLower.includes("následná provize (od 6. roku)")
      ); // FLEXI
      const naslOd5 = items.find((i) =>
        i.titleLower.includes("následná provize (od 5. roku)")
      ); // MAXEFEKT
      const naslMaxdomov = items.find((i) =>
        i.titleLower.includes("následná provize (z platby)")
      ); // MAXDOMOV
      const naslGeneric = items.find(
        (i) =>
          i.titleLower.includes("následná provize") &&
          !i.titleLower.includes("(2.–5. rok)") &&
          !i.titleLower.includes("(5.–10. rok)") &&
          !i.titleLower.includes("(od 6. roku)") &&
          !i.titleLower.includes("(od 5. roku)") &&
          !i.titleLower.includes("(z platby)")
      );

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

          const maxYears = Math.max(
            1,
            entry.durationYears ?? (product === "maximaMaxEfekt" ? 30 : 10)
          );

          if (nasl25) {
            // ČPP NEON: položka "2.–5. rok" se v praxi vyplácí už od 1. výročí.
            for (let y = 1; y <= 4 && y <= maxYears; y++) {
              addItem(
                nasl25.amount,
                anniversaryPlusYears(y),
                "ročně"
              );
            }
          }
          if (nasl510) {
            // Stejné posunutí o 1 rok i pro blok "5.–10. rok".
            for (let y = 4; y <= 9 && y <= maxYears; y++) {
              addItem(
                nasl510.amount,
                anniversaryPlusYears(y),
                "ročně"
              );
            }
          }
          if (product === "maximaMaxEfekt" && naslOd5) {
            for (let y = 5; y <= maxYears; y++) {
              const date = anniversaryPlusYears(y);
              if (date > horizonEnd) break;
              addItem(naslOd5.amount, date, "ročně");
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

        // ============= Pillow Majetek / Allianz MůjDomov – roční okamžitá + roční následná (bez vlivu frekvence) =============
        case "pillowmajetek":
        case "allianzmujdomov": {
          if (immediate) {
            addItem(
              immediate.amount,
              estimatePayoutDate(start, agreement),
              "roční provize"
            );
          }

          if (naslGeneric) {
            let y = 1;
            while (true) {
              const payout = anniversaryPlusYears(y);
              if (payout > horizonEnd) break;
              addItem(naslGeneric.amount, payout, "roční následná provize");
              y += 1;
            }
          }
          break;
        }

        // ============= Allianz / Pillow / UNIQA Auto – okamžitá + ročně k výročí =============
        case "allianzAuto":
        case "pillowAuto":
        case "uniqaAuto":
        case "uniqaflotila": {
          if (!immediate) break;
          const anniversaryAmount = naslGeneric?.amount ?? immediate.amount;
          const anniversaryNote = naslGeneric
            ? "roční následná provize"
            : "ročně k výročí";

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
            addItem(anniversaryAmount, payout, anniversaryNote);
            y += 1;
          }
          break;
        }

        // ============= DOMEX / Kooperativa majetek občanů / ČPP PPR bez ÚPIS – dle frekvence, po 1. výročí následná =============
        case "domex":
        case "cppbytex":
        case "cpphafan":
        case "koopmajetekobcan":
        case "koopfit":
        case "koopodzam":
        case "kooppmop":
        case "cppPPRbez":
        case "cppsimplex":
        case "cppPPRs":
        case "zamex": {
          const immediateDomex =
            items.find((i) =>
              i.titleLower.includes("okamžitá") && i.titleLower.includes("(z platby)")
            ) ?? immediate;
          const subsequentDomex = items.find((i) =>
            i.titleLower.includes("následná provize (z platby)")
          );

          const monthsStep = monthsBetweenPayments(entry.frequencyRaw);
          const firstPayout = estimatePayoutDate(start, agreement);
          const subsequentStart = anniversaryPlusYears(1);
          const domexHistoricalSubsequentYears =
            product === "domex" ? domexSubsequentPayoutYears(contractSignedDateIso) : null;
          const cppBytexSubsequentYears =
            product === "cppbytex" ? cppBytexSubsequentPayoutYears() : null;
          const limitedSubsequentYears =
            domexHistoricalSubsequentYears ?? cppBytexSubsequentYears;
          const subsequentEnd =
            limitedSubsequentYears != null
              ? anniversaryPlusYears(1 + limitedSubsequentYears)
              : null;

          let payout = firstPayout;
          while (payout <= horizonEnd) {
            const isWithinSubsequentWindow =
              subsequentEnd == null || payout < subsequentEnd;
            const amount =
              payout < subsequentStart
                ? immediateDomex?.amount
                : isWithinSubsequentWindow
                ? subsequentDomex?.amount ?? immediateDomex?.amount
                : undefined;
            if (amount && Number.isFinite(amount) && amount !== 0) {
              addItem(amount, payout);
            }
            payout = addMonths(payout, monthsStep);
          }
          break;
        }

        // ============= OSTATNÍ AUTO – podle frekvence (ČPP, ČSOB, Kooperativa) =============
        case "cppAuto":
        case "slaviaauto":
        case "slaviaflotila":
        case "csobAuto":
        case "kooperativaAuto":
        case "koopflotila": {
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

          if (subsequentComfort && firstPayout <= horizonEnd) {
            // 1. výplatní měsíc: následná jde zároveň s okamžitou
            addItem(
              subsequentComfort.amount,
              firstPayout,
              "Comfort Commodity – následná provize (měsíčně)"
            );

            // další měsíce: už jen následná
            let payout = addMonths(firstPayout, 1);
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
