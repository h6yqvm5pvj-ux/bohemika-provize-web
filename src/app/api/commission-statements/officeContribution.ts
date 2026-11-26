import { statementHtmlText, statementSectionHtml, statementTableCells, statementTableRows } from "./statementHtml";

/** Only the office allowance; contract supplements and unrelated bonuses stay separate. */
export function officeContributionFromStatementHtml(html: string | null): number {
  if (!html) return 0;
  let total = 0;
  for (const row of statementTableRows(statementSectionHtml(html, "ostatni_platby"))) {
    const cells = statementTableCells(row).map(statementHtmlText);
    const description = (cells[0] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/storno|smlouv/.test(description) || !(
      /mimoradna\s+provize\s+za\s+produkci\s+200\s+bodu/.test(description) ||
      /prispevek\s+(?:na\s+)?(?:(?:provoz|najem)\s+)?kancelar/.test(description)
    )) continue;
    let money = (cells[1] ?? "").replace(/\s|Kč/gi, "");
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(money)) money = money.replace(/\./g, "");
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(money)) continue;
    const amount = Number(money.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) continue;
    total += Math.round(amount * 100);
  }
  return total / 100;
}
