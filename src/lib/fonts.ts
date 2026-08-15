/**
 * Build-safe font tokens. These deliberately use platform fonts so a deployment
 * never depends on Google Fonts being reachable while Next.js is compiling.
 */
export const systemSansFont = {
  className: "font-sans",
  style: { fontFamily: "var(--font-inter), Inter, Arial, Helvetica, sans-serif" },
} as const;

export const systemSerifFont = {
  className: "font-serif",
  style: { fontFamily: "Georgia, 'Times New Roman', serif" },
} as const;

export const systemCondensedFont = {
  className: "font-sans",
  style: { fontFamily: "'Arial Narrow', Arial, Helvetica, sans-serif" },
} as const;
