import type { PdfAdvisorCard } from "./pdfAdvisorCard";

export const escapeReportHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export const renderReportHeader = (date: string, section: string) => `<header class="pdf-brand">
  <div class="pdf-brand-identity"><img src="/icons/bohemika_logo.png" alt="" /><div><strong>bohemika.</strong><span>FINANČNÍ PORADENSTVÍ</span></div></div>
  <div class="pdf-document"><strong>${escapeReportHtml(section)}</strong><small>${escapeReportHtml(date)}</small></div>
</header>`;

export function renderAdvisorCard({ fullName, title, phone, email, url, qr }: PdfAdvisorCard): string {
  const modules = qr.runs.map(({ x, y, width }) => `M${x} ${y}h${width}v1h-${width}z`).join("");
  const code = `<svg viewBox="0 0 ${qr.size} ${qr.size}" role="img" aria-label="QR kód vizitky" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${qr.size}" height="${qr.size}" fill="white"/><path d="${modules}" fill="#102d40"/></svg>`;
  return `<aside class="pdf-advisor-card" aria-label="Vizitka poradce">
    <div class="pdf-advisor-details"><div class="pdf-kicker">Váš poradce</div><h2>${escapeReportHtml(fullName)}</h2>
      ${title ? `<p>${escapeReportHtml(title)}</p>` : ""}
      ${[phone, email].filter(Boolean).map(contact => `<p>${escapeReportHtml(contact)}</p>`).join("")}
    </div>
    ${url
      ? `<a class="pdf-advisor-link" href="${escapeReportHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Otevřít online vizitku poradce">${code}<span>Online vizitka</span></a>`
      : `<div class="pdf-advisor-link">${code}<span>Uložit kontakt</span></div>`}
  </aside>`;
}
