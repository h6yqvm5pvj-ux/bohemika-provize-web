/** Format decimal strings without rounding or converting large sums to Number. */
function groupedNumber(value: string): string | null {
  let number = value.replace(/\s/g, "");
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d*)?$/.test(number)) number = number.replace(/\./g, "");
  const match = number.match(/^([+-]?)(\d+)(?:[,.](\d*))?$/);
  if (!match) return null;
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${match[1]}${integer}${match[3] !== undefined ? `,${match[3]}` : ""}`;
}

export function moneyInputValue(value: string, unit = "Kč"): string {
  let numeric = value.trim();
  for (const suffix of [unit, "Kč"]) {
    if (numeric.toLocaleLowerCase("cs").endsWith(suffix.toLocaleLowerCase("cs"))) {
      numeric = numeric.slice(0, -suffix.length).trim();
      break;
    }
  }
  return groupedNumber(numeric) ?? value;
}

export function formatMoneyValue(value: string, unit = "Kč"): string {
  const number = groupedNumber(moneyInputValue(value, unit));
  return number === null ? value.trim() : `${number.replace(/,$/, "")} ${unit}`;
}

/** Premiums can also contain a payment frequency or a custom explanation. */
export function formatPremium(value: string): string {
  const match = value.trim().match(/^([+-]?[\d\s.,]+)(?:Kč(.*)|(\s*(?:\/|měsíčně|ročně|čtvrtletně|pololetně).*))?$/i);
  if (!match) return value;
  const amount = groupedNumber(match[1]);
  if (amount === null) return value;
  const suffix = (match[2] ?? match[3] ?? "").trim();
  return `${amount.replace(/,$/, "")} Kč${suffix ? ` ${suffix}` : ""}`;
}
