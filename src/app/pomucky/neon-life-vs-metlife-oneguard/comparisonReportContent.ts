import { Children, isValidElement, type ReactNode } from "react";

export type ReportBlock = { text: string; kind: "body" | "heading" | "quote"; href?: string; cells?: string[] };
export type ReportSummary = { status: string; title: string; tone: string };
export type ComparisonReportRow = {
  id: string;
  title: string;
  topic: ReportBlock[];
  neon: { summary: ReportSummary; blocks: ReportBlock[] };
  metlife: { summary: ReportSummary; blocks: ReportBlock[] };
  appendix: ReportBlock[];
};

const BLOCK_TAGS = new Set(["div", "section", "article", "p", "blockquote", "h2", "h3", "h4", "ul", "ol", "li"]);
const clean = (value: string) => value.replace(/\s+/g, " ").trim();

// Extract on the server, before React nodes cross the client boundary. Preserve
// nested paragraphs, quotes, numbered steps and each row of the comparison grids.
export function reportBlocks(node: ReactNode): ReportBlock[] {
  if (typeof node === "string" || typeof node === "number") {
    return clean(String(node)) ? [{ text: clean(String(node)), kind: "body" }] : [];
  }
  if (Array.isArray(node)) return node.flatMap(reportBlocks);
  if (!isValidElement<{ children?: ReactNode; className?: string; href?: string; "aria-hidden"?: boolean | "true"; "data-report-text"?: string }>(node)) return [];
  if (node.props["data-report-text"]) return [{ text: node.props["data-report-text"], kind: "body" }];
  if (node.props["aria-hidden"] || typeof node.type !== "string" || ["button", "svg"].includes(node.type)) return [];
  const children = Children.toArray(node.props.children);
  const hasBlocks = children.some(child => isValidElement(child) && typeof child.type === "string" && BLOCK_TAGS.has(child.type));
  if (hasBlocks) return children.flatMap(reportBlocks);
  const parts = children.flatMap(reportBlocks);
  // Separate adjacent source links so each retains its own destination in PDF.
  if (parts.filter(part => part.href).length > 1) return parts;
  const text = clean(parts.map(part => part.text).join(" "));
  if (!text) return [];
  const href = node.type === "a" ? node.props.href : parts.find(part => part.href)?.href;
  const className = node.props.className ?? "";
  const cells = /(?:\bgrid\b|justify-between)/.test(className) && parts.length > 1 ? parts.map(part => part.text) : undefined;
  const isHeading = /^h[2-4]$/.test(node.type) || (node.type === "div" && /font-(bold|semibold)/.test(className) && text.length < 90 && !cells);
  return [{ text, kind: isHeading ? "heading" : node.type === "blockquote" ? "quote" : "body", ...(href ? { href } : {}), ...(cells ? { cells } : {}) }];
}

export function reportDetailBlocks(node: ReactNode): ReportBlock[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) return reportBlocks(node);
  // Category/status and the title already have dedicated places in the report.
  return Children.toArray(node.props.children).flatMap((child, index) =>
    isValidElement(child) && ((index === 0 && child.type === "span") || child.type === "h2" || child.type === "h3")
      ? [] : reportBlocks(child));
}

export type ReportAdvisor = {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  ico: string;
  cardUrl: string;
};

export function reportAdvisorFromProfile(profile: Record<string, unknown>, email: string, origin: string): ReportAdvisor {
  const text = (value: unknown) => typeof value === "string" ? clean(value) : "";
  const card = profile.onlineCard && typeof profile.onlineCard === "object" && !Array.isArray(profile.onlineCard)
    ? profile.onlineCard as Record<string, unknown> : {};
  return {
    fullName: text(card.fullName) || text(profile.fullName) || text(profile.name),
    title: text(card.title) || "Finanční poradce",
    email: text(card.email) || text(profile.email) || email,
    phone: text(card.phone) || text(profile.phoneNumber) || text(profile.phone),
    ico: text(card.ico) || text(profile.ico) || text(profile.companyId),
    cardUrl: card.enabled === true && text(card.slug) ? `${origin}/vizitka/${encodeURIComponent(text(card.slug))}` : "",
  };
}
