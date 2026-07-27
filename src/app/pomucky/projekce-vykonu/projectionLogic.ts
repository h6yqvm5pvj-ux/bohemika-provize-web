import { calculateNeon } from "@/app/lib/productFormulas";
import { type CommissionMode, type Position } from "@/app/types/domain";

export type ProjectionPayout = { date: Date; amount: number };

export function estimatePayoutDate(policyStart: Date, cutoffDay = 25): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth();
  const day = policyStart.getDate();
  const monthsToAdd = day > cutoffDay ? 2 : 1;
  return new Date(year, month + monthsToAdd, 1);
}

const isDeferredNeonItem = (title: string): boolean =>
  title.includes("po 3") ||
  title.includes("po 4") ||
  title.includes("2.–5") ||
  title.includes("5.–10") ||
  title.includes("celkem");

export function projectNeonPayouts(
  monthlyPremium: number,
  pos: Position,
  mode: CommissionMode,
  start: Date,
  storno: 0 | 3 | 5 | 10
): ProjectionPayout[] {
  const dto = calculateNeon(monthlyPremium, pos, 15, mode);
  const items = dto.items.map((it) => ({
    title: (it.title ?? "").toLowerCase(),
    amount: it.amount ?? 0,
  }));
  const res: ProjectionPayout[] = [];
  const po3 = items.find((i) => i.title.includes("po 3"));
  const po4 = items.find((i) => i.title.includes("po 4"));
  const nasl25 = items.find((i) => i.title.includes("2.–5"));
  const nasl510 = items.find((i) => i.title.includes("5.–10"));
  const immediateAmount = items
    .filter((item) => item.amount > 0 && !isDeferredNeonItem(item.title))
    .reduce((sum, item) => sum + item.amount, 0);

  const annPlusYears = (y: number) =>
    new Date(start.getFullYear() + y, start.getMonth(), start.getDate());

  const stornoFactor = (yearsFromStart: number) =>
    Math.pow(1 - storno / 100, Math.max(0, yearsFromStart));

  if (immediateAmount > 0) {
    res.push({
      date: estimatePayoutDate(start),
      amount: immediateAmount * stornoFactor(0),
    });
  }
  if (po3) {
    res.push({ date: annPlusYears(3), amount: po3.amount * stornoFactor(3) });
  }
  if (po4) {
    res.push({ date: annPlusYears(4), amount: po4.amount * stornoFactor(4) });
  }
  if (nasl25) {
    for (let y = 1; y <= 4; y++) {
      res.push({ date: annPlusYears(y), amount: nasl25.amount * stornoFactor(y) });
    }
  }
  if (nasl510) {
    for (let y = 4; y <= 9; y++) {
      res.push({ date: annPlusYears(y), amount: nasl510.amount * stornoFactor(y) });
    }
  }
  return res;
}
