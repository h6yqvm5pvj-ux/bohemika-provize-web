import type { MonthGroup } from "./types";

export const CASHFLOW_PLOT_WIDTH = 1200;
export const CASHFLOW_PLOT_HEIGHT = 220;

export type CashflowPlotPoint = {
  monthIndex: number;
  x: number;
  y: number;
};

/** Keep calendar gaps and the existing cashflow scale intact when drawing a line. */
export function buildCashflowLineSegments(
  months: readonly (MonthGroup | null)[],
  position: (value: number) => number,
  zeroPosition: number,
): { points: CashflowPlotPoint[]; linePath: string; fillPath: string }[] {
  const zeroY = zeroPosition / 100 * CASHFLOW_PLOT_HEIGHT;
  if (!Number.isFinite(zeroY)) return [];

  const groups: CashflowPlotPoint[][] = [];
  let current: CashflowPlotPoint[] | null = null;

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = months[monthIndex];
    const y = month && Number.isFinite(month.total)
      ? position(month.total) / 100 * CASHFLOW_PLOT_HEIGHT
      : Number.NaN;

    if (!Number.isFinite(y)) {
      current = null;
      continue;
    }

    if (!current) {
      current = [];
      groups.push(current);
    }
    current.push({
      monthIndex,
      x: (monthIndex + 0.5) / 12 * CASHFLOW_PLOT_WIDTH,
      y,
    });
  }

  return groups.map((points) => {
    const first = points[0];
    const last = points[points.length - 1];
    const commands = [`M ${first.x} ${first.y}`];

    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1];
      const point = points[i];
      const handle = (point.x - previous.x) * 0.45;
      // Horizontal handles stay within both endpoint values: no invented peaks.
      commands.push(`C ${previous.x + handle} ${previous.y} ${point.x - handle} ${point.y} ${point.x} ${point.y}`);
    }

    const linePath = commands.join(" ");
    return {
      points,
      linePath,
      fillPath: `${linePath} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z`,
    };
  });
}
