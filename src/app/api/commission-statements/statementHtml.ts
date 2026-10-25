export const MAX_STATEMENT_HTML_LENGTH = 850_000;
// Saved statement logos use inline image attributes longer than 4 KiB.
const MAX_TAG_LENGTH = 8_192;
const MAX_TABLE_ROWS = 5_000;
const MAX_ROW_CELLS = 64;
const MAX_PAID_KEY_COMBINATIONS = 20_000;

export class StatementHtmlError extends Error {
  constructor(message = "Výpis překračuje bezpečný limit zpracování. Rozděl jej na menší části.", public readonly status = 413) {
    super(message);
  }
}

type HtmlTag = { start: number; end: number; name: string; closing: boolean; attributes: string };

function statementHtmlTags(html: string): HtmlTag[] {
  if (html.length > MAX_STATEMENT_HTML_LENGTH) throw new StatementHtmlError();
  const tags: HtmlTag[] = [];
  const prefix = /<(\/?)([a-z][a-z0-9:-]*)\b/iy;
  let cursor = 0;
  let rows = 0;
  // Advance once through each tag, respecting quotes and raw-text elements.
  // Never restart an unterminated match at each later '<' in its suffix.
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) break;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) throw new StatementHtmlError("Výpis obsahuje neúplný HTML komentář.", 400);
      cursor = end + 3;
      continue;
    }
    prefix.lastIndex = start;
    const match = prefix.exec(html);
    if (!match) { cursor = start + 1; continue; }
    let quote = "";
    let end = prefix.lastIndex;
    for (; end < html.length; end++) {
      const character = html[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      } else if (character === "<") {
        throw new StatementHtmlError("Výpis obsahuje neplatnou HTML značku. Nahraj úplný soubor.", 400);
      }
    }
    if (end === html.length) throw new StatementHtmlError("Výpis obsahuje neúplnou HTML značku. Nahraj úplný soubor.", 400);
    if (end - start > MAX_TAG_LENGTH) throw new StatementHtmlError();
    const name = match[2].toLowerCase();
    const closing = Boolean(match[1]);
    tags.push({ start, end: end + 1, name, closing, attributes: html.slice(prefix.lastIndex, end) });
    if (!closing && name === "tr" && ++rows > MAX_TABLE_ROWS) throw new StatementHtmlError();
    cursor = end + 1;
    if (!closing && ["script", "style", "textarea", "title"].includes(name)) {
      const close = new RegExp(`</${name}\\s*>`, "gi");
      close.lastIndex = cursor;
      const rawEnd = close.exec(html);
      if (!rawEnd) throw new StatementHtmlError("Výpis obsahuje neúplný HTML prvek.", 400);
      tags.push({ start: rawEnd.index, end: close.lastIndex, name, closing: true, attributes: "" });
      cursor = close.lastIndex;
    }
  }
  return tags;
}

export function assertStatementHtml(html: string): void { statementHtmlTags(html); }

const attribute = (tag: HtmlTag, name: string): string | null => {
  const attributes = /([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attributes.exec(tag.attributes))) {
    if (match[1].toLowerCase() === name) return match[2] ?? match[3] ?? match[4] ?? "";
  }
  return null;
};

const isSectionToggle = (tag: HtmlTag): boolean => !tag.closing && tag.name === "div" &&
  (attribute(tag, "class") ?? "").toLowerCase().split(/\s+/).includes("vypis_sekce_toggle");

export function statementLinkHref(html: string): string | null {
  for (const tag of statementHtmlTags(html)) {
    if (tag.closing || tag.name !== "a") continue;
    const href = attribute(tag, "href");
    if (href != null) return href;
  }
  return null;
}

export function statementSectionHtml(html: string, id: string): string {
  const tags = statementHtmlTags(html);
  const startIndex = tags.findIndex(tag => !tag.closing && tag.name === "div" && attribute(tag, "id")?.toLowerCase() === id.toLowerCase());
  if (startIndex < 0) return "";
  const end = tags.slice(startIndex + 1).find(isSectionToggle)?.start ?? html.length;
  return html.slice(tags[startIndex].start, end);
}

export function statementSummaryHtml(html: string): string {
  const end = statementHtmlTags(html).find(tag => isSectionToggle(tag) ||
    (!tag.closing && attribute(tag, "id")?.toLowerCase() === "zadrzny_fond"))?.start;
  return end != null && end > 0 ? html.slice(0, end) : html;
}

export function readStatementHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  assertStatementHtml(value);
  return value.trim() || null;
}

function tableElements(html: string, cell: boolean, allowIncomplete = false): string[] {
  const elements = statementHtmlTags(html).filter(tag => cell ? ["td", "th"].includes(tag.name) : tag.name === "tr");
  if (elements.filter(tag => !tag.closing).length > (cell ? MAX_ROW_CELLS : MAX_TABLE_ROWS)) throw new StatementHtmlError();
  const result: string[] = [];
  let opening: HtmlTag | null = null;
  for (const tag of elements) {
    if (!tag.closing && !opening) opening = tag;
    if (tag.closing && opening) {
      result.push(html.slice(opening.start, tag.end));
      opening = null;
    }
  }
  if (opening && !allowIncomplete) throw new StatementHtmlError("Výpis obsahuje neúplnou tabulku. Nahraj úplný HTML soubor.", 400);
  return result;
}

export const statementTableRows = (html: string, allowIncomplete = false): string[] => tableElements(html, false, allowIncomplete);
export const statementTableCells = (html: string): string[] => tableElements(html, true);

export class StatementMatchingBudget {
  private remaining = MAX_PAID_KEY_COMBINATIONS;

  consume(combinations: number): void {
    if (!Number.isSafeInteger(combinations) || combinations < 0 || combinations > this.remaining) {
      throw new StatementHtmlError();
    }
    this.remaining -= combinations;
  }
}
