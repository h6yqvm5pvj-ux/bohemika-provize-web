type Header = { statementDate?: string | null; period?: string | null; statementNumber?: string | null; advisorNumber?: string | null };

export function statementImportFixture(html: string, header: Header) {
  const date = header.statementDate ? `Výpis ze dne ${header.statementDate}` : "";
  const period = header.period ? `Období: ${header.period}` : "";
  return { html: `<p>${date}</p><p>${period}</p>${html}`, header };
}
