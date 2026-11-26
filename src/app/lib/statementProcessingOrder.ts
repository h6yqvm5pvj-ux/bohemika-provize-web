export type StatementPeriod = { period?: string | null; statementDate?: string | null };

export function readStatementDates(text: string, html: string) {
  return {
    period: text.match(/Obdob(?:í|&iacute;|&#0*237;|&#x0*ed;):\s*(\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? null,
    statementDate: html.match(/ze dne\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? null,
  };
}

export function statementOrderDate({ period, statementDate }: StatementPeriod): number | null {
  const parse = (text: string | undefined | null) => {
    const parts = text?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!parts) return null;
    const day = Number(parts[1]);
    const month = Number(parts[2]);
    const year = Number(parts[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? date.getTime() : null;
  };
  if (!period) return parse(statementDate);
  const range = period.split(/\s*-\s*/);
  if (range.length !== 2) return null;
  const start = parse(range[0]);
  const end = parse(range[1]);
  return start !== null && end !== null && start <= end ? end : null;
}

export function statementOrderProblem(day: number | null, latest: number | null): string | null {
  if (day === null) return "Pořadí výpisu nelze určit. Zkontroluj v souboru období a datum vystavení.";
  if (latest !== null && day < latest) {
    const label = new Intl.DateTimeFormat("cs-CZ", { timeZone: "UTC" }).format(latest);
    return `Tento výpis předchází již zpracovanému výpisu k ${label}. Výpisy lze zpracovat pouze od nejstaršího.`;
  }
  return null;
}

export function firstStatementRecommendation(monthStart: number): string {
  const first = new Date(monthStart);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const end = new Date(Date.UTC(year, month + 1, 0));
  const monthLabel = String(month + 1).padStart(2, "0");
  const payout = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "UTC", month: "long", year: "numeric",
  }).format(Date.UTC(year, month + 1, 1));
  return `Začni výpisem za období 01.${monthLabel}.${year} – ${end.getUTCDate()}.${monthLabel}.${year} (výplata ${payout}).`;
}

export type StatementOrderOverview = {
  latest: number | null;
  firstMonth: number | null;
  earliestUnfinished: number | null;
};

export function batchOrderProblem(days: (number | null)[], state?: StatementOrderOverview): string | null {
  for (const day of days) {
    const problem = statementOrderProblem(day, state?.latest ?? null);
    if (problem) return problem;
  }
  const pending = state?.earliestUnfinished;
  if (pending != null && days.length && days.every(day => day !== null && day > pending)) {
    return "Nejdřív dokonči zpracování předchozího výpisu.";
  }
  return null;
}
