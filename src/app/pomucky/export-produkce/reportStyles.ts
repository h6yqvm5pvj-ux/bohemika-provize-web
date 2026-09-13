// Shared by the on-screen document preview and the PDF renderer.
export const PRODUCTION_REPORT_STYLES = `
  * { box-sizing: border-box; }
  :root { --ink: #243445; --muted: #74818e; --line: #dce5eb; --blue: #3398c1; --soft: #f4f8fa; }
  body { margin: 0; padding: 24px 0; background: #edf1f4; color: var(--ink); font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
  .page { width: 760px; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px #23374712; }
  .report-body { padding: 26px 32px 24px; }
  .report-hero { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 2px solid #54b5d8; break-inside: avoid; }
  .company-logo { display: block; width: 142px; height: 91px; object-fit: contain; flex-shrink: 0; }
  .document-title { min-width: 0; text-align: right; }
  .document-kicker { color: #6c899a; font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  h1 { margin: 6px 0; color: #243445; font-size: 29px; line-height: 1.15; letter-spacing: -.04em; font-weight: 700; }
  .document-period { margin: 0; color: #536b7c; font-size: 12px; }
  .info-card { margin-bottom: 18px; }
  .info-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 20px; }
  .info-item { min-width: 0; }
  .info-label { display: block; margin-bottom: 5px; color: var(--muted); font-size: 8px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; }
  .info-value { display: block; font-size: 11px; font-weight: 700; overflow-wrap: anywhere; }
  .info-secondary { display: block; margin-top: 3px; color: var(--muted); font-size: 9px; overflow-wrap: anywhere; }
  .report-totals { display: grid; grid-template-columns: .75fr 1.25fr 1.25fr; padding: 16px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); break-inside: avoid; }
  .report-total { padding: 0 18px; border-left: 1px solid var(--line); }
  .report-total:first-child { padding-left: 0; border-left: 0; }
  .report-total span { display: block; color: var(--muted); font-size: 9px; margin-bottom: 4px; }
  .report-total strong { display: block; color: #263e51; font-size: 23px; line-height: 1.2; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
  .report-total:last-child strong { color: #3284a5; }
  .divider { height: 0; margin: 22px 0 0; }
  .section-title { margin: 0 0 10px; color: #30495b; font-size: 13px; line-height: 1.4; font-weight: 700; break-after: avoid; page-break-after: avoid; }
  .summary-list { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); break-inside: avoid; }
  .category-line { display: grid; grid-template-columns: minmax(175px, .9fr) minmax(0, 1.6fr); align-items: center; gap: 14px; padding: 10px 8px; border-top: 1px solid #e8eef2; break-inside: avoid; }
  .category-line:first-child { border-top: 0; }
  .category-line-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; }
  .category-line-metrics { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; text-align: right; font-size: 11px; font-variant-numeric: tabular-nums; }
  .category-line-metrics span { white-space: nowrap; }
  .category-line-metrics span:last-child { color: var(--muted); min-width: 56px; }
  .theme-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; color: #5687a0; }
  .theme-icon svg { width: 15px; height: 15px; }
  .theme-gold .theme-icon { color: #a08345; }
  .card-empty { color: var(--muted); padding: 20px 12px; font-size: 11px; text-align: center; background: var(--soft); }
  .team-grid { display: flex; flex-direction: column; gap: 14px; }
  .card-user { padding: 13px 14px; border: 1px solid var(--line); border-radius: 5px; break-inside: avoid; }
  .card-user-header { display: flex; align-items: center; gap: 10px; padding-bottom: 9px; }
  .avatar { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; background: #ecf4f8; color: #457b95; font-size: 12px; font-weight: 700; }
  .card-user-name { font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
  .card-user-email { font-size: 9px; color: var(--muted); overflow-wrap: anywhere; }
  .card-user-position { margin-top: 2px; font-size: 9px; color: #587487; }
  .card-user-body { border-top: 1px solid #e8eef2; }
  .category-line--compact { padding: 7px 0; }
  .category-line--compact .category-line-title, .category-line--compact .category-line-metrics { font-size: 10px; }
  .product-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
  .product-table thead { display: table-header-group; background: #edf4f7; }
  .product-table th { padding: 9px 10px; border-top: 1px solid #cddfe8; border-bottom: 1px solid #cddfe8; color: #536e80; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; text-align: left; }
  .product-table th:first-child { width: 55%; }
  .product-table th:nth-child(2) { width: 15%; text-align: center; }
  .product-table th:last-child { width: 30%; text-align: right; }
  .product-table td { padding: 9px 10px; border-bottom: 1px solid #e3eaf0; vertical-align: middle; }
  .product-table tr { break-inside: avoid; }
  .product-table tbody tr:nth-child(even) { background: #f8fafb; }
  .product-table td.count { text-align: center; font-variant-numeric: tabular-nums; }
  .product-table td.amount { text-align: right; font-size: 12px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .product-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .product-logo { display: flex; align-items: center; justify-content: center; width: 27px; height: 27px; flex-shrink: 0; }
  .product-logo img { width: 100%; height: 100%; object-fit: contain; }
  .product-logo-fallback { color: #62889c; font-size: 12px; font-weight: 700; background: #edf4f7; border-radius: 4px; }
  .product-meta { min-width: 0; }
  .product-name { font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
  .product-provider { margin-top: 2px; font-size: 8px; color: var(--muted); }
  .monthly-chart { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 16px 12px 10px; border: 1px solid var(--line); border-radius: 5px; background: #fbfcfd; }
  .monthly-bar { display: flex; flex: 1 0 65px; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
  .monthly-bar .bar { width: 100%; max-width: 32px; border-radius: 3px 3px 0 0; background: #78b8d1; }
  .monthly-bar .value { font-size: 9px; color: #3c6175; font-weight: 700; white-space: nowrap; }
  .monthly-bar .label { font-size: 8px; color: var(--muted); text-align: center; }
  .footer-note { margin-top: 22px; padding-top: 10px; border-top: 1px solid var(--line); color: #81909b; font-size: 8px; line-height: 1.5; break-inside: avoid; }
  @page { size: A4; margin: 12mm; }
  @media print {
    body { background: #fff; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 100%; margin: 0; box-shadow: none; }
    .report-body { padding: 0; }
    .report-hero, .info-card, .report-totals, .summary-list, .card-user, .monthly-chart, .product-table tr { page-break-inside: avoid; }
  }
`;
