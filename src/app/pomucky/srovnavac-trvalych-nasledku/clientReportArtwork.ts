type ComparisonRow = {
  insurerName: string;
  productName: string;
  payouts: number[];
};

const escapeSvgText = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const money = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const comparisonColors = ["#6438e6", "#007f98"] as const;

/** A shared local scale compares the two actual payouts within one scenario. */
export function renderScenarioComparison(rows: ComparisonRow[], scenarioIndex: number): string {
  if (!Array.isArray(rows) || rows.length !== 2 || !Number.isInteger(scenarioIndex) || scenarioIndex < 0) return "";
  if (![rows[0], rows[1]].every(row => row && typeof row.insurerName === "string" &&
    typeof row.productName === "string" && Array.isArray(row.payouts) &&
    Number.isFinite(row.payouts[scenarioIndex]) && row.payouts[scenarioIndex] >= 0)) return "";

  const maximum = Math.max(rows[0].payouts[scenarioIndex], rows[1].payouts[scenarioIndex]);
  const descriptions = rows.map(row => `${row.insurerName} · ${row.productName}: ${money(row.payouts[scenarioIndex])}`);
  const title = `Porovnání pojistného plnění ve scénáři ${scenarioIndex + 1}`;
  const description = `${descriptions.join(". ")}. Délky pruhů používají společné měřítko pro tento scénář.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 88" role="img" aria-label="${escapeSvgText(`${title}. ${description}`)}" font-family="Arial, Helvetica, sans-serif">
  <title>${escapeSvgText(title)}</title>
  <desc>${escapeSvgText(description)}</desc>
  ${rows.map((row, index) => {
    const payout = row.payouts[scenarioIndex];
    const width = maximum > 0 ? payout / maximum * 300 : 0;
    const y = index === 0 ? 26 : 64;
    return `<text x="0" y="${y}" fill="${comparisonColors[index]}" font-size="9">${escapeSvgText(`${String(index + 1).padStart(2, "0")} / ${row.insurerName}`)}</text>
  <text x="300" y="${y}" text-anchor="end" fill="${comparisonColors[index]}" font-size="13" font-weight="700">${escapeSvgText(money(payout))}</text>
  <rect x="0" y="${y + 12}" width="${width.toFixed(2)}" height="6" fill="${comparisonColors[index]}"/>`;
  }).join("\n  ")}
</svg>`;
}
