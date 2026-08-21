export type CashflowLoadingProgress = {
  percent: number;
  label: string;
  detail: string | null;
};

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

export function ownContractsLoadingPercent({
  loaded,
  total,
  done,
}: {
  loaded: number;
  total: number | null;
  done: boolean;
}): number {
  if (done) return 76;

  const safeLoaded = Math.max(0, loaded);
  if (total != null && Number.isFinite(total) && total > 0) {
    const ratio = Math.min(0.99, safeLoaded / total);
    return clampPercent(8 + ratio * 68);
  }

  // Záložní průběh pro případ, že Firestore nedokáže vrátit celkový počet.
  // Roste s každou načtenou dávkou, ale před dokončením nepředstírá hotový stav.
  const loadedPages = safeLoaded / 100;
  return clampPercent(Math.min(70, 8 + Math.sqrt(loadedPages) * 12));
}

export const initialCashflowLoadingProgress = (): CashflowLoadingProgress => ({
  percent: 2,
  label: "Připravuji provizní kalendář",
  detail: null,
});
